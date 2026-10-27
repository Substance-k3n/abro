// Package reminders sends payment reminders for friend debts, and the
// daily automatic reminders for overdue debts in groups and between
// friends (ADR-023). A group admin's manual reminder stays in
// internal/groups (ADR-018); all of them share the payment_reminders
// table, and every amount is derived from expenses when it's sent.
package reminders

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
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

// FriendCooldown is how long after one reminder a friend can be reminded
// again by the same person -- the same 24 hours as in a group (ADR-018).
const FriendCooldown = 24 * time.Hour

// AutoEvery is how often the daily job repeats an automatic reminder
// while a debt stays overdue. Any reminder, manual too, restarts it.
const AutoEvery = 14 * 24 * time.Hour

// friendCurrency: personal balances are shown in ETB everywhere in the
// app (MoneyDisplay's default), so reminders say ETB too.
const friendCurrency = "ETB"

// eat is Addis Ababa time, for the dates in reminder messages and the
// hour the daily job runs. Fixed (no DST), so no tz database needed.
var eat = time.FixedZone("EAT", 3*60*60)

type Service struct {
	q             db.Querier
	friends       *friends.Service
	balances      *balances.Service
	notifications *notifications.Service
}

func NewService(q db.Querier, friendsSvc *friends.Service, balancesSvc *balances.Service, notificationsSvc *notifications.Service) *Service {
	return &Service{q: q, friends: friendsSvc, balances: balancesSvc, notifications: notificationsSvc}
}

// RemindFriend sends a reminder from the actor to a friend who owes
// them, in their personal (non-group) balance.
func (s *Service) RemindFriend(ctx context.Context, actorID, friendID pgtype.UUID) (db.PaymentReminder, error) {
	if actorID == friendID {
		return db.PaymentReminder{}, httpx.BadRequest("CANNOT_REMIND_SELF", "You can't send yourself a reminder.")
	}
	areFriends, err := s.friends.AreFriends(ctx, actorID, friendID)
	if err != nil {
		return db.PaymentReminder{}, err
	}
	if !areFriends {
		return db.PaymentReminder{}, httpx.Forbidden("NOT_FRIENDS", "You can only remind your friends.")
	}
	// Positive: the friend owes the actor.
	owes, err := s.balances.GetPairwiseBalance(ctx, friendID, actorID, pgtype.UUID{})
	if err != nil {
		return db.PaymentReminder{}, err
	}
	if owes <= 0 {
		return db.PaymentReminder{}, httpx.Conflict("NOTHING_OWED", "They don't owe you anything.")
	}

	reminder, err := s.q.CreateFriendReminderIfDue(ctx, db.CreateFriendReminderIfDueParams{CreditorID: actorID, RecipientID: friendID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.PaymentReminder{}, s.friendTooSoon(ctx, actorID, friendID)
	}
	if err != nil {
		return db.PaymentReminder{}, err
	}

	// Like a group reminder, the sender gets the same answer whether or
	// not the friend turned reminders off (ADR-018).
	if _, err := s.notifications.NotifyLink(ctx, friendID, notifications.TypePaymentReminder,
		"Payment reminder", fmt.Sprintf("%s reminded you that you owe them %s.",
			s.nameOf(ctx, actorID), money.Format(owes, friendCurrency)),
		"/friends/"+idutil.String(actorID)); err != nil {
		return db.PaymentReminder{}, err
	}
	return reminder, nil
}

// LatestFriendReminder is the newest reminder (manual or automatic) the
// actor's friend got for what they owe the actor; ok is false if none.
func (s *Service) LatestFriendReminder(ctx context.Context, actorID, friendID pgtype.UUID) (db.PaymentReminder, bool, error) {
	reminder, err := s.q.GetLatestFriendReminder(ctx, db.GetLatestFriendReminderParams{CreditorID: actorID, RecipientID: friendID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.PaymentReminder{}, false, nil
	}
	if err != nil {
		return db.PaymentReminder{}, false, err
	}
	return reminder, true, nil
}

// AutoRemindFriends is whether the user's friends who owe them get
// automatic reminders.
func (s *Service) AutoRemindFriends(ctx context.Context, userID pgtype.UUID) (bool, error) {
	return s.q.GetAutoRemindFriends(ctx, userID)
}

func (s *Service) SetAutoRemindFriends(ctx context.Context, userID pgtype.UUID, on bool) (bool, error) {
	return s.q.SetAutoRemindFriends(ctx, db.SetAutoRemindFriendsParams{ID: userID, AutoRemindFriends: on})
}

// SendDue sends every automatic reminder that's due at `now`: to each
// active member whose debt to a group (with reminders on) has been open
// for OverdueAfter, and to each friend whose debt to someone (who has
// them on) has. Then again every AutoEvery while it stays open. One
// failure is logged and skipped so it can't hold up everyone else's.
func (s *Service) SendDue(ctx context.Context, now time.Time) (sent int, err error) {
	overdueBefore := now.Add(-balances.OverdueAfter)
	notSince := pgtype.Timestamptz{Time: now.Add(-AutoEvery), Valid: true}

	groups, err := s.q.ListAutoRemindGroups(ctx)
	if err != nil {
		return 0, err
	}
	for _, g := range groups {
		n, err := s.sendGroupDue(ctx, g, overdueBefore, notSince)
		sent += n
		if err != nil {
			log.Printf("reminders: group %s: %v", idutil.String(g.ID), err)
		}
	}

	pairs, err := s.q.ListAcceptedFriendPairs(ctx)
	if err != nil {
		return sent, err
	}
	for _, p := range pairs {
		n, err := s.sendFriendDue(ctx, p, overdueBefore, notSince)
		sent += n
		if err != nil {
			log.Printf("reminders: friends %s/%s: %v", idutil.String(p.UserID), idutil.String(p.FriendID), err)
		}
	}
	return sent, nil
}

func (s *Service) sendGroupDue(ctx context.Context, g db.ListAutoRemindGroupsRow, overdueBefore time.Time, notSince pgtype.Timestamptz) (int, error) {
	summary, err := s.balances.GetGroupSummary(ctx, g.ID)
	if err != nil {
		return 0, err
	}
	owingSince, err := s.balances.GroupOwingSince(ctx, g.ID)
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

	sent := 0
	for _, pos := range summary {
		since, ok := owingSince[pos.UserID]
		if pos.NetBalance >= 0 || !ok || since.After(overdueBefore) || !isActive[pos.UserID] {
			continue
		}
		recipient, err := idutil.Parse(pos.UserID)
		if err != nil {
			return sent, err
		}
		_, err = s.q.CreateAutoGroupReminderIfDue(ctx, db.CreateAutoGroupReminderIfDueParams{
			GroupID: g.ID, RecipientID: recipient, NotSince: notSince,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			continue // reminded recently
		}
		if err != nil {
			return sent, err
		}
		if _, err := s.notifications.NotifyLink(ctx, recipient, notifications.TypePaymentReminder,
			"Payment reminder", fmt.Sprintf("Friendly reminder: you've owed %s in %q since %s.",
				money.Format(-pos.NetBalance, g.Currency), g.Name, formatDate(since)),
			"/groups/"+idutil.String(g.ID)); err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}

func (s *Service) sendFriendDue(ctx context.Context, p db.ListAcceptedFriendPairsRow, overdueBefore time.Time, notSince pgtype.Timestamptz) (int, error) {
	// Positive: user owes friend.
	balance, err := s.balances.GetPairwiseBalance(ctx, p.UserID, p.FriendID, pgtype.UUID{})
	if err != nil || balance == 0 {
		return 0, err
	}
	debtor, creditor, creditorWants := p.UserID, p.FriendID, p.FriendAutoRemind
	if balance < 0 {
		debtor, creditor, creditorWants = p.FriendID, p.UserID, p.UserAutoRemind
	}
	if !creditorWants {
		return 0, nil
	}
	since, ok, err := s.balances.PairwiseOwingSince(ctx, debtor, creditor)
	if err != nil || !ok || since.After(overdueBefore) {
		return 0, err
	}

	_, err = s.q.CreateAutoFriendReminderIfDue(ctx, db.CreateAutoFriendReminderIfDueParams{
		CreditorID: creditor, RecipientID: debtor, NotSince: notSince,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil // reminded recently
	}
	if err != nil {
		return 0, err
	}
	if _, err := s.notifications.NotifyLink(ctx, debtor, notifications.TypePaymentReminder,
		"Payment reminder", fmt.Sprintf("Friendly reminder: you've owed %s %s since %s.",
			s.nameOf(ctx, creditor), money.Format(money.Abs(balance), friendCurrency), formatDate(since)),
		"/friends/"+idutil.String(creditor)); err != nil {
		return 0, err
	}
	return 1, nil
}

func (s *Service) friendTooSoon(ctx context.Context, creditorID, recipientID pgtype.UUID) error {
	apiErr := httpx.TooManyRequests("REMINDER_TOO_SOON", "They were already reminded in the last 24 hours.")
	last, ok, err := s.LatestFriendReminder(ctx, creditorID, recipientID)
	if err != nil || !ok {
		return apiErr
	}
	apiErr.Details = map[string]time.Time{"nextAllowedAt": last.CreatedAt.Time.Add(FriendCooldown).UTC()}
	return apiErr
}

func (s *Service) nameOf(ctx context.Context, userID pgtype.UUID) string {
	if p, err := s.q.GetProfileByID(ctx, userID); err == nil {
		return p.DisplayName
	}
	return "A friend"
}

// formatDate is "3 Sep 2026" in Addis Ababa time.
func formatDate(t time.Time) string {
	return t.In(eat).Format("2 Jan 2006")
}
