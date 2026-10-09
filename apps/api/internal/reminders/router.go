package reminders

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

// Mount is /reminders: the user's own reminder settings.
func (h *Handler) Mount(r chi.Router) {
	r.Use(authpkg.RequireSession(h.q))
	r.Get("/settings", httpx.Wrap(h.settings))
	r.Patch("/settings", httpx.Wrap(h.updateSettings))
}

// MountFriends adds the friend reminder routes to the /friends router,
// after friends.Handler.Mount has installed RequireSession on it.
func (h *Handler) MountFriends(r chi.Router) {
	r.Post("/{id}/remind", httpx.Wrap(h.remindFriend))
	r.Get("/{id}/reminder", httpx.Wrap(h.latestFriendReminder))
}

func (h *Handler) remindFriend(w http.ResponseWriter, r *http.Request) error {
	friendID, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	}
	user := authpkg.CurrentUser(r.Context())
	reminder, err := h.svc.RemindFriend(r.Context(), user.ID, friendID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusCreated, toFriendReminder(reminder))
	return nil
}

// latestFriendReminder answers null when the friend was never reminded.
func (h *Handler) latestFriendReminder(w http.ResponseWriter, r *http.Request) error {
	friendID, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	}
	user := authpkg.CurrentUser(r.Context())
	reminder, ok, err := h.svc.LatestFriendReminder(r.Context(), user.ID, friendID)
	if err != nil {
		return err
	}
	if !ok {
		httpx.WriteJSON(w, http.StatusOK, nil)
		return nil
	}
	httpx.WriteJSON(w, http.StatusOK, toFriendReminder(reminder))
	return nil
}

func (h *Handler) settings(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	on, err := h.svc.AutoRemindFriends(r.Context(), user.ID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, apitypes.ReminderSettings{AutoRemindFriends: on})
	return nil
}

func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		AutoRemindFriends *bool `json:"autoRemindFriends"`
	}
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return err
	}
	if in.AutoRemindFriends == nil {
		return httpx.BadRequest("VALIDATION_ERROR", "autoRemindFriends is required")
	}
	user := authpkg.CurrentUser(r.Context())
	on, err := h.svc.SetAutoRemindFriends(r.Context(), user.ID, *in.AutoRemindFriends)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, apitypes.ReminderSettings{AutoRemindFriends: on})
	return nil
}

func toFriendReminder(rem db.PaymentReminder) apitypes.FriendReminder {
	return apitypes.FriendReminder{
		FriendID:      idutil.String(rem.RecipientID),
		Automatic:     rem.Kind == "AUTO",
		RemindedAt:    rem.CreatedAt.Time,
		NextAllowedAt: rem.CreatedAt.Time.Add(FriendCooldown),
	}
}
