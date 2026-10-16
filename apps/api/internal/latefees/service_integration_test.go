package latefees_test

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
	"github.com/Substance-k3n/abro/apps/api/internal/latefees"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

type env struct {
	pool     *pgxpool.Pool
	groups   *groups.Service
	expenses *expenses.Service
	balances *balances.Service
	fees     *latefees.Service
	people   []db.Profile // Abel (admin), Kidus, Sara, Dawit
	groupID  pgtype.UUID
}

func setup(t *testing.T) env {
	t.Helper()
	ctx := context.Background()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"
	}
	pool, err := pgxpool.New(ctx, url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	q := db.New(pool)
	notify := notifications.NewService(q)
	friendsSvc := friends.NewService(q, notify)
	groupsSvc := groups.NewService(q, friendsSvc, notify)
	expensesSvc := expenses.NewService(q, groupsSvc, friendsSvc, notify, nil)
	balancesSvc := balances.NewService(q, friendsSvc, groupsSvc)
	e := env{pool: pool, groups: groupsSvc, expenses: expensesSvc, balances: balancesSvc,
		fees: latefees.NewService(q, balancesSvc, notify)}

	var ids []pgtype.UUID
	t.Cleanup(func() {
		ctx := context.Background()
		pool.Exec(ctx, `DELETE FROM late_fee_days WHERE debtor_id = ANY($1::uuid[])`, ids)
		pool.Exec(ctx, `DELETE FROM expense_participants WHERE user_id = ANY($1::uuid[]) OR expense_id IN (SELECT id FROM expenses WHERE paid_by_id = ANY($1::uuid[]))`, ids)
		pool.Exec(ctx, `DELETE FROM expenses WHERE paid_by_id = ANY($1::uuid[])`, ids)
		pool.Exec(ctx, `DELETE FROM group_members WHERE user_id = ANY($1::uuid[])`, ids)
		pool.Exec(ctx, `DELETE FROM groups WHERE created_by_id = ANY($1::uuid[])`, ids)
		pool.Exec(ctx, `DELETE FROM friendships WHERE user_id = ANY($1::uuid[]) OR friend_id = ANY($1::uuid[])`, ids)
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, ids)
		pool.Exec(ctx, `DELETE FROM profiles WHERE id = ANY($1::uuid[])`, ids)
	})
	for _, name := range []string{"Abel", "Kidus", "Sara", "Dawit"} {
		p, err := q.UpsertProfileByEmail(ctx, db.UpsertProfileByEmailParams{
			Email:       pgtype.Text{String: fmt.Sprintf("test-latefees-%s-%d-%d@abro.test", name, time.Now().UnixNano(), rand.Intn(1_000_000)), Valid: true},
			DisplayName: "Test " + name,
		})
		require.NoError(t, err)
		ids = append(ids, p.ID)
		e.people = append(e.people, p)
	}
	var memberIDs []string
	for i, a := range ids {
		for _, b := range ids[i+1:] {
			_, err := pool.Exec(ctx, `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'ACCEPTED')`, a, b)
			require.NoError(t, err)
		}
		if i > 0 {
			memberIDs = append(memberIDs, idutil.String(a))
		}
	}
	etb, friendsType := "ETB", "FRIENDS"
	g, err := groupsSvc.Create(ctx, ids[0], apitypes.CreateGroupInput{Name: "Lunch", Type: &friendsType, Currency: &etb, MemberIDs: memberIDs})
	require.NoError(t, err)
	for _, id := range ids[1:] {
		_, err := groupsSvc.AcceptInvite(ctx, id, g.ID)
		require.NoError(t, err)
	}
	e.groupID = g.ID
	return e
}

func (e env) spend(t *testing.T, payer pgtype.UUID, amount string, who ...pgtype.UUID) expenses.Expense {
	t.Helper()
	gid := idutil.String(e.groupID)
	in := apitypes.CreateExpenseInput{SplitType: "EQUAL", Name: "Lunch", Category: "Food", Amount: amount,
		ExpenseDate: time.Now().Format(time.RFC3339), GroupID: &gid}
	for _, id := range who {
		in.Participants = append(in.Participants, apitypes.ExpenseParticipantRaw{UserID: idutil.String(id)})
	}
	require.NoError(t, in.Validate())
	ex, err := e.expenses.Create(context.Background(), payer, in)
	require.NoError(t, err)
	return ex
}

func (e env) setFees(t *testing.T, rate, grace, cap int32) {
	t.Helper()
	in := apitypes.UpdateGroupInput{InterestRateBP: &rate, InterestGraceDays: &grace, InterestCapBP: &cap}
	require.NoError(t, in.Validate())
	_, err := e.groups.Update(context.Background(), e.people[0].ID, e.groupID, in)
	require.NoError(t, err)
}

func (e env) nets(t *testing.T) map[string]int64 {
	t.Helper()
	summary, err := e.balances.GetGroupSummary(context.Background(), e.groupID)
	require.NoError(t, err)
	out := map[string]int64{}
	for _, p := range summary {
		out[p.UserID] = p.NetBalance
	}
	return out
}

func (e env) countNotes(t *testing.T, user pgtype.UUID, title string) int {
	t.Helper()
	var n int
	require.NoError(t, e.pool.QueryRow(context.Background(),
		`SELECT count(*) FROM notifications WHERE user_id = $1 AND type = 'LATE_FEE' AND title = $2`, user, title).Scan(&n))
	return n
}

func TestChargeDue(t *testing.T) {
	ctx := context.Background()
	e := setup(t)
	abel, kidus, sara, dawit := e.people[0].ID, e.people[1].ID, e.people[2].ID, e.people[3].ID
	k := idutil.String(kidus)

	// Abel pays 8,000 for four, eight days ago: the others owe 2,000.
	lunch := e.spend(t, abel, "800000", abel, kidus, sara, dawit)
	_, err := e.pool.Exec(ctx, `UPDATE expenses SET created_at = now() - interval '8 days' WHERE id = $1`, lunch.ID)
	require.NoError(t, err)

	// 1% a day after 7 days, up to 20%. Turned on today, so that
	// 8-day-old debt doesn't count.
	e.setFees(t, 100, 7, 2000)
	assert.Equal(t, 1, e.countNotes(t, kidus, "Late fees"), "members are told fees are on")
	now := time.Now()
	n, err := e.fees.ChargeDue(ctx, now)
	require.NoError(t, err)
	assert.Equal(t, 0, n, "debt from before fees were on is never charged")

	// As if they had been on for a month: day 2 after the grace period
	// (8 days - 7 = 1 whole day, +1) -> 1% of 2,000 = 20.00 each, all to
	// Abel, the only one owed.
	_, err = e.pool.Exec(ctx, `UPDATE groups SET interest_since = now() - interval '30 days' WHERE id = $1`, e.groupID)
	require.NoError(t, err)
	n, err = e.fees.ChargeDue(ctx, now)
	require.NoError(t, err)
	assert.Equal(t, 3, n)
	nets := e.nets(t)
	assert.Equal(t, int64(606000), nets[idutil.String(abel)])
	assert.Equal(t, int64(-202000), nets[k])
	assert.Equal(t, 1, e.countNotes(t, kidus, "Late fee started"))

	// The same day again (a restart): nobody is charged twice.
	n, err = e.fees.ChargeDue(ctx, now)
	require.NoError(t, err)
	assert.Equal(t, 0, n)
	assert.Equal(t, int64(-202000), e.nets(t)[k])

	// Sara pays a 2,000 bill for Abel: her debt is paid off, so her fee
	// stops (her 20.00 fee is still owed). Kidus and Dawit pay 20.00
	// more the next day, and aren't told again.
	e.spend(t, sara, "200000", abel)
	n, err = e.fees.ChargeDue(ctx, now.Add(24*time.Hour))
	require.NoError(t, err)
	assert.Equal(t, 2, n)
	nets = e.nets(t)
	assert.Equal(t, int64(-204000), nets[k])
	assert.Equal(t, int64(-2000), nets[idutil.String(sara)])
	assert.Equal(t, 1, e.countNotes(t, kidus, "Late fee started"))

	// Day 21 after the grace period: past the 20% cap -- nothing more.
	n, err = e.fees.ChargeDue(ctx, now.Add(20*24*time.Hour))
	require.NoError(t, err)
	assert.Equal(t, 0, n)

	// A late fee can't be edited, only deleted (waived).
	var feeID pgtype.UUID
	require.NoError(t, e.pool.QueryRow(ctx,
		`SELECT e.id FROM expenses e JOIN expense_participants p ON p.expense_id = e.id
		 WHERE e.split_type = 'INTEREST' AND p.user_id = $1 LIMIT 1`, kidus).Scan(&feeID))
	gid := idutil.String(e.groupID)
	edit := apitypes.CreateExpenseInput{SplitType: "EQUAL", Name: "x", Category: "x", Amount: "1", GroupID: &gid,
		ExpenseDate: now.Format(time.RFC3339), Participants: []apitypes.ExpenseParticipantRaw{{UserID: k}}}
	require.NoError(t, edit.Validate())
	_, err = e.expenses.Update(ctx, abel, feeID, edit)
	var apiErr *httpx.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, "LATE_FEE_NOT_EDITABLE", apiErr.Code)
	require.NoError(t, e.expenses.SoftDelete(ctx, abel, feeID))
	assert.Equal(t, int64(-202000), e.nets(t)[k])

	// Turning them off clears when they started, and says so.
	e.setFees(t, 0, 7, 2000)
	var since pgtype.Timestamptz
	require.NoError(t, e.pool.QueryRow(ctx, `SELECT interest_since FROM groups WHERE id = $1`, e.groupID).Scan(&since))
	assert.False(t, since.Valid)
	assert.Equal(t, 2, e.countNotes(t, kidus, "Late fees"))
}

func TestChargeDue_SplitAmongEveryoneOwed(t *testing.T) {
	ctx := context.Background()
	e := setup(t)
	abel, kidus, sara, dawit := e.people[0].ID, e.people[1].ID, e.people[2].ID, e.people[3].ID

	// Abel covers 3,000 for Dawit and Sara 1,000 for him: Dawit owes
	// 4,000, Abel is owed 3,000 and Sara 1,000. Grace 0, 2.5% a day.
	a := e.spend(t, abel, "300000", dawit)
	s := e.spend(t, sara, "100000", dawit)
	_, err := e.pool.Exec(ctx, `UPDATE expenses SET created_at = now() - interval '1 hour' WHERE id = ANY($1::uuid[])`,
		[]pgtype.UUID{a.ID, s.ID})
	require.NoError(t, err)
	e.setFees(t, 250, 0, 2000)
	_, err = e.pool.Exec(ctx, `UPDATE groups SET interest_since = now() - interval '1 day' WHERE id = $1`, e.groupID)
	require.NoError(t, err)

	n, err := e.fees.ChargeDue(ctx, time.Now())
	require.NoError(t, err)
	assert.Equal(t, 1, n)
	// 2.5% of 4,000 = 100.00: 75.00 to Abel, 25.00 to Sara.
	nets := e.nets(t)
	assert.Equal(t, int64(-410000), nets[idutil.String(dawit)])
	assert.Equal(t, int64(307500), nets[idutil.String(abel)])
	assert.Equal(t, int64(102500), nets[idutil.String(sara)])
	assert.Zero(t, nets[idutil.String(kidus)])
}

func TestUpdateGroup_LateFeeValidation(t *testing.T) {
	for _, in := range []apitypes.UpdateGroupInput{
		{InterestRateBP: ptr(int32(501))},
		{InterestRateBP: ptr(int32(-1))},
		{InterestGraceDays: ptr(int32(61))},
		{InterestCapBP: ptr(int32(99))},
	} {
		assert.Error(t, in.Validate())
	}
	assert.Equal(t, "2.5%", groups.FormatBP(250))
	assert.Equal(t, "1%", groups.FormatBP(100))
	assert.Equal(t, "0.05%", groups.FormatBP(5))
}

func ptr[T any](v T) *T { return &v }
