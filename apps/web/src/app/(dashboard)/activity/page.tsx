'use client';

// DASH-02 Activity Feed — docs/ABRO_FRONTEND_SPEC.md §3 (lines 283-335).
// Ported from the prototype's ActivityScreen (App.tsx:1778): title, filter
// tabs (neo-tab/.active), neo-raised-sm feed rows. Deviations/assumptions:
//  - Filter modal/sheet and date-range filter (spec's filter list) are
//    replaced with inline `.neo-tab` pills (All/Expenses/Settlements/
//    Groups), matching the prototype. Date-range is still not built --
//    originally dropped because the mock `time` field had no real dates;
//    real expenses do have `expenseDate` now, but a range picker is its
//    own piece of UI, deferred rather than bundled into the API wiring.
//  - Search bar is a plain `.neo-input` doing case-insensitive substring
//    matching against `title`/`sub`, no separate search-icon toggle state
//    (spec just says "search icon"; always-visible is simpler and the
//    prototype has no search at all on this screen to match against).
//
// Phase 8 (docs/WIRING_PLAN.md), slice 4: rewired from ~/lib/mock-data.ts
// to real, unfiltered GET /expenses (every expense the user is party to,
// settlements included as splitType SETTLEMENT rows per ADR-003, newest
// expense_date first), mapped through the same toActivityDisplay() Home
// uses. Deviations (Confirmed):
//  - Paginated with an explicit "Load more" button (PAGE_SIZE rows per
//    request via limit/offset), not infinite scroll -- same result, no
//    scroll-observer plumbing, and a clear end-of-feed signal.
//  - Filter tabs and search run client-side over the rows loaded so far
//    (GET /expenses has no type/text filters). Filters are now exact,
//    not heuristic: Settlements = splitType SETTLEMENT, Expenses =
//    everything else, Groups = has a groupId. A filter can show few rows
//    until more pages are loaded -- "Load more" stays available.
//  - Rows are not clickable: `/expenses/[id]` (EXP-09) is still mock-only
//    and would show "not found" for a real id -- same deviation as Home.
//  - Friend Detail's "View all-time spending" link passes `?friendId=`,
//    which this screen doesn't read yet (it didn't against mock data
//    either); Friend Detail already lists that full history itself.

import { ActivityItem, EmptyState } from '@abro/ui';
import { Receipt, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { me } from '~/lib/auth-api';
import { type AuthExpense, listExpenses, toActivityDisplay } from '~/lib/expenses-api';
import { listGroups } from '~/lib/groups-api';

const PAGE_SIZE = 30;

type FilterKey = 'all' | 'expenses' | 'settlements' | 'groups';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'settlements', label: 'Settlements' },
  { key: 'groups', label: 'Groups' },
];

function matchesFilter(e: AuthExpense, filter: FilterKey): boolean {
  switch (filter) {
    case 'expenses':
      return e.splitType !== 'SETTLEMENT';
    case 'settlements':
      return e.splitType === 'SETTLEMENT';
    case 'groups':
      return e.groupId !== null;
    default:
      return true;
  }
}

interface FeedData {
  meId: string;
  groupNameById: Map<string, string>;
  expenses: AuthExpense[];
  hasMore: boolean;
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<FeedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setData(null);
    Promise.all([me(), listGroups(), listExpenses({ limit: PAGE_SIZE })])
      .then(([profile, groups, expenses]) => {
        setData({
          meId: profile.id,
          groupNameById: new Map(groups.map((g) => [g.id, g.name])),
          expenses,
          hasMore: expenses.length === PAGE_SIZE,
        });
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your activity.');
      });
  };

  useEffect(load, []);

  const loadMore = () => {
    if (!data || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setMoreError(null);
    listExpenses({ limit: PAGE_SIZE, offset: data.expenses.length })
      .then((next) => {
        setData((prev) =>
          prev
            ? {
                ...prev,
                expenses: [...prev.expenses, ...next],
                hasMore: next.length === PAGE_SIZE,
              }
            : prev,
        );
      })
      .catch((err) => {
        setMoreError(err instanceof ApiError ? err.message : 'Could not load more activity.');
      })
      .finally(() => setLoadingMore(false));
  };

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const q = query.trim().toLowerCase();
  const rows = data.expenses
    .filter((e) => matchesFilter(e, filter))
    .map((e) => ({ id: e.id, ...toActivityDisplay(e, data.meId, data.groupNameById) }))
    .filter((a) => !q || a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q));

  return (
    <div className="fade-in hide-scroll px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <h2
        className="font-display mb-5 text-[1.5rem] font-extrabold tracking-tighter"
        style={{ color: 'var(--t-primary)' }}
      >
        Activity
      </h2>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--t-dim)' }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search activity"
          className="neo-input pl-10"
        />
      </div>

      {/* Filter tabs */}
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
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title={data.expenses.length === 0 ? 'No activity yet' : 'No activity found'}
          description={
            data.expenses.length === 0
              ? 'Expenses and settlements you are part of will show up here.'
              : 'Try a different filter or search term.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((a) => (
            <ActivityItem
              key={a.id}
              category={a.category}
              title={a.title}
              sub={a.sub}
              amount={a.amount}
              dir={a.dir}
              time={a.time}
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
