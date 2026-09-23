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
//  - Group icon/color still come from ~/lib/mock-data.ts's GROUP_TYPES
//    lookup table (client-side reference data, not mock *facts* -- see
//    that file's own header note) -- matched case-insensitively against
//    apps/api's UPPERCASE `type` enum values.
//  - Recent Activity rows are not clickable -- they'd link to
//    `/expenses/[id]`, which is still mock-data-only (Phase 4 hasn't
//    been rewired yet) and would show "not found" for a real expense
//    id. Re-enable once that slice lands.
//  - Avatar color (yours and every friend's) is deterministically
//    derived from their id (~/lib/identity.ts), not stored -- no real
//    Profile field for it exists (AUTH-06/PRF-01's color picker is
//    cosmetic-only).

import {
  ActivityItem,
  Avatar,
  BalanceCard,
  EmptyState,
  GroupIcon,
  MoneyDisplay,
  PersonRow,
  SectionLabel,
} from '@abro/ui';
import { ETB } from '@abro/types';
import { Bell, Handshake, Plus, Receipt, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ApiError } from '~/lib/api-client';
import { type AuthProfile, me } from '~/lib/auth-api';
import {
  type BalancesSummary,
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
import { type AuthGroup, listGroups } from '~/lib/groups-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { GROUP_TYPES } from '~/lib/mock-data';
import { listNotifications } from '~/lib/notifications-api';

const QUICK_ACTIONS = [
  { label: 'Add Expense', href: '/expenses/new', icon: Plus, accent: true },
  { label: 'Settle Up', href: '/settle', icon: Handshake, accent: false },
  { label: 'Add IOU', href: '/expenses/new?type=iou', icon: Receipt, accent: false },
  { label: 'Create Group', href: '/groups/new', icon: Users, accent: false },
];

interface HomeData {
  profile: AuthProfile;
  friends: FriendListItem[];
  groups: AuthGroup[];
  balances: BalancesSummary;
  unreadCount: number;
  recentActivity: AuthExpense[];
}

function LoadingState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className="h-8 w-8 rounded-full border-2"
        style={{
          borderColor: 'rgba(99,102,241,0.3)',
          borderTopColor: 'var(--accent)',
          animation: 'spin 0.7s linear infinite',
        }}
        aria-label="Loading"
      />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-[0.9rem]" style={{ color: 'var(--t-muted)' }}>
        {message}
      </p>
      <button
        onClick={onRetry}
        className="neo-btn-accent rounded-2xl px-5 py-2.5 text-[0.85rem] font-semibold"
      >
        Try again
      </button>
    </div>
  );
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setData(null);
    Promise.all([
      me(),
      listFriends(),
      listGroups(),
      getBalancesSummary(),
      listNotifications({ unreadOnly: true, limit: 100 }),
      listExpenses({ limit: 5 }),
    ])
      .then(([profile, friends, groups, balances, unread, recentActivity]) => {
        setData({ profile, friends, groups, balances, unreadCount: unread.length, recentActivity });
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

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const { profile, friends, groups, balances, unreadCount, recentActivity } = data;
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

  const friendRows = deriveFriendRows(friends, balances);
  const owedTotal = friendRows.reduce((sum, f) => sum + f.owes, 0n);
  const oweTotal = friendRows.reduce((sum, f) => sum + f.iOwe, 0n);
  const net = owedTotal - oweTotal;

  const owedToYou = friendRows.filter((f) => f.owes > 0n).slice(0, 3);
  const youOwe = friendRows.filter((f) => f.iOwe > 0n).slice(0, 3);

  const groupTypeById = new Map(
    groups.map((g) => [
      g.id,
      GROUP_TYPES.find((t) => t.id.toUpperCase() === g.type) ??
        GROUP_TYPES[GROUP_TYPES.length - 1]!,
    ]),
  );
  const groupRows = deriveGroupRows(groups, balances).map((g) => ({
    ...g,
    groupType: groupTypeById.get(g.id)!,
  }));
  const groupsWithBalance = groupRows.filter((g) => g.balance !== 0n);

  const activityRows: ActivityDisplay[] = recentActivity.map((e) =>
    toActivityDisplay(e, profile.id, groupNameById),
  );

  return (
    <div className="fade-in hide-scroll px-5 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar
            initials={initialsOf(profile.displayName)}
            color={colorForId(profile.id)}
            size={44}
          />
          <div>
            <p className="mb-0.5 text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
              Good morning
            </p>
            <h2
              className="font-display text-[1.3rem] font-bold tracking-tight"
              style={{ color: 'var(--t-primary)' }}
            >
              {profile.displayName}
            </h2>
          </div>
        </div>
        <div className="flex gap-2.5">
          <Link
            href="/notifications"
            className="neo-btn relative flex h-[42px] w-[42px] items-center justify-center rounded-2xl"
          >
            <Bell size={22} strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span
                className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold text-white"
                style={{ background: '#ef4444' }}
              >
                {unreadCount}
              </span>
            )}
          </Link>
          <Link
            href="/profile"
            className="neo-btn flex h-[42px] w-[42px] items-center justify-center rounded-2xl"
          >
            <Settings size={20} strokeWidth={1.75} />
          </Link>
        </div>
      </div>

      <div className="md:grid md:grid-cols-[1.4fr_1fr] md:gap-6">
        <div>
          {/* Balance Summary Card */}
          <div className="mb-5">
            <BalanceCard net={net} owedTotal={owedTotal} oweTotal={oweTotal} />
          </div>

          {/* Quick Actions */}
          <div className="mb-6 grid grid-cols-4 gap-2.5">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-center ${
                    action.accent ? 'neo-btn-accent' : 'neo-btn'
                  }`}
                >
                  <Icon size={20} strokeWidth={1.9} />
                  <span
                    className="text-[0.66rem] font-medium leading-tight"
                    style={{ color: action.accent ? 'white' : 'var(--t-secondary)' }}
                  >
                    {action.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          {/* Outstanding Balances */}
          <div className="mb-6">
            <div className="mb-3.5 flex items-center justify-between">
              <h3
                className="font-display text-base font-bold tracking-tight"
                style={{ color: 'var(--t-primary)' }}
              >
                Balances
              </h3>
              <Link
                href="/balances"
                className="text-[0.78rem] font-medium"
                style={{ color: 'var(--accent)' }}
              >
                See all
              </Link>
            </div>

            {owedToYou.length === 0 && youOwe.length === 0 ? (
              <EmptyState
                icon={<Handshake size={26} strokeWidth={1.5} />}
                title="All settled up"
                description="No outstanding balances with friends right now."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {owedToYou.length > 0 && (
                  <div>
                    <SectionLabel>People who owe you</SectionLabel>
                    <div className="flex flex-col gap-2">
                      {owedToYou.map((f) => (
                        <PersonRow
                          key={f.id}
                          initials={f.initials}
                          color={f.color}
                          name={f.name}
                          right={
                            <MoneyDisplay
                              amount={f.owes}
                              className="font-mono text-sm font-semibold"
                              style={{ color: 'var(--c-green)' }}
                            />
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
                {youOwe.length > 0 && (
                  <div>
                    <SectionLabel>People you owe</SectionLabel>
                    <div className="flex flex-col gap-2">
                      {youOwe.map((f) => (
                        <PersonRow
                          key={f.id}
                          initials={f.initials}
                          color={f.color}
                          name={f.name}
                          right={
                            <MoneyDisplay
                              amount={f.iOwe}
                              className="font-mono text-sm font-semibold"
                              style={{ color: 'var(--c-red)' }}
                            />
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Group Summary */}
          {groupsWithBalance.length > 0 && (
            <div className="mb-6">
              <div className="mb-3.5 flex items-center justify-between">
                <h3
                  className="font-display text-base font-bold tracking-tight"
                  style={{ color: 'var(--t-primary)' }}
                >
                  Groups
                </h3>
                <Link
                  href="/groups"
                  className="text-[0.78rem] font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  See all
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                {groupsWithBalance.map((g) => (
                  <Link
                    key={g.id}
                    href={`/groups/${g.id}`}
                    className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
                      style={{ background: `${g.groupType.color}22`, color: g.groupType.color }}
                    >
                      <GroupIcon icon={g.groupType.icon} size={19} />
                    </div>
                    <span
                      className="flex-1 text-[0.88rem] font-semibold"
                      style={{ color: 'var(--t-primary)' }}
                    >
                      {g.name}
                    </span>
                    <MoneyDisplay
                      amount={g.balance < 0n ? -g.balance : g.balance}
                      className="font-mono text-sm font-semibold"
                      style={{ color: g.balance > 0n ? 'var(--c-green)' : 'var(--c-red)' }}
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <h3
            className="font-display text-base font-bold tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            Recent Activity
          </h3>
          <Link
            href="/activity"
            className="text-[0.78rem] font-medium"
            style={{ color: 'var(--accent)' }}
          >
            See all
          </Link>
        </div>
        {activityRows.length === 0 ? (
          <EmptyState
            icon={<Receipt size={26} strokeWidth={1.5} />}
            title="No activity yet"
            description="Expenses and settlements will show up here."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {activityRows.map((a, i) => (
              <ActivityItem
                key={recentActivity[i]!.id}
                category={a.category}
                title={a.title}
                sub={a.sub}
                amount={a.amount}
                dir={a.dir}
                time={a.time}
                currency={ETB}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
