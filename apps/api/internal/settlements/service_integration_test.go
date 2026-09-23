package settlements_test

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
	"github.com/Substance-k3n/abro/apps/api/internal/settlements"
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
	svc         *settlements.Service
	expenses    *expenses.Service
	groups      *groups.Service
	balances    *balances.Service
	notifySvc   *notifications.Service
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
	balancesSvc := balances.NewService(queries, friendsSvc, groupsSvc)
	svc := settlements.NewService(queries, balancesSvc, groupsSvc, notifySvc, expensesSvc)

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
		email := fmt.Sprintf("test-settlements-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
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
		svc: svc, expenses: expensesSvc, groups: groupsSvc, balances: balancesSvc, notifySvc: notifySvc,
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

func expenseInput(splitType, name, amount string, groupID *pgtype.UUID, paidByID *pgtype.UUID, participants []apitypes.ExpenseParticipantRaw) apitypes.CreateExpenseInput {
	in := apitypes.CreateExpenseInput{
		SplitType: splitType, Name: name, Category: "Test", Amount: amount,
		ExpenseDate: time.Now().Format(time.RFC3339), Participants: participants,
	}
	if groupID != nil {
		s := idutil.String(*groupID)
		in.GroupID = &s
	}
	if paidByID != nil {
		s := idutil.String(*paidByID)
		in.PaidByID = &s
	}
	_ = in.Validate()
	return in
}

func settleInput(toUserID pgtype.UUID, amount string, groupID *pgtype.UUID) apitypes.CreateSettlementInput {
	in := apitypes.CreateSettlementInput{ToUserID: idutil.String(toUserID), Amount: amount}
	if groupID != nil {
		s := idutil.String(*groupID)
		in.GroupID = &s
	}
	_ = in.Validate()
	return in
}

func TestService_Create(t *testing.T) {
	t.Run("rejects settling with yourself", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		_, err := e.svc.Create(context.Background(), a.ID, settleInput(a.ID, "100", nil))
		assert.Error(t, err)
	})

	t.Run("rejects settling when there is no outstanding debt", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)

		_, err := e.svc.Create(context.Background(), a.ID, settleInput(b.ID, "100", nil))
		assert.Error(t, err)
	})

	t.Run("rejects a settlement amount that exceeds the outstanding debt", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)

		_, err := e.expenses.Create(context.Background(), b.ID, expenseInput("EQUAL", "Coffee", "100", nil, nil, equalParticipants(a.ID, b.ID)))
		require.NoError(t, err)

		_, err = e.svc.Create(context.Background(), a.ID, settleInput(b.ID, "51", nil))
		assert.Error(t, err)
	})

	t.Run("fully settles a debt to zero (PRD §19/§74) and records visible history", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)
		ctx := context.Background()

		_, err := e.expenses.Create(ctx, b.ID, expenseInput("EQUAL", "Dinner", "200", nil, nil, equalParticipants(a.ID, b.ID)))
		require.NoError(t, err)
		bal, err := e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(100), bal)

		settlement, err := e.svc.Create(ctx, a.ID, settleInput(b.ID, "100", nil))
		require.NoError(t, err)
		assert.Equal(t, db.SplitTypeSETTLEMENT, settlement.SplitType)
		assert.Equal(t, a.ID, settlement.PaidByID)

		bal, err = e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(0), bal)

		history, err := e.expenses.List(ctx, a.ID, apitypes.ListExpensesQuery{FriendID: idutil.String(b.ID)})
		require.NoError(t, err)
		splitTypes := map[db.SplitType]bool{}
		for _, h := range history {
			splitTypes[h.SplitType] = true
		}
		assert.True(t, splitTypes[db.SplitTypeEQUAL])
		assert.True(t, splitTypes[db.SplitTypeSETTLEMENT])
	})

	t.Run("partially settles a debt, leaving the remainder outstanding (PRD §75)", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)
		ctx := context.Background()

		_, err := e.expenses.Create(ctx, b.ID, expenseInput("EQUAL", "Rent", "1000", nil, nil, equalParticipants(a.ID, b.ID)))
		require.NoError(t, err)
		bal, err := e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(500), bal)

		_, err = e.svc.Create(ctx, a.ID, settleInput(b.ID, "200", nil))
		require.NoError(t, err)

		bal, err = e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(300), bal)
	})

	t.Run("settles a debt scoped to a specific group, without affecting the personal balance", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)
		ctx := context.Background()

		simplify := true
		group, err := e.groups.Create(ctx, a.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(b.ID)},
		})
		require.NoError(t, err)
		_, err = e.groups.AcceptInvite(ctx, b.ID, group.ID)
		require.NoError(t, err)

		_, err = e.expenses.Create(ctx, b.ID, expenseInput("EQUAL", "Taxi", "100", &group.ID, nil, equalParticipants(a.ID, b.ID)))
		require.NoError(t, err)
		bal, err := e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, group.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(50), bal)

		_, err = e.svc.Create(ctx, a.ID, settleInput(b.ID, "50", &group.ID))
		require.NoError(t, err)

		scoped, err := e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, group.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(0), scoped)
		personal, err := e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(0), personal)
	})

	t.Run("rejects a group settlement when either party is not an active member", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		outsider := e.makeProfile(t, "Outsider")
		e.makeFriends(t, a.ID, outsider.ID)
		ctx := context.Background()

		simplify := true
		group, err := e.groups.Create(ctx, a.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
		})
		require.NoError(t, err)

		_, err = e.svc.Create(ctx, a.ID, settleInput(outsider.ID, "10", &group.ID))
		assert.Error(t, err)
	})

	t.Run("rejects settling with an unknown user", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		in := apitypes.CreateSettlementInput{ToUserID: "does-not-exist", Amount: "10"}
		_ = in.Validate()
		_, err := e.svc.Create(context.Background(), a.ID, in)
		assert.Error(t, err)
	})

	t.Run("notifies the recipient of a settlement, not the actor", func(t *testing.T) {
		e := setup(t)
		settler := e.makeProfile(t, "Settler")
		recipient := e.makeProfile(t, "Recipient")
		e.makeFriends(t, settler.ID, recipient.ID)
		ctx := context.Background()

		_, err := e.expenses.Create(ctx, settler.ID, expenseInput("EQUAL", "Dinner", "100", nil, &recipient.ID, equalParticipants(settler.ID, recipient.ID)))
		require.NoError(t, err)

		_, err = e.svc.Create(ctx, settler.ID, settleInput(recipient.ID, "50", nil))
		require.NoError(t, err)

		countOf := func(userID pgtype.UUID) int {
			list, err := e.notifySvc.List(ctx, userID, false, 100, 0)
			require.NoError(t, err)
			count := 0
			for _, n := range list {
				if n.Type == string(notifications.TypeSettlement) {
					count++
				}
			}
			return count
		}
		assert.Equal(t, 1, countOf(recipient.ID))
		assert.Equal(t, 0, countOf(settler.ID))
	})
}
