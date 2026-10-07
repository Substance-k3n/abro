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
// Tabs (trial feedback 2026-10-07, replacing the spec's collapsed
// "Settled up" section): Unsettled (owe you / you owe), Settled, All.
// Opens on Unsettled when anyone has a balance, otherwise All.
//
// A friend row opens Friend Detail (`/friends/[friendId]`, DASH-04,
// real since slice 4).
//
// Friend requests: incoming PENDING requests (GET /friends/requests) are
// listed above the balance sections with Accept/Decline. Accepting
// reloads the whole page so the new friend appears with their (zero)
// balance from the same deriveFriendRows() path as everyone else.
//
// PersonRow (@abro/ui) renders as a <button>, so it navigates via its
// own `onClick` + router.push rather than being wrapped in a Link
// (which would nest a button inside an anchor).

import { AmountBadge, Avatar, EmptyState, PersonRow, SectionLabel } from '@abro/ui';
import { Check, Plus, Search, UserX, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { deriveFriendRows, getBalancesSummary } from '~/lib/balances-api';
import {
  type FriendListItem,
  type IncomingFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  listFriends,
  listIncomingRequests,
} from '~/lib/friends-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { photoSrc } from '~/lib/photos';

type FriendsTab = 'unsettled' | 'settled' | 'all';

const EMPTY_TITLES: Record<FriendsTab, string> = {
  unsettled: 'All settled up',
  settled: 'Nobody settled yet',
  all: 'No friends yet',
};

const EMPTY_DESCRIPTIONS: Record<FriendsTab, string> = {
  unsettled: "You don't owe anyone and nobody owes you.",
  settled: 'Friends you have no balance with show here.',
  all: 'Add a friend to start splitting expenses.',
};

export default function FriendsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [chosenTab, setTab] = useState<FriendsTab | null>(null);
  const [friends, setFriends] = useState<FriendListItem[] | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof deriveFriendRows> | null>(null);
  const [requests, setRequests] = useState<IncomingFriendRequest[]>([]);
  const [busyRequest, setBusyRequest] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setFriends(null);
    setRows(null);
    Promise.all([listFriends(), getBalancesSummary(), listIncomingRequests()])
      .then(([friendList, balances, incoming]) => {
        setRequests(incoming);
        setFriends(friendList);
        setRows(deriveFriendRows(friendList, balances));
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your friends.');
      });
  };

  useEffect(load, []);

  const respond = async (req: IncomingFriendRequest, accept: boolean) => {
    setBusyRequest(req.friendshipId);
    setRequestError(null);
    try {
      if (accept) {
        await acceptFriendRequest(req.friendshipId);
        load();
      } else {
        await declineFriendRequest(req.friendshipId);
        setRequests((rs) => rs.filter((r) => r.friendshipId !== req.friendshipId));
      }
    } catch (err) {
      setRequestError(
        err instanceof ApiError ? err.message : 'Could not update the request. Please try again.',
      );
    } finally {
      setBusyRequest(null);
    }
  };

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

  const unsettledCount = owedToYou.length + youOwe.length;
  // Until you pick a tab: Unsettled if anyone has a balance, else All.
  const tab: FriendsTab = chosenTab ?? (unsettledCount > 0 ? 'unsettled' : 'all');
  const showOwedToYou = tab !== 'settled';
  const showSettled = tab !== 'unsettled';
  const isEmpty = (showOwedToYou ? unsettledCount : 0) + (showSettled ? settled.length : 0) === 0;

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

      {requests.length > 0 && (
        <div className="mb-6">
          <SectionLabel>Friend requests ({requests.length})</SectionLabel>
          {requestError && (
            <p className="mb-2 text-[0.85rem]" role="alert" style={{ color: 'var(--c-red)' }}>
              {requestError}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {requests.map((r) => {
              const busy = busyRequest === r.friendshipId;
              return (
                <div
                  key={r.friendshipId}
                  className="neo-raised flex items-center gap-3 rounded-2xl px-4 py-3"
                >
                  <Avatar
                    initials={initialsOf(r.from.displayName)}
                    color={colorForId(r.from.id)}
                    size={40}
                    src={photoSrc(r.from.avatarUrl)}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[0.92rem] font-semibold"
                      style={{ color: 'var(--t-primary)' }}
                    >
                      {r.from.displayName}
                    </p>
                    <p className="truncate text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
                      wants to be friends
                    </p>
                  </div>
                  <button
                    onClick={() => respond(r, false)}
                    disabled={busy}
                    aria-label={`Decline ${r.from.displayName}`}
                    className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl disabled:opacity-60"
                  >
                    <X size={16} strokeWidth={2.25} style={{ color: 'var(--c-red)' }} />
                  </button>
                  <button
                    onClick={() => respond(r, true)}
                    disabled={busy}
                    aria-label={`Accept ${r.from.displayName}`}
                    className="neo-btn-green flex h-9 w-9 items-center justify-center rounded-xl disabled:opacity-60"
                  >
                    <Check size={16} strokeWidth={2.25} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="neo-inset-sm mb-5 flex max-w-md gap-1 rounded-2xl p-1" role="tablist">
        {(
          [
            ['unsettled', `Unsettled (${unsettledCount})`],
            ['settled', `Settled (${settled.length})`],
            ['all', 'All'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`neo-tab flex-1 rounded-xl border-none py-2 text-[0.8rem] font-medium ${
              tab === id ? 'active' : ''
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<UserX size={26} strokeWidth={1.5} />}
          title={search ? 'No friends found' : EMPTY_TITLES[tab]}
          description={
            search
              ? `No friends match "${search}".`
              : rows.length === 0
                ? 'Add a friend to start splitting expenses.'
                : EMPTY_DESCRIPTIONS[tab]
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {showOwedToYou && owedToYou.length > 0 && (
            <div>
              <SectionLabel>People who owe you</SectionLabel>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {owedToYou.map((f) => (
                  <PersonRow
                    key={f.id}
                    initials={f.initials}
                    photo={f.photo}
                    color={f.color}
                    name={f.name}
                    right={<AmountBadge amount={f.owes} dir="receive" />}
                    onClick={() => router.push(`/friends/${f.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {showOwedToYou && youOwe.length > 0 && (
            <div>
              <SectionLabel>People you owe</SectionLabel>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {youOwe.map((f) => (
                  <PersonRow
                    key={f.id}
                    initials={f.initials}
                    photo={f.photo}
                    color={f.color}
                    name={f.name}
                    right={<AmountBadge amount={f.iOwe} dir="owe" />}
                    onClick={() => router.push(`/friends/${f.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {showSettled && settled.length > 0 && (
            <div>
              <SectionLabel>Settled up</SectionLabel>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {settled.map((f) => (
                  <PersonRow
                    key={f.id}
                    initials={f.initials}
                    photo={f.photo}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
