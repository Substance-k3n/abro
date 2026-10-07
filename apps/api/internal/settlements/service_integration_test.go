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
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
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
	pool        *pgxpool.Pool
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
	notifySvc := notifications.NewService(queries)
	friendsSvc := friends.NewService(queries, notifySvc)
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
		pool.Exec(ctx, `DELETE FROM settlement_requests WHERE payer_id = ANY($1::uuid[]) OR recipient_id = ANY($1::uuid[])`, profiles)
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
		svc: svc, expenses: expensesSvc, groups: groupsSvc, balances: balancesSvc, notifySvc: notifySvc, pool: pool,
		makeProfile: makeProfile, makeFriends: makeFriendsFn,
	}
}

func strPtr(s string) *string { return &s }

// settle is the whole ADR-019 flow for tests about the settled result:
// the payer records the payment, then the recipient confirms it.
func settle(e env, ctx context.Context, payerID pgtype.UUID, in apitypes.CreateSettlementInput) (db.SettlementRequest, error) {
	req, err := e.svc.Create(ctx, payerID, in)
	if err != nil {
		return db.SettlementRequest{}, err
	}
	return e.svc.Confirm(ctx, req.RecipientID, req.ID)
}

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
		_, err := settle(e, context.Background(), a.ID, settleInput(a.ID, "100", nil))
		assert.Error(t, err)
	})

	t.Run("rejects settling when there is no outstanding debt", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)

		_, err := settle(e, context.Background(), a.ID, settleInput(b.ID, "100", nil))
		assert.Error(t, err)
	})

	t.Run("rejects a settlement amount that exceeds the outstanding debt", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		e.makeFriends(t, a.ID, b.ID)

		_, err := e.expenses.Create(context.Background(), b.ID, expenseInput("EQUAL", "Coffee", "100", nil, nil, equalParticipants(a.ID, b.ID)))
		require.NoError(t, err)

		_, err = settle(e, context.Background(), a.ID, settleInput(b.ID, "51", nil))
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

		req, err := settle(e, ctx, a.ID, settleInput(b.ID, "100", nil))
		require.NoError(t, err)
		require.True(t, req.SettlementID.Valid)
		var splitType db.SplitType
		var paidBy pgtype.UUID
		require.NoError(t, e.pool.QueryRow(ctx, `SELECT split_type, paid_by_id FROM expenses WHERE id = $1`, req.SettlementID).Scan(&splitType, &paidBy))
		assert.Equal(t, db.SplitTypeSETTLEMENT, splitType)
		assert.Equal(t, a.ID, paidBy)

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

		_, err = settle(e, ctx, a.ID, settleInput(b.ID, "200", nil))
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

		_, err = settle(e, ctx, a.ID, settleInput(b.ID, "50", &group.ID))
		require.NoError(t, err)

		scoped, err := e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, group.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(0), scoped)
		personal, err := e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		assert.Equal(t, int64(0), personal)
	})

	t.Run("group settlements are checked against group nets, not the pair's shared expenses", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		c := e.makeProfile(t, "C")
		e.makeFriends(t, a.ID, b.ID)
		e.makeFriends(t, a.ID, c.ID)
		ctx := context.Background()

		group, err := e.groups.Create(ctx, a.ID, apitypes.CreateGroupInput{
			Name: "Trip", MemberIDs: []string{idutil.String(b.ID), idutil.String(c.ID)},
		})
		require.NoError(t, err)
		_, err = e.groups.AcceptInvite(ctx, b.ID, group.ID)
		require.NoError(t, err)
		_, err = e.groups.AcceptInvite(ctx, c.ID, group.ID)
		require.NoError(t, err)

		// C pays 900 for all three (300 each); B pays 99 for all three
		// (33 each). Nets: A -333, B -234, C +567. A's pairwise debt to
		// C is only 300 -- the other 33 is owed to B.
		_, err = e.expenses.Create(ctx, c.ID, expenseInput("EQUAL", "Hotel", "900", &group.ID, nil, equalParticipants(a.ID, b.ID, c.ID)))
		require.NoError(t, err)
		_, err = e.expenses.Create(ctx, b.ID, expenseInput("EQUAL", "Taxi", "99", &group.ID, nil, equalParticipants(a.ID, b.ID, c.ID)))
		require.NoError(t, err)

		nets := func() map[string]int64 {
			positions, err := e.balances.GetGroupSummary(ctx, group.ID)
			require.NoError(t, err)
			out := map[string]int64{}
			for _, p := range positions {
				out[p.UserID] = p.NetBalance
			}
			return out
		}
		before := nets()
		require.Equal(t, int64(-333), before[idutil.String(a.ID)])
		require.Equal(t, int64(-234), before[idutil.String(b.ID)])
		require.Equal(t, int64(567), before[idutil.String(c.ID)])

		codeOf := func(err error) string {
			var apiErr *httpx.APIError
			require.ErrorAs(t, err, &apiErr)
			return apiErr.Code
		}

		// C owes nothing; B is owed nothing (net < 0); more than A owes.
		_, err = settle(e, ctx, c.ID, settleInput(a.ID, "10", &group.ID))
		assert.Equal(t, "NO_OUTSTANDING_DEBT", codeOf(err))
		_, err = settle(e, ctx, a.ID, settleInput(b.ID, "10", &group.ID))
		assert.Equal(t, "RECIPIENT_NOT_OWED", codeOf(err))
		_, err = settle(e, ctx, a.ID, settleInput(c.ID, "334", &group.ID))
		assert.Equal(t, "EXCEEDS_OUTSTANDING_DEBT", codeOf(err))

		// The simplified plan's A -> C 333 is payable (pairwise alone
		// would have capped it at 300), and only A's and C's nets move.
		_, err = settle(e, ctx, a.ID, settleInput(c.ID, "333", &group.ID))
		require.NoError(t, err)
		after := nets()
		assert.Equal(t, int64(0), after[idutil.String(a.ID)])
		assert.Equal(t, int64(-234), after[idutil.String(b.ID)])
		assert.Equal(t, int64(234), after[idutil.String(c.ID)])

		// B's settlement is capped by C's remaining 234.
		_, err = settle(e, ctx, b.ID, settleInput(c.ID, "234", &group.ID))
		require.NoError(t, err)
		for id, net := range nets() {
			assert.Equal(t, int64(0), net, "net for %s", id)
		}
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

		_, err = settle(e, ctx, a.ID, settleInput(outsider.ID, "10", &group.ID))
		assert.Error(t, err)
	})

	t.Run("rejects settling with an unknown user", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		in := apitypes.CreateSettlementInput{ToUserID: "does-not-exist", Amount: "10"}
		_ = in.Validate()
		_, err := settle(e, context.Background(), a.ID, in)
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

		// The amount reads as money ("50" minor units = 0.50 ETB), not raw
		// minor units.
		list, err := e.notifySvc.List(ctx, recipient.ID, false, 100, 0)
		require.NoError(t, err)
		for _, n := range list {
			if n.Type == string(notifications.TypeSettlement) {
				assert.Equal(t, "Test Settler says they paid you 0.50 ETB. Confirm it once you've received it.", n.Body)
			}
		}
	})
}

func TestSettlementConfirmation(t *testing.T) {
	ctx := context.Background()

	// owes sets up a and b as friends with a owing b `amount` minor units
	// (b paid 2*amount, split equally).
	owes := func(t *testing.T, e env, amount int64) (db.Profile, db.Profile) {
		t.Helper()
		a := e.makeProfile(t, "Payer")
		b := e.makeProfile(t, "Recipient")
		e.makeFriends(t, a.ID, b.ID)
		_, err := e.expenses.Create(ctx, b.ID, expenseInput("EQUAL", "Dinner", fmt.Sprint(2*amount), nil, nil, equalParticipants(a.ID, b.ID)))
		require.NoError(t, err)
		return a, b
	}
	balance := func(t *testing.T, e env, a, b db.Profile) int64 {
		t.Helper()
		bal, err := e.balances.GetPairwiseBalance(ctx, a.ID, b.ID, pgtype.UUID{})
		require.NoError(t, err)
		return bal
	}
	bodies := func(t *testing.T, e env, user db.Profile) []string {
		t.Helper()
		list, err := e.notifySvc.List(ctx, user.ID, false, 100, 0)
		require.NoError(t, err)
		var out []string
		for _, n := range list {
			if n.Type == string(notifications.TypeSettlement) {
				out = append(out, n.Body)
			}
		}
		return out
	}

	t.Run("a recorded payment changes nothing until the recipient confirms it", func(t *testing.T) {
		e := setup(t)
		a, b := owes(t, e, 10000)

		req, err := e.svc.Create(ctx, a.ID, settleInput(b.ID, "4000", nil))
		require.NoError(t, err)
		assert.Equal(t, db.SettlementRequestStatusPENDING, req.Status)
		assert.Equal(t, int64(10000), balance(t, e, a, b), "pending must not move the balance")

		confirmed, err := e.svc.Confirm(ctx, b.ID, req.ID)
		require.NoError(t, err)
		assert.Equal(t, db.SettlementRequestStatusCONFIRMED, confirmed.Status)
		assert.True(t, confirmed.SettlementID.Valid)
		// Part-payment: only what was paid comes off.
		assert.Equal(t, int64(6000), balance(t, e, a, b))
		assert.Equal(t, []string{"Test Recipient confirmed your payment of 40.00 ETB."}, bodies(t, e, a))

		_, err = e.svc.Confirm(ctx, b.ID, req.ID)
		assertAPIError(t, err, "NOT_PENDING")
		assert.Equal(t, int64(6000), balance(t, e, a, b), "confirming twice must not settle twice")
	})

	t.Run("only the recipient confirms or rejects; only the payer cancels", func(t *testing.T) {
		e := setup(t)
		a, b := owes(t, e, 10000)
		stranger := e.makeProfile(t, "Stranger")
		req, err := e.svc.Create(ctx, a.ID, settleInput(b.ID, "1000", nil))
		require.NoError(t, err)

		_, err = e.svc.Confirm(ctx, a.ID, req.ID)
		assertAPIError(t, err, "NOT_REQUEST_RECIPIENT")
		_, err = e.svc.Reject(ctx, a.ID, req.ID)
		assertAPIError(t, err, "NOT_REQUEST_RECIPIENT")
		_, err = e.svc.Cancel(ctx, b.ID, req.ID)
		assertAPIError(t, err, "NOT_REQUEST_PAYER")
		_, err = e.svc.Confirm(ctx, stranger.ID, req.ID)
		assertAPIError(t, err, "SETTLEMENT_REQUEST_NOT_FOUND")
		_, err = e.svc.ReceiptURL(ctx, stranger.ID, req.ID)
		assertAPIError(t, err, "SETTLEMENT_REQUEST_NOT_FOUND")

		mine, err := e.svc.List(ctx, a.ID)
		require.NoError(t, err)
		theirs, err := e.svc.List(ctx, b.ID)
		require.NoError(t, err)
		strangers, err := e.svc.List(ctx, stranger.ID)
		require.NoError(t, err)
		assert.Len(t, mine, 1)
		assert.Len(t, theirs, 1)
		assert.Empty(t, strangers)
	})

	t.Run("rejecting leaves the balance alone and tells the payer", func(t *testing.T) {
		e := setup(t)
		a, b := owes(t, e, 10000)
		req, err := e.svc.Create(ctx, a.ID, settleInput(b.ID, "10000", nil))
		require.NoError(t, err)

		rejected, err := e.svc.Reject(ctx, b.ID, req.ID)
		require.NoError(t, err)
		assert.Equal(t, db.SettlementRequestStatusREJECTED, rejected.Status)
		assert.Equal(t, int64(10000), balance(t, e, a, b))
		assert.Equal(t, []string{"Test Recipient says they didn't receive your payment of 100.00 ETB."}, bodies(t, e, a))

		_, err = e.svc.Confirm(ctx, b.ID, req.ID)
		assertAPIError(t, err, "NOT_PENDING")
		// A rejected claim no longer counts against what can be recorded.
		_, err = e.svc.Create(ctx, a.ID, settleInput(b.ID, "10000", nil))
		require.NoError(t, err)
	})

	t.Run("the payer can cancel while it's pending", func(t *testing.T) {
		e := setup(t)
		a, b := owes(t, e, 10000)
		req, err := e.svc.Create(ctx, a.ID, settleInput(b.ID, "5000", nil))
		require.NoError(t, err)

		cancelled, err := e.svc.Cancel(ctx, a.ID, req.ID)
		require.NoError(t, err)
		assert.Equal(t, db.SettlementRequestStatusCANCELLED, cancelled.Status)
		assert.Equal(t, int64(10000), balance(t, e, a, b))
		_, err = e.svc.Confirm(ctx, b.ID, req.ID)
		assertAPIError(t, err, "NOT_PENDING")
	})

	t.Run("pending claims count against what can be recorded", func(t *testing.T) {
		e := setup(t)
		a, b := owes(t, e, 10000)
		_, err := e.svc.Create(ctx, a.ID, settleInput(b.ID, "6000", nil))
		require.NoError(t, err)

		_, err = e.svc.Create(ctx, a.ID, settleInput(b.ID, "5000", nil))
		assertAPIError(t, err, "EXCEEDS_OUTSTANDING_DEBT")
		_, err = e.svc.Create(ctx, a.ID, settleInput(b.ID, "4000", nil))
		require.NoError(t, err)
	})

	t.Run("confirming re-checks the live debt", func(t *testing.T) {
		e := setup(t)
		a, b := owes(t, e, 10000)
		req, err := e.svc.Create(ctx, a.ID, settleInput(b.ID, "10000", nil))
		require.NoError(t, err)

		// Meanwhile b records 50.00 received in cash: a now owes 50.00.
		_, err = e.svc.RecordReceived(ctx, b.ID, receivedInput(a.ID, "5000", nil))
		require.NoError(t, err)

		_, err = e.svc.Confirm(ctx, b.ID, req.ID)
		assertAPIError(t, err, "EXCEEDS_OUTSTANDING_DEBT")
		assert.Equal(t, int64(5000), balance(t, e, a, b))
		// Still pending, so b can reject it instead.
		_, err = e.svc.Reject(ctx, b.ID, req.ID)
		require.NoError(t, err)
	})

	t.Run("the recipient recording a payment counts at once, capped at what's owed", func(t *testing.T) {
		e := setup(t)
		a, b := owes(t, e, 10000)

		_, err := e.svc.RecordReceived(ctx, b.ID, receivedInput(a.ID, "10001", nil))
		assertAPIError(t, err, "EXCEEDS_OUTSTANDING_DEBT")
		// a doesn't get to record "b paid me": b owes a nothing.
		_, err = e.svc.RecordReceived(ctx, a.ID, receivedInput(b.ID, "100", nil))
		assertAPIError(t, err, "NO_OUTSTANDING_DEBT")

		settlement, err := e.svc.RecordReceived(ctx, b.ID, receivedInput(a.ID, "2500", nil))
		require.NoError(t, err)
		assert.Equal(t, db.SplitTypeSETTLEMENT, settlement.SplitType)
		assert.Equal(t, a.ID, settlement.PaidByID)
		assert.Equal(t, int64(7500), balance(t, e, a, b))
		assert.Equal(t, []string{"Test Recipient recorded that you paid them 25.00 ETB."}, bodies(t, e, a))
	})

	t.Run("a receipt on the request carries over to the settlement", func(t *testing.T) {
		e := setup(t)
		a, b := owes(t, e, 10000)
		req, err := e.svc.Create(ctx, a.ID, settleInput(b.ID, "1000", nil))
		require.NoError(t, err)
		_, err = e.pool.Exec(ctx, `UPDATE settlement_requests SET receipt_path = 'settlement-requests/x/y.png' WHERE id = $1`, req.ID)
		require.NoError(t, err)

		confirmed, err := e.svc.Confirm(ctx, b.ID, req.ID)
		require.NoError(t, err)
		var path pgtype.Text
		require.NoError(t, e.pool.QueryRow(ctx, `SELECT receipt_path FROM expenses WHERE id = $1`, confirmed.SettlementID).Scan(&path))
		assert.Equal(t, "settlement-requests/x/y.png", path.String)
	})
}

func receivedInput(fromUserID pgtype.UUID, amount string, groupID *pgtype.UUID) apitypes.RecordReceivedInput {
	in := apitypes.RecordReceivedInput{FromUserID: idutil.String(fromUserID), Amount: amount}
	if groupID != nil {
		s := idutil.String(*groupID)
		in.GroupID = &s
	}
	_ = in.Validate()
	return in
}

func assertAPIError(t *testing.T, err error, code string) {
	t.Helper()
	var apiErr *httpx.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, code, apiErr.Code)
}
