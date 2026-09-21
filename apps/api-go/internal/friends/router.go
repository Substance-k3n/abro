package friends

import (
	"net/http"

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
	r.Get("/search", httpx.Wrap(h.search))
	r.Get("/", httpx.Wrap(h.list))
	r.Get("/requests", httpx.Wrap(h.incomingRequests))
	r.Post("/requests", httpx.Wrap(h.sendRequest))
	r.Post("/requests/{id}/accept", httpx.Wrap(h.acceptRequest))
	r.Delete("/requests/{id}", httpx.Wrap(h.declineRequest))
	r.Delete("/{id}", httpx.Wrap(h.unfriend))
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) error {
	in := apitypes.SearchFriendInput{Query: r.URL.Query().Get("query")}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	results, err := h.svc.Search(r.Context(), in.Query, user.ID)
	if err != nil {
		return err
	}

	out := make([]apitypes.AuthProfile, len(results))
	for i, p := range results {
		out[i] = apitypes.ToAuthProfile(p)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	rows, err := h.svc.List(r.Context(), user.ID)
	if err != nil {
		return err
	}

	out := make([]apitypes.FriendListItem, len(rows))
	for i, row := range rows {
		var friend apitypes.AuthProfile
		if row.UserID == user.ID {
			friend = apitypes.AuthProfile{
				ID:                idutil.String(row.FriendID),
				DisplayName:       row.FriendDisplayName,
				PreferredCurrency: row.FriendPreferredCurrency,
				Locale:            row.FriendLocale,
			}
			if row.FriendAvatarUrl.Valid {
				friend.AvatarURL = &row.FriendAvatarUrl.String
			}
			if row.FriendEmail.Valid {
				friend.Email = &row.FriendEmail.String
			}
		} else {
			friend = apitypes.AuthProfile{
				ID:                idutil.String(row.UserID),
				DisplayName:       row.UserDisplayName,
				PreferredCurrency: row.UserPreferredCurrency,
				Locale:            row.UserLocale,
			}
			if row.UserAvatarUrl.Valid {
				friend.AvatarURL = &row.UserAvatarUrl.String
			}
			if row.UserEmail.Valid {
				friend.Email = &row.UserEmail.String
			}
		}

		out[i] = apitypes.FriendListItem{
			FriendshipID: idutil.String(row.FriendshipID),
			Since:        row.Since.Time,
			Friend:       friend,
		}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) incomingRequests(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	rows, err := h.svc.ListIncomingRequests(r.Context(), user.ID)
	if err != nil {
		return err
	}

	out := make([]apitypes.IncomingFriendRequestItem, len(rows))
	for i, row := range rows {
		from := apitypes.AuthProfile{
			ID:                idutil.String(row.FromID),
			DisplayName:       row.FromDisplayName,
			PreferredCurrency: row.FromPreferredCurrency,
			Locale:            row.FromLocale,
		}
		if row.FromAvatarUrl.Valid {
			from.AvatarURL = &row.FromAvatarUrl.String
		}
		if row.FromEmail.Valid {
			from.Email = &row.FromEmail.String
		}
		out[i] = apitypes.IncomingFriendRequestItem{
			FriendshipID: idutil.String(row.FriendshipID),
			SentAt:       row.SentAt.Time,
			From:         from,
		}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) sendRequest(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.SendFriendRequestInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	friendship, err := h.svc.SendRequest(r.Context(), user.ID, in.FriendID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusCreated, apitypes.FriendRequestResult{
		FriendshipID: idutil.String(friendship.ID),
		Status:       string(friendship.Status),
	})
	return nil
}

func (h *Handler) acceptRequest(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	friendship, err := h.svc.AcceptRequest(r.Context(), user.ID, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, apitypes.FriendRequestResult{
		FriendshipID: idutil.String(friendship.ID),
		Status:       string(friendship.Status),
	})
	return nil
}

func (h *Handler) declineRequest(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	if err := h.svc.DeclineRequest(r.Context(), user.ID, chi.URLParam(r, "id")); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) unfriend(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	if err := h.svc.Unfriend(r.Context(), user.ID, chi.URLParam(r, "id")); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
