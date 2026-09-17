import { z } from 'zod';

import { createExpenseSchema } from './expenses';

/** Mirrors the Prisma RecurringFrequency enum — kept in sync manually, same as SplitType/GroupType. */
export const recurringFrequencySchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
export type RecurringFrequency = z.infer<typeof recurringFrequencySchema>;

/**
 * ABRO_PRD.md §35: "Each recurring expense contains: template, frequency,
 * next execution, enabled." The template IS a real Expense (created via the
 * normal expense-create path, per docs/BACKEND_PLAN.md item 4 -- "reuse,
 * don't duplicate split computation"), so creating a recurring expense takes
 * every CreateExpenseInput field plus `frequency`. `expenseDate` doubles as
 * the template's date and the anchor `nextRunAt` is computed from.
 */
export const createRecurringExpenseSchema = z.intersection(
  createExpenseSchema,
  z.object({ frequency: recurringFrequencySchema }),
);
export type CreateRecurringExpenseInput = z.infer<typeof createRecurringExpenseSchema>;

export const setRecurringEnabledSchema = z.object({ enabled: z.boolean() });
export type SetRecurringEnabledInput = z.infer<typeof setRecurringEnabledSchema>;
