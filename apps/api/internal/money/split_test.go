package money

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAssertSharesMatchTotal(t *testing.T) {
	t.Run("does not error when shares sum exactly to the total", func(t *testing.T) {
		err := AssertSharesMatchTotal(100, []ExpenseParticipantInput{
			{UserID: "a", Amount: 34}, {UserID: "b", Amount: 33}, {UserID: "c", Amount: 33},
		})
		assert.NoError(t, err)
	})

	t.Run("errors when shares sum to less than the total", func(t *testing.T) {
		err := AssertSharesMatchTotal(100, []ExpenseParticipantInput{
			{UserID: "a", Amount: 40}, {UserID: "b", Amount: 40},
		})
		assert.ErrorContains(t, err, "must sum to the expense total")
	})

	t.Run("errors when shares sum to more than the total", func(t *testing.T) {
		err := AssertSharesMatchTotal(100, []ExpenseParticipantInput{
			{UserID: "a", Amount: 60}, {UserID: "b", Amount: 60},
		})
		assert.ErrorContains(t, err, "must sum to the expense total")
	})

	t.Run("accepts a single participant covering the full total", func(t *testing.T) {
		err := AssertSharesMatchTotal(500, []ExpenseParticipantInput{{UserID: "a", Amount: 500}})
		assert.NoError(t, err)
	})

	t.Run("treats a zero total with no participants as valid", func(t *testing.T) {
		err := AssertSharesMatchTotal(0, []ExpenseParticipantInput{})
		assert.NoError(t, err)
	})
}

func TestParseAmount(t *testing.T) {
	t.Run("accepts an integer minor-units string amount", func(t *testing.T) {
		got, err := ParseAmount("1050")
		assert.NoError(t, err)
		assert.Equal(t, MinorUnits(1050), got)
	})

	t.Run("rejects a negative integer string -- every ExpenseParticipant.amount is non-negative, including for settlements (ADR-003)", func(t *testing.T) {
		_, err := ParseAmount("-1050")
		assert.Error(t, err)
	})

	t.Run("accepts a zero amount (e.g. a settler's own zero-share row in a settlement)", func(t *testing.T) {
		got, err := ParseAmount("0")
		assert.NoError(t, err)
		assert.Equal(t, MinorUnits(0), got)
	})

	t.Run("rejects a decimal amount string", func(t *testing.T) {
		_, err := ParseAmount("10.50")
		assert.Error(t, err)
	})

	t.Run("rejects a non-numeric amount string", func(t *testing.T) {
		_, err := ParseAmount("abc")
		assert.Error(t, err)
	})
}

func TestSplitTypeValid(t *testing.T) {
	t.Run("accepts every documented split type", func(t *testing.T) {
		for _, st := range []SplitType{SplitEqual, SplitExact, SplitPercentage, SplitShares, SplitSettlement} {
			assert.True(t, st.Valid())
		}
	})

	t.Run("rejects an unknown split type", func(t *testing.T) {
		assert.False(t, SplitType("REFUND").Valid())
	})
}
