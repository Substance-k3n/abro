'use client';

// "Who owes what" (roadmap Phase 5): /balances/owed and /balances/owe,
// opened by tapping "Owed to you" / "You owe" on Home's (or Balances')
// card. One row per person with their total, then where it comes from:
// "Personal" (your one-to-one balance) and each shared group, from
// ~/lib/balance-breakdown.ts. The total at the top matches the card.
//
// Actions follow apps/api's settlement rule (ADR-003): only the person who
// owes records a payment, so "You owe" lines get "Settle up" (personal ->
// /settle?friendId=, group -> /settle?groupId=), while "Owed to you" lines
// link to the friend or group to see the details.

import { Avatar, EmptyState } from '@abro/ui';
import { ETB, formatMoney } from '@abro/types';
import { ArrowLeft, ChevronRight, Handshake, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import {
  type Breakdown,
  type BreakdownLine,
  type Direction,
  loadBreakdown,
} from '~/lib/balance-breakdown';
import { useApiRefresh } from '~/lib/use-api-refresh';

const COPY: Record<Direction, { title: string; lead: string; empty: string }> = {
  owed: {
    title: 'Owed to you',
    lead: 'Who owes you, and where it comes from.',
    empty: 'Nobody owes you anything right now.',
  },
  owe: {
    title: 'You owe',
    lead: 'Who you owe, and where it comes from.',
    empty: "You don't owe anyone right now.",
  },
};

export default function BalanceBreakdownPage() {
  const params = useParams<{ direction: string }>();
  const router = useRouter();
  const direction: Direction | null =
    params.direction === 'owed' || params.direction === 'owe' ? params.direction : null;
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!direction) {
      return;
    }
    setError(null);
    loadBreakdown(direction)
      .then(setData)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load the breakdown.');
      });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [direction]);
  useApiRefresh(load);

  if (!direction) {
    router.replace('/balances');
    return null;
  }
  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  const copy = COPY[direction];
  const tone = direction === 'owed' ? 'var(--c-green)' : 'var(--c-red)';

  return (
    <div className="fade-in flex flex-col gap-5 px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 self-start text-[0.85rem] font-medium"
        style={{ color: 'var(--accent)' }}
      >
        <ArrowLeft size={16} strokeWidth={2} /> Back
      </button>

      <header className="neo-raised flex flex-col gap-1 rounded-[24px] px-5 py-5">
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          {copy.title}
        </h2>
        <p
          className="font-display text-[2rem] font-extrabold tracking-tighter"
          style={{ color: tone }}
        >
          {formatMoney(data.total, ETB)}
        </p>
        <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
          {copy.lead}
        </p>
      </header>

      {data.people.length === 0 ? (
        <EmptyState
          icon={<Handshake size={26} strokeWidth={1.5} />}
          title="All settled up"
          description={copy.empty}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.people.map((person) => (
            <section
              key={person.id}
              className="neo-raised-sm flex flex-col gap-3 rounded-[20px] p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  initials={person.initials}
                  color={person.color}
                  size={44}
                  src={person.photo}
                />
                <p
                  className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {person.name}
                </p>
                <p className="font-mono text-[0.95rem] font-bold" style={{ color: tone }}>
                  {formatMoney(person.total, ETB)}
                </p>
              </div>
              <ul className="flex flex-col gap-1.5">
                {person.lines.map((line) => (
                  <Line
                    key={line.groupId ?? 'personal'}
                    line={line}
                    direction={direction}
                    personId={person.id}
                    isFriend={person.isFriend}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({
  line,
  direction,
  personId,
  isFriend,
}: {
  line: BreakdownLine;
  direction: Direction;
  personId: string;
  isFriend: boolean;
}) {
  const label = line.groupName ? `In ${line.groupName}` : 'Personal';
  const href =
    direction === 'owe'
      ? line.groupId
        ? `/settle?groupId=${line.groupId}`
        : `/settle?friendId=${personId}`
      : line.groupId
        ? `/groups/${line.groupId}`
        : isFriend
          ? `/friends/${personId}`
          : null;

  return (
    <li className="neo-inset-sm flex items-center gap-2.5 rounded-xl px-3 py-2">
      <span style={{ color: 'var(--t-dim)' }} aria-hidden>
        {line.groupId ? (
          <Users size={14} strokeWidth={2} />
        ) : (
          <Handshake size={14} strokeWidth={2} />
        )}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[0.82rem]"
        style={{ color: 'var(--t-secondary)' }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[0.82rem] font-semibold"
        style={{ color: 'var(--t-primary)' }}
      >
        {formatMoney(line.amount, ETB)}
      </span>
      {href &&
        (direction === 'owe' ? (
          <Link
            href={href}
            className="neo-btn-accent rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold"
          >
            Settle up
          </Link>
        ) : (
          <Link
            href={href}
            aria-label={`View ${label}`}
            className="flex items-center"
            style={{ color: 'var(--t-dim)' }}
          >
            <ChevronRight size={16} strokeWidth={2} />
          </Link>
        ))}
    </li>
  );
}
