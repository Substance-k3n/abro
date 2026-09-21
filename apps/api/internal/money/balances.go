package money

// LedgerEntry is one ledger contribution between exactly two users --
// derived from an Expense+ExpenseParticipant pair, never stored.
// ABRO_PRD.md §8.2/§16/§45: "derived balance = financial facts", no
// independently maintained balance.
type LedgerEntry struct {
	// OwedByA is true when this entry represents money owed BY userA TO userB.
	OwedByA bool
	Amount  MinorUnits
}

// NetBalance nets a list of pairwise ledger entries between two users (A,
// B) into a single signed balance. Works identically for every split
// type, including SETTLEMENT -- a settlement is just another entry that
// partially or fully cancels prior ones, per ABRO_PRD.md §19's "the
// balance becomes zero".
//
// Positive => A owes B. Negative => B owes A. Zero => settled up.
func NetBalance(entries []LedgerEntry) MinorUnits {
	var net MinorUnits
	for _, e := range entries {
		if e.OwedByA {
			net = Add(net, e.Amount)
		} else {
			net = Subtract(net, e.Amount)
		}
	}
	return net
}
