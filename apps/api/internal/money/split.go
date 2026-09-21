package money

import (
	"fmt"
	"regexp"
	"strconv"
)

// amountStringPattern mirrors packages/types' expenseParticipantSchema regex
// (^\d+$) — amounts still cross the wire as a non-negative integer *string*,
// not a JSON number, even though Go's int64 has no bigint-style precision
// issue: this keeps the wire contract compatible with apps/web, whose
// packages/types still represents MinorUnits as a JS bigint (not JSON-safe)
// for its own defense-in-depth reasons (see docs/DECISIONS.md ADR-007).
var amountStringPattern = regexp.MustCompile(`^\d+$`)

// ParseAmount parses a wire-format minor-units string (see
// amountStringPattern) into MinorUnits, rejecting anything that isn't a
// plain non-negative integer (no sign, no decimal point, no whitespace).
func ParseAmount(raw string) (MinorUnits, error) {
	if !amountStringPattern.MatchString(raw) {
		return 0, fmt.Errorf("amount must be a non-negative integer string of minor units")
	}
	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("amount out of range: %w", err)
	}
	return parsed, nil
}

// SplitType — split methods, per ABRO_PRD.md §9/§14. SETTLEMENT is a ledger
// event (a payment between two people), not an expense split — it shares
// the same discriminant because the ledger stores both as Expense rows
// (docs/DECISIONS.md ADR-003).
type SplitType string

const (
	SplitEqual      SplitType = "EQUAL"
	SplitExact      SplitType = "EXACT"
	SplitPercentage SplitType = "PERCENTAGE"
	SplitShares     SplitType = "SHARES"
	SplitSettlement SplitType = "SETTLEMENT"
)

func (s SplitType) Valid() bool {
	switch s {
	case SplitEqual, SplitExact, SplitPercentage, SplitShares, SplitSettlement:
		return true
	default:
		return false
	}
}

// ExpenseParticipantInput mirrors packages/types' expenseParticipantSchema.
// Amount is always non-negative — every ExpenseParticipant.amount in this
// system is non-negative, including for SETTLEMENT (ADR-003's
// implementation note); SettlementsService builds its own rows directly
// rather than through user input, so there's no legitimate case for a
// negative amount here.
type ExpenseParticipantInput struct {
	UserID string
	Amount MinorUnits
}

// AssertSharesMatchTotal enforces the server-side invariant from
// ABRO_PRD.md §13/§45: sum(participant shares) must equal the expense
// total, exactly. Must run on the server regardless of what the client
// already verified.
func AssertSharesMatchTotal(total MinorUnits, participants []ExpenseParticipantInput) error {
	var sum MinorUnits
	for _, p := range participants {
		sum += p.Amount
	}
	if sum != total {
		return fmt.Errorf(
			"participant shares (%d) must sum to the expense total (%d), per ABRO_PRD.md §45",
			sum, total,
		)
	}
	return nil
}
