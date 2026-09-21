package groups

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
	r.Get("/invites", httpx.Wrap(h.listInvites))
	r.Get("/{id}", httpx.Wrap(h.findOne))
	r.Patch("/{id}", httpx.Wrap(h.update))
	r.Post("/{id}/members", httpx.Wrap(h.addMember))
	r.Post("/{id}/invite/accept", httpx.Wrap(h.acceptInvite))
	r.Patch("/{id}/members/{userId}", httpx.Wrap(h.updateMemberRole))
	r.Delete("/{id}/members/{userId}", httpx.Wrap(h.removeMember))
}

func parseIDParam(r *http.Request, name string) (pgtype.UUID, error) {
	id, err := idutil.Parse(chi.URLParam(r, name))
	if err != nil {
		return pgtype.UUID{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	return id, nil
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.CreateGroupInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	group, err := h.svc.Create(r.Context(), user.ID, in)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusCreated, toAuthGroup(group))
	return nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	rows, err := h.svc.ListMine(r.Context(), user.ID)
	if err != nil {
		return err
	}
	out := make([]apitypes.AuthGroup, len(rows))
	for i, row := range rows {
		out[i] = toAuthGroupRow(row)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) listInvites(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	rows, err := h.svc.ListMyInvites(r.Context(), user.ID)
	if err != nil {
		return err
	}
	out := make([]apitypes.GroupInvite, len(rows))
	for i, row := range rows {
		out[i] = apitypes.GroupInvite{
			Group: toAuthGroupRow(db.Group{
				ID: row.ID, Name: row.Name, Type: row.Type, Currency: row.Currency,
				Description: row.Description, SimplifyDebts: row.SimplifyDebts,
				CreatedByID: row.CreatedByID, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
			}),
			InvitedAt: row.InvitedAt.Time,
		}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) findOne(w http.ResponseWriter, r *http.Request) error {
	groupID, err := parseIDParam(r, "id")
	if err != nil {
		return err
	}
	user := authpkg.CurrentUser(r.Context())
	group, err := h.svc.FindByID(r.Context(), user.ID, groupID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, toAuthGroup(group))
	return nil
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) error {
	groupID, err := parseIDParam(r, "id")
	if err != nil {
		return err
	}
	var in apitypes.UpdateGroupInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	updated, err := h.svc.Update(r.Context(), user.ID, groupID, in)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, toAuthGroupRow(updated))
	return nil
}

func (h *Handler) addMember(w http.ResponseWriter, r *http.Request) error {
	groupID, err := parseIDParam(r, "id")
	if err != nil {
		return err
	}
	var in apitypes.AddGroupMemberInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}
	targetUserID, err := idutil.Parse(in.UserID)
	if err != nil {
		return httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	}

	user := authpkg.CurrentUser(r.Context())
	membership, err := h.svc.AddMember(r.Context(), user.ID, groupID, targetUserID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, toMembershipResult(membership))
	return nil
}

func (h *Handler) acceptInvite(w http.ResponseWriter, r *http.Request) error {
	groupID, err := parseIDParam(r, "id")
	if err != nil {
		return err
	}
	user := authpkg.CurrentUser(r.Context())
	membership, err := h.svc.AcceptInvite(r.Context(), user.ID, groupID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, toMembershipResult(membership))
	return nil
}

func (h *Handler) updateMemberRole(w http.ResponseWriter, r *http.Request) error {
	groupID, err := parseIDParam(r, "id")
	if err != nil {
		return err
	}
	targetUserID, err := idutil.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		return httpx.NotFound("MEMBERSHIP_NOT_FOUND", "No membership record found.")
	}
	var in apitypes.UpdateGroupMemberRoleInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}

	user := authpkg.CurrentUser(r.Context())
	membership, err := h.svc.UpdateMemberRole(r.Context(), user.ID, groupID, targetUserID, in.Role)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, toMembershipResult(membership))
	return nil
}

func (h *Handler) removeMember(w http.ResponseWriter, r *http.Request) error {
	groupID, err := parseIDParam(r, "id")
	if err != nil {
		return err
	}
	targetUserID, err := idutil.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		return httpx.NotFound("MEMBERSHIP_NOT_FOUND", "No membership record found.")
	}

	user := authpkg.CurrentUser(r.Context())
	if err := h.svc.RemoveMember(r.Context(), user.ID, groupID, targetUserID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func toMembershipResult(m db.GroupMember) apitypes.GroupMembershipResult {
	return apitypes.GroupMembershipResult{
		ID: idutil.String(m.ID), GroupID: idutil.String(m.GroupID), UserID: idutil.String(m.UserID),
		Role: string(m.Role), Status: string(m.Status),
	}
}

func toAuthGroupRow(g db.Group) apitypes.AuthGroup {
	out := apitypes.AuthGroup{
		ID: idutil.String(g.ID), Name: g.Name, Type: string(g.Type), Currency: g.Currency,
		SimplifyDebts: g.SimplifyDebts, CreatedByID: idutil.String(g.CreatedByID),
		CreatedAt: g.CreatedAt.Time, UpdatedAt: g.UpdatedAt.Time, Members: []apitypes.GroupMember{},
	}
	if g.Description.Valid {
		out.Description = &g.Description.String
	}
	return out
}

func toAuthGroup(g Group) apitypes.AuthGroup {
	out := toAuthGroupRow(g.Group)
	out.Members = make([]apitypes.GroupMember, len(g.Members))
	for i, m := range g.Members {
		user := apitypes.AuthProfile{
			ID: idutil.String(m.UserID), DisplayName: m.DisplayName,
			PreferredCurrency: m.PreferredCurrency, Locale: m.Locale,
		}
		if m.AvatarUrl.Valid {
			user.AvatarURL = &m.AvatarUrl.String
		}
		if m.Email.Valid {
			user.Email = &m.Email.String
		}
		out.Members[i] = apitypes.GroupMember{
			ID: idutil.String(m.ID), UserID: idutil.String(m.UserID), Role: string(m.Role),
			Status: string(m.Status), JoinedAt: m.JoinedAt.Time, User: user,
		}
	}
	return out
}
