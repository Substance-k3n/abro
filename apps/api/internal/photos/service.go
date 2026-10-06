// Package photos implements profile and group photos (roadmap Phase 4,
// docs/DECISIONS.md ADR-017).
//
// Photos live in the same private bucket as receipts, under avatars/ and
// group-photos/, and are served through the API rather than by presigned
// links: GET /users/{id}/avatar/{version} and /groups/{id}/photo/{version}.
// The version is the object's random file name, so uploading a new photo
// changes the URL and clients may cache each one forever. Only signed-in
// users can load photos, and a group photo only by the group's members.
//
// A profile's displayed photo stays in profiles.avatar_url (the versioned
// path here, or a Google picture URL), so every response that already
// embeds a profile shows it with no other change. Clients shrink photos
// before uploading; the server checks the real image type and size.
package photos

import (
	"context"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/storage"
)

// MaxPhotoBytes bounds an upload. Clients resize to about 512px first, so
// a real photo is a few dozen KB; this only stops misuse.
const MaxPhotoBytes = 2 * 1024 * 1024

type Service struct {
	q      db.Querier
	store  *storage.ReceiptStorage
	groups *groups.Service
}

func NewService(q db.Querier, store *storage.ReceiptStorage, groupsSvc *groups.Service) *Service {
	return &Service{q: q, store: store, groups: groupsSvc}
}

// Photo is an opened stored photo, ready to stream.
type Photo struct {
	Body        io.ReadCloser
	Size        int64
	ContentType string
}

// AvatarURL is the versioned API path a profile photo is served at.
func AvatarURL(userID pgtype.UUID, key string) string {
	return "/users/" + idutil.String(userID) + "/avatar/" + versionOf(key)
}

// SetAvatar stores a new profile photo, points the profile at it, then
// deletes the old one (upload first, so a failure never loses a photo).
func (s *Service) SetAvatar(ctx context.Context, userID pgtype.UUID, body io.Reader, size int64) (db.Profile, error) {
	key, err := s.upload(ctx, "avatars/"+idutil.String(userID), body, size)
	if err != nil {
		return db.Profile{}, err
	}
	old, err := s.q.GetProfileByID(ctx, userID)
	if err != nil {
		return db.Profile{}, err
	}
	updated, err := s.q.SetProfileAvatar(ctx, db.SetProfileAvatarParams{
		ID:         userID,
		AvatarUrl:  pgtype.Text{String: AvatarURL(userID, key), Valid: true},
		AvatarPath: pgtype.Text{String: key, Valid: true},
	})
	if err != nil {
		_ = s.store.Delete(ctx, key)
		return db.Profile{}, err
	}
	if old.AvatarPath.Valid {
		_ = s.store.Delete(ctx, old.AvatarPath.String)
	}
	return updated, nil
}

// RemoveAvatar clears the profile photo (an uploaded one or a Google
// picture) and deletes any stored object.
func (s *Service) RemoveAvatar(ctx context.Context, userID pgtype.UUID) (db.Profile, error) {
	old, err := s.q.GetProfileByID(ctx, userID)
	if err != nil {
		return db.Profile{}, err
	}
	updated, err := s.q.SetProfileAvatar(ctx, db.SetProfileAvatarParams{ID: userID})
	if err != nil {
		return db.Profile{}, err
	}
	if old.AvatarPath.Valid && s.store.IsConfigured() {
		_ = s.store.Delete(ctx, old.AvatarPath.String)
	}
	return updated, nil
}

// OpenAvatar serves a profile photo by version. Any signed-in user may load
// one (photos show next to names everywhere), but only the current version:
// an old URL stops working once the photo is replaced or removed.
func (s *Service) OpenAvatar(ctx context.Context, userID pgtype.UUID, version string) (Photo, error) {
	profile, err := s.q.GetProfileByID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Photo{}, photoNotFound()
	}
	if err != nil {
		return Photo{}, err
	}
	return s.open(ctx, profile.AvatarPath, version)
}

// SetGroupPhoto stores a new group photo. Group admins only, same as the
// group's other settings.
func (s *Service) SetGroupPhoto(ctx context.Context, actorID, groupID pgtype.UUID, body io.Reader, size int64) (db.Group, error) {
	if _, err := s.groups.RequireActiveAdmin(ctx, groupID, actorID); err != nil {
		return db.Group{}, err
	}
	key, err := s.upload(ctx, "group-photos/"+idutil.String(groupID), body, size)
	if err != nil {
		return db.Group{}, err
	}
	old, err := s.q.GetGroupByID(ctx, groupID)
	if err != nil {
		return db.Group{}, err
	}
	updated, err := s.q.SetGroupPhoto(ctx, db.SetGroupPhotoParams{ID: groupID, PhotoPath: pgtype.Text{String: key, Valid: true}})
	if err != nil {
		_ = s.store.Delete(ctx, key)
		return db.Group{}, err
	}
	if old.PhotoPath.Valid {
		_ = s.store.Delete(ctx, old.PhotoPath.String)
	}
	return updated, nil
}

func (s *Service) RemoveGroupPhoto(ctx context.Context, actorID, groupID pgtype.UUID) (db.Group, error) {
	if _, err := s.groups.RequireActiveAdmin(ctx, groupID, actorID); err != nil {
		return db.Group{}, err
	}
	old, err := s.q.GetGroupByID(ctx, groupID)
	if err != nil {
		return db.Group{}, err
	}
	updated, err := s.q.SetGroupPhoto(ctx, db.SetGroupPhotoParams{ID: groupID})
	if err != nil {
		return db.Group{}, err
	}
	if old.PhotoPath.Valid && s.store.IsConfigured() {
		_ = s.store.Delete(ctx, old.PhotoPath.String)
	}
	return updated, nil
}

// OpenGroupPhoto serves a group photo to the group's active members only.
func (s *Service) OpenGroupPhoto(ctx context.Context, actorID, groupID pgtype.UUID, version string) (Photo, error) {
	if _, err := s.groups.RequireActiveMembership(ctx, groupID, actorID); err != nil {
		return Photo{}, err
	}
	group, err := s.q.GetGroupByID(ctx, groupID)
	if err != nil {
		return Photo{}, err
	}
	return s.open(ctx, group.PhotoPath, version)
}

func (s *Service) upload(ctx context.Context, prefix string, body io.Reader, size int64) (string, error) {
	if !s.store.IsConfigured() {
		return "", httpx.NewAPIError(501, "PHOTO_STORAGE_NOT_CONFIGURED", "Photo storage is not configured on this server.")
	}
	if size > MaxPhotoBytes {
		return "", httpx.BadRequest("PHOTO_TOO_LARGE", fmt.Sprintf("Photo must be %dMB or smaller.", MaxPhotoBytes/(1024*1024)))
	}
	contentType, ext, full, err := storage.DetectImage(body)
	if errors.Is(err, storage.ErrNotImage) {
		return "", httpx.BadRequest("UNSUPPORTED_PHOTO_TYPE", "Photos must be JPG, PNG, or WebP.")
	}
	if err != nil {
		return "", err
	}
	key := fmt.Sprintf("%s/%s.%s", prefix, uuid.NewString(), ext)
	if err := s.store.Upload(ctx, key, full, size, contentType); err != nil {
		return "", err
	}
	return key, nil
}

func (s *Service) open(ctx context.Context, stored pgtype.Text, version string) (Photo, error) {
	if !stored.Valid || versionOf(stored.String) != version || !s.store.IsConfigured() {
		return Photo{}, photoNotFound()
	}
	body, size, contentType, err := s.store.Open(ctx, stored.String)
	if err != nil {
		return Photo{}, err
	}
	return Photo{Body: body, Size: size, ContentType: contentType}, nil
}

// versionOf: "avatars/<user>/<uuid>.jpg" -> "<uuid>".
func versionOf(key string) string {
	name := path.Base(key)
	return strings.TrimSuffix(name, path.Ext(name))
}

func photoNotFound() error {
	return httpx.NotFound("PHOTO_NOT_FOUND", "No such photo.")
}
