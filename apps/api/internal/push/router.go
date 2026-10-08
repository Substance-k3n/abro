package push

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

type Handler struct {
	svc *Service
	q   db.Querier
}

func NewHandler(svc *Service, q db.Querier) *Handler {
	return &Handler{svc: svc, q: q}
}

func (h *Handler) Mount(r chi.Router) {
	r.Use(authpkg.RequireSession(h.q))
	r.Get("/public-key", httpx.Wrap(h.publicKey))
	r.Post("/subscriptions", httpx.Wrap(h.subscribe))
	r.Delete("/subscriptions", httpx.Wrap(h.unsubscribe))
}

func notConfigured() error {
	return httpx.NewAPIError(http.StatusNotImplemented, "PUSH_NOT_CONFIGURED", "Phone notifications aren't set up on this server.")
}

// publicKey: GET /push/public-key -> {"publicKey": "<VAPID key>"}, which
// the browser needs to subscribe. 501 when push isn't configured, so the
// app knows to hide the switch.
func (h *Handler) publicKey(w http.ResponseWriter, _ *http.Request) error {
	if !h.svc.IsConfigured() {
		return notConfigured()
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"publicKey": h.svc.PublicKey()})
	return nil
}

// subscribe: POST /push/subscriptions with the browser's
// PushSubscription JSON. Re-sending the same one is harmless.
func (h *Handler) subscribe(w http.ResponseWriter, r *http.Request) error {
	if !h.svc.IsConfigured() {
		return notConfigured()
	}
	var in apitypes.PushSubscriptionInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}
	user := authpkg.CurrentUser(r.Context())
	if err := h.svc.Subscribe(r.Context(), user.ID, in.Endpoint, Keys{P256dh: in.Keys.P256dh, Auth: in.Keys.Auth}); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// unsubscribe: DELETE /push/subscriptions with {"endpoint": ...} -- the
// switch turned off, or signing out on this device.
func (h *Handler) unsubscribe(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.PushUnsubscribeInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}
	user := authpkg.CurrentUser(r.Context())
	if err := h.svc.Unsubscribe(r.Context(), user.ID, in.Endpoint); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
