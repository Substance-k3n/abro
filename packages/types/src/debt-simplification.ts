import { type MinorUnits, abs, add, isNegative, isPositive, isZero, subtract } from './money';

/** One member's net position, as produced by BalancesService.getGroupSummary. */
export interface NetPosition {
  userId: string;
  /** Positive = owed money (creditor). Negative = owes money (debtor). */
  netBalance: MinorUnits;
}

export interface SimplifiedTransaction {
  fromUserId: string;
  toUserId: string;
  amount: MinorUnits;
}

/**
 * ABRO_PRD.md §18: "the standard minimum-cash-flow debt simplification
 * approach." Operates purely on net positions, not the underlying pairwise
 * debt graph -- that's what lets a tangled chain of IOUs (PRD's own
 * example: A owes B 100, B owes C 100, C owes D 100 -- net positions
 * A:-100, B:0, C:0, D:+100) collapse to the minimum transactions needed
 * (here, one: A pays D 100), while preserving the total obligation.
 *
 * Greedy repeated-match: each step pairs the largest creditor with the
 * largest debtor and settles the smaller of the two amounts. Deterministic
 * tie-break (required by §18): ties sort by userId ascending.
 *
 * This is the standard practical heuristic (what real-world Splitwise-style
 * apps use) and always produces at most n-1 transactions for n non-zero
 * balances -- but it is a heuristic, not a proof of the fewest-possible
 * transactions: the general minimum-transaction-count problem is NP-hard.
 * Labeled here so it's never mistaken for a stronger guarantee than it is.
 */
export const simplifyDebts = (positions: readonly NetPosition[]): SimplifiedTransaction[] => {
  const balances = positions
    .filter((p) => !isZero(p.netBalance))
    .map((p) => ({ ...p }))
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

  const transactions: SimplifiedTransaction[] = [];

  for (;;) {
    const creditor = largestBy(balances, isPositive);
    const debtor = largestBy(balances, isNegative);
    if (!creditor || !debtor) {
      break;
    }

    const amount = min(creditor.netBalance, abs(debtor.netBalance));
    transactions.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount });

    creditor.netBalance = subtract(creditor.netBalance, amount);
    debtor.netBalance = add(debtor.netBalance, amount);
  }

  return transactions;
};

const min = (a: MinorUnits, b: MinorUnits): MinorUnits => (a < b ? a : b);

interface Balance {
  userId: string;
  netBalance: MinorUnits;
}

/** The entry with the largest |netBalance| among those matching `predicate`, ties broken by userId ascending. */
const largestBy = (
  balances: Balance[],
  predicate: (amount: MinorUnits) => boolean,
): Balance | undefined =>
  balances
    .filter((entry) => predicate(entry.netBalance))
    .reduce<Balance | undefined>((winner, entry) => {
      if (!winner) {
        return entry;
      }
      const magnitude = abs(entry.netBalance);
      const winnerMagnitude = abs(winner.netBalance);
      return magnitude > winnerMagnitude ||
        (magnitude === winnerMagnitude && entry.userId < winner.userId)
        ? entry
        : winner;
    }, undefined);
