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
//  - Rows open the expense's detail page (EXP-09), same as Home and
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
// Overdue debts (ADR-023): under the amount, how long it's been owed
// (GET /balances/friends/{id}'s owingSince) and an "Overdue" tag past
// 30 days. When they owe you, a Remind button next to "They paid me"
// (POST /friends/{id}/remind, once per 24 hours -- the daily job's
// automatic reminders count too, so it shows "Reminded · again in 5h").
//
// Header "•••" more menu: deferred -- the spec doesn't define what it
// contains beyond actions already covered below (settle up, add expense,
// remove friend), so a menu with no unique content isn't worth building
// yet.

import type { MinorUnits } from '@abro/types';
import { ActivityItem, Avatar, BackButton, EmptyState, MoneyDisplay } from '@abro/ui';
import { BellRing, Clock, Plus, Receipt, UserX, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { OverdueTag, formatSince } from '~/components/OverdueTag';
import { ApiError } from '~/lib/api-client';
import { me } from '~/lib/auth-api';
import {
  type FriendRow,
  debtAge,
  deriveFriendRows,
  getBalancesSummary,
  getFriendBalance,
} from '~/lib/balances-api';
import { type ActivityDisplay, listExpenses, toActivityDisplay } from '~/lib/expenses-api';
import { listFriends } from '~/lib/friends-api';
import { shortDuration } from '~/lib/group-admin-api';
import { type FriendReminder, getFriendReminder, remindFriend } from '~/lib/reminders-api';
import { useApiRefresh } from '~/lib/use-api-refresh';

/** apps/api's GET /expenses max `limit` -- see header comment. */
const HISTORY_LIMIT = 100;

type HistoryRow = ActivityDisplay & { id: string; isSettlement: boolean };

interface FriendDetailData {
  /** Null when this id isn't one of your friends. */
  friend: FriendRow | null;
  history: HistoryRow[];
  /** When the debt either way started (ADR-023); undefined when settled. */
  owingSince: string | undefined;
  /** The latest reminder they got for what they owe you. */
  reminder: FriendReminder | null;
}

type Tab = 'expenses' | 'settlements';

export default function FriendDetailPage() {
  const params = useParams<{ friendId: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('expenses');

  const [data, setData] = useState<FriendDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [remindResult, setRemindResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      me(),
      listFriends(),
      getBalancesSummary(),
      listExpenses({ friendId: params.friendId, limit: HISTORY_LIMIT }),
      // Extras: the page still works without them.
      getFriendBalance(params.friendId).catch(() => null),
      getFriendReminder(params.friendId).catch(() => null),
    ])
      .then(([profile, friends, balances, expenses, balance, reminder]) => {
        const friend = deriveFriendRows(friends, balances).find((f) => f.id === params.friendId);
        setData({
          friend: friend ?? null,
          owingSince: balance?.owingSince,
          reminder,
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

  useApiRefresh(load);

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
  const age = balance !== 0n && data.owingSince ? debtAge(data.owingSince) : null;
  const now = Date.now();
  const remindAllowedAt = data.reminder ? Date.parse(data.reminder.nextAllowedAt) : 0;

  const remind = async () => {
    setReminding(true);
    setRemindResult(null);
    try {
      const reminder = await remindFriend(friend.id);
      setData({ ...data, reminder });
      setRemindResult({ ok: true, text: `Reminder sent to ${friend.name.split(' ')[0]}.` });
    } catch (err) {
      setRemindResult({
        ok: false,
        text: err instanceof ApiError ? err.message : 'Could not send the reminder.',
      });
    }
    setReminding(false);
  };

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
            src={friend.photo}
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
            className={`font-display block text-[2rem] font-extrabold tracking-tighter ${age ? 'mb-1.5' : 'mb-4'}`}
            style={{ color: balance < 0n ? 'var(--c-red)' : 'var(--c-green)' }}
          />
          {age && data.owingSince && (
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
                since {formatSince(data.owingSince)}
                {/* The Overdue tag carries the count once it's overdue. */}
                {age.days > 0 && !age.overdue && ` · ${age.days} day${age.days === 1 ? '' : 's'}`}
              </span>
              <OverdueTag owingSince={data.owingSince} />
            </div>
          )}
          {/* You owe them: settle up (they confirm it, ADR-019). */}
          {balance < 0n && (
            <Link
              href={`/settle?friendId=${friend.id}`}
              className="neo-btn-green font-display inline-block rounded-2xl px-7 py-3 text-[0.9rem] font-semibold"
            >
              Settle Up
            </Link>
          )}
          {/* They owe you: record a payment you received (ADR-019), or
              remind them (ADR-023). */}
          {balance > 0n && (
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Link
                href={`/payments/received?fromUserId=${friend.id}`}
                className="neo-btn-green font-display inline-block rounded-2xl px-7 py-3 text-[0.9rem] font-semibold"
              >
                They paid me
              </Link>
              {remindAllowedAt > now ? (
                <span
                  className="flex items-center gap-1 px-2 text-[0.75rem] font-medium"
                  style={{ color: 'var(--t-dim)' }}
                  title={`You can remind them again in ${shortDuration(remindAllowedAt - now)}.`}
                >
                  <Clock size={13} strokeWidth={2} />
                  {data.reminder?.automatic ? 'Auto-reminded' : 'Reminded'} · again in{' '}
                  {shortDuration(remindAllowedAt - now)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={remind}
                  disabled={reminding}
                  className="neo-btn font-display flex items-center gap-1.5 rounded-2xl px-5 py-3 text-[0.9rem] font-semibold disabled:opacity-50"
                  style={{ color: 'var(--accent)' }}
                >
                  <BellRing size={16} strokeWidth={2} />
                  {reminding ? 'Sending…' : 'Remind'}
                </button>
              )}
            </div>
          )}
          {remindResult && (
            <p
              role={remindResult.ok ? 'status' : 'alert'}
              className="mt-3 text-[0.78rem] font-medium"
              style={{ color: remindResult.ok ? 'var(--c-green-text)' : 'var(--c-red)' }}
            >
              {remindResult.text}
            </p>
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
                onClick={() => router.push(`/expenses/${a.id}`)}
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
