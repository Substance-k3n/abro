package groups_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/groups"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

func reminderNotifications(t *testing.T, e env, userID db.Profile) []db.Notification {
	t.Helper()
	list, err := e.notifySvc.List(context.Background(), userID.ID, false, 100, 0)
	require.NoError(t, err)
	var out []db.Notification
	for _, n := range list {
		if n.Type == string(notifications.TypePaymentReminder) {
			out = append(out, n)
		}
	}
	return out
}

func TestPaymentReminders(t *testing.T) {
	ctx := context.Background()

	t.Run("an admin reminds a member who owes; the member is told how much", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		member := e.makeProfile(t, "Member")
		group := activeGroup(t, e, owner, member)
		// member owes 1234.50 ETB.
		addGroupExpense(t, e, group.ID, owner.ID, member.ID, 123450, "EXACT")

		reminder, err := e.svc.RemindMember(ctx, owner.ID, group.ID, member.ID)
		require.NoError(t, err)
		assert.Equal(t, member.ID, reminder.RecipientID)
		assert.Equal(t, owner.ID, reminder.SenderID)

		got := reminderNotifications(t, e, member)
		require.Len(t, got, 1)
		assert.Equal(t, `Test Owner reminded you that you owe 1234.50 ETB in "Trip".`, got[0].Body)
		assert.Empty(t, reminderNotifications(t, e, owner))
	})

	t.Run("only once per member per group every 24 hours", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		member := e.makeProfile(t, "Member")
		group := activeGroup(t, e, owner, member)
		addGroupExpense(t, e, group.ID, owner.ID, member.ID, 5000, "EXACT")

		first, err := e.svc.RemindMember(ctx, owner.ID, group.ID, member.ID)
		require.NoError(t, err)

		_, err = e.svc.RemindMember(ctx, owner.ID, group.ID, member.ID)
		var apiErr *httpx.APIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, "REMINDER_TOO_SOON", apiErr.Code)
		assert.Equal(t, http.StatusTooManyRequests, apiErr.Status)
		details, ok := apiErr.Details.(map[string]time.Time)
		require.True(t, ok)
		assert.WithinDuration(t, first.CreatedAt.Time.Add(groups.ReminderCooldown), details["nextAllowedAt"], time.Second)
		assert.Len(t, reminderNotifications(t, e, member), 1)

		// 24 hours later it's allowed again.
		_, err = e.pool.Exec(ctx, `UPDATE payment_reminders SET created_at = now() - interval '24 hours 1 minute' WHERE id = $1`, first.ID)
		require.NoError(t, err)
		_, err = e.svc.RemindMember(ctx, owner.ID, group.ID, member.ID)
		require.NoError(t, err)
		assert.Len(t, reminderNotifications(t, e, member), 2)
	})

	t.Run("refuses someone who owes nothing, is owed, or is yourself", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		member := e.makeProfile(t, "Member")
		group := activeGroup(t, e, owner, member)

		_, err := e.svc.RemindMember(ctx, owner.ID, group.ID, member.ID)
		assertAPIError(t, err, "NOTHING_OWED")

		// The member paid, so the group owes them.
		addGroupExpense(t, e, group.ID, member.ID, owner.ID, 5000, "EXACT")
		_, err = e.svc.RemindMember(ctx, owner.ID, group.ID, member.ID)
		assertAPIError(t, err, "NOTHING_OWED")

		_, err = e.svc.RemindMember(ctx, owner.ID, group.ID, owner.ID)
		assertAPIError(t, err, "CANNOT_REMIND_SELF")

		// Settled up: back to owing nothing.
		addGroupExpense(t, e, group.ID, owner.ID, member.ID, 5000, "SETTLEMENT")
		_, err = e.svc.RemindMember(ctx, owner.ID, group.ID, member.ID)
		assertAPIError(t, err, "NOTHING_OWED")
	})

	t.Run("admins only, for sending and for listing", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		member := e.makeProfile(t, "Member")
		group := activeGroup(t, e, owner, member)
		addGroupExpense(t, e, group.ID, member.ID, owner.ID, 5000, "EXACT") // owner owes

		_, err := e.svc.RemindMember(ctx, member.ID, group.ID, owner.ID)
		assertAPIError(t, err, "NOT_GROUP_ADMIN")
		_, err = e.svc.LatestReminders(ctx, member.ID, group.ID)
		assertAPIError(t, err, "NOT_GROUP_ADMIN")
	})

	t.Run("an invited (not yet active) member can't be reminded", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		invited := e.makeProfile(t, "Invited")
		e.makeFriends(t, owner.ID, invited.ID)
		group := activeGroup(t, e, owner, e.makeProfile(t, "Member"))
		_, err := e.svc.AddMember(ctx, owner.ID, group.ID, invited.ID)
		require.NoError(t, err)

		_, err = e.svc.RemindMember(ctx, owner.ID, group.ID, invited.ID)
		assertAPIError(t, err, "NOT_ACTIVE_MEMBER")
	})

	t.Run("a member who turned reminders off: same success, no notification", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		member := e.makeProfile(t, "Member")
		group := activeGroup(t, e, owner, member)
		addGroupExpense(t, e, group.ID, owner.ID, member.ID, 5000, "EXACT")
		_, err := e.notifySvc.UpdatePreferences(ctx, member.ID, map[string]bool{string(notifications.TypePaymentReminder): false})
		require.NoError(t, err)
		t.Cleanup(func() {
			e.pool.Exec(context.Background(), `DELETE FROM notification_opt_outs WHERE user_id = $1`, member.ID)
		})

		_, err = e.svc.RemindMember(ctx, owner.ID, group.ID, member.ID)
		require.NoError(t, err)
		assert.Empty(t, reminderNotifications(t, e, member))
		// Still counted against the 24 hours.
		_, err = e.svc.RemindMember(ctx, owner.ID, group.ID, member.ID)
		assertAPIError(t, err, "REMINDER_TOO_SOON")
	})

	t.Run("LatestReminders lists the newest reminder per member, per group", func(t *testing.T) {
		e := setup(t)
		owner := e.makeProfile(t, "Owner")
		a := e.makeProfile(t, "A")
		b := e.makeProfile(t, "B")
		group := activeGroup(t, e, owner, a)
		e.makeFriends(t, owner.ID, b.ID)
		_, err := e.svc.AddMember(ctx, owner.ID, group.ID, b.ID)
		require.NoError(t, err)
		_, err = e.svc.AcceptInvite(ctx, b.ID, group.ID)
		require.NoError(t, err)
		addGroupExpense(t, e, group.ID, owner.ID, a.ID, 5000, "EXACT")
		addGroupExpense(t, e, group.ID, owner.ID, b.ID, 3000, "EXACT")

		old, err := e.svc.RemindMember(ctx, owner.ID, group.ID, a.ID)
		require.NoError(t, err)
		_, err = e.pool.Exec(ctx, `UPDATE payment_reminders SET created_at = now() - interval '2 days' WHERE id = $1`, old.ID)
		require.NoError(t, err)
		newer, err := e.svc.RemindMember(ctx, owner.ID, group.ID, a.ID)
		require.NoError(t, err)
		forB, err := e.svc.RemindMember(ctx, owner.ID, group.ID, b.ID)
		require.NoError(t, err)

		latest, err := e.svc.LatestReminders(ctx, owner.ID, group.ID)
		require.NoError(t, err)
		byRecipient := map[string]db.PaymentReminder{}
		for _, r := range latest {
			byRecipient[idutil.String(r.RecipientID)] = r
		}
		require.Len(t, latest, 2)
		assert.Equal(t, newer.ID, byRecipient[idutil.String(a.ID)].ID)
		assert.Equal(t, forB.ID, byRecipient[idutil.String(b.ID)].ID)
	})
}
