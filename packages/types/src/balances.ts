import { type MinorUnits, ZERO, add, subtract } from './money';

/**
 * One ledger contribution between exactly two users — derived from an
 * Expense+ExpenseParticipant pair, never stored. ABRO_PRD.md §8.2/§16/§45:
 * "derived balance = financial facts", no independently maintained balance.
 */
export interface LedgerEntry {
  /** true when this entry represents money owed BY userA TO userB. */
  owedByA: boolean;
  amount: MinorUnits;
}

/**
 * Nets a list of pairwise ledger entries between two users (A, B) into a
 * single signed balance. Works identically for every split type, including
 * SETTLEMENT — a settlement is just another entry that partially or fully
 * cancels prior ones, per ABRO_PRD.md §19's "the balance becomes zero".
 *
 * Positive => A owes B. Negative => B owes A. Zero => settled up.
 */
export const netBalance = (entries: readonly LedgerEntry[]): MinorUnits =>
  entries.reduce(
    (net, entry) => (entry.owedByA ? add(net, entry.amount) : subtract(net, entry.amount)),
    ZERO,
  );
