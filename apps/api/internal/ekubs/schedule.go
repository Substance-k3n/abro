package ekubs

import (
	"math/big"
	"time"
)

// Participant is one member as the schedule sees them: what they put in
// each round, the round their slot takes the pot, and the first round
// they put in.
type Participant struct {
	Amount int64
	Slot   int
	Joined int
}

// Obligation is one payment the schedule expects: Payer puts Amount into
// Recipient's pot in Round (the recipient's slot). Payer and Recipient
// index the participants slice given to Obligations.
type Obligation struct {
	Payer, Recipient int
	Amount           int64
	Round            int
}

// Exchange reports whether two members pay into each other's pots: they
// are in different slots and both were in by the earlier of their two
// turns. Someone who joined after a member already took the pot neither
// pays that member nor is paid by them (ADR-024). Always symmetric.
func Exchange(a, b Participant) bool {
	if a.Slot == b.Slot {
		// Sharing a slot, they'd only pass each other's money back.
		return false
	}
	return max(a.Joined, b.Joined) <= min(a.Slot, b.Slot)
}

// PairAmount is what a member putting in `payer` each round puts into
// the pot of a member whose part of their slot is `recipient`: the
// payer's amount, split across the slot in proportion to each part. The
// formula is symmetric, so between two members it evens out exactly.
// 40k into one of two 20k halves of a 40k slot: 40k*20k/40k = 20k.
// Rounded half up; big.Int because the product can pass int64.
func PairAmount(payer, recipient, slotAmount int64) int64 {
	n := new(big.Int).Mul(big.NewInt(payer), big.NewInt(recipient))
	n.Add(n, big.NewInt(slotAmount/2))
	return n.Quo(n, big.NewInt(slotAmount)).Int64()
}

// Obligations lists every payment the schedule expects across the whole
// cycle, by round, then payer, then recipient.
func Obligations(slotAmount int64, ps []Participant) []Obligation {
	var out []Obligation
	for r := range ps {
		for p := range ps {
			if p == r || !Exchange(ps[p], ps[r]) {
				continue
			}
			amount := PairAmount(ps[p].Amount, ps[r].Amount, slotAmount)
			if amount <= 0 {
				continue
			}
			out = append(out, Obligation{Payer: p, Recipient: r, Amount: amount, Round: ps[r].Slot})
		}
	}
	sortObligations(out)
	return out
}

func sortObligations(obs []Obligation) {
	less := func(a, b Obligation) bool {
		if a.Round != b.Round {
			return a.Round < b.Round
		}
		if a.Payer != b.Payer {
			return a.Payer < b.Payer
		}
		return a.Recipient < b.Recipient
	}
	// Insertion sort: a cycle is at most a few hundred pairs.
	for i := 1; i < len(obs); i++ {
		for j := i; j > 0 && less(obs[j], obs[j-1]); j-- {
			obs[j], obs[j-1] = obs[j-1], obs[j]
		}
	}
}

// DueDate is the day round's pot is due: the start date for round 1,
// then one week or one calendar month per round.
func DueDate(start time.Time, cadence string, round int) time.Time {
	if cadence == "MONTHLY" {
		return start.AddDate(0, round-1, 0)
	}
	return start.AddDate(0, 0, 7*(round-1))
}

// CurrentRound is the first round whose due date is today or later --
// the one now collecting. Rounds before it are over, and their order
// can't change. today and start are calendar dates (midnight UTC).
func CurrentRound(start, today time.Time, cadence string) int {
	round := 1
	for DueDate(start, cadence, round).Before(today) {
		round++
	}
	return round
}
