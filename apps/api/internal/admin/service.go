package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

// Audit actions. Stable strings: the portal labels them and filters by them.
const (
	ActionSuspend       = "user.suspend"
	ActionUnsuspend     = "user.unsuspend"
	ActionRevokeAll     = "user.sessions.revoke_all"
	ActionRevokeSession = "user.session.revoke"
	ActionRoleSet       = "admin.role.set"
	ActionRoleRemove    = "admin.role.remove"
)

const (
	UserPageSize  = 50
	AuditPageSize = 50
)

type Service struct {
	pool   *pgxpool.Pool
	q      *db.Queries
	owners []string
}

// NewService: ownerEmails is ADMIN_EMAILS, comma-separated.
func NewService(pool *pgxpool.Pool, ownerEmails string) *Service {
	owners := []string{}
	for _, e := range strings.Split(ownerEmails, ",") {
		if e = apitypes.NormalizeEmail(e); e != "" {
			owners = append(owners, e)
		}
	}
	return &Service{pool: pool, q: db.New(pool), owners: owners}
}

func (s *Service) isOwner(p db.Profile) bool {
	if !p.Email.Valid {
		return false
	}
	email := apitypes.NormalizeEmail(p.Email.String)
	for _, o := range s.owners {
		if o == email {
			return true
		}
	}
	return false
}

// roleOf is a profile's effective admin role, "" for none.
func (s *Service) roleOf(ctx context.Context, q *db.Queries, p db.Profile) (db.AdminRole, bool, error) {
	if s.isOwner(p) {
		return db.AdminRoleSUPERADMIN, true, nil
	}
	row, err := q.GetSiteAdmin(ctx, p.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return row.Role, false, nil
}

func (s *Service) adminFor(ctx context.Context, p db.Profile) (Admin, error) {
	role, owner, err := s.roleOf(ctx, s.q, p)
	if err != nil {
		return Admin{}, err
	}
	if role == "" {
		return Admin{}, httpx.Forbidden("NOT_ADMIN", "This account isn't an ABRO admin.")
	}
	return Admin{Profile: p, Role: role, Owner: owner}, nil
}

// inTx runs fn in one transaction: an action and its audit row commit
// together or not at all.
func (s *Service) inTx(ctx context.Context, fn func(q *db.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after Commit
	if err := fn(s.q.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func audit(ctx context.Context, q *db.Queries, actor Admin, action string, target pgtype.UUID, details map[string]any, ip string) error {
	return auditOn(ctx, q, actor, action, "user", target, details, ip)
}

// auditOn logs an action on something other than a person (targetType
// "setting" for app switches, with no target id).
func auditOn(ctx context.Context, q *db.Queries, actor Admin, action, targetType string, target pgtype.UUID, details map[string]any, ip string) error {
	if details == nil {
		details = map[string]any{}
	}
	body, err := json.Marshal(details)
	if err != nil {
		return err
	}
	return q.InsertAdminAudit(ctx, db.InsertAdminAuditParams{
		ActorID:    actor.Profile.ID,
		Action:     action,
		TargetType: targetType,
		TargetID:   target,
		Details:    body,
		IpAddress:  pgtype.Text{String: ip, Valid: ip != ""},
	})
}

// target loads the person an action is aimed at and checks the actor may
// act on them: never on yourself, never on an owner, and only on people
// of a lower rank -- an admin can't suspend another admin, a super admin
// can.
func (s *Service) target(ctx context.Context, q *db.Queries, actor Admin, id pgtype.UUID) (db.Profile, db.AdminRole, error) {
	p, err := q.GetProfileByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Profile{}, "", httpx.NotFound("USER_NOT_FOUND", "No such user.")
	}
	if err != nil {
		return db.Profile{}, "", err
	}
	if p.ID == actor.Profile.ID {
		return db.Profile{}, "", httpx.Forbidden("SELF_ACTION", "You can't do that to your own account.")
	}
	role, owner, err := s.roleOf(ctx, q, p)
	if err != nil {
		return db.Profile{}, "", err
	}
	if owner {
		return db.Profile{}, "", httpx.Forbidden("OWNER_PROTECTED", "This admin is set in the server settings and can't be changed here.")
	}
	if rank(role) >= actor.level() {
		return db.Profile{}, "", httpx.Forbidden("TARGET_OUTRANKS", "You can only do that to someone with a lower admin role than yours.")
	}
	return p, role, nil
}

// --- reading -----------------------------------------------------------

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// ListUsers: status is "", "active", "suspended" or "admins"; page from 1.
func (s *Service) ListUsers(ctx context.Context, search, status string, page int) (apitypes.AdminUserPage, error) {
	switch status {
	case "", "active", "suspended", "admins":
	default:
		return apitypes.AdminUserPage{}, httpx.BadRequest("INVALID_STATUS", "status must be active, suspended or admins.")
	}
	if page < 1 {
		page = 1
	}
	search = strings.TrimSpace(search)
	rows, err := s.q.AdminListUsers(ctx, db.AdminListUsersParams{
		OwnerEmails: s.owners,
		Search:      pgtype.Text{String: escapeLike(search), Valid: search != ""},
		Status:      pgtype.Text{String: status, Valid: status != ""},
		Lim:         UserPageSize,
		Off:         int32((page - 1) * UserPageSize),
	})
	if err != nil {
		return apitypes.AdminUserPage{}, err
	}
	out := apitypes.AdminUserPage{Users: []apitypes.AdminUserSummary{}, Page: page, PageSize: UserPageSize}
	for _, r := range rows {
		out.Users = append(out.Users, apitypes.ToAdminUserSummary(r))
		out.Total = r.Total
	}
	return out, nil
}

func (s *Service) GetUser(ctx context.Context, id pgtype.UUID) (apitypes.AdminUserDetail, error) {
	p, err := s.q.GetProfileByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return apitypes.AdminUserDetail{}, httpx.NotFound("USER_NOT_FOUND", "No such user.")
	}
	if err != nil {
		return apitypes.AdminUserDetail{}, err
	}
	role, owner, err := s.roleOf(ctx, s.q, p)
	if err != nil {
		return apitypes.AdminUserDetail{}, err
	}
	counts, err := s.q.AdminUserCounts(ctx, id)
	if err != nil {
		return apitypes.AdminUserDetail{}, err
	}
	sessions, err := s.q.AdminListUserSessions(ctx, id)
	if err != nil {
		return apitypes.AdminUserDetail{}, err
	}
	groups, err := s.q.AdminListUserGroups(ctx, id)
	if err != nil {
		return apitypes.AdminUserDetail{}, err
	}
	d := apitypes.AdminUserDetail{
		ID:               idutil.String(p.ID),
		DisplayName:      p.DisplayName,
		Email:            optText(p.Email),
		Username:         optText(p.Username),
		AvatarURL:        optText(p.AvatarUrl),
		CreatedAt:        p.CreatedAt.Time,
		SuspendedAt:      optTime(p.SuspendedAt),
		SuspensionReason: optText(p.SuspensionReason),
		Owner:            owner,
		LastActiveAt:     optTime(counts.LastActiveAt),
		GroupCount:       counts.GroupCount,
		FriendCount:      counts.FriendCount,
		ExpenseCount:     counts.ExpenseCount,
		SettlementCount:  counts.SettlementCount,
		Sessions:         apitypes.ToAdminSessions(sessions),
		Groups:           apitypes.ToAdminUserGroups(groups),
	}
	if role != "" {
		r := string(role)
		d.AdminRole = &r
	}
	return d, nil
}

// ListAdmins: owners from ADMIN_EMAILS first (once they've signed in at
// least once, so they have a profile), then stored roles.
func (s *Service) ListAdmins(ctx context.Context) ([]apitypes.SiteAdminEntry, error) {
	out := []apitypes.SiteAdminEntry{}
	seen := map[pgtype.UUID]bool{}
	if len(s.owners) > 0 {
		owners, err := s.q.ListOwnerProfiles(ctx, s.owners)
		if err != nil {
			return nil, err
		}
		for _, p := range owners {
			seen[p.ID] = true
			out = append(out, apitypes.SiteAdminEntry{
				UserID:      idutil.String(p.ID),
				DisplayName: p.DisplayName,
				Email:       optText(p.Email),
				Username:    optText(p.Username),
				AvatarURL:   optText(p.AvatarUrl),
				Role:        string(db.AdminRoleSUPERADMIN),
				Owner:       true,
			})
		}
	}
	rows, err := s.q.ListSiteAdmins(ctx)
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if seen[r.UserID] {
			continue
		}
		granted := r.GrantedAt.Time
		out = append(out, apitypes.SiteAdminEntry{
			UserID:        idutil.String(r.UserID),
			DisplayName:   r.DisplayName,
			Email:         optText(r.Email),
			Username:      optText(r.Username),
			AvatarURL:     optText(r.AvatarUrl),
			Role:          string(r.Role),
			GrantedAt:     &granted,
			GrantedByName: optText(r.GrantedByName),
		})
	}
	return out, nil
}

type AuditFilter struct {
	ActorID, TargetID pgtype.UUID
	Action            string
	// Cursor is the previous page's NextCursor, "" for the first page.
	Cursor string
}

// AuditCursor is "<RFC3339Nano time>_<id>" of a page's last row.
func AuditCursor(t time.Time, id string) string {
	return t.UTC().Format(time.RFC3339Nano) + "_" + id
}

func parseAuditCursor(c string) (pgtype.Timestamptz, pgtype.UUID, error) {
	at, id, ok := strings.Cut(c, "_")
	if !ok {
		return pgtype.Timestamptz{}, pgtype.UUID{}, errors.New("bad cursor")
	}
	t, err := time.Parse(time.RFC3339Nano, at)
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.UUID{}, err
	}
	u, err := idutil.Parse(id)
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.UUID{}, err
	}
	return pgtype.Timestamptz{Time: t, Valid: true}, u, nil
}

func (s *Service) ListAudit(ctx context.Context, f AuditFilter) (apitypes.AdminAuditPage, error) {
	params := db.ListAdminAuditParams{
		ActorID:  f.ActorID,
		TargetID: f.TargetID,
		Action:   pgtype.Text{String: f.Action, Valid: f.Action != ""},
		Lim:      AuditPageSize,
	}
	if f.Cursor != "" {
		before, beforeID, err := parseAuditCursor(f.Cursor)
		if err != nil {
			return apitypes.AdminAuditPage{}, httpx.BadRequest("INVALID_CURSOR", "That page link is no longer valid.")
		}
		params.Before, params.BeforeID = before, beforeID
	}
	rows, err := s.q.ListAdminAudit(ctx, params)
	if err != nil {
		return apitypes.AdminAuditPage{}, err
	}
	page := apitypes.AdminAuditPage{Entries: []apitypes.AdminAuditEntry{}}
	for _, r := range rows {
		page.Entries = append(page.Entries, apitypes.ToAdminAuditEntry(r))
	}
	if len(rows) == AuditPageSize {
		last := rows[len(rows)-1]
		c := AuditCursor(last.CreatedAt.Time, idutil.String(last.ID))
		page.NextCursor = &c
	}
	return page, nil
}

// --- acting --------------------------------------------------------------

// Suspend blocks sign-in and signs the person out everywhere.
func (s *Service) Suspend(ctx context.Context, actor Admin, id pgtype.UUID, reason, ip string) error {
	return s.inTx(ctx, func(q *db.Queries) error {
		if _, _, err := s.target(ctx, q, actor, id); err != nil {
			return err
		}
		if _, err := q.SuspendProfile(ctx, db.SuspendProfileParams{
			ID:     id,
			Reason: pgtype.Text{String: reason, Valid: true},
		}); errors.Is(err, pgx.ErrNoRows) {
			return httpx.Conflict("ALREADY_SUSPENDED", "This account is already suspended.")
		} else if err != nil {
			return err
		}
		n, err := q.RevokeAllUserSessions(ctx, id)
		if err != nil {
			return err
		}
		return audit(ctx, q, actor, ActionSuspend, id, map[string]any{"reason": reason, "sessionsEnded": n}, ip)
	})
}

func (s *Service) Unsuspend(ctx context.Context, actor Admin, id pgtype.UUID, ip string) error {
	return s.inTx(ctx, func(q *db.Queries) error {
		if _, _, err := s.target(ctx, q, actor, id); err != nil {
			return err
		}
		if _, err := q.UnsuspendProfile(ctx, id); errors.Is(err, pgx.ErrNoRows) {
			return httpx.Conflict("NOT_SUSPENDED", "This account isn't suspended.")
		} else if err != nil {
			return err
		}
		return audit(ctx, q, actor, ActionUnsuspend, id, nil, ip)
	})
}

// RevokeAllSessions signs the person out on every device; it answers how
// many sessions ended (0 is fine: nothing was live).
func (s *Service) RevokeAllSessions(ctx context.Context, actor Admin, id pgtype.UUID, ip string) (int64, error) {
	var n int64
	err := s.inTx(ctx, func(q *db.Queries) error {
		if _, _, err := s.target(ctx, q, actor, id); err != nil {
			return err
		}
		var err error
		if n, err = q.RevokeAllUserSessions(ctx, id); err != nil {
			return err
		}
		return audit(ctx, q, actor, ActionRevokeAll, id, map[string]any{"sessionsEnded": n}, ip)
	})
	return n, err
}

func (s *Service) RevokeSession(ctx context.Context, actor Admin, id, sessionID pgtype.UUID, ip string) error {
	return s.inTx(ctx, func(q *db.Queries) error {
		if _, _, err := s.target(ctx, q, actor, id); err != nil {
			return err
		}
		n, err := q.RevokeUserSession(ctx, db.RevokeUserSessionParams{ID: sessionID, UserID: id})
		if err != nil {
			return err
		}
		if n == 0 {
			return httpx.NotFound("SESSION_NOT_FOUND", "That session has already ended.")
		}
		return audit(ctx, q, actor, ActionRevokeSession, id, map[string]any{"sessionId": idutil.String(sessionID)}, ip)
	})
}

// SetRole grants or changes a site admin role (super admins only, checked
// by the route). Both the target's current role and the new one must be
// below the actor's: a super admin manages admins and support, and only
// an owner (ADMIN_EMAILS) makes or unmakes super admins. So no super
// admin can demote another, or mint one they then can't take back.
func (s *Service) SetRole(ctx context.Context, actor Admin, id pgtype.UUID, role db.AdminRole, ip string) error {
	return s.inTx(ctx, func(q *db.Queries) error {
		p, from, err := s.target(ctx, q, actor, id)
		if err != nil {
			return err
		}
		if p.SuspendedAt.Valid {
			return httpx.Conflict("TARGET_SUSPENDED", "Unsuspend this account before giving it an admin role.")
		}
		if from == role {
			return httpx.Conflict("ROLE_UNCHANGED", fmt.Sprintf("They're already %s.", roleLabel(role)))
		}
		if rank(role) >= actor.level() {
			return httpx.Forbidden("ROLE_TOO_HIGH", "You can only give a role below your own.")
		}
		if _, err := q.UpsertSiteAdmin(ctx, db.UpsertSiteAdminParams{
			UserID: id, Role: role, GrantedBy: actor.Profile.ID,
		}); err != nil {
			return err
		}
		details := map[string]any{"to": string(role), "from": nil}
		if from != "" {
			details["from"] = string(from)
		}
		return audit(ctx, q, actor, ActionRoleSet, id, details, ip)
	})
}

func (s *Service) RemoveRole(ctx context.Context, actor Admin, id pgtype.UUID, ip string) error {
	return s.inTx(ctx, func(q *db.Queries) error {
		_, from, err := s.target(ctx, q, actor, id)
		if err != nil {
			return err
		}
		if from == "" {
			return httpx.Conflict("NOT_ADMIN", "This account isn't an admin.")
		}
		if _, err := q.DeleteSiteAdmin(ctx, id); err != nil {
			return err
		}
		// Their portal sessions are ordinary sessions; the next request
		// already answers NOT_ADMIN, so nothing else to end.
		return audit(ctx, q, actor, ActionRoleRemove, id, map[string]any{"from": string(from)}, ip)
	})
}

func roleLabel(r db.AdminRole) string {
	switch r {
	case db.AdminRoleSUPPORT:
		return "support"
	case db.AdminRoleADMIN:
		return "an admin"
	case db.AdminRoleSUPERADMIN:
		return "a super admin"
	}
	return string(r)
}

func optText(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func optTime(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}
