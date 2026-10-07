package friends_test

import (
	"context"
	"fmt"
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
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
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
	svc := friends.NewService(queries, notifications.NewService(queries))

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
			pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = $1`, profile.ID)
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

func TestService_Search(t *testing.T) {
	svc, pool, makeProfile := testEnv(t)
	ctx := context.Background()
	me := makeProfile(t, "Searcher")
	run := rand.Intn(1_000_000_000)

	// setUser gives a test profile a username (and optionally a phone).
	// Real sign-ups store emails lowercased (apitypes.NormalizeEmail);
	// makeProfile's label keeps its capitals, so lowercase it here too.
	setUser := func(t *testing.T, p *db.Profile, username, phone string) {
		t.Helper()
		p.Email.String = strings.ToLower(p.Email.String)
		_, err := pool.Exec(ctx, `UPDATE profiles SET username = $2, email = $3, phone = NULLIF($4, '') WHERE id = $1`,
			p.ID, username, p.Email.String, phone)
		require.NoError(t, err)
	}
	search := func(t *testing.T, query string) []db.Profile {
		t.Helper()
		results, err := svc.Search(ctx, query, me.ID)
		require.NoError(t, err)
		return results
	}
	ids := func(profiles []db.Profile) []pgtype.UUID {
		out := make([]pgtype.UUID, len(profiles))
		for i, p := range profiles {
			out[i] = p.ID
		}
		return out
	}

	target := makeProfile(t, "Target")
	username := fmt.Sprintf("tgt_%d", run)
	phone := fmt.Sprintf("+2519%08d", run%100_000_000)
	setUser(t, &target, username, phone)

	t.Run("finds by exact email, case-insensitively, and returns the email", func(t *testing.T) {
		results := search(t, strings.ToUpper(target.Email.String))
		require.Len(t, results, 1)
		assert.Equal(t, target.ID, results[0].ID)
		assert.Equal(t, target.Email, results[0].Email)
	})

	t.Run("finds by exact phone and hides the email", func(t *testing.T) {
		results := search(t, phone)
		require.Len(t, results, 1)
		assert.Equal(t, target.ID, results[0].ID)
		assert.False(t, results[0].Email.Valid)
	})

	t.Run("finds by username prefix as you type, with or without @, and hides the email", func(t *testing.T) {
		for _, q := range []string{username, "@" + username, strings.ToUpper(username), username[:len(username)-2]} {
			results := search(t, q)
			require.Contains(t, ids(results), target.ID, "query %q", q)
			for _, r := range results {
				assert.False(t, r.Email.Valid, "a username match must not reveal any email (query %q)", q)
			}
		}
	})

	t.Run("never matches a display name or the middle of a username", func(t *testing.T) {
		assert.Empty(t, search(t, "Test Target"))
		assert.NotContains(t, ids(search(t, fmt.Sprintf("%d", run))), target.ID)
	})

	t.Run("treats _ literally, not as a LIKE wildcard", func(t *testing.T) {
		underscore := makeProfile(t, "Underscore")
		lookalike := makeProfile(t, "Lookalike")
		setUser(t, &underscore, fmt.Sprintf("w%d_b", run), "")
		setUser(t, &lookalike, fmt.Sprintf("w%dxb", run), "")

		results := ids(search(t, fmt.Sprintf("w%d_", run)))
		assert.Contains(t, results, underscore.ID)
		assert.NotContains(t, results, lookalike.ID)
	})

	t.Run("caps results at 8, exact match first", func(t *testing.T) {
		prefix := fmt.Sprintf("cap%d", run)
		exact := makeProfile(t, "CapExact")
		setUser(t, &exact, prefix, "")
		for i := 0; i < 10; i++ {
			p := makeProfile(t, fmt.Sprintf("Cap%d", i))
			setUser(t, &p, fmt.Sprintf("%s_%02d", prefix, i), "")
		}

		results := search(t, prefix)
		require.Len(t, results, 8)
		assert.Equal(t, exact.ID, results[0].ID)
	})

	t.Run("never returns the searcher themselves", func(t *testing.T) {
		assert.Empty(t, search(t, me.Email.String))
	})
}

func TestService_ListIncludesUsernames(t *testing.T) {
	svc, pool, makeProfile := testEnv(t)
	ctx := context.Background()
	a := makeProfile(t, "ListA")
	b := makeProfile(t, "ListB")
	run := rand.Intn(1_000_000_000)
	_, err := pool.Exec(ctx, `UPDATE profiles SET username = $2 WHERE id = $1`, a.ID, fmt.Sprintf("la_%d", run))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE profiles SET username = $2 WHERE id = $1`, b.ID, fmt.Sprintf("lb_%d", run))
	require.NoError(t, err)

	request, err := svc.SendRequest(ctx, a.ID, idutil.String(b.ID))
	require.NoError(t, err)

	// The incoming request names its sender's username...
	incoming, err := svc.ListIncomingRequests(ctx, b.ID)
	require.NoError(t, err)
	found := false
	for _, r := range incoming {
		if r.FriendshipID == request.ID {
			found = true
			assert.Equal(t, fmt.Sprintf("la_%d", run), r.FromUsername.String)
		}
	}
	require.True(t, found)

	// ...and once accepted, both sides of the friendship carry usernames
	// (the friends list used to return username: null for everyone).
	_, err = svc.AcceptRequest(ctx, b.ID, idutil.String(request.ID))
	require.NoError(t, err)
	rows, err := svc.List(ctx, a.ID)
	require.NoError(t, err)
	found = false
	for _, row := range rows {
		if row.FriendshipID == request.ID {
			found = true
			assert.Equal(t, fmt.Sprintf("la_%d", run), row.UserUsername.String)
			assert.Equal(t, fmt.Sprintf("lb_%d", run), row.FriendUsername.String)
		}
	}
	require.True(t, found)
}

func TestService_FriendNotifications(t *testing.T) {
	t.Run("a request notifies the recipient; accepting notifies the sender", func(t *testing.T) {
		svc, pool, makeProfile := testEnv(t)
		a := makeProfile(t, "A")
		b := makeProfile(t, "B")
		ctx := context.Background()
		_, err := pool.Exec(ctx, `UPDATE profiles SET username = $2 WHERE id = $1`, a.ID,
			fmt.Sprintf("tfa_%d", rand.Intn(1_000_000_000)))
		require.NoError(t, err)

		bodies := func(userID pgtype.UUID, typ notifications.Type) []string {
			rows, err := pool.Query(ctx, `SELECT body FROM notifications WHERE user_id = $1 AND type = $2`, userID, string(typ))
			require.NoError(t, err)
			defer rows.Close()
			var out []string
			for rows.Next() {
				var body string
				require.NoError(t, rows.Scan(&body))
				out = append(out, body)
			}
			return out
		}

		request, err := svc.SendRequest(ctx, a.ID, idutil.String(b.ID))
		require.NoError(t, err)
		got := bodies(b.ID, notifications.TypeFriendRequest)
		require.Len(t, got, 1)
		assert.True(t, strings.HasPrefix(got[0], "Test A (@tfa_"), got[0])
		assert.True(t, strings.HasSuffix(got[0], ") wants to be friends."), got[0])
		assert.Empty(t, bodies(a.ID, notifications.TypeFriendRequest))

		_, err = svc.AcceptRequest(ctx, b.ID, idutil.String(request.ID))
		require.NoError(t, err)
		assert.Equal(t, []string{"Test B accepted your friend request."}, bodies(a.ID, notifications.TypeFriendAccepted))
		assert.Empty(t, bodies(b.ID, notifications.TypeFriendAccepted))
	})
}
