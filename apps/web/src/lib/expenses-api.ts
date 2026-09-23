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

export function listExpenses(opts?: {
  groupId?: string;
  friendId?: string;
  limit?: number;
  offset?: number;
}): Promise<AuthExpense[]> {
  const params = new URLSearchParams();
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
 * `time` is an absolute short date, not a relative one ("2h ago") --
 * `expenseDate` has no client-side relative-time formatter in this app
 * yet, and adding one is out of scope for this slice. */
export function toActivityDisplay(
  expense: AuthExpense,
  meId: string,
  groupNameById: Map<string, string>,
): ActivityDisplay {
  const iPaid = expense.paidBy.id === meId;
  const time = new Date(expense.expenseDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  if (expense.splitType === 'SETTLEMENT') {
    const other = expense.participants.find((p) => p.user.id !== expense.paidBy.id)?.user;
    const otherName = other?.displayName.split(' ')[0] ?? 'them';
    return {
      category: 'Settlement',
      title: iPaid
        ? `You settled with ${otherName}`
        : `${expense.paidBy.displayName} settled with you`,
      sub: expense.groupId ? (groupNameById.get(expense.groupId) ?? 'Group') : 'Personal',
      amount: BigInt(expense.amount),
      dir: iPaid ? 'paid' : 'receive',
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
