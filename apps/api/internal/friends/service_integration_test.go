package friends_test

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
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"
}

// testEnv wires a fresh Service to real Postgres and returns a makeProfile
// helper that auto-cleans up every profile (and any friendship touching
// it) it creates -- same discipline as friends.service.spec.ts's afterEach.
func testEnv(t *testing.T) (*friends.Service, *pgxpool.Pool, func(t *testing.T, label string) db.Profile) {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDatabaseURL())
	require.NoError(t, err, "connect to dev Postgres (docker compose -f infra/docker/dev/compose.yml up -d postgres)")
	require.NoError(t, pool.Ping(context.Background()))

	queries := db.New(pool)
	svc := friends.NewService(queries)

	makeProfile := func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-friends-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
		profile, err := queries.UpsertProfileByEmail(context.Background(), db.UpsertProfileByEmailParams{
			Email:       pgtype.Text{String: email, Valid: true},
			DisplayName: "Test " + label,
		})
		require.NoError(t, err)
		t.Cleanup(func() {
			ctx := context.Background()
			pool.Exec(ctx, `DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1`, profile.ID)
			pool.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, profile.ID)
		})
		return profile
	}

	t.Cleanup(pool.Close)
	return svc, pool, makeProfile
}

func TestService_FullLifecycle(t *testing.T) {
	t.Run("runs a full request -> accept -> areFriends -> unfriend lifecycle", func(t *testing.T) {
		svc, pool, makeProfile := testEnv(t)
		a := makeProfile(t, "A")
		b := makeProfile(t, "B")
		ctx := context.Background()

		request, err := svc.SendRequest(ctx, a.ID, idutil.String(b.ID))
		require.NoError(t, err)
		assert.Equal(t, db.FriendshipStatusPENDING, request.Status)

		incoming, err := svc.ListIncomingRequests(ctx, b.ID)
		require.NoError(t, err)
		found := false
		for _, r := range incoming {
			if r.FriendshipID == request.ID {
				found = true
			}
		}
		assert.True(t, found)

		_, err = svc.AcceptRequest(ctx, b.ID, idutil.String(request.ID))
		require.NoError(t, err)

		areFriends, err := svc.AreFriends(ctx, a.ID, b.ID)
		require.NoError(t, err)
		assert.True(t, areFriends)

		aList, err := svc.List(ctx, a.ID)
		require.NoError(t, err)
		foundInList := false
		for _, f := range aList {
			if f.FriendID == b.ID || f.UserID == b.ID {
				foundInList = true
			}
		}
		assert.True(t, foundInList)

		require.NoError(t, svc.Unfriend(ctx, a.ID, idutil.String(request.ID)))
		areFriends, err = svc.AreFriends(ctx, a.ID, b.ID)
		require.NoError(t, err)
		assert.False(t, areFriends)

		var count int
		require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM friendships WHERE id = $1`, request.ID).Scan(&count))
		assert.Equal(t, 0, count, "unfriending is a hard delete")
	})

	t.Run("lets the recipient decline a request, hard-deleting it", func(t *testing.T) {
		svc, pool, makeProfile := testEnv(t)
		a := makeProfile(t, "A")
		b := makeProfile(t, "B")
		ctx := context.Background()

		request, err := svc.SendRequest(ctx, a.ID, idutil.String(b.ID))
		require.NoError(t, err)
		require.NoError(t, svc.DeclineRequest(ctx, b.ID, idutil.String(request.ID)))

		var count int
		require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM friendships WHERE id = $1`, request.ID).Scan(&count))
		assert.Equal(t, 0, count)

		areFriends, err := svc.AreFriends(ctx, a.ID, b.ID)
		require.NoError(t, err)
		assert.False(t, areFriends)
	})

	t.Run("rejects a self-friend request", func(t *testing.T) {
		svc, _, makeProfile := testEnv(t)
		a := makeProfile(t, "A")
		_, err := svc.SendRequest(context.Background(), a.ID, idutil.String(a.ID))
		assert.Error(t, err)
	})

	t.Run("rejects a duplicate request in either direction", func(t *testing.T) {
		svc, _, makeProfile := testEnv(t)
		a := makeProfile(t, "A")
		b := makeProfile(t, "B")
		ctx := context.Background()

		_, err := svc.SendRequest(ctx, a.ID, idutil.String(b.ID))
		require.NoError(t, err)
		_, err = svc.SendRequest(ctx, a.ID, idutil.String(b.ID))
		assert.Error(t, err)
		_, err = svc.SendRequest(ctx, b.ID, idutil.String(a.ID))
		assert.Error(t, err)
	})

	t.Run("only lets the recipient accept a request", func(t *testing.T) {
		svc, _, makeProfile := testEnv(t)
		a := makeProfile(t, "A")
		b := makeProfile(t, "B")
		ctx := context.Background()

		request, err := svc.SendRequest(ctx, a.ID, idutil.String(b.ID))
		require.NoError(t, err)

		_, err = svc.AcceptRequest(ctx, a.ID, idutil.String(request.ID))
		assert.Error(t, err)
	})

	t.Run("treats a user as their own friend for areFriends", func(t *testing.T) {
		svc, _, makeProfile := testEnv(t)
		a := makeProfile(t, "A")
		areFriends, err := svc.AreFriends(context.Background(), a.ID, a.ID)
		require.NoError(t, err)
		assert.True(t, areFriends)
	})

	t.Run("returns not-found for an unknown friendship id", func(t *testing.T) {
		svc, _, _ := testEnv(t)
		nobody := pgtype.UUID{Bytes: [16]byte{1}, Valid: true}
		_, err := svc.AcceptRequest(context.Background(), nobody, "does-not-exist")
		assert.Error(t, err)
	})
}
