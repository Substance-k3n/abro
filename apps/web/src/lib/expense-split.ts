// Phase 4 (add-expense wizard) split calculations -- docs/WIRING_PLAN.md
// Phase 4's acceptance line: "all four split methods validate correctly
// against the shared money utilities." This module is the one place the
// wizard's step screens call into @abro/types' splitEqually/
// splitByWeights/assertSharesMatchTotal, so every step (split-method
// preview, the three custom-split screens, and the review step) computes
// shares identically instead of each screen re-deriving its own math.

import {
  ETB,
  type MinorUnits,
  assertSharesMatchTotal,
  fromDecimal,
  splitByWeights,
  splitEqually,
  sum,
} from '@abro/types';

import type { ExpenseDraft } from './expense-draft';

/** Parses a raw decimal-string form input into MinorUnits, treating
 * anything unparseable or negative as 0n. Inputs get their own "is this
 * a valid positive number" checks at the form level for user-facing
 * errors -- this helper is for derived calculations once a value is
 * already in the draft, not for surfacing input errors itself. */
export function parseAmount(input: string): MinorUnits {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) {
    return 0n;
  }
  return fromDecimal(n, ETB.decimalDigits);
}

type SplitInputs = Pick<ExpenseDraft, 'splitMethod' | 'exactAmounts' | 'percentages' | 'shares'>;

/**
 * Each participant's final share in minor units, per the draft's chosen
 * split method.
 *
 * EQUAL/PERCENTAGE/SHARES go through @abro/types' splitEqually/
 * splitByWeights, which guarantee sum(result) === total by construction
 * (the remainder is distributed deterministically) -- the same
 * functions apps/api uses server-side, per docs/DECISIONS.md ADR-002's
 * whole reason for sharing packages/types.
 *
 * EXACT is the one method that does NOT auto-balance: it reflects the
 * user's raw entered amounts as-is, which may not sum to `total` --
 * that mismatch is exactly what isSplitValid (below) exists to catch
 * before the wizard lets the user proceed past EXP-05.
 */
export function computeShares(
  draft: SplitInputs,
  participantIds: readonly string[],
  total: MinorUnits,
): Record<string, MinorUnits> {
  if (participantIds.length === 0) {
    return {};
  }

  if (draft.splitMethod === 'equal') {
    const parts = splitEqually(total, participantIds.length);
    return Object.fromEntries(participantIds.map((id, i) => [id, parts[i]!]));
  }

  if (draft.splitMethod === 'exact') {
    return Object.fromEntries(
      participantIds.map((id) => [id, parseAmount(draft.exactAmounts[id] ?? '')]),
    );
  }

  if (draft.splitMethod === 'percentage') {
    // Weights as basis points (percentage * 100) so splitByWeights, which
    // takes bigint weights, can work with fractional percentages too.
    const weights = participantIds.map((id) => {
      const pct = Number(draft.percentages[id] ?? '0');
      return Number.isFinite(pct) && pct > 0 ? BigInt(Math.round(pct * 100)) : 0n;
    });
    if (weights.every((w) => w === 0n)) {
      return Object.fromEntries(participantIds.map((id) => [id, 0n]));
    }
    const parts = splitByWeights(total, weights);
    return Object.fromEntries(participantIds.map((id, i) => [id, parts[i]!]));
  }

  // shares
  const weights = participantIds.map((id) => BigInt(Math.max(0, draft.shares[id] ?? 1)));
  if (weights.every((w) => w === 0n)) {
    return Object.fromEntries(participantIds.map((id) => [id, 0n]));
  }
  const parts = splitByWeights(total, weights);
  return Object.fromEntries(participantIds.map((id, i) => [id, parts[i]!]));
}

/**
 * Whether the current split state is valid enough to move past its
 * screen, per each method's spec-defined rule (ABRO_FRONTEND_SPEC.md
 * EXP-05/06/07's "Validation" sections).
 */
export function isSplitValid(
  draft: SplitInputs,
  participantIds: readonly string[],
  total: MinorUnits,
): boolean {
  if (participantIds.length === 0 || total <= 0n) {
    return false;
  }

  if (draft.splitMethod === 'equal') {
    return true;
  }

  if (draft.splitMethod === 'exact') {
    const participants = participantIds.map((id) => ({
      amount: parseAmount(draft.exactAmounts[id] ?? ''),
    }));
    try {
      assertSharesMatchTotal(total, participants);
      return true;
    } catch {
      return false;
    }
  }

  if (draft.splitMethod === 'percentage') {
    const totalPct = sum(
      participantIds.map((id) => fromDecimal(Number(draft.percentages[id] ?? '0') || 0, 2)),
    );
    // Within 0.01% (1 basis point) of 100 -- spec says "sum must equal
    // 100%" but float-typed percentage inputs need a small epsilon.
    return totalPct >= 9999n && totalPct <= 10001n;
  }

  // shares
  return participantIds.every((id) => (draft.shares[id] ?? 1) > 0);
}

/** Sum of whatever the participant has currently entered, in minor
 * units -- used by EXP-05's running-total indicator. Exact-only; the
 * other methods don't need a running total against `total` since
 * they're either always-valid (equal) or validated against 100%/> 0
 * instead of an amount sum (percentage/shares). */
export function enteredExactTotal(
  exactAmounts: Record<string, string>,
  participantIds: readonly string[],
): MinorUnits {
  return sum(participantIds.map((id) => parseAmount(exactAmounts[id] ?? '')));
}
