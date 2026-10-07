package expenses

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idempotency"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

const maxUploadMemory = 32 << 20 // 32MB in-memory buffer before spilling to temp files

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
	r.Get("/", httpx.Wrap(h.list))
	r.Get("/{id}", httpx.Wrap(h.findOne))
	r.Patch("/{id}", httpx.Wrap(h.update))
	r.Delete("/{id}", httpx.Wrap(h.remove))
	r.Get("/{id}/notes", httpx.Wrap(h.listNotes))
	r.Post("/{id}/notes", httpx.Wrap(h.addNote))
	r.Post("/{id}/receipt", httpx.Wrap(h.uploadReceipt))
	r.Get("/{id}/receipt", httpx.Wrap(h.getReceiptURL))
	r.Delete("/{id}/receipt", httpx.Wrap(h.removeReceipt))
	r.Post("/{id}/dispute", httpx.Wrap(h.dispute))
	r.Delete("/{id}/dispute", httpx.Wrap(h.withdrawDispute))
	r.Delete("/{id}/dispute/{userId}", httpx.Wrap(h.dismissDispute))
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.CreateExpenseInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	key := r.Header.Get("Idempotency-Key")

	body, err := h.idempotency.Run(r.Context(), user.ID, key, "POST /expenses", func() (any, error) {
		expense, err := h.svc.Create(r.Context(), user.ID, in)
		if err != nil {
			return nil, err
		}
		return ToAuthExpense(expense), nil
	})
	if err != nil {
		return err
	}
	httpx.WriteRawJSON(w, http.StatusCreated, body)
	return nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	q := r.URL.Query()
	query := apitypes.ListExpensesQuery{GroupID: q.Get("groupId"), FriendID: q.Get("friendId"), Search: q.Get("q")}
	if err := query.Validate(); err != nil {
		return err
	}
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v >= 1 && v <= 100 {
		query.Limit = int32(v)
	}
	if v, err := strconv.Atoi(q.Get("offset")); err == nil && v >= 0 {
		query.Offset = int32(v)
	}

	rows, err := h.svc.List(r.Context(), user.ID, query)
	if err != nil {
		return err
	}
	out := make([]apitypes.AuthExpense, len(rows))
	for i, row := range rows {
		out[i] = ToAuthExpense(row)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) findOne(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	user := authpkg.CurrentUser(r.Context())
	expense, err := h.svc.FindByID(r.Context(), user.ID, id)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, ToAuthExpense(expense))
	return nil
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	var in apitypes.CreateExpenseInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	updated, err := h.svc.Update(r.Context(), user.ID, id, in)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, ToAuthExpense(updated))
	return nil
}

func (h *Handler) remove(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	user := authpkg.CurrentUser(r.Context())
	if err := h.svc.SoftDelete(r.Context(), user.ID, id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) listNotes(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	user := authpkg.CurrentUser(r.Context())
	rows, err := h.svc.ListNotes(r.Context(), user.ID, id)
	if err != nil {
		return err
	}
	out := make([]apitypes.AuthExpenseNote, len(rows))
	for i, row := range rows {
		out[i] = toAuthExpenseNote(row)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) addNote(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	var in apitypes.AddExpenseNoteInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	note, err := h.svc.AddNote(r.Context(), user.ID, id, in.Content)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusCreated, toAuthExpenseNote(note))
	return nil
}

func (h *Handler) uploadReceipt(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	if err := r.ParseMultipartForm(maxUploadMemory); err != nil {
		return httpx.BadRequest("RECEIPT_FILE_REQUIRED", "No file uploaded.")
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return httpx.BadRequest("RECEIPT_FILE_REQUIRED", "No file uploaded.")
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	user := authpkg.CurrentUser(r.Context())
	updated, err := h.svc.UploadReceipt(r.Context(), user.ID, id, file, header.Size, contentType)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, ToAuthExpense(updated))
	return nil
}

func (h *Handler) getReceiptURL(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	user := authpkg.CurrentUser(r.Context())
	url, err := h.svc.GetReceiptURL(r.Context(), user.ID, id)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"url": url})
	return nil
}

func (h *Handler) removeReceipt(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	user := authpkg.CurrentUser(r.Context())
	if err := h.svc.DeleteReceipt(r.Context(), user.ID, id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// dispute / withdrawDispute / dismissDispute (ADR-020) answer with the
// whole expense, so the screen shows the new state straight away.
func (h *Handler) dispute(w http.ResponseWriter, r *http.Request) error {
	return h.disputeAction(w, r, h.svc.Dispute)
}

func (h *Handler) withdrawDispute(w http.ResponseWriter, r *http.Request) error {
	return h.disputeAction(w, r, h.svc.WithdrawDispute)
}

func (h *Handler) dismissDispute(w http.ResponseWriter, r *http.Request) error {
	participantID, err := idutil.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		return httpx.Conflict("NOT_DISPUTED", "There's no dispute from this person on this expense.")
	}
	return h.disputeAction(w, r, func(ctx context.Context, actorID, expenseID pgtype.UUID) (Expense, error) {
		return h.svc.DismissDispute(ctx, actorID, expenseID, participantID)
	})
}

func (h *Handler) disputeAction(w http.ResponseWriter, r *http.Request, action func(ctx context.Context, actorID, expenseID pgtype.UUID) (Expense, error)) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("EXPENSE_NOT_FOUND", "No such expense.")
	}
	user := authpkg.CurrentUser(r.Context())
	expense, err := action(r.Context(), user.ID, id)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, ToAuthExpense(expense))
	return nil
}
