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

import { type ExpenseDraft, ME, type SplitMethod } from './expense-draft';
import type { AuthExpense, CreateExpenseInput, ExpenseParticipantInput } from './expenses-api';

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

/** A percentage input as whole basis points (33.33 -> 3333), rounded
 * the same way apps/api rounds it; 0 for blank/unparseable input. */
export function percentageBasisPoints(input: string | undefined): number {
  const pct = Number(input ?? '');
  return Number.isFinite(pct) ? Math.round(pct * 100) : 0;
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
    const weights = participantIds.map((id) =>
      BigInt(Math.max(0, percentageBasisPoints(draft.percentages[id]))),
    );
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
    // Mirrors apps/api's computeParticipantAmounts exactly: each
    // percentage rounds to whole basis points, every one must be in
    // (0, 100], and they must total exactly 10000 -- no epsilon, or the
    // wizard would let through a split the server then rejects with
    // PERCENTAGES_MUST_SUM_TO_100.
    const basisPoints = participantIds.map((id) => percentageBasisPoints(draft.percentages[id]));
    if (basisPoints.some((bp) => bp <= 0 || bp > 10000)) {
      return false;
    }
    return basisPoints.reduce((a, b) => a + b, 0) === 10000;
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

const SPLIT_TYPES: Record<SplitMethod, CreateExpenseInput['splitType']> = {
  equal: 'EQUAL',
  exact: 'EXACT',
  percentage: 'PERCENTAGE',
  shares: 'SHARES',
};

/** The draft as POST /expenses' body. `ME` becomes `meId` here and
 * nowhere earlier (see expense-draft.tsx). Only the split method's own
 * inputs are sent -- apps/api recomputes every share from them, so the
 * amounts the wizard previewed are never trusted as-is. */
export function toCreateExpenseInput(draft: ExpenseDraft, meId: string): CreateExpenseInput {
  const realId = (id: string) => (id === ME ? meId : id);
  const note = draft.note.trim();

  return {
    splitType: SPLIT_TYPES[draft.splitMethod],
    name: draft.name.trim(),
    category: draft.category,
    amount: parseAmount(draft.amountInput).toString(),
    ...(draft.groupId ? { groupId: draft.groupId } : {}),
    paidById: realId(draft.payerId),
    expenseDate: draft.date,
    ...(note ? { notes: note } : {}),
    participants: draft.participantIds.map((id) => {
      const userId = realId(id);
      switch (draft.splitMethod) {
        case 'exact':
          return { userId, amount: parseAmount(draft.exactAmounts[id] ?? '').toString() };
        case 'percentage':
          return { userId, percentage: Number(draft.percentages[id] ?? '0') };
        case 'shares':
          return { userId, shares: draft.shares[id] ?? 1 };
        default:
          return { userId };
      }
    }),
  };
}

/** EXP-10's split for an edited expense. apps/api stores only each
 * participant's final amount (no percentages or share weights), so:
 *  - amount and participants unchanged: resend the stored amounts
 *    as they are. An EQUAL expense stays EQUAL -- participants go
 *    largest share first, since apps/api hands the remainder to the
 *    first participants in request order and returns them unordered.
 *    Anything else goes as EXACT, so a PERCENTAGE/SHARES expense then
 *    reads "Exact split" (same amounts, method label lost).
 *  - otherwise: an EQUAL split of the new amount over `participantIds`,
 *    in that order.
 * Decided with the user 2026-09-29 (docs/WIRING_PLAN.md slice 7c). */
export function editedSplit(
  original: AuthExpense,
  amount: MinorUnits,
  participantIds: string[],
): { splitType: CreateExpenseInput['splitType']; participants: ExpenseParticipantInput[] } {
  const originalIds = original.participants.map((p) => p.user.id);
  const unchanged =
    amount === BigInt(original.amount) &&
    participantIds.length === originalIds.length &&
    participantIds.every((id) => originalIds.includes(id));

  if (!unchanged) {
    return { splitType: 'EQUAL', participants: participantIds.map((userId) => ({ userId })) };
  }

  const stored = [...original.participants].sort((a, b) => {
    const diff = BigInt(b.amount) - BigInt(a.amount);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });
  const equal = splitEqually(amount, stored.length);
  if (original.splitType === 'EQUAL' && stored.every((p, i) => BigInt(p.amount) === equal[i])) {
    return { splitType: 'EQUAL', participants: stored.map((p) => ({ userId: p.user.id })) };
  }
  return {
    splitType: 'EXACT',
    participants: stored.map((p) => ({ userId: p.user.id, amount: p.amount })),
  };
}
