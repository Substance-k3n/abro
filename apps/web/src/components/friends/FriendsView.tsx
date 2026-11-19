'use client';

// Friends list as a pure view (the page owns fetching and friend
// requests). Layout follows the Stitch "Terracotta Kin" redesign: a summary
// of what you're owed and what you owe, filter chips, and a card per
// friend with the action that fits: Remind for someone who owes you, Pay
// now (the one terracotta button) for someone you owe.
//
// Not carried over from the mockup because the app has no such data:
// phone numbers, "Ekub lead" / "Telebirr linked" tags, last-expense lines
// and the community trust score.

import { Avatar, EmptyState } from '@abro/ui';
import { BellRing, Check, Plus, Search, UserX, Wallet } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';

import { Amount, Panel, Row, SectionHeader } from '~/components/refresh';
import type { FriendRow } from '~/lib/balances-api';

export interface FriendsViewProps {
  rows: FriendRow[];
  /** Pending friend requests, rendered by the page (it owns Accept/Decline). */
  requests: ReactNode;
  /** Send a reminder. Resolves to an error message to show, or null when sent. */
  onRemind: (friendId: string) => Promise<string | null>;
}

type Tab = 'unsettled' | 'settled' | 'all';

const EMPTY_TITLES: Record<Tab, string> = {
  unsettled: 'All settled up',
  settled: 'Nobody settled yet',
  all: 'No friends yet',
};

const EMPTY_DESCRIPTIONS: Record<Tab, string> = {
  unsettled: "You don't owe anyone and nobody owes you.",
  settled: 'Friends you have no balance with show here.',
  all: 'Add a friend to start splitting expenses.',
};

export function FriendsView({ rows, requests, onRemind }: FriendsViewProps) {
  const [search, setSearch] = useState('');
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [reminded, setReminded] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [remindError, setRemindError] = useState<string | null>(null);

  const remind = async (id: string) => {
    setBusy(id);
    setRemindError(null);
    const problem = await onRemind(id);
    setBusy(null);
    if (problem) {
      setRemindError(problem);
    } else {
      setReminded((s) => new Set(s).add(id));
    }
  };

  const owedTotal = rows.reduce((s, f) => s + f.owes, 0n);
  const oweTotal = rows.reduce((s, f) => s + f.iOwe, 0n);
  const net = owedTotal - oweTotal;

  const query = search.trim().toLowerCase();
  const filtered = query ? rows.filter((f) => f.name.toLowerCase().includes(query)) : rows;
  const owedToYou = filtered.filter((f) => f.owes > 0n);
  const youOwe = filtered.filter((f) => f.iOwe > 0n);
  const settled = filtered.filter((f) => f.owes === 0n && f.iOwe === 0n);

  const unsettledCount = owedToYou.length + youOwe.length;
  // Until you pick a chip: Unsettled if anyone has a balance, else All.
  const tab: Tab = chosenTab ?? (unsettledCount > 0 ? 'unsettled' : 'all');
  const showBalances = tab !== 'settled';
  const showSettled = tab !== 'unsettled';
  const isEmpty = (showBalances ? unsettledCount : 0) + (showSettled ? settled.length : 0) === 0;

  const chips: [Tab, string][] = [
    ['unsettled', `Unsettled (${unsettledCount})`],
    ['settled', `Settled (${settled.length})`],
    ['all', 'All'],
  ];

  return (
    <div className="hide-scroll px-5 py-6 md:mx-auto md:max-w-4xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <h1
          className="font-display text-[1.6rem] font-semibold tracking-tight"
          style={{ color: 'var(--t-primary)' }}
        >
          Friends
        </h1>
        <Link
          href="/friends/add"
          className="neo-btn-accent flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[0.82rem] font-semibold"
        >
          <Plus size={15} strokeWidth={2.5} aria-hidden />
          Add friend
        </Link>
      </div>

      {rows.length > 0 && (
        <section className="neo-raised mb-5 rounded-[22px] p-4" aria-label="Balance with friends">
          <div className="flex items-start justify-between gap-3">
            <p
              className="text-[0.7rem] font-semibold uppercase tracking-[0.08em]"
              style={{ color: 'var(--t-dim)' }}
            >
              Balance with friends
            </p>
            {net !== 0n && (
              <span
                className="rounded-full px-2.5 py-1 text-[0.7rem] font-semibold"
                style={
                  net > 0n
                    ? { background: 'var(--owed-soft)', color: 'var(--owed)' }
                    : { background: 'var(--owe-soft)', color: 'var(--owe)' }
                }
              >
                {net > 0n ? 'In your favour' : 'You owe overall'}
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--neo-bg)' }}>
              <p className="text-[0.74rem]" style={{ color: 'var(--t-muted)' }}>
                You are owed
              </p>
              <div className="mt-1">
                <Amount value={owedTotal} tone={owedTotal > 0n ? 'owed' : 'plain'} size="lg" />
              </div>
              <p className="mt-0.5 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                From {rows.filter((f) => f.owes > 0n).length}{' '}
                {rows.filter((f) => f.owes > 0n).length === 1 ? 'friend' : 'friends'}
              </p>
            </div>
            <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--neo-bg)' }}>
              <p className="text-[0.74rem]" style={{ color: 'var(--t-muted)' }}>
                You owe
              </p>
              <div className="mt-1">
                <Amount value={oweTotal} tone={oweTotal > 0n ? 'owe' : 'plain'} size="lg" />
              </div>
              <p className="mt-0.5 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                To {rows.filter((f) => f.iOwe > 0n).length}{' '}
                {rows.filter((f) => f.iOwe > 0n).length === 1 ? 'friend' : 'friends'}
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="relative mb-5 max-w-md">
        <Search
          size={17}
          strokeWidth={2}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--t-dim)' }}
          aria-hidden
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

      {requests}

      <div
        className="hide-scroll -mx-5 mb-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0"
        role="tablist"
        aria-label="Filter friends"
      >
        {chips.map(([id, label]) => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(id)}
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
              {label}
            </button>
          );
        })}
      </div>

      {remindError && (
        <p className="mb-3 px-1 text-[0.85rem]" role="alert" style={{ color: 'var(--owe)' }}>
          {remindError}
        </p>
      )}

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
        <div className="grid grid-cols-1 gap-7 md:grid-cols-2 md:items-start">
          {showBalances && owedToYou.length > 0 && (
            <section>
              <SectionHeader title={`Owed to you (${owedToYou.length})`} />
              <div className="flex flex-col gap-3">
                {owedToYou.map((f) => (
                  <div key={f.id} className="neo-raised rounded-[20px] p-4">
                    <Link href={`/friends/${f.id}`} className="flex items-center gap-3">
                      <Avatar initials={f.initials} color={f.color} size={46} src={f.photo} />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[0.96rem] font-semibold"
                          style={{ color: 'var(--t-primary)' }}
                        >
                          {f.name}
                        </span>
                        <span className="block text-[0.76rem]" style={{ color: 'var(--owed)' }}>
                          owes you
                        </span>
                      </span>
                      <Amount value={f.owes} tone="owed" size="md" />
                    </Link>
                    <div className="mt-3 flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => remind(f.id)}
                        disabled={busy === f.id || reminded.has(f.id)}
                        className="neo-btn flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[0.82rem] font-semibold disabled:cursor-default"
                        style={{ color: reminded.has(f.id) ? 'var(--owed)' : 'var(--t-primary)' }}
                      >
                        {reminded.has(f.id) ? (
                          <>
                            <Check size={16} strokeWidth={2.2} aria-hidden />
                            Reminded
                          </>
                        ) : (
                          <>
                            <BellRing size={16} strokeWidth={2} aria-hidden />
                            {busy === f.id ? 'Sending…' : 'Remind'}
                          </>
                        )}
                      </button>
                      <Link
                        href={`/friends/${f.id}`}
                        className="neo-btn flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-[0.82rem] font-semibold"
                        style={{ color: 'var(--t-primary)' }}
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showBalances && youOwe.length > 0 && (
            <section>
              <SectionHeader title={`You owe (${youOwe.length})`} />
              <div className="flex flex-col gap-3">
                {youOwe.map((f) => (
                  <div key={f.id} className="neo-raised rounded-[20px] p-4">
                    <Link href={`/friends/${f.id}`} className="flex items-center gap-3">
                      <Avatar initials={f.initials} color={f.color} size={46} src={f.photo} />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[0.96rem] font-semibold"
                          style={{ color: 'var(--t-primary)' }}
                        >
                          {f.name}
                        </span>
                        <span className="block text-[0.76rem]" style={{ color: 'var(--owe)' }}>
                          you owe
                        </span>
                      </span>
                      <Amount value={f.iOwe} tone="owe" size="md" />
                    </Link>
                    <Link
                      href={`/settle?friendId=${f.id}`}
                      className="neo-btn-accent mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[0.84rem] font-semibold"
                    >
                      <Wallet size={16} strokeWidth={2} aria-hidden />
                      Pay now
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showSettled && settled.length > 0 && (
            <section>
              <SectionHeader title={`Settled up (${settled.length})`} />
              <Panel>
                {settled.map((f) => (
                  <Row
                    key={f.id}
                    href={`/friends/${f.id}`}
                    leading={
                      <Avatar initials={f.initials} color={f.color} size={40} src={f.photo} />
                    }
                    title={f.name}
                    sub="all square"
                    chevron
                  />
                ))}
              </Panel>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
