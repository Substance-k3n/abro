package balances

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
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
	r.Get("/summary", httpx.Wrap(h.summary))
	r.Get("/friends/{friendId}", httpx.Wrap(h.friendBalance))
	r.Get("/groups/{groupId}", httpx.Wrap(h.groupSummary))
	r.Get("/groups/{groupId}/simplified", httpx.Wrap(h.simplifiedGroupDebts))
}

func (h *Handler) summary(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	friendBalances, groupBalances, err := h.svc.GetSummary(r.Context(), user.ID)
	if err != nil {
		return err
	}

	out := apitypes.BalancesSummary{
		Friends: make([]apitypes.FriendBalance, len(friendBalances)),
		Groups:  make([]apitypes.GroupBalance, len(groupBalances)),
	}
	for i, f := range friendBalances {
		out.Friends[i] = apitypes.FriendBalance{
			FriendID:   idutil.String(f.FriendID),
			NetBalance: strconv.FormatInt(f.NetBalance, 10),
		}
	}
	for i, g := range groupBalances {
		out.Groups[i] = apitypes.GroupBalance{
			GroupID:    idutil.String(g.GroupID),
			NetBalance: strconv.FormatInt(g.NetBalance, 10),
		}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) friendBalance(w http.ResponseWriter, r *http.Request) error {
	friendIDRaw := chi.URLParam(r, "friendId")
	friendID, err := idutil.Parse(friendIDRaw)
	if err != nil {
		return httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	}

	user := authpkg.CurrentUser(r.Context())
	balance, err := h.svc.GetPairwiseBalance(r.Context(), user.ID, friendID, pgtype.UUID{})
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, apitypes.FriendBalance{FriendID: friendIDRaw, NetBalance: strconv.FormatInt(balance, 10)})
	return nil
}

func (h *Handler) groupSummary(w http.ResponseWriter, r *http.Request) error {
	groupID, err := idutil.Parse(chi.URLParam(r, "groupId"))
	if err != nil {
		return httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	user := authpkg.CurrentUser(r.Context())
	if _, err := h.groups.RequireActiveMembership(r.Context(), groupID, user.ID); err != nil {
		return err
	}

	summary, err := h.svc.GetGroupSummary(r.Context(), groupID)
	if err != nil {
		return err
	}
	out := make([]apitypes.GroupBalanceEntry, len(summary))
	for i, s := range summary {
		out[i] = apitypes.GroupBalanceEntry{UserID: s.UserID, NetBalance: strconv.FormatInt(s.NetBalance, 10)}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) simplifiedGroupDebts(w http.ResponseWriter, r *http.Request) error {
	groupID, err := idutil.Parse(chi.URLParam(r, "groupId"))
	if err != nil {
		return httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	user := authpkg.CurrentUser(r.Context())
	if _, err := h.groups.RequireActiveMembership(r.Context(), groupID, user.ID); err != nil {
		return err
	}

	transactions, err := h.svc.GetSimplifiedGroupDebts(r.Context(), groupID)
	if err != nil {
		return err
	}
	out := make([]apitypes.SimplifiedTransaction, len(transactions))
	for i, t := range transactions {
		out[i] = apitypes.SimplifiedTransaction{FromUserID: t.FromUserID, ToUserID: t.ToUserID, Amount: strconv.FormatInt(t.Amount, 10)}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}
