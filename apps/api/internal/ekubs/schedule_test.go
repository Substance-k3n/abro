package ekubs

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// The user's example: A, B, C put in 40k each; D and E share one 40k
// slot at 20k each (amounts in ETB, not minor units, for readability).
func exampleParticipants() []Participant {
	return []Participant{
		{Amount: 40_000, Slot: 1, Joined: 1}, // A
		{Amount: 40_000, Slot: 2, Joined: 1}, // B
		{Amount: 40_000, Slot: 3, Joined: 1}, // C
		{Amount: 20_000, Slot: 4, Joined: 1}, // D
		{Amount: 20_000, Slot: 4, Joined: 1}, // E
	}
}

func received(obs []Obligation, recipient int) int64 {
	var total int64
	for _, o := range obs {
		if o.Recipient == recipient {
			total += o.Amount
		}
	}
	return total
}

func paid(obs []Obligation, payer int) int64 {
	var total int64
	for _, o := range obs {
		if o.Payer == payer {
			total += o.Amount
		}
	}
	return total
}

func TestObligations_SharedSlot(t *testing.T) {
	obs := Obligations(40_000, exampleParticipants())

	// A full member takes 120k from the others (plus their own 40k back
	// = the 160k pot): 40k from B, 40k from C, 20k from each of D and E.
	assert.Equal(t, int64(120_000), received(obs, 0))
	// D and E take 60k each from the others: 20k from each of A, B, C.
	// With their own 20k back that's 80k each, half the 160k pot.
	assert.Equal(t, int64(60_000), received(obs, 3))
	assert.Equal(t, int64(60_000), received(obs, 4))
	// D and E never pay each other.
	for _, o := range obs {
		assert.False(t, (o.Payer == 3 && o.Recipient == 4) || (o.Payer == 4 && o.Recipient == 3))
	}
	// Everyone puts in exactly what they take out over the cycle.
	for i := range exampleParticipants() {
		assert.Equal(t, received(obs, i), paid(obs, i), "member %d", i)
	}
	// D pays into rounds 1-3, 20k each: "20 20 20 for the next ones".
	var dRounds []int
	for _, o := range obs {
		if o.Payer == 3 {
			dRounds = append(dRounds, o.Round)
			assert.Equal(t, int64(20_000), o.Amount)
		}
	}
	assert.Equal(t, []int{1, 2, 3}, dRounds)
}

func TestObligations_MidCycleJoiner(t *testing.T) {
	// A took round 1. F joined from round 2 and takes round 2; B is 3, C 4.
	ps := []Participant{
		{Amount: 40_000, Slot: 1, Joined: 1}, // A
		{Amount: 40_000, Slot: 3, Joined: 1}, // B
		{Amount: 40_000, Slot: 4, Joined: 1}, // C
		{Amount: 40_000, Slot: 2, Joined: 2}, // F
	}
	obs := Obligations(40_000, ps)

	// A and F don't pay each other: F wasn't there for A's pot.
	assert.False(t, Exchange(ps[0], ps[3]))
	for _, o := range obs {
		assert.False(t, (o.Payer == 0 && o.Recipient == 3) || (o.Payer == 3 && o.Recipient == 0))
	}
	// F takes 80k (B and C), A takes 80k (B and C), B and C 120k each.
	assert.Equal(t, int64(80_000), received(obs, 3))
	assert.Equal(t, int64(80_000), received(obs, 0))
	assert.Equal(t, int64(120_000), received(obs, 1))
	for i := range ps {
		assert.Equal(t, received(obs, i), paid(obs, i), "member %d", i)
	}
}

func TestPairAmount_UnevenSplitAndRounding(t *testing.T) {
	// 30k + 10k of a 40k slot: a 40k member pays 30k and 10k.
	assert.Equal(t, int64(30_000), PairAmount(40_000, 30_000, 40_000))
	assert.Equal(t, int64(10_000), PairAmount(40_000, 10_000, 40_000))
	// Thirds of 100 minor units: 100*33/100 = 33.
	assert.Equal(t, int64(33), PairAmount(100, 33, 100))
	// Half up: 3*1/2 = 1.5 -> 2.
	assert.Equal(t, int64(2), PairAmount(3, 1, 2))
	// Symmetric, so a pair always evens out.
	assert.Equal(t, PairAmount(70, 30, 100), PairAmount(30, 70, 100))
	// No overflow on big amounts: 10M ETB in cents squared.
	assert.Equal(t, int64(1_000_000_000), PairAmount(1_000_000_000, 1_000_000_000, 1_000_000_000))
}

func TestDueDateAndCurrentRound(t *testing.T) {
	start := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	assert.Equal(t, start, DueDate(start, "WEEKLY", 1))
	assert.Equal(t, time.Date(2026, 2, 14, 0, 0, 0, 0, time.UTC), DueDate(start, "WEEKLY", 3))
	// Go's AddDate normalises Jan 31 + 1 month to Mar 3.
	assert.Equal(t, time.Date(2026, 3, 3, 0, 0, 0, 0, time.UTC), DueDate(start, "MONTHLY", 2))

	// Before or on the start date, round 1 is collecting.
	assert.Equal(t, 1, CurrentRound(start, start.AddDate(0, 0, -5), "WEEKLY"))
	assert.Equal(t, 1, CurrentRound(start, start, "WEEKLY"))
	// The day after round 1 was due, round 2 is collecting.
	assert.Equal(t, 2, CurrentRound(start, start.AddDate(0, 0, 1), "WEEKLY"))
	assert.Equal(t, 2, CurrentRound(start, start.AddDate(0, 0, 7), "WEEKLY"))
	assert.Equal(t, 3, CurrentRound(start, start.AddDate(0, 0, 8), "WEEKLY"))
}
