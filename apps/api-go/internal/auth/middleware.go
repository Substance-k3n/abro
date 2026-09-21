package auth

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

const SessionCookie = "abro_session"

type contextKey string

const userContextKey contextKey = "abro_current_user"

// CurrentUser reads the Profile RequireSession attached to the request
// context. Only valid inside a handler behind RequireSession.
func CurrentUser(ctx context.Context) db.Profile {
	return ctx.Value(userContextKey).(db.Profile)
}

// RequireSession is the Go equivalent of SessionGuard: reads the session
// cookie, hashes it, looks up the row, and attaches the user to the
// request context -- or fails the request with an *httpx.APIError.
func RequireSession(q db.Querier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(SessionCookie)
			if err != nil || cookie.Value == "" {
				httpx.WriteError(w, r, httpx.Unauthorized("NO_SESSION", "Not signed in."))
				return
			}

			session, err := q.GetSessionByTokenHash(r.Context(), HashToken(cookie.Value))
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.WriteError(w, r, httpx.Unauthorized("INVALID_SESSION", "Session expired or invalid."))
				return
			}
			if err != nil {
				httpx.WriteError(w, r, err)
				return
			}
			if session.RevokedAt.Valid || session.ExpiresAt.Time.Before(time.Now()) {
				httpx.WriteError(w, r, httpx.Unauthorized("INVALID_SESSION", "Session expired or invalid."))
				return
			}

			user, err := q.GetProfileByID(r.Context(), session.UserID)
			if err != nil {
				httpx.WriteError(w, r, err)
				return
			}

			_ = q.TouchSessionLastUsed(r.Context(), session.ID)

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
