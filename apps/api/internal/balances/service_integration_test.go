package balances_test

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
	"github.com/Substance-k3n/abro/apps/api/internal/balances"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
	"github.com/Substance-k3n/abro/apps/api/internal/storage"
)

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

type env struct {
	balances    *balances.Service
	expenses    *expenses.Service
	groups      *groups.Service
	makeProfile func(t *testing.T, label string) db.Profile
	makeFriends func(t *testing.T, a, b pgtype.UUID)
}

func setup(t *testing.T) env {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDatabaseURL())
	require.NoError(t, err, "connect to dev Postgres")
	require.NoError(t, pool.Ping(context.Background()))
	t.Cleanup(pool.Close)

	queries := db.New(pool)
	friendsSvc := friends.NewService(queries)
	notifySvc := notifications.NewService(queries)
	groupsSvc := groups.NewService(queries, friendsSvc, notifySvc)
	receiptStore, err := storage.NewReceiptStorage(
		getenv("S3_ENDPOINT", "http://localhost:9460"), getenv("S3_REGION", "us-east-1"),
		getenv("S3_ACCESS_KEY_ID", "abro-minio"), getenv("S3_SECRET_ACCESS_KEY", "password123"),
		getenv("RECEIPTS_BUCKET", "abro-receipts"),
	)
	require.NoError(t, err)
	expensesSvc := expenses.NewService(queries, groupsSvc, friendsSvc, notifySvc, receiptStore)
	balancesSvc := balances.NewService(queries)

	// Cleanup is association-based (by profile), not tracked-ID-based --
	// simpler here since every test creates expenses/groups through the
	// real services rather than direct inserts, and every one of them is
	// owned by, paid by, or a participant tied to a profile this test made.
	var profiles []pgtype.UUID
	t.Cleanup(func() {
		ctx := context.Background()
		pool.Exec(ctx, `DELETE FROM expense_participants WHERE user_id = ANY($1::uuid[]) OR expense_id IN (SELECT id FROM expenses WHERE paid_by_id = ANY($1::uuid[]))`, profiles)
		pool.Exec(ctx, `DELETE FROM expenses WHERE paid_by_id = ANY($1::uuid[])`, profiles)
		pool.Exec(ctx, `DELETE FROM group_members WHERE user_id = ANY($1::uuid[]) OR group_id IN (SELECT id FROM groups WHERE created_by_id = ANY($1::uuid[]))`, profiles)
		pool.Exec(ctx, `DELETE FROM groups WHERE created_by_id = ANY($1::uuid[])`, profiles)
		pool.Exec(ctx, `DELETE FROM friendships WHERE user_id = ANY($1::uuid[]) OR friend_id = ANY($1::uuid[])`, profiles)
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, profiles)
		pool.Exec(ctx, `DELETE FROM profiles WHERE id = ANY($1::uuid[])`, profiles)
	})

	makeProfile := func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-balances-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
		profile, err := queries.UpsertProfileByEmail(context.Background(), db.UpsertProfileByEmailParams{
			Email: pgtype.Text{String: email, Valid: true}, DisplayName: "Test " + label,
		})
		require.NoError(t, err)
		profiles = append(profiles, profile.ID)
		return profile
	}
	makeFriendsFn := func(t *testing.T, a, b pgtype.UUID) {
		t.Helper()
		_, err := pool.Exec(context.Background(), `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'ACCEPTED')`, a, b)
		require.NoError(t, err)
	}

	return env{
		balances: balancesSvc, expenses: expensesSvc, groups: groupsSvc,
		makeProfile: makeProfile, makeFriends: makeFriendsFn,
	}
}

func strPtr(s string) *string { return &s }

func equalParticipants(userIDs ...pgtype.UUID) []apitypes.ExpenseParticipantRaw {
	out := make([]apitypes.ExpenseParticipantRaw, len(userIDs))
	for i, id := range userIDs {
		out[i] = apitypes.ExpenseParticipantRaw{UserID: idutil.String(id)}
	}
	return out
}

func expenseInput(splitType, name, amount string, groupID *pgtype.UUID, participants []apitypes.ExpenseParticipantRaw) apitypes.CreateExpenseInput {
	in := apitypes.CreateExpenseInput{
		SplitType: splitType, Name: name, Category: "Test", Amount: amount,
		ExpenseDate: time.Now().Format(time.RFC3339), Participants: participants,
	}
	if groupID != nil {
		s := idutil.String(*groupID)
		in.GroupID = &s
	}
	_ = in.Validate()
	return in
}

func TestService_GetPairwiseBalance(t *testing.T) {
	t.Run("is zero between two friends with no shared expenses", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)

		bal, err := e.balances.GetPairwiseBalance(context.Background(), a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(0), bal)
	})

	t.Run("is positive when A owes B (B paid, A is a participant)", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)

		in := expenseInput("EQUAL", "Lunch", "100", nil, equalParticipants(a.ID, b.ID))
		_, err := e.expenses.Create(context.Background(), b.ID, in)
		require.NoError(t, err)

		balAB, err := e.balances.GetPairwiseBalance(context.Background(), a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(50), balAB)
		balBA, err := e.balances.GetPairwiseBalance(context.Background(), b.ID, a.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(-50), balBA)
	})

	t.Run("nets opposing debts across multiple expenses (PRD §16 example: owe 500, owed 200 -> net 300)", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)

		_, err := e.expenses.Create(context.Background(), b.ID, expenseInput("EQUAL", "Rent", "1000", nil, equalParticipants(a.ID, b.ID)))
		require.NoError(t, err)
		_, err = e.expenses.Create(context.Background(), a.ID, expenseInput("EQUAL", "Groceries", "400", nil, equalParticipants(a.ID, b.ID)))
		require.NoError(t, err)

		bal, err := e.balances.GetPairwiseBalance(context.Background(), a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(300), bal)
	})

	t.Run("ignores a group expense when scoped to personal (groupId omitted)", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)

		simplify := true
		group, err := e.groups.Create(context.Background(), a.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(b.ID)},
		})
		require.NoError(t, err)
		_, err = e.groups.AcceptInvite(context.Background(), b.ID, group.ID)
		require.NoError(t, err)

		_, err = e.expenses.Create(context.Background(), b.ID, expenseInput("EQUAL", "Taxi", "100", &group.ID, equalParticipants(a.ID, b.ID)))
		require.NoError(t, err)

		personal, err := e.balances.GetPairwiseBalance(context.Background(), a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(0), personal)

		scoped, err := e.balances.GetPairwiseBalance(context.Background(), a.ID, b.ID, group.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(50), scoped)
	})

	t.Run("excludes an expense where a third party paid, even if both A and B are participants", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		c := e.makeProfile(t, "C")
		e.makeFriends(t, a.ID, b.ID)
		e.makeFriends(t, a.ID, c.ID)
		e.makeFriends(t, b.ID, c.ID)

		_, err := e.expenses.Create(context.Background(), c.ID, expenseInput("EQUAL", "Dinner", "300", nil, equalParticipants(a.ID, b.ID, c.ID)))
		require.NoError(t, err)

		bal, err := e.balances.GetPairwiseBalance(context.Background(), a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(0), bal)
	})
}

func TestService_GetGroupSummary(t *testing.T) {
	t.Run("nets to zero across all members (conservation invariant)", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		friend := e.makeProfile(t, "Friend")
		third := e.makeProfile(t, "Third")
		e.makeFriends(t, owner.ID, friend.ID)
		e.makeFriends(t, owner.ID, third.ID)
		e.makeFriends(t, friend.ID, third.ID)

		simplify := true
		group, err := e.groups.Create(context.Background(), owner.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID), idutil.String(third.ID)},
		})
		require.NoError(t, err)
		_, err = e.groups.AcceptInvite(context.Background(), friend.ID, group.ID)
		require.NoError(t, err)
		_, err = e.groups.AcceptInvite(context.Background(), third.ID, group.ID)
		require.NoError(t, err)

		_, err = e.expenses.Create(context.Background(), owner.ID, expenseInput("EQUAL", "Hotel", "900", &group.ID, equalParticipants(owner.ID, friend.ID, third.ID)))
		require.NoError(t, err)
		_, err = e.expenses.Create(context.Background(), friend.ID, expenseInput("SHARES", "Taxi", "150", &group.ID, []apitypes.ExpenseParticipantRaw{
			{UserID: idutil.String(owner.ID), Shares: 1}, {UserID: idutil.String(friend.ID), Shares: 2},
		}))
		require.NoError(t, err)

		summary, err := e.balances.GetGroupSummary(context.Background(), group.ID)
		require.NoError(t, err)
		var total int64
		byUser := map[string]int64{}
		for _, row := range summary {
			total += row.NetBalance
			byUser[row.UserID] = row.NetBalance
		}
		assert.Equal(t, int64(0), total)
		assert.Equal(t, int64(550), byUser[idutil.String(owner.ID)])
		assert.Equal(t, int64(-250), byUser[idutil.String(friend.ID)])
		assert.Equal(t, int64(-300), byUser[idutil.String(third.ID)])
	})
}

func TestService_GetSimplifiedGroupDebts(t *testing.T) {
	t.Run("collapses a chain of expenses (PRD §18's own example) into a single transaction", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		c := e.makeProfile(t, "C")
		d := e.makeProfile(t, "D")
		e.makeFriends(t, b.ID, a.ID)
		e.makeFriends(t, b.ID, c.ID)
		e.makeFriends(t, b.ID, d.ID)

		simplify := true
		group, err := e.groups.Create(context.Background(), b.ID, apitypes.CreateGroupInput{
			Name: "Chain", Type: strPtr("OTHER"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(a.ID), idutil.String(c.ID), idutil.String(d.ID)},
		})
		require.NoError(t, err)
		_, err = e.groups.AcceptInvite(context.Background(), a.ID, group.ID)
		require.NoError(t, err)
		_, err = e.groups.AcceptInvite(context.Background(), c.ID, group.ID)
		require.NoError(t, err)
		_, err = e.groups.AcceptInvite(context.Background(), d.ID, group.ID)
		require.NoError(t, err)

		_, err = e.expenses.Create(context.Background(), b.ID, expenseInput("EQUAL", "Leg 1", "100", &group.ID, equalParticipants(a.ID)))
		require.NoError(t, err)
		_, err = e.expenses.Create(context.Background(), c.ID, expenseInput("EQUAL", "Leg 2", "100", &group.ID, equalParticipants(b.ID)))
		require.NoError(t, err)
		_, err = e.expenses.Create(context.Background(), d.ID, expenseInput("EQUAL", "Leg 3", "100", &group.ID, equalParticipants(c.ID)))
		require.NoError(t, err)

		simplified, err := e.balances.GetSimplifiedGroupDebts(context.Background(), group.ID)
		require.NoError(t, err)
		require.Len(t, simplified, 1)
		assert.Equal(t, idutil.String(a.ID), simplified[0].FromUserID)
		assert.Equal(t, idutil.String(d.ID), simplified[0].ToUserID)
		assert.Equal(t, int64(100), simplified[0].Amount)
	})
}
