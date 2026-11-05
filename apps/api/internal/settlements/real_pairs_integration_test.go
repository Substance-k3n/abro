package settlements_test

// ADR-029: in a group you can pay the simplified way or the real way.
// The user's case (2026-11-05): A owes B 1000 and C owes A 1000. The
// simplified plan says "C pays B 1000", so A's net is 0 -- but A must
// still be able to pay B directly (C may be unreachable), or have C pay
// A first.

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
)

type triangle struct {
	e       env
	ctx     context.Context
	a, b, c db.Profile
	group   pgtype.UUID
	name    map[string]string
}

// newTriangle: B pays 2000 for A and B (A owes B 1000); A pays 2000 for
// A and C (C owes A 1000). Nets: A 0, B +1000, C -1000.
func newTriangle(t *testing.T) *triangle {
	t.Helper()
	e := setup(t)
	ctx := context.Background()
	a, b, c := e.makeProfile(t, "A"), e.makeProfile(t, "B"), e.makeProfile(t, "C")
	e.makeFriends(t, a.ID, b.ID)
	e.makeFriends(t, a.ID, c.ID)
	g, err := e.groups.Create(ctx, a.ID, apitypes.CreateGroupInput{
		Name: "Triangle", MemberIDs: []string{idutil.String(b.ID), idutil.String(c.ID)},
	})
	require.NoError(t, err)
	for _, id := range []pgtype.UUID{b.ID, c.ID} {
		_, err = e.groups.AcceptInvite(ctx, id, g.ID)
		require.NoError(t, err)
	}
	_, err = e.expenses.Create(ctx, b.ID, expenseInput("EQUAL", "Rent", "200000", &g.ID, nil, equalParticipants(a.ID, b.ID)))
	require.NoError(t, err)
	_, err = e.expenses.Create(ctx, a.ID, expenseInput("EQUAL", "Fuel", "200000", &g.ID, nil, equalParticipants(a.ID, c.ID)))
	require.NoError(t, err)
	return &triangle{e: e, ctx: ctx, a: a, b: b, c: c, group: g.ID, name: map[string]string{
		idutil.String(a.ID): "A", idutil.String(b.ID): "B", idutil.String(c.ID): "C",
	}}
}

// nets is "A,B,C" nets in minor units.
func (tr *triangle) nets(t *testing.T) [3]money.MinorUnits {
	t.Helper()
	positions, err := tr.e.balances.GetGroupSummary(tr.ctx, tr.group)
	require.NoError(t, err)
	out := [3]money.MinorUnits{}
	for _, p := range positions {
		switch p.UserID {
		case idutil.String(tr.a.ID):
			out[0] = p.NetBalance
		case idutil.String(tr.b.ID):
			out[1] = p.NetBalance
		case idutil.String(tr.c.ID):
			out[2] = p.NetBalance
		}
	}
	return out
}

func (tr *triangle) describe(t *testing.T, list []money.SimplifiedTransaction) []string {
	out := []string{}
	for _, d := range list {
		out = append(out, tr.name[d.FromUserID]+"->"+tr.name[d.ToUserID]+" "+money.Format(d.Amount, "ETB"))
	}
	return out
}

// real is "who owes whom" (cycles cancelled); plan is the simplified one.
// Compared without order: equal amounts sort by user id, and test users'
// ids are random (money's unit tests pin the order).
func (tr *triangle) real(t *testing.T) []string {
	t.Helper()
	list, err := tr.e.balances.GetRawGroupDebts(tr.ctx, tr.group)
	require.NoError(t, err)
	return tr.describe(t, list)
}

func (tr *triangle) plan(t *testing.T) []string {
	t.Helper()
	list, err := tr.e.balances.GetSimplifiedGroupDebts(tr.ctx, tr.group)
	require.NoError(t, err)
	return tr.describe(t, list)
}

func (tr *triangle) pay(t *testing.T, from, to db.Profile, amount string) error {
	t.Helper()
	_, err := settle(tr.e, tr.ctx, from.ID, settleInput(to.ID, amount, &tr.group))
	return err
}

func code(t *testing.T, err error) string {
	t.Helper()
	var apiErr *httpx.APIError
	require.ErrorAs(t, err, &apiErr)
	return apiErr.Code
}

// Amounts on the wire are minor units: "100000" is 1,000.00 ETB.

func TestRealPairs_Start(t *testing.T) {
	tr := newTriangle(t)
	assert.Equal(t, [3]money.MinorUnits{0, 100000, -100000}, tr.nets(t))
	assert.ElementsMatch(t, []string{"C->B 1,000.00 ETB"}, tr.plan(t), "the shortcut")
	assert.ElementsMatch(t, []string{"A->B 1,000.00 ETB", "C->A 1,000.00 ETB"}, tr.real(t), "the real pairs")
}

func TestRealPairs_APaysBDirectly(t *testing.T) {
	tr := newTriangle(t)
	// Refused before ADR-029: A's net is 0.
	require.NoError(t, tr.pay(t, tr.a, tr.b, "100000"))
	assert.Equal(t, [3]money.MinorUnits{100000, 0, -100000}, tr.nets(t))
	assert.ElementsMatch(t, []string{"C->A 1,000.00 ETB"}, tr.real(t))
	assert.ElementsMatch(t, []string{"C->A 1,000.00 ETB"}, tr.plan(t), "both views agree: C now pays A")
	assert.Equal(t, "NO_OUTSTANDING_DEBT", code(t, tr.pay(t, tr.a, tr.b, "100")), "nothing left to pay B")

	require.NoError(t, tr.pay(t, tr.c, tr.a, "100000"))
	assert.Equal(t, [3]money.MinorUnits{0, 0, 0}, tr.nets(t))
	assert.Empty(t, tr.real(t))
	assert.Empty(t, tr.plan(t))
}

func TestRealPairs_TheShortcut(t *testing.T) {
	tr := newTriangle(t)
	require.NoError(t, tr.pay(t, tr.c, tr.b, "100000"), "the simplified way still works")
	assert.Equal(t, [3]money.MinorUnits{0, 0, 0}, tr.nets(t))
	// Pairwise that's A->B, B->C, C->A, all 1000: a circle, cancelled.
	assert.Empty(t, tr.real(t), "settled, with no loop left behind")
	assert.Empty(t, tr.plan(t))
	assert.Equal(t, "NO_OUTSTANDING_DEBT", code(t, tr.pay(t, tr.a, tr.b, "100")), "A's debt to B was paid by C")
}

func TestRealPairs_CPaysAFirst(t *testing.T) {
	tr := newTriangle(t)
	// A's net is 0, so the nets alone wouldn't let C pay A; C really
	// owes A, so it's allowed.
	require.NoError(t, tr.pay(t, tr.c, tr.a, "100000"))
	assert.Equal(t, [3]money.MinorUnits{-100000, 100000, 0}, tr.nets(t))
	assert.ElementsMatch(t, []string{"A->B 1,000.00 ETB"}, tr.real(t))
	assert.ElementsMatch(t, []string{"A->B 1,000.00 ETB"}, tr.plan(t))
	require.NoError(t, tr.pay(t, tr.a, tr.b, "100000"))
	assert.Equal(t, [3]money.MinorUnits{0, 0, 0}, tr.nets(t))
	assert.Empty(t, tr.real(t))
}

func TestRealPairs_PartialAndCaps(t *testing.T) {
	tr := newTriangle(t)
	require.NoError(t, tr.pay(t, tr.a, tr.b, "40000"))
	assert.Equal(t, [3]money.MinorUnits{40000, 60000, -100000}, tr.nets(t))
	assert.ElementsMatch(t, []string{"C->A 1,000.00 ETB", "A->B 600.00 ETB"}, tr.real(t))
	assert.ElementsMatch(t, []string{"C->B 600.00 ETB", "C->A 400.00 ETB"}, tr.plan(t))

	// A: the nets give nothing (A is owed), the real pair gives 600.
	_, err := tr.e.svc.Create(tr.ctx, tr.a.ID, settleInput(tr.b.ID, "60001", &tr.group))
	assert.Equal(t, "EXCEEDS_OUTSTANDING_DEBT", code(t, err))
	// C -> A: the real pair (1000) beats the nets (min(1000, 400)).
	_, err = tr.e.svc.Create(tr.ctx, tr.c.ID, settleInput(tr.a.ID, "100001", &tr.group))
	assert.Equal(t, "EXCEEDS_OUTSTANDING_DEBT", code(t, err))
	require.NoError(t, tr.pay(t, tr.c, tr.a, "100000"))
	require.NoError(t, tr.pay(t, tr.a, tr.b, "60000"))
	assert.Equal(t, [3]money.MinorUnits{0, 0, 0}, tr.nets(t))
	assert.Empty(t, tr.real(t))
}

func TestRealPairs_PendingClaimsCount(t *testing.T) {
	tr := newTriangle(t)
	req, err := tr.e.svc.Create(tr.ctx, tr.a.ID, settleInput(tr.b.ID, "70000", &tr.group))
	require.NoError(t, err)
	_, err = tr.e.svc.Create(tr.ctx, tr.a.ID, settleInput(tr.b.ID, "30001", &tr.group))
	assert.Equal(t, "EXCEEDS_OUTSTANDING_DEBT", code(t, err), "700 of 1000 already waiting")
	_, err = tr.e.svc.Create(tr.ctx, tr.a.ID, settleInput(tr.b.ID, "30000", &tr.group))
	require.NoError(t, err)
	_, err = tr.e.svc.Confirm(tr.ctx, tr.b.ID, req.ID)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"C->A 1,000.00 ETB", "A->B 300.00 ETB"}, tr.real(t))
}

func TestRealPairs_TheyPaidMe(t *testing.T) {
	tr := newTriangle(t)
	// A records "C paid me" -- A isn't owed by the nets, but C really
	// owes A.
	_, err := tr.e.svc.RecordReceived(tr.ctx, tr.a.ID, apitypes.RecordReceivedInput{
		FromUserID: idutil.String(tr.c.ID), Amount: "100000", GroupID: strPtr(idutil.String(tr.group)), ParsedAmount: 100000,
	})
	require.NoError(t, err)
	_, err = tr.e.svc.RecordReceived(tr.ctx, tr.b.ID, apitypes.RecordReceivedInput{
		FromUserID: idutil.String(tr.a.ID), Amount: "100000", GroupID: strPtr(idutil.String(tr.group)), ParsedAmount: 100000,
	})
	require.NoError(t, err)
	assert.Equal(t, [3]money.MinorUnits{0, 0, 0}, tr.nets(t))
	_, err = tr.e.svc.RecordReceived(tr.ctx, tr.b.ID, apitypes.RecordReceivedInput{
		FromUserID: idutil.String(tr.a.ID), Amount: "100", GroupID: strPtr(idutil.String(tr.group)), ParsedAmount: 100,
	})
	assert.Equal(t, "NO_OUTSTANDING_DEBT", code(t, err))
}

// A claims to have paid B; before B confirms, C pays B the shortcut and
// B records it. A's debt to B is gone, so the confirm must be refused
// rather than paying B twice.
func TestRealPairs_ConfirmRechecks(t *testing.T) {
	tr := newTriangle(t)
	req, err := tr.e.svc.Create(tr.ctx, tr.a.ID, settleInput(tr.b.ID, "100000", &tr.group))
	require.NoError(t, err)
	_, err = tr.e.svc.RecordReceived(tr.ctx, tr.b.ID, apitypes.RecordReceivedInput{
		FromUserID: idutil.String(tr.c.ID), Amount: "100000", GroupID: strPtr(idutil.String(tr.group)), ParsedAmount: 100000,
	})
	require.NoError(t, err)
	_, err = tr.e.svc.Confirm(tr.ctx, tr.b.ID, req.ID)
	assert.Equal(t, "EXCEEDS_OUTSTANDING_DEBT", code(t, err))
	assert.Equal(t, [3]money.MinorUnits{0, 0, 0}, tr.nets(t), "nobody paid twice")
}
