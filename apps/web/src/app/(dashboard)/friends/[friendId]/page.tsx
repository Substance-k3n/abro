'use client';

// DASH-04 Friend Detail -- docs/ABRO_FRONTEND_SPEC.md §3 (lines 383-436).
//
// Assumption (mock-data limitation): `Activity` in ~/lib/mock-data.ts has no
// `friendId` field, so there's no exact link from an activity to "this
// friend". Heuristic: an activity "belongs" to a friend if the friend's
// first name shows up in its `title` or `sub` text -- e.g. activity a2
// ("Abel settled up" / "Paid you directly") matches friend "Abel Tesfaye",
// a3 ("Uber to Bole" / "You & Hana Girma") matches "Hana Girma". This is a
// stand-in for a real relation: it will miss anything that doesn't happen
// to mention the friend by name (e.g. group expenses with generic subs)
// and, for friends never named in the small mock set (e.g. "Nesredin
// Haile", "Dawit Alemu"), it legitimately turns up nothing -- rendered as
// an honest empty state, not a bug. Phase 8's real API returns
// expenses/settlements scoped to a friend directly, removing the need for
// this heuristic entirely.
//
// Tab split: once an activity is matched to this friend via the heuristic
// above, the Expenses/Settlements tabs split on `Activity.type`
// ('expense' | 'settlement'), which mock-data.ts does carry as a real
// discriminant -- no need to guess further there. Because the matched
// subset is small and heuristic-derived, either tab can legitimately be
// empty for a given friend; that's a reflection of the small mock set, not
// missing settlement data.
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
import { useState } from 'react';

import { ACTIVITIES, type Activity, FRIENDS } from '~/lib/mock-data';

type Tab = 'expenses' | 'settlements';

/** See header comment: friendId-to-activity matching heuristic. */
function mentionsFriend(activity: Activity, friendName: string): boolean {
  const firstName = friendName.split(' ')[0]?.toLowerCase();
  if (!firstName) {
    return false;
  }
  return `${activity.title} ${activity.sub}`.toLowerCase().includes(firstName);
}

export default function FriendDetailPage() {
  const params = useParams<{ friendId: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('expenses');

  const friend = FRIENDS.find((f) => f.id === params.friendId);

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

  const friendActivity = ACTIVITIES.filter((a) => mentionsFriend(a, friend.name));
  const expenses = friendActivity.filter((a) => a.type === 'expense');
  const settlements = friendActivity.filter((a) => a.type === 'settlement');
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
          {balance !== 0n && (
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
                  ? `No expenses matched to ${friend.name} in the mock activity feed.`
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
                onClick={tab === 'expenses' ? () => router.push(`/expenses/${a.id}`) : undefined}
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
