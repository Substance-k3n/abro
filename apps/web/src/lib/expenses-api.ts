// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's
// /expenses routes. Shapes mirror apps/api/internal/apitypes/
// expenses.go. Unfiltered GET /expenses (no groupId/friendId) is this
// app's real backing for both DASH-02 Activity and STL-05 Settlement
// History -- every expense the user is party to, globally, already
// sorted `expense_date DESC` server-side (apps/api/queries/
// expenses.sql's ListMyExpenses) -- settlements are Expense rows with
// splitType "SETTLEMENT" (ADR-003), included in this same list, not a
// separate endpoint (apps/settlements has no GET/list at all).

import { api } from './api-client';
import type { AuthProfile } from './auth-api';
import { formatShortDate } from './format';

export interface ExpenseParticipant {
  id: string;
  amount: string;
  user: AuthProfile;
}

export interface AuthExpense {
  id: string;
  groupId: string | null;
  name: string;
  category: string;
  amount: string;
  currency: string;
  paidBy: AuthProfile;
  splitType: string;
  expenseDate: string;
  receiptPath: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ExpenseParticipant[];
}

/** Rows per page on Activity (DASH-08); also what ~/components/
 * PrefetchTabs warms, so the two must ask for the same page. */
export const ACTIVITY_PAGE_SIZE = 30;

export function listExpenses(opts?: {
  groupId?: string;
  friendId?: string;
  /** apps/api's `q` (DASH-08): case-insensitive substring over name,
   * category and notes, server-side across every expense you can see. */
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<AuthExpense[]> {
  const params = new URLSearchParams();
  if (opts?.search) {
    params.set('q', opts.search);
  }
  if (opts?.groupId) {
    params.set('groupId', opts.groupId);
  }
  if (opts?.friendId) {
    params.set('friendId', opts.friendId);
  }
  if (opts?.limit) {
    params.set('limit', String(opts.limit));
  }
  if (opts?.offset) {
    params.set('offset', String(opts.offset));
  }
  const qs = params.toString();
  return api.get(`/expenses/${qs ? `?${qs}` : ''}`);
}

/** One participant on the wire -- only the field matching the
 * expense's splitType is read (apps/api's ExpenseParticipantRaw). */
export interface ExpenseParticipantInput {
  userId: string;
  /** EXACT only: minor units as an integer string. */
  amount?: string;
  /** PERCENTAGE only: all participants must total exactly 100. */
  percentage?: number;
  /** SHARES only: positive integer weight. */
  shares?: number;
}

/** apps/api's CreateExpenseInput. The server computes every stored
 * share from this -- the client's own split math is preview only. */
export interface CreateExpenseInput {
  splitType: 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES';
  name: string;
  category: string;
  /** Minor units as a positive integer string. */
  amount: string;
  groupId?: string;
  paidById?: string;
  /** yyyy-mm-dd or RFC 3339. */
  expenseDate: string;
  notes?: string;
  participants: ExpenseParticipantInput[];
}

/** POST /expenses. `idempotencyKey` should be stable per draft: a
 * retried submit after a lost response then returns the original
 * expense instead of creating a duplicate (apps/api releases the key
 * when the create fails, so retrying after a validation error is fine). */
export function createExpense(
  input: CreateExpenseInput,
  idempotencyKey: string,
): Promise<AuthExpense> {
  return api.post('/expenses/', input, { 'Idempotency-Key': idempotencyKey });
}

/** PATCH /expenses/{id} (EXP-10). apps/api treats an edit as a full
 * resubmit -- same shape and validation as create, every share
 * recomputed -- and only the payer or a group admin may make it. */
export function updateExpense(id: string, input: CreateExpenseInput): Promise<AuthExpense> {
  return api.patch(`/expenses/${id}`, input);
}

const SPLIT_LABELS: Record<string, string> = {
  EQUAL: 'Equal split',
  EXACT: 'Exact split',
  PERCENTAGE: 'Percentage split',
  SHARES: 'Shares split',
};

export interface ActivityDisplay {
  category: string;
  title: string;
  sub: string;
  /** Minor-units bigint, ready for `@abro/types`' `formatMoney`. */
  amount: bigint;
  dir: 'owe' | 'receive' | 'paid';
  time: string;
}

/** Maps one real AuthExpense to `@abro/ui`'s ActivityItem props -- the
 * one place this mapping lives, so DASH-01 (Home) and the later DASH-02
 * (Activity)/STL-05 (Settlement History) wirings can't drift apart on
 * it. `meId` decides both the direction and (for a non-settlement
 * expense) which participant's amount counts as "yours".
 *
 * Settlement amount is `expense.amount` (the whole settled amount), not
 * "my participant amount" -- ADR-003's settlement convention gives the
 * payer a `0` participant row (`{settler: 0, recipient: amount}`), so
 * "my share" would show 0 for the person who actually paid.
 *
 * `time` is `~/lib/format.ts`'s absolute short date, not a relative one
 * ("2h ago") -- see that module for why. */
export function toActivityDisplay(
  expense: AuthExpense,
  meId: string,
  groupNameById: Map<string, string>,
): ActivityDisplay {
  const iPaid = expense.paidBy.id === meId;
  const time = formatShortDate(expense.expenseDate);

  if (expense.splitType === 'SETTLEMENT') {
    // A group settlement is visible to every member -- you may be
    // neither the payer nor the recipient.
    const recipient = expense.participants.find((p) => p.user.id !== expense.paidBy.id)?.user;
    const recipientName = recipient?.displayName.split(' ')[0] ?? 'them';
    const youReceived = recipient?.id === meId;
    return {
      category: 'Settlement',
      title: iPaid
        ? `You settled with ${recipientName}`
        : youReceived
          ? `${expense.paidBy.displayName} settled with you`
          : `${expense.paidBy.displayName.split(' ')[0]} settled with ${recipientName}`,
      sub: expense.groupId ? (groupNameById.get(expense.groupId) ?? 'Group') : 'Personal',
      amount: BigInt(expense.amount),
      dir: youReceived ? 'receive' : 'paid',
      time,
    };
  }

  const myShare = expense.participants.find((p) => p.user.id === meId)?.amount ?? '0';
  const groupName = expense.groupId ? groupNameById.get(expense.groupId) : undefined;
  const otherNames = expense.participants
    .map((p) => p.user)
    .filter((u) => u.id !== meId)
    .map((u) => u.displayName.split(' ')[0])
    .join(', ');

  return {
    category: expense.category,
    title: expense.name,
    sub: groupName
      ? `${groupName} • ${SPLIT_LABELS[expense.splitType] ?? expense.splitType}`
      : otherNames
        ? `You & ${otherNames}`
        : 'Just you',
    amount: BigInt(myShare),
    dir: iPaid ? 'paid' : 'owe',
    time,
  };
}

/** GET /expenses/{id}. apps/api answers 404 EXPENSE_NOT_FOUND for an
 * unknown or deleted id and 403 NOT_VISIBLE for one you're not party
 * to -- EXP-09 treats both as "not found". */
export function getExpense(id: string): Promise<AuthExpense> {
  return api.get(`/expenses/${id}`);
}

/** DELETE /expenses/{id} -- a soft delete (the row stays, `deletedAt`
 * is set, and it drops out of every list and balance). Only the payer
 * or a group admin may; anyone else gets 403 NOT_EDIT_AUTHORIZED. */
export function deleteExpense(id: string): Promise<void> {
  return api.delete(`/expenses/${id}`);
}

/** apps/api's receipt rules (internal/expenses/service.go): JPG, PNG or
 * WebP, 10MB at most. Checked here only to fail fast; the API is the
 * real check. */
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** POST /expenses/{id}/receipt (multipart, field `file`) -- attaches or
 * replaces the receipt; same edit authority as editing the expense.
 * Returns the updated expense. A server with no object storage answers
 * 501 RECEIPT_STORAGE_NOT_CONFIGURED. */
export function uploadReceipt(id: string, file: File): Promise<AuthExpense> {
  const form = new FormData();
  form.append('file', file);
  return api.postForm(`/expenses/${id}/receipt`, form);
}

/** GET /expenses/{id}/receipt -- a presigned URL that expires after five
 * minutes (storage stays private, PRD §36), so fetch it when showing the
 * receipt rather than caching it. */
export function getReceiptUrl(id: string): Promise<{ url: string }> {
  return api.get(`/expenses/${id}/receipt`);
}

/** DELETE /expenses/{id}/receipt -- same edit authority as uploading. */
export function deleteReceipt(id: string): Promise<void> {
  return api.delete(`/expenses/${id}/receipt`);
}
