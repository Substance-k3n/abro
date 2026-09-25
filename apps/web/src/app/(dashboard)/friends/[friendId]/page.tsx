'use client';

// DASH-04 Friend Detail -- docs/ABRO_FRONTEND_SPEC.md §3 (lines 383-436).
//
// Phase 8 (docs/WIRING_PLAN.md), slice 4: rewired from ~/lib/mock-data.ts
// to real apps/api calls, replacing the old mock-only "does the activity
// text mention this friend's first name" heuristic with a real relation:
//  - Friend + balance: GET /friends/ + GET /balances/summary via the same
//    deriveFriendRows() Friends/Balances/Home use (so the sign convention
//    goes through friendOweSplit() like everywhere else). apps/api has no
//    GET /friends/{id}; an id not in the list is "Friend not found".
//  - History: GET /expenses?friendId= -- personal (non-group) expenses
//    both of you are party to, which is exactly what the pairwise balance
//    above is computed from (apps/api/queries/balances.sql's personal
//    scope), so the list and the number reconcile. Group expenses with
//    this friend are deliberately absent from both -- they live in each
//    group's own balance. Tabs split on splitType SETTLEMENT (ADR-003).
//  - One request of up to HISTORY_LIMIT rows (apps/api's max page size),
//    no pagination UI yet -- a personal history with one friend past 100
//    rows is well beyond MVP usage; the Activity screen pages if needed.
//  - Rows are not clickable (EXP-09 still mock-only), same as Home and
//    Activity. "Settle Up"/"Add expense" still hand off to the mock
//    settle/expense flows until their own slices -- /settle with an
//    unknown friendId falls back to its own friend picker, not a crash.
//
// Balance section: built as a custom card (mirroring the prototype's
// FriendDetailScreen, App.tsx:2098) rather than reusing `BalanceCard` from
// @abro/ui. BalanceCard's shape (net + owed/owe split progress bar + both
// breakdown lines) is designed for an aggregate, multi-friend balance;
// for a single friend there's only ever one meaningful direction, and
// forcing the split-bar/two-line layout onto a value that's zero on one
// side would be confusing rather than simplifying anything. A plain
// avatar + name + direction + big amount card maps onto the spec's "large
// balance display, direction, amount" more directly.
//
// Header "•••" more menu: deferred -- the spec doesn't define what it
// contains beyond actions already covered below (settle up, add expense,
// remove friend), so a menu with no unique content isn't worth building
// yet.

import type { MinorUnits } from '@abro/types';
import { ActivityItem, Avatar, BackButton, EmptyState, MoneyDisplay } from '@abro/ui';
import { Plus, Receipt, UserX, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { me } from '~/lib/auth-api';
import { type FriendRow, deriveFriendRows, getBalancesSummary } from '~/lib/balances-api';
import { type ActivityDisplay, listExpenses, toActivityDisplay } from '~/lib/expenses-api';
import { listFriends } from '~/lib/friends-api';

/** apps/api's GET /expenses max `limit` -- see header comment. */
const HISTORY_LIMIT = 100;

type HistoryRow = ActivityDisplay & { id: string; isSettlement: boolean };

interface FriendDetailData {
  /** Null when this id isn't one of your friends. */
  friend: FriendRow | null;
  history: HistoryRow[];
}

type Tab = 'expenses' | 'settlements';

export default function FriendDetailPage() {
  const params = useParams<{ friendId: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('expenses');

  const [data, setData] = useState<FriendDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setData(null);
    Promise.all([
      me(),
      listFriends(),
      getBalancesSummary(),
      listExpenses({ friendId: params.friendId, limit: HISTORY_LIMIT }),
    ])
      .then(([profile, friends, balances, expenses]) => {
        const friend = deriveFriendRows(friends, balances).find((f) => f.id === params.friendId);
        setData({
          friend: friend ?? null,
          history: expenses.map((e) => ({
            id: e.id,
            isSettlement: e.splitType === 'SETTLEMENT',
            // Personal expenses only (see header), so no group names needed.
            ...toActivityDisplay(e, profile.id, new Map()),
          })),
        });
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load this friend.');
      });
  };

  useEffect(load, [params.friendId]);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const { friend } = data;

  if (!friend) {
    return (
      <div className="fade-in px-5 py-6 md:px-8 md:py-8">
        <BackButton onBack={() => router.push('/friends')} />
        <EmptyState
          icon={<UserX size={26} strokeWidth={1.5} />}
          title="Friend not found"
          description="This friend doesn't exist, or the link may be out of date."
        />
      </div>
    );
  }

  // Positive: they owe you. Negative: you owe them. Zero: settled up.
  const balance: MinorUnits = friend.owes - friend.iOwe;
  const absBalance = balance < 0n ? -balance : balance;

  const expenses = data.history.filter((a) => !a.isSettlement);
  const settlements = data.history.filter((a) => a.isSettlement);
  const shown = tab === 'expenses' ? expenses : settlements;

  return (
    <div className="fade-in px-5 py-6 md:px-8 md:py-8">
      <BackButton onBack={() => router.push('/friends')} label="Friends" />

      <div className="mx-auto max-w-md">
        {/* Balance card */}
        <div className="neo-raised-lg mb-5 rounded-3xl p-5 text-center">
          <Avatar
            initials={friend.initials}
            color={friend.color}
            size={60}
            className="mx-auto mb-3"
          />
          <h2
            className="font-display mb-1 text-[1.2rem] font-bold tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            {friend.name}
          </h2>
          <p className="mb-4 text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
            {balance === 0n ? 'all settled up' : balance > 0n ? 'owes you' : 'you owe'}
          </p>
          <MoneyDisplay
            amount={absBalance}
            className="font-display mb-4 block text-[2rem] font-extrabold tracking-tighter"
            style={{ color: balance < 0n ? 'var(--c-red)' : 'var(--c-green)' }}
          />
          {/* Only shown when you owe them: apps/api/internal/settlements/
              service.go only lets the debtor record a settlement (ADR-003),
              so "they owe you" has no valid settle action from this
              session -- see settle/page.tsx's header comment. */}
          {balance < 0n && (
            <Link
              href={`/settle?friendId=${friend.id}`}
              className="neo-btn-green font-display inline-block rounded-2xl px-7 py-3 text-[0.9rem] font-semibold"
            >
              Settle Up
            </Link>
          )}
        </div>

        {/* Tabs */}
        <div className="neo-inset-sm mb-4 flex gap-1 rounded-2xl p-1">
          {(['expenses', 'settlements'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`neo-tab flex-1 rounded-xl border-none py-2 text-[0.82rem] font-medium capitalize ${
                tab === t ? 'active' : ''
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mb-6 flex flex-col gap-2.5">
          {shown.length === 0 ? (
            <EmptyState
              icon={<Receipt size={26} strokeWidth={1.5} />}
              title={tab === 'expenses' ? 'No shared expenses' : 'No settlements yet'}
              description={
                tab === 'expenses'
                  ? `You and ${friend.name} have no personal expenses yet.`
                  : `You and ${friend.name} haven't settled up yet.`
              }
            />
          ) : (
            shown.map((a) => (
              <ActivityItem
                key={a.id}
                category={a.category}
                title={a.title}
                sub={a.sub}
                amount={a.amount}
                dir={a.dir}
                time={a.time}
              />
            ))
          )}
        </div>

        {/* Actions -- spec's bottom action sheet, simplified to inline
            buttons/links per task instructions. */}
        <div className="flex flex-col gap-2.5">
          <Link
            href={`/expenses/new?friendId=${friend.id}`}
            className="neo-btn flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[0.85rem] font-medium"
            style={{ color: 'var(--t-secondary)' }}
          >
            <Plus size={17} strokeWidth={1.9} /> Add expense with {friend.name.split(' ')[0]}
          </Link>
          <Link
            href={`/activity?friendId=${friend.id}`}
            className="neo-btn flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[0.85rem] font-medium"
            style={{ color: 'var(--t-secondary)' }}
          >
            <Wallet size={17} strokeWidth={1.9} /> View all-time spending
          </Link>
          {/* Remove friend: destructive, deferred pending a confirm-dialog
              pattern and a real DELETE /friends/:id endpoint. Wiring this
              against mock data with no confirmation step would just quietly
              do nothing (or worse, mutate module-level mock state) --
              being upfront that it's not built yet is the honest option. */}
          <button
            type="button"
            disabled
            title="Coming soon"
            className="flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-[0.85rem] font-medium opacity-50"
            style={{ color: 'var(--c-red)', borderColor: 'var(--c-red)' }}
          >
            <UserX size={17} strokeWidth={1.9} /> Remove friend
          </button>
        </div>
      </div>
    </div>
  );
}
