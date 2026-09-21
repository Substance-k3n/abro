// Package recurring implements ABRO_PRD.md §35. The "template" is a real
// Expense (created through the normal expenses.Service.Create path --
// reuse, don't duplicate split computation), wrapped by a
// RecurringExpense row carrying frequency/next_run_at/enabled. Each
// generation produces an independent Expense row with the template's
// exact amounts -- editing the template later can never retroactively
// change a past occurrence, since generated rows are full copies, not
// references.
//
// Trigger mechanism (ADR-005): generateDue() is exposed as a plain
// authenticated endpoint (POST /recurring/generate-due) rather than an
// in-process cron job for MVP -- no scheduler infra exists yet.
package recurring

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

type Service struct {
	q             db.Querier
	expenses      *expenses.Service
	notifications *notifications.Service
}

func NewService(q db.Querier, expensesSvc *expenses.Service, notificationsSvc *notifications.Service) *Service {
	return &Service{q: q, expenses: expensesSvc, notifications: notificationsSvc}
}

// RecurringExpense pairs a recurring_expenses row with its full template
// Expense (participants + payer), the same shape the original Prisma
// `include: { templateExpense: { include: { participants: true } } }` produced.
type RecurringExpense struct {
	db.RecurringExpense
	Template expenses.Expense
}

func (s *Service) Create(ctx context.Context, actorID pgtype.UUID, in apitypes.CreateRecurringExpenseInput) (RecurringExpense, error) {
	template, err := s.expenses.Create(ctx, actorID, in.CreateExpenseInput)
	if err != nil {
		return RecurringExpense{}, err
	}

	row, err := s.q.CreateRecurringExpense(ctx, db.CreateRecurringExpenseParams{
		TemplateExpenseID: template.ID,
		Frequency:         db.RecurringFrequency(in.Frequency),
		NextRunAt:         pgtype.Timestamptz{Time: nextOccurrence(template.ExpenseDate.Time, in.Frequency), Valid: true},
		Enabled:           true,
	})
	if err != nil {
		return RecurringExpense{}, err
	}

	return RecurringExpense{RecurringExpense: row, Template: template}, nil
}

func (s *Service) ListMine(ctx context.Context, userID pgtype.UUID) ([]RecurringExpense, error) {
	rows, err := s.q.ListMyRecurringExpenses(ctx, userID)
	if err != nil {
		return nil, err
	}

	out := make([]RecurringExpense, len(rows))
	for i, row := range rows {
		template, err := s.loadTemplate(ctx, row.TemplateExpenseID)
		if err != nil {
			return nil, err
		}
		out[i] = RecurringExpense{RecurringExpense: row, Template: template}
	}
	return out, nil
}

func (s *Service) SetEnabled(ctx context.Context, actorID, recurringID pgtype.UUID, enabled bool) (RecurringExpense, error) {
	recurring, err := s.requireVisible(ctx, recurringID)
	if err != nil {
		return RecurringExpense{}, err
	}
	if err := s.requireEditAuthority(ctx, actorID, recurring.Template); err != nil {
		return RecurringExpense{}, err
	}

	updated, err := s.q.UpdateRecurringExpenseEnabled(ctx, db.UpdateRecurringExpenseEnabledParams{ID: recurringID, Enabled: enabled})
	if err != nil {
		return RecurringExpense{}, err
	}
	return RecurringExpense{RecurringExpense: updated, Template: recurring.Template}, nil
}

// GenerateDue generates every occurrence whose next_run_at is due. Reuses
// expenses.Service.Create with splitType EXACT and the template's
// already-resolved participant amounts -- a PERCENTAGE/SHARES template's
// original *weights* aren't retained once split into fixed amounts, so
// regeneration always reproduces the template's exact amounts rather than
// re-deriving a split.
//
// Sequential by design (each generation's authorization/friend-membership
// checks must run against current state, not a stale snapshot), one row
// at a time.
func (s *Service) GenerateDue(ctx context.Context, now time.Time) (int, error) {
	due, err := s.q.ListDueRecurringExpenses(ctx, pgtype.Timestamptz{Time: now, Valid: true})
	if err != nil {
		return 0, err
	}

	generated := 0
	for _, recurring := range due {
		template, err := s.loadTemplate(ctx, recurring.TemplateExpenseID)
		if err != nil {
			return generated, err
		}

		in := apitypes.CreateExpenseInput{
			SplitType: "EXACT", Name: template.Name, Category: template.Category,
			Amount: fmt.Sprintf("%d", template.Amount), Currency: &template.Currency,
			ExpenseDate: recurring.NextRunAt.Time.Format(time.RFC3339),
		}
		if template.GroupID.Valid {
			gid := idutil.String(template.GroupID)
			in.GroupID = &gid
		}
		paidByStr := idutil.String(template.PaidByID)
		in.PaidByID = &paidByStr
		if template.Notes.Valid {
			in.Notes = &template.Notes.String
		}
		in.Participants = make([]apitypes.ExpenseParticipantRaw, len(template.Participants))
		recipientIDs := make([]pgtype.UUID, 0, len(template.Participants))
		for i, p := range template.Participants {
			in.Participants[i] = apitypes.ExpenseParticipantRaw{UserID: idutil.String(p.UserID), Amount: fmt.Sprintf("%d", p.Amount)}
			if p.UserID != template.PaidByID {
				recipientIDs = append(recipientIDs, p.UserID)
			}
		}
		if err := in.Validate(); err != nil {
			return generated, err
		}

		created, err := s.expenses.Create(ctx, template.PaidByID, in)
		if err != nil {
			return generated, err
		}

		if err := s.notifications.NotifyMany(ctx, recipientIDs, notifications.TypeRecurringExpense,
			"Recurring expense generated", fmt.Sprintf("A recurring expense was generated: %q (%d %s).", created.Name, created.Amount, created.Currency)); err != nil {
			return generated, err
		}

		if err := s.q.UpdateRecurringExpenseNextRunAt(ctx, db.UpdateRecurringExpenseNextRunAtParams{
			ID: recurring.ID, NextRunAt: pgtype.Timestamptz{Time: nextOccurrence(recurring.NextRunAt.Time, string(recurring.Frequency)), Valid: true},
		}); err != nil {
			return generated, err
		}
		generated++
	}

	return generated, nil
}

func (s *Service) requireVisible(ctx context.Context, recurringID pgtype.UUID) (RecurringExpense, error) {
	row, err := s.q.GetRecurringExpenseByID(ctx, recurringID)
	if errors.Is(err, pgx.ErrNoRows) {
		return RecurringExpense{}, httpx.NotFound("RECURRING_EXPENSE_NOT_FOUND", "No such recurring expense.")
	}
	if err != nil {
		return RecurringExpense{}, err
	}
	template, err := s.loadTemplate(ctx, row.TemplateExpenseID)
	if err != nil {
		return RecurringExpense{}, err
	}
	return RecurringExpense{RecurringExpense: row, Template: template}, nil
}

// requireEditAuthority is the same rule as expenses' requireEditAuthority:
// the payer, or a group admin.
func (s *Service) requireEditAuthority(ctx context.Context, actorID pgtype.UUID, template expenses.Expense) error {
	if template.PaidByID == actorID {
		return nil
	}
	if template.GroupID.Valid {
		membership, err := s.q.GetGroupMember(ctx, db.GetGroupMemberParams{GroupID: template.GroupID, UserID: actorID})
		if err == nil && membership.Status == db.GroupMemberStatusACTIVE && membership.Role == db.GroupMemberRoleADMIN {
			return nil
		}
	}
	return httpx.Forbidden("NOT_EDIT_AUTHORIZED", "Only the payer or a group admin can change this recurring expense.")
}

func (s *Service) loadTemplate(ctx context.Context, templateExpenseID pgtype.UUID) (expenses.Expense, error) {
	expense, err := s.q.GetExpenseByID(ctx, templateExpenseID)
	if err != nil {
		return expenses.Expense{}, err
	}
	return s.expenses.LoadExpense(ctx, expense)
}

func nextOccurrence(from time.Time, frequency string) time.Time {
	switch frequency {
	case "DAILY":
		return from.AddDate(0, 0, 1)
	case "WEEKLY":
		return from.AddDate(0, 0, 7)
	case "MONTHLY":
		return from.AddDate(0, 1, 0)
	case "YEARLY":
		return from.AddDate(1, 0, 0)
	default:
		return from
	}
}
