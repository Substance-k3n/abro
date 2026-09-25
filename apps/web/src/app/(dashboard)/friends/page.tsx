'use client';

// DASH-03 Friends List — docs/ABRO_FRONTEND_SPEC.md §3 (lines 337-381).
// Ported the prototype's FriendsScreen (App.tsx:1937) for the two
// balance sections' visual language, and its separate
// FriendsManageScreen (App.tsx:4415) for the search bar + "settled up"
// section that FriendsScreen itself lacks -- the spec requires both,
// and FriendsManageScreen already had the pattern (there collapsed
// behind a "Manage friends" entry point; here collapsed by default via
// local state per the spec's explicit "collapsed by default").
//
// Phase 8 (docs/WIRING_PLAN.md) rewiring: real GET /friends/ + the
// GET /balances/summary this app's Home (DASH-01) slice already added,
// combined via ~/lib/balances-api.ts's deriveFriendRows() -- the exact
// same helper Home uses, so the two screens can't disagree about a
// friend's balance. "Settled up" (spec's third section) is new here --
// Home never needed it (it hides zero-balance friends entirely) --
// derived as `owes === 0n && iOwe === 0n`.
//
// Deviation (Confirmed): a friend row still navigates to
// `/friends/[friendId]`, which is still mock-data-only until Friend
// Detail (DASH-04) is wired in a later slice -- clicking through with a
// real friend id will land on that page's own "not found" state until
// then. Same class of temporary rough edge as Home's Recent Activity
// rows, which have the equivalent gap against `/expenses/[id]`.
//
// PersonRow (@abro/ui) renders as a <button>, so it navigates via its
// own `onClick` + router.push rather than being wrapped in a Link
// (which would nest a button inside an anchor).

import { AmountBadge, EmptyState, PersonRow, SectionLabel } from '@abro/ui';
import { ChevronDown, ChevronUp, Plus, Search, UserX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { deriveFriendRows, getBalancesSummary } from '~/lib/balances-api';
import { type FriendListItem, listFriends } from '~/lib/friends-api';

export default function FriendsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [settledOpen, setSettledOpen] = useState(false);
  const [friends, setFriends] = useState<FriendListItem[] | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof deriveFriendRows> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setFriends(null);
    setRows(null);
    Promise.all([listFriends(), getBalancesSummary()])
      .then(([friendList, balances]) => {
        setFriends(friendList);
        setRows(deriveFriendRows(friendList, balances));
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your friends.');
      });
  };

  useEffect(load, []);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!friends || !rows) {
    return <LoadingState />;
  }

  const query = search.trim().toLowerCase();
  const filtered = query ? rows.filter((f) => f.name.toLowerCase().includes(query)) : rows;

  const owedToYou = filtered.filter((f) => f.owes > 0n);
  const youOwe = filtered.filter((f) => f.iOwe > 0n);
  const settled = filtered.filter((f) => f.owes === 0n && f.iOwe === 0n);

  const isEmpty = owedToYou.length === 0 && youOwe.length === 0 && settled.length === 0;

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-4xl md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h2
          className="font-display text-[1.5rem] font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          Friends
        </h2>
        <Link
          href="/friends/add"
          className="neo-btn-accent font-display flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold"
        >
          <Plus size={16} strokeWidth={2.25} />
          Add Friend
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search
          size={17}
          strokeWidth={2}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--t-dim)' }}
        />
        <input
          type="search"
          className="neo-input pl-11"
          placeholder="Search friends…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search friends"
        />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<UserX size={26} strokeWidth={1.5} />}
          title="No friends found"
          description={
            search ? `No friends match "${search}".` : 'Add a friend to start splitting expenses.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {owedToYou.length > 0 && (
            <div>
              <SectionLabel>People who owe you</SectionLabel>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {owedToYou.map((f) => (
                  <PersonRow
                    key={f.id}
                    initials={f.initials}
                    color={f.color}
                    name={f.name}
                    right={<AmountBadge amount={f.owes} dir="receive" />}
                    onClick={() => router.push(`/friends/${f.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {youOwe.length > 0 && (
            <div>
              <SectionLabel>People you owe</SectionLabel>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {youOwe.map((f) => (
                  <PersonRow
                    key={f.id}
                    initials={f.initials}
                    color={f.color}
                    name={f.name}
                    right={<AmountBadge amount={f.iOwe} dir="owe" />}
                    onClick={() => router.push(`/friends/${f.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {settled.length > 0 && (
            <div>
              <button
                onClick={() => setSettledOpen((v) => !v)}
                className="mb-2 flex w-full items-center justify-between pl-1 pr-1"
              >
                <span
                  className="text-[0.72rem] font-bold uppercase tracking-[0.09em]"
                  style={{ color: 'var(--t-dim)' }}
                >
                  Settled up ({settled.length})
                </span>
                {settledOpen ? (
                  <ChevronUp size={16} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
                ) : (
                  <ChevronDown size={16} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
                )}
              </button>
              {settledOpen && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {settled.map((f) => (
                    <PersonRow
                      key={f.id}
                      initials={f.initials}
                      color={f.color}
                      name={f.name}
                      right={
                        <span
                          className="text-[0.78rem] font-medium"
                          style={{ color: 'var(--t-dim)' }}
                        >
                          Settled
                        </span>
                      }
                      onClick={() => router.push(`/friends/${f.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
