package analytics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

type Handler struct {
	svc    *Service
	groups *groups.Service
	q      db.Querier
}

func NewHandler(svc *Service, groupsSvc *groups.Service, q db.Querier) *Handler {
	return &Handler{svc: svc, groups: groupsSvc, q: q}
}

func (h *Handler) Mount(r chi.Router) {
	r.Use(authpkg.RequireSession(h.q))
	r.Get("/monthly", httpx.Wrap(h.monthly))
	r.Get("/yearly", httpx.Wrap(h.yearly))
	r.Get("/groups/{groupId}", httpx.Wrap(h.groupStats))
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

// groupStats is open to every active member, not only admins: members can
// already see each of the group's expenses, so the totals reveal nothing
// new. The admin dashboard is where the web app shows them.
func (h *Handler) groupStats(w http.ResponseWriter, r *http.Request) error {
	groupID, err := idutil.Parse(chi.URLParam(r, "groupId"))
	if err != nil {
		return httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	user := authpkg.CurrentUser(r.Context())
	if _, err := h.groups.RequireActiveMembership(r.Context(), groupID, user.ID); err != nil {
		return err
	}

	result, err := h.svc.GetGroupStats(r.Context(), groupID, time.Now())
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, result)
	return nil
}
