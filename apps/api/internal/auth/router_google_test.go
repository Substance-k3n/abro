package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

// stubGoogle answers ExchangeCode with a fixed profile or error. Every
// case below fails before the service touches the database, so these run
// without one (the success path is covered in service_integration_test.go).
type stubGoogle struct {
	profile GoogleProfile
	err     error
}

func (stubGoogle) IsConfigured() bool { return true }
func (stubGoogle) BuildAuthURL(state string) string {
	return "https://accounts.google.test/auth?state=" + state
}
func (s stubGoogle) ExchangeCode(string) (GoogleProfile, error) { return s.profile, s.err }

const testWebOrigin = "https://web.abro.test"

func googleRouter(g GoogleOAuth) http.Handler {
	h := NewHandler(NewService(nil, g, ConsoleOTPMailer{}, 30), g, nil, true, testWebOrigin)
	r := chi.NewRouter()
	r.Route("/auth", h.Mount)
	return r
}

// callback calls /auth/google/callback with the given query and, when
// cookieState is set, the matching state cookie.
func callback(t *testing.T, g GoogleOAuth, query, cookieState string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/auth/google/callback?"+query, nil)
	if cookieState != "" {
		req.AddCookie(&http.Cookie{Name: oauthStateCookie, Value: cookieState})
	}
	rec := httptest.NewRecorder()
	googleRouter(g).ServeHTTP(rec, req)
	return rec
}

func TestGoogleStart_StateCookieIsSiteWide(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/auth/google", nil)
	rec := httptest.NewRecorder()
	googleRouter(stubGoogle{}).ServeHTTP(rec, req)

	require.Equal(t, http.StatusFound, rec.Code)
	cookies := rec.Result().Cookies()
	require.Len(t, cookies, 1)
	assert.Equal(t, oauthStateCookie, cookies[0].Name)
	assert.Equal(t, "/", cookies[0].Path)
	assert.Contains(t, rec.Header().Get("Location"), "state="+cookies[0].Value)
}

func TestGoogleCallback_FailuresRedirectToSignIn(t *testing.T) {
	unverified := false

	cases := []struct {
		name        string
		google      stubGoogle
		query       string
		cookieState string
		wantReason  string
	}{
		{
			name:       "user cancelled on Google's screen",
			query:      "error=access_denied&state=abc",
			wantReason: "google_cancelled",
		},
		{
			name:       "no state cookie",
			query:      "code=c&state=abc",
			wantReason: "oauth_state",
		},
		{
			name:        "state mismatch",
			query:       "code=c&state=abc",
			cookieState: "xyz",
			wantReason:  "oauth_state",
		},
		{
			name:        "code exchange fails",
			google:      stubGoogle{err: httpx.Internal("GOOGLE_TOKEN_EXCHANGE_FAILED", "Could not complete Google sign-in.")},
			query:       "code=c&state=abc",
			cookieState: "abc",
			wantReason:  "google",
		},
		{
			name:        "Google email not verified",
			google:      stubGoogle{profile: GoogleProfile{Sub: "1", Email: "a@b.test", EmailVerified: &unverified}},
			query:       "code=c&state=abc",
			cookieState: "abc",
			wantReason:  "google_unverified",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := callback(t, tc.google, tc.query, tc.cookieState)

			assert.Equal(t, http.StatusFound, rec.Code)
			assert.Equal(t, testWebOrigin+"/auth/signin?error="+tc.wantReason, rec.Header().Get("Location"))
			for _, c := range rec.Result().Cookies() {
				assert.NotEqual(t, SessionCookie, c.Name, "a failed sign-in must not set a session")
			}
		})
	}
}
