package money

import "time"

// Movement is one change to a balance, in the order it happened: a
// positive Amount adds to it, a negative one pays it down. Derived from
// expenses like every balance (ADR-023), never stored.
type Movement struct {
	At     time.Time
	Amount MinorUnits
}

// OwingSince is when the oldest still-unpaid part of a positive balance
// was added (ADR-023). Payments pay off the oldest debt first, so someone
// who borrowed in May and June and paid one month back has owed since
// June; anyone who keeps paying part of it never looks overdue for an
// old debt they've covered. ok is false when the balance isn't positive.
//
// movements must be in the order they happened.
func OwingSince(movements []Movement) (since time.Time, ok bool) {
	parts := UnpaidParts(movements)
	if len(parts) == 0 {
		return time.Time{}, false
	}
	return parts[0].At, true
}

// UnpaidParts is what's left of a positive balance, oldest first: each
// part is when it was added and how much of it is still unpaid, with
// payments paying off the oldest first (ADR-023). Empty when the
// balance isn't positive. Late fees are charged on these (ADR-026).
//
// movements must be in the order they happened.
func UnpaidParts(movements []Movement) []Movement {
	// They all share the balance's sign; a payment bigger than the whole
	// balance flips it, and the leftover starts a new part.
	var parts []Movement
	var balance MinorUnits

	for _, m := range movements {
		if m.Amount == 0 {
			continue
		}
		if balance == 0 || (balance > 0) == (m.Amount > 0) {
			parts = append(parts, Movement{At: m.At, Amount: Abs(m.Amount)})
			balance += m.Amount
			continue
		}
		left := Abs(m.Amount)
		for len(parts) > 0 && left > 0 {
			paid := min(left, parts[0].Amount)
			parts[0].Amount -= paid
			left -= paid
			if parts[0].Amount == 0 {
				parts = parts[1:]
			}
		}
		balance += m.Amount
		if left > 0 {
			parts = []Movement{{At: m.At, Amount: left}}
		}
	}

	if balance <= 0 {
		return nil
	}
	return parts
}
