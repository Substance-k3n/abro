package expenses_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/expenses"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

func disputedAt(exp expenses.Expense, userID pgtype.UUID) pgtype.Timestamptz {
	for _, p := range exp.Participants {
		if p.UserID == userID {
			return p.DisputedAt
		}
	}
	return pgtype.Timestamptz{}
}

func requireCode(t *testing.T, err error, code string) {
	t.Helper()
	var apiErr *httpx.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, code, apiErr.Code)
}

func TestService_Disputes(t *testing.T) {
	ctx := context.Background()

	// x paid 1.00 for x, y and z (33/33/34 or similar), all friends.
	trio := func(t *testing.T, e env) (db.Profile, db.Profile, db.Profile, expenses.Expense) {
		t.Helper()
		x := e.makeProfile(t, "X")
		y := e.makeProfile(t, "Y")
		z := e.makeProfile(t, "Z")
		e.makeFriends(t, x.ID, y.ID)
		e.makeFriends(t, x.ID, z.ID)
		return x, y, z, makeExpense(t, e, x.ID, y.ID, z.ID)
	}
	notes := func(t *testing.T, e env, userID pgtype.UUID) []db.Notification {
		t.Helper()
		list, err := e.notifySvc.List(ctx, userID, false, 100, 0)
		require.NoError(t, err)
		var out []db.Notification
		for _, n := range list {
			if n.Type == string(notifications.TypeExpenseDisputed) {
				out = append(out, n)
			}
		}
		return out
	}

	t.Run("a participant disputes: flagged, payer told with a link, amounts unchanged", func(t *testing.T) {
		e := setup(t)
		x, _, z, exp := trio(t, e)

		got, err := e.svc.Dispute(ctx, z.ID, exp.ID)
		require.NoError(t, err)
		assert.True(t, disputedAt(got, z.ID).Valid)
		for i, p := range got.Participants {
			assert.Equal(t, exp.Participants[i].Amount, p.Amount, "a dispute never changes a share")
		}

		n := notes(t, e, x.ID)
		require.Len(t, n, 1)
		assert.Contains(t, n[0].Body, `Test Z says they weren't part of "Receipt test expense"`)
		assert.Equal(t, "/expenses/"+idutil.String(exp.ID), n[0].Link.String)

		_, err = e.svc.Dispute(ctx, z.ID, exp.ID)
		requireCode(t, err, "ALREADY_DISPUTED")
	})

	t.Run("the payer and outsiders can't dispute", func(t *testing.T) {
		e := setup(t)
		x, _, _, exp := trio(t, e)
		_, err := e.svc.Dispute(ctx, x.ID, exp.ID)
		requireCode(t, err, "PAYER_CANNOT_DISPUTE")

		outsider := e.makeProfile(t, "Outsider")
		_, err = e.svc.Dispute(ctx, outsider.ID, exp.ID)
		require.Error(t, err)
	})

	t.Run("withdrawing clears it", func(t *testing.T) {
		e := setup(t)
		_, _, z, exp := trio(t, e)
		_, err := e.svc.Dispute(ctx, z.ID, exp.ID)
		require.NoError(t, err)

		got, err := e.svc.WithdrawDispute(ctx, z.ID, exp.ID)
		require.NoError(t, err)
		assert.False(t, disputedAt(got, z.ID).Valid)
		_, err = e.svc.WithdrawDispute(ctx, z.ID, exp.ID)
		requireCode(t, err, "NOT_DISPUTED")
	})

	t.Run("the payer keeps it as it is: cleared, participant told; others can't", func(t *testing.T) {
		e := setup(t)
		x, y, z, exp := trio(t, e)
		_, err := e.svc.Dispute(ctx, z.ID, exp.ID)
		require.NoError(t, err)

		_, err = e.svc.DismissDispute(ctx, y.ID, exp.ID, z.ID)
		requireCode(t, err, "NOT_EDIT_AUTHORIZED")

		got, err := e.svc.DismissDispute(ctx, x.ID, exp.ID, z.ID)
		require.NoError(t, err)
		assert.False(t, disputedAt(got, z.ID).Valid)
		n := notes(t, e, z.ID)
		require.Len(t, n, 1)
		assert.Equal(t, `Test X kept "Receipt test expense" as it is, with you in it. Talk to them if you still disagree.`, n[0].Body)
	})

	t.Run("editing the expense clears every dispute", func(t *testing.T) {
		e := setup(t)
		x, y, z, exp := trio(t, e)
		_, err := e.svc.Dispute(ctx, z.ID, exp.ID)
		require.NoError(t, err)

		// x takes z off.
		updated, err := e.svc.Update(ctx, x.ID, exp.ID, baseInput("EQUAL", "Receipt test expense", "100", equalParticipants(x.ID, y.ID)))
		require.NoError(t, err)
		for _, p := range updated.Participants {
			assert.False(t, p.DisputedAt.Valid)
			assert.NotEqual(t, z.ID, p.UserID)
		}
	})

	t.Run("a settlement can't be disputed", func(t *testing.T) {
		e := setup(t)
		x := e.makeProfile(t, "X")
		y := e.makeProfile(t, "Y")
		e.makeFriends(t, x.ID, y.ID)
		var id pgtype.UUID
		require.NoError(t, e.pool.QueryRow(ctx, `INSERT INTO expenses (name, category, amount, currency, paid_by_id, split_type, expense_date)
			VALUES ('Settlement', 'Settlement', 100, 'ETB', $1, 'SETTLEMENT', now()) RETURNING id`, x.ID).Scan(&id))
		e.trackExpense(id)
		_, err := e.pool.Exec(ctx, `INSERT INTO expense_participants (expense_id, user_id, amount) VALUES ($1, $2, 0), ($1, $3, 100)`, id, x.ID, y.ID)
		require.NoError(t, err)

		_, err = e.svc.Dispute(ctx, y.ID, id)
		requireCode(t, err, "SETTLEMENT_NOT_DISPUTABLE")
	})
}
