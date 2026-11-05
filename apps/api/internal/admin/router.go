package admin

import (
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// Mount: everything under /admin needs a signed-in admin, and each route
// its own permission on top (roles.go).
func (h *Handler) Mount(r chi.Router) {
	r.Use(h.svc.RequireAdmin)
	r.Get("/me", httpx.Wrap(h.me))
	// Your own sessions (security.go): any admin, about themselves only.
	r.Get("/me/sessions", httpx.Wrap(h.mySessions))
	r.Post("/me/sessions/revoke-others", httpx.Wrap(h.endMyOtherSessions))
	r.Delete("/me/sessions/{sessionId}", httpx.Wrap(h.endMySession))

	r.Get("/users", need(PermUsersView, h.listUsers))
	r.Get("/users/{id}", need(PermUsersView, h.getUser))
	r.Post("/users/{id}/suspend", need(PermUsersSuspend, h.suspend))
	r.Post("/users/{id}/unsuspend", need(PermUsersSuspend, h.unsuspend))
	r.Post("/users/{id}/sessions/revoke", need(PermSessions, h.revokeAll))
	r.Delete("/users/{id}/sessions/{sessionId}", need(PermSessions, h.revokeSession))

	r.Get("/admins", need(PermAdminsView, h.listAdmins))
	r.Put("/admins/{id}", need(PermAdminsManage, h.setRole))
	r.Delete("/admins/{id}", need(PermAdminsManage, h.removeRole))

	r.Get("/audit", need(PermAuditView, h.listAudit))

	r.Get("/overview", need(PermOverview, h.overview))
	r.Get("/groups", need(PermGroupsView, h.listGroups))
	r.Get("/groups/{id}", need(PermGroupsView, h.getGroup))

	r.Get("/voice", need(PermOverview, h.voice))
	r.Put("/voice/mode", need(PermVoiceManage, h.setVoiceMode))
	r.Put("/users/{id}/voice", need(PermVoiceManage, h.grantVoice))
	r.Delete("/users/{id}/voice", need(PermVoiceManage, h.revokeVoice))
}

// clientIP is the caller's address for the audit log (RealIP has already
// applied X-Forwarded-For), without the port.
func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func pathID(r *http.Request, name string) (pgtype.UUID, error) {
	id, err := idutil.Parse(chi.URLParam(r, name))
	if err != nil {
		return pgtype.UUID{}, httpx.NotFound("USER_NOT_FOUND", "No such user.")
	}
	return id, nil
}

func queryID(r *http.Request, name string) (pgtype.UUID, error) {
	v := r.URL.Query().Get(name)
	if v == "" {
		return pgtype.UUID{}, nil
	}
	id, err := idutil.Parse(v)
	if err != nil {
		return pgtype.UUID{}, httpx.BadRequest("INVALID_ID", name+" must be a user id.")
	}
	return id, nil
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) error {
	a := CurrentAdmin(r.Context())
	httpx.WriteJSON(w, http.StatusOK, apitypes.AdminMe{
		Profile:     apitypes.ToAuthProfile(a.Profile),
		Role:        string(a.Role),
		Owner:       a.Owner,
		Permissions: a.Permissions(),
		Session: apitypes.AdminSessionPolicy{
			IdleMinutes: int(AdminIdleLimit / time.Minute),
			MaxHours:    int(AdminMaxAge / time.Hour),
			StartedAt:   authpkg.CurrentSession(r.Context()).CreatedAt.Time,
			EndsAt:      SessionEndsAt(authpkg.CurrentSession(r.Context())),
		},
	})
	return nil
}

func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	out, err := h.svc.ListUsers(r.Context(), q.Get("q"), q.Get("status"), page)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) getUser(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	out, err := h.svc.GetUser(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

// afterAction answers an action with the person's fresh detail, so the
// portal shows the new state without another request.
func (h *Handler) afterAction(w http.ResponseWriter, r *http.Request, id pgtype.UUID) error {
	out, err := h.svc.GetUser(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) suspend(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	var in apitypes.SuspendUserInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}
	if err := h.svc.Suspend(r.Context(), CurrentAdmin(r.Context()), id, in.Reason, clientIP(r)); err != nil {
		return err
	}
	return h.afterAction(w, r, id)
}

func (h *Handler) unsuspend(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if err := h.svc.Unsuspend(r.Context(), CurrentAdmin(r.Context()), id, clientIP(r)); err != nil {
		return err
	}
	return h.afterAction(w, r, id)
}

func (h *Handler) revokeAll(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if _, err := h.svc.RevokeAllSessions(r.Context(), CurrentAdmin(r.Context()), id, clientIP(r)); err != nil {
		return err
	}
	return h.afterAction(w, r, id)
}

func (h *Handler) revokeSession(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	sessionID, err := idutil.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		return httpx.NotFound("SESSION_NOT_FOUND", "That session has already ended.")
	}
	if err := h.svc.RevokeSession(r.Context(), CurrentAdmin(r.Context()), id, sessionID, clientIP(r)); err != nil {
		return err
	}
	return h.afterAction(w, r, id)
}

func (h *Handler) listAdmins(w http.ResponseWriter, r *http.Request) error {
	out, err := h.svc.ListAdmins(r.Context())
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) setRole(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	var in apitypes.SetAdminRoleInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := in.Validate(); err != nil {
		return err
	}
	if err := h.svc.SetRole(r.Context(), CurrentAdmin(r.Context()), id, db.AdminRole(in.Role), clientIP(r)); err != nil {
		return err
	}
	return h.listAdmins(w, r)
}

func (h *Handler) removeRole(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if err := h.svc.RemoveRole(r.Context(), CurrentAdmin(r.Context()), id, clientIP(r)); err != nil {
		return err
	}
	return h.listAdmins(w, r)
}

func (h *Handler) listAudit(w http.ResponseWriter, r *http.Request) error {
	actor, err := queryID(r, "actor")
	if err != nil {
		return err
	}
	target, err := queryID(r, "target")
	if err != nil {
		return err
	}
	out, err := h.svc.ListAudit(r.Context(), AuditFilter{
		ActorID:  actor,
		TargetID: target,
		Action:   r.URL.Query().Get("action"),
		Cursor:   r.URL.Query().Get("cursor"),
	})
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) error {
	days := 30
	if v := r.URL.Query().Get("range"); v != "" {
		var err error
		if days, err = strconv.Atoi(v); err != nil {
			return httpx.BadRequest("INVALID_RANGE", "range must be 7, 30 or 90 days.")
		}
	}
	out, err := h.svc.Overview(r.Context(), days)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) listGroups(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	out, err := h.svc.ListGroups(r.Context(), q.Get("q"), q.Get("status"), page)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) getGroup(w http.ResponseWriter, r *http.Request) error {
	id, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	out, err := h.svc.GetGroup(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) voice(w http.ResponseWriter, r *http.Request) error {
	out, err := h.svc.Voice(r.Context())
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, out)
	return nil
}

func (h *Handler) setVoiceMode(w http.ResponseWriter, r *http.Request) error {
	var in apitypes.SetVoiceModeInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if err := h.svc.SetVoiceMode(r.Context(), CurrentAdmin(r.Context()), in.Mode, clientIP(r)); err != nil {
		return err
	}
	return h.voice(w, r)
}

func (h *Handler) grantVoice(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if err := h.svc.GrantVoice(r.Context(), CurrentAdmin(r.Context()), id, clientIP(r)); err != nil {
		return err
	}
	return h.afterAction(w, r, id)
}

func (h *Handler) revokeVoice(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if err := h.svc.RevokeVoice(r.Context(), CurrentAdmin(r.Context()), id, clientIP(r)); err != nil {
		return err
	}
	return h.afterAction(w, r, id)
}
