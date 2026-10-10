package ekubs_test

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/ekubs"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

func testDatabaseURL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://abro:password@localhost:5460/abro_go?sslmode=disable"
}

// 40,000 ETB and 20,000 ETB in minor units.
const (
	full = 4_000_000
	half = 2_000_000
)

type env struct {
	svc   *ekubs.Service
	clock *time.Time
	ctx   context.Context
	// people[name] -> profile id; all friends of "A" except "Z".
	people map[string]pgtype.UUID
}

func setup(t *testing.T, names ...string) env {
	t.Helper()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, testDatabaseURL())
	require.NoError(t, err)
	require.NoError(t, pool.Ping(ctx))
	t.Cleanup(pool.Close)

	queries := db.New(pool)
	notifySvc := notifications.NewService(queries)
	svc := ekubs.NewService(queries, friends.NewService(queries, notifySvc), notifySvc)
	clock := time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC)
	svc.SetClock(func() time.Time { return clock })

	var ids []pgtype.UUID
	t.Cleanup(func() {
		ctx := context.Background()
		pool.Exec(ctx, `DELETE FROM ekubs WHERE created_by_id = ANY($1::uuid[])`, ids)
		pool.Exec(ctx, `DELETE FROM friendships WHERE user_id = ANY($1::uuid[]) OR friend_id = ANY($1::uuid[])`, ids)
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, ids)
		pool.Exec(ctx, `DELETE FROM profiles WHERE id = ANY($1::uuid[])`, ids)
	})
	people := map[string]pgtype.UUID{}
	for _, name := range names {
		email := fmt.Sprintf("test-ekub-%s-%d-%d@abro.test", name, time.Now().UnixNano(), rand.Intn(1_000_000))
		p, err := queries.UpsertProfileByEmail(ctx, db.UpsertProfileByEmailParams{
			Email: pgtype.Text{String: email, Valid: true}, DisplayName: name,
		})
		require.NoError(t, err)
		ids = append(ids, p.ID)
		people[name] = p.ID
		if name != "A" && name != "Z" { // Z is a stranger
			_, err = pool.Exec(ctx, `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'ACCEPTED')`, people["A"], p.ID)
			require.NoError(t, err)
		}
	}
	return env{svc: svc, clock: &clock, ctx: ctx, people: people}
}

func share(id pgtype.UUID, amount int64) apitypes.EkubShareInput {
	return apitypes.EkubShareInput{ID: idutil.String(id), Amount: fmt.Sprint(amount)}
}

func requireCode(t *testing.T, err error, code string) {
	t.Helper()
	var apiErr *httpx.APIError
	require.True(t, errors.As(err, &apiErr), "want %s, got %v", code, err)
	assert.Equal(t, code, apiErr.Code)
}

func memberID(t *testing.T, d apitypes.EkubDetail, e env, name string) string {
	t.Helper()
	for _, m := range d.Members {
		if m.UserID == idutil.String(e.people[name]) {
			return m.ID
		}
	}
	t.Fatalf("%s not in ekub", name)
	return ""
}

func obligation(d apitypes.EkubDetail, payer, recipient string) *apitypes.EkubObligation {
	for i, o := range d.Obligations {
		if o.PayerMemberID == payer && o.RecipientMemberID == recipient {
			return &d.Obligations[i]
		}
	}
	return nil
}

func paid(memberID string) apitypes.RecordEkubPaymentInput {
	return apitypes.RecordEkubPaymentInput{MemberID: memberID, Direction: "PAID"}
}

func got(memberID string) apitypes.RecordEkubPaymentInput {
	return apitypes.RecordEkubPaymentInput{MemberID: memberID, Direction: "RECEIVED"}
}

func uuid(t *testing.T, s string) pgtype.UUID {
	t.Helper()
	id, err := idutil.Parse(s)
	require.NoError(t, err)
	return id
}

// The user's example: A, B, C at 40k; D and E sharing the fourth turn.
func createExample(t *testing.T, e env) apitypes.EkubDetail {
	t.Helper()
	in := apitypes.CreateEkubInput{
		Name: "Office ekub", SlotAmount: fmt.Sprint(full), Cadence: "WEEKLY",
		Slots: [][]apitypes.EkubShareInput{
			{share(e.people["A"], full)}, {share(e.people["B"], full)}, {share(e.people["C"], full)},
			{share(e.people["D"], half), share(e.people["E"], half)},
		},
	}
	require.NoError(t, in.Validate())
	d, err := e.svc.Create(e.ctx, e.people["A"], in)
	require.NoError(t, err)
	return d
}

func TestEkub_ExampleCycle(t *testing.T) {
	e := setup(t, "A", "B", "C", "D", "E")
	d := createExample(t, e)
	ekubID := uuid(t, d.ID)
	assert.Equal(t, "DRAFT", d.Status)
	require.Len(t, d.Rounds, 4)

	// Can't start while invitations are open.
	start := apitypes.StartEkubInput{StartDate: "2026-03-02"}
	require.NoError(t, start.Validate())
	_, err := e.svc.Start(e.ctx, e.people["A"], ekubID, start)
	requireCode(t, err, "INVITES_PENDING")

	for _, name := range []string{"B", "C", "D", "E"} {
		_, err := e.svc.Accept(e.ctx, e.people[name], ekubID)
		require.NoError(t, err)
	}
	// Only the admin starts it.
	_, err = e.svc.Start(e.ctx, e.people["B"], ekubID, start)
	requireCode(t, err, "NOT_EKUB_ADMIN")
	d, err = e.svc.Start(e.ctx, e.people["A"], ekubID, start)
	require.NoError(t, err)
	assert.Equal(t, "ACTIVE", d.Status)
	assert.Equal(t, 1, d.CurrentRound)

	// Pots from the others: 120k for each full turn; D and E's turn 120k
	// in all, 60k each (plus their own 20k back = 80k each).
	for i, want := range []string{"12000000", "12000000", "12000000", "12000000"} {
		assert.Equal(t, want, d.Rounds[i].Pot, "round %d", i+1)
	}
	assert.Equal(t, []string{"2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23"},
		[]string{*d.Rounds[0].DueDate, *d.Rounds[1].DueDate, *d.Rounds[2].DueDate, *d.Rounds[3].DueDate})
	// 6 full<->full + 12 full<->half payments; D and E never pay each other.
	assert.Len(t, d.Obligations, 18)
	a, b, c, dd, ee := memberID(t, d, e, "A"), memberID(t, d, e, "B"), memberID(t, d, e, "C"), memberID(t, d, e, "D"), memberID(t, d, e, "E")
	assert.Nil(t, obligation(d, dd, ee))
	assert.Equal(t, "2000000", obligation(d, dd, a).Amount) // D puts 20k into A's pot
	assert.Equal(t, "2000000", obligation(d, a, dd).Amount) // and A 20k into D's
	assert.Equal(t, "4000000", obligation(d, b, a).Amount)

	// B says they paid A: waits for A.
	d, err = e.svc.RecordPayment(e.ctx, e.people["B"], ekubID, paid(a))
	require.NoError(t, err)
	o := obligation(d, b, a)
	assert.Equal(t, "PENDING", o.Status)
	// Only A can answer it.
	_, err = e.svc.ResolvePayment(e.ctx, e.people["C"], ekubID, uuid(t, *o.PaymentID), true)
	requireCode(t, err, "NOT_RECIPIENT")
	d, err = e.svc.ResolvePayment(e.ctx, e.people["A"], ekubID, uuid(t, *o.PaymentID), true)
	require.NoError(t, err)
	assert.Equal(t, "CONFIRMED", obligation(d, b, a).Status)
	// Recording it twice is refused.
	_, err = e.svc.RecordPayment(e.ctx, e.people["B"], ekubID, paid(a))
	requireCode(t, err, "ALREADY_RECORDED")

	// A records that C paid: counts at once.
	d, err = e.svc.RecordPayment(e.ctx, e.people["A"], ekubID, got(c))
	require.NoError(t, err)
	assert.Equal(t, "CONFIRMED", obligation(d, c, a).Status)
	assert.Equal(t, "8000000", d.Rounds[0].Confirmed)

	// D says paid, A says no: back to due, D can record it again.
	d, err = e.svc.RecordPayment(e.ctx, e.people["D"], ekubID, paid(a))
	require.NoError(t, err)
	d, err = e.svc.ResolvePayment(e.ctx, e.people["A"], ekubID, uuid(t, *obligation(d, dd, a).PaymentID), false)
	require.NoError(t, err)
	assert.Equal(t, "DUE", obligation(d, dd, a).Status)
	_, err = e.svc.RecordPayment(e.ctx, e.people["D"], ekubID, paid(a))
	require.NoError(t, err)

	// D and E have nothing between them.
	_, err = e.svc.RecordPayment(e.ctx, e.people["D"], ekubID, paid(ee))
	requireCode(t, err, "NO_PAYMENT_DUE")

	// D can't leave before their turn...
	d, err = e.svc.Detail(e.ctx, e.people["D"], ekubID)
	require.NoError(t, err)
	assert.False(t, d.CanLeave)
	requireCode(t, e.svc.Leave(e.ctx, e.people["D"], ekubID), "CANNOT_LEAVE")
	// ...and the admin can't leave at all.
	requireCode(t, e.svc.Leave(e.ctx, e.people["A"], ekubID), "CANNOT_LEAVE")

	// Everything into and out of D's pot settled: A, B, C each record
	// D's 20k to them, and D records the 20k each of them paid in.
	for _, name := range []string{"A", "B", "C"} {
		if name != "A" && name != "Z" { // Z is a stranger // D's payment to A is already waiting; A confirms it below
			_, err = e.svc.RecordPayment(e.ctx, e.people[name], ekubID, got(dd))
			require.NoError(t, err)
		}
		other := map[string]string{"A": a, "B": b, "C": c}[name]
		_, err = e.svc.RecordPayment(e.ctx, e.people["D"], ekubID, got(other))
		require.NoError(t, err)
	}
	d, err = e.svc.Detail(e.ctx, e.people["A"], ekubID)
	require.NoError(t, err)
	_, err = e.svc.ResolvePayment(e.ctx, e.people["A"], ekubID, uuid(t, *obligation(d, dd, a).PaymentID), true)
	require.NoError(t, err)

	d, err = e.svc.Detail(e.ctx, e.people["D"], ekubID)
	require.NoError(t, err)
	assert.True(t, d.CanLeave, "blocked: %v", d.LeaveBlockedWhy)
	require.NoError(t, e.svc.Leave(e.ctx, e.people["D"], ekubID))

	// D's turn stays in the record; D no longer sees the ekub.
	d, err = e.svc.Detail(e.ctx, e.people["A"], ekubID)
	require.NoError(t, err)
	assert.Len(t, d.Rounds[3].MemberIDs, 2)
	_, err = e.svc.Detail(e.ctx, e.people["D"], ekubID)
	requireCode(t, err, "EKUB_NOT_FOUND")
}

func TestEkub_JoinerMidCycle(t *testing.T) {
	e := setup(t, "A", "B", "C", "F")
	in := apitypes.CreateEkubInput{
		Name: "Monthly", SlotAmount: fmt.Sprint(full), Cadence: "WEEKLY",
		Slots: [][]apitypes.EkubShareInput{
			{share(e.people["A"], full)}, {share(e.people["B"], full)}, {share(e.people["C"], full)},
		},
	}
	require.NoError(t, in.Validate())
	d, err := e.svc.Create(e.ctx, e.people["A"], in)
	require.NoError(t, err)
	ekubID := uuid(t, d.ID)
	for _, name := range []string{"B", "C"} {
		_, err = e.svc.Accept(e.ctx, e.people[name], ekubID)
		require.NoError(t, err)
	}
	start := apitypes.StartEkubInput{StartDate: "2026-03-02"}
	require.NoError(t, start.Validate())
	_, err = e.svc.Start(e.ctx, e.people["A"], ekubID, start)
	require.NoError(t, err)

	// A week on: round 1 (A's) is over, round 2 collecting.
	*e.clock = e.clock.AddDate(0, 0, 7)
	pos := 2
	d, err = e.svc.AddMember(e.ctx, e.people["A"], ekubID, apitypes.AddEkubMemberInput{UserID: idutil.String(e.people["F"]), Position: &pos})
	require.NoError(t, err)
	assert.Len(t, d.Rounds, 3, "an invitation doesn't change the order yet")
	d, err = e.svc.Accept(e.ctx, e.people["F"], ekubID)
	require.NoError(t, err)

	// F takes round 2, B and C move to 3 and 4.
	require.Len(t, d.Rounds, 4)
	a, b, c, f := memberID(t, d, e, "A"), memberID(t, d, e, "B"), memberID(t, d, e, "C"), memberID(t, d, e, "F")
	assert.Equal(t, []string{f}, d.Rounds[1].MemberIDs)
	assert.Equal(t, []string{b}, d.Rounds[2].MemberIDs)
	assert.Equal(t, []string{c}, d.Rounds[3].MemberIDs)
	// A took their pot before F joined: neither pays the other.
	assert.Nil(t, obligation(d, a, f))
	assert.Nil(t, obligation(d, f, a))
	assert.Equal(t, "8000000", d.Rounds[1].Pot) // F: 40k from B + 40k from C
	assert.Equal(t, "8000000", d.Rounds[0].Pot) // A: B + C
	assert.Equal(t, "12000000", d.Rounds[2].Pot)

	// Round 1 is over and can't move; later turns can swap.
	swap := apitypes.UpdateEkubSlotsInput{Slots: [][]apitypes.EkubShareInput{
		{{ID: f, Amount: fmt.Sprint(full)}}, {{ID: a, Amount: fmt.Sprint(full)}},
		{{ID: b, Amount: fmt.Sprint(full)}}, {{ID: c, Amount: fmt.Sprint(full)}},
	}}
	require.NoError(t, swap.Validate())
	_, err = e.svc.UpdateSlots(e.ctx, e.people["A"], ekubID, swap)
	requireCode(t, err, "ROUND_OVER")
	swap = apitypes.UpdateEkubSlotsInput{Slots: [][]apitypes.EkubShareInput{
		{{ID: a, Amount: fmt.Sprint(full)}}, {{ID: f, Amount: fmt.Sprint(full)}},
		{{ID: c, Amount: fmt.Sprint(full)}}, {{ID: b, Amount: fmt.Sprint(full)}},
	}}
	require.NoError(t, swap.Validate())
	d, err = e.svc.UpdateSlots(e.ctx, e.people["A"], ekubID, swap)
	require.NoError(t, err)
	assert.Equal(t, []string{c}, d.Rounds[2].MemberIDs)
	assert.Equal(t, []string{b}, d.Rounds[3].MemberIDs)
}

func TestEkub_DraftRules(t *testing.T) {
	e := setup(t, "A", "B", "C", "D", "E", "Z")

	// Turns must add up to the slot amount.
	bad := apitypes.CreateEkubInput{
		Name: "Bad", SlotAmount: fmt.Sprint(full), Cadence: "MONTHLY",
		Slots: [][]apitypes.EkubShareInput{{share(e.people["A"], full)}, {share(e.people["B"], half)}},
	}
	require.NoError(t, bad.Validate())
	_, err := e.svc.Create(e.ctx, e.people["A"], bad)
	requireCode(t, err, "SLOT_AMOUNT_MISMATCH")

	// The creator must take part.
	notIn := apitypes.CreateEkubInput{
		Name: "Not in", SlotAmount: fmt.Sprint(full), Cadence: "MONTHLY",
		Slots: [][]apitypes.EkubShareInput{{share(e.people["B"], full)}, {share(e.people["C"], full)}},
	}
	require.NoError(t, notIn.Validate())
	_, err = e.svc.Create(e.ctx, e.people["A"], notIn)
	requireCode(t, err, "CREATOR_NOT_IN_SLOT")

	// Only friends.
	stranger := e.people["Z"]
	d := createExample(t, e)
	ekubID := uuid(t, d.ID)
	_, err = e.svc.AddMember(e.ctx, e.people["A"], ekubID, apitypes.AddEkubMemberInput{UserID: idutil.String(stranger)})
	requireCode(t, err, "NOT_FRIENDS")
	// Only the admin adds people.
	_, err = e.svc.AddMember(e.ctx, e.people["B"], ekubID, apitypes.AddEkubMemberInput{UserID: idutil.String(e.people["C"])})
	requireCode(t, err, "NOT_EKUB_ADMIN")
	_, err = e.svc.Accept(e.ctx, e.people["B"], ekubID)
	require.NoError(t, err)

	// Taking B (turn 2) out closes the gap: C moves to 2, D and E to 3.
	d, err = e.svc.RemoveMember(e.ctx, e.people["A"], ekubID, uuid(t, memberID(t, d, e, "B")))
	require.NoError(t, err)
	require.Len(t, d.Rounds, 3)
	assert.Equal(t, []string{memberID(t, d, e, "C")}, d.Rounds[1].MemberIDs)
	assert.Len(t, d.Rounds[2].MemberIDs, 2)

	// A draft can be deleted; a started one can't.
	require.NoError(t, e.svc.Delete(e.ctx, e.people["A"], ekubID))
	_, err = e.svc.Detail(e.ctx, e.people["A"], ekubID)
	requireCode(t, err, "EKUB_NOT_FOUND")
}

// The user's case: a monthly ekub already three rounds in when it's
// entered. A-E put in the full 40k, F and G 20k each sharing a turn; J
// joined in round 3 and took round 3. From round 4 the app tracks it.
func TestEkub_EnterRunningEkub(t *testing.T) {
	e := setup(t, "A", "B", "C", "D", "E", "F", "G", "J")
	three := 3
	withJoin := func(s apitypes.EkubShareInput, round *int) apitypes.EkubShareInput {
		s.JoinedRound = round
		return s
	}
	in := apitypes.CreateEkubInput{
		Name: "Neighbours", SlotAmount: fmt.Sprint(full), Cadence: "MONTHLY",
		Slots: [][]apitypes.EkubShareInput{
			{share(e.people["A"], full)}, {share(e.people["B"], full)},
			{withJoin(share(e.people["J"], full), &three)},
			{share(e.people["C"], full)}, {share(e.people["D"], full)}, {share(e.people["E"], full)},
			{share(e.people["F"], half), share(e.people["G"], half)},
		},
	}
	require.NoError(t, in.Validate())

	// Nobody can take the pot before they joined.
	four := 4
	bad := apitypes.CreateEkubInput{Name: in.Name, SlotAmount: in.SlotAmount, Cadence: in.Cadence,
		Slots: [][]apitypes.EkubShareInput{{share(e.people["A"], full)}, {withJoin(share(e.people["J"], full), &four)}}}
	requireCode(t, bad.Validate(), "VALIDATION_ERROR")

	d, err := e.svc.Create(e.ctx, e.people["A"], in)
	require.NoError(t, err)
	ekubID := uuid(t, d.ID)
	for _, name := range []string{"B", "C", "D", "E", "F", "G", "J"} {
		_, err := e.svc.Accept(e.ctx, e.people[name], ekubID)
		require.NoError(t, err)
	}

	// Today is 2 Mar 2026. Rounds were due 5 Dec, 5 Jan, 5 Feb; round 4
	// is due 5 Mar. Everything before it was paid.
	start := apitypes.StartEkubInput{StartDate: "2025-12-05", PastPaid: true}
	require.NoError(t, start.Validate())
	d, err = e.svc.Start(e.ctx, e.people["A"], ekubID, start)
	require.NoError(t, err)
	assert.Equal(t, 4, d.CurrentRound)
	assert.Equal(t, "2026-03-05", *d.Rounds[3].DueDate)

	a, b, j := memberID(t, d, e, "A"), memberID(t, d, e, "B"), memberID(t, d, e, "J")
	// A and B took their pots before J joined: no payments either way.
	for _, other := range []string{a, b} {
		assert.Nil(t, obligation(d, j, other))
		assert.Nil(t, obligation(d, other, j))
	}
	// Round 1 (A): B, C, D, E at 40k + F, G at 20k = 200k, J not in it.
	assert.Equal(t, "20000000", d.Rounds[0].Pot)
	// Round 3 (J): C, D, E at 40k + F, G at 20k = 160k.
	assert.Equal(t, "16000000", d.Rounds[2].Pot)
	// Round 4 (C): A, B, D, E, J at 40k + F, G at 20k = 240k.
	assert.Equal(t, "24000000", d.Rounds[3].Pot)

	// Rounds 1-3 are recorded as paid; from round 4 on, nothing is.
	for _, o := range d.Obligations {
		if o.Round < 4 {
			assert.Equal(t, "CONFIRMED", o.Status, "round %d", o.Round)
		} else {
			assert.Equal(t, "DUE", o.Status, "round %d", o.Round)
		}
	}
	for i := 0; i < 3; i++ {
		assert.Equal(t, d.Rounds[i].Pot, d.Rounds[i].Confirmed)
	}

	// J took the pot but still owes rounds 4-7, so can't leave yet.
	d, err = e.svc.Detail(e.ctx, e.people["J"], ekubID)
	require.NoError(t, err)
	assert.False(t, d.CanLeave)
	assert.Contains(t, *d.LeaveBlockedWhy, "160,000.00 ETB")
}

// Entering a running ekub where someone missed a payment: C didn't pay B
// in round 2, so B and C skip each other -- B doesn't pay C on C's turn.
func TestEkub_EnterRunningEkubWithMissedPayment(t *testing.T) {
	e := setup(t, "A", "B", "C", "D", "E")
	in := apitypes.CreateEkubInput{
		Name: "Street", SlotAmount: fmt.Sprint(full), Cadence: "MONTHLY",
		Slots: [][]apitypes.EkubShareInput{
			{share(e.people["A"], full)}, {share(e.people["B"], full)}, {share(e.people["C"], full)},
			{share(e.people["D"], full)}, {share(e.people["E"], full)},
		},
	}
	require.NoError(t, in.Validate())
	d, err := e.svc.Create(e.ctx, e.people["A"], in)
	require.NoError(t, err)
	ekubID := uuid(t, d.ID)
	for _, name := range []string{"B", "C", "D", "E"} {
		_, err := e.svc.Accept(e.ctx, e.people[name], ekubID)
		require.NoError(t, err)
	}
	b, c, dd := memberID(t, d, e, "B"), memberID(t, d, e, "C"), memberID(t, d, e, "D")

	// Today is 2 Mar 2026; rounds were due 5 Jan and 5 Feb, round 3 is
	// due 5 Mar. A payment of round 3 or later can't be marked missed.
	future := apitypes.StartEkubInput{StartDate: "2026-01-05", PastPaid: true,
		Missed: []apitypes.EkubMissedPaymentRef{{PayerMemberID: b, RecipientMemberID: dd}}}
	require.NoError(t, future.Validate())
	_, err = e.svc.Start(e.ctx, e.people["A"], ekubID, future)
	requireCode(t, err, "NOT_A_PAST_PAYMENT")
	d, err = e.svc.Detail(e.ctx, e.people["A"], ekubID)
	require.NoError(t, err)
	assert.Equal(t, "DRAFT", d.Status)

	start := apitypes.StartEkubInput{StartDate: "2026-01-05", PastPaid: true,
		Missed: []apitypes.EkubMissedPaymentRef{{PayerMemberID: c, RecipientMemberID: b}}}
	require.NoError(t, start.Validate())
	d, err = e.svc.Start(e.ctx, e.people["A"], ekubID, start)
	require.NoError(t, err)
	assert.Equal(t, 3, d.CurrentRound)
	assert.Equal(t, []apitypes.EkubMissedPayment{{PayerMemberID: c, RecipientMemberID: b, Round: 2}}, d.Missed)

	// Neither pays the other, either way round.
	assert.Nil(t, obligation(d, c, b))
	assert.Nil(t, obligation(d, b, c))
	// Round 1 (A): B, C, D, E = 160k. Round 2 (B): A, D, E = 120k.
	// Round 3 (C): A, D, E = 120k. Round 4 (D): everyone else = 160k.
	assert.Equal(t, "16000000", d.Rounds[0].Pot)
	assert.Equal(t, "12000000", d.Rounds[1].Pot)
	assert.Equal(t, "12000000", d.Rounds[2].Pot)
	assert.Equal(t, "16000000", d.Rounds[3].Pot)
	// Rounds 1-2 recorded as paid (without the missed one); 3 on are due.
	for _, o := range d.Obligations {
		if o.Round < 3 {
			assert.Equal(t, "CONFIRMED", o.Status, "round %d", o.Round)
		} else {
			assert.Equal(t, "DUE", o.Status, "round %d", o.Round)
		}
	}
	assert.Equal(t, d.Rounds[1].Pot, d.Rounds[1].Confirmed)
}
