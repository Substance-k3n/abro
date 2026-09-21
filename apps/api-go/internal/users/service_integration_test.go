package users_test

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

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/users"
)

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro?sslmode=disable"
}

func strPtr(s string) *string { return &s }

func TestService_UpdateProfile(t *testing.T) {
	pool, err := pgxpool.New(context.Background(), testDatabaseURL())
	require.NoError(t, err, "connect to dev Postgres (docker compose -f infra/docker/dev/compose.yml up -d postgres)")
	require.NoError(t, pool.Ping(context.Background()))
	defer pool.Close()

	queries := db.New(pool)
	svc := users.NewService(queries)

	makeProfile := func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-users-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
		profile, err := queries.UpsertProfileByEmail(context.Background(), db.UpsertProfileByEmailParams{
			Email:       pgtype.Text{String: email, Valid: true},
			DisplayName: "Test " + label,
		})
		require.NoError(t, err)
		t.Cleanup(func() {
			pool.Exec(context.Background(), `DELETE FROM profiles WHERE id = $1`, profile.ID)
		})
		return profile
	}

	t.Run("updates the given fields and leaves others untouched", func(t *testing.T) {
		profile := makeProfile(t, "A")

		updated, err := svc.UpdateProfile(context.Background(), profile.ID, apitypes.UpdateProfileInput{
			DisplayName: strPtr("New Name"),
		})
		require.NoError(t, err)
		assert.Equal(t, "New Name", updated.DisplayName)
		assert.Equal(t, profile.Email, updated.Email)
	})

	t.Run("updates preferredCurrency and locale together", func(t *testing.T) {
		profile := makeProfile(t, "B")

		updated, err := svc.UpdateProfile(context.Background(), profile.ID, apitypes.UpdateProfileInput{
			PreferredCurrency: strPtr("ETB"),
			Locale:            strPtr("am-ET"),
		})
		require.NoError(t, err)
		assert.Equal(t, "ETB", updated.PreferredCurrency)
		assert.Equal(t, "am-ET", updated.Locale)
	})

	t.Run("applying an empty update leaves the profile unchanged", func(t *testing.T) {
		profile := makeProfile(t, "C")

		updated, err := svc.UpdateProfile(context.Background(), profile.ID, apitypes.UpdateProfileInput{})
		require.NoError(t, err)
		assert.Equal(t, profile.DisplayName, updated.DisplayName)
		assert.Equal(t, profile.Email, updated.Email)
	})
}
