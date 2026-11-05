package admin

// Admin portal session limits and an admin's own sessions (ADR-028).
//
// A portal sign-in is an ordinary session, but the portal holds the keys
// to every account, so /admin/* asks more of it than the PWA does:
//   - Idle: unused for AdminIdleLimit, it ends (revoked, not just refused,
//     so the cookie is dead everywhere).
//   - Age: AdminMaxAge after signing in, it ends however busy it is.
// The portal's cookie belongs to the admin site only, so these never end
// anyone's PWA session; a PWA session never calls /admin.

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

const (
	AdminIdleLimit = 30 * time.Minute
	AdminMaxAge    = 12 * time.Hour

	ActionSelfRevokeSession = "self.session.revoke"
	ActionSelfRevokeOthers  = "self.sessions.revoke_others"
)

// sessionEnded answers like an expired session (so the portal shows
// sign-in) with why, for its message.
func sessionEnded(reason, message string) *httpx.APIError {
	e := httpx.Unauthorized("INVALID_SESSION", message)
	e.Details = map[string]string{"reason": reason}
	return e
}

// checkSessionLimits ends a portal session that's been idle or open too
// long. `session` is as it was before this request touched it.
func (s *Service) checkSessionLimits(ctx context.Context, session db.Session, now time.Time) error {
	var reason, message string
	switch {
	case now.Sub(session.CreatedAt.Time) > AdminMaxAge:
		reason, message = "max_age", "You were signed out of the admin portal after 12 hours. Sign in again."
	case now.Sub(session.LastUsedAt.Time) > AdminIdleLimit:
		reason, message = "idle", "You were signed out of the admin portal after 30 minutes without use. Sign in again."
	default:
		return nil
	}
	if _, err := s.q.RevokeSessionByID(ctx, session.ID); err != nil {
		return err
	}
	return sessionEnded(reason, message)
}

// SessionEndsAt is when the current portal session ends at the latest.
func SessionEndsAt(session db.Session) time.Time {
	end := session.CreatedAt.Time.Add(AdminMaxAge)
	if session.ExpiresAt.Time.Before(end) {
		return session.ExpiresAt.Time
	}
	return end
}

// MySessions: the signed-in admin's own sessions (ABRO and the portal),
// the one in use marked.
func (s *Service) MySessions(ctx context.Context, a Admin, current pgtype.UUID) ([]apitypes.AdminOwnSession, error) {
	rows, err := s.q.AdminListUserSessions(ctx, a.Profile.ID)
	if err != nil {
		return nil, err
	}
	out := make([]apitypes.AdminOwnSession, 0, len(rows))
	for _, r := range apitypes.ToAdminSessions(rows) {
		out = append(out, apitypes.AdminOwnSession{AdminSession: r, Current: r.ID == idutil.String(current)})
	}
	return out, nil
}

// EndMySession ends one of your own sessions -- not the one in use (that's
// Sign out).
func (s *Service) EndMySession(ctx context.Context, a Admin, current, id pgtype.UUID, ip string) error {
	if id == current {
		return httpx.BadRequest("CURRENT_SESSION", "That's this session. Use Sign out instead.")
	}
	return s.inTx(ctx, func(q *db.Queries) error {
		n, err := q.RevokeUserSession(ctx, db.RevokeUserSessionParams{ID: id, UserID: a.Profile.ID})
		if err != nil {
			return err
		}
		if n == 0 {
			return httpx.NotFound("SESSION_NOT_FOUND", "That session has already ended.")
		}
		return audit(ctx, q, a, ActionSelfRevokeSession, a.Profile.ID, map[string]any{"sessionId": idutil.String(id)}, ip)
	})
}

// EndMyOtherSessions signs you out everywhere but here.
func (s *Service) EndMyOtherSessions(ctx context.Context, a Admin, current pgtype.UUID, ip string) (int64, error) {
	var n int64
	err := s.inTx(ctx, func(q *db.Queries) error {
		var err error
		if n, err = q.RevokeOtherUserSessions(ctx, db.RevokeOtherUserSessionsParams{UserID: a.Profile.ID, KeepID: current}); err != nil {
			return err
		}
		return audit(ctx, q, a, ActionSelfRevokeOthers, a.Profile.ID, map[string]any{"sessionsEnded": n}, ip)
	})
	return n, err
}

// --- routes -----------------------------------------------------------------

func (h *Handler) mySessions(w http.ResponseWriter, r *http.Request) error {
	out, err := h.svc.MySessions(r.Context(), CurrentAdmin(r.Context()), authpkg.CurrentSession(r.Context()).ID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) endMySession(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		return httpx.NotFound("SESSION_NOT_FOUND", "That session has already ended.")
	}
	current := authpkg.CurrentSession(r.Context()).ID
	if err := h.svc.EndMySession(r.Context(), CurrentAdmin(r.Context()), current, id, clientIP(r)); err != nil {
		return err
	}
	return h.mySessions(w, r)
}

func (h *Handler) endMyOtherSessions(w http.ResponseWriter, r *http.Request) error {
	current := authpkg.CurrentSession(r.Context()).ID
	if _, err := h.svc.EndMyOtherSessions(r.Context(), CurrentAdmin(r.Context()), current, clientIP(r)); err != nil {
		return err
	}
	return h.mySessions(w, r)
}
