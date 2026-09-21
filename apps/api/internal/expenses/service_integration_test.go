package expenses_test

import (
	"bytes"
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
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
	svc          *expenses.Service
	groupsSvc    *groups.Service
	notifySvc    *notifications.Service
	receiptStore *storage.ReceiptStorage
	pool         *pgxpool.Pool
	makeProfile  func(t *testing.T, label string) db.Profile
	makeFriends  func(t *testing.T, a, b pgtype.UUID)
	trackExpense func(id pgtype.UUID)
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
	svc := expenses.NewService(queries, groupsSvc, friendsSvc, notifySvc, receiptStore)

	var profiles, groupIDs, expenseIDs []pgtype.UUID
	t.Cleanup(func() {
		ctx := context.Background()
		for _, id := range expenseIDs {
			var receiptPath pgtype.Text
			pool.QueryRow(ctx, `SELECT receipt_path FROM expenses WHERE id = $1`, id).Scan(&receiptPath)
			if receiptPath.Valid {
				receiptStore.Delete(ctx, receiptPath.String)
			}
			pool.Exec(ctx, `DELETE FROM expense_participants WHERE expense_id = $1`, id)
			pool.Exec(ctx, `DELETE FROM expense_notes WHERE expense_id = $1`, id)
			pool.Exec(ctx, `DELETE FROM expenses WHERE id = $1`, id)
		}
		for _, id := range groupIDs {
			pool.Exec(ctx, `DELETE FROM group_members WHERE group_id = $1`, id)
			pool.Exec(ctx, `DELETE FROM groups WHERE id = $1`, id)
		}
		for _, id := range profiles {
			pool.Exec(ctx, `DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1`, id)
			pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = $1`, id)
			pool.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, id)
		}
	})

	makeProfile := func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-expenses-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
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
		svc: svc, groupsSvc: groupsSvc, notifySvc: notifySvc, receiptStore: receiptStore, pool: pool,
		makeProfile: makeProfile, makeFriends: makeFriendsFn,
		trackExpense: func(id pgtype.UUID) { expenseIDs = append(expenseIDs, id) },
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

func baseInput(splitType, name, amount string, participants []apitypes.ExpenseParticipantRaw) apitypes.CreateExpenseInput {
	in := apitypes.CreateExpenseInput{
		SplitType: splitType, Name: name, Category: "Food", Amount: amount,
		ExpenseDate: time.Now().Format(time.RFC3339), Participants: participants,
	}
	_ = in.Validate()
	return in
}

func TestService_PersonalExpenses(t *testing.T) {
	t.Run("creates an EQUAL split between friends with correct remainder distribution", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := baseInput("EQUAL", "Dinner", "100", equalParticipants(payer.ID, friend.ID))
		expense, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)
		e.trackExpense(expense.ID)

		amounts := []int64{expense.Participants[0].Amount, expense.Participants[1].Amount}
		assert.ElementsMatch(t, []int64{50, 50}, amounts)
		assert.Equal(t, "ETB", expense.Currency)
	})

	t.Run("rejects a non-friend participant", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		stranger := e.makeProfile(t, "Stranger")

		in := baseInput("EQUAL", "Dinner", "100", equalParticipants(payer.ID, stranger.ID))
		_, err := e.svc.Create(context.Background(), payer.ID, in)
		assert.Error(t, err)
	})

	t.Run("rejects an actor who is neither payer nor participant", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		bystander := e.makeProfile(t, "Bystander")
		e.makeFriends(t, payer.ID, friend.ID)
		e.makeFriends(t, payer.ID, bystander.ID)
		e.makeFriends(t, friend.ID, bystander.ID)

		in := baseInput("EQUAL", "Dinner", "100", equalParticipants(payer.ID, friend.ID))
		in.PaidByID = strPtr(idutil.String(payer.ID))
		_, err := e.svc.Create(context.Background(), bystander.ID, in)
		assert.Error(t, err)
	})

	t.Run("rejects EXACT shares that do not sum to the total", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := baseInput("EXACT", "Dinner", "100", []apitypes.ExpenseParticipantRaw{
			{UserID: idutil.String(payer.ID), Amount: "40"}, {UserID: idutil.String(friend.ID), Amount: "40"},
		})
		_, err := e.svc.Create(context.Background(), payer.ID, in)
		assert.Error(t, err)
	})

	t.Run("rejects PERCENTAGE shares that do not sum to 100", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := baseInput("PERCENTAGE", "Dinner", "100", []apitypes.ExpenseParticipantRaw{
			{UserID: idutil.String(payer.ID), Percentage: 40}, {UserID: idutil.String(friend.ID), Percentage: 40},
		})
		_, err := e.svc.Create(context.Background(), payer.ID, in)
		assert.Error(t, err)
	})

	t.Run("computes a SHARES split proportionally", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := baseInput("SHARES", "Rent", "300", []apitypes.ExpenseParticipantRaw{
			{UserID: idutil.String(payer.ID), Shares: 1}, {UserID: idutil.String(friend.ID), Shares: 2},
		})
		expense, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)
		e.trackExpense(expense.ID)

		byUser := map[pgtype.UUID]int64{}
		for _, p := range expense.Participants {
			byUser[p.UserID] = p.Amount
		}
		assert.Equal(t, int64(100), byUser[payer.ID])
		assert.Equal(t, int64(200), byUser[friend.ID])
	})

	t.Run("soft-deletes: the row survives but becomes invisible via findById", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := baseInput("EQUAL", "Coffee", "20", equalParticipants(payer.ID, friend.ID))
		expense, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)
		e.trackExpense(expense.ID)

		require.NoError(t, e.svc.SoftDelete(context.Background(), payer.ID, expense.ID))

		_, err = e.svc.FindByID(context.Background(), payer.ID, expense.ID)
		assert.Error(t, err)

		var deletedAt pgtype.Timestamptz
		require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT deleted_at FROM expenses WHERE id = $1`, expense.ID).Scan(&deletedAt))
		assert.True(t, deletedAt.Valid)
	})

	t.Run("only lets the payer or a group admin edit an expense", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := baseInput("EQUAL", "Coffee", "20", equalParticipants(payer.ID, friend.ID))
		expense, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)
		e.trackExpense(expense.ID)

		update := baseInput("EQUAL", "Coffee (edited)", "25", equalParticipants(payer.ID, friend.ID))
		_, err = e.svc.Update(context.Background(), friend.ID, expense.ID, update)
		assert.Error(t, err)
	})
}

func TestService_GroupExpenses(t *testing.T) {
	t.Run("forces the group currency and rejects a non-member participant", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		friend := e.makeProfile(t, "Friend")
		outsider := e.makeProfile(t, "Outsider")
		e.makeFriends(t, owner.ID, friend.ID)
		e.makeFriends(t, owner.ID, outsider.ID)

		simplify := true
		group, err := e.groupsSvc.Create(context.Background(), owner.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("USD"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID)},
		})
		require.NoError(t, err)
		_, err = e.groupsSvc.AcceptInvite(context.Background(), friend.ID, group.ID)
		require.NoError(t, err)

		groupIDStr := idutil.String(group.ID)
		in := baseInput("EQUAL", "Taxi", "100", equalParticipants(owner.ID, outsider.ID))
		in.Currency = strPtr("ETB")
		in.GroupID = &groupIDStr
		_, err = e.svc.Create(context.Background(), owner.ID, in)
		assert.Error(t, err)

		valid := baseInput("EQUAL", "Taxi", "100", equalParticipants(owner.ID, friend.ID))
		valid.Currency = strPtr("ETB")
		valid.GroupID = &groupIDStr
		expense, err := e.svc.Create(context.Background(), owner.ID, valid)
		require.NoError(t, err)
		e.trackExpense(expense.ID)
		assert.Equal(t, "USD", expense.Currency)
	})

	t.Run("a member who leaves the group loses visibility into an expense they were not a participant of", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		friend := e.makeProfile(t, "Friend")
		observer := e.makeProfile(t, "Observer")
		e.makeFriends(t, owner.ID, friend.ID)
		e.makeFriends(t, owner.ID, observer.ID)
		e.makeFriends(t, friend.ID, observer.ID)

		simplify := true
		group, err := e.groupsSvc.Create(context.Background(), owner.ID, apitypes.CreateGroupInput{
			Name: "Trip", Type: strPtr("TRIP"), Currency: strPtr("ETB"), SimplifyDebts: &simplify,
			MemberIDs: []string{idutil.String(friend.ID), idutil.String(observer.ID)},
		})
		require.NoError(t, err)
		_, err = e.groupsSvc.AcceptInvite(context.Background(), friend.ID, group.ID)
		require.NoError(t, err)
		_, err = e.groupsSvc.AcceptInvite(context.Background(), observer.ID, group.ID)
		require.NoError(t, err)

		groupIDStr := idutil.String(group.ID)
		in := baseInput("EQUAL", "Hotel", "200", equalParticipants(owner.ID, friend.ID))
		in.GroupID = &groupIDStr
		expense, err := e.svc.Create(context.Background(), owner.ID, in)
		require.NoError(t, err)
		e.trackExpense(expense.ID)

		_, err = e.svc.FindByID(context.Background(), observer.ID, expense.ID)
		assert.NoError(t, err)

		require.NoError(t, e.groupsSvc.RemoveMember(context.Background(), observer.ID, group.ID, observer.ID))

		_, err = e.svc.FindByID(context.Background(), observer.ID, expense.ID)
		assert.Error(t, err)
	})
}

func countNotifications(t *testing.T, notifySvc *notifications.Service, userID pgtype.UUID, notifType notifications.Type) int {
	t.Helper()
	list, err := notifySvc.List(context.Background(), userID, false, 100, 0)
	require.NoError(t, err)
	count := 0
	for _, n := range list {
		if n.Type == string(notifType) {
			count++
		}
	}
	return count
}

func TestService_Notifications(t *testing.T) {
	t.Run("notifies the other participant on create, not the actor", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "NotifyPayer")
		friend := e.makeProfile(t, "NotifyFriend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := baseInput("EQUAL", "Coffee", "100", equalParticipants(payer.ID, friend.ID))
		expense, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)
		e.trackExpense(expense.ID)

		assert.Equal(t, 0, countNotifications(t, e.notifySvc, payer.ID, notifications.TypeExpenseAdded))
		assert.Equal(t, 1, countNotifications(t, e.notifySvc, friend.ID, notifications.TypeExpenseAdded))

		list, err := e.notifySvc.List(context.Background(), friend.ID, false, 100, 0)
		require.NoError(t, err)
		found := false
		for _, n := range list {
			if n.Type == string(notifications.TypeExpenseAdded) {
				assert.Contains(t, n.Body, "Coffee")
				found = true
			}
		}
		assert.True(t, found)
	})

	t.Run("notifies participants on edit and on soft delete", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "NotifyEditPayer")
		friend := e.makeProfile(t, "NotifyEditFriend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := baseInput("EQUAL", "Groceries", "100", equalParticipants(payer.ID, friend.ID))
		expense, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)
		e.trackExpense(expense.ID)

		update := baseInput("EQUAL", "Groceries (updated)", "120", equalParticipants(payer.ID, friend.ID))
		_, err = e.svc.Update(context.Background(), payer.ID, expense.ID, update)
		require.NoError(t, err)
		assert.Equal(t, 1, countNotifications(t, e.notifySvc, friend.ID, notifications.TypeExpenseEdited))

		require.NoError(t, e.svc.SoftDelete(context.Background(), payer.ID, expense.ID))
		assert.Equal(t, 1, countNotifications(t, e.notifySvc, friend.ID, notifications.TypeExpenseDeleted))
	})
}

func makeExpense(t *testing.T, e env, payerID pgtype.UUID, participantIDs ...pgtype.UUID) expenses.Expense {
	t.Helper()
	all := append([]pgtype.UUID{payerID}, participantIDs...)
	in := baseInput("EQUAL", "Receipt test expense", "100", equalParticipants(all...))
	expense, err := e.svc.Create(context.Background(), payerID, in)
	require.NoError(t, err)
	e.trackExpense(expense.ID)
	return expense
}

func urlStillFetchable(t *testing.T, store *storage.ReceiptStorage, key string) bool {
	t.Helper()
	url, err := store.GetPresignedGetURL(context.Background(), key)
	require.NoError(t, err)
	resp, err := http.Get(url)
	require.NoError(t, err)
	defer resp.Body.Close()
	return resp.StatusCode < 300
}

func TestService_Receipts(t *testing.T) {
	t.Run("uploads a receipt, and a second upload replaces it", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "ReceiptPayer")
		expense := makeExpense(t, e, payer.ID)
		ctx := context.Background()

		first, err := e.svc.UploadReceipt(ctx, payer.ID, expense.ID, bytes.NewReader([]byte("first-image")), 11, "image/jpeg")
		require.NoError(t, err)
		require.True(t, first.ReceiptPath.Valid)
		firstKey := first.ReceiptPath.String
		assert.Regexp(t, fmt.Sprintf(`^receipts/%s/.+\.jpg$`, expense.ID), firstKey)

		second, err := e.svc.UploadReceipt(ctx, payer.ID, expense.ID, bytes.NewReader([]byte("second-image")), 12, "image/png")
		require.NoError(t, err)
		require.True(t, second.ReceiptPath.Valid)
		assert.NotEqual(t, firstKey, second.ReceiptPath.String)
		assert.Regexp(t, `\.png$`, second.ReceiptPath.String)

		assert.False(t, urlStillFetchable(t, e.receiptStore, firstKey), "old receipt object should be deleted after replacement")
	})

	t.Run("rejects an unsupported mimetype and an oversized file", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "ReceiptPayer")
		expense := makeExpense(t, e, payer.ID)
		ctx := context.Background()

		_, err := e.svc.UploadReceipt(ctx, payer.ID, expense.ID, bytes.NewReader([]byte("pdf")), 3, "application/pdf")
		assert.Error(t, err)

		_, err = e.svc.UploadReceipt(ctx, payer.ID, expense.ID, bytes.NewReader(make([]byte, 11*1024*1024)), 11*1024*1024, "image/jpeg")
		assert.Error(t, err)
	})

	t.Run("lets a visible participant read the receipt URL, but only the payer/admin upload or delete it", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "ReceiptPayer")
		friend := e.makeProfile(t, "ReceiptFriend")
		stranger := e.makeProfile(t, "ReceiptStranger")
		e.makeFriends(t, payer.ID, friend.ID)
		expense := makeExpense(t, e, payer.ID, friend.ID)
		ctx := context.Background()

		uploaded, err := e.svc.UploadReceipt(ctx, payer.ID, expense.ID, bytes.NewReader([]byte("img")), 3, "image/webp")
		require.NoError(t, err)

		url, err := e.svc.GetReceiptURL(ctx, friend.ID, expense.ID)
		require.NoError(t, err)
		assert.Contains(t, url, uploaded.ReceiptPath.String)

		_, err = e.svc.GetReceiptURL(ctx, stranger.ID, expense.ID)
		assert.Error(t, err)
		_, err = e.svc.UploadReceipt(ctx, friend.ID, expense.ID, bytes.NewReader([]byte("img")), 3, "image/webp")
		assert.Error(t, err)
		assert.Error(t, e.svc.DeleteReceipt(ctx, friend.ID, expense.ID))
	})

	t.Run("deletes a receipt, clearing receiptPath and the stored object", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "ReceiptPayer")
		expense := makeExpense(t, e, payer.ID)
		ctx := context.Background()

		uploaded, err := e.svc.UploadReceipt(ctx, payer.ID, expense.ID, bytes.NewReader([]byte("img")), 3, "image/png")
		require.NoError(t, err)
		key := uploaded.ReceiptPath.String

		require.NoError(t, e.svc.DeleteReceipt(ctx, payer.ID, expense.ID))

		refreshed, err := e.svc.FindByID(ctx, payer.ID, expense.ID)
		require.NoError(t, err)
		assert.False(t, refreshed.ReceiptPath.Valid)
		assert.False(t, urlStillFetchable(t, e.receiptStore, key))
	})

	t.Run("rejects reading/deleting a receipt that does not exist", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "ReceiptPayer")
		expense := makeExpense(t, e, payer.ID)
		ctx := context.Background()

		_, err := e.svc.GetReceiptURL(ctx, payer.ID, expense.ID)
		assert.Error(t, err)
		assert.Error(t, e.svc.DeleteReceipt(ctx, payer.ID, expense.ID))
	})
}
