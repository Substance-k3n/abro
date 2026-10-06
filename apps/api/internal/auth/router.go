package auth

import (
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

const oauthStateCookie = "abro_oauth_state"

type Handler struct {
	svc     *Service
	google  GoogleOAuth
	q       db.Querier
	isProd  bool
	webOrig string
}

func NewHandler(svc *Service, google GoogleOAuth, q db.Querier, isProd bool, webOrigin string) *Handler {
	return &Handler{svc: svc, google: google, q: q, isProd: isProd, webOrig: webOrigin}
}

func (h *Handler) Mount(r chi.Router) {
	r.Post("/otp/request", httpx.Wrap(h.requestOTP))
	r.Post("/otp/verify", httpx.Wrap(h.verifyOTP))
	r.Get("/google", h.googleStart)
	r.Get("/google/callback", h.googleCallback)

	r.Group(func(r chi.Router) {
		r.Use(RequireSession(h.q))
		r.Post("/logout", httpx.Wrap(h.logout))
		r.Get("/me", httpx.Wrap(h.me))
	})
}

func (h *Handler) requestOTP(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.RequestOTPInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}
	if err := h.svc.RequestOTP(r.Context(), in.Email); err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]bool{"sent": true})
	return nil
}

func (h *Handler) verifyOTP(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.VerifyOTPInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	result, err := h.svc.VerifyOTP(r.Context(), in.Email, in.Code, sessionMetaFromRequest(r))
	if err != nil {
		return err
	}
	setSessionCookie(w, result.Token, result.ExpiresAt, h.isProd)
	httpx.WriteJSON(w, http.StatusOK, apitypes.ToAuthProfile(result.Profile))
	return nil
}

func (h *Handler) googleStart(w http.ResponseWriter, r *http.Request) {
	if !h.google.IsConfigured() {
		httpx.WriteError(w, r, httpx.NewAPIError(http.StatusNotImplemented,
			"GOOGLE_OAUTH_NOT_CONFIGURED", "Google OAuth credentials are not configured on this server."))
		return
	}

	state, err := GenerateOAuthState()
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    state,
		HttpOnly: true,
		Secure:   h.isProd,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   5 * 60,
		// Explicit, so the callback's delete (also Path=/) matches it.
		// Unset, the browser scopes it to the request's directory
		// (/auth, or /api/auth behind the Vercel proxy) and the delete
		// never clears it.
		Path: "/",
	})
	http.Redirect(w, r, h.google.BuildAuthURL(state), http.StatusFound)
}

func (h *Handler) googleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	expectedCookie, _ := r.Cookie(oauthStateCookie)

	http.SetCookie(w, &http.Cookie{Name: oauthStateCookie, Value: "", MaxAge: -1, Path: "/"})

	// The user pressed Cancel on Google's consent screen: Google sends
	// ?error=access_denied and no code.
	if r.URL.Query().Get("error") == "access_denied" {
		h.redirectSignInError(w, r, "google_cancelled")
		return
	}

	if code == "" || state == "" || expectedCookie == nil || state != expectedCookie.Value {
		h.redirectSignInError(w, r, "oauth_state")
		return
	}

	// This is a browser navigation, not a fetch: a failure goes back to
	// the sign-in screen with a reason instead of rendering JSON on the
	// API's URL. The cause is still logged for whoever reads the API log.
	result, err := h.svc.SignInWithGoogle(r.Context(), code, sessionMetaFromRequest(r))
	if err != nil {
		log.Printf("ERROR %s %s: %v", r.Method, r.URL.Path, err)
		reason := "google"
		var apiErr *httpx.APIError
		if errors.As(err, &apiErr) && apiErr.Code == "GOOGLE_EMAIL_UNVERIFIED" {
			reason = "google_unverified"
		}
		h.redirectSignInError(w, r, reason)
		return
	}
	setSessionCookie(w, result.Token, result.ExpiresAt, h.isProd)
	// A redirect can't carry "is this profile new" as data, so this always
	// lands on one shared frontend page that calls GET /auth/me and routes
	// onward from AuthProfile.username -- the same rule the OTP path
	// applies client-side via apps/web/src/lib/auth-api.ts's
	// postSignInPath(), re-applied here since a server redirect can't call
	// into that TS function directly.
	http.Redirect(w, r, h.webOrig+"/auth/callback", http.StatusFound)
}

// redirectSignInError sends a failed Google sign-in back to the web app's
// sign-in screen, which maps the reason to a message
// (apps/web/src/app/auth/signin/page.tsx).
func (h *Handler) redirectSignInError(w http.ResponseWriter, r *http.Request, reason string) {
	http.Redirect(w, r, h.webOrig+"/auth/signin?error="+reason, http.StatusFound)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) error {
	cookie, err := r.Cookie(SessionCookie)
	if err == nil && cookie.Value != "" {
		if err := h.svc.RevokeSession(r.Context(), cookie.Value); err != nil {
			return err
		}
	}
	http.SetCookie(w, &http.Cookie{Name: SessionCookie, Value: "", MaxAge: -1, Path: "/"})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) error {
	httpx.WriteJSON(w, http.StatusOK, apitypes.ToAuthProfile(CurrentUser(r.Context())))
	return nil
}

func setSessionCookie(w http.ResponseWriter, token string, expiresAt time.Time, isProd bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookie,
		Value:    token,
		HttpOnly: true,
		Secure:   isProd,
		SameSite: http.SameSiteLaxMode,
		Expires:  expiresAt,
		Path:     "/",
	})
}

func sessionMetaFromRequest(r *http.Request) SessionMeta {
	return SessionMeta{UserAgent: r.UserAgent(), IPAddress: r.RemoteAddr}
}
