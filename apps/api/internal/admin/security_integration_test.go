package admin

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

// ageSession sets a session's sign-in and last-use times back.
func (f *fixture) ageSession(id pgtype.UUID, started, lastUsed time.Duration) {
	f.t.Helper()
	_, err := f.pool.Exec(f.ctx, `UPDATE sessions SET created_at = now() - make_interval(secs => $2),
		last_used_at = now() - make_interval(secs => $3) WHERE id = $1`, id, started.Seconds(), lastUsed.Seconds())
	require.NoError(f.t, err)
}

func (f *fixture) revoked(id pgtype.UUID) bool {
	f.t.Helper()
	var r bool
	require.NoError(f.t, f.pool.QueryRow(f.ctx, `SELECT revoked_at IS NOT NULL FROM sessions WHERE id = $1`, id).Scan(&r))
	return r
}

func (f *fixture) router() *chi.Mux {
	r := chi.NewRouter()
	r.Route("/admin", NewHandler(f.svc).Mount)
	return r
}

func call(r http.Handler, token, method, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: token})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestSessionLimits(t *testing.T) {
	f := setup(t)
	r := f.router()
	admin := f.withRole("admin", db.AdminRoleADMIN)

	cases := []struct {
		name             string
		started, lastUse time.Duration
		status           int
		reason           string
	}{
		{"fresh", time.Minute, 0, http.StatusOK, ""},
		{"29 minutes idle is fine", time.Hour, 29 * time.Minute, http.StatusOK, ""},
		{"31 minutes idle ends it", time.Hour, 31 * time.Minute, http.StatusUnauthorized, "idle"},
		{"11h59 after sign-in is fine", 11*time.Hour + 59*time.Minute, 0, http.StatusOK, ""},
		{"12h01 after sign-in ends it, however busy", 12*time.Hour + time.Minute, 0, http.StatusUnauthorized, "max_age"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			token, id := f.session(admin)
			f.ageSession(id, c.started, c.lastUse)
			rec := call(r, token, http.MethodGet, "/admin/me")
			require.Equal(t, c.status, rec.Code, rec.Body.String())
			if c.reason == "" {
				assert.False(t, f.revoked(id))
				return
			}
			var body struct {
				Code    string            `json:"code"`
				Details map[string]string `json:"details"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
			assert.Equal(t, "INVALID_SESSION", body.Code, "the portal shows sign-in")
			assert.Equal(t, c.reason, body.Details["reason"])
			assert.True(t, f.revoked(id), "ended, not just refused")
			// And it stays dead: the touch on the refused request mustn't
			// make the next one look fresh.
			assert.Equal(t, http.StatusUnauthorized, call(r, token, http.MethodGet, "/admin/me").Code)
		})
	}

	t.Run("a non-admin's old session isn't touched", func(t *testing.T) {
		plain := f.person("plain")
		token, id := f.session(plain)
		f.ageSession(id, 20*time.Hour, 2*time.Hour)
		rec := call(r, token, http.MethodGet, "/admin/me")
		assert.Equal(t, http.StatusForbidden, rec.Code)
		assert.Contains(t, rec.Body.String(), "NOT_ADMIN")
		assert.False(t, f.revoked(id), "their PWA session lives on")
	})

	t.Run("me says when this sign-in ends", func(t *testing.T) {
		token, id := f.session(admin)
		f.ageSession(id, 2*time.Hour, 0)
		// A normal 30-day session: the 12-hour limit comes first.
		_, err := f.pool.Exec(f.ctx, `UPDATE sessions SET expires_at = now() + interval '30 days' WHERE id = $1`, id)
		require.NoError(t, err)
		rec := call(r, token, http.MethodGet, "/admin/me")
		require.Equal(t, http.StatusOK, rec.Code)
		var me struct {
			Session struct {
				IdleMinutes int       `json:"idleMinutes"`
				MaxHours    int       `json:"maxHours"`
				StartedAt   time.Time `json:"startedAt"`
				EndsAt      time.Time `json:"endsAt"`
			} `json:"session"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &me))
		assert.Equal(t, 30, me.Session.IdleMinutes)
		assert.Equal(t, 12, me.Session.MaxHours)
		assert.WithinDuration(t, time.Now().Add(-2*time.Hour), me.Session.StartedAt, 5*time.Second)
		assert.WithinDuration(t, me.Session.StartedAt.Add(12*time.Hour), me.Session.EndsAt, time.Second)
	})

	t.Run("a session expiring sooner ends then", func(t *testing.T) {
		token, _ := f.session(admin) // expires in 1 hour (fixture)
		rec := call(r, token, http.MethodGet, "/admin/me")
		require.Equal(t, http.StatusOK, rec.Code)
		var me struct {
			Session struct {
				EndsAt time.Time `json:"endsAt"`
			} `json:"session"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &me))
		assert.WithinDuration(t, time.Now().Add(time.Hour), me.Session.EndsAt, 5*time.Second)
	})
}

func TestMySessions(t *testing.T) {
	f := setup(t)
	r := f.router()
	me := f.withRole("support", db.AdminRoleSUPPORT) // any rank manages its own
	other := f.person("other")
	token, current := f.session(me)
	_, phone := f.session(me)
	_, laptop := f.session(me)
	_, theirs := f.session(other)

	list := func() []struct {
		ID      string `json:"id"`
		Current bool   `json:"current"`
		Live    bool   `json:"live"`
	} {
		t.Helper()
		rec := call(r, token, http.MethodGet, "/admin/me/sessions")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var out []struct {
			ID      string `json:"id"`
			Current bool   `json:"current"`
			Live    bool   `json:"live"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		return out
	}

	got := list()
	require.Len(t, got, 3)
	currents := 0
	for _, s := range got {
		if s.Current {
			currents++
			assert.Equal(t, idutil.String(current), s.ID)
		}
	}
	assert.Equal(t, 1, currents)

	rec := call(r, token, http.MethodDelete, "/admin/me/sessions/"+idutil.String(current))
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "CURRENT_SESSION")

	rec = call(r, token, http.MethodDelete, "/admin/me/sessions/"+idutil.String(theirs))
	assert.Equal(t, http.StatusNotFound, rec.Code, "someone else's session")
	assert.False(t, f.revoked(theirs))

	rec = call(r, token, http.MethodDelete, "/admin/me/sessions/"+idutil.String(phone))
	require.Equal(t, http.StatusOK, rec.Code)
	assert.True(t, f.revoked(phone))

	rec = call(r, token, http.MethodPost, "/admin/me/sessions/revoke-others")
	require.Equal(t, http.StatusOK, rec.Code)
	assert.True(t, f.revoked(laptop))
	assert.False(t, f.revoked(current), "this one stays")
	assert.False(t, f.revoked(theirs))

	log := f.auditFor(me)
	require.Len(t, log, 2)
	assert.Equal(t, ActionSelfRevokeOthers, log[0].Action)
	var d map[string]any
	require.NoError(t, json.Unmarshal(log[0].Details, &d))
	assert.EqualValues(t, 1, d["sessionsEnded"], "only the laptop was still live")
	assert.Equal(t, ActionSelfRevokeSession, log[1].Action)
}
