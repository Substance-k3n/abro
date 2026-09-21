package users

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
	r.Get("/me", httpx.Wrap(h.me))
	r.Patch("/me", httpx.Wrap(h.updateMe))
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) error {
	httpx.WriteJSON(w, http.StatusOK, apitypes.ToAuthProfile(authpkg.CurrentUser(r.Context())))
	return nil
}

func (h *Handler) updateMe(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.UpdateProfileInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	updated, err := h.svc.UpdateProfile(r.Context(), user.ID, in)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, apitypes.ToAuthProfile(updated))
	return nil
}
