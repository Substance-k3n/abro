'use client';

// EXP-09 Expense Detail View -- docs/ABRO_FRONTEND_SPEC.md §4 (lines
// 993-1062). Phase 8 slice 7b: reads the real expense from
// GET /expenses/{id} (~/lib/expenses-api.ts) instead of mock EXPENSES.
//
// Deviations:
//  - Receipt section: skipped -- no receipt-upload UI exists anywhere
//    in this app yet (EXP-01/EXP-08 both deferred it), so there's
//    nothing to show a thumbnail for. apps/api's receipt routes exist.
//  - Actions menu: "Download receipt"/"Share expense" dropped for the
//    same reason. "Edit expense" opens EXP-10; settlements never get
//    it -- apps/api's update path can't produce a SETTLEMENT (ADR-003).
//  - The menu shows only when you *might* be allowed to edit or
//    delete: you paid, or it's a group expense (a group admin may too).
//    apps/api's requireEditAuthority is the real check -- a group
//    member who isn't an admin gets its NOT_EDIT_AUTHORIZED message
//    inline (here for delete, on EXP-10 for edit).
//  - Delete asks for confirmation in-page (no browser confirm()
//    dialog), then soft-deletes and returns to Activity. Balances are
//    derived from expenses, so they update with no further call.
//  - Activity log: apps/api records no creator/editor on an expense, so
//    it shows when it was created (and last updated, if ever), not by
//    whom.
//  - "View participant profile" (spec's Interactions list): a
//    participant row links to /friends/[id] only when they're your
//    friend -- a group expense can include people who aren't.
//  - Unknown id, deleted expense, or one you're not party to all show
//    the same "Expense not found" state (apps/api 404/403).

import { EmptyState } from '@abro/ui';
import { ETB, formatMoney } from '@abro/types';
import { ArrowLeft, MoreHorizontal, Pencil, Receipt, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { type AuthProfile, me } from '~/lib/auth-api';
import { type AuthExpense, deleteExpense, getExpense } from '~/lib/expenses-api';
import { listFriends } from '~/lib/friends-api';
import { type GroupListItem, groupTypeFor, listGroups } from '~/lib/groups-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { CATEGORIES } from '~/lib/mock-data';

const METHOD_LABEL: Record<string, string> = {
  EQUAL: 'Equal',
  EXACT: 'Exact',
  PERCENTAGE: 'Percentage',
  SHARES: 'Shares',
  SETTLEMENT: 'Settlement',
};

interface DetailData {
  profile: AuthProfile;
  expense: AuthExpense;
  group: GroupListItem | null;
  friendIds: Set<string>;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DetailData };

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = () => {
    setState({ status: 'loading' });
    Promise.all([me(), getExpense(params.id), listGroups(), listFriends()])
      .then(([profile, expense, groups, friends]) => {
        setState({
          status: 'ready',
          data: {
            profile,
            expense,
            group: expense.groupId ? (groups.find((g) => g.id === expense.groupId) ?? null) : null,
            friendIds: new Set(friends.map((f) => f.friend.id)),
          },
        });
      })
      .catch((err) => {
        if (err instanceof ApiError && [400, 403, 404].includes(err.status)) {
          setState({ status: 'notFound' });
          return;
        }
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Could not load this expense.',
        });
      });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [params.id]);

  if (state.status === 'loading') {
    return <LoadingState minHeight="60vh" />;
  }
  if (state.status === 'error') {
    return <ErrorState message={state.message} onRetry={load} minHeight="60vh" />;
  }
  if (state.status === 'notFound') {
    return (
      <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
        <button
          onClick={() => router.push('/activity')}
          className="mb-4 flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Activity
        </button>
        <EmptyState
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title="Expense not found"
          description="This expense doesn't exist, was deleted, or the link may be out of date."
        />
      </div>
    );
  }

  const { profile, expense, group, friendIds } = state.data;
  const isYou = (user: AuthProfile) => user.id === profile.id;
  const nameOf = (user: AuthProfile) => (isYou(user) ? 'You' : user.displayName);
  const category = CATEGORIES.find((c) => c.label === expense.category);
  const amount = BigInt(expense.amount);
  const mightManage = isYou(expense.paidBy) || expense.groupId !== null;
  const wasUpdated = expense.updatedAt !== expense.createdAt;

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteExpense(expense.id);
      router.push('/activity');
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : 'Could not delete this expense. Please try again.',
      );
      setDeleting(false);
    }
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Back
        </button>
        <h2
          className="font-display flex-1 truncate px-3 text-center text-[1rem] font-bold"
          style={{ color: 'var(--t-primary)' }}
        >
          {expense.name}
        </h2>
        {mightManage ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Expense actions"
              className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
            >
              <MoreHorizontal size={18} strokeWidth={2} />
            </button>
            {menuOpen && (
              <div className="neo-raised-sm absolute right-0 top-11 z-10 flex w-44 flex-col gap-1 rounded-2xl p-2">
                {expense.splitType !== 'SETTLEMENT' && (
                  <Link
                    href={`/expenses/${expense.id}/edit`}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-[0.82rem] font-medium"
                    style={{ color: 'var(--t-secondary)' }}
                  >
                    <Pencil size={15} strokeWidth={2} /> Edit expense
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmingDelete(true);
                  }}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-[0.82rem] font-medium"
                  style={{ color: 'var(--c-red)' }}
                >
                  <Trash2 size={15} strokeWidth={2} /> Delete expense
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {confirmingDelete && (
        <div className="neo-raised-sm mb-4 flex flex-col gap-3 rounded-[18px] p-4">
          <p className="text-[0.85rem]" style={{ color: 'var(--t-primary)' }}>
            Delete <strong>{expense.name}</strong>? It&apos;s removed for everyone on it, and
            balances update right away.
          </p>
          {deleteError && (
            <p
              role="alert"
              className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
              style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
            >
              {deleteError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setConfirmingDelete(false);
                setDeleteError(null);
              }}
              disabled={deleting}
              className="neo-btn flex-1 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold"
              style={{ color: 'var(--t-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="flex-1 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--c-red)' }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="neo-raised-sm mb-4 flex flex-col items-center gap-2 rounded-[20px] p-6 text-center">
        <div
          className="neo-raised-sm flex h-14 w-14 items-center justify-center rounded-2xl text-[1.4rem]"
          style={{ color: 'var(--t-muted)' }}
        >
          {expense.splitType === 'SETTLEMENT' ? '🤝' : (category?.icon ?? '📦')}
        </div>
        <p
          className="font-display text-[2rem] font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          {formatMoney(amount, ETB)}
        </p>
        <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
          {formatLongDate(expense.expenseDate)}
        </p>
        {group && (
          <span
            className="neo-flat mt-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.72rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            {groupTypeFor(group.type).icon} {group.name}
          </span>
        )}
      </div>

      {/* Paid by */}
      <div className="neo-raised-sm mb-4 rounded-[18px] p-4">
        <p
          className="font-display mb-3 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Paid by
        </p>
        <div className="flex items-center gap-2.5">
          <Avatar user={expense.paidBy} size="h-9 w-9 text-[0.72rem]" />
          <span
            className="flex-1 text-[0.88rem] font-semibold"
            style={{ color: 'var(--t-primary)' }}
          >
            {nameOf(expense.paidBy)}
          </span>
          <span className="font-mono text-[0.9rem] font-bold" style={{ color: 'var(--t-primary)' }}>
            {formatMoney(amount, ETB)}
          </span>
        </div>
      </div>

      {/* Split details */}
      <div className="neo-raised-sm mb-4 rounded-[18px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p
            className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Split
          </p>
          <span
            className="rounded-lg px-2 py-0.5 text-[0.72rem] font-semibold"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
          >
            {METHOD_LABEL[expense.splitType] ?? expense.splitType}
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          {expense.participants.map((p) => {
            const row = (
              <div className="flex flex-1 items-center gap-2.5">
                <Avatar user={p.user} size="h-7 w-7 text-[0.65rem]" />
                <span className="flex-1 text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
                  {nameOf(p.user)}
                </span>
                <span
                  className="font-mono text-[0.88rem] font-bold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {formatMoney(BigInt(p.amount), ETB)}
                </span>
              </div>
            );
            return friendIds.has(p.user.id) ? (
              <Link key={p.id} href={`/friends/${p.user.id}`} className="flex items-center gap-2.5">
                {row}
              </Link>
            ) : (
              <div key={p.id} className="flex items-center gap-2.5">
                {row}
              </div>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      {expense.notes && (
        <div className="neo-raised-sm mb-4 rounded-[18px] p-4">
          <p
            className="font-display mb-2 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Note
          </p>
          <p className="text-[0.85rem] leading-relaxed" style={{ color: 'var(--t-secondary)' }}>
            {expense.notes}
          </p>
        </div>
      )}

      {/* Activity log */}
      <div className="flex flex-col gap-1 px-1">
        <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
          Created · {formatLongDate(expense.createdAt)}
        </p>
        {wasUpdated && (
          <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
            Updated · {formatLongDate(expense.updatedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function Avatar({ user, size }: { user: AuthProfile; size: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size}`}
      style={{ background: colorForId(user.id) }}
    >
      {initialsOf(user.displayName)}
    </div>
  );
}
