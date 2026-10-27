package reminders_test

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
	"github.com/Substance-k3n/abro/apps/api/internal/reminders"
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
	svc      *reminders.Service
	balances *balances.Service
	expenses *expenses.Service
	groups   *groups.Service
	pool     *pgxpool.Pool
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

	return env{
		svc:      reminders.NewService(queries, friendsSvc, balancesSvc, notifySvc),
		balances: balancesSvc, expenses: expensesSvc, groups: groupsSvc, pool: pool,
	}
}

// makeProfiles creates profiles cleaned up (with everything tied to
// them) after the test.
func (e env) makeProfiles(t *testing.T, labels ...string) []db.Profile {
	t.Helper()
	ctx := context.Background()
	out := make([]db.Profile, len(labels))
	ids := make([]pgtype.UUID, len(labels))
	for i, label := range labels {
		email := fmt.Sprintf("test-reminders-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
		p, err := db.New(e.pool).UpsertProfileByEmail(ctx, db.UpsertProfileByEmailParams{
			Email: pgtype.Text{String: email, Valid: true}, DisplayName: label,
		})
		require.NoError(t, err)
		out[i], ids[i] = p, p.ID
	}
	t.Cleanup(func() {
		e.pool.Exec(ctx, `DELETE FROM payment_reminders WHERE recipient_id = ANY($1::uuid[]) OR creditor_id = ANY($1::uuid[]) OR sender_id = ANY($1::uuid[])`, ids)
		e.pool.Exec(ctx, `DELETE FROM expense_participants WHERE user_id = ANY($1::uuid[]) OR expense_id IN (SELECT id FROM expenses WHERE paid_by_id = ANY($1::uuid[]))`, ids)
		e.pool.Exec(ctx, `DELETE FROM expenses WHERE paid_by_id = ANY($1::uuid[])`, ids)
		e.pool.Exec(ctx, `DELETE FROM group_members WHERE user_id = ANY($1::uuid[]) OR group_id IN (SELECT id FROM groups WHERE created_by_id = ANY($1::uuid[]))`, ids)
		e.pool.Exec(ctx, `DELETE FROM groups WHERE created_by_id = ANY($1::uuid[])`, ids)
		e.pool.Exec(ctx, `DELETE FROM friendships WHERE user_id = ANY($1::uuid[]) OR friend_id = ANY($1::uuid[])`, ids)
		e.pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, ids)
		e.pool.Exec(ctx, `DELETE FROM profiles WHERE id = ANY($1::uuid[])`, ids)
	})
	return out
}

func (e env) makeFriends(t *testing.T, a, b pgtype.UUID) {
	t.Helper()
	_, err := e.pool.Exec(context.Background(), `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'ACCEPTED')`, a, b)
	require.NoError(t, err)
}

// addExpense records an EQUAL expense paid by payer, added `age` ago.
func (e env) addExpense(t *testing.T, payer pgtype.UUID, amount string, groupID *pgtype.UUID, age time.Duration, participants ...pgtype.UUID) {
	t.Helper()
	in := apitypes.CreateExpenseInput{
		SplitType: "EQUAL", Name: "Test", Category: "Test", Amount: amount,
		ExpenseDate: time.Now().Format(time.RFC3339),
	}
	for _, id := range participants {
		in.Participants = append(in.Participants, apitypes.ExpenseParticipantRaw{UserID: idutil.String(id)})
	}
	if groupID != nil {
		s := idutil.String(*groupID)
		in.GroupID = &s
	}
	require.NoError(t, in.Validate())
	created, err := e.expenses.Create(context.Background(), payer, in)
	require.NoError(t, err)
	_, err = e.pool.Exec(context.Background(), `UPDATE expenses SET created_at = now() - $2::interval WHERE id = $1`,
		created.ID, fmt.Sprintf("%d seconds", int(age.Seconds())))
	require.NoError(t, err)
}

// reminderBodies is every payment reminder notification the user got.
func (e env) reminderBodies(t *testing.T, userID pgtype.UUID) []string {
	t.Helper()
	rows, err := e.pool.Query(context.Background(),
		`SELECT body FROM notifications WHERE user_id = $1 AND type = 'PAYMENT_REMINDER' ORDER BY created_at`, userID)
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

const day = 24 * time.Hour

func TestSendDue_Groups(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	p := e.makeProfiles(t, "Ana", "Bekele", "Chaltu", "Dawit")
	ana, bekele, chaltu, dawit := p[0].ID, p[1].ID, p[2].ID, p[3].ID
	for _, other := range []pgtype.UUID{bekele, chaltu, dawit} {
		e.makeFriends(t, ana, other)
	}

	group, err := e.groups.Create(ctx, ana, apitypes.CreateGroupInput{
		Name: "Flat", Currency: strPtr("ETB"),
		MemberIDs: []string{idutil.String(bekele), idutil.String(chaltu), idutil.String(dawit)},
	})
	require.NoError(t, err)
	for _, m := range []pgtype.UUID{bekele, chaltu, dawit} {
		_, err := e.groups.AcceptInvite(ctx, m, group.ID)
		require.NoError(t, err)
	}

	// 40 days ago Ana paid 900.00 for Ana, Bekele and Chaltu: 300.00 each.
	e.addExpense(t, ana, "90000", &group.ID, 40*day, ana, bekele, chaltu)
	// Chaltu then paid 600.00 for Ana and herself: she's back to 0.
	e.addExpense(t, chaltu, "60000", &group.ID, 2*day, ana, chaltu)
	// Dawit's debt (100.00) is only 5 days old.
	e.addExpense(t, ana, "20000", &group.ID, 5*day, ana, dawit)

	since, err := e.balances.GroupOwingSince(ctx, group.ID)
	require.NoError(t, err)
	assert.WithinDuration(t, time.Now().Add(-40*day), since[idutil.String(bekele)], time.Minute)
	assert.WithinDuration(t, time.Now().Add(-5*day), since[idutil.String(dawit)], time.Minute)
	assert.NotContains(t, since, idutil.String(chaltu), "Chaltu is settled")
	assert.NotContains(t, since, idutil.String(ana), "Ana is owed")

	now := time.Now()
	_, err = e.svc.SendDue(ctx, now)
	require.NoError(t, err)

	bodies := e.reminderBodies(t, bekele)
	require.Len(t, bodies, 1, "Bekele's 300.00 is 40 days old")
	assert.Contains(t, bodies[0], `Friendly reminder: you've owed 300.00 ETB in "Flat" since`)
	assert.Empty(t, e.reminderBodies(t, chaltu), "Chaltu owes nothing")
	assert.Empty(t, e.reminderBodies(t, dawit), "Dawit's debt isn't overdue yet")
	assert.Empty(t, e.reminderBodies(t, ana), "Ana is owed")

	t.Run("not again the same day, again after 14 days", func(t *testing.T) {
		_, err := e.svc.SendDue(ctx, now)
		require.NoError(t, err)
		assert.Len(t, e.reminderBodies(t, bekele), 1)

		_, err = e.svc.SendDue(ctx, now.Add(15*day))
		require.NoError(t, err)
		assert.Len(t, e.reminderBodies(t, bekele), 2)
	})

	t.Run("the reminder shows on the admin dashboard as automatic", func(t *testing.T) {
		latest, err := e.groups.LatestReminders(ctx, ana, group.ID)
		require.NoError(t, err)
		require.Len(t, latest, 1)
		assert.Equal(t, "AUTO", latest[0].Kind)
		assert.False(t, latest[0].SenderID.Valid)
	})

	t.Run("an admin can switch them off for the group", func(t *testing.T) {
		off := false
		_, err := e.groups.Update(ctx, ana, group.ID, apitypes.UpdateGroupInput{AutoRemind: &off})
		require.NoError(t, err)

		_, err = e.svc.SendDue(ctx, now.Add(30*day))
		require.NoError(t, err)
		assert.Len(t, e.reminderBodies(t, bekele), 2)
	})
}

func TestSendDue_Friends(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	p := e.makeProfiles(t, "Ana", "Bekele")
	ana, bekele := p[0].ID, p[1].ID
	e.makeFriends(t, ana, bekele)

	// Ana paid 1,000.00 for both 40 days ago (Bekele owes 500.00), and
	// 400.00 for both 10 days ago (200.00 more); Bekele has since paid
	// back 500.00. The oldest debt is covered: he owes 200.00 since then.
	e.addExpense(t, ana, "100000", nil, 40*day, ana, bekele)
	e.addExpense(t, ana, "40000", nil, 10*day, ana, bekele)
	e.addExpense(t, bekele, "50000", nil, 3*day, ana)

	since, ok, err := e.balances.PairwiseOwingSince(ctx, ana, bekele)
	require.NoError(t, err)
	require.True(t, ok)
	assert.WithinDuration(t, time.Now().Add(-10*day), since, time.Minute)

	_, err = e.svc.SendDue(ctx, time.Now())
	require.NoError(t, err)
	assert.Empty(t, e.reminderBodies(t, bekele), "the 200.00 left is only 10 days old")

	_, err = e.svc.SendDue(ctx, time.Now().Add(21*day))
	require.NoError(t, err)
	bodies := e.reminderBodies(t, bekele)
	require.Len(t, bodies, 1, "31 days later it is overdue")
	assert.Contains(t, bodies[0], "Friendly reminder: you've owed Ana 200.00 ETB since")

	t.Run("not when the person owed switched them off", func(t *testing.T) {
		on, err := e.svc.SetAutoRemindFriends(ctx, ana, false)
		require.NoError(t, err)
		assert.False(t, on)

		_, err = e.svc.SendDue(ctx, time.Now().Add(40*day))
		require.NoError(t, err)
		assert.Len(t, e.reminderBodies(t, bekele), 1)
	})
}

func TestRemindFriend(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	p := e.makeProfiles(t, "Ana", "Bekele", "Stranger")
	ana, bekele, stranger := p[0].ID, p[1].ID, p[2].ID
	e.makeFriends(t, ana, bekele)
	// 40 days old, so the daily job would remind too.
	e.addExpense(t, ana, "30000", nil, 40*day, ana, bekele)

	_, ok, err := e.svc.LatestFriendReminder(ctx, ana, bekele)
	require.NoError(t, err)
	assert.False(t, ok)

	reminder, err := e.svc.RemindFriend(ctx, ana, bekele)
	require.NoError(t, err)
	assert.Equal(t, "MANUAL", reminder.Kind)
	bodies := e.reminderBodies(t, bekele)
	require.Len(t, bodies, 1)
	assert.Equal(t, "Ana reminded you that you owe them 150.00 ETB.", bodies[0])

	t.Run("once per 24 hours", func(t *testing.T) {
		_, err := e.svc.RemindFriend(ctx, ana, bekele)
		var apiErr *httpx.APIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, "REMINDER_TOO_SOON", apiErr.Code)
	})

	t.Run("a manual reminder holds off the automatic one", func(t *testing.T) {
		_, err := e.svc.SendDue(ctx, time.Now())
		require.NoError(t, err)
		assert.Len(t, e.reminderBodies(t, bekele), 1)
	})

	t.Run("the latest is there for the button", func(t *testing.T) {
		latest, ok, err := e.svc.LatestFriendReminder(ctx, ana, bekele)
		require.NoError(t, err)
		require.True(t, ok)
		assert.Equal(t, reminder.ID, latest.ID)
	})

	t.Run("only someone who is owed", func(t *testing.T) {
		_, err := e.svc.RemindFriend(ctx, bekele, ana)
		var apiErr *httpx.APIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, "NOTHING_OWED", apiErr.Code)
	})

	t.Run("only friends", func(t *testing.T) {
		_, err := e.svc.RemindFriend(ctx, stranger, ana)
		var apiErr *httpx.APIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, "NOT_FRIENDS", apiErr.Code)
	})

	t.Run("not yourself", func(t *testing.T) {
		_, err := e.svc.RemindFriend(ctx, ana, ana)
		var apiErr *httpx.APIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, "CANNOT_REMIND_SELF", apiErr.Code)
	})
}

func strPtr(s string) *string { return &s }
