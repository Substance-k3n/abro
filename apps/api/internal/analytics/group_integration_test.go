package analytics_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

func TestService_GetGroupStats(t *testing.T) {
	t.Run("totals, per-member paid/share, categories and trend, hand-checked", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		c := e.makeProfile(t, "C")
		group := e.makeGroup(t, a.ID, b.ID, c.ID)

		// A pays 900 for Food in March, split equally three ways.
		e.makeExpense(t, expenseOpts{groupID: group.ID, paidByID: a.ID, amount: 900, category: "Food", month: 3,
			participants: []participant{{a.ID, 300}, {b.ID, 300}, {c.ID, 300}}})
		// B pays 301 for Transport in July; the odd unit lands on C.
		e.makeExpense(t, expenseOpts{groupID: group.ID, paidByID: b.ID, amount: 301, category: "Transport", month: 7,
			participants: []participant{{a.ID, 100}, {b.ID, 100}, {c.ID, 101}}})
		// B settles 500 with A in August: not spending, only settledTotal.
		e.makeExpense(t, expenseOpts{groupID: group.ID, paidByID: b.ID, amount: 500, category: "Settlement", month: 8,
			splitType: "SETTLEMENT", participants: []participant{{a.ID, 500}, {b.ID, 0}}})
		// C's 1000 is deleted: it never counts.
		e.makeExpense(t, expenseOpts{groupID: group.ID, paidByID: c.ID, amount: 1000, category: "Gone", month: 8,
			participants: []participant{{c.ID, 1000}}})
		_, err := e.pool.Exec(context.Background(),
			`UPDATE expenses SET deleted_at = now() WHERE group_id = $1 AND category = 'Gone'`, group.ID)
		require.NoError(t, err)
		// A's personal expense is outside the group.
		e.makeExpense(t, expenseOpts{paidByID: a.ID, amount: 50, month: 3,
			participants: []participant{{a.ID, 50}}})

		now := time.Date(testYear, 8, 20, 12, 0, 0, 0, time.UTC)
		stats, err := e.svc.GetGroupStats(context.Background(), group.ID, now)
		require.NoError(t, err)

		assert.Equal(t, idutil.String(group.ID), stats.GroupID)
		assert.Equal(t, "1201", stats.TotalSpent) // 900 + 301
		assert.Equal(t, 2, stats.ExpenseCount)
		assert.Equal(t, "500", stats.SettledTotal)

		// Biggest payer first. Shares sum to the total spent (400+400+401).
		assert.Equal(t, []apitypes.GroupMemberSpending{
			{UserID: idutil.String(a.ID), Paid: "900", Share: "400"},
			{UserID: idutil.String(b.ID), Paid: "301", Share: "400"},
			{UserID: idutil.String(c.ID), Paid: "0", Share: "401"},
		}, stats.Members)

		assert.Equal(t, []apitypes.CategoryAmount{
			{Category: "Food", Amount: "900"},
			{Category: "Transport", Amount: "301"},
		}, stats.Categories)

		// March..August, oldest first, empty months zero.
		assert.Equal(t, []apitypes.GroupMonthSpending{
			{Year: testYear, Month: 3, TotalSpending: "900"},
			{Year: testYear, Month: 4, TotalSpending: "0"},
			{Year: testYear, Month: 5, TotalSpending: "0"},
			{Year: testYear, Month: 6, TotalSpending: "0"},
			{Year: testYear, Month: 7, TotalSpending: "301"},
			{Year: testYear, Month: 8, TotalSpending: "0"},
		}, stats.MonthlyTrend)
	})

	t.Run("trend crosses a year boundary and drops older months", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		group := e.makeGroup(t, a.ID)
		e.makeExpense(t, expenseOpts{groupID: group.ID, paidByID: a.ID, amount: 700, month: 7,
			participants: []participant{{a.ID, 700}}})
		e.makeExpense(t, expenseOpts{groupID: group.ID, paidByID: a.ID, amount: 200, month: 12,
			participants: []participant{{a.ID, 200}}})

		now := time.Date(testYear+1, 1, 3, 0, 0, 0, 0, time.UTC)
		stats, err := e.svc.GetGroupStats(context.Background(), group.ID, now)
		require.NoError(t, err)

		require.Len(t, stats.MonthlyTrend, 6)
		assert.Equal(t, apitypes.GroupMonthSpending{Year: testYear, Month: 8, TotalSpending: "0"}, stats.MonthlyTrend[0])
		assert.Equal(t, apitypes.GroupMonthSpending{Year: testYear, Month: 12, TotalSpending: "200"}, stats.MonthlyTrend[4])
		assert.Equal(t, apitypes.GroupMonthSpending{Year: testYear + 1, Month: 1, TotalSpending: "0"}, stats.MonthlyTrend[5])
		// July is outside the trend but still in the all-time total.
		assert.Equal(t, "900", stats.TotalSpent)
	})

	t.Run("a group with no expenses is all zeros, not nulls", func(t *testing.T) {
		e := setup(t)
		a := e.makeProfile(t, "A")
		group := e.makeGroup(t, a.ID)

		stats, err := e.svc.GetGroupStats(context.Background(), group.ID, time.Now())
		require.NoError(t, err)
		assert.Equal(t, "0", stats.TotalSpent)
		assert.Equal(t, 0, stats.ExpenseCount)
		assert.Equal(t, "0", stats.SettledTotal)
		assert.NotNil(t, stats.Members)
		assert.Empty(t, stats.Members)
		assert.NotNil(t, stats.Categories)
		assert.Len(t, stats.MonthlyTrend, 6)
	})

	t.Run("an unknown group is empty rather than an error", func(t *testing.T) {
		e := setup(t)
		stats, err := e.svc.GetGroupStats(context.Background(), pgtype.UUID{Bytes: [16]byte{1}, Valid: true}, time.Now())
		require.NoError(t, err)
		assert.Equal(t, "0", stats.TotalSpent)
	})
}
