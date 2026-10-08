// Package notifications implements ABRO_PRD.md §34's in-app notifications,
// each also pushed to the recipient's phones/browsers when they turned
// that on (ADR-021, internal/push). No email/Telegram. Called from the modules that own
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
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/push"
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
	// TypePaymentReminder is not in PRD §34's list: a group admin's nudge
	// to a member who owes (roadmap P6, ADR-018).
	TypePaymentReminder Type = "PAYMENT_REMINDER"
	// TypeFriendRequest / TypeFriendAccepted are not in PRD §34's list
	// either (it left friend events out); added from trial feedback
	// (2026-10-07): people didn't know a request was waiting, or that
	// theirs had been accepted.
	TypeFriendRequest  Type = "FRIEND_REQUEST"
	TypeFriendAccepted Type = "FRIEND_ACCEPTED"
	// TypeExpenseDisputed: someone on an expense says they weren't part
	// of it, or the payer kept it as it is (ADR-020).
	TypeExpenseDisputed Type = "EXPENSE_DISPUTED"
)

// AllTypes is every Type, in the order SET-02 lists them. A user can
// opt out of any of them (Preferences/UpdatePreferences).
var AllTypes = []Type{
	TypeExpenseAdded, TypeExpenseEdited, TypeExpenseDeleted, TypeSettlement,
	TypeGroupInvitation, TypeGroupMembershipChange, TypeRecurringExpense,
	TypeDebtSimplificationChange, TypePaymentReminder,
	TypeFriendRequest, TypeFriendAccepted, TypeExpenseDisputed,
}

func isKnownType(t string) bool {
	for _, known := range AllTypes {
		if string(known) == t {
			return true
		}
	}
	return false
}

// Pusher is push.Service's Send: delivery to phones, in the background.
type Pusher interface {
	Send(userIDs []pgtype.UUID, msg push.Message)
}

type Service struct {
	q      db.Querier
	pusher Pusher
}

func NewService(q db.Querier) *Service {
	return &Service{q: q}
}

// SetPusher turns on phone/browser push for every notification created
// from now on. Without it (tests, push not configured) they're in-app only.
func (s *Service) SetPusher(p Pusher) {
	s.pusher = p
}

// pushStored sends notifications that were just stored. Opt-outs were
// already applied: a row only exists if the user wants this type.
func (s *Service) pushStored(rows ...db.Notification) {
	if s.pusher == nil {
		return
	}
	for _, n := range rows {
		s.pusher.Send([]pgtype.UUID{n.UserID}, push.Message{
			ID: idutil.String(n.ID), Type: n.Type, Title: n.Title, Body: n.Body, Link: n.Link.String,
		})
	}
}

// Notify creates one in-app notification, unless the user opted out of
// this type -- then it's a no-op returning a zero Notification.
func (s *Service) Notify(ctx context.Context, userID pgtype.UUID, t Type, title, body string) (db.Notification, error) {
	return s.NotifyLink(ctx, userID, t, title, body, "")
}

// NotifyLink is Notify with the in-app path of what it's about (e.g.
// /expenses/<id>), which tapping the notification opens.
func (s *Service) NotifyLink(ctx context.Context, userID pgtype.UUID, t Type, title, body, link string) (db.Notification, error) {
	optedOut, err := s.q.IsNotificationOptedOut(ctx, db.IsNotificationOptedOutParams{UserID: userID, Type: string(t)})
	if err != nil {
		return db.Notification{}, err
	}
	if optedOut {
		return db.Notification{}, nil
	}
	notification, err := s.q.CreateNotification(ctx, db.CreateNotificationParams{
		UserID: userID, Type: string(t), Title: title, Body: body,
		Link: pgtype.Text{String: link, Valid: link != ""},
	})
	if err != nil {
		return db.Notification{}, err
	}
	s.pushStored(notification)
	return notification, nil
}

// NotifyMany fans the same event out to several recipients; de-dupes,
// skips anyone who opted out of this type (in the insert itself), and
// no-ops on an empty list.
func (s *Service) NotifyMany(ctx context.Context, userIDs []pgtype.UUID, t Type, title, body string) error {
	recipients := dedupe(userIDs)
	if len(recipients) == 0 {
		return nil
	}
	rows, err := s.q.CreateNotificationsBulk(ctx, db.CreateNotificationsBulkParams{
		UserIds: recipients, Type: string(t), Title: title, Body: body,
	})
	if err != nil {
		return err
	}
	s.pushStored(rows...)
	return nil
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

// Preferences is every Type with whether the user gets it (true unless
// they opted out).
func (s *Service) Preferences(ctx context.Context, userID pgtype.UUID) (map[Type]bool, error) {
	optOuts, err := s.q.ListNotificationOptOuts(ctx, userID)
	if err != nil {
		return nil, err
	}
	prefs := make(map[Type]bool, len(AllTypes))
	for _, t := range AllTypes {
		prefs[t] = true
	}
	for _, t := range optOuts {
		if isKnownType(t) {
			prefs[Type(t)] = false
		}
	}
	return prefs, nil
}

// UpdatePreferences turns the given types on or off; types not in
// `changes` keep their current setting. Unknown types are rejected
// before anything is written.
func (s *Service) UpdatePreferences(ctx context.Context, userID pgtype.UUID, changes map[string]bool) (map[Type]bool, error) {
	for t := range changes {
		if !isKnownType(t) {
			return nil, httpx.BadRequest("VALIDATION_ERROR", "unknown notification type: "+t)
		}
	}
	for t, enabled := range changes {
		var err error
		if enabled {
			err = s.q.RemoveNotificationOptOut(ctx, db.RemoveNotificationOptOutParams{UserID: userID, Type: t})
		} else {
			err = s.q.AddNotificationOptOut(ctx, db.AddNotificationOptOutParams{UserID: userID, Type: t})
		}
		if err != nil {
			return nil, err
		}
	}
	return s.Preferences(ctx, userID)
}
