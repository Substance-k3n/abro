package notifications_test

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"
}

func testEnv(t *testing.T) (*notifications.Service, func(t *testing.T, label string) db.Profile) {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDatabaseURL())
	require.NoError(t, err, "connect to dev Postgres")
	require.NoError(t, pool.Ping(context.Background()))
	t.Cleanup(pool.Close)

	queries := db.New(pool)
	svc := notifications.NewService(queries)

	makeProfile := func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-notifications-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
		profile, err := queries.UpsertProfileByEmail(context.Background(), db.UpsertProfileByEmailParams{
			Email:       pgtype.Text{String: email, Valid: true},
			DisplayName: "Test " + label,
		})
		require.NoError(t, err)
		t.Cleanup(func() {
			ctx := context.Background()
			pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = $1`, profile.ID)
			pool.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, profile.ID)
		})
		return profile
	}

	return svc, makeProfile
}

func TestService(t *testing.T) {
	t.Run("creates and lists a notification, newest first", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		ctx := context.Background()

		_, err := svc.Notify(ctx, user.ID, notifications.TypeSettlement, "Title 1", "Body 1")
		require.NoError(t, err)
		_, err = svc.Notify(ctx, user.ID, notifications.TypeGroupInvitation, "Title 2", "Body 2")
		require.NoError(t, err)

		list, err := svc.List(ctx, user.ID, false, 50, 0)
		require.NoError(t, err)
		require.Len(t, list, 2)
		assert.Equal(t, "Title 2", list[0].Title)
		assert.Equal(t, "Title 1", list[1].Title)
	})

	t.Run("filters to unread only", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		ctx := context.Background()

		first, err := svc.Notify(ctx, user.ID, notifications.TypeSettlement, "Read me", "Body")
		require.NoError(t, err)
		_, err = svc.Notify(ctx, user.ID, notifications.TypeSettlement, "Unread", "Body")
		require.NoError(t, err)
		_, err = svc.MarkRead(ctx, user.ID, first.ID)
		require.NoError(t, err)

		unread, err := svc.List(ctx, user.ID, true, 50, 0)
		require.NoError(t, err)
		require.Len(t, unread, 1)
		assert.Equal(t, "Unread", unread[0].Title)
	})

	t.Run("NotifyMany de-dupes recipients and no-ops on an empty list", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		ctx := context.Background()

		require.NoError(t, svc.NotifyMany(ctx, []pgtype.UUID{user.ID, user.ID}, notifications.TypeSettlement, "Title", "Body"))
		list, err := svc.List(ctx, user.ID, false, 50, 0)
		require.NoError(t, err)
		assert.Len(t, list, 1)

		assert.NoError(t, svc.NotifyMany(ctx, []pgtype.UUID{}, notifications.TypeSettlement, "Title", "Body"))
	})

	t.Run("markRead is idempotent and rejects marking someone else's notification", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		owner := makeProfile(t, "A")
		other := makeProfile(t, "B")
		ctx := context.Background()

		notification, err := svc.Notify(ctx, owner.ID, notifications.TypeSettlement, "Title", "Body")
		require.NoError(t, err)

		first, err := svc.MarkRead(ctx, owner.ID, notification.ID)
		require.NoError(t, err)
		assert.True(t, first.ReadAt.Valid)

		second, err := svc.MarkRead(ctx, owner.ID, notification.ID)
		require.NoError(t, err)
		assert.Equal(t, first.ReadAt.Time, second.ReadAt.Time)

		_, err = svc.MarkRead(ctx, other.ID, notification.ID)
		assert.Error(t, err)
	})

	t.Run("markAllRead clears every unread notification for the user only", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		other := makeProfile(t, "B")
		ctx := context.Background()

		_, err := svc.Notify(ctx, user.ID, notifications.TypeSettlement, "A", "Body")
		require.NoError(t, err)
		_, err = svc.Notify(ctx, user.ID, notifications.TypeSettlement, "B", "Body")
		require.NoError(t, err)
		_, err = svc.Notify(ctx, other.ID, notifications.TypeSettlement, "C", "Body")
		require.NoError(t, err)

		require.NoError(t, svc.MarkAllRead(ctx, user.ID))

		userUnread, err := svc.List(ctx, user.ID, true, 50, 0)
		require.NoError(t, err)
		assert.Empty(t, userUnread)

		otherUnread, err := svc.List(ctx, other.ID, true, 50, 0)
		require.NoError(t, err)
		assert.Len(t, otherUnread, 1)
	})
}
