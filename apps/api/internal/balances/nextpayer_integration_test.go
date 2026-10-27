package balances_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/balances"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

// fourPersonGroup is Abel's group with Kidus, Sara and Dawit, all
// active, with the next-payer notifier wired in.
func fourPersonGroup(t *testing.T, e env) (pgtype.UUID, []db.Profile) {
	t.Helper()
	ctx := context.Background()
	people := []db.Profile{e.makeProfile(t, "Abel"), e.makeProfile(t, "Kidus"), e.makeProfile(t, "Sara"), e.makeProfile(t, "Dawit")}
	ids := []string{}
	for i, p := range people {
		for _, q := range people[i+1:] {
			e.makeFriends(t, p.ID, q.ID)
		}
		if i > 0 {
			ids = append(ids, idutil.String(p.ID))
		}
	}
	group, err := e.groups.Create(ctx, people[0].ID, apitypes.CreateGroupInput{
		Name: "Lunch", Type: strPtr("FRIENDS"), Currency: strPtr("ETB"), MemberIDs: ids,
	})
	require.NoError(t, err)
	for _, p := range people[1:] {
		_, err := e.groups.AcceptInvite(ctx, p.ID, group.ID)
		require.NoError(t, err)
	}
	e.expenses.SetGroupExpenseHook(balances.NewNextPayerNotifier(e.q, e.balances, e.notify))
	return group.ID, people
}

func nextPayerNotes(t *testing.T, e env, userID pgtype.UUID) []string {
	t.Helper()
	rows, err := e.pool.Query(context.Background(),
		`SELECT body FROM notifications WHERE user_id = $1 AND type = 'NEXT_PAYER' ORDER BY created_at`, userID)
	require.NoError(t, err)
	defer rows.Close()
	var out []string
	for rows.Next() {
		var body string
		require.NoError(t, rows.Scan(&body))
		out = append(out, body)
	}
	return out
}

func lineIDs(t *testing.T, e env, groupID pgtype.UUID) ([]pgtype.UUID, []int64) {
	t.Helper()
	line, err := e.balances.NextPayers(context.Background(), groupID)
	require.NoError(t, err)
	ids := make([]pgtype.UUID, len(line))
	owes := make([]int64, len(line))
	for i, p := range line {
		ids[i], owes[i] = p.UserID, p.Owes
	}
	return ids, owes
}

func TestNextPayers(t *testing.T) {
	ctx := context.Background()
	e := setup(t)
	groupID, people := fourPersonGroup(t, e)
	abel, kidus, sara, dawit := people[0], people[1], people[2], people[3]
	all := equalParticipants(abel.ID, kidus.ID, sara.ID, dawit.ID)

	// Abel pays 8,000 ETB for four: he's covering 6,000 (over the
	// default 5,000), the other three owe 2,000 each.
	_, err := e.expenses.Create(ctx, abel.ID, expenseInput("EQUAL", "Lunch", "800000", &groupID, all))
	require.NoError(t, err)
	ids, owes := lineIDs(t, e, groupID)
	assert.ElementsMatch(t, []pgtype.UUID{kidus.ID, sara.ID, dawit.ID}, ids)
	assert.Equal(t, []int64{200000, 200000, 200000}, owes)
	for _, p := range people {
		notes := nextPayerNotes(t, e, p.ID)
		require.Len(t, notes, 1, "everyone, Abel too, hears whose turn it is")
		assert.Contains(t, notes[0], "Test Abel is covering 6,000.00 ETB in \"Lunch\". Next to pay: ")
	}

	// Kidus pays the next 4,000: his 2,000 debt is paid off with it
	// (-2,000 + 4,000 - 1,000 = +1,000) and he leaves the line.
	_, err = e.expenses.Create(ctx, kidus.ID, expenseInput("EQUAL", "Coffee", "400000", &groupID, all))
	require.NoError(t, err)
	ids, owes = lineIDs(t, e, groupID)
	assert.ElementsMatch(t, []pgtype.UUID{sara.ID, dawit.ID}, ids)
	assert.Equal(t, []int64{300000, 300000}, owes)

	// Abel pays 1,000 for Dawit alone: Abel was already over the limit
	// (5,000 -> 6,000), so no second notification; Dawit now owes the
	// most and is first.
	_, err = e.expenses.Create(ctx, abel.ID, expenseInput("EQUAL", "Taxi", "100000", &groupID, equalParticipants(dawit.ID)))
	require.NoError(t, err)
	ids, owes = lineIDs(t, e, groupID)
	assert.Equal(t, []pgtype.UUID{dawit.ID, sara.ID}, ids)
	assert.Equal(t, []int64{400000, 300000}, owes)
	assert.Len(t, nextPayerNotes(t, e, sara.ID), 1)
}

func TestNextPayers_TieGoesToWhoOwedLongest(t *testing.T) {
	ctx := context.Background()
	e := setup(t)
	groupID, people := fourPersonGroup(t, e)
	abel, kidus, sara := people[0], people[1], people[2]

	// Sara owes 500 first, Kidus 500 later: same amount, Sara first.
	_, err := e.expenses.Create(ctx, abel.ID, expenseInput("EQUAL", "Tea", "50000", &groupID, equalParticipants(sara.ID)))
	require.NoError(t, err)
	_, err = e.expenses.Create(ctx, abel.ID, expenseInput("EQUAL", "Tea", "50000", &groupID, equalParticipants(kidus.ID)))
	require.NoError(t, err)
	ids, _ := lineIDs(t, e, groupID)
	assert.Equal(t, []pgtype.UUID{sara.ID, kidus.ID}, ids)
	assert.Empty(t, nextPayerNotes(t, e, sara.ID), "1,000 covered is under the 5,000 limit")
}

func TestNextPayers_ThresholdOffOrCustom(t *testing.T) {
	ctx := context.Background()
	e := setup(t)
	groupID, people := fourPersonGroup(t, e)
	abel, kidus := people[0], people[1]
	all := equalParticipants(people[0].ID, people[1].ID, people[2].ID, people[3].ID)

	off := "0"
	in := apitypes.UpdateGroupInput{NextPayerThreshold: &off}
	require.NoError(t, in.Validate())
	_, err := e.groups.Update(ctx, abel.ID, groupID, in)
	require.NoError(t, err)
	_, err = e.expenses.Create(ctx, abel.ID, expenseInput("EQUAL", "Dinner", "2000000", &groupID, all))
	require.NoError(t, err)
	assert.Empty(t, nextPayerNotes(t, e, kidus.ID), "0 turns the notification off")

	// 20,000 limit: Kidus covering 15,000 more (-5,000 -> +10,000) is
	// under it; then another 15,000 takes him to 25,000, across it.
	limit := "2000000"
	in = apitypes.UpdateGroupInput{NextPayerThreshold: &limit}
	require.NoError(t, in.Validate())
	_, err = e.groups.Update(ctx, abel.ID, groupID, in)
	require.NoError(t, err)
	_, err = e.expenses.Create(ctx, kidus.ID, expenseInput("EQUAL", "Dinner", "2000000", &groupID, all))
	require.NoError(t, err)
	assert.Empty(t, nextPayerNotes(t, e, abel.ID))
	_, err = e.expenses.Create(ctx, kidus.ID, expenseInput("EQUAL", "Dinner", "2000000", &groupID, all))
	require.NoError(t, err)
	notes := nextPayerNotes(t, e, abel.ID)
	require.Len(t, notes, 1)
	assert.Contains(t, notes[0], "Test Kidus is covering 25,000.00 ETB")

	bad := "-5"
	in = apitypes.UpdateGroupInput{NextPayerThreshold: &bad}
	assert.Error(t, in.Validate())
}
