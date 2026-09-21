package notifications

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
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
	r.Get("/", httpx.Wrap(h.list))
	r.Patch("/read-all", httpx.Wrap(h.markAllRead))
	r.Patch("/{id}/read", httpx.Wrap(h.markRead))
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	q := r.URL.Query()

	unreadOnly := q.Get("unreadOnly") == "true"
	limit := int32(50)
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v >= 1 && v <= 100 {
		limit = int32(v)
	}
	var offset int32
	if v, err := strconv.Atoi(q.Get("offset")); err == nil && v >= 0 {
		offset = int32(v)
	}

	rows, err := h.svc.List(r.Context(), user.ID, unreadOnly, limit, offset)
	if err != nil {
		return err
	}
	out := make([]apitypes.Notification, len(rows))
	for i, row := range rows {
		out[i] = apitypes.ToNotification(row)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) markAllRead(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	if err := h.svc.MarkAllRead(r.Context(), user.ID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	notificationID, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("NOTIFICATION_NOT_FOUND", "No such notification.")
	}

	notification, err := h.svc.MarkRead(r.Context(), user.ID, notificationID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, apitypes.ToNotification(notification))
	return nil
}
