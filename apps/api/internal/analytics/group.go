package analytics

import (
	"context"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

// GroupStatsMonths is how many calendar months GetGroupStats' trend
// covers, ending with the current one.
const GroupStatsMonths = 6

// GetGroupStats is one group's spending for the group admin dashboard
// (roadmap P6). The caller checks membership; this only aggregates. now
// fixes which months the trend covers.
func (s *Service) GetGroupStats(ctx context.Context, groupID pgtype.UUID, now time.Time) (apitypes.GroupStats, error) {
	totals, err := s.q.GetGroupStatsTotals(ctx, groupID)
	if err != nil {
		return apitypes.GroupStats{}, err
	}

	memberRows, err := s.q.GetGroupMemberPaidShare(ctx, groupID)
	if err != nil {
		return apitypes.GroupStats{}, err
	}
	// Biggest payer first; user id breaks ties so the order is stable.
	sort.Slice(memberRows, func(i, j int) bool {
		if memberRows[i].Paid != memberRows[j].Paid {
			return memberRows[i].Paid > memberRows[j].Paid
		}
		return idutil.String(memberRows[i].UserID) < idutil.String(memberRows[j].UserID)
	})
	members := make([]apitypes.GroupMemberSpending, len(memberRows))
	for i, m := range memberRows {
		members[i] = apitypes.GroupMemberSpending{UserID: idutil.String(m.UserID), Paid: fmtInt(m.Paid), Share: fmtInt(m.Share)}
	}

	categoryRows, err := s.q.GetGroupCategoryBreakdown(ctx, groupID)
	if err != nil {
		return apitypes.GroupStats{}, err
	}
	categories := make([]apitypes.CategoryAmount, len(categoryRows))
	for i, c := range categoryRows {
		categories[i] = apitypes.CategoryAmount{Category: c.Category, Amount: fmtInt(c.Amount)}
	}

	trend, err := s.groupMonthlyTrend(ctx, groupID, now)
	if err != nil {
		return apitypes.GroupStats{}, err
	}

	return apitypes.GroupStats{
		GroupID:      idutil.String(groupID),
		TotalSpent:   fmtInt(totals.TotalSpent),
		ExpenseCount: int(totals.ExpenseCount),
		SettledTotal: fmtInt(totals.SettledTotal),
		Members:      members,
		Categories:   categories,
		MonthlyTrend: trend,
	}, nil
}

func (s *Service) groupMonthlyTrend(ctx context.Context, groupID pgtype.UUID, now time.Time) ([]apitypes.GroupMonthSpending, error) {
	now = now.UTC()
	end := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1, 0)
	start := end.AddDate(0, -GroupStatsMonths, 0)

	rows, err := s.q.GetGroupMonthlyTrendRaw(ctx, db.GetGroupMonthlyTrendRawParams{
		GroupID: groupID, StartDate: tsRange(start), EndDate: tsRange(end),
	})
	if err != nil {
		return nil, err
	}
	type ym struct{ year, month int }
	byMonth := map[ym]int64{}
	for _, r := range rows {
		byMonth[ym{int(r.Year), int(r.Month)}] = r.TotalSpending
	}

	trend := make([]apitypes.GroupMonthSpending, GroupStatsMonths)
	for i := range trend {
		m := start.AddDate(0, i, 0)
		trend[i] = apitypes.GroupMonthSpending{
			Year: m.Year(), Month: int(m.Month()),
			TotalSpending: fmtInt(byMonth[ym{m.Year(), int(m.Month())}]),
		}
	}
	return trend, nil
}
