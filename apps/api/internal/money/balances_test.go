package money

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNetBalance(t *testing.T) {
	t.Run("returns zero for no entries", func(t *testing.T) {
		assert.Equal(t, MinorUnits(0), NetBalance(nil))
	})

	t.Run("is positive when A owes B (a single expense A did not pay for)", func(t *testing.T) {
		assert.Equal(t, MinorUnits(500), NetBalance([]LedgerEntry{{OwedByA: true, Amount: 500}}))
	})

	t.Run("is negative when B owes A", func(t *testing.T) {
		assert.Equal(t, MinorUnits(-200), NetBalance([]LedgerEntry{{OwedByA: false, Amount: 200}}))
	})

	t.Run("nets opposing debts from separate expenses (PRD §16 example: owe 500, owed 200 -> net owe 300)", func(t *testing.T) {
		entries := []LedgerEntry{{OwedByA: true, Amount: 500}, {OwedByA: false, Amount: 200}}
		assert.Equal(t, MinorUnits(300), NetBalance(entries))
	})

	t.Run("a settlement entry fully cancels a prior debt (PRD §19/§74)", func(t *testing.T) {
		entries := []LedgerEntry{{OwedByA: true, Amount: 100}, {OwedByA: false, Amount: 100}}
		assert.Equal(t, MinorUnits(0), NetBalance(entries))
	})

	t.Run("a partial settlement leaves the remainder outstanding (PRD §75)", func(t *testing.T) {
		entries := []LedgerEntry{{OwedByA: false, Amount: 500}, {OwedByA: true, Amount: 200}}
		assert.Equal(t, MinorUnits(-300), NetBalance(entries))
	})

	t.Run("handles many small entries without losing precision", func(t *testing.T) {
		entries := make([]LedgerEntry, 1000)
		var expected MinorUnits
		for i := 0; i < 1000; i++ {
			entries[i] = LedgerEntry{OwedByA: i%2 == 0, Amount: MinorUnits(i + 1)}
			if entries[i].OwedByA {
				expected += entries[i].Amount
			} else {
				expected -= entries[i].Amount
			}
		}
		assert.Equal(t, expected, NetBalance(entries))
	})
}
