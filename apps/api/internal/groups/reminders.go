package groups

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

// ReminderCooldown is how long after one payment reminder the same member
// can be reminded again in the same group (ADR-018).
const ReminderCooldown = 24 * time.Hour

// RemindMember sends a payment reminder from a group admin to a member
// who owes the group (roadmap P6, ADR-018). What they owe is their net in
// the group, derived from expenses at the moment of the reminder.
func (s *Service) RemindMember(ctx context.Context, actorID, groupID, targetUserID pgtype.UUID) (db.PaymentReminder, error) {
	group, err := s.requireGroup(ctx, groupID)
	if err != nil {
		return db.PaymentReminder{}, err
	}
	if _, err := s.requireActiveAdmin(ctx, groupID, actorID); err != nil {
		return db.PaymentReminder{}, err
	}
	if actorID == targetUserID {
		return db.PaymentReminder{}, httpx.BadRequest("CANNOT_REMIND_SELF", "You can't send yourself a reminder.")
	}
	target, err := s.requireMembership(ctx, groupID, targetUserID)
	if err != nil {
		return db.PaymentReminder{}, err
	}
	if target.Status != db.GroupMemberStatusACTIVE {
		return db.PaymentReminder{}, httpx.Conflict("NOT_ACTIVE_MEMBER", "Only active members can be reminded.")
	}

	nets, err := s.memberNets(ctx, groupID)
	if err != nil {
		return db.PaymentReminder{}, err
	}
	owes := -nets[targetUserID]
	if owes <= 0 {
		return db.PaymentReminder{}, httpx.Conflict("NOTHING_OWED", "This member doesn't owe the group anything.")
	}

	reminder, err := s.q.CreatePaymentReminderIfDue(ctx, db.CreatePaymentReminderIfDueParams{
		GroupID: groupID, SenderID: actorID, RecipientID: targetUserID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.PaymentReminder{}, s.reminderTooSoon(ctx, groupID, targetUserID)
	}
	if err != nil {
		return db.PaymentReminder{}, err
	}

	actorName := "A group admin"
	if actor, err := s.q.GetProfileByID(ctx, actorID); err == nil {
		actorName = actor.DisplayName
	}
	// Notify is a no-op for someone who turned these off. The admin gets
	// the same answer either way, so a reminder never reveals that.
	if _, err := s.notifications.Notify(ctx, targetUserID, notifications.TypePaymentReminder,
		"Payment reminder", fmt.Sprintf("%s reminded you that you owe %s in %q.",
			actorName, money.FormatMoney(owes, currencyMeta(group.Currency)), group.Name)); err != nil {
		return db.PaymentReminder{}, err
	}
	return reminder, nil
}

// LatestReminders is the most recent payment reminder for each member of
// the group who has had one. Admins only, like sending them.
func (s *Service) LatestReminders(ctx context.Context, actorID, groupID pgtype.UUID) ([]db.PaymentReminder, error) {
	if _, err := s.requireGroup(ctx, groupID); err != nil {
		return nil, err
	}
	if _, err := s.requireActiveAdmin(ctx, groupID, actorID); err != nil {
		return nil, err
	}
	return s.q.ListLatestPaymentReminders(ctx, groupID)
}

func (s *Service) reminderTooSoon(ctx context.Context, groupID, targetUserID pgtype.UUID) error {
	apiErr := httpx.TooManyRequests("REMINDER_TOO_SOON", "This member was already reminded in the last 24 hours.")
	last, err := s.q.GetLatestPaymentReminder(ctx, db.GetLatestPaymentReminderParams{GroupID: groupID, RecipientID: targetUserID})
	if err != nil {
		return apiErr
	}
	apiErr.Details = map[string]time.Time{"nextAllowedAt": last.CreatedAt.Time.Add(ReminderCooldown).UTC()}
	return apiErr
}

// currencyMeta is the display formatting for a group's currency. ETB is
// the only one with full metadata; any other code gets two decimals, the
// same as the web app, which enters every amount with two.
func currencyMeta(code string) money.CurrencyMeta {
	if code == money.ETB.Code {
		return money.ETB
	}
	return money.CurrencyMeta{Code: code, DecimalDigits: 2}
}
