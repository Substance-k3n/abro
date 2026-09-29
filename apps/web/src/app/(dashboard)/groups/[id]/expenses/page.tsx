'use client';

// GRP-04 Group Expenses -- docs/ABRO_FRONTEND_SPEC.md §5 (lines 1265-
// 1310). The full list behind GRP-03's Expenses tab, with filters.
// Phase 8 slice 8b: GET /expenses?groupId= (newest first), paged with
// "Load more" like Activity (DASH-02).
//
// Deviations:
//  - Filters run client-side over the rows loaded so far (the API's only
//    filters are group/friend/text): All, Your expenses (you paid), and
//    one per category this group actually uses. "By date range" and
//    "By payer" are dropped -- low value for a 2-5 person group.
//  - "Your share": if you paid, what the others owe you for it (amount
//    minus your own share, green); otherwise your share (red); nothing
//    if you're not on it. Settlements show as such, not as a share.

import { ETB, formatMoney } from '@abro/types';
import { EmptyState } from '@abro/ui';
import { ArrowLeft, Plus, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError } from '~/lib/api-client';
import { type AuthExpense, listExpenses } from '~/lib/expenses-api';
import { formatShortDate } from '~/lib/format';
import { type GroupView, GroupViewLoader, nameIn } from '~/lib/group-view';

const PAGE_SIZE = 30;

type Filter = 'all' | 'yours' | string;

export default function GroupExpensesPage() {
  const params = useParams<{ id: string }>();
  const [firstPage, setFirstPage] = useState<AuthExpense[]>([]);

  return (
    <GroupViewLoader
      groupId={params.id}
      extra={() => listExpenses({ groupId: params.id, limit: PAGE_SIZE }).then(setFirstPage)}
    >
      {(view) => <GroupExpenses view={view} firstPage={firstPage} />}
    </GroupViewLoader>
  );
}

function GroupExpenses({ view, firstPage }: { view: GroupView; firstPage: AuthExpense[] }) {
  const router = useRouter();
  const { group, profile } = view;
  const [expenses, setExpenses] = useState(firstPage);
  const [hasMore, setHasMore] = useState(firstPage.length === PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const categories = Array.from(
    new Set(expenses.filter((e) => e.splitType !== 'SETTLEMENT').map((e) => e.category)),
  );
  const filtered = expenses.filter((e) => {
    if (filter === 'yours') {
      return e.paidBy.id === profile.id && e.splitType !== 'SETTLEMENT';
    }
    if (filter !== 'all') {
      return e.category === filter && e.splitType !== 'SETTLEMENT';
    }
    return true;
  });

  const loadMore = () => {
    setLoadingMore(true);
    setMoreError(null);
    listExpenses({ groupId: group.id, limit: PAGE_SIZE, offset: expenses.length })
      .then((next) => {
        setExpenses((prev) => [...prev, ...next]);
        setHasMore(next.length === PAGE_SIZE);
      })
      .catch((err) => {
        setMoreError(err instanceof ApiError ? err.message : 'Could not load more expenses.');
      })
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push(`/groups/${group.id}`)}
          className="flex min-w-0 items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{group.name}</span>
        </button>
        <h2
          className="font-display shrink-0 px-2 text-[1.05rem] font-bold"
          style={{ color: 'var(--t-primary)' }}
        >
          Group Expenses
        </h2>
        <div className="w-[60px]" />
      </div>

      <div className="neo-inset-sm hide-scroll mb-5 flex gap-1 overflow-x-auto rounded-[14px] p-1">
        {(['all', 'yours', ...categories] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`neo-tab whitespace-nowrap border-none ${filter === f ? 'active' : ''}`}
          >
            {f === 'all' ? 'All' : f === 'yours' ? 'Your expenses' : f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title={expenses.length === 0 ? 'No expenses yet' : 'No expenses found'}
          description={
            expenses.length === 0
              ? 'Add the first expense for this group.'
              : hasMore
                ? 'Nothing matches in what’s loaded so far -- try loading more.'
                : 'Try a different filter.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((e) => (
            <ExpenseRow
              key={e.id}
              view={view}
              expense={e}
              onClick={() => router.push(`/expenses/${e.id}`)}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-5 flex flex-col items-center gap-2">
          {moreError && (
            <p className="text-[0.8rem]" style={{ color: 'var(--c-red)' }}>
              {moreError}
            </p>
          )}
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="neo-btn rounded-2xl px-5 py-2.5 text-[0.85rem] font-medium disabled:opacity-60"
            style={{ color: 'var(--t-secondary)' }}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      <Link
        href={`/expenses/new?groupId=${group.id}`}
        className="neo-btn-accent font-display mt-5 flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold"
      >
        <Plus size={18} strokeWidth={2.25} /> Add Expense
      </Link>
    </div>
  );
}

function ExpenseRow({
  view,
  expense,
  onClick,
}: {
  view: GroupView;
  expense: AuthExpense;
  onClick: () => void;
}) {
  const meId = view.profile.id;
  const amount = BigInt(expense.amount);
  const iPaid = expense.paidBy.id === meId;
  const myShare = expense.participants.find((p) => p.user.id === meId);
  const isSettlement = expense.splitType === 'SETTLEMENT';

  let position: { text: string; color: string } | null = null;
  if (isSettlement) {
    position = { text: 'Settlement', color: 'var(--t-dim)' };
  } else if (iPaid) {
    const lent = amount - BigInt(myShare?.amount ?? '0');
    position = { text: `+${formatMoney(lent, ETB)}`, color: 'var(--c-green)' };
  } else if (myShare) {
    position = { text: `-${formatMoney(BigInt(myShare.amount), ETB)}`, color: 'var(--c-red)' };
  }

  const title = isSettlement
    ? `${nameIn(view, expense.paidBy.id)} paid ${nameIn(view, expense.participants.find((p) => p.user.id !== expense.paidBy.id)?.user.id ?? '', true)}`
    : expense.name;

  return (
    <button
      onClick={onClick}
      className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left"
    >
      <div className="min-w-0 flex-1">
        <p
          className="mb-0.5 truncate text-[0.88rem] font-semibold"
          style={{ color: 'var(--t-primary)' }}
        >
          {title}
        </p>
        <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
          {isSettlement ? '' : `Paid by ${iPaid ? 'you' : expense.paidBy.displayName} · `}
          {formatShortDate(expense.expenseDate)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[0.85rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          {formatMoney(amount, ETB)}
        </p>
        {position && (
          <p className="font-mono text-[0.7rem] font-semibold" style={{ color: position.color }}>
            {position.text}
          </p>
        )}
      </div>
    </button>
  );
}
