import { z } from 'zod';

/**
 * ABRO_PRD.md §19. Deliberately its own schema, not a splitType branch of
 * createExpenseSchema -- per docs/DECISIONS.md ADR-003, the general
 * expense-create path must never accept splitType: SETTLEMENT. The service
 * builds the underlying Expense + two ExpenseParticipant rows itself; the
 * client only supplies who's being paid, how much, and (optionally) which
 * group the debt belongs to.
 */
export const createSettlementSchema = z.object({
  toUserId: z.string(),
  /** Minor units, as a positive integer string -- see money.ts. */
  amount: z.string().regex(/^[1-9]\d*$/, 'amount must be a positive integer string of minor units'),
  /** Omit for a personal (non-group) settlement. */
  groupId: z.string().optional(),
});
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
