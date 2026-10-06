package recurring

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
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
	r.Post("/", httpx.Wrap(h.create))
	r.Get("/", httpx.Wrap(h.list))
	r.Patch("/{id}/enabled", httpx.Wrap(h.setEnabled))
	r.Post("/generate-due", httpx.Wrap(h.generateDue))
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.CreateRecurringExpenseInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	recurring, err := h.svc.Create(r.Context(), user.ID, in)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusCreated, toAPIType(recurring))
	return nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	rows, err := h.svc.ListMine(r.Context(), user.ID)
	if err != nil {
		return err
	}
	out := make([]apitypes.RecurringExpense, len(rows))
	for i, row := range rows {
		out[i] = toAPIType(row)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) setEnabled(w http.ResponseWriter, r *http.Request) error {
	recurringID, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("RECURRING_EXPENSE_NOT_FOUND", "No such recurring expense.")
	}
	var in apitypes.SetRecurringEnabledInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	updated, err := h.svc.SetEnabled(r.Context(), user.ID, recurringID, in.Enabled)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, toAPIType(updated))
	return nil
}

// generateDue is a manual/external trigger for MVP -- see the Service doc
// comment and ADR-005. Any authenticated user can call this today (it
// only ever generates what's genuinely due, so it's harmless, not a
// privilege issue) -- a known limitation, not a production-ready cron
// replacement.
func (h *Handler) generateDue(w http.ResponseWriter, r *http.Request) error {
	generated, err := h.svc.GenerateDue(r.Context(), time.Now())
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, apitypes.GenerateDueResult{Generated: generated})
	return nil
}

func toAPIType(r RecurringExpense) apitypes.RecurringExpense {
	return apitypes.RecurringExpense{
		ID: idutil.String(r.ID), Frequency: string(r.Frequency), NextRunAt: r.NextRunAt.Time,
		Enabled: r.Enabled, CreatedAt: r.CreatedAt.Time, UpdatedAt: r.UpdatedAt.Time,
		TemplateExpense: expenses.ToAuthExpense(r.Template),
	}
}
