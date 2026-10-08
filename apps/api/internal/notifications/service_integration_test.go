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
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
	"github.com/Substance-k3n/abro/apps/api/internal/push"
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

func TestPreferences(t *testing.T) {
	t.Run("every type is on by default", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		user := makeProfile(t, "A")

		prefs, err := svc.Preferences(context.Background(), user.ID)
		require.NoError(t, err)
		require.Len(t, prefs, len(notifications.AllTypes))
		for _, typ := range notifications.AllTypes {
			assert.True(t, prefs[typ], "%s", typ)
		}
	})

	t.Run("an opted-out type is skipped by Notify and NotifyMany, for that user only", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		quiet := makeProfile(t, "Quiet")
		loud := makeProfile(t, "Loud")
		ctx := context.Background()

		prefs, err := svc.UpdatePreferences(ctx, quiet.ID, map[string]bool{string(notifications.TypeExpenseAdded): false})
		require.NoError(t, err)
		assert.False(t, prefs[notifications.TypeExpenseAdded])
		assert.True(t, prefs[notifications.TypeSettlement])

		created, err := svc.Notify(ctx, quiet.ID, notifications.TypeExpenseAdded, "Skipped", "Body")
		require.NoError(t, err)
		assert.False(t, created.ID.Valid, "no row for an opted-out type")
		require.NoError(t, svc.NotifyMany(ctx, []pgtype.UUID{quiet.ID, loud.ID}, notifications.TypeExpenseAdded, "Bulk", "Body"))
		// Other types still arrive.
		_, err = svc.Notify(ctx, quiet.ID, notifications.TypeSettlement, "Kept", "Body")
		require.NoError(t, err)

		quietRows, err := svc.List(ctx, quiet.ID, false, 50, 0)
		require.NoError(t, err)
		require.Len(t, quietRows, 1)
		assert.Equal(t, "Kept", quietRows[0].Title)

		loudRows, err := svc.List(ctx, loud.ID, false, 50, 0)
		require.NoError(t, err)
		require.Len(t, loudRows, 1)
		assert.Equal(t, "Bulk", loudRows[0].Title)

		// Turning it back on restores delivery (and is idempotent).
		_, err = svc.UpdatePreferences(ctx, quiet.ID, map[string]bool{string(notifications.TypeExpenseAdded): true})
		require.NoError(t, err)
		_, err = svc.UpdatePreferences(ctx, quiet.ID, map[string]bool{string(notifications.TypeExpenseAdded): true})
		require.NoError(t, err)
		_, err = svc.Notify(ctx, quiet.ID, notifications.TypeExpenseAdded, "Back", "Body")
		require.NoError(t, err)
		quietRows, err = svc.List(ctx, quiet.ID, false, 50, 0)
		require.NoError(t, err)
		assert.Len(t, quietRows, 2)
	})

	t.Run("rejects an unknown type without applying the rest", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		ctx := context.Background()

		_, err := svc.UpdatePreferences(ctx, user.ID, map[string]bool{
			string(notifications.TypeSettlement): false,
			"NOT_A_TYPE":                         false,
		})
		require.Error(t, err)

		prefs, err := svc.Preferences(ctx, user.ID)
		require.NoError(t, err)
		assert.True(t, prefs[notifications.TypeSettlement])
	})
}

// fakePusher records what would have been pushed (ADR-021).
type fakePusher struct {
	sent []push.Message
	to   []pgtype.UUID
}

func (f *fakePusher) Send(userIDs []pgtype.UUID, msg push.Message) {
	f.to = append(f.to, userIDs...)
	f.sent = append(f.sent, msg)
}

func TestPush(t *testing.T) {
	t.Run("NotifyLink pushes the stored notification, link included", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		pusher := &fakePusher{}
		svc.SetPusher(pusher)
		user := makeProfile(t, "A")
		ctx := context.Background()

		n, err := svc.NotifyLink(ctx, user.ID, notifications.TypeExpenseAdded, "Lunch", "You owe 50.00 ETB", "/expenses/x")
		require.NoError(t, err)

		require.Len(t, pusher.sent, 1)
		assert.Equal(t, []pgtype.UUID{user.ID}, pusher.to)
		assert.Equal(t, push.Message{
			ID: idutil.String(n.ID), Type: "EXPENSE_ADDED", Title: "Lunch", Body: "You owe 50.00 ETB", Link: "/expenses/x",
		}, pusher.sent[0])
	})

	t.Run("NotifyMany pushes once per recipient who wants it", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		pusher := &fakePusher{}
		svc.SetPusher(pusher)
		a := makeProfile(t, "A")
		b := makeProfile(t, "B")
		optedOut := makeProfile(t, "C")
		ctx := context.Background()
		_, err := svc.UpdatePreferences(ctx, optedOut.ID, map[string]bool{"SETTLEMENT": false})
		require.NoError(t, err)

		require.NoError(t, svc.NotifyMany(ctx, []pgtype.UUID{a.ID, b.ID, a.ID, optedOut.ID}, notifications.TypeSettlement, "Paid", "Body"))

		assert.ElementsMatch(t, []pgtype.UUID{a.ID, b.ID}, pusher.to)
		require.Len(t, pusher.sent, 2)
		assert.Equal(t, "Paid", pusher.sent[0].Title)
	})

	t.Run("NotifyManyLink stores and pushes the link for every recipient", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		pusher := &fakePusher{}
		svc.SetPusher(pusher)
		a := makeProfile(t, "A")
		b := makeProfile(t, "B")
		ctx := context.Background()

		require.NoError(t, svc.NotifyManyLink(ctx, []pgtype.UUID{a.ID, b.ID}, notifications.TypeExpenseAdded, "New expense", "Body", "/expenses/e1"))

		for _, user := range []db.Profile{a, b} {
			list, err := svc.List(ctx, user.ID, false, 50, 0)
			require.NoError(t, err)
			require.Len(t, list, 1)
			assert.Equal(t, "/expenses/e1", list[0].Link.String)
		}
		require.Len(t, pusher.sent, 2)
		assert.Equal(t, "/expenses/e1", pusher.sent[0].Link)
		assert.Equal(t, "/expenses/e1", pusher.sent[1].Link)
	})

	t.Run("an opted-out type isn't pushed either", func(t *testing.T) {
		svc, makeProfile := testEnv(t)
		pusher := &fakePusher{}
		svc.SetPusher(pusher)
		user := makeProfile(t, "A")
		ctx := context.Background()
		_, err := svc.UpdatePreferences(ctx, user.ID, map[string]bool{"EXPENSE_ADDED": false})
		require.NoError(t, err)

		_, err = svc.Notify(ctx, user.ID, notifications.TypeExpenseAdded, "Lunch", "Body")
		require.NoError(t, err)
		assert.Empty(t, pusher.sent)
	})
}
