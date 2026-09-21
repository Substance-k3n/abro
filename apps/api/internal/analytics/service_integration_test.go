package analytics_test

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

	"github.com/Substance-k3n/abro/apps/api/internal/analytics"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
)

const testYear = 2024

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"
}

type participant struct {
	userID pgtype.UUID
	amount int64
}

type expenseOpts struct {
	paidByID     pgtype.UUID
	participants []participant
	amount       int64
	category     string
	groupID      pgtype.UUID
	splitType    string
	month        int
}

type env struct {
	svc         *analytics.Service
	pool        *pgxpool.Pool
	makeProfile func(t *testing.T, label string) db.Profile
	makeGroup   func(t *testing.T, createdByID pgtype.UUID, memberIDs ...pgtype.UUID) db.Group
	makeExpense func(t *testing.T, opts expenseOpts)
}

func setup(t *testing.T) env {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDatabaseURL())
	require.NoError(t, err, "connect to dev Postgres")
	require.NoError(t, pool.Ping(context.Background()))
	t.Cleanup(pool.Close)

	queries := db.New(pool)
	svc := analytics.NewService(queries)

	var profiles, groups, expenseIDs []pgtype.UUID
	t.Cleanup(func() {
		ctx := context.Background()
		for _, id := range expenseIDs {
			pool.Exec(ctx, `DELETE FROM expense_participants WHERE expense_id = $1`, id)
			pool.Exec(ctx, `DELETE FROM expenses WHERE id = $1`, id)
		}
		for _, id := range groups {
			pool.Exec(ctx, `DELETE FROM group_members WHERE group_id = $1`, id)
			pool.Exec(ctx, `DELETE FROM groups WHERE id = $1`, id)
		}
		for _, id := range profiles {
			pool.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, id)
		}
	})

	makeProfile := func(t *testing.T, label string) db.Profile {
		t.Helper()
		email := fmt.Sprintf("test-analytics-%s-%d-%d@abro.test", label, time.Now().UnixNano(), rand.Intn(1_000_000))
		profile, err := queries.UpsertProfileByEmail(context.Background(), db.UpsertProfileByEmailParams{
			Email: pgtype.Text{String: email, Valid: true}, DisplayName: "Test " + label,
		})
		require.NoError(t, err)
		profiles = append(profiles, profile.ID)
		return profile
	}

	makeGroupFn := func(t *testing.T, createdByID pgtype.UUID, memberIDs ...pgtype.UUID) db.Group {
		t.Helper()
		group, err := queries.CreateGroup(context.Background(), db.CreateGroupParams{
			Name: "Test Group", Type: db.GroupTypeOTHER, Currency: "ETB", SimplifyDebts: true, CreatedByID: createdByID,
		})
		require.NoError(t, err)
		groups = append(groups, group.ID)

		_, err = queries.CreateGroupMember(context.Background(), db.CreateGroupMemberParams{
			GroupID: group.ID, UserID: createdByID, Role: db.GroupMemberRoleADMIN, Status: db.GroupMemberStatusACTIVE,
		})
		require.NoError(t, err)
		for _, m := range memberIDs {
			_, err = queries.CreateGroupMember(context.Background(), db.CreateGroupMemberParams{
				GroupID: group.ID, UserID: m, Role: db.GroupMemberRoleMEMBER, Status: db.GroupMemberStatusACTIVE,
			})
			require.NoError(t, err)
		}
		return group
	}

	makeExpenseFn := func(t *testing.T, opts expenseOpts) {
		t.Helper()
		if opts.category == "" {
			opts.category = "General"
		}
		if opts.splitType == "" {
			opts.splitType = "EQUAL"
		}
		if opts.month == 0 {
			opts.month = 6
		}
		expense, err := queries.CreateExpense(context.Background(), db.CreateExpenseParams{
			GroupID: opts.groupID, Name: "Test Expense", Category: opts.category, Amount: opts.amount,
			Currency: "ETB", PaidByID: opts.paidByID, SplitType: db.SplitType(opts.splitType),
			ExpenseDate: pgtype.Timestamptz{Time: time.Date(testYear, time.Month(opts.month), 15, 0, 0, 0, 0, time.UTC), Valid: true},
		})
		require.NoError(t, err)
		expenseIDs = append(expenseIDs, expense.ID)

		for _, p := range opts.participants {
			_, err := queries.CreateExpenseParticipant(context.Background(), db.CreateExpenseParticipantParams{
				ExpenseID: expense.ID, UserID: p.userID, Amount: p.amount,
			})
			require.NoError(t, err)
		}
	}

	return env{svc: svc, pool: pool, makeProfile: makeProfile, makeGroup: makeGroupFn, makeExpense: makeExpenseFn}
}

func TestService_GetMonthly(t *testing.T) {
	t.Run("computes contribution/share/net position/total for a personal expense the user paid", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "A")
		other := e.makeProfile(t, "B")
		e.makeExpense(t, expenseOpts{paidByID: payer.ID, amount: 1000, month: 3,
			participants: []participant{{payer.ID, 500}, {other.ID, 500}}})

		result, err := e.svc.GetMonthly(context.Background(), payer.ID, testYear, 3)
		require.NoError(t, err)
		assert.Equal(t, "1000", result.TotalSpending)
		assert.Equal(t, "1000", result.YourContribution)
		assert.Equal(t, "500", result.YourShare)
		assert.Equal(t, "500", result.NetPosition)
		assert.Equal(t, "0", result.AmountOwed)
	})

	t.Run("computes amountOwed for the non-payer participant", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "A")
		other := e.makeProfile(t, "B")
		e.makeExpense(t, expenseOpts{paidByID: payer.ID, amount: 1000, month: 3,
			participants: []participant{{payer.ID, 500}, {other.ID, 500}}})

		result, err := e.svc.GetMonthly(context.Background(), other.ID, testYear, 3)
		require.NoError(t, err)
		assert.Equal(t, "0", result.YourContribution)
		assert.Equal(t, "500", result.YourShare)
		assert.Equal(t, "-500", result.NetPosition)
		assert.Equal(t, "500", result.AmountOwed)
		assert.Equal(t, "1000", result.TotalSpending)
	})

	t.Run("excludes expenses outside the requested month", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "A")
		e.makeExpense(t, expenseOpts{paidByID: payer.ID, amount: 1000, month: 3,
			participants: []participant{{payer.ID, 1000}}})

		result, err := e.svc.GetMonthly(context.Background(), payer.ID, testYear, 4)
		require.NoError(t, err)
		assert.Equal(t, "0", result.TotalSpending)
		assert.Empty(t, result.CategoryBreakdown)
	})

	t.Run("breaks down spending by category", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "A")
		e.makeExpense(t, expenseOpts{paidByID: payer.ID, amount: 300, category: "Food", month: 5,
			participants: []participant{{payer.ID, 300}}})
		e.makeExpense(t, expenseOpts{paidByID: payer.ID, amount: 700, category: "Transport", month: 5,
			participants: []participant{{payer.ID, 700}}})

		result, err := e.svc.GetMonthly(context.Background(), payer.ID, testYear, 5)
		require.NoError(t, err)
		byCategory := map[string]string{}
		for _, c := range result.CategoryBreakdown {
			byCategory[c.Category] = c.Amount
		}
		assert.Equal(t, "300", byCategory["Food"])
		assert.Equal(t, "700", byCategory["Transport"])
	})

	t.Run("separates settlements from ordinary spending totals", func(t *testing.T) {
		e := setup(t)
		settler := e.makeProfile(t, "A")
		recipient := e.makeProfile(t, "B")
		e.makeExpense(t, expenseOpts{paidByID: settler.ID, amount: 400, splitType: "SETTLEMENT", category: "Settlement", month: 7,
			participants: []participant{{settler.ID, 0}, {recipient.ID, 400}}})

		settlerResult, err := e.svc.GetMonthly(context.Background(), settler.ID, testYear, 7)
		require.NoError(t, err)
		assert.Equal(t, "0", settlerResult.TotalSpending)
		assert.Equal(t, "0", settlerResult.YourContribution)
		assert.Equal(t, "400", settlerResult.Settlements.Paid)
		assert.Equal(t, "0", settlerResult.Settlements.Received)

		recipientResult, err := e.svc.GetMonthly(context.Background(), recipient.ID, testYear, 7)
		require.NoError(t, err)
		assert.Equal(t, "0", recipientResult.TotalSpending)
		assert.Equal(t, "0", recipientResult.Settlements.Paid)
		assert.Equal(t, "400", recipientResult.Settlements.Received)
		assert.Equal(t, "400", recipientResult.AmountReceived)
	})

	t.Run("counts an expense once when the user is both payer and a participant", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "A")
		other := e.makeProfile(t, "B")
		another := e.makeProfile(t, "C")
		e.makeExpense(t, expenseOpts{paidByID: payer.ID, amount: 900, month: 8,
			participants: []participant{{payer.ID, 300}, {other.ID, 300}, {another.ID, 300}}})

		result, err := e.svc.GetMonthly(context.Background(), payer.ID, testYear, 8)
		require.NoError(t, err)
		assert.Equal(t, "900", result.TotalSpending)
	})
}

func TestService_GetYearly(t *testing.T) {
	t.Run("aggregates a monthly trend, group spending, and personal contribution", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "A")
		member := e.makeProfile(t, "B")
		group := e.makeGroup(t, payer.ID, member.ID)

		e.makeExpense(t, expenseOpts{paidByID: payer.ID, amount: 1000, groupID: group.ID, month: 2,
			participants: []participant{{payer.ID, 500}, {member.ID, 500}}})
		e.makeExpense(t, expenseOpts{paidByID: payer.ID, amount: 2000, month: 9,
			participants: []participant{{payer.ID, 2000}}})

		result, err := e.svc.GetYearly(context.Background(), payer.ID, testYear)
		require.NoError(t, err)
		assert.Equal(t, "3000", result.YearlyTotal)
		assert.Equal(t, "3000", result.PersonalContribution)

		trendByMonth := map[int]string{}
		for _, m := range result.MonthlyTrend {
			trendByMonth[m.Month] = m.TotalSpending
		}
		assert.Equal(t, "1000", trendByMonth[2])
		assert.Equal(t, "2000", trendByMonth[9])
		assert.Equal(t, "0", trendByMonth[5])
		assert.Len(t, result.MonthlyTrend, 12)

		require.Len(t, result.GroupSpending, 1)
		assert.Equal(t, "1000", result.GroupSpending[0].TotalSpending)
	})

	t.Run("omits groups with zero activity in the requested year", func(t *testing.T) {
		e := setup(t)
		payer := e.makeProfile(t, "A")
		member := e.makeProfile(t, "B")
		e.makeGroup(t, payer.ID, member.ID)

		result, err := e.svc.GetYearly(context.Background(), payer.ID, testYear)
		require.NoError(t, err)
		assert.Empty(t, result.GroupSpending)
	})
}
