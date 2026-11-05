// Package admin is the site admin portal's API (ADR-028): who is an
// admin, what each rank may do, and the actions they take on accounts.
// Every action that changes something writes an audit row in the same
// transaction, so the log can't miss one.
package admin

import (
	"context"
	"net/http"
	"slices"

	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

// Permission is one thing an admin may do. The portal gets the list in
// GET /admin/me to decide which buttons to show; each route checks its own.
type Permission string

const (
	PermUsersView    Permission = "users.view"
	PermUsersSuspend Permission = "users.suspend"
	PermSessions     Permission = "users.sessions"
	PermAuditView    Permission = "audit.view"
	PermAdminsView   Permission = "admins.view"
	PermAdminsManage Permission = "admins.manage"
)

// Each rank has everything the rank below has.
var rolePermissions = map[db.AdminRole][]Permission{
	db.AdminRoleSUPPORT: {PermUsersView, PermAuditView, PermAdminsView},
	db.AdminRoleADMIN: {PermUsersView, PermAuditView, PermAdminsView,
		PermUsersSuspend, PermSessions},
	db.AdminRoleSUPERADMIN: {PermUsersView, PermAuditView, PermAdminsView,
		PermUsersSuspend, PermSessions, PermAdminsManage},
}

// rank orders roles; 0 is "not an admin".
func rank(r db.AdminRole) int {
	switch r {
	case db.AdminRoleSUPPORT:
		return 1
	case db.AdminRoleADMIN:
		return 2
	case db.AdminRoleSUPERADMIN:
		return 3
	}
	return 0
}

// Admin is the signed-in admin, attached to the request by RequireAdmin.
type Admin struct {
	Profile db.Profile
	Role    db.AdminRole
	// Owner: a super admin from ADMIN_EMAILS.
	Owner bool
}

// level is the actor's rank for "may act on" checks: owners sit above
// every stored role, so they can manage stored super admins.
func (a Admin) level() int {
	if a.Owner {
		return rank(db.AdminRoleSUPERADMIN) + 1
	}
	return rank(a.Role)
}

func (a Admin) Can(p Permission) bool { return slices.Contains(rolePermissions[a.Role], p) }

func (a Admin) Permissions() []string {
	out := []string{}
	for _, p := range rolePermissions[a.Role] {
		out = append(out, string(p))
	}
	return out
}

type adminKey struct{}

// CurrentAdmin is only valid behind RequireAdmin.
func CurrentAdmin(ctx context.Context) Admin { return ctx.Value(adminKey{}).(Admin) }

// RequireAdmin lets through a signed-in admin of any rank. A signed-in
// non-admin gets 403 NOT_ADMIN (not 404): the portal shows "this account
// isn't an admin" instead of a broken page.
func (s *Service) RequireAdmin(next http.Handler) http.Handler {
	return authpkg.RequireSession(s.q)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a, err := s.adminFor(r.Context(), authpkg.CurrentUser(r.Context()))
		if err != nil {
			httpx.WriteError(w, r, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), adminKey{}, a)))
	}))
}

// need wraps a handler that requires one permission.
func need(p Permission, fn httpx.HandlerFunc) http.HandlerFunc {
	return httpx.Wrap(func(w http.ResponseWriter, r *http.Request) error {
		if !CurrentAdmin(r.Context()).Can(p) {
			return httpx.Forbidden("ADMIN_FORBIDDEN", "Your admin role can't do that.")
		}
		return fn(w, r)
	})
}
