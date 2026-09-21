package money

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// applyAndAssertSettled replays transactions against the original positions;
// every balance must land exactly on zero.
func applyAndAssertSettled(t *testing.T, positions []NetPosition, txns []SimplifiedTransaction) {
	t.Helper()
	remaining := make(map[string]MinorUnits, len(positions))
	for _, p := range positions {
		remaining[p.UserID] = p.NetBalance
	}
	for _, txn := range txns {
		remaining[txn.FromUserID] += txn.Amount
		remaining[txn.ToUserID] -= txn.Amount
	}
	for userID, balance := range remaining {
		assert.Equalf(t, MinorUnits(0), balance, "user %s did not settle to zero", userID)
	}
}

func TestSimplifyDebts(t *testing.T) {
	t.Run("returns no transactions when everyone is already settled", func(t *testing.T) {
		assert.Empty(t, SimplifyDebts([]NetPosition{}))
		assert.Empty(t, SimplifyDebts([]NetPosition{
			{UserID: "a", NetBalance: 0}, {UserID: "b", NetBalance: 0},
		}))
	})

	t.Run("settles a simple pair directly", func(t *testing.T) {
		positions := []NetPosition{
			{UserID: "a", NetBalance: -100},
			{UserID: "b", NetBalance: 100},
		}
		txns := SimplifyDebts(positions)
		assert.Equal(t, []SimplifiedTransaction{{FromUserID: "a", ToUserID: "b", Amount: 100}}, txns)
		applyAndAssertSettled(t, positions, txns)
	})

	t.Run("collapses PRD §18's chain example to one transaction", func(t *testing.T) {
		positions := []NetPosition{
			{UserID: "A", NetBalance: -100},
			{UserID: "B", NetBalance: 0},
			{UserID: "C", NetBalance: 0},
			{UserID: "D", NetBalance: 100},
		}
		txns := SimplifyDebts(positions)
		assert.Equal(t, []SimplifiedTransaction{{FromUserID: "A", ToUserID: "D", Amount: 100}}, txns)
		applyAndAssertSettled(t, positions, txns)
	})

	t.Run("uses at most n-1 transactions and preserves the total obligation for an uneven multi-party case", func(t *testing.T) {
		positions := []NetPosition{
			{UserID: "a", NetBalance: 500},
			{UserID: "b", NetBalance: 300},
			{UserID: "c", NetBalance: -400},
			{UserID: "d", NetBalance: -400},
		}
		txns := SimplifyDebts(positions)
		assert.LessOrEqual(t, len(txns), len(positions)-1)
		applyAndAssertSettled(t, positions, txns)
	})

	t.Run("breaks ties deterministically by userId when multiple creditors/debtors share the same magnitude", func(t *testing.T) {
		positions := []NetPosition{
			{UserID: "zed", NetBalance: 100},
			{UserID: "amy", NetBalance: 100},
			{UserID: "bob", NetBalance: -100},
			{UserID: "cam", NetBalance: -100},
		}
		txns := SimplifyDebts(positions)
		assert.Equal(t, SimplifiedTransaction{FromUserID: "bob", ToUserID: "amy", Amount: 100}, txns[0])
		applyAndAssertSettled(t, positions, txns)
	})

	t.Run("is deterministic: repeated calls on the same input produce identical output", func(t *testing.T) {
		positions := []NetPosition{
			{UserID: "a", NetBalance: 733},
			{UserID: "b", NetBalance: -211},
			{UserID: "c", NetBalance: -522},
		}
		first := SimplifyDebts(positions)
		second := SimplifyDebts(positions)
		assert.Equal(t, first, second)
	})

	t.Run("handles a large group without losing precision or producing more than n-1 transactions", func(t *testing.T) {
		positions := make([]NetPosition, 40)
		var runningTotal MinorUnits
		for i := 0; i < 40; i++ {
			bal := MinorUnits(i-20) * 137
			positions[i] = NetPosition{UserID: nthUserID(i), NetBalance: bal}
			runningTotal += bal
		}
		positions[len(positions)-1].NetBalance -= runningTotal

		txns := SimplifyDebts(positions)
		nonZero := 0
		for _, p := range positions {
			if p.NetBalance != 0 {
				nonZero++
			}
		}
		assert.LessOrEqual(t, len(txns), nonZero-1)
		applyAndAssertSettled(t, positions, txns)
	})
}

func nthUserID(i int) string {
	const digits = "0123456789"
	if i < 10 {
		return "u" + string(digits[i])
	}
	return "u" + string(digits[i/10]) + string(digits[i%10])
}
