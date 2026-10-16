package money

import "time"

// LateFeeRule is a group's late-fee setting (ADR-026): RateBP of the
// overdue amount a day (100 = 1%), starting GraceDays after a debt was
// added, until a debt has grown by CapBP of itself. Debt added before
// Since never gets a fee.
type LateFeeRule struct {
	RateBP    int64
	GraceDays int
	CapBP     int64
	Since     time.Time
}

// LateFeeToday is today's fee on a member's unpaid debt, given its
// parts (UnpaidParts, oldest first, fees themselves left out so a fee
// never earns a fee). Each part past its grace period adds RateBP of
// itself for each day, until it reaches CapBP in all; a part paid down
// is charged on what's left of it. Simple interest, rounded down.
//
// "Day 1" is the first whole day after the grace period: a part added
// at 15:00 with 7 days' grace is first charged by the run 8 days later
// at 15:00 or after. Runs are daily, so day n is the nth charge.
func LateFeeToday(parts []Movement, rule LateFeeRule, now time.Time) MinorUnits {
	if rule.RateBP <= 0 {
		return 0
	}
	grace := time.Duration(rule.GraceDays) * 24 * time.Hour
	var fee MinorUnits
	for _, p := range parts {
		if p.At.Before(rule.Since) {
			continue
		}
		overdue := now.Sub(p.At.Add(grace))
		if overdue < 0 {
			continue
		}
		day := int64(overdue/(24*time.Hour)) + 1
		todayBP := min(rule.CapBP, day*rule.RateBP) - min(rule.CapBP, (day-1)*rule.RateBP)
		fee += p.Amount * todayBP / 10000
	}
	return fee
}
