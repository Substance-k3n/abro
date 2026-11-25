'use client';

// Groups list as a pure view (the page owns fetching, invites and the
// Accept/Decline calls). Layout follows the Stitch "Terracotta Kin"
// redesign: an overall-balance card, filter chips, one card per group with
// the action that fits its state, and recent group activity.
//
// Terracotta is spent on one thing per card: "Settle up" when you owe.
// Everything else is neutral, and green/red mean money only.

import { EmptyState } from '@abro/ui';
import { ChevronRight, PiggyBank, Plus, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { ActivityRow } from '~/components/ActivityRow';
import { GroupPicture } from '~/components/GroupPicture';
import { Amount, Panel, SectionHeader, Tile } from '~/components/refresh';
import { formatShortDate } from '~/lib/format';
import type { ActivityDisplay } from '~/lib/expenses-api';
import type { groupTypeFor } from '~/lib/groups-api';

export interface GroupCardData {
  id: string;
  name: string;
  /** Positive = the group owes you. */
  balance: bigint;
  memberCount: number;
  lastActivityAt: string;
  groupType: ReturnType<typeof groupTypeFor>;
  photo: string | null;
}

export interface GroupsViewProps {
  cards: GroupCardData[];
  activity: { id: string; display: ActivityDisplay }[];
  /** Pending invites, rendered by the page (it owns Accept/Decline). */
  invites: ReactNode;
}

type Filter = 'all' | 'owe' | 'owed' | 'settled';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'owe', label: 'You owe' },
  { id: 'owed', label: 'Owed to you' },
  { id: 'settled', label: 'Settled' },
];

function matches(g: GroupCardData, f: Filter): boolean {
  return (
    f === 'all' ||
    (f === 'owe' && g.balance < 0n) ||
    (f === 'owed' && g.balance > 0n) ||
    (f === 'settled' && g.balance === 0n)
  );
}

export function GroupsView({ cards, activity, invites }: GroupsViewProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const owedTotal = cards.reduce((s, g) => (g.balance > 0n ? s + g.balance : s), 0n);
  const oweTotal = cards.reduce((s, g) => (g.balance < 0n ? s - g.balance : s), 0n);
  const net = owedTotal - oweTotal;
  const shown = cards.filter((g) => matches(g, filter));

  return (
    <div className="hide-scroll px-5 py-6 md:mx-auto md:max-w-4xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <h1
          className="font-display text-[1.6rem] font-semibold tracking-tight"
          style={{ color: 'var(--t-primary)' }}
        >
          Groups
        </h1>
        <Link
          href="/groups/new"
          className="neo-btn-accent flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[0.82rem] font-semibold"
        >
          <Plus size={15} strokeWidth={2.5} aria-hidden />
          New group
        </Link>
      </div>

      {cards.length > 0 && (
        <section className="neo-raised mb-5 rounded-[22px] p-4" aria-label="Overall balance">
          <p className="section-label" style={{ color: 'var(--t-dim)' }}>
            Overall balance
          </p>
          <p className="mt-1">
            {net === 0n ? (
              <span
                className="font-display text-[1.7rem] font-semibold"
                style={{ color: 'var(--t-primary)' }}
              >
                All square
              </span>
            ) : (
              <Amount value={net} tone={net > 0n ? 'owed' : 'owe'} size="lg" />
            )}
          </p>
          <p className="mt-0.5 text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
            Across {cards.length} {cards.length === 1 ? 'group' : 'groups'}
          </p>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--neo-bg)' }}>
              <p className="text-[0.72rem]" style={{ color: 'var(--t-muted)' }}>
                You are owed
              </p>
              <Amount value={owedTotal} tone={owedTotal > 0n ? 'owed' : 'plain'} size="md" />
            </div>
            <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--neo-bg)' }}>
              <p className="text-[0.72rem]" style={{ color: 'var(--t-muted)' }}>
                You owe others
              </p>
              <Amount value={oweTotal} tone={oweTotal > 0n ? 'owe' : 'plain'} size="md" />
            </div>
          </div>
        </section>
      )}

      {/* Ekub has no bottom-bar slot; on a phone this is the way in (ADR-024). */}
      <Link href="/ekub" className="neo-raised mb-5 flex items-center gap-3 rounded-2xl px-4 py-3">
        <Tile tint="var(--accent-light)" color="var(--accent)">
          <PiggyBank size={20} strokeWidth={1.8} />
        </Tile>
        <div className="min-w-0 flex-1">
          <p className="text-[0.92rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
            Ekub
          </p>
          <p className="truncate text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
            Rotating savings: everyone puts in, one turn takes the pot
          </p>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--t-dim)' }} aria-hidden />
      </Link>

      {invites}

      {cards.length === 0 ? (
        <EmptyState
          icon={<Users size={26} strokeWidth={1.5} />}
          title="No groups yet"
          description="Create a group to start splitting expenses with friends."
        />
      ) : (
        <>
          <div
            className="hide-scroll -mx-5 mb-4 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0"
            role="tablist"
            aria-label="Filter groups"
          >
            {FILTERS.map((f) => {
              const count = cards.filter((g) => matches(g, f.id)).length;
              const on = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFilter(f.id)}
                  className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[0.8rem] font-semibold"
                  style={
                    on
                      ? {
                          background: 'var(--accent-light)',
                          color: 'var(--accent)',
                          border: '1px solid var(--accent)',
                        }
                      : {
                          background: 'var(--neo-bg2)',
                          color: 'var(--t-muted)',
                          border: '1px solid var(--border-med)',
                        }
                  }
                >
                  {f.label}
                  {f.id === 'all' ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>

          {shown.length === 0 ? (
            <p className="py-8 text-center text-[0.88rem]" style={{ color: 'var(--t-dim)' }}>
              No groups match this filter.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {shown.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          )}
        </>
      )}

      {activity.length > 0 && <GroupActivity rows={activity} />}
    </div>
  );
}

function GroupCard({ group }: { group: GroupCardData }) {
  const owed = group.balance > 0n;
  const owe = group.balance < 0n;
  const abs = owe ? -group.balance : group.balance;
  const quiet =
    'neo-btn flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[0.82rem] font-semibold';

  return (
    <div className="neo-raised flex flex-col rounded-[20px] p-4">
      <Link href={`/groups/${group.id}`} className="flex items-start gap-3">
        <Tile tint={group.groupType.tint} color={group.groupType.color} size={50}>
          <GroupPicture photo={group.photo} icon={group.groupType.icon} size={24} />
        </Tile>
        <div className="min-w-0 flex-1">
          <p
            className="font-display truncate text-[1rem] font-semibold tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            {group.name}
          </p>
          <p className="mt-0.5 text-[0.76rem]" style={{ color: 'var(--t-dim)' }}>
            {group.groupType.label} · {group.memberCount}{' '}
            {group.memberCount === 1 ? 'member' : 'members'}
          </p>
          <p className="text-[0.76rem]" style={{ color: 'var(--t-dim)' }}>
            Active {formatShortDate(group.lastActivityAt)}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold"
          style={
            owed
              ? { background: 'var(--owed-soft)', color: 'var(--owed)' }
              : owe
                ? { background: 'var(--owe-soft)', color: 'var(--owe)' }
                : { background: 'var(--neo-bg)', color: 'var(--t-muted)' }
          }
        >
          {owed ? 'Owed to you' : owe ? 'You owe' : 'Settled up'}
        </span>
      </Link>

      {!owed && !owe ? null : (
        <div
          className="mt-3 flex items-baseline justify-between rounded-xl px-3 py-2"
          style={{ background: 'var(--neo-bg)' }}
        >
          <span className="text-[0.76rem]" style={{ color: 'var(--t-muted)' }}>
            {owed ? 'You get back' : 'You pay'}
          </span>
          <Amount value={abs} tone={owed ? 'owed' : 'owe'} size="md" />
        </div>
      )}

      <div className="mt-3 flex gap-2.5">
        {owe ? (
          <Link
            href={`/settle?groupId=${group.id}`}
            className="neo-btn-accent flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[0.82rem] font-semibold"
          >
            <Wallet size={16} strokeWidth={2} aria-hidden />
            Settle up
          </Link>
        ) : (
          <Link href={`/expenses/new?groupId=${group.id}`} className={quiet}>
            <Plus size={16} strokeWidth={2.2} aria-hidden />
            Add expense
          </Link>
        )}
        <Link href={`/groups/${group.id}/balances`} className={quiet}>
          Balances
        </Link>
      </div>
    </div>
  );
}

function GroupActivity({ rows }: { rows: GroupsViewProps['activity'] }) {
  const router = useRouter();
  return (
    <section className="mt-7">
      <SectionHeader title="Recent group activity" href="/activity" />
      <Panel>
        {rows.map((r) => (
          <ActivityRow key={r.id} a={r.display} onClick={() => router.push(`/expenses/${r.id}`)} />
        ))}
      </Panel>
    </section>
  );
}
