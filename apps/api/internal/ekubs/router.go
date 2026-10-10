package ekubs

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

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
	r.Post("/", httpx.Wrap(h.create))
	r.Get("/", httpx.Wrap(h.list))
	r.Get("/{id}", httpx.Wrap(h.detail))
	r.Delete("/{id}", httpx.Wrap(h.remove))
	r.Put("/{id}/slots", httpx.Wrap(h.updateSlots))
	r.Post("/{id}/start", httpx.Wrap(h.start))
	r.Post("/{id}/members", httpx.Wrap(h.addMember))
	r.Delete("/{id}/members/{memberId}", httpx.Wrap(h.removeMember))
	r.Post("/{id}/accept", httpx.Wrap(h.accept))
	r.Post("/{id}/leave", httpx.Wrap(h.leave))
	r.Post("/{id}/payments", httpx.Wrap(h.recordPayment))
	r.Post("/{id}/payments/{paymentId}/confirm", httpx.Wrap(h.resolvePayment(true)))
	r.Post("/{id}/payments/{paymentId}/reject", httpx.Wrap(h.resolvePayment(false)))
}

func param(r *http.Request, name string) (pgtype.UUID, error) {
	id, err := idutil.Parse(chi.URLParam(r, name))
	if err != nil {
		return pgtype.UUID{}, errNotFound
	}
	return id, nil
}

type validator interface{ Validate() error }

func decode(r *http.Request, in validator) error {
	if err := httpx.DecodeJSON(r, in); err != nil {
		return err
	}
	return in.Validate()
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.CreateEkubInput
	if err := decode(r, &in); err != nil {
		return err
	}
	out, err := h.svc.Create(r.Context(), authpkg.CurrentUser(r.Context()).ID, in)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusCreated, out)
	return nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	out, err := h.svc.List(r.Context(), authpkg.CurrentUser(r.Context()).ID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

// withEkub runs fn for the {id} in the path and writes the detail it
// returns.
func (h *Handler) withEkub(w http.ResponseWriter, r *http.Request,
	fn func(userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error)) error {
	ekubID, err := param(r, "id")
	if err != nil {
		return err
	}
	out, err := fn(authpkg.CurrentUser(r.Context()).ID, ekubID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) detail(w http.ResponseWriter, r *http.Request) error {
	return h.withEkub(w, r, func(userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
		return h.svc.Detail(r.Context(), userID, ekubID)
	})
}

func (h *Handler) remove(w http.ResponseWriter, r *http.Request) error {
	ekubID, err := param(r, "id")
	if err != nil {
		return err
	}
	if err := h.svc.Delete(r.Context(), authpkg.CurrentUser(r.Context()).ID, ekubID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) updateSlots(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.UpdateEkubSlotsInput
	if err := decode(r, &in); err != nil {
		return err
	}
	return h.withEkub(w, r, func(userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
		return h.svc.UpdateSlots(r.Context(), userID, ekubID, in)
	})
}

func (h *Handler) start(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.StartEkubInput
	if err := decode(r, &in); err != nil {
		return err
	}
	return h.withEkub(w, r, func(userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
		return h.svc.Start(r.Context(), userID, ekubID, in)
	})
}

func (h *Handler) addMember(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.AddEkubMemberInput
	if err := decode(r, &in); err != nil {
		return err
	}
	return h.withEkub(w, r, func(userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
		return h.svc.AddMember(r.Context(), userID, ekubID, in)
	})
}

func (h *Handler) removeMember(w http.ResponseWriter, r *http.Request) error {
	memberID, err := idutil.Parse(chi.URLParam(r, "memberId"))
	if err != nil {
		return httpx.NotFound("MEMBER_NOT_FOUND", "No such member.")
	}
	return h.withEkub(w, r, func(userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
		return h.svc.RemoveMember(r.Context(), userID, ekubID, memberID)
	})
}

func (h *Handler) accept(w http.ResponseWriter, r *http.Request) error {
	return h.withEkub(w, r, func(userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
		return h.svc.Accept(r.Context(), userID, ekubID)
	})
}

func (h *Handler) leave(w http.ResponseWriter, r *http.Request) error {
	ekubID, err := param(r, "id")
	if err != nil {
		return err
	}
	if err := h.svc.Leave(r.Context(), authpkg.CurrentUser(r.Context()).ID, ekubID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) recordPayment(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.RecordEkubPaymentInput
	if err := decode(r, &in); err != nil {
		return err
	}
	return h.withEkub(w, r, func(userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
		return h.svc.RecordPayment(r.Context(), userID, ekubID, in)
	})
}

func (h *Handler) resolvePayment(confirm bool) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		paymentID, err := idutil.Parse(chi.URLParam(r, "paymentId"))
		if err != nil {
			return httpx.NotFound("PAYMENT_NOT_FOUND", "No such payment.")
		}
		return h.withEkub(w, r, func(userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
			return h.svc.ResolvePayment(r.Context(), userID, ekubID, paymentID, confirm)
		})
	}
}
