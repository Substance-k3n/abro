'use client';

// DASH-08 Global Search — docs/ABRO_FRONTEND_SPEC.md §3 (lines 572-617):
// """
// Purpose: Global search across all content
// Route: /search
//
// Header:
//   - Back button
//   - Search input (auto-focused)
//
// Search Categories:
//   - Expenses
//   - Friends
//   - Groups
//   - Settlements
//
// Results (tabbed):
//   - All (mixed results)
//   - Expenses
//   - People
//   - Groups
//
// Each Result Type Shows:
//   - Expense: name, date, amount, participants
//   - Person: name, avatar, balance
//   - Group: name, type, member count
//
// Components:
//   - Search input
//   - Tab navigation
//   - Result list items
//   - Empty state ("No results")
//   - Recent searches
//   - Suggestions
//
// Interactions:
//   - Type to search
//   - Switch tabs
//   - Tap result → Detail view
//   - Clear search
//
// State:
//   - Search query
//   - Results
//   - Active tab
//   - Loading state
//   - Recent searches
// """
//
// No prototype reference exists for this screen -- the Figma Make
// prototype's App.tsx never implements a search screen, so this was
// designed fresh, matching the neomorphic visual language the other
// DASH screens established (neo-raised-sm rows, neo-tab pills,
// EmptyState, SectionLabel).
//
// Deviations/assumptions (mock-data-driven, same reasoning pattern as
// Activity's and Friends' header comments):
//  - Settlements search category is omitted: there's no dedicated
//    settlement mock array/shape/detail-route to search into or link
//    out to (ACTIVITIES carries a couple of `type: 'settlement'` rows,
//    but the spec treats Settlements as its own top-level category
//    alongside Expenses, not a filter on the expense feed). Deferred
//    until a real Settlement model exists.
//  - Recent searches / Suggestions are omitted from the empty-query
//    state: both need a persistence layer (localStorage at minimum, or
//    a real API) that doesn't exist yet -- out of scope for a
//    mock-data screen. A neutral prompt is shown instead.
//  - Loading state is skipped: search runs synchronously over small
//    in-memory arrays, nothing to await.
//  - Expenses: ACTIVITIES stands in for search purposes -- `title`/`sub`
//    are matched and rendered via ActivityItem, the same substitution
//    Home/Activity already make. Rows whose `type` is `'expense'` link
//    to `/expenses/[id]` (EXP-09, added in Phase 4's last PR); a
//    `'settlement'` row still links to `/activity` since there's no
//    settlement detail route.
//  - People: matched across both `FRIENDS` (has a real balance, shown
//    via MoneyDisplay per spec) and `SEARCH_RESULTS` (a `SearchPerson`
//    shape with no balance field -- these read as non-friend people
//    discoverable by search, so their row shows `@username` in place of
//    a balance). Both link to `/friends/[id]`, not yet a built route
//    (same deferred-route pattern Friends'/Groups' list pages already
//    use for their own links).
//  - PersonRow/ActivityItem render as <button>s, so their result rows
//    navigate via onClick + router.push rather than being wrapped in a
//    Link (which would nest a button inside an anchor).
//  - "All" tab caps each category to ALL_TAB_CAP results so the mixed
//    view stays scannable; the per-category tabs (Expenses/People/
//    Groups) show every match.

import {
  ActivityItem,
  BackButton,
  EmptyState,
  GroupIcon,
  MoneyDisplay,
  PersonRow,
  SectionLabel,
} from '@abro/ui';
import { Search as SearchIcon, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  ACTIVITIES,
  type Activity,
  FRIENDS,
  type Friend,
  GROUPS,
  type Group,
  SEARCH_RESULTS,
  type SearchPerson,
} from '~/lib/mock-data';

type TabKey = 'all' | 'expenses' | 'people' | 'groups';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'people', label: 'People' },
  { key: 'groups', label: 'Groups' },
];

/** How many results per category the "All" tab shows before capping --
 * see header comment. */
const ALL_TAB_CAP = 3;

type PersonResult = { kind: 'friend'; data: Friend } | { kind: 'searchPerson'; data: SearchPerson };

/** A friend's net balance (`owes` minus `iOwe`), rendered the same way
 * Home/Groups color a signed balance -- green when they're owed,
 * red when owing, a neutral "Settled" label at zero. */
function FriendBalance({ friend }: { friend: Friend }) {
  const net = friend.owes - friend.iOwe;
  if (net === 0n) {
    return (
      <span className="text-[0.78rem] font-medium" style={{ color: 'var(--t-dim)' }}>
        Settled
      </span>
    );
  }
  return (
    <MoneyDisplay
      amount={net < 0n ? -net : net}
      className="font-mono text-sm font-semibold"
      style={{ color: net > 0n ? 'var(--c-green)' : 'var(--c-red)' }}
    />
  );
}

function PersonResultRow({ result }: { result: PersonResult }) {
  const router = useRouter();
  if (result.kind === 'friend') {
    const f = result.data;
    return (
      <PersonRow
        initials={f.initials}
        color={f.color}
        name={f.name}
        right={<FriendBalance friend={f} />}
        onClick={() => router.push(`/friends/${f.id}`)}
      />
    );
  }
  const p = result.data;
  return (
    <PersonRow
      initials={p.initials}
      color={p.color}
      name={p.name}
      right={
        <span className="text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
          {p.username}
        </span>
      }
      onClick={() => router.push(`/friends/${p.id}`)}
    />
  );
}

function GroupResultRow({ group }: { group: Group }) {
  return (
    <Link
      href={`/groups/${group.id}`}
      className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
        style={{ background: `${group.color}22`, color: group.color }}
      >
        <GroupIcon icon={group.icon} size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="mb-0.5 truncate text-[0.88rem] font-semibold"
          style={{ color: 'var(--t-primary)' }}
        >
          {group.name}
        </p>
        <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
          {group.type} · {group.members} members
        </p>
      </div>
    </Link>
  );
}

function ExpenseResultRow({ activity }: { activity: Activity }) {
  const router = useRouter();
  return (
    <ActivityItem
      category={activity.category}
      title={activity.title}
      sub={activity.sub}
      amount={activity.amount}
      dir={activity.dir}
      time={activity.time}
      onClick={() =>
        router.push(activity.type === 'expense' ? `/expenses/${activity.id}` : '/activity')
      }
    />
  );
}

export default function SearchPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabKey>('all');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const hasQuery = q.length > 0;

  const matchedFriends: PersonResult[] = hasQuery
    ? FRIENDS.filter((f) => f.name.toLowerCase().includes(q)).map((data) => ({
        kind: 'friend' as const,
        data,
      }))
    : [];
  const matchedSearchPeople: PersonResult[] = hasQuery
    ? SEARCH_RESULTS.filter((p) => p.name.toLowerCase().includes(q)).map((data) => ({
        kind: 'searchPerson' as const,
        data,
      }))
    : [];
  const matchedPeople = [...matchedFriends, ...matchedSearchPeople];

  const matchedGroups = hasQuery ? GROUPS.filter((g) => g.name.toLowerCase().includes(q)) : [];

  const matchedExpenses = hasQuery
    ? ACTIVITIES.filter((a) => a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q))
    : [];

  const totalMatches = matchedPeople.length + matchedGroups.length + matchedExpenses.length;
  const trimmedQuery = query.trim();

  return (
    <div className="fade-in hide-scroll px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      {/* Header */}
      <BackButton onBack={() => router.push('/home')} />
      <div className="relative mb-5">
        <SearchIcon
          size={17}
          strokeWidth={2}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--t-dim)' }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search friends, groups, and expenses"
          aria-label="Search"
          className="neo-input pl-11 pr-11"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-none bg-transparent"
            style={{ color: 'var(--t-dim)' }}
          >
            <X size={15} strokeWidth={2.25} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="neo-inset-sm hide-scroll mb-5 flex gap-1 overflow-x-auto rounded-[14px] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`neo-tab whitespace-nowrap border-none ${tab === t.key ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {!hasQuery ? (
        <EmptyState
          icon={<SearchIcon size={26} strokeWidth={1.5} />}
          title="Search ABRO"
          description="Find friends, groups, and expenses."
        />
      ) : totalMatches === 0 ? (
        <EmptyState
          icon={<SearchIcon size={26} strokeWidth={1.5} />}
          title="No results"
          description={`Nothing matches "${trimmedQuery}".`}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {tab === 'all' && (
            <>
              {matchedPeople.length > 0 && (
                <div>
                  <SectionLabel>People ({matchedPeople.length})</SectionLabel>
                  <div className="flex flex-col gap-2">
                    {matchedPeople.slice(0, ALL_TAB_CAP).map((r) => (
                      <PersonResultRow key={`${r.kind}-${r.data.id}`} result={r} />
                    ))}
                  </div>
                </div>
              )}
              {matchedGroups.length > 0 && (
                <div>
                  <SectionLabel>Groups ({matchedGroups.length})</SectionLabel>
                  <div className="flex flex-col gap-2">
                    {matchedGroups.slice(0, ALL_TAB_CAP).map((g) => (
                      <GroupResultRow key={g.id} group={g} />
                    ))}
                  </div>
                </div>
              )}
              {matchedExpenses.length > 0 && (
                <div>
                  <SectionLabel>Expenses ({matchedExpenses.length})</SectionLabel>
                  <div className="flex flex-col gap-2.5">
                    {matchedExpenses.slice(0, ALL_TAB_CAP).map((a) => (
                      <ExpenseResultRow key={a.id} activity={a} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'people' &&
            (matchedPeople.length > 0 ? (
              <div className="flex flex-col gap-2">
                {matchedPeople.map((r) => (
                  <PersonResultRow key={`${r.kind}-${r.data.id}`} result={r} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<SearchIcon size={26} strokeWidth={1.5} />}
                title="No results"
                description={`No people match "${trimmedQuery}".`}
              />
            ))}

          {tab === 'groups' &&
            (matchedGroups.length > 0 ? (
              <div className="flex flex-col gap-2">
                {matchedGroups.map((g) => (
                  <GroupResultRow key={g.id} group={g} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<SearchIcon size={26} strokeWidth={1.5} />}
                title="No results"
                description={`No groups match "${trimmedQuery}".`}
              />
            ))}

          {tab === 'expenses' &&
            (matchedExpenses.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {matchedExpenses.map((a) => (
                  <ExpenseResultRow key={a.id} activity={a} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<SearchIcon size={26} strokeWidth={1.5} />}
                title="No results"
                description={`No expenses match "${trimmedQuery}".`}
              />
            ))}
        </div>
      )}
    </div>
  );
}
