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
// - Loading skeleton (spec's "Components" list) is deferred: GROUPS is
//   static mock data with no async fetch to skeleton against. Phase 8
//   (real API wiring) should add one alongside the actual data fetch.
// - Create Group button links to `/groups/new`, not yet built (same
//   deferred-route pattern as Home's Quick Actions); group cards link to
//   `/groups/[id]`, also not yet built.

import { EmptyState, GroupIcon, MoneyDisplay, SectionLabel } from '@abro/ui';
import { Plus, Users } from 'lucide-react';
import Link from 'next/link';

import { GROUPS, type Group } from '~/lib/mock-data';

function GroupCard({ group }: { group: Group }) {
  const isSettled = group.balance === 0n;

  return (
    <Link
      href={`/groups/${group.id}`}
      className="neo-raised flex items-start gap-3.5 rounded-[20px] p-4"
    >
      <div
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl"
        style={{ background: `${group.color}22`, color: group.color }}
      >
        <GroupIcon icon={group.icon} size={24} />
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
            {group.type}
          </span>
        </div>
        <p className="mb-2.5 text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
          {group.members} members · {group.lastActivity}
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
  const activeGroups = GROUPS.filter((g) => g.balance !== 0n);
  const settledGroups = GROUPS.filter((g) => g.balance === 0n);

  return (
    <div className="fade-in hide-scroll px-5 py-6 md:px-8 md:py-8">
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

      {GROUPS.length === 0 ? (
        <EmptyState
          icon={<Users size={26} strokeWidth={1.5} />}
          title="No groups yet"
          description="Create a group to start splitting expenses with friends."
        />
      ) : (
        <div className="flex max-w-xl flex-col gap-6">
          {activeGroups.length > 0 && (
            <div>
              <SectionLabel>Active</SectionLabel>
              <div className="flex flex-col gap-3">
                {activeGroups.map((g) => (
                  <GroupCard key={g.id} group={g} />
                ))}
              </div>
            </div>
          )}
          {settledGroups.length > 0 && (
            <div>
              <SectionLabel>Settled</SectionLabel>
              <div className="flex flex-col gap-3">
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
