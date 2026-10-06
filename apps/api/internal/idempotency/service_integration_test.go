package idempotency_test

import (
	"context"
	"errors"
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
	"github.com/Substance-k3n/abro/apps/api/internal/idempotency"
)

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"
}

func testEnv(t *testing.T) (*idempotency.Service, *pgxpool.Pool, func(t *testing.T, label string) db.Profile) {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDatabaseURL())
	require.NoError(t, err, "connect to dev Postgres")
	require.NoError(t, pool.Ping(context.Background()))
	t.Cleanup(pool.Close)

	queries := db.New(pool)
	svc := idempotency.NewService(queries)

	makeProfile := func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-idempotency-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
		profile, err := queries.UpsertProfileByEmail(context.Background(), db.UpsertProfileByEmailParams{
			Email: pgtype.Text{String: email, Valid: true}, DisplayName: "Test " + label,
		})
		require.NoError(t, err)
		t.Cleanup(func() {
			ctx := context.Background()
			pool.Exec(ctx, `DELETE FROM idempotency_keys WHERE user_id = $1`, profile.ID)
			pool.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, profile.ID)
		})
		return profile
	}

	return svc, pool, makeProfile
}

func TestService_Run(t *testing.T) {
	t.Run("runs fn unguarded when no key is given", func(t *testing.T) {
		svc, pool, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		calls := 0

		result, err := svc.Run(context.Background(), user.ID, "", "POST /expenses", func() (any, error) {
			calls++
			return map[string]bool{"ok": true}, nil
		})
		require.NoError(t, err)
		assert.JSONEq(t, `{"ok":true}`, string(result))
		assert.Equal(t, 1, calls)

		var count int
		require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM idempotency_keys WHERE user_id = $1`, user.ID).Scan(&count))
		assert.Equal(t, 0, count)
	})

	t.Run("runs fn once and replays the cached response on a repeated key", func(t *testing.T) {
		svc, _, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		ctx := context.Background()
		calls := 0

		first, err := svc.Run(ctx, user.ID, "key-1", "POST /expenses", func() (any, error) {
			calls++
			return map[string]any{"id": "expense-1", "amount": 100}, nil
		})
		require.NoError(t, err)
		second, err := svc.Run(ctx, user.ID, "key-1", "POST /expenses", func() (any, error) {
			calls++
			return map[string]any{"id": "expense-2", "amount": 200}, nil
		})
		require.NoError(t, err)

		assert.Equal(t, 1, calls)
		assert.JSONEq(t, `{"id":"expense-1","amount":100}`, string(first))
		assert.JSONEq(t, `{"id":"expense-1","amount":100}`, string(second))
	})

	t.Run("scopes keys per endpoint -- the same key at a different endpoint runs fn again", func(t *testing.T) {
		svc, _, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		ctx := context.Background()
		calls := 0
		fn := func() (any, error) {
			calls++
			return map[string]int{"calls": calls}, nil
		}

		_, err := svc.Run(ctx, user.ID, "shared-key", "POST /expenses", fn)
		require.NoError(t, err)
		_, err = svc.Run(ctx, user.ID, "shared-key", "POST /settlements", fn)
		require.NoError(t, err)

		assert.Equal(t, 2, calls)
	})

	t.Run("scopes keys per user -- a different user with the same key runs fn again", func(t *testing.T) {
		svc, _, makeProfile := testEnv(t)
		userA := makeProfile(t, "A")
		userB := makeProfile(t, "B")
		ctx := context.Background()
		calls := 0
		fn := func() (any, error) {
			calls++
			return map[string]int{"calls": calls}, nil
		}

		_, err := svc.Run(ctx, userA.ID, "same-key", "POST /expenses", fn)
		require.NoError(t, err)
		_, err = svc.Run(ctx, userB.ID, "same-key", "POST /expenses", fn)
		require.NoError(t, err)

		assert.Equal(t, 2, calls)
	})

	t.Run("deletes the reservation on failure, so a retry with the same key can succeed", func(t *testing.T) {
		svc, pool, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		ctx := context.Background()
		attempt := 0

		_, err := svc.Run(ctx, user.ID, "retry-key", "POST /expenses", func() (any, error) {
			attempt++
			return nil, errors.New("boom")
		})
		assert.ErrorContains(t, err, "boom")

		var count int
		require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM idempotency_keys WHERE user_id = $1`, user.ID).Scan(&count))
		assert.Equal(t, 0, count)

		result, err := svc.Run(ctx, user.ID, "retry-key", "POST /expenses", func() (any, error) {
			attempt++
			return map[string]bool{"ok": true}, nil
		})
		require.NoError(t, err)
		assert.Equal(t, 2, attempt)
		assert.JSONEq(t, `{"ok":true}`, string(result))
	})

	t.Run("rejects a concurrent duplicate as still in flight, without running fn twice", func(t *testing.T) {
		svc, pool, makeProfile := testEnv(t)
		user := makeProfile(t, "A")
		ctx := context.Background()

		_, err := pool.Exec(ctx, `INSERT INTO idempotency_keys (user_id, key, endpoint) VALUES ($1, $2, $3)`,
			user.ID, "in-flight-key", "POST /expenses")
		require.NoError(t, err)

		_, err = svc.Run(ctx, user.ID, "in-flight-key", "POST /expenses", func() (any, error) {
			return map[string]bool{"ok": true}, nil
		})
		assert.Error(t, err)
	})
}
