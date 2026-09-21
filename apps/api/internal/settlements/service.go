// Package settlements implements the only path allowed to write
// SplitType SETTLEMENT -- ADR-003: settlements are Expense rows with
// split_type = SETTLEMENT, never a separate table, and must never go
// through the general create-expense path.
//
// Shape (ADR-003's implementation note): every expense_participants.amount
// stays non-negative, matching every other split type.
// {paid_by_id: settler, amount: settlementAmount} with participants
// [{settler, 0}, {recipient, settlementAmount}] still satisfies
// "sum(participant shares) = expense total" (ABRO_PRD.md §45) unchanged,
// and balances.Service.GetPairwiseBalance nets it correctly with zero
// splitType-specific branching in the read path.
package settlements

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/balances"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

type Service struct {
	q             db.Querier
	balances      *balances.Service
	groups        *groups.Service
	notifications *notifications.Service
	expenses      *expenses.Service
}

func NewService(q db.Querier, balancesSvc *balances.Service, groupsSvc *groups.Service, notificationsSvc *notifications.Service, expensesSvc *expenses.Service) *Service {
	return &Service{q: q, balances: balancesSvc, groups: groupsSvc, notifications: notificationsSvc, expenses: expensesSvc}
}

func (s *Service) Create(ctx context.Context, actorID pgtype.UUID, in apitypes.CreateSettlementInput) (expenses.Expense, error) {
	toUserID, err := idutil.Parse(in.ToUserID)
	if err != nil {
		return expenses.Expense{}, httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	}
	if actorID == toUserID {
		return expenses.Expense{}, httpx.BadRequest("CANNOT_SETTLE_WITH_SELF", "You cannot record a settlement with yourself.")
	}

	if _, err := s.q.GetProfileByID(ctx, toUserID); errors.Is(err, pgx.ErrNoRows) {
		return expenses.Expense{}, httpx.NotFound("PROFILE_NOT_FOUND", "No such user.")
	} else if err != nil {
		return expenses.Expense{}, err
	}

	currency, groupID, err := s.resolveCurrency(ctx, actorID, toUserID, in.GroupID)
	if err != nil {
		return expenses.Expense{}, err
	}

	// ABRO_PRD.md §19/§45: "settlement <= outstanding debt", validated
	// against the live balance, never a client-supplied figure.
	outstanding, err := s.balances.GetPairwiseBalance(ctx, actorID, toUserID, groupID)
	if err != nil {
		return expenses.Expense{}, err
	}
	if outstanding <= 0 {
		return expenses.Expense{}, httpx.Conflict("NO_OUTSTANDING_DEBT", "You do not currently owe this user anything to settle.")
	}
	if in.ParsedAmount > outstanding {
		return expenses.Expense{}, httpx.Conflict("EXCEEDS_OUTSTANDING_DEBT",
			fmt.Sprintf("Settlement amount (%d) exceeds the outstanding debt (%d).", in.ParsedAmount, outstanding))
	}

	settlement, err := s.q.CreateExpense(ctx, db.CreateExpenseParams{
		GroupID: groupID, Name: "Settlement", Category: "Settlement", Amount: in.ParsedAmount,
		Currency: currency, PaidByID: actorID, SplitType: db.SplitTypeSETTLEMENT,
		ExpenseDate: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return expenses.Expense{}, err
	}

	if _, err := s.q.CreateExpenseParticipant(ctx, db.CreateExpenseParticipantParams{ExpenseID: settlement.ID, UserID: actorID, Amount: 0}); err != nil {
		return expenses.Expense{}, err
	}
	if _, err := s.q.CreateExpenseParticipant(ctx, db.CreateExpenseParticipantParams{ExpenseID: settlement.ID, UserID: toUserID, Amount: in.ParsedAmount}); err != nil {
		return expenses.Expense{}, err
	}

	full, err := s.expenses.LoadExpense(ctx, settlement)
	if err != nil {
		return expenses.Expense{}, err
	}

	// ABRO_PRD.md §34 SETTLEMENT event -- only the recipient, the actor
	// already knows they just recorded this.
	actorName := "Someone"
	if actor, err := s.q.GetProfileByID(ctx, actorID); err == nil {
		actorName = actor.DisplayName
	}
	if _, err := s.notifications.Notify(ctx, toUserID, notifications.TypeSettlement,
		"Settlement recorded", fmt.Sprintf("%s recorded a settlement of %d %s.", actorName, in.ParsedAmount, currency)); err != nil {
		return expenses.Expense{}, err
	}

	return full, nil
}

// resolveCurrency also enforces group-membership authorization as a side
// effect, matching how expenses' prepareWrite resolves currency.
func (s *Service) resolveCurrency(ctx context.Context, actorID, toUserID pgtype.UUID, groupIDRaw *string) (string, pgtype.UUID, error) {
	if groupIDRaw == nil {
		actor, err := s.q.GetProfileByID(ctx, actorID)
		if err != nil {
			return "", pgtype.UUID{}, err
		}
		return actor.PreferredCurrency, pgtype.UUID{}, nil
	}

	groupID, err := idutil.Parse(*groupIDRaw)
	if err != nil {
		return "", pgtype.UUID{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	group, err := s.q.GetGroupByID(ctx, groupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", pgtype.UUID{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	if err != nil {
		return "", pgtype.UUID{}, err
	}
	if _, err := s.groups.RequireActiveMembership(ctx, groupID, actorID); err != nil {
		return "", pgtype.UUID{}, err
	}
	if _, err := s.groups.RequireActiveMembership(ctx, groupID, toUserID); err != nil {
		return "", pgtype.UUID{}, err
	}
	return group.Currency, groupID, nil
}
