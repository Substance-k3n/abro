package apitypes

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

// Admin portal wire shapes (ADR-028), mirrored in apps/admin/src/lib.
// Nothing here carries an amount: admins see counts, never money.

// AdminMe is GET /admin/me: who's signed in to the portal and what they
// may do. The portal hides what's not in Permissions; the API still
// checks every call.
type AdminMe struct {
	Profile     AuthProfile `json:"profile"`
	Role        string      `json:"role"`
	Owner       bool        `json:"owner"`
	Permissions []string    `json:"permissions"`
	// Session is the portal's limits and when this sign-in ends.
	Session AdminSessionPolicy `json:"session"`
}

// AdminSessionPolicy: portal sign-ins end after IdleMinutes unused or
// MaxHours after signing in, whichever comes first (ADR-028).
type AdminSessionPolicy struct {
	IdleMinutes int       `json:"idleMinutes"`
	MaxHours    int       `json:"maxHours"`
	StartedAt   time.Time `json:"startedAt"`
	EndsAt      time.Time `json:"endsAt"`
}

// AdminOwnSession is one of the signed-in admin's own sessions.
type AdminOwnSession struct {
	AdminSession
	Current bool `json:"current"`
}

type AdminUserSummary struct {
	ID           string     `json:"id"`
	DisplayName  string     `json:"displayName"`
	Email        *string    `json:"email"`
	Username     *string    `json:"username"`
	AvatarURL    *string    `json:"avatarUrl"`
	CreatedAt    time.Time  `json:"createdAt"`
	SuspendedAt  *time.Time `json:"suspendedAt"`
	AdminRole    *string    `json:"adminRole"`
	LastActiveAt *time.Time `json:"lastActiveAt"`
	GroupCount   int64      `json:"groupCount"`
}

type AdminUserPage struct {
	Users []AdminUserSummary `json:"users"`
	Total int64              `json:"total"`
	Page  int                `json:"page"`
	// PageSize is the most users one page holds.
	PageSize int `json:"pageSize"`
}

func ToAdminUserSummary(r db.AdminListUsersRow) AdminUserSummary {
	var role *string
	if r.AdminRole != "" {
		role = &r.AdminRole
	}
	return AdminUserSummary{
		ID:           idutil.String(r.ID),
		DisplayName:  r.DisplayName,
		Email:        textPtr(r.Email),
		Username:     textPtr(r.Username),
		AvatarURL:    textPtr(r.AvatarUrl),
		CreatedAt:    r.CreatedAt.Time,
		SuspendedAt:  timePtr(r.SuspendedAt),
		AdminRole:    role,
		LastActiveAt: timePtr(r.LastActiveAt),
		GroupCount:   r.GroupCount,
	}
}

type AdminSession struct {
	ID         string     `json:"id"`
	UserAgent  *string    `json:"userAgent"`
	IPAddress  *string    `json:"ipAddress"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastUsedAt time.Time  `json:"lastUsedAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	RevokedAt  *time.Time `json:"revokedAt"`
	Live       bool       `json:"live"`
}

type AdminUserGroup struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	Role        string    `json:"role"`
	Status      string    `json:"status"`
	JoinedAt    time.Time `json:"joinedAt"`
	Deleted     bool      `json:"deleted"`
	MemberCount int64     `json:"memberCount"`
}

// AdminUserDetail is GET /admin/users/{id}.
type AdminUserDetail struct {
	ID               string           `json:"id"`
	DisplayName      string           `json:"displayName"`
	Email            *string          `json:"email"`
	Username         *string          `json:"username"`
	AvatarURL        *string          `json:"avatarUrl"`
	CreatedAt        time.Time        `json:"createdAt"`
	SuspendedAt      *time.Time       `json:"suspendedAt"`
	SuspensionReason *string          `json:"suspensionReason"`
	AdminRole        *string          `json:"adminRole"`
	Owner            bool             `json:"owner"`
	LastActiveAt     *time.Time       `json:"lastActiveAt"`
	GroupCount       int64            `json:"groupCount"`
	FriendCount      int64            `json:"friendCount"`
	ExpenseCount     int64            `json:"expenseCount"`
	SettlementCount  int64            `json:"settlementCount"`
	Sessions         []AdminSession   `json:"sessions"`
	Groups           []AdminUserGroup `json:"groups"`
	Voice            AdminUserVoice   `json:"voice"`
}

func ToAdminSessions(rows []db.AdminListUserSessionsRow) []AdminSession {
	out := make([]AdminSession, 0, len(rows))
	for _, s := range rows {
		out = append(out, AdminSession{
			ID:         idutil.String(s.ID),
			UserAgent:  textPtr(s.UserAgent),
			IPAddress:  textPtr(s.IpAddress),
			CreatedAt:  s.CreatedAt.Time,
			LastUsedAt: s.LastUsedAt.Time,
			ExpiresAt:  s.ExpiresAt.Time,
			RevokedAt:  timePtr(s.RevokedAt),
			Live:       s.Live,
		})
	}
	return out
}

func ToAdminUserGroups(rows []db.AdminListUserGroupsRow) []AdminUserGroup {
	out := make([]AdminUserGroup, 0, len(rows))
	for _, g := range rows {
		out = append(out, AdminUserGroup{
			ID:          idutil.String(g.ID),
			Name:        g.Name,
			Type:        string(g.Type),
			Role:        string(g.Role),
			Status:      string(g.Status),
			JoinedAt:    g.JoinedAt.Time,
			Deleted:     g.DeletedAt.Valid,
			MemberCount: g.MemberCount,
		})
	}
	return out
}

// SiteAdminEntry is one row of GET /admin/admins.
type SiteAdminEntry struct {
	UserID      string  `json:"userId"`
	DisplayName string  `json:"displayName"`
	Email       *string `json:"email"`
	Username    *string `json:"username"`
	AvatarURL   *string `json:"avatarUrl"`
	Role        string  `json:"role"`
	// Owner: a super admin from ADMIN_EMAILS, not changeable in the app.
	Owner         bool       `json:"owner"`
	GrantedAt     *time.Time `json:"grantedAt"`
	GrantedByName *string    `json:"grantedByName"`
}

// AdminAuditEntry is one row of GET /admin/audit.
type AdminAuditEntry struct {
	ID          string          `json:"id"`
	ActorID     *string         `json:"actorId"`
	ActorName   *string         `json:"actorName"`
	ActorEmail  *string         `json:"actorEmail"`
	Action      string          `json:"action"`
	TargetType  string          `json:"targetType"`
	TargetID    *string         `json:"targetId"`
	TargetName  *string         `json:"targetName"`
	TargetEmail *string         `json:"targetEmail"`
	Details     json.RawMessage `json:"details"`
	IPAddress   *string         `json:"ipAddress"`
	CreatedAt   time.Time       `json:"createdAt"`
}

type AdminAuditPage struct {
	Entries []AdminAuditEntry `json:"entries"`
	// NextCursor is the `cursor` for the next page; nil on the last one.
	NextCursor *string `json:"nextCursor"`
}

func ToAdminAuditEntry(r db.ListAdminAuditRow) AdminAuditEntry {
	details := json.RawMessage(r.Details)
	if len(details) == 0 {
		details = json.RawMessage("{}")
	}
	return AdminAuditEntry{
		ID:          idutil.String(r.ID),
		ActorID:     uuidPtr(r.ActorID),
		ActorName:   textPtr(r.ActorName),
		ActorEmail:  textPtr(r.ActorEmail),
		Action:      r.Action,
		TargetType:  r.TargetType,
		TargetID:    uuidPtr(r.TargetID),
		TargetName:  textPtr(r.TargetName),
		TargetEmail: textPtr(r.TargetEmail),
		Details:     details,
		IPAddress:   textPtr(r.IpAddress),
		CreatedAt:   r.CreatedAt.Time,
	}
}

// SuspendUserInput is POST /admin/users/{id}/suspend. A reason is
// required: it's what the next admin reads in the log.
type SuspendUserInput struct {
	Reason string `json:"reason"`
}

func (in *SuspendUserInput) Validate() error {
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" {
		return httpx.BadRequest("REASON_REQUIRED", "Say why you're suspending this account.")
	}
	if len([]rune(in.Reason)) > 500 {
		return httpx.BadRequest("REASON_TOO_LONG", "Keep the reason under 500 characters.")
	}
	return nil
}

// SetAdminRoleInput is PUT /admin/admins/{userId}.
type SetAdminRoleInput struct {
	Role string `json:"role"`
}

func (in *SetAdminRoleInput) Validate() error {
	switch db.AdminRole(in.Role) {
	case db.AdminRoleSUPPORT, db.AdminRoleADMIN, db.AdminRoleSUPERADMIN:
		return nil
	}
	return httpx.BadRequest("INVALID_ROLE", "Role must be SUPPORT, ADMIN or SUPER_ADMIN.")
}

func timePtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}

func uuidPtr(id pgtype.UUID) *string {
	if !id.Valid {
		return nil
	}
	s := idutil.String(id)
	return &s
}
