package analytics

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

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
	r.Get("/monthly", httpx.Wrap(h.monthly))
	r.Get("/yearly", httpx.Wrap(h.yearly))
}

func parseYear(raw string) (int, bool) {
	year, err := strconv.Atoi(raw)
	return year, err == nil && year >= 2000 && year <= 2100
}

func (h *Handler) monthly(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	year, ok := parseYear(q.Get("year"))
	if !ok {
		return httpx.BadRequest("VALIDATION_ERROR", "year must be between 2000 and 2100")
	}
	month, err := strconv.Atoi(q.Get("month"))
	if err != nil || month < 1 || month > 12 {
		return httpx.BadRequest("VALIDATION_ERROR", "month must be between 1 and 12")
	}

	user := authpkg.CurrentUser(r.Context())
	result, err := h.svc.GetMonthly(r.Context(), user.ID, year, month)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, result)
	return nil
}

func (h *Handler) yearly(w http.ResponseWriter, r *http.Request) error {
	year, ok := parseYear(r.URL.Query().Get("year"))
	if !ok {
		return httpx.BadRequest("VALIDATION_ERROR", "year must be between 2000 and 2100")
	}

	user := authpkg.CurrentUser(r.Context())
	result, err := h.svc.GetYearly(r.Context(), user.ID, year)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, result)
	return nil
}
