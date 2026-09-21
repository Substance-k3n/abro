package recurring_test

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
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
	"github.com/Substance-k3n/abro/apps/api/internal/recurring"
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
	svc         *recurring.Service
	expenses    *expenses.Service
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
	svc := recurring.NewService(queries, expensesSvc, notifySvc)

	var profiles []pgtype.UUID
	t.Cleanup(func() {
		ctx := context.Background()
		pool.Exec(ctx, `DELETE FROM recurring_expenses WHERE template_expense_id IN (SELECT id FROM expenses WHERE paid_by_id = ANY($1::uuid[]))`, profiles)
		pool.Exec(ctx, `DELETE FROM expense_participants WHERE expense_id IN (SELECT id FROM expenses WHERE paid_by_id = ANY($1::uuid[]))`, profiles)
		pool.Exec(ctx, `DELETE FROM expenses WHERE paid_by_id = ANY($1::uuid[])`, profiles)
		pool.Exec(ctx, `DELETE FROM friendships WHERE user_id = ANY($1::uuid[]) OR friend_id = ANY($1::uuid[])`, profiles)
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, profiles)
		pool.Exec(ctx, `DELETE FROM profiles WHERE id = ANY($1::uuid[])`, profiles)
	})

	makeProfile := func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-recurring-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
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

	return env{svc: svc, expenses: expensesSvc, notifySvc: notifySvc, pool: pool, makeProfile: makeProfile, makeFriends: makeFriendsFn}
}

func equalParticipants(userIDs ...pgtype.UUID) []apitypes.ExpenseParticipantRaw {
	out := make([]apitypes.ExpenseParticipantRaw, len(userIDs))
	for i, id := range userIDs {
		out[i] = apitypes.ExpenseParticipantRaw{UserID: idutil.String(id)}
	}
	return out
}

func recurringInput(name, amount, frequency, expenseDate string, participants []apitypes.ExpenseParticipantRaw) apitypes.CreateRecurringExpenseInput {
	in := apitypes.CreateRecurringExpenseInput{
		CreateExpenseInput: apitypes.CreateExpenseInput{
			SplitType: "EQUAL", Name: name, Category: "Test", Amount: amount,
			ExpenseDate: expenseDate, Participants: participants,
		},
		Frequency: frequency,
	}
	_ = in.Validate()
	return in
}

func TestService_Create(t *testing.T) {
	t.Run("creates a template Expense and computes nextRunAt one period ahead", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := recurringInput("Rent", "1000", "MONTHLY", "2024-01-15T00:00:00Z", equalParticipants(payer.ID, friend.ID))
		created, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)

		assert.Equal(t, db.RecurringFrequencyMONTHLY, created.Frequency)
		assert.True(t, created.Enabled)
		assert.Equal(t, "Rent", created.Template.Name)
		assert.Equal(t, "2024-02-15T00:00:00Z", created.NextRunAt.Time.UTC().Format(time.RFC3339))
	})

	t.Run("lists templates visible to a personal-expense participant", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		stranger := e.makeProfile(t, "Stranger")
		e.makeFriends(t, payer.ID, friend.ID)

		in := recurringInput("Internet", "500", "MONTHLY", "2024-01-01T00:00:00Z", equalParticipants(payer.ID, friend.ID))
		created, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)

		friendList, err := e.svc.ListMine(context.Background(), friend.ID)
		require.NoError(t, err)
		found := false
		for _, r := range friendList {
			if r.ID == created.ID {
				found = true
			}
		}
		assert.True(t, found)

		strangerList, err := e.svc.ListMine(context.Background(), stranger.ID)
		require.NoError(t, err)
		for _, r := range strangerList {
			assert.NotEqual(t, created.ID, r.ID)
		}
	})
}

func TestService_SetEnabled(t *testing.T) {
	t.Run("lets the payer disable and re-enable, but rejects an uninvolved user", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		outsider := e.makeProfile(t, "Outsider")

		in := recurringInput("Subscription", "200", "MONTHLY", "2024-01-01T00:00:00Z", equalParticipants(payer.ID))
		created, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)

		_, err = e.svc.SetEnabled(context.Background(), outsider.ID, created.ID, false)
		assert.Error(t, err)

		disabled, err := e.svc.SetEnabled(context.Background(), payer.ID, created.ID, false)
		require.NoError(t, err)
		assert.False(t, disabled.Enabled)
	})
}

func TestService_GenerateDue(t *testing.T) {
	t.Run("generates an independent Expense for a due template and advances nextRunAt by one period", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := recurringInput("Household bill", "300", "WEEKLY", "2024-01-01T00:00:00Z", equalParticipants(payer.ID, friend.ID))
		created, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)

		// nextRunAt is 2024-01-08; due as of "now".
		generated, err := e.svc.GenerateDue(context.Background(), time.Date(2024, 1, 8, 0, 0, 0, 0, time.UTC))
		require.NoError(t, err)
		assert.Equal(t, 1, generated)

		var count int
		require.NoError(t, e.pool.QueryRow(context.Background(),
			`SELECT count(*) FROM expenses WHERE name = $1 AND id != $2`, "Household bill", created.Template.ID).Scan(&count))
		assert.Equal(t, 1, count)

		var nextRunAt pgtype.Timestamptz
		require.NoError(t, e.pool.QueryRow(context.Background(),
			`SELECT next_run_at FROM recurring_expenses WHERE id = $1`, created.ID).Scan(&nextRunAt))
		assert.Equal(t, "2024-01-15T00:00:00Z", nextRunAt.Time.UTC().Format(time.RFC3339))
	})

	t.Run("notifies participants except the payer when a recurring expense generates", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")
		friend := e.makeProfile(t, "Friend")
		e.makeFriends(t, payer.ID, friend.ID)

		in := recurringInput("Notify Bill", "100", "WEEKLY", "2024-01-01T00:00:00Z", equalParticipants(payer.ID, friend.ID))
		_, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)

		_, err = e.svc.GenerateDue(context.Background(), time.Date(2024, 1, 8, 0, 0, 0, 0, time.UTC))
		require.NoError(t, err)

		countOf := func(userID pgtype.UUID) int {
			list, err := e.notifySvc.List(context.Background(), userID, false, 100, 0)
			require.NoError(t, err)
			count := 0
			for _, n := range list {
				if n.Type == string(notifications.TypeRecurringExpense) {
					count++
				}
			}
			return count
		}
		assert.Equal(t, 1, countOf(friend.ID))
		assert.Equal(t, 0, countOf(payer.ID))
	})

	t.Run("does not generate for a disabled template or one not yet due", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")

		disabled := recurringInput("Disabled bill", "150", "WEEKLY", "2024-01-01T00:00:00Z", equalParticipants(payer.ID))
		disabledCreated, err := e.svc.Create(context.Background(), payer.ID, disabled)
		require.NoError(t, err)
		_, err = e.svc.SetEnabled(context.Background(), payer.ID, disabledCreated.ID, false)
		require.NoError(t, err)

		future := recurringInput("Future bill", "150", "YEARLY", "2030-01-01T00:00:00Z", equalParticipants(payer.ID))
		_, err = e.svc.Create(context.Background(), payer.ID, future)
		require.NoError(t, err)

		_, err = e.svc.GenerateDue(context.Background(), time.Date(2024, 1, 8, 0, 0, 0, 0, time.UTC))
		require.NoError(t, err)

		var count int
		require.NoError(t, e.pool.QueryRow(context.Background(),
			`SELECT count(*) FROM expenses WHERE name IN ('Disabled bill', 'Future bill')`).Scan(&count))
		assert.Equal(t, 2, count)
	})

	t.Run("editing the template afterward never changes an already-generated occurrence's amount", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "Payer")

		in := recurringInput("Editable bill", "400", "MONTHLY", "2024-01-01T00:00:00Z", equalParticipants(payer.ID))
		created, err := e.svc.Create(context.Background(), payer.ID, in)
		require.NoError(t, err)

		_, err = e.svc.GenerateDue(context.Background(), time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC))
		require.NoError(t, err)

		var generatedID pgtype.UUID
		var generatedAmount int64
		require.NoError(t, e.pool.QueryRow(context.Background(),
			`SELECT id, amount FROM expenses WHERE name = 'Editable bill' AND id != $1`, created.Template.ID).Scan(&generatedID, &generatedAmount))
		assert.Equal(t, int64(400), generatedAmount)

		update := apitypes.CreateExpenseInput{
			SplitType: "EQUAL", Name: "Editable bill", Category: "Test", Amount: "900",
			ExpenseDate:  created.Template.ExpenseDate.Time.Format(time.RFC3339),
			Participants: equalParticipants(payer.ID),
		}
		_ = update.Validate()
		_, err = e.expenses.Update(context.Background(), payer.ID, created.Template.ID, update)
		require.NoError(t, err)

		var afterAmount int64
		require.NoError(t, e.pool.QueryRow(context.Background(),
			`SELECT amount FROM expenses WHERE id = $1`, generatedID).Scan(&afterAmount))
		assert.Equal(t, int64(400), afterAmount)
	})
}
