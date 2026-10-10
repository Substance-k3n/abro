import { z } from 'zod';

/**
 * ABRO_PRD.md §34's event list. RECURRING_EXPENSE is defined here now but
 * not emitted until the `recurring` module exists (docs/BACKEND_PLAN.md
 * item 4) -- keeping the full set in one place avoids a second migration
 * of this union later. Friend-request events are deliberately absent:
 * they're not in the PRD's 8-item list.
 */
export const notificationTypes = [
  'EXPENSE_ADDED',
  'EXPENSE_EDITED',
  'EXPENSE_DELETED',
  'SETTLEMENT',
  'GROUP_INVITATION',
  'GROUP_MEMBERSHIP_CHANGE',
  'RECURRING_EXPENSE',
  'DEBT_SIMPLIFICATION_CHANGE',
  // Not in PRD §34: a group admin's nudge to a member who owes (ADR-018).
  'PAYMENT_REMINDER',
  // Not in PRD §34 either: friend requests and accepted requests.
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
  // ADR-020: someone says they weren't part of an expense.
  'EXPENSE_DISPUTED',
  // ADR-024: ekub invitations, and ekub payments to confirm or confirmed.
  'EKUB_INVITATION',
  'EKUB_PAYMENT',
] as const;
export type NotificationType = (typeof notificationTypes)[number];

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
