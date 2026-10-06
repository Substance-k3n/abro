package photos

import (
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	authpkg "github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

// maxUploadMemory buffers a photo upload in memory (they're capped at
// MaxPhotoBytes anyway).
const maxUploadMemory = 4 << 20

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// MountUsers adds the profile photo routes to the /users router, after
// users.Handler.Mount has installed RequireSession on it.
func (h *Handler) MountUsers(r chi.Router) {
	r.Post("/me/avatar", httpx.Wrap(h.setAvatar))
	r.Delete("/me/avatar", httpx.Wrap(h.removeAvatar))
	r.Get("/{id}/avatar/{version}", httpx.Wrap(h.getAvatar))
}

// MountGroups adds the group photo routes to the /groups router, after
// groups.Handler.Mount has installed RequireSession on it.
func (h *Handler) MountGroups(r chi.Router) {
	r.Post("/{id}/photo", httpx.Wrap(h.setGroupPhoto))
	r.Delete("/{id}/photo", httpx.Wrap(h.removeGroupPhoto))
	r.Get("/{id}/photo/{version}", httpx.Wrap(h.getGroupPhoto))
}

func (h *Handler) setAvatar(w http.ResponseWriter, r *http.Request) error {
	file, size, err := readUpload(r)
	if err != nil {
		return err
	}
	defer file.Close()
	user := authpkg.CurrentUser(r.Context())
	updated, err := h.svc.SetAvatar(r.Context(), user.ID, file, size)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, apitypes.ToAuthProfile(updated))
	return nil
}

func (h *Handler) removeAvatar(w http.ResponseWriter, r *http.Request) error {
	user := authpkg.CurrentUser(r.Context())
	updated, err := h.svc.RemoveAvatar(r.Context(), user.ID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, apitypes.ToAuthProfile(updated))
	return nil
}

func (h *Handler) getAvatar(w http.ResponseWriter, r *http.Request) error {
	userID, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return photoNotFound()
	}
	photo, err := h.svc.OpenAvatar(r.Context(), userID, chi.URLParam(r, "version"))
	if err != nil {
		return err
	}
	return servePhoto(w, photo)
}

func (h *Handler) setGroupPhoto(w http.ResponseWriter, r *http.Request) error {
	groupID, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	file, size, err := readUpload(r)
	if err != nil {
		return err
	}
	defer file.Close()
	user := authpkg.CurrentUser(r.Context())
	updated, err := h.svc.SetGroupPhoto(r.Context(), user.ID, groupID, file, size)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, groups.ToAuthGroupRow(updated))
	return nil
}

func (h *Handler) removeGroupPhoto(w http.ResponseWriter, r *http.Request) error {
	groupID, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	user := authpkg.CurrentUser(r.Context())
	updated, err := h.svc.RemoveGroupPhoto(r.Context(), user.ID, groupID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, groups.ToAuthGroupRow(updated))
	return nil
}

func (h *Handler) getGroupPhoto(w http.ResponseWriter, r *http.Request) error {
	groupID, err := idutil.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return photoNotFound()
	}
	user := authpkg.CurrentUser(r.Context())
	photo, err := h.svc.OpenGroupPhoto(r.Context(), user.ID, groupID, chi.URLParam(r, "version"))
	if err != nil {
		return err
	}
	return servePhoto(w, photo)
}

// readUpload takes the multipart "file" field, same as receipt uploads.
func readUpload(r *http.Request) (io.ReadCloser, int64, error) {
	r.Body = http.MaxBytesReader(nil, r.Body, MaxPhotoBytes+(1<<20))
	if err := r.ParseMultipartForm(maxUploadMemory); err != nil {
		return nil, 0, httpx.BadRequest("PHOTO_FILE_REQUIRED", "No photo uploaded, or it is too large.")
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return nil, 0, httpx.BadRequest("PHOTO_FILE_REQUIRED", "No photo uploaded.")
	}
	return file, header.Size, nil
}

// servePhoto streams a photo. Its URL is versioned, so the browser may keep
// it for a year without asking again ("private": never in shared caches,
// since photos need a signed-in session).
func servePhoto(w http.ResponseWriter, photo Photo) error {
	defer photo.Body.Close()
	w.Header().Set("Content-Type", photo.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(photo.Size, 10))
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, err := io.Copy(w, photo.Body)
	// The status line is already sent, so a copy error can't become an
	// error response; the client sees a cut-off image and retries later.
	_ = err
	return nil
}
