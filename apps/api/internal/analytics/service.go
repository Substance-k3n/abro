// Package analytics implements read-only aggregation over
// Expense/ExpenseParticipant -- ABRO_PRD.md §26. No new persistence, no
// derived data stored: every figure here is computed live from the same
// facts balances.Service reads, per the ABRO invariant "expenses are
// facts, balances/analytics are derived projections."
//
// Scope: every expense the user is involved in, across their personal
// (group_id NULL) activity and every group they belong to -- not scoped
// to one group (Assumption, matching apps/api's original -- PRD §26
// doesn't pin this down explicitly).
package analytics

import (
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

type Service struct {
	q db.Querier
}

func NewService(q db.Querier) *Service {
	return &Service{q: q}
}

func (s *Service) GetMonthly(ctx context.Context, userID pgtype.UUID, year, month int) (apitypes.MonthlyAnalytics, error) {
	start, end := monthRange(year, month)

	totals, err := s.q.GetUserTotals(ctx, db.GetUserTotalsParams{UserID: userID, StartDate: tsRange(start), EndDate: tsRange(end)})
	if err != nil {
		return apitypes.MonthlyAnalytics{}, err
	}
	categories, err := s.categoryBreakdown(ctx, userID, start, end)
	if err != nil {
		return apitypes.MonthlyAnalytics{}, err
	}
	paid, err := s.q.GetSettlementsPaid(ctx, db.GetSettlementsPaidParams{UserID: userID, StartDate: tsRange(start), EndDate: tsRange(end)})
	if err != nil {
		return apitypes.MonthlyAnalytics{}, err
	}
	received, err := s.q.GetSettlementsReceived(ctx, db.GetSettlementsReceivedParams{UserID: userID, StartDate: tsRange(start), EndDate: tsRange(end)})
	if err != nil {
		return apitypes.MonthlyAnalytics{}, err
	}

	return apitypes.MonthlyAnalytics{
		Year: year, Month: month,
		TotalSpending:     fmtInt(totals.TotalSpending),
		YourContribution:  fmtInt(totals.YourContribution),
		YourShare:         fmtInt(totals.YourShare),
		NetPosition:       fmtInt(totals.YourContribution - totals.YourShare),
		AmountOwed:        fmtInt(totals.AmountOwed),
		AmountReceived:    fmtInt(received),
		Settlements:       apitypes.SettlementsSummary{Paid: fmtInt(paid), Received: fmtInt(received)},
		CategoryBreakdown: categories,
	}, nil
}

func (s *Service) GetYearly(ctx context.Context, userID pgtype.UUID, year int) (apitypes.YearlyAnalytics, error) {
	start, end := yearRange(year)

	totals, err := s.q.GetUserTotals(ctx, db.GetUserTotalsParams{UserID: userID, StartDate: tsRange(start), EndDate: tsRange(end)})
	if err != nil {
		return apitypes.YearlyAnalytics{}, err
	}
	categories, err := s.categoryBreakdown(ctx, userID, start, end)
	if err != nil {
		return apitypes.YearlyAnalytics{}, err
	}
	groupSpending, err := s.groupSpending(ctx, userID, start, end)
	if err != nil {
		return apitypes.YearlyAnalytics{}, err
	}
	trend, err := s.monthlyTrend(ctx, userID, year)
	if err != nil {
		return apitypes.YearlyAnalytics{}, err
	}

	return apitypes.YearlyAnalytics{
		Year: year, YearlyTotal: fmtInt(totals.TotalSpending), MonthlyTrend: trend,
		CategoryDistribution: categories, GroupSpending: groupSpending,
		PersonalContribution: fmtInt(totals.YourContribution),
	}, nil
}

func (s *Service) categoryBreakdown(ctx context.Context, userID pgtype.UUID, start, end time.Time) ([]apitypes.CategoryAmount, error) {
	rows, err := s.q.GetCategoryBreakdown(ctx, db.GetCategoryBreakdownParams{UserID: userID, StartDate: tsRange(start), EndDate: tsRange(end)})
	if err != nil {
		return nil, err
	}
	out := make([]apitypes.CategoryAmount, len(rows))
	for i, r := range rows {
		out[i] = apitypes.CategoryAmount{Category: r.Category, Amount: fmtInt(r.Amount)}
	}
	return out, nil
}

func (s *Service) groupSpending(ctx context.Context, userID pgtype.UUID, start, end time.Time) ([]apitypes.GroupSpending, error) {
	rows, err := s.q.GetGroupSpending(ctx, db.GetGroupSpendingParams{UserID: userID, StartDate: tsRange(start), EndDate: tsRange(end)})
	if err != nil {
		return nil, err
	}
	out := make([]apitypes.GroupSpending, len(rows))
	for i, r := range rows {
		out[i] = apitypes.GroupSpending{GroupID: idutil.String(r.GroupID), GroupName: r.GroupName, TotalSpending: fmtInt(r.TotalSpending)}
	}
	return out, nil
}

func (s *Service) monthlyTrend(ctx context.Context, userID pgtype.UUID, year int) ([]apitypes.MonthlySpending, error) {
	start, end := yearRange(year)
	rows, err := s.q.GetMonthlyTrendRaw(ctx, db.GetMonthlyTrendRawParams{UserID: userID, StartDate: tsRange(start), EndDate: tsRange(end)})
	if err != nil {
		return nil, err
	}
	byMonth := map[int]int64{}
	for _, r := range rows {
		byMonth[int(r.Month)] = r.TotalSpending
	}

	trend := make([]apitypes.MonthlySpending, 12)
	for m := 1; m <= 12; m++ {
		trend[m-1] = apitypes.MonthlySpending{Month: m, TotalSpending: fmtInt(byMonth[m])}
	}
	return trend, nil
}

func monthRange(year, month int) (time.Time, time.Time) {
	start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	return start, start.AddDate(0, 1, 0)
}

func yearRange(year int) (time.Time, time.Time) {
	start := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	return start, start.AddDate(1, 0, 0)
}

func tsRange(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func fmtInt(v int64) string {
	return strconv.FormatInt(v, 10)
}
