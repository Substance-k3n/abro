import { z } from 'zod';

import { expenseParticipantSchema } from './split';

const expenseBaseFields = {
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  /** Minor units, as a positive integer string — see money.ts. */
  amount: z.string().regex(/^[1-9]\d*$/, 'amount must be a positive integer string of minor units'),
  /** Ignored when groupId is set — the expense always takes the group's currency. */
  currency: z.string().length(3).optional(),
  groupId: z.string().optional(),
  /** Defaults to the caller when omitted. */
  paidById: z.string().optional(),
  expenseDate: z.coerce.date(),
  receiptPath: z.string().url().optional(),
  notes: z.string().trim().max(1000).optional(),
};

/**
 * ABRO_PRD.md §13/§14. SETTLEMENT is deliberately not a branch here — per
 * docs/DECISIONS.md ADR-003, the general expense-create path must never
 * accept splitType: SETTLEMENT, so it's structurally impossible to submit
 * one through this schema.
 */
export const createExpenseSchema = z.discriminatedUnion('splitType', [
  z.object({
    splitType: z.literal('EQUAL'),
    ...expenseBaseFields,
    participants: z.array(z.object({ userId: z.string() })).min(1),
  }),
  z.object({
    splitType: z.literal('EXACT'),
    ...expenseBaseFields,
    participants: z.array(expenseParticipantSchema).min(1),
  }),
  z.object({
    splitType: z.literal('PERCENTAGE'),
    ...expenseBaseFields,
    participants: z
      .array(z.object({ userId: z.string(), percentage: z.number().positive().max(100) }))
      .min(1),
  }),
  z.object({
    splitType: z.literal('SHARES'),
    ...expenseBaseFields,
    participants: z
      .array(z.object({ userId: z.string(), shares: z.number().int().positive() }))
      .min(1),
  }),
]);
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** Editing an expense resubmits the whole thing — same shape as create. */
export const updateExpenseSchema = createExpenseSchema;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const addExpenseNoteSchema = z.object({
  content: z.string().trim().min(1).max(500),
});
export type AddExpenseNoteInput = z.infer<typeof addExpenseNoteSchema>;

export const listExpensesQuerySchema = z.object({
  groupId: z.string().optional(),
  /** Personal (non-group) expenses shared with this friend — ABRO_PRD.md §22 "Friend Balance" history list. */
  friendId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
