import { z } from 'zod';

/**
 * Split methods, per ABRO_PRD.md §9/§14. SETTLEMENT is a ledger event
 * (a payment between two people), not an expense split — it's included
 * here because it shares the same "type" discriminant in the ledger.
 */
export const SplitType = {
  EQUAL: 'EQUAL',
  EXACT: 'EXACT',
  PERCENTAGE: 'PERCENTAGE',
  SHARES: 'SHARES',
  SETTLEMENT: 'SETTLEMENT',
} as const;

export type SplitType = (typeof SplitType)[keyof typeof SplitType];

export const splitTypeSchema = z.nativeEnum(SplitType);

/**
 * One participant's row within an expense — shape shared by every split
 * type. Non-negative only: every ExpenseParticipant.amount in this system
 * is non-negative, including for SETTLEMENT (see docs/DECISIONS.md ADR-003's
 * implementation note) -- and SettlementsService builds its own rows
 * directly rather than through this schema, so there's no legitimate case
 * for a negative amount here.
 */
export const expenseParticipantSchema = z.object({
  userId: z.string(),
  /** Amount in minor units, always sent as a string over the wire (bigint isn't JSON-safe). */
  amount: z.string().regex(/^\d+$/, 'amount must be a non-negative integer string of minor units'),
});
export type ExpenseParticipantInput = z.infer<typeof expenseParticipantSchema>;

/**
 * Server-side invariant from ABRO_PRD.md §13/§45:
 * sum(participant shares) must equal the expense total, exactly.
 * This check must run on the server regardless of what the client already verified.
 */
export const assertSharesMatchTotal = (
  total: bigint,
  participants: readonly { amount: bigint }[],
): void => {
  const sum = participants.reduce((acc, p) => acc + p.amount, 0n);
  if (sum !== total) {
    throw new Error(
      `Participant shares (${sum}) must sum to the expense total (${total}), per ABRO_PRD.md §45.`,
    );
  }
};
