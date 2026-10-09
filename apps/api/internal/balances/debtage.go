package balances

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
)

// OverdueAfter is how long a debt can stay open before it counts as
// overdue and the daily job starts reminding (ADR-023). The web's
// OVERDUE_AFTER_DAYS (apps/web/src/lib/balances-api.ts) must match.
const OverdueAfter = 30 * 24 * time.Hour

// PairwiseOwingSince is how long the personal balance between two users
// has been owed, whichever way it runs (ADR-023): when the oldest unpaid
// part of it was added. ok is false when they're settled up.
func (s *Service) PairwiseOwingSince(ctx context.Context, userA, userB pgtype.UUID) (since time.Time, ok bool, err error) {
	rows, err := s.q.ListPairwiseMovementsPersonal(ctx, db.ListPairwiseMovementsPersonalParams{UserA: userA, UserB: userB})
	if err != nil {
		return time.Time{}, false, err
	}
	// From A's side: a share A owes B adds to what A owes.
	aOwes := make([]money.Movement, len(rows))
	bOwes := make([]money.Movement, len(rows))
	for i, r := range rows {
		amount := r.Amount
		if r.UserID != userA {
			amount = -amount
		}
		aOwes[i] = money.Movement{At: r.CreatedAt.Time, Amount: amount}
		bOwes[i] = money.Movement{At: r.CreatedAt.Time, Amount: -amount}
	}
	if since, ok := money.OwingSince(aOwes); ok {
		return since, true, nil
	}
	since, ok = money.OwingSince(bOwes)
	return since, ok, nil
}

// GroupOwingSince is, for each member who owes the group, how long they
// have (ADR-023), keyed like NetPosition.UserID. Each expense moves the
// payer's debt down by what they paid and every participant's up by
// their share, the same sums GetGroupSummary nets.
func (s *Service) GroupOwingSince(ctx context.Context, groupID pgtype.UUID) (map[string]time.Time, error) {
	rows, err := s.q.ListGroupShareRows(ctx, groupID)
	if err != nil {
		return nil, err
	}
	movements := map[pgtype.UUID][]money.Movement{}
	var lastExpense pgtype.UUID
	for _, r := range rows {
		at := r.CreatedAt.Time
		// Rows come grouped by expense: credit the payer once per expense.
		if r.ExpenseID != lastExpense {
			lastExpense = r.ExpenseID
			movements[r.PaidByID] = append(movements[r.PaidByID], money.Movement{At: at, Amount: -r.ExpenseAmount})
		}
		movements[r.UserID] = append(movements[r.UserID], money.Movement{At: at, Amount: r.Share})
	}

	out := map[string]time.Time{}
	for userID, m := range movements {
		if since, ok := money.OwingSince(m); ok {
			out[idutil.String(userID)] = since
		}
	}
	return out, nil
}
