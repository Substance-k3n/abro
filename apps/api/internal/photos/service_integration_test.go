package photos_test

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math/rand"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
	"github.com/Substance-k3n/abro/apps/api/internal/photos"
	"github.com/Substance-k3n/abro/apps/api/internal/storage"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Minimal file signatures http.DetectContentType recognises.
var (
	pngBytes  = []byte("\x89PNG\r\n\x1a\n first photo")
	jpegBytes = []byte("\xFF\xD8\xFF\xE0 second photo")
)

type env struct {
	svc         *photos.Service
	store       *storage.ReceiptStorage
	queries     *db.Queries
	pool        *pgxpool.Pool
	makeProfile func(t *testing.T, label string) db.Profile
	makeGroup   func(t *testing.T, admin pgtype.UUID, members ...pgtype.UUID) pgtype.UUID
}

func setup(t *testing.T) env {
	t.Helper()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, getenv("DATABASE_URL", "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"))
	require.NoError(t, err, "connect to dev Postgres")
	require.NoError(t, pool.Ping(ctx))
	t.Cleanup(pool.Close)

	queries := db.New(pool)
	groupsSvc := groups.NewService(queries, friends.NewService(queries, notifications.NewService(queries)), notifications.NewService(queries))
	store, err := storage.NewReceiptStorage(
		getenv("S3_ENDPOINT", "http://localhost:9460"), getenv("S3_REGION", "us-east-1"),
		getenv("S3_ACCESS_KEY_ID", "abro-minio"), getenv("S3_SECRET_ACCESS_KEY", "password123"),
		getenv("RECEIPTS_BUCKET", "abro-receipts"),
	)
	require.NoError(t, err)

	var profileIDs, groupIDs []pgtype.UUID
	t.Cleanup(func() {
		for _, id := range groupIDs {
			var key pgtype.Text
			pool.QueryRow(ctx, `SELECT photo_path FROM groups WHERE id = $1`, id).Scan(&key)
			if key.Valid {
				store.Delete(ctx, key.String)
			}
			pool.Exec(ctx, `DELETE FROM group_members WHERE group_id = $1`, id)
			pool.Exec(ctx, `DELETE FROM groups WHERE id = $1`, id)
		}
		for _, id := range profileIDs {
			var key pgtype.Text
			pool.QueryRow(ctx, `SELECT avatar_path FROM profiles WHERE id = $1`, id).Scan(&key)
			if key.Valid {
				store.Delete(ctx, key.String)
			}
			pool.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, id)
		}
	})

	e := env{svc: photos.NewService(queries, store, groupsSvc), store: store, queries: queries, pool: pool}
	e.makeProfile = func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-photos-%s-%d-%d@abro.test", strings.ToLower(label), time.Now().UnixNano(), rand.Intn(1_000_000))
		p, err := queries.UpsertProfileByEmail(ctx, db.UpsertProfileByEmailParams{
			Email: pgtype.Text{String: email, Valid: true}, DisplayName: "Test " + label,
		})
		require.NoError(t, err)
		profileIDs = append(profileIDs, p.ID)
		return p
	}
	e.makeGroup = func(t *testing.T, admin pgtype.UUID, members ...pgtype.UUID) pgtype.UUID {
		t.Helper()
		var id pgtype.UUID
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO groups (name, created_by_id) VALUES ('Photo test', $1) RETURNING id`, admin).Scan(&id))
		groupIDs = append(groupIDs, id)
		_, err := pool.Exec(ctx, `INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')`, id, admin)
		require.NoError(t, err)
		for _, m := range members {
			_, err := pool.Exec(ctx, `INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, 'MEMBER', 'ACTIVE')`, id, m)
			require.NoError(t, err)
		}
		return id
	}
	return e
}

func read(t *testing.T, p photos.Photo) []byte {
	t.Helper()
	defer p.Body.Close()
	b, err := io.ReadAll(p.Body)
	require.NoError(t, err)
	return b
}

func versionOf(url string) string {
	return url[strings.LastIndex(url, "/")+1:]
}

func apiCode(t *testing.T, err error) string {
	t.Helper()
	var apiErr *httpx.APIError
	require.ErrorAs(t, err, &apiErr)
	return apiErr.Code
}

func TestService_Avatar(t *testing.T) {
	ctx := context.Background()

	t.Run("sets a photo at a versioned URL, serves it, and a new one replaces it", func(t *testing.T) {
		e := setup(t)
		me := e.makeProfile(t, "Me")

		first, err := e.svc.SetAvatar(ctx, me.ID, bytes.NewReader(pngBytes), int64(len(pngBytes)))
		require.NoError(t, err)
		require.True(t, first.AvatarUrl.Valid)
		assert.Regexp(t, fmt.Sprintf(`^/users/%s/avatar/[0-9a-f-]{36}$`, idutil.String(me.ID)), first.AvatarUrl.String)

		photo, err := e.svc.OpenAvatar(ctx, me.ID, versionOf(first.AvatarUrl.String))
		require.NoError(t, err)
		assert.Equal(t, "image/png", photo.ContentType)
		assert.Equal(t, pngBytes, read(t, photo), "served byte for byte")

		second, err := e.svc.SetAvatar(ctx, me.ID, bytes.NewReader(jpegBytes), int64(len(jpegBytes)))
		require.NoError(t, err)
		assert.NotEqual(t, first.AvatarUrl, second.AvatarUrl, "a new photo gets a new URL")
		assert.True(t, strings.HasSuffix(second.AvatarPath.String, ".jpg"))

		_, err = e.svc.OpenAvatar(ctx, me.ID, versionOf(first.AvatarUrl.String))
		assert.Equal(t, "PHOTO_NOT_FOUND", apiCode(t, err), "the old URL stops working")
		_, _, _, err = e.store.Open(ctx, first.AvatarPath.String)
		if err == nil {
			// minio-go may only fail on first read for a missing object.
			body, _, _, _ := e.store.Open(ctx, first.AvatarPath.String)
			_, err = io.ReadAll(body)
		}
		assert.Error(t, err, "the old object is deleted")
	})

	t.Run("types photos by their bytes and enforces the size limit", func(t *testing.T) {
		e := setup(t)
		me := e.makeProfile(t, "Me")

		_, err := e.svc.SetAvatar(ctx, me.ID, strings.NewReader("<html>not a photo</html>"), 24)
		assert.Equal(t, "UNSUPPORTED_PHOTO_TYPE", apiCode(t, err))

		big := append(append([]byte{}, pngBytes...), make([]byte, photos.MaxPhotoBytes)...)
		_, err = e.svc.SetAvatar(ctx, me.ID, bytes.NewReader(big), int64(len(big)))
		assert.Equal(t, "PHOTO_TOO_LARGE", apiCode(t, err))
	})

	t.Run("removing clears the photo, including a Google picture URL", func(t *testing.T) {
		e := setup(t)
		me := e.makeProfile(t, "Me")
		set, err := e.svc.SetAvatar(ctx, me.ID, bytes.NewReader(pngBytes), int64(len(pngBytes)))
		require.NoError(t, err)

		removed, err := e.svc.RemoveAvatar(ctx, me.ID)
		require.NoError(t, err)
		assert.False(t, removed.AvatarUrl.Valid)
		assert.False(t, removed.AvatarPath.Valid)
		_, err = e.svc.OpenAvatar(ctx, me.ID, versionOf(set.AvatarUrl.String))
		assert.Equal(t, "PHOTO_NOT_FOUND", apiCode(t, err))

		google := e.makeProfile(t, "Google")
		_, err = e.pool.Exec(ctx, `UPDATE profiles SET avatar_url = 'https://lh3.googleusercontent.com/x' WHERE id = $1`, google.ID)
		require.NoError(t, err)
		removed, err = e.svc.RemoveAvatar(ctx, google.ID)
		require.NoError(t, err)
		assert.False(t, removed.AvatarUrl.Valid)
	})

	t.Run("a made-up version is not found", func(t *testing.T) {
		e := setup(t)
		me := e.makeProfile(t, "Me")
		_, err := e.svc.SetAvatar(ctx, me.ID, bytes.NewReader(pngBytes), int64(len(pngBytes)))
		require.NoError(t, err)
		_, err = e.svc.OpenAvatar(ctx, me.ID, "00000000-0000-4000-8000-000000000000")
		assert.Equal(t, "PHOTO_NOT_FOUND", apiCode(t, err))
	})
}

func TestService_GroupPhoto(t *testing.T) {
	ctx := context.Background()

	t.Run("admins set and remove it, members can view it, others can't", func(t *testing.T) {
		e := setup(t)
		admin := e.makeProfile(t, "Admin")
		member := e.makeProfile(t, "Member")
		outsider := e.makeProfile(t, "Outsider")
		groupID := e.makeGroup(t, admin.ID, member.ID)

		_, err := e.svc.SetGroupPhoto(ctx, member.ID, groupID, bytes.NewReader(pngBytes), int64(len(pngBytes)))
		assert.Equal(t, "NOT_GROUP_ADMIN", apiCode(t, err), "a plain member can't change it")

		updated, err := e.svc.SetGroupPhoto(ctx, admin.ID, groupID, bytes.NewReader(pngBytes), int64(len(pngBytes)))
		require.NoError(t, err)
		url, ok := groups.PhotoURL(updated.ID, updated.PhotoPath)
		require.True(t, ok)
		assert.Regexp(t, fmt.Sprintf(`^/groups/%s/photo/[0-9a-f-]{36}$`, idutil.String(groupID)), url)

		photo, err := e.svc.OpenGroupPhoto(ctx, member.ID, groupID, versionOf(url))
		require.NoError(t, err)
		assert.Equal(t, pngBytes, read(t, photo))

		_, err = e.svc.OpenGroupPhoto(ctx, outsider.ID, groupID, versionOf(url))
		assert.Error(t, err, "a non-member can't load it")

		_, err = e.svc.RemoveGroupPhoto(ctx, member.ID, groupID)
		assert.Equal(t, "NOT_GROUP_ADMIN", apiCode(t, err))
		removed, err := e.svc.RemoveGroupPhoto(ctx, admin.ID, groupID)
		require.NoError(t, err)
		assert.False(t, removed.PhotoPath.Valid)
		_, err = e.svc.OpenGroupPhoto(ctx, member.ID, groupID, versionOf(url))
		assert.Equal(t, "PHOTO_NOT_FOUND", apiCode(t, err))
	})
}
