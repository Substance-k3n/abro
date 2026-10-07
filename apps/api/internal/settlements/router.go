package settlements

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idempotency"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
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
	r.Post("/received", httpx.Wrap(h.recordReceived))
	r.Get("/requests", httpx.Wrap(h.listRequests))
	r.Post("/requests/{id}/confirm", httpx.Wrap(h.resolver(h.svc.Confirm)))
	r.Post("/requests/{id}/reject", httpx.Wrap(h.resolver(h.svc.Reject)))
	r.Post("/requests/{id}/cancel", httpx.Wrap(h.resolver(h.svc.Cancel)))
	r.Post("/requests/{id}/receipt", httpx.Wrap(h.uploadReceipt))
	r.Get("/requests/{id}/receipt", httpx.Wrap(h.receiptURL))
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
		req, err := h.svc.Create(r.Context(), user.ID, in)
		if err != nil {
			return nil, err
		}
		return h.svc.ToAPI(r.Context(), req)
	})
	if err != nil {
		return err
	}
	httpx.WriteRawJSON(w, http.StatusCreated, body)
	return nil
}

func (h *Handler) recordReceived(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.RecordReceivedInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	key := r.Header.Get("Idempotency-Key")
	body, err := h.idempotency.Run(r.Context(), user.ID, key, "POST /settlements/received", func() (any, error) {
		settlement, err := h.svc.RecordReceived(r.Context(), user.ID, in)
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

func (h *Handler) listRequests(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	rows, err := h.svc.List(r.Context(), user.ID)
	if err != nil {
		return err
	}
	out, err := h.svc.ToAPIList(r.Context(), rows)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func requestIDParam(r *http.Request) (pgtype.UUID, error) {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return pgtype.UUID{}, httpx.NotFound("SETTLEMENT_REQUEST_NOT_FOUND", "No such payment.")
	}
	return id, nil
}

// resolver serves confirm / reject / cancel, which differ only in the
// service call.
func (h *Handler) resolver(action func(ctx context.Context, actorID, requestID pgtype.UUID) (db.SettlementRequest, error)) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		id, err := requestIDParam(r)
		if err != nil {
			return err
		}
		user := authpkg.CurrentUser(r.Context())
		req, err := action(r.Context(), user.ID, id)
		if err != nil {
			return err
		}
		out, err := h.svc.ToAPI(r.Context(), req)
		if err != nil {
			return err
		}
		httpx.WriteJSON(w, http.StatusOK, out)
		return nil
	}
}

func (h *Handler) uploadReceipt(w http.ResponseWriter, r *http.Request) error {
	id, err := requestIDParam(r)
	if err != nil {
		return err
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return httpx.BadRequest("RECEIPT_FILE_REQUIRED", "No file uploaded.")
	}
	defer file.Close()

	user := authpkg.CurrentUser(r.Context())
	req, err := h.svc.UploadReceipt(r.Context(), user.ID, id, file, header.Size)
	if err != nil {
		return err
	}
	out, err := h.svc.ToAPI(r.Context(), req)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) receiptURL(w http.ResponseWriter, r *http.Request) error {
	id, err := requestIDParam(r)
	if err != nil {
		return err
	}
	user := authpkg.CurrentUser(r.Context())
	url, err := h.svc.ReceiptURL(r.Context(), user.ID, id)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"url": url})
	return nil
}
