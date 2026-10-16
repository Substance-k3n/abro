package money

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestLateFeeToday(t *testing.T) {
	day := 24 * time.Hour
	since := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	added := time.Date(2026, 10, 2, 15, 0, 0, 0, time.UTC)
	rule := LateFeeRule{RateBP: 100, GraceDays: 7, CapBP: 2000, Since: since}
	parts := []Movement{{At: added, Amount: 200000}} // 2,000.00

	// Inside the grace period: nothing.
	assert.Equal(t, MinorUnits(0), LateFeeToday(parts, rule, added.Add(7*day-time.Minute)))
	// Day 1 after grace: 1% of 2,000.00 = 20.00.
	assert.Equal(t, MinorUnits(2000), LateFeeToday(parts, rule, added.Add(7*day)))
	// Day 20: still 1% (20 x 1% = the 20% cap exactly).
	assert.Equal(t, MinorUnits(2000), LateFeeToday(parts, rule, added.Add(26*day+time.Hour)))
	// Day 21: capped -- nothing more.
	assert.Equal(t, MinorUnits(0), LateFeeToday(parts, rule, added.Add(27*day+time.Hour)))

	// A cap that isn't a whole number of days: 3% a day, 10% cap ->
	// 3, 3, 3, then the last 1%, then nothing.
	odd := LateFeeRule{RateBP: 300, GraceDays: 0, CapBP: 1000, Since: since}
	got := []MinorUnits{}
	for d := 0; d < 5; d++ {
		got = append(got, LateFeeToday(parts, odd, added.Add(time.Duration(d)*day)))
	}
	assert.Equal(t, []MinorUnits{6000, 6000, 6000, 2000, 0}, got)

	// Debt from before fees were turned on is never charged.
	old := []Movement{{At: since.Add(-time.Hour), Amount: 200000}, {At: added, Amount: 100000}}
	assert.Equal(t, MinorUnits(1000), LateFeeToday(old, rule, added.Add(7*day)))

	// Rounded down per part: 1% of 0.99 is 0.
	assert.Equal(t, MinorUnits(0), LateFeeToday([]Movement{{At: added, Amount: 99}}, rule, added.Add(8*day)))

	// Off.
	assert.Equal(t, MinorUnits(0), LateFeeToday(parts, LateFeeRule{GraceDays: 7, CapBP: 2000, Since: since}, added.Add(9*day)))
}

func TestUnpaidParts(t *testing.T) {
	t0 := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	at := func(d int) time.Time { return t0.Add(time.Duration(d) * 24 * time.Hour) }

	// Owed 2,000 then 1,000; paid 2,500 -> 500 left of the second.
	parts := UnpaidParts([]Movement{{at(0), 2000}, {at(1), 1000}, {at(2), -2500}})
	assert.Equal(t, []Movement{{at(1), 500}}, parts)
	// Paid more than owed: nothing owed.
	assert.Empty(t, UnpaidParts([]Movement{{at(0), 2000}, {at(1), -3000}}))
	// In credit, then a new debt bigger than the credit starts a part.
	assert.Equal(t, []Movement{{at(1), 1000}}, UnpaidParts([]Movement{{at(0), -2000}, {at(1), 3000}}))
}
