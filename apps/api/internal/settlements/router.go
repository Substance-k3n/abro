package settlements

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idempotency"
)

type Handler struct {
	svc         *Service
	idempotency *idempotency.Service
	q           db.Querier
}

func NewHandler(svc *Service, idempotencySvc *idempotency.Service, q db.Querier) *Handler {
	return &Handler{svc: svc, idempotency: idempotencySvc, q: q}
}

func (h *Handler) Mount(r chi.Router) {
	r.Use(authpkg.RequireSession(h.q))
	r.Post("/", httpx.Wrap(h.create))
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.CreateSettlementInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	key := r.Header.Get("Idempotency-Key")

	body, err := h.idempotency.Run(r.Context(), user.ID, key, "POST /settlements", func() (any, error) {
		settlement, err := h.svc.Create(r.Context(), user.ID, in)
		if err != nil {
			return nil, err
		}
		return expenses.ToAuthExpense(settlement), nil
	})
	if err != nil {
		return err
	}
	httpx.WriteRawJSON(w, http.StatusCreated, body)
	return nil
}
