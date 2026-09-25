'use client';

// DASH-05 Groups List — docs/ABRO_FRONTEND_SPEC.md §3 (lines 438-474).
// This is the full-screen expansion of the "Group Summary" preview already
// rendered on Home (home/page.tsx's groupsWithBalance section) -- same
// card visual language (GroupIcon in a tinted neo-raised-sm tile, name,
// balance via MoneyDisplay), extended here with the type badge, member
// count and last-activity line the spec calls for and the Home preview
// omits for space. Card layout otherwise follows the prototype's
// GroupsScreen (App.tsx:2218): icon tile, name + type pill on one line,
// "members · lastActivity" subline, balance row.
//
// Deviations from spec:
// - "Settled" balance uses `var(--t-dim)` text instead of a colored
//   MoneyDisplay (no direction to color for a zero balance) -- matches the
//   prototype's `g.balance === 0` branch, which shows "Settled" instead of
//   an amount.
// - Loading state is the shared spinner (~/components/LoadStates), not a
//   per-card skeleton -- same as every other Phase 8 screen so far.
//
// Phase 8 (docs/WIRING_PLAN.md), slice 4: rewired from ~/lib/mock-data.ts
// to real GET /groups/ + GET /balances/summary, joined via the same
// deriveGroupRows() Home and Balances use. Member count and last
// activity come from GET /groups/'s list-only `memberCount`/
// `lastActivityAt` fields, added in apps/api for this screen rather than
// fanning out one GET /groups/{id} per card. Deviations (Confirmed):
//  - Last activity is an absolute short date ("Active Sep 23"), not
//    relative ("2h ago") -- same ~/lib/format.ts limitation as Home.
//  - Group cards still link to `/groups/[id]` (GRP-03), still mock-only
//    until the groups slice -- a real id degrades to that page's own
//    "Group not found" empty state, the same accepted gap slice 3 left
//    for friend rows -> Friend Detail.

import { EmptyState, GroupIcon, MoneyDisplay, SectionLabel } from '@abro/ui';
import { Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { type BalancesSummary, deriveGroupRows, getBalancesSummary } from '~/lib/balances-api';
import { formatShortDate } from '~/lib/format';
import { type GroupListItem, groupTypeFor, listGroups } from '~/lib/groups-api';

interface GroupCardData {
  id: string;
  name: string;
  /** Positive = the group owes you (no sign conversion -- see
   * ~/lib/balances-api.ts's header comment). */
  balance: bigint;
  memberCount: number;
  lastActivityAt: string;
  groupType: ReturnType<typeof groupTypeFor>;
}

function toCards(groups: GroupListItem[], balances: BalancesSummary): GroupCardData[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  return deriveGroupRows(groups, balances).map((row) => {
    const g = byId.get(row.id)!;
    return {
      id: row.id,
      name: row.name,
      balance: row.balance,
      memberCount: g.memberCount,
      lastActivityAt: g.lastActivityAt,
      groupType: groupTypeFor(row.type),
    };
  });
}

function GroupCard({ group }: { group: GroupCardData }) {
  const isSettled = group.balance === 0n;

  return (
    <Link
      href={`/groups/${group.id}`}
      className="neo-raised flex items-start gap-3.5 rounded-[20px] p-4"
    >
      <div
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl"
        style={{
          background: `${group.groupType.color}22`,
          color: group.groupType.color,
        }}
      >
        <GroupIcon icon={group.groupType.icon} size={24} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <p
            className="font-display truncate text-[0.95rem] font-bold tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            {group.name}
          </p>
          <span
            className="neo-flat shrink-0 rounded-lg px-2 py-0.5 text-[0.68rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            {group.groupType.label}
          </span>
        </div>
        <p className="mb-2.5 text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
          {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'} · Active{' '}
          {formatShortDate(group.lastActivityAt)}
        </p>
        <div className="flex items-center justify-between">
          <p className="text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
            Your balance
          </p>
          {isSettled ? (
            <span className="text-[0.9rem] font-semibold" style={{ color: 'var(--t-dim)' }}>
              Settled
            </span>
          ) : (
            <MoneyDisplay
              amount={group.balance < 0n ? -group.balance : group.balance}
              className="font-mono text-[0.9rem] font-bold"
              style={{ color: group.balance > 0n ? 'var(--c-green)' : 'var(--c-red)' }}
            />
          )}
        </div>
      </div>
    </Link>
  );
}

export default function GroupsPage() {
  const [cards, setCards] = useState<GroupCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setCards(null);
    Promise.all([listGroups(), getBalancesSummary()])
      .then(([groups, balances]) => setCards(toCards(groups, balances)))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your groups.');
      });
  };

  useEffect(load, []);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!cards) {
    return <LoadingState />;
  }

  const activeGroups = cards.filter((g) => g.balance !== 0n);
  const settledGroups = cards.filter((g) => g.balance === 0n);

  return (
    <div className="fade-in hide-scroll px-5 py-6 md:mx-auto md:max-w-4xl md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2
          className="font-display text-[1.5rem] font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          Groups
        </h2>
        <Link
          href="/groups/new"
          className="neo-btn-accent flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[0.8rem] font-semibold"
        >
          <Plus size={14} strokeWidth={2.5} />
          Create Group
        </Link>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={<Users size={26} strokeWidth={1.5} />}
          title="No groups yet"
          description="Create a group to start splitting expenses with friends."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {activeGroups.length > 0 && (
            <div>
              <SectionLabel>Active</SectionLabel>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {activeGroups.map((g) => (
                  <GroupCard key={g.id} group={g} />
                ))}
              </div>
            </div>
          )}
          {settledGroups.length > 0 && (
            <div>
              <SectionLabel>Settled</SectionLabel>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {settledGroups.map((g) => (
                  <GroupCard key={g.id} group={g} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
