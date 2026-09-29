'use client';

// STL-05 Settlement History -- docs/ABRO_FRONTEND_SPEC.md §6 (lines
// 1708-1747). Closes out Phase 6 (Settlement).
//
// Phase 8 slice 9b: reads real settlements. apps/api has no
// settlements-only list, but a settlement is an expense named
// "Settlement" (ADR-003), so this pages GET /expenses?q=Settlement and
// keeps splitType SETTLEMENT rows ("Load more", like Activity) -- the
// text filter keeps each page small without a new endpoint.
// Entry point: STL-04's "View settlement history".
//
// Deviations (Confirmed, same reasoning already established on DASH-02
// Activity for the identical underlying gap):
//  - "By date range" filter: omitted (same call as Activity). Rows show
//    the real date.
//  - No method/note on rows: apps/api stores neither (user decision
//    2026-09-29).
//  - A group settlement between two other members is listed too (every
//    member can see it), titled "X paid Y" and in neither filter.
//  - "By person" filter: folded into the search box (case-insensitive
//    match against the resolved counterparty's name), rather than a
//    separate control -- same simplification Activity made for its own
//    search-doubles-as-filter behavior.
//  - "Filter button" in the header: inline `.neo-tab` pills (All / You
//    paid / You received), matching every other list screen's filter
//    pattern in this app (Activity, Balances, Group Expenses) instead of
//    a filter sheet/modal.
//  - "Tap settlement -> Detail view": opens EXP-09, which shows a
//    settlement like any expense (it's one, ADR-003).

import { ETB } from '@abro/types';
import { ActivityItem, EmptyState } from '@abro/ui';
import { ArrowLeft, Handshake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { me } from '~/lib/auth-api';
import { type AuthExpense, listExpenses } from '~/lib/expenses-api';
import { formatShortDate } from '~/lib/format';
import { listGroups } from '~/lib/groups-api';

type FilterKey = 'all' | 'paid' | 'received';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'You paid' },
  { key: 'received', label: 'You received' },
];

const PAGE_SIZE = 50;

function fetchPage(offset: number): Promise<AuthExpense[]> {
  return listExpenses({ search: 'Settlement', limit: PAGE_SIZE, offset });
}

interface Data {
  meId: string;
  groupNames: Map<string, string>;
  /** Raw pages (settlements plus any expense that merely mentions
   * "Settlement"); filtered below. */
  rows: AuthExpense[];
  hasMore: boolean;
}

export default function SettlementsPage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const load = () => {
    setError(null);
    setData(null);
    Promise.all([me(), listGroups(), fetchPage(0)])
      .then(([profile, groups, rows]) =>
        setData({
          meId: profile.id,
          groupNames: new Map(groups.map((g) => [g.id, g.name])),
          rows,
          hasMore: rows.length === PAGE_SIZE,
        }),
      )
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your settlements.');
      });
  };

  useEffect(load, []);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const loadMore = () => {
    setLoadingMore(true);
    setMoreError(null);
    fetchPage(data.rows.length)
      .then((next) =>
        setData((prev) =>
          prev
            ? { ...prev, rows: [...prev.rows, ...next], hasMore: next.length === PAGE_SIZE }
            : prev,
        ),
      )
      .catch((err) => {
        setMoreError(err instanceof ApiError ? err.message : 'Could not load more settlements.');
      })
      .finally(() => setLoadingMore(false));
  };

  const q = query.trim().toLowerCase();
  const rows = data.rows
    .filter((e) => e.splitType === 'SETTLEMENT')
    .map((e) => {
      // A group settlement is visible to every member, so you may be
      // neither side of it.
      const recipient = e.participants.find((p) => p.user.id !== e.paidBy.id)?.user;
      const youPaid = e.paidBy.id === data.meId;
      const youReceived = recipient?.id === data.meId;
      const payerName = e.paidBy.displayName;
      const recipientName = recipient?.displayName ?? 'Former member';
      const groupName = e.groupId ? (data.groupNames.get(e.groupId) ?? 'Group') : null;
      return {
        expense: e,
        youPaid,
        youReceived,
        names: [payerName, recipientName],
        title: youPaid
          ? `You paid ${recipientName}`
          : youReceived
            ? `${payerName} paid you`
            : `${payerName} paid ${recipientName}`,
        sub: groupName ?? 'Personal',
      };
    })
    .filter((r) => {
      if (filter === 'paid' && !r.youPaid) {
        return false;
      }
      if (filter === 'received' && !r.youReceived) {
        return false;
      }
      return !q || r.names.some((n) => n.toLowerCase().includes(q));
    });

  return (
    <div className="fade-in hide-scroll px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Back
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Settlements
        </h2>
        <div className="w-[52px]" />
      </div>

      <div className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by person"
          className="neo-input"
        />
      </div>

      <div className="neo-inset-sm hide-scroll mb-5 flex gap-1 overflow-x-auto rounded-[14px] p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`neo-tab whitespace-nowrap border-none ${filter === f.key ? 'active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Handshake size={26} strokeWidth={1.5} />}
          title="No settlements found"
          description={
            data.rows.some((e) => e.splitType === 'SETTLEMENT')
              ? 'Try a different filter or search term.'
              : 'Settlements you record or receive will show up here.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <ActivityItem
              key={r.expense.id}
              category="Settlement"
              title={r.title}
              sub={r.sub}
              amount={BigInt(r.expense.amount)}
              dir={r.youReceived ? 'receive' : 'paid'}
              time={formatShortDate(r.expense.expenseDate)}
              currency={ETB}
              onClick={() => router.push(`/expenses/${r.expense.id}`)}
            />
          ))}
        </div>
      )}

      {data.hasMore && (
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
    </div>
  );
}
