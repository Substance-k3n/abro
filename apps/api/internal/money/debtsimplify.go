package money

import "sort"

// NetPosition is one member's net position, as produced by
// BalancesService.getGroupSummary. Positive = owed money (creditor).
// Negative = owes money (debtor).
type NetPosition struct {
	UserID     string
	NetBalance MinorUnits
}

type SimplifiedTransaction struct {
	FromUserID string
	ToUserID   string
	Amount     MinorUnits
}

// SimplifyDebts implements ABRO_PRD.md §18's "standard minimum-cash-flow
// debt simplification approach." Operates purely on net positions, not the
// underlying pairwise debt graph — that's what lets a tangled chain of IOUs
// (PRD's own example: A owes B 100, B owes C 100, C owes D 100 -- net
// positions A:-100, B:0, C:0, D:+100) collapse to the minimum transactions
// needed (here, one: A pays D 100), while preserving the total obligation.
//
// Greedy repeated-match: each step pairs the largest creditor with the
// largest debtor and settles the smaller of the two amounts. Deterministic
// tie-break (required by §18): ties sort by userId ascending.
//
// This is the standard practical heuristic (what real-world Splitwise-style
// apps use) and always produces at most n-1 transactions for n non-zero
// balances -- but it is a heuristic, not a proof of the fewest-possible
// transactions: the general minimum-transaction-count problem is NP-hard.
func SimplifyDebts(positions []NetPosition) []SimplifiedTransaction {
	balances := make([]NetPosition, 0, len(positions))
	for _, p := range positions {
		if !IsZero(p.NetBalance) {
			balances = append(balances, p)
		}
	}
	sort.Slice(balances, func(i, j int) bool { return balances[i].UserID < balances[j].UserID })

	transactions := make([]SimplifiedTransaction, 0)

	for {
		creditorIdx := largestBy(balances, IsPositive)
		debtorIdx := largestBy(balances, IsNegative)
		if creditorIdx < 0 || debtorIdx < 0 {
			break
		}

		amount := min(balances[creditorIdx].NetBalance, Abs(balances[debtorIdx].NetBalance))
		transactions = append(transactions, SimplifiedTransaction{
			FromUserID: balances[debtorIdx].UserID,
			ToUserID:   balances[creditorIdx].UserID,
			Amount:     amount,
		})

		balances[creditorIdx].NetBalance = Subtract(balances[creditorIdx].NetBalance, amount)
		balances[debtorIdx].NetBalance = Add(balances[debtorIdx].NetBalance, amount)
	}

	return transactions
}

func min(a, b MinorUnits) MinorUnits {
	if a < b {
		return a
	}
	return b
}

// largestBy returns the index of the entry with the largest |NetBalance|
// among those matching predicate, ties broken by userId ascending, or -1
// if none match.
func largestBy(balances []NetPosition, predicate func(MinorUnits) bool) int {
	winner := -1
	for i, entry := range balances {
		if !predicate(entry.NetBalance) {
			continue
		}
		if winner < 0 {
			winner = i
			continue
		}
		magnitude := Abs(entry.NetBalance)
		winnerMagnitude := Abs(balances[winner].NetBalance)
		if magnitude > winnerMagnitude || (magnitude == winnerMagnitude && entry.UserID < balances[winner].UserID) {
			winner = i
		}
	}
	return winner
}
