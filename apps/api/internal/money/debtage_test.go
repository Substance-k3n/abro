package money

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestOwingSince(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2026, 9, d, 12, 0, 0, 0, time.UTC) }

	t.Run("nothing owed for no movements", func(t *testing.T) {
		_, ok := OwingSince(nil)
		assert.False(t, ok)
	})

	t.Run("one debt is owed since it was added", func(t *testing.T) {
		since, ok := OwingSince([]Movement{{At: day(3), Amount: 500}})
		assert.True(t, ok)
		assert.Equal(t, day(3), since)
	})

	t.Run("a partial payment pays off the oldest debt first", func(t *testing.T) {
		// 300 on the 1st, 200 on the 5th, 300 paid on the 10th: the 1st is
		// covered, 200 of the 5th is left.
		since, ok := OwingSince([]Movement{
			{At: day(1), Amount: 300}, {At: day(5), Amount: 200}, {At: day(10), Amount: -300},
		})
		assert.True(t, ok)
		assert.Equal(t, day(5), since)
	})

	t.Run("a payment that covers only part of the oldest debt keeps its date", func(t *testing.T) {
		since, ok := OwingSince([]Movement{
			{At: day(1), Amount: 300}, {At: day(5), Amount: 200}, {At: day(10), Amount: -100},
		})
		assert.True(t, ok)
		assert.Equal(t, day(1), since)
	})

	t.Run("settled up means nothing owed", func(t *testing.T) {
		_, ok := OwingSince([]Movement{{At: day(1), Amount: 300}, {At: day(2), Amount: -300}})
		assert.False(t, ok)
	})

	t.Run("a new debt after settling up starts a new date", func(t *testing.T) {
		since, ok := OwingSince([]Movement{
			{At: day(1), Amount: 300}, {At: day(2), Amount: -300}, {At: day(20), Amount: 50},
		})
		assert.True(t, ok)
		assert.Equal(t, day(20), since)
	})

	t.Run("owed the other way means nothing owed", func(t *testing.T) {
		_, ok := OwingSince([]Movement{{At: day(1), Amount: -300}})
		assert.False(t, ok)
	})

	t.Run("when the balance flips, the debt starts at the flip", func(t *testing.T) {
		// Owed 100 to them on the 1st, then they owed 400 (net 300 to me)
		// on the 4th, then I added 500 on the 8th: 300 of that pays them
		// back, 200 is new debt from the 8th.
		since, ok := OwingSince([]Movement{
			{At: day(1), Amount: 100}, {At: day(4), Amount: -400}, {At: day(8), Amount: 500},
		})
		assert.True(t, ok)
		assert.Equal(t, day(8), since)
	})

	t.Run("zero movements are ignored", func(t *testing.T) {
		since, ok := OwingSince([]Movement{{At: day(1), Amount: 0}, {At: day(2), Amount: 10}})
		assert.True(t, ok)
		assert.Equal(t, day(2), since)
	})
}
