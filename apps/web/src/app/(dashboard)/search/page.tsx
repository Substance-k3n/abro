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
// Phase 8 (docs/WIRING_PLAN.md), slice 5: rewired from ~/lib/mock-data.ts
// to real apps/api data. Deviations/assumptions (Confirmed):
//  - People = your friends only, matched client-side by name, with their
//    real balance (deriveFriendRows()). Non-friends are deliberately not
//    searchable: apps/api's GET /friends/search is exact email/phone
//    match by design ("so you can't browse the user directory") --
//    adding someone new stays the Add Friend screen's job.
//  - Groups = your groups, matched client-side by name (a user's group
//    list is small), showing type + real member count (GET /groups/'s
//    memberCount).
//  - Expenses = server-side GET /expenses?q= (name/category/notes,
//    across everything you can see -- not just a loaded page),
//    debounced SEARCH_DEBOUNCE_MS, first EXPENSE_LIMIT matches. The
//    spec's separate Settlements category is covered here: settlements
//    are expense rows named "Settlement" (ADR-003), so "settle" finds
//    them. Out-of-order responses are dropped (only the latest query's
//    result is applied).
//  - Recent searches: last RECENT_MAX queries in localStorage (per
//    browser, best-effort -- storage errors are ignored), recorded when
//    you open a result or press Enter. Suggestions: not built (no data
//    source for them yet).
//  - Expense rows are not clickable (EXP-09 is still mock-only), same as
//    Home/Activity. Group rows link to GRP-03, still mock-only until the
//    groups slice (degrades to its own "Group not found" state).
//  - PersonRow/ActivityItem render as <button>s, so result rows navigate
//    via onClick + router.push rather than being wrapped in a Link.
//  - "All" tab caps each category to ALL_TAB_CAP results so the mixed
//    view stays scannable; the per-category tabs show every match.

import {
  ActivityItem,
  BackButton,
  EmptyState,
  GroupIcon,
  MoneyDisplay,
  PersonRow,
  SectionLabel,
} from '@abro/ui';
import { Clock, Search as SearchIcon, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { me } from '~/lib/auth-api';
import { type FriendRow, deriveFriendRows, getBalancesSummary } from '~/lib/balances-api';
import {
  type ActivityDisplay,
  type AuthExpense,
  listExpenses,
  toActivityDisplay,
} from '~/lib/expenses-api';
import { listFriends } from '~/lib/friends-api';
import { type GroupListItem, groupTypeFor, listGroups } from '~/lib/groups-api';

type TabKey = 'all' | 'expenses' | 'people' | 'groups';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'people', label: 'People' },
  { key: 'groups', label: 'Groups' },
];

/** How many results per category the "All" tab shows. */
const ALL_TAB_CAP = 3;
const SEARCH_DEBOUNCE_MS = 300;
/** Expense matches fetched per search -- see header comment. */
const EXPENSE_LIMIT = 30;
const RECENT_KEY = 'abro.recentSearches';
const RECENT_MAX = 5;

function loadRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable (private mode, blocked) -- recents just don't persist.
  }
}

interface BaseData {
  meId: string;
  friends: FriendRow[];
  groups: GroupListItem[];
  groupNameById: Map<string, string>;
}

type ExpenseRow = ActivityDisplay & { id: string };

/** A friend's net balance, colored the same way Home/Friends do -- green
 * when they owe you, red when you owe them, "Settled" at zero. */
function FriendBalance({ friend }: { friend: FriendRow }) {
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

function GroupResultRow({ group, onOpen }: { group: GroupListItem; onOpen: () => void }) {
  const type = groupTypeFor(group.type);
  return (
    <Link
      href={`/groups/${group.id}`}
      onClick={onOpen}
      className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
        style={{ background: `${type.color}22`, color: type.color }}
      >
        <GroupIcon icon={type.icon} size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="mb-0.5 truncate text-[0.88rem] font-semibold"
          style={{ color: 'var(--t-primary)' }}
        >
          {group.name}
        </p>
        <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
          {type.label} · {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
        </p>
      </div>
    </Link>
  );
}

function ExpenseResultRow({ row }: { row: ExpenseRow }) {
  return (
    <ActivityItem
      category={row.category}
      title={row.title}
      sub={row.sub}
      amount={row.amount}
      dir={row.dir}
      time={row.time}
    />
  );
}

function NoResults({ what, query }: { what: string; query: string }) {
  return (
    <EmptyState
      icon={<SearchIcon size={26} strokeWidth={1.5} />}
      title="No results"
      description={`No ${what} match "${query}".`}
    />
  );
}

export default function SearchPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [base, setBase] = useState<BaseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  // Expense search state -- `expensesFor` is the query the current
  // `expenses` belong to, so a slow older response can't overwrite a
  // newer one and "loading" is simply "results aren't for this query yet".
  const [expenses, setExpenses] = useState<AuthExpense[]>([]);
  const [expensesFor, setExpensesFor] = useState('');
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const latestQuery = useRef('');

  const load = () => {
    setError(null);
    setBase(null);
    Promise.all([me(), listFriends(), listGroups(), getBalancesSummary()])
      .then(([profile, friends, groups, balances]) => {
        setBase({
          meId: profile.id,
          friends: deriveFriendRows(friends, balances),
          groups,
          groupNameById: new Map(groups.map((g) => [g.id, g.name])),
        });
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load search.');
      });
  };

  useEffect(load, []);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [base]);

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  useEffect(() => {
    latestQuery.current = trimmed;
    setExpenseError(null);
    if (!trimmed) {
      setExpenses([]);
      setExpensesFor('');
      return;
    }
    const timer = setTimeout(() => {
      listExpenses({ search: trimmed, limit: EXPENSE_LIMIT })
        .then((rows) => {
          if (latestQuery.current === trimmed) {
            setExpenses(rows);
            setExpensesFor(trimmed);
          }
        })
        .catch((err) => {
          if (latestQuery.current === trimmed) {
            setExpenseError(err instanceof ApiError ? err.message : 'Could not search expenses.');
            setExpensesFor(trimmed);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const rememberQuery = () => {
    if (!trimmed) {
      return;
    }
    const next = [trimmed, ...recent.filter((r) => r.toLowerCase() !== q)].slice(0, RECENT_MAX);
    setRecent(next);
    saveRecent(next);
  };

  const clearRecent = () => {
    setRecent([]);
    saveRecent([]);
  };

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!base) {
    return <LoadingState />;
  }

  const hasQuery = q.length > 0;
  const matchedPeople = hasQuery
    ? base.friends.filter((f) => f.name.toLowerCase().includes(q))
    : [];
  const matchedGroups = hasQuery ? base.groups.filter((g) => g.name.toLowerCase().includes(q)) : [];
  const expensesLoading = hasQuery && expensesFor !== trimmed;
  const matchedExpenses: ExpenseRow[] = expensesLoading
    ? []
    : expenses.map((e) => ({ id: e.id, ...toActivityDisplay(e, base.meId, base.groupNameById) }));
  const expenseCountLabel =
    matchedExpenses.length === EXPENSE_LIMIT ? `${EXPENSE_LIMIT}+` : String(matchedExpenses.length);

  const totalMatches = matchedPeople.length + matchedGroups.length + matchedExpenses.length;

  const personRow = (f: FriendRow) => (
    <PersonRow
      key={f.id}
      initials={f.initials}
      color={f.color}
      name={f.name}
      right={<FriendBalance friend={f} />}
      onClick={() => {
        rememberQuery();
        router.push(`/friends/${f.id}`);
      }}
    />
  );

  const expenseStatus = expenseError ? (
    <p className="text-[0.8rem]" style={{ color: 'var(--c-red)' }}>
      {expenseError}
    </p>
  ) : expensesLoading ? (
    <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
      Searching expenses…
    </p>
  ) : null;

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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              rememberQuery();
            }
          }}
          placeholder="Search friends, groups, and expenses"
          aria-label="Search"
          maxLength={100}
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
        recent.length > 0 ? (
          <div>
            <div className="flex items-center justify-between">
              <SectionLabel>Recent searches</SectionLabel>
              <button
                onClick={clearRecent}
                className="border-none bg-transparent text-[0.75rem] font-medium"
                style={{ color: 'var(--accent)' }}
              >
                Clear
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {recent.map((r) => (
                <button
                  key={r}
                  onClick={() => setQuery(r)}
                  className="neo-raised-sm flex items-center gap-3 rounded-2xl border-none px-3.5 py-3 text-left text-[0.88rem]"
                  style={{ color: 'var(--t-secondary)' }}
                >
                  <Clock size={15} style={{ color: 'var(--t-dim)' }} />
                  {r}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<SearchIcon size={26} strokeWidth={1.5} />}
            title="Search ABRO"
            description="Find friends, groups, and expenses."
          />
        )
      ) : totalMatches === 0 && !expensesLoading && !expenseError ? (
        <EmptyState
          icon={<SearchIcon size={26} strokeWidth={1.5} />}
          title="No results"
          description={`Nothing matches "${trimmed}".`}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {tab === 'all' && (
            <>
              {matchedPeople.length > 0 && (
                <div>
                  <SectionLabel>People ({matchedPeople.length})</SectionLabel>
                  <div className="flex flex-col gap-2">
                    {matchedPeople.slice(0, ALL_TAB_CAP).map(personRow)}
                  </div>
                </div>
              )}
              {matchedGroups.length > 0 && (
                <div>
                  <SectionLabel>Groups ({matchedGroups.length})</SectionLabel>
                  <div className="flex flex-col gap-2">
                    {matchedGroups.slice(0, ALL_TAB_CAP).map((g) => (
                      <GroupResultRow key={g.id} group={g} onOpen={rememberQuery} />
                    ))}
                  </div>
                </div>
              )}
              {(matchedExpenses.length > 0 || expenseStatus) && (
                <div>
                  <SectionLabel>
                    Expenses{matchedExpenses.length > 0 ? ` (${expenseCountLabel})` : ''}
                  </SectionLabel>
                  <div className="flex flex-col gap-2.5">
                    {expenseStatus}
                    {matchedExpenses.slice(0, ALL_TAB_CAP).map((row) => (
                      <ExpenseResultRow key={row.id} row={row} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'people' &&
            (matchedPeople.length > 0 ? (
              <div className="flex flex-col gap-2">{matchedPeople.map(personRow)}</div>
            ) : (
              <NoResults what="people" query={trimmed} />
            ))}

          {tab === 'groups' &&
            (matchedGroups.length > 0 ? (
              <div className="flex flex-col gap-2">
                {matchedGroups.map((g) => (
                  <GroupResultRow key={g.id} group={g} onOpen={rememberQuery} />
                ))}
              </div>
            ) : (
              <NoResults what="groups" query={trimmed} />
            ))}

          {tab === 'expenses' &&
            (expenseStatus ??
              (matchedExpenses.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {matchedExpenses.map((row) => (
                    <ExpenseResultRow key={row.id} row={row} />
                  ))}
                  {matchedExpenses.length === EXPENSE_LIMIT && (
                    <p className="text-center text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
                      Showing the {EXPENSE_LIMIT} most recent matches. Refine your search to narrow
                      it down.
                    </p>
                  )}
                </div>
              ) : (
                <NoResults what="expenses" query={trimmed} />
              )))}
        </div>
      )}
    </div>
  );
}
