package admin

// Integration tests against the dev Postgres (same setup as the other
// modules' *_integration_test.go). Each test makes its own people with
// unique emails and deletes them afterwards.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro?sslmode=disable"
}

type fixture struct {
	t      *testing.T
	ctx    context.Context
	pool   *pgxpool.Pool
	q      *db.Queries
	svc    *Service
	tag    string
	owner  db.Profile
	people []pgtype.UUID
}

func setup(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, testDatabaseURL())
	require.NoError(t, err)
	require.NoError(t, pool.Ping(ctx), "start the dev Postgres (docker start abro-db)")

	f := &fixture{t: t, ctx: ctx, pool: pool, q: db.New(pool),
		tag: fmt.Sprintf("adm%d%d", time.Now().UnixNano(), rand.Intn(1000))}
	ownerEmail := f.tag + "-owner@abro.test"
	// Mixed case and spaces: ADMIN_EMAILS is normalized like sign-in.
	f.svc = NewService(pool, "  "+strings.ToUpper(ownerEmail)+" , ")
	f.owner = f.person("owner")

	t.Cleanup(func() {
		// Dependent rows for everyone first, then the profiles, so one
		// person's rows never block deleting another's profile.
		ids := f.people
		for _, q := range []string{
			`DELETE FROM admin_audit_log WHERE actor_id = ANY($1) OR target_id = ANY($1)`,
			`DELETE FROM settlement_requests WHERE payer_id = ANY($1) OR recipient_id = ANY($1)`,
			`DELETE FROM expenses WHERE paid_by_id = ANY($1)`,
			`DELETE FROM groups WHERE created_by_id = ANY($1)`,
			`DELETE FROM group_members WHERE user_id = ANY($1)`,
			`DELETE FROM friendships WHERE user_id = ANY($1) OR friend_id = ANY($1)`,
			`DELETE FROM profiles WHERE id = ANY($1)`,
		} {
			if _, err := pool.Exec(ctx, q, ids); err != nil {
				t.Errorf("cleanup %q: %v", q, err)
			}
		}
		pool.Close()
	})
	return f
}

func (f *fixture) person(label string) db.Profile {
	f.t.Helper()
	p, err := f.q.UpsertProfileByEmail(f.ctx, db.UpsertProfileByEmailParams{
		Email:       pgtype.Text{String: f.tag + "-" + label + "@abro.test", Valid: true},
		DisplayName: f.tag + " " + label,
	})
	require.NoError(f.t, err)
	f.people = append(f.people, p.ID)
	return p
}

func (f *fixture) withRole(label string, role db.AdminRole) db.Profile {
	f.t.Helper()
	p := f.person(label)
	_, err := f.q.UpsertSiteAdmin(f.ctx, db.UpsertSiteAdminParams{UserID: p.ID, Role: role})
	require.NoError(f.t, err)
	return p
}

func (f *fixture) admin(p db.Profile) Admin {
	f.t.Helper()
	a, err := f.svc.adminFor(f.ctx, p)
	require.NoError(f.t, err)
	return a
}

// session makes a live session and returns its raw token (the cookie).
func (f *fixture) session(p db.Profile) (string, pgtype.UUID) {
	f.t.Helper()
	token, err := auth.GenerateSessionToken()
	require.NoError(f.t, err)
	s, err := f.q.CreateSession(f.ctx, db.CreateSessionParams{
		UserID:    p.ID,
		TokenHash: auth.HashToken(token),
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	})
	require.NoError(f.t, err)
	return token, s.ID
}

func (f *fixture) liveSessions(p db.Profile) int {
	f.t.Helper()
	var n int
	require.NoError(f.t, f.pool.QueryRow(f.ctx,
		`SELECT count(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`, p.ID).Scan(&n))
	return n
}

func (f *fixture) auditFor(p db.Profile) []db.ListAdminAuditRow {
	f.t.Helper()
	rows, err := f.q.ListAdminAudit(f.ctx, db.ListAdminAuditParams{TargetID: p.ID, Lim: 100})
	require.NoError(f.t, err)
	return rows
}

func errCode(t *testing.T, err error) string {
	t.Helper()
	var apiErr *httpx.APIError
	require.True(t, errors.As(err, &apiErr), "want an APIError, got %v", err)
	return apiErr.Code
}

func TestRoles(t *testing.T) {
	f := setup(t)

	owner := f.admin(f.owner)
	assert.Equal(t, db.AdminRoleSUPERADMIN, owner.Role)
	assert.True(t, owner.Owner)
	assert.True(t, owner.Can(PermAdminsManage))

	support := f.admin(f.withRole("support", db.AdminRoleSUPPORT))
	assert.False(t, support.Owner)
	assert.True(t, support.Can(PermUsersView))
	assert.False(t, support.Can(PermUsersSuspend))
	assert.Equal(t, []string{"overview.view", "users.view", "groups.view", "audit.view", "admins.view"}, support.Permissions())

	admin := f.admin(f.withRole("admin", db.AdminRoleADMIN))
	assert.True(t, admin.Can(PermUsersSuspend))
	assert.False(t, admin.Can(PermAdminsManage))

	_, err := f.svc.adminFor(f.ctx, f.person("plain"))
	assert.Equal(t, "NOT_ADMIN", errCode(t, err))
}

func TestSuspend(t *testing.T) {
	f := setup(t)
	actor := f.admin(f.withRole("admin", db.AdminRoleADMIN))
	user := f.person("user")
	f.session(user)
	f.session(user)

	t.Run("blocks the account and ends every session, logged with the reason", func(t *testing.T) {
		require.NoError(t, f.svc.Suspend(f.ctx, actor, user.ID, "spam invites", "10.0.0.1"))

		p, err := f.q.GetProfileByID(f.ctx, user.ID)
		require.NoError(t, err)
		assert.True(t, p.SuspendedAt.Valid)
		assert.Equal(t, "spam invites", p.SuspensionReason.String)
		assert.Equal(t, 0, f.liveSessions(user))

		log := f.auditFor(user)
		require.Len(t, log, 1)
		assert.Equal(t, ActionSuspend, log[0].Action)
		assert.Equal(t, actor.Profile.ID, log[0].ActorID)
		assert.Equal(t, "10.0.0.1", log[0].IpAddress.String)
		var details map[string]any
		require.NoError(t, json.Unmarshal(log[0].Details, &details))
		assert.Equal(t, "spam invites", details["reason"])
		assert.EqualValues(t, 2, details["sessionsEnded"])
	})

	t.Run("twice is a conflict and logs nothing more", func(t *testing.T) {
		err := f.svc.Suspend(f.ctx, actor, user.ID, "again", "")
		assert.Equal(t, "ALREADY_SUSPENDED", errCode(t, err))
		assert.Len(t, f.auditFor(user), 1)
	})

	t.Run("sign-in refuses a suspended account", func(t *testing.T) {
		mailer := &codeMailer{}
		authSvc := auth.NewService(f.q, nil, mailer, 30)
		require.NoError(t, authSvc.RequestOTP(f.ctx, user.Email.String))
		_, err := authSvc.VerifyOTP(f.ctx, user.Email.String, mailer.code, auth.SessionMeta{})
		assert.Equal(t, "ACCOUNT_SUSPENDED", errCode(t, err))
		assert.Equal(t, 0, f.liveSessions(user))
	})

	t.Run("a session that outlived the suspension stops working", func(t *testing.T) {
		// Simulates a request racing the suspension: a live session row
		// for a suspended profile.
		token, _ := f.session(user)
		h := auth.RequireSession(f.q)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: token})
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.Contains(t, rec.Body.String(), "INVALID_SESSION")
	})

	t.Run("unsuspend lets them back in, once", func(t *testing.T) {
		require.NoError(t, f.svc.Unsuspend(f.ctx, actor, user.ID, ""))
		p, err := f.q.GetProfileByID(f.ctx, user.ID)
		require.NoError(t, err)
		assert.False(t, p.SuspendedAt.Valid)
		assert.False(t, p.SuspensionReason.Valid)
		assert.Equal(t, ActionUnsuspend, f.auditFor(user)[0].Action)

		err = f.svc.Unsuspend(f.ctx, actor, user.ID, "")
		assert.Equal(t, "NOT_SUSPENDED", errCode(t, err))
	})
}

type codeMailer struct{ code string }

func (m *codeMailer) Send(_, code string) error { m.code = code; return nil }

func TestWhoCanActOnWhom(t *testing.T) {
	f := setup(t)
	owner := f.admin(f.owner)
	superA := f.admin(f.withRole("superA", db.AdminRoleSUPERADMIN))
	superB := f.withRole("superB", db.AdminRoleSUPERADMIN)
	adminA := f.admin(f.withRole("adminA", db.AdminRoleADMIN))
	adminB := f.withRole("adminB", db.AdminRoleADMIN)
	support := f.withRole("support", db.AdminRoleSUPPORT)
	user := f.person("user")

	cases := []struct {
		name   string
		actor  Admin
		target db.Profile
		want   string // "" = allowed
	}{
		{"admin on a plain user", adminA, user, ""},
		{"admin on support", adminA, support, ""},
		{"admin on another admin", adminA, adminB, "TARGET_OUTRANKS"},
		{"admin on a super admin", adminA, superB, "TARGET_OUTRANKS"},
		{"admin on themselves", adminA, adminA.Profile, "SELF_ACTION"},
		{"admin on the owner", adminA, f.owner, "OWNER_PROTECTED"},
		{"super admin on an admin", superA, adminB, ""},
		{"super admin on another super admin", superA, superB, "TARGET_OUTRANKS"},
		{"super admin on the owner", superA, f.owner, "OWNER_PROTECTED"},
		{"owner on a super admin", owner, superB, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			before := len(f.auditFor(c.target))
			_, err := f.svc.RevokeAllSessions(f.ctx, c.actor, c.target.ID, "")
			if c.want == "" {
				require.NoError(t, err)
				assert.Len(t, f.auditFor(c.target), before+1)
				return
			}
			assert.Equal(t, c.want, errCode(t, err))
			assert.Len(t, f.auditFor(c.target), before, "a refused action leaves no log row")
		})
	}

	t.Run("an unknown user is a 404", func(t *testing.T) {
		missing, _ := idutil.Parse("00000000-0000-0000-0000-000000000001")
		err := f.svc.Suspend(f.ctx, adminA, missing, "x", "")
		assert.Equal(t, "USER_NOT_FOUND", errCode(t, err))
	})
}

func TestSessions(t *testing.T) {
	f := setup(t)
	actor := f.admin(f.withRole("admin", db.AdminRoleADMIN))
	user := f.person("user")
	other := f.person("other")
	f.session(user)
	_, one := f.session(user)
	_, othersSession := f.session(other)

	require.NoError(t, f.svc.RevokeSession(f.ctx, actor, user.ID, one, ""))
	assert.Equal(t, 1, f.liveSessions(user))

	err := f.svc.RevokeSession(f.ctx, actor, user.ID, one, "")
	assert.Equal(t, "SESSION_NOT_FOUND", errCode(t, err), "already ended")

	err = f.svc.RevokeSession(f.ctx, actor, user.ID, othersSession, "")
	assert.Equal(t, "SESSION_NOT_FOUND", errCode(t, err), "someone else's session")
	assert.Equal(t, 1, f.liveSessions(other))

	n, err := f.svc.RevokeAllSessions(f.ctx, actor, user.ID, "")
	require.NoError(t, err)
	assert.EqualValues(t, 1, n)
	assert.Equal(t, 0, f.liveSessions(user))

	d, err := f.svc.GetUser(f.ctx, user.ID)
	require.NoError(t, err)
	require.Len(t, d.Sessions, 2)
	for _, s := range d.Sessions {
		assert.False(t, s.Live)
		assert.NotNil(t, s.RevokedAt)
	}
}

func TestSetRole(t *testing.T) {
	f := setup(t)
	owner := f.admin(f.owner)
	superA := f.admin(f.withRole("superA", db.AdminRoleSUPERADMIN))
	user := f.person("user")

	require.NoError(t, f.svc.SetRole(f.ctx, superA, user.ID, db.AdminRoleSUPPORT, ""))
	require.NoError(t, f.svc.SetRole(f.ctx, superA, user.ID, db.AdminRoleADMIN, ""))
	assert.Equal(t, "ROLE_UNCHANGED", errCode(t, f.svc.SetRole(f.ctx, superA, user.ID, db.AdminRoleADMIN, "")))
	assert.Equal(t, "ROLE_TOO_HIGH", errCode(t, f.svc.SetRole(f.ctx, superA, user.ID, db.AdminRoleSUPERADMIN, "")),
		"only an owner makes super admins")
	require.NoError(t, f.svc.SetRole(f.ctx, owner, user.ID, db.AdminRoleSUPERADMIN, ""))
	assert.Equal(t, "TARGET_OUTRANKS", errCode(t, f.svc.RemoveRole(f.ctx, superA, user.ID, "")),
		"super admins can't demote each other")
	require.NoError(t, f.svc.RemoveRole(f.ctx, owner, user.ID, ""))
	assert.Equal(t, "NOT_ADMIN", errCode(t, f.svc.RemoveRole(f.ctx, owner, user.ID, "")))

	_, err := f.svc.adminFor(f.ctx, user)
	assert.Equal(t, "NOT_ADMIN", errCode(t, err))

	// Newest first: remove, set SUPER_ADMIN, set ADMIN, set SUPPORT.
	log := f.auditFor(user)
	require.Len(t, log, 4)
	var got []string
	for _, e := range log {
		var d map[string]any
		require.NoError(t, json.Unmarshal(e.Details, &d))
		got = append(got, fmt.Sprintf("%s %v>%v", e.Action, d["from"], d["to"]))
	}
	assert.Equal(t, []string{
		"admin.role.remove SUPER_ADMIN><nil>",
		"admin.role.set ADMIN>SUPER_ADMIN",
		"admin.role.set SUPPORT>ADMIN",
		"admin.role.set <nil>>SUPPORT",
	}, got)

	t.Run("a suspended account can't be given a role", func(t *testing.T) {
		u := f.person("suspended")
		require.NoError(t, f.svc.Suspend(f.ctx, superA, u.ID, "x", ""))
		assert.Equal(t, "TARGET_SUSPENDED", errCode(t, f.svc.SetRole(f.ctx, superA, u.ID, db.AdminRoleSUPPORT, "")))
	})

	t.Run("lists owners first, then stored roles", func(t *testing.T) {
		list, err := f.svc.ListAdmins(f.ctx)
		require.NoError(t, err)
		require.NotEmpty(t, list)
		assert.Equal(t, idutil.String(f.owner.ID), list[0].UserID)
		assert.True(t, list[0].Owner)
		var found bool
		for _, e := range list {
			if e.UserID == idutil.String(superA.Profile.ID) {
				found = true
				assert.Equal(t, "SUPER_ADMIN", e.Role)
				assert.False(t, e.Owner)
			}
		}
		assert.True(t, found)
	})
}

func TestListUsers(t *testing.T) {
	f := setup(t)
	actor := f.admin(f.withRole("admin", db.AdminRoleADMIN))
	a := f.person("alpha")
	b := f.person("beta")
	require.NoError(t, f.svc.Suspend(f.ctx, actor, b.ID, "x", ""))

	pageIDs := func(search, status string) []string {
		t.Helper()
		page, err := f.svc.ListUsers(f.ctx, search, status, 1)
		require.NoError(t, err)
		out := []string{}
		for _, u := range page.Users {
			out = append(out, u.ID)
		}
		return out
	}

	assert.ElementsMatch(t, []string{idutil.String(f.owner.ID), idutil.String(actor.Profile.ID),
		idutil.String(a.ID), idutil.String(b.ID)}, pageIDs(f.tag, ""))
	assert.Equal(t, []string{idutil.String(b.ID)}, pageIDs(f.tag, "suspended"))
	assert.ElementsMatch(t, []string{idutil.String(f.owner.ID), idutil.String(actor.Profile.ID)},
		pageIDs(f.tag, "admins"), "owner counts as an admin without a row")
	assert.Equal(t, []string{idutil.String(a.ID)}, pageIDs(strings.ToUpper(f.tag+" alpha"), ""))
	assert.Empty(t, pageIDs(f.tag+"%", ""), "% is a literal, not a wildcard")

	_, err := f.svc.ListUsers(f.ctx, "", "deleted", 1)
	assert.Equal(t, "INVALID_STATUS", errCode(t, err))

	page, err := f.svc.ListUsers(f.ctx, f.tag, "", 1)
	require.NoError(t, err)
	assert.EqualValues(t, 4, page.Total)
	for _, u := range page.Users {
		switch u.ID {
		case idutil.String(f.owner.ID):
			assert.Equal(t, "SUPER_ADMIN", *u.AdminRole)
		case idutil.String(a.ID):
			assert.Nil(t, u.AdminRole)
			assert.Nil(t, u.SuspendedAt)
		}
	}
}

func TestUserDetailCounts(t *testing.T) {
	f := setup(t)
	user := f.person("user")
	friend := f.person("friend")
	pending := f.person("pending")

	_, err := f.pool.Exec(f.ctx, `INSERT INTO friendships (user_id, friend_id, status) VALUES
		($1, $2, 'ACCEPTED'), ($3, $1, 'PENDING')`, user.ID, friend.ID, pending.ID)
	require.NoError(t, err)
	var groupID pgtype.UUID
	require.NoError(t, f.pool.QueryRow(f.ctx,
		`INSERT INTO groups (name, created_by_id) VALUES ('Flat', $1) RETURNING id`, user.ID).Scan(&groupID))
	_, err = f.pool.Exec(f.ctx, `INSERT INTO group_members (group_id, user_id, role, status) VALUES
		($1, $2, 'ADMIN', 'ACTIVE'), ($1, $3, 'MEMBER', 'ACTIVE'), ($1, $4, 'MEMBER', 'INVITED')`,
		groupID, user.ID, friend.ID, pending.ID)
	require.NoError(t, err)
	f.session(user)

	d, err := f.svc.GetUser(f.ctx, user.ID)
	require.NoError(t, err)
	assert.EqualValues(t, 1, d.FriendCount, "pending requests don't count")
	assert.EqualValues(t, 1, d.GroupCount)
	assert.EqualValues(t, 0, d.ExpenseCount)
	assert.NotNil(t, d.LastActiveAt)
	assert.Nil(t, d.AdminRole)
	require.Len(t, d.Groups, 1)
	assert.Equal(t, "Flat", d.Groups[0].Name)
	assert.Equal(t, "ADMIN", d.Groups[0].Role)
	assert.EqualValues(t, 2, d.Groups[0].MemberCount, "invited members aren't counted")
	require.Len(t, d.Sessions, 1)
	assert.True(t, d.Sessions[0].Live)
}

func TestAuditPaging(t *testing.T) {
	f := setup(t)
	actor := f.admin(f.owner)
	user := f.person("user")
	// 60 rows with the same timestamp: the cursor must still walk all.
	_, err := f.pool.Exec(f.ctx, `INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, created_at)
		SELECT $1, 'user.session.revoke', 'user', $2, now() FROM generate_series(1, 60)`,
		actor.Profile.ID, user.ID)
	require.NoError(t, err)

	seen := map[string]bool{}
	cursor := ""
	pages := 0
	for {
		page, err := f.svc.ListAudit(f.ctx, AuditFilter{TargetID: user.ID, Cursor: cursor})
		require.NoError(t, err)
		pages++
		for _, e := range page.Entries {
			assert.False(t, seen[e.ID], "no row twice")
			seen[e.ID] = true
			assert.Equal(t, f.tag+" owner", *e.ActorName)
			assert.Equal(t, f.tag+" user", *e.TargetName)
		}
		if page.NextCursor == nil {
			break
		}
		cursor = *page.NextCursor
	}
	assert.Len(t, seen, 60)
	assert.Equal(t, 2, pages)

	_, err = f.svc.ListAudit(f.ctx, AuditFilter{Cursor: "garbage"})
	assert.Equal(t, "INVALID_CURSOR", errCode(t, err))
}

func TestRoutes(t *testing.T) {
	f := setup(t)
	support := f.withRole("support", db.AdminRoleSUPPORT)
	user := f.person("user")

	r := chi.NewRouter()
	r.Route("/admin", NewHandler(f.svc).Mount)
	call := func(p db.Profile, method, path, body string) *httptest.ResponseRecorder {
		token, _ := f.session(p)
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: token})
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}

	rec := call(user, http.MethodGet, "/admin/me", "")
	assert.Equal(t, http.StatusForbidden, rec.Code)
	assert.Contains(t, rec.Body.String(), "NOT_ADMIN")

	rec = call(support, http.MethodGet, "/admin/me", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var me struct {
		Role        string   `json:"role"`
		Permissions []string `json:"permissions"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &me))
	assert.Equal(t, "SUPPORT", me.Role)
	assert.NotContains(t, me.Permissions, "users.suspend")

	rec = call(support, http.MethodPost, "/admin/users/"+idutil.String(user.ID)+"/suspend", `{"reason":"x"}`)
	assert.Equal(t, http.StatusForbidden, rec.Code)
	assert.Contains(t, rec.Body.String(), "ADMIN_FORBIDDEN")

	rec = call(support, http.MethodGet, "/admin/users/"+idutil.String(user.ID), "")
	assert.Equal(t, http.StatusOK, rec.Code)

	rec = call(f.owner, http.MethodPost, "/admin/users/"+idutil.String(user.ID)+"/suspend", `{"reason":"  "}`)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "REASON_REQUIRED")

	rec = call(f.owner, http.MethodPost, "/admin/users/"+idutil.String(user.ID)+"/suspend", `{"reason":"fraud report"}`)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), `"suspensionReason":"fraud report"`)

	rec = call(f.owner, http.MethodGet, "/admin/users/not-a-uuid", "")
	assert.Equal(t, http.StatusNotFound, rec.Code)

	req := httptest.NewRequest(http.MethodGet, "/admin/me", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code, "no cookie")
}
