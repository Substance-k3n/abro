'use client';

// DASH-01 Home Dashboard — docs/ABRO_FRONTEND_SPEC.md §3 (lines 210-281).
// The prototype's HomeScreen (App.tsx:1370) diverges from the spec text
// here: it has no Quick Actions or Group Summary sections, combines
// "outstanding balances" into one filtered list instead of two, shows 3
// recent activity items instead of 5, and adds a SpendBarChart the spec
// never mentions. Followed the spec (the screen inventory's source of
// truth) for structure; kept the prototype's visual language (neo-card
// balance summary, neo-raised-sm rows) for styling. Dropped the spend
// chart -- Analytics is explicitly a post-MVP screen (§16), so a "View
// Analytics" CTA pointing nowhere isn't worth the chart's hover/touch/
// period-toggle complexity for this pass.
//
// Phase 8 (docs/WIRING_PLAN.md), slice 2: rewired from ~/lib/mock-data.ts
// to real apps/api calls -- the first dashboard screen to do so. Five
// parallel requests on mount (profile, friends, groups, the new
// GET /balances/summary, unread notifications, recent expenses) rather
// than one mock-data import; a real loading/error state is new here too
// (every mock-data screen before this was synchronous). This is the
// reference pattern later Phase 8 slices (Activity, Friends, Groups,
// Balances Overview) should follow, including ~/lib/balances-api.ts's
// friendOweSplit() for the friend/group balance sign-convention split.
//
// Deviations from the mock version (Confirmed):
//  - Group icon/color come from ~/lib/reference-data.ts's GROUP_TYPES
//    lookup table (client-side reference data, not mock *facts* -- see
//    that file's own header note) -- matched case-insensitively against
//    apps/api's UPPERCASE `type` enum values.
//  - Recent Activity rows open the expense's detail page (EXP-09, real
//    since slice 7b).
//  - Avatar color (yours and every friend's) is deterministically
//    derived from their id (~/lib/identity.ts), not stored -- no real
//    Profile field for it exists (AUTH-06/PRF-01's color picker is
//    cosmetic-only).

import { Avatar, EmptyState } from '@abro/ui';
import { Bell, Handshake, Plus, Receipt, Settings, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { InstallApp } from '~/components/InstallApp';
import { PushNotifications } from '~/components/PushNotifications';
import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { type AuthProfile, me } from '~/lib/auth-api';
import {
  type BalancesSummary,
  balanceTotals,
  deriveFriendRows,
  deriveGroupRows,
  getBalancesSummary,
} from '~/lib/balances-api';
import {
  type ActivityDisplay,
  type AuthExpense,
  listExpenses,
  toActivityDisplay,
} from '~/lib/expenses-api';
import { type FriendListItem, listFriends } from '~/lib/friends-api';
import { type AuthGroup, groupTypeFor, listGroups } from '~/lib/groups-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { listNotifications } from '~/lib/notifications-api';
import { photoSrc } from '~/lib/photos';
import { type SettlementRequest, listSettlementRequests } from '~/lib/settlements-api';
import { GroupPicture } from '~/components/GroupPicture';
import { ActivityRow } from '~/components/ActivityRow';
import {
  Amount,
  HeroBalance,
  Panel,
  Row,
  SectionHeader,
  Tile,
  greeting,
} from '~/components/refresh';
import { useApiRefresh } from '~/lib/use-api-refresh';

const SECONDARY_ACTIONS = [
  { label: 'Settle up', href: '/settle', icon: Handshake },
  { label: 'IOU', href: '/expenses/new?type=iou', icon: Receipt },
  { label: 'New group', href: '/groups/new', icon: Users },
];

interface HomeData {
  profile: AuthProfile;
  friends: FriendListItem[];
  groups: AuthGroup[];
  balances: BalancesSummary;
  unreadCount: number;
  recentActivity: AuthExpense[];
  /** Payments others say they made to you, waiting for you (ADR-019). */
  toConfirm: SettlementRequest[];
}

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      me(),
      listFriends(),
      listGroups(),
      getBalancesSummary(),
      listNotifications({ unreadOnly: true, limit: 100 }),
      listExpenses({ limit: 5 }),
      listSettlementRequests(),
    ])
      .then(([profile, friends, groups, balances, unread, recentActivity, requests]) => {
        setData({
          profile,
          friends,
          groups,
          balances,
          unreadCount: unread.length,
          recentActivity,
          toConfirm: requests.filter(
            (r) => r.status === 'PENDING' && r.recipient.id === profile.id,
          ),
        });
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your dashboard. Please try again.',
        );
      });
  };

  useEffect(load, []);

  useApiRefresh(load);

  if (error) {
    return <ErrorState message={error} onRetry={load} minHeight="60vh" />;
  }
  if (!data) {
    return <LoadingState minHeight="60vh" />;
  }

  const { profile, friends, groups, balances, unreadCount, recentActivity, toConfirm } = data;
  const toConfirmTotal = toConfirm.reduce((sum, r) => sum + BigInt(r.amount), 0n);
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

  const friendRows = deriveFriendRows(friends, balances);
  const groupRows = deriveGroupRows(groups, balances).map((g) => ({
    ...g,
    groupType: groupTypeFor(g.type),
  }));
  // Friends + groups -- the same overall position Balances (DASH-06) shows.
  const { owedTotal, oweTotal, net } = balanceTotals(friendRows, groupRows);

  const owedToYou = friendRows.filter((f) => f.owes > 0n).slice(0, 3);
  const youOwe = friendRows.filter((f) => f.iOwe > 0n).slice(0, 3);
  const groupsWithBalance = groupRows.filter((g) => g.balance !== 0n);

  const activityRows: ActivityDisplay[] = recentActivity.map((e) =>
    toActivityDisplay(e, profile.id, groupNameById),
  );

  // Friends with a balance, owed-to-you first, then groups with one.
  const people = [
    ...owedToYou.map((f) => ({ f, owed: true })),
    ...youOwe.map((f) => ({ f, owed: false })),
  ];

  return (
    <div className="hide-scroll">
      {/* Header -- full-bleed across whatever width the viewport gives
          main (not boxed into the content column below it), so desktop
          gets an actual top band instead of a floating row of icons in
          the middle of the page. */}
      <div
        className="px-5 py-5 md:px-8 md:py-6"
        style={{ borderBottom: '1px solid var(--border-sub)' }}
      >
        <div className="flex items-center justify-between md:mx-auto md:max-w-6xl">
          <div className="flex items-center gap-3">
            {/* Profile lives here on phones (the bottom bar has Friends instead). */}
            <Link href="/profile" aria-label="Your profile">
              <Avatar
                initials={initialsOf(profile.displayName)}
                color={colorForId(profile.id)}
                size={44}
                src={photoSrc(profile.avatarUrl)}
              />
            </Link>
            <div>
              <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
                {greeting()}
              </p>
              <h2
                className="font-display text-[1.3rem] font-semibold tracking-tight"
                style={{ color: 'var(--t-primary)' }}
              >
                {profile.displayName}
              </h2>
            </div>
          </div>
          <div className="flex gap-2.5">
            <Link
              href="/notifications"
              aria-label={
                unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
              }
              className="neo-btn relative flex h-[42px] w-[42px] items-center justify-center rounded-2xl"
            >
              <Bell size={20} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[0.62rem] font-bold text-white"
                  style={{ background: 'var(--owe)' }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              className="neo-btn flex h-[42px] w-[42px] items-center justify-center rounded-2xl"
            >
              <Settings size={19} strokeWidth={1.8} />
            </Link>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 md:mx-auto md:max-w-6xl md:px-8 md:py-8">
        <InstallApp variant="banner" />
        <PushNotifications variant="banner" />

        {toConfirm.length > 0 && (
          <Panel className="mb-4">
            <Row
              href="/payments"
              leading={
                <Tile tint="var(--accent-light)" color="var(--accent)">
                  <Wallet size={19} strokeWidth={2} />
                </Tile>
              }
              title={
                toConfirm.length === 1
                  ? `${toConfirm[0]!.payer.displayName.split(' ')[0]} says they paid you`
                  : `${toConfirm.length} payments to confirm`
              }
              sub="Confirm once the money has reached you"
              trailing={<Amount value={toConfirmTotal} tone="owed" />}
              chevron
            />
          </Panel>
        )}

        <div className="md:grid md:grid-cols-[1.25fr_1fr] md:items-start md:gap-7">
          <div>
            <HeroBalance
              net={net}
              owedTotal={owedTotal}
              oweTotal={oweTotal}
              onOwed={() => router.push('/balances/owed')}
              onOwe={() => router.push('/balances/owe')}
            />

            {/* Actions: one main one, three quieter ones */}
            <div className="mb-7 mt-4 grid grid-cols-[1.7fr_1fr_1fr_1fr] gap-2.5">
              <Link
                href="/expenses/new"
                className="neo-btn-accent flex items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl px-2 py-4 text-[0.86rem] font-semibold"
              >
                <Plus size={18} strokeWidth={2.2} />
                Add expense
              </Link>
              {SECONDARY_ACTIONS.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="neo-btn flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center"
                  style={{ color: 'var(--t-secondary)' }}
                >
                  <action.icon size={18} strokeWidth={1.9} />
                  <span className="text-[0.68rem] font-medium leading-tight">{action.label}</span>
                </Link>
              ))}
            </div>

            {/* Recent activity sits under the hero on wide screens */}
            <div className="hidden md:block">
              <RecentActivity
                rows={activityRows}
                expenses={recentActivity}
                onOpen={(id) => router.push(`/expenses/${id}`)}
              />
            </div>
          </div>

          <div>
            <section className="mb-7">
              <SectionHeader title="Balances" href="/balances" />
              {people.length === 0 ? (
                <Panel>
                  <Row
                    href={friends.length === 0 ? '/friends/add' : undefined}
                    leading={
                      <Tile tint="var(--owed-soft)" color="var(--owed)">
                        <Handshake size={19} strokeWidth={1.9} />
                      </Tile>
                    }
                    title={
                      friends.length === 0 ? 'Add your first friend' : 'All settled with friends'
                    }
                    sub={
                      friends.length === 0
                        ? 'Split a bill or send an IOU once you have'
                        : 'New IOUs and shared bills show up here.'
                    }
                    chevron={friends.length === 0}
                  />
                </Panel>
              ) : (
                <Panel>
                  {people.map(({ f, owed }) => (
                    <Row
                      key={f.id}
                      href={`/friends/${f.id}`}
                      leading={
                        <Avatar initials={f.initials} color={f.color} size={40} src={f.photo} />
                      }
                      title={f.name}
                      sub={owed ? 'owes you' : 'you owe'}
                      subTone={owed ? 'owed' : 'owe'}
                      trailing={
                        <Amount value={owed ? f.owes : f.iOwe} tone={owed ? 'owed' : 'owe'} />
                      }
                    />
                  ))}
                </Panel>
              )}
            </section>

            {groupsWithBalance.length > 0 ? (
              <section className="mb-7">
                <SectionHeader title="Groups" href="/groups" />
                <Panel>
                  {groupsWithBalance.map((g) => (
                    <Row
                      key={g.id}
                      href={`/groups/${g.id}`}
                      leading={
                        <Tile tint={g.groupType.tint} color={g.groupType.color}>
                          <GroupPicture photo={g.photo} icon={g.groupType.icon} size={19} />
                        </Tile>
                      }
                      title={g.name}
                      sub={g.balance > 0n ? "you're owed" : 'you owe'}
                      subTone={g.balance > 0n ? 'owed' : 'owe'}
                      trailing={<Amount value={g.balance} tone={g.balance > 0n ? 'owed' : 'owe'} />}
                    />
                  ))}
                </Panel>
              </section>
            ) : (
              groups.length === 0 && (
                <section className="mb-7">
                  <SectionHeader title="Groups" />
                  <Panel>
                    <Row
                      href="/groups/new"
                      leading={
                        <Tile tint="var(--accent-light)" color="var(--accent)">
                          <Users size={19} strokeWidth={1.9} />
                        </Tile>
                      }
                      title="Start a shared tab"
                      sub="For a trip, a household, an ekub -- anything with recurring costs"
                      chevron
                    />
                  </Panel>
                </section>
              )
            )}
          </div>
        </div>

        <div className="md:hidden">
          <RecentActivity
            rows={activityRows}
            expenses={recentActivity}
            onOpen={(id) => router.push(`/expenses/${id}`)}
          />
        </div>
      </div>
    </div>
  );
}

function RecentActivity({
  rows,
  expenses,
  onOpen,
}: {
  rows: ActivityDisplay[];
  expenses: AuthExpense[];
  onOpen: (id: string) => void;
}) {
  return (
    <section>
      <SectionHeader title="Recent activity" href="/activity" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} strokeWidth={1.5} />}
          title="No activity yet"
          description="Expenses and payments will show up here."
        />
      ) : (
        <Panel>
          {rows.map((a, i) => (
            <ActivityRow key={expenses[i]!.id} a={a} onClick={() => onOpen(expenses[i]!.id)} />
          ))}
        </Panel>
      )}
    </section>
  );
}
