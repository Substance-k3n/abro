package money

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSplitEqually(t *testing.T) {
	t.Run("splits evenly when the total divides cleanly", func(t *testing.T) {
		got, err := SplitEqually(300, 3)
		require.NoError(t, err)
		assert.Equal(t, []MinorUnits{100, 100, 100}, got)
	})

	t.Run("distributes the remainder one unit at a time, starting from the first participant", func(t *testing.T) {
		got, err := SplitEqually(100, 3)
		require.NoError(t, err)
		assert.Equal(t, []MinorUnits{34, 33, 33}, got)
	})

	t.Run("always preserves the total, including with a large participant count", func(t *testing.T) {
		total := MinorUnits(10007)
		parts := 13
		shares, err := SplitEqually(total, parts)
		require.NoError(t, err)
		assert.Len(t, shares, parts)
		assert.Equal(t, total, Sum(shares))
	})

	t.Run("gives the sole participant the entire amount", func(t *testing.T) {
		got, err := SplitEqually(999, 1)
		require.NoError(t, err)
		assert.Equal(t, []MinorUnits{999}, got)
	})

	t.Run("handles a zero total", func(t *testing.T) {
		got, err := SplitEqually(0, 4)
		require.NoError(t, err)
		assert.Equal(t, []MinorUnits{0, 0, 0, 0}, got)
	})

	t.Run("rejects zero or negative participant counts", func(t *testing.T) {
		_, err := SplitEqually(100, 0)
		assert.Error(t, err)
		_, err = SplitEqually(100, -1)
		assert.Error(t, err)
	})
}

func TestSplitByWeights(t *testing.T) {
	t.Run("splits proportionally to shares (SHARES split type)", func(t *testing.T) {
		got, err := SplitByWeights(100, []MinorUnits{1, 1, 2})
		require.NoError(t, err)
		assert.Equal(t, []MinorUnits{25, 25, 50}, got)
	})

	t.Run("splits proportionally to basis points (PERCENTAGE split type)", func(t *testing.T) {
		got, err := SplitByWeights(10000, []MinorUnits{3000, 7000})
		require.NoError(t, err)
		assert.Equal(t, []MinorUnits{3000, 7000}, got)
	})

	t.Run("distributes rounding remainder deterministically while preserving the total", func(t *testing.T) {
		shares, err := SplitByWeights(100, []MinorUnits{1, 1, 1})
		require.NoError(t, err)
		assert.Equal(t, MinorUnits(100), Sum(shares))
		assert.Equal(t, []MinorUnits{34, 33, 33}, shares)
	})

	t.Run("preserves the total for uneven weights that do not divide cleanly", func(t *testing.T) {
		total := MinorUnits(10007)
		weights := []MinorUnits{3, 5, 2, 7}
		shares, err := SplitByWeights(total, weights)
		require.NoError(t, err)
		assert.Len(t, shares, len(weights))
		assert.Equal(t, total, Sum(shares))
	})

	t.Run("gives the sole participant the entire amount regardless of its weight", func(t *testing.T) {
		got, err := SplitByWeights(500, []MinorUnits{7})
		require.NoError(t, err)
		assert.Equal(t, []MinorUnits{500}, got)
	})

	t.Run("rejects an empty weights array", func(t *testing.T) {
		_, err := SplitByWeights(100, []MinorUnits{})
		assert.Error(t, err)
	})

	t.Run("rejects a non-positive total weight", func(t *testing.T) {
		_, err := SplitByWeights(100, []MinorUnits{0, 0})
		assert.Error(t, err)
	})
}
