// Package latefees charges a group's late fees once a day (ADR-026): a
// share of the overdue part of each member's debt to the group, while
// an admin has them turned on. Each fee is an INTEREST expense paid by
// someone the group owes, with the debtor's share carrying it, so
// balances stay derived from expenses and a fee is waived by deleting it.
package latefees

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/balances"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

// eat is Addis Ababa time: a "day" of fees is an Addis Ababa date.
var eat = time.FixedZone("EAT", 3*60*60)

type Service struct {
	q             db.Querier
	balances      *balances.Service
	notifications *notifications.Service
}

func NewService(q db.Querier, balancesSvc *balances.Service, notificationsSvc *notifications.Service) *Service {
	return &Service{q: q, balances: balancesSvc, notifications: notificationsSvc}
}

// ChargeDue adds today's late fees in every group that has them on, and
// returns how many members were charged. Run once a day by the daily
// job (reminders.RunDaily); running it again the same day charges
// nobody twice. One group's failure is logged and skipped.
func (s *Service) ChargeDue(ctx context.Context, now time.Time) (int, error) {
	rows, err := s.q.ListLateFeeGroups(ctx)
	if err != nil {
		return 0, err
	}
	charged := 0
	for _, g := range rows {
		n, err := s.chargeGroup(ctx, g, now)
		charged += n
		if err != nil {
			log.Printf("late fees: group %s: %v", idutil.String(g.ID), err)
		}
	}
	return charged, nil
}

func (s *Service) chargeGroup(ctx context.Context, g db.ListLateFeeGroupsRow, now time.Time) (int, error) {
	rule := money.LateFeeRule{
		RateBP: int64(g.InterestRateBp), GraceDays: int(g.InterestGraceDays),
		CapBP: int64(g.InterestCapBp), Since: g.InterestSince.Time,
	}
	summary, err := s.balances.GetGroupSummary(ctx, g.ID)
	if err != nil {
		return 0, err
	}
	principal, err := s.balances.GroupPrincipalMovements(ctx, g.ID)
	if err != nil {
		return 0, err
	}
	active, err := s.q.ListActiveMemberIDs(ctx, g.ID)
	if err != nil {
		return 0, err
	}
	isActive := map[string]bool{}
	for _, id := range active {
		isActive[idutil.String(id)] = true
	}

	// The people owed, weighted by how much: each fee is shared among
	// them like that.
	var creditors []money.NetPosition
	var weights []money.MinorUnits
	for _, pos := range summary {
		if pos.NetBalance > 0 {
			creditors = append(creditors, pos)
			weights = append(weights, pos.NetBalance)
		}
	}
	if len(creditors) == 0 {
		return 0, nil
	}

	today := now.In(eat)
	day := pgtype.Date{Time: time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC), Valid: true}
	charged := 0
	for _, pos := range summary {
		if pos.NetBalance >= 0 || !isActive[pos.UserID] {
			continue
		}
		fee := money.LateFeeToday(money.UnpaidParts(principal[pos.UserID]), rule, now)
		// Never more than they actually owe the group, fees included
		// (paying part of a bill can leave old "principal" covered by
		// newer credit in a way the parts don't see).
		fee = min(fee, -pos.NetBalance)
		if fee <= 0 {
			continue
		}
		debtor, err := idutil.Parse(pos.UserID)
		if err != nil {
			return charged, err
		}
		if _, err := s.q.MarkLateFeeDay(ctx, db.MarkLateFeeDayParams{GroupID: g.ID, DebtorID: debtor, Day: day}); errors.Is(err, pgx.ErrNoRows) {
			continue // already charged today
		} else if err != nil {
			return charged, err
		}
		if err := s.writeFees(ctx, g, debtor, creditors, weights, fee, now); err != nil {
			return charged, err
		}
		charged++

		// Told once when a run of fees starts, not every day.
		yesterday := pgtype.Date{Time: day.Time.AddDate(0, 0, -1), Valid: true}
		if had, err := s.q.HasLateFeeDay(ctx, db.HasLateFeeDayParams{GroupID: g.ID, DebtorID: debtor, Day: yesterday}); err == nil && !had {
			gr := db.Group{InterestRateBp: g.InterestRateBp, InterestGraceDays: g.InterestGraceDays, InterestCapBp: g.InterestCapBp}
			_, err := s.notifications.NotifyLink(ctx, debtor, notifications.TypeLateFee, "Late fee started",
				fmt.Sprintf("Your debt in %q is past due, so a late fee has started (%s). Today's: %s. Pay to stop it.",
					g.Name, groups.LateFeeTerms(gr), money.Format(fee, g.Currency)),
				"/groups/"+idutil.String(g.ID))
			if err != nil {
				log.Printf("late fees: notify: %v", err)
			}
		}
	}
	return charged, nil
}

// writeFees writes one INTEREST expense per person owed, together the
// day's fee, split by how much each is owed.
func (s *Service) writeFees(ctx context.Context, g db.ListLateFeeGroupsRow, debtor pgtype.UUID, creditors []money.NetPosition, weights []money.MinorUnits, fee money.MinorUnits, now time.Time) error {
	shares, err := money.SplitByWeights(fee, weights)
	if err != nil {
		return err
	}
	for i, c := range creditors {
		if shares[i] == 0 {
			continue
		}
		creditor, err := idutil.Parse(c.UserID)
		if err != nil {
			return err
		}
		expense, err := s.q.CreateExpense(ctx, db.CreateExpenseParams{
			GroupID: g.ID, Name: "Late fee", Category: "Late fee", Amount: shares[i],
			Currency: g.Currency, PaidByID: creditor, SplitType: db.SplitTypeINTEREST,
			ExpenseDate: pgtype.Timestamptz{Time: now, Valid: true},
		})
		if err != nil {
			return err
		}
		if _, err := s.q.CreateExpenseParticipant(ctx, db.CreateExpenseParticipantParams{
			ExpenseID: expense.ID, UserID: debtor, Amount: shares[i],
		}); err != nil {
			return err
		}
	}
	return nil
}
