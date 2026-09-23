package auth

import (
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
	})
	http.Redirect(w, r, h.google.BuildAuthURL(state), http.StatusFound)
}

func (h *Handler) googleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	expectedCookie, _ := r.Cookie(oauthStateCookie)

	http.SetCookie(w, &http.Cookie{Name: oauthStateCookie, Value: "", MaxAge: -1, Path: "/"})

	if code == "" || state == "" || expectedCookie == nil || state != expectedCookie.Value {
		http.Redirect(w, r, h.webOrig+"/auth/signin?error=oauth_state", http.StatusFound)
		return
	}

	result, err := h.svc.SignInWithGoogle(r.Context(), code, sessionMetaFromRequest(r))
	if err != nil {
		httpx.WriteError(w, r, err)
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
