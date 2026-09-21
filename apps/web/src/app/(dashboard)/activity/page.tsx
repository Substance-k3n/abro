'use client';

// DASH-02 Activity Feed — docs/ABRO_FRONTEND_SPEC.md §3 (lines 283-335).
// Ported from the prototype's ActivityScreen (App.tsx:1778): title, filter
// tabs (neo-tab/.active), neo-raised-sm feed rows. Deviations/assumptions:
//  - Filter modal/sheet and date-range filter (spec's filter list) are
//    replaced with inline `.neo-tab` pills (All/Expenses/Settlements/
//    Groups), matching the prototype; date-range is dropped entirely --
//    the mock data's `time` field ("2h ago", "Mon") has no real dates to
//    range over, so a picker would have nothing to filter against.
//  - Search bar is a plain `.neo-input` doing case-insensitive substring
//    matching against `title`/`sub`, no separate search-icon toggle state
//    (spec just says "search icon"; always-visible is simpler and the
//    prototype has no search at all on this screen to match against).
//  - Infinite scroll + loading skeleton are deferred: ACTIVITIES is a
//    small fixed mock array, nothing to paginate yet. Phase 8 (real API)
//    is when this needs real pagination states.
//  - Filter heuristic (Assumption, pending a real `type` field on the
//    API-backed model): ACTIVITIES already carries `type: 'expense' |
//    'settlement'` in mock-data.ts, so Expenses/Settlements filter on
//    that directly. There's no field distinguishing "group activity"
//    (group created/member joined/recurring-in-group, per spec's item
//    list) from person-to-person activity, so Groups infers membership
//    by checking whether `sub` names a known group (GROUPS[].name) --
//    the prototype's own Groups tab has the same gap and silently
//    reuses the Expenses filter instead; this is closer to spec intent.

import { ActivityItem, EmptyState } from '@abro/ui';
import { Receipt, Search } from 'lucide-react';
import { useState } from 'react';

import { ACTIVITIES, GROUPS } from '~/lib/mock-data';

type FilterKey = 'all' | 'expenses' | 'settlements' | 'groups';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'settlements', label: 'Settlements' },
  { key: 'groups', label: 'Groups' },
];

export default function ActivityPage() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const filtered = ACTIVITIES.filter((a) => {
    if (filter === 'expenses' && a.type !== 'expense') {
      return false;
    }
    if (filter === 'settlements' && a.type !== 'settlement') {
      return false;
    }
    if (filter === 'groups' && !GROUPS.some((g) => a.sub.includes(g.name))) {
      return false;
    }
    if (q && !a.title.toLowerCase().includes(q) && !a.sub.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  return (
    <div className="fade-in hide-scroll px-5 py-6 md:px-8 md:py-8">
      <h2
        className="font-display mb-5 text-[1.5rem] font-extrabold tracking-tighter"
        style={{ color: 'var(--t-primary)' }}
      >
        Activity
      </h2>

      {/* Search */}
      <div className="relative mb-4 max-w-xl">
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
      <div className="neo-inset-sm hide-scroll mb-5 flex max-w-xl gap-1 overflow-x-auto rounded-[14px] p-1">
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

      {/* Feed. Infinite scroll + loading skeleton deferred -- see header
          comment; mock data is a small fixed array with nothing to page. */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title="No activity found"
          description="Try a different filter or search term."
        />
      ) : (
        <div className="flex max-w-xl flex-col gap-2.5">
          {filtered.map((a) => (
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
    </div>
  );
}
