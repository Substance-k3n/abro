// Package notifications implements ABRO_PRD.md §34's in-app notifications.
// No push/email/Telegram (PRD: "Later"). Called from the modules that own
// each event (expenses, groups, settlements, recurring) rather than
// emitting anything itself -- this service only knows how to store and
// read rows.
package notifications

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
)

// Type is one of ABRO_PRD.md §34's event types.
type Type string

const (
	TypeExpenseAdded             Type = "EXPENSE_ADDED"
	TypeExpenseEdited            Type = "EXPENSE_EDITED"
	TypeExpenseDeleted           Type = "EXPENSE_DELETED"
	TypeSettlement               Type = "SETTLEMENT"
	TypeGroupInvitation          Type = "GROUP_INVITATION"
	TypeGroupMembershipChange    Type = "GROUP_MEMBERSHIP_CHANGE"
	TypeRecurringExpense         Type = "RECURRING_EXPENSE"
	TypeDebtSimplificationChange Type = "DEBT_SIMPLIFICATION_CHANGE"
)

type Service struct {
	q db.Querier
}

func NewService(q db.Querier) *Service {
	return &Service{q: q}
}

func (s *Service) Notify(ctx context.Context, userID pgtype.UUID, t Type, title, body string) (db.Notification, error) {
	return s.q.CreateNotification(ctx, db.CreateNotificationParams{
		UserID: userID, Type: string(t), Title: title, Body: body,
	})
}

// NotifyMany fans the same event out to several recipients; de-dupes and
// no-ops on an empty list.
func (s *Service) NotifyMany(ctx context.Context, userIDs []pgtype.UUID, t Type, title, body string) error {
	recipients := dedupe(userIDs)
	if len(recipients) == 0 {
		return nil
	}
	_, err := s.q.CreateNotificationsBulk(ctx, db.CreateNotificationsBulkParams{
		UserIds: recipients, Type: string(t), Title: title, Body: body,
	})
	return err
}

func (s *Service) List(ctx context.Context, userID pgtype.UUID, unreadOnly bool, limit, offset int32) ([]db.Notification, error) {
	if limit <= 0 {
		limit = 50
	}
	return s.q.ListNotifications(ctx, db.ListNotificationsParams{
		UserID: userID, UnreadOnly: unreadOnly, Limit: limit, Offset: offset,
	})
}

func (s *Service) MarkRead(ctx context.Context, userID, notificationID pgtype.UUID) (db.Notification, error) {
	notification, err := s.q.GetNotificationByID(ctx, notificationID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && notification.UserID != userID) {
		return db.Notification{}, httpx.NotFound("NOTIFICATION_NOT_FOUND", "No such notification.")
	}
	if err != nil {
		return db.Notification{}, err
	}
	return s.q.MarkNotificationRead(ctx, notificationID)
}

func (s *Service) MarkAllRead(ctx context.Context, userID pgtype.UUID) error {
	return s.q.MarkAllNotificationsRead(ctx, userID)
}

func dedupe(ids []pgtype.UUID) []pgtype.UUID {
	seen := make(map[pgtype.UUID]bool, len(ids))
	out := make([]pgtype.UUID, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}
