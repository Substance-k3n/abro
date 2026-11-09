package admin

import (
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

func TestRangeStart(t *testing.T) {
	// 22:30 UTC on 5 Nov is 01:30 on 6 Nov in Addis: the last 7 days are
	// 31 Oct .. 6 Nov, starting at Addis midnight (21:00 UTC on 30 Oct).
	now := time.Date(2026, 11, 5, 22, 30, 0, 0, time.UTC)
	got := rangeStart(now, 7)
	assert.Equal(t, time.Date(2026, 10, 30, 21, 0, 0, 0, time.UTC), got.UTC())
	assert.Equal(t, "2026-10-31", got.Format(time.DateOnly))
	assert.Equal(t, "2026-11-06", rangeStart(now, 1).Format(time.DateOnly))
}

// TestOverview reads the overview before and after adding known rows, in
// one REPEATABLE READ transaction: other packages' tests write to the same
// database at the same time, and the snapshot keeps their rows out.
func TestOverview(t *testing.T) {
	f := setup(t)
	tx, err := f.pool.BeginTx(f.ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	require.NoError(t, err)
	defer tx.Rollback(f.ctx) //nolint:errcheck // everything here is thrown away
	svc := *f.svc
	svc.q = db.New(tx)
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := tx.Exec(f.ctx, sql, args...)
		require.NoError(t, err)
	}
	one := func(sql string, args ...any) pgtype.UUID {
		t.Helper()
		var id pgtype.UUID
		require.NoError(t, tx.QueryRow(f.ctx, sql, args...).Scan(&id))
		return id
	}

	before, err := svc.Overview(f.ctx, 7)
	require.NoError(t, err)
	assert.Len(t, before.Series, 7, "one row per day, zeros included")

	a := one(`INSERT INTO profiles (email, display_name) VALUES ($1, 'A') RETURNING id`, f.tag+"-ova@abro.test")
	b := one(`INSERT INTO profiles (email, display_name, suspended_at) VALUES ($1, 'B', now()) RETURNING id`, f.tag+"-ovb@abro.test")
	// Created long ago: counts in totals, not in "new".
	c := one(`INSERT INTO profiles (email, display_name, created_at) VALUES ($1, 'C', now() - interval '60 days') RETURNING id`, f.tag+"-ovc@abro.test")
	exec(`INSERT INTO sessions (user_id, token_hash, expires_at, last_used_at) VALUES ($1, $2, now() + interval '1 day', now())`, a, f.tag+"-tok")

	g := one(`INSERT INTO groups (name, type, created_by_id) VALUES ('Trip', 'TRIP', $1) RETURNING id`, a)
	exec(`INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')`, g, a)
	exec(`INSERT INTO group_members (group_id, user_id, status, joined_at) VALUES ($1, $2, 'INVITED', now() - interval '10 days')`, g, c)
	gone := one(`INSERT INTO groups (name, created_by_id, deleted_at) VALUES ('Gone', $1, now()) RETURNING id`, a)
	exec(`INSERT INTO group_members (group_id, user_id, status) VALUES ($1, $2, 'INVITED')`, gone, b)

	e1 := one(`INSERT INTO expenses (group_id, name, category, amount, currency, paid_by_id, split_type, expense_date)
		VALUES ($1, 'Fuel', 'transport', 150000, 'ETB', $2, 'EQUAL', now()) RETURNING id`, g, a)
	exec(`INSERT INTO expense_participants (expense_id, user_id, amount, disputed_at) VALUES ($1, $2, 150000, now())`, e1, a)
	exec(`INSERT INTO expenses (name, category, amount, currency, paid_by_id, split_type, expense_date)
		VALUES ('Lunch', 'food', 2500, 'USD', $1, 'EXACT', now())`, a)
	exec(`INSERT INTO expenses (name, category, amount, currency, paid_by_id, split_type, expense_date)
		VALUES ('Payment', 'settlement', 99999, 'ETB', $1, 'SETTLEMENT', now())`, a)
	exec(`INSERT INTO expenses (name, category, amount, currency, paid_by_id, split_type, expense_date, deleted_at)
		VALUES ('Deleted', 'food', 777, 'ETB', $1, 'EQUAL', now(), now())`, a)
	exec(`INSERT INTO settlement_requests (payer_id, recipient_id, amount, currency, created_at)
		VALUES ($1, $2, 100, 'ETB', now() - interval '8 days'), ($1, $2, 100, 'ETB', now())`, a, c)

	after, err := svc.Overview(f.ctx, 7)
	require.NoError(t, err)

	d := func(x, y int64) int64 { return y - x }
	assert.EqualValues(t, 3, d(before.Users.Total, after.Users.Total))
	assert.EqualValues(t, 2, d(before.Users.New, after.Users.New))
	assert.EqualValues(t, 1, d(before.Users.Active, after.Users.Active))
	assert.EqualValues(t, 1, d(before.Users.Suspended, after.Users.Suspended))
	assert.EqualValues(t, 1, d(before.Groups.Total, after.Groups.Total), "deleted group not counted")
	assert.EqualValues(t, 1, d(before.Groups.New, after.Groups.New))
	assert.EqualValues(t, 2, d(before.Activity.Expenses, after.Activity.Expenses), "not the settlement or the deleted one")
	assert.EqualValues(t, 1, d(before.Activity.Settlements, after.Activity.Settlements))
	assert.EqualValues(t, 1, d(before.Queue.OpenDisputes, after.Queue.OpenDisputes))
	assert.EqualValues(t, 2, d(before.Queue.PendingConfirmations, after.Queue.PendingConfirmations))
	assert.EqualValues(t, 1, d(before.Queue.StaleConfirmations, after.Queue.StaleConfirmations))
	assert.EqualValues(t, 1, d(before.Queue.PendingInvites, after.Queue.PendingInvites), "not in the deleted group")
	assert.EqualValues(t, 1, d(before.Queue.StaleInvites, after.Queue.StaleInvites))

	tb, ta := before.Series[6], after.Series[6]
	assert.Equal(t, time.Now().In(addis).Format(time.DateOnly), ta.Day)
	assert.EqualValues(t, 2, ta.Signups-tb.Signups)
	assert.EqualValues(t, 2, ta.Expenses-tb.Expenses)
	assert.EqualValues(t, 1, ta.Settlements-tb.Settlements)

	cat := func(o apitypes.AdminOverview, name string) int64 {
		for _, r := range o.Categories {
			if r.Category == name {
				return r.Expenses
			}
		}
		return 0
	}
	assert.EqualValues(t, 1, cat(after, "transport")-cat(before, "transport"))
	assert.EqualValues(t, 1, cat(after, "food")-cat(before, "food"), "the deleted food expense isn't counted")
	assert.Zero(t, cat(after, "settlement"))

	vol := func(o apitypes.AdminOverview, cur string) (total, n int64) {
		for _, r := range o.Volume {
			if r.Currency == cur {
				v, err := strconv.ParseInt(r.Total, 10, 64)
				require.NoError(t, err)
				return v, r.Expenses
			}
		}
		return 0, 0
	}
	etbB, nB := vol(before, "ETB")
	etbA, nA := vol(after, "ETB")
	assert.EqualValues(t, 150000, etbA-etbB, "1,500.00 ETB: the settlement and the deleted expense aren't spending")
	assert.EqualValues(t, 1, nA-nB)
	usdB, _ := vol(before, "USD")
	usdA, _ := vol(after, "USD")
	assert.EqualValues(t, 2500, usdA-usdB)

	_, err = svc.Overview(f.ctx, 14)
	assert.Equal(t, "INVALID_RANGE", errCode(t, err))
	ninety, err := svc.Overview(f.ctx, 90)
	require.NoError(t, err)
	assert.Len(t, ninety.Series, 90)
}

func TestGroups(t *testing.T) {
	f := setup(t)
	a := f.person("a")
	b := f.person("b")
	var live, gone pgtype.UUID
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO groups (name, type, created_by_id)
		VALUES ($1, 'HOUSEHOLD', $2) RETURNING id`, f.tag+" Flat", a.ID).Scan(&live))
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO groups (name, created_by_id, deleted_at)
		VALUES ($1, $2, now()) RETURNING id`, f.tag+" Old", a.ID).Scan(&gone))
	_, err := f.pool.Exec(f.ctx, `INSERT INTO group_members (group_id, user_id, role, status) VALUES
		($1, $2, 'ADMIN', 'ACTIVE'), ($1, $3, 'MEMBER', 'INVITED')`, live, a.ID, b.ID)
	require.NoError(t, err)
	_, err = f.pool.Exec(f.ctx, `INSERT INTO expenses (group_id, name, category, amount, paid_by_id, split_type, expense_date)
		VALUES ($1, 'Rent', 'housing', 1000, $2, 'EQUAL', now()), ($1, 'Pay', 'settlement', 10, $2, 'SETTLEMENT', now())`, live, a.ID)
	require.NoError(t, err)

	names := func(status string) []string {
		t.Helper()
		p, err := f.svc.ListGroups(f.ctx, f.tag, status, 1)
		require.NoError(t, err)
		out := []string{}
		for _, g := range p.Groups {
			out = append(out, g.Name)
		}
		return out
	}
	assert.Equal(t, []string{f.tag + " Flat"}, names(""))
	assert.Equal(t, []string{f.tag + " Old"}, names("deleted"))
	assert.ElementsMatch(t, []string{f.tag + " Flat", f.tag + " Old"}, names("all"))
	_, err = f.svc.ListGroups(f.ctx, "", "archived", 1)
	assert.Equal(t, "INVALID_STATUS", errCode(t, err))

	p, err := f.svc.ListGroups(f.ctx, f.tag+" flat", "", 1)
	require.NoError(t, err)
	require.Len(t, p.Groups, 1)
	g := p.Groups[0]
	assert.EqualValues(t, 1, g.MemberCount)
	assert.EqualValues(t, 1, g.InvitedCount)
	assert.EqualValues(t, 1, g.ExpenseCount, "the settlement isn't an expense")
	assert.Equal(t, a.DisplayName, g.CreatorName)
	assert.NotNil(t, g.LastActivityAt)

	d, err := f.svc.GetGroup(f.ctx, live)
	require.NoError(t, err)
	assert.Equal(t, "HOUSEHOLD", d.Type)
	assert.EqualValues(t, 1, d.ExpenseCount)
	assert.EqualValues(t, 1, d.SettlementCount)
	require.Len(t, d.Members, 2)
	assert.Equal(t, "ACTIVE", d.Members[0].Status)
	assert.Equal(t, "INVITED", d.Members[1].Status)

	missing, _ := idutil.Parse("00000000-0000-0000-0000-000000000002")
	_, err = f.svc.GetGroup(f.ctx, missing)
	assert.Equal(t, "GROUP_NOT_FOUND", errCode(t, err))
}
