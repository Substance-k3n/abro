'use client';

// One running ekub as a card: round progress, when the next round is due,
// who takes the pot, your turn, and either what you still owe this round or
// a plain Open. Shared by Home and the Ekub list so they can't drift apart.

import { Avatar } from '@abro/ui';
import { CalendarDays, CheckCircle2, PiggyBank } from 'lucide-react';
import Link from 'next/link';

import { Tile } from '~/components/refresh';

export interface EkubCardData {
  id: string;
  name: string;
  memberCount: number;
  /** "500.00 ETB monthly" -- what each turn puts in, and how often. */
  contribution: string;
  currentRound: number;
  totalRounds: number;
  /** "Mon 2 Mar", or null before a date is set. */
  nextDue: string | null;
  /** Who takes the pot this round. */
  recipient: string | null;
  /** "Round 7 · Fri 12 Jan": when my own turn takes the pot, or null. */
  yourTurn: string | null;
  members: { id: string; initials: string; color: string; photo: string | null }[];
  /** Still to put in this round, formatted ("500.00 ETB"), or null. */
  toPay: string | null;
}

export function EkubCard({ ekub }: { ekub: EkubCardData }) {
  const pct = ekub.totalRounds > 0 ? Math.round((ekub.currentRound / ekub.totalRounds) * 100) : 0;
  const extra = ekub.memberCount - ekub.members.length;
  return (
    <Link href={`/ekub/${ekub.id}`} className="neo-raised block rounded-[22px] p-4">
      <div className="flex items-start gap-3">
        <Tile tint="var(--accent-light)" color="var(--accent)" size={44}>
          <PiggyBank size={21} strokeWidth={1.9} />
        </Tile>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[0.98rem] font-semibold"
            style={{ color: 'var(--t-primary)' }}
          >
            {ekub.name}
          </p>
          <p className="mt-0.5 truncate text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
            {ekub.memberCount} members &middot; {ekub.contribution}
          </p>
        </div>
      </div>

      <div className="mt-3.5 rounded-2xl p-3" style={{ background: 'var(--neo-bg)' }}>
        <div className="flex items-baseline justify-between text-[0.8rem]">
          <span className="font-semibold" style={{ color: 'var(--t-primary)' }}>
            Round {ekub.currentRound} of {ekub.totalRounds}
          </span>
          <span style={{ color: 'var(--t-muted)' }}>{pct}% done</span>
        </div>
        <div
          className="mt-2 flex gap-1"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={ekub.totalRounds}
          aria-valuenow={ekub.currentRound}
          aria-label="Ekub progress"
        >
          {Array.from({ length: ekub.totalRounds }, (_, i) => (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: i < ekub.currentRound ? 'var(--accent)' : 'var(--border-med)',
              }}
            />
          ))}
        </div>
        <div
          className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[0.76rem]"
          style={{ color: 'var(--t-muted)' }}
        >
          {ekub.nextDue && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={14} strokeWidth={1.9} aria-hidden />
              Due {ekub.nextDue}
            </span>
          )}
          {ekub.recipient && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={14} strokeWidth={1.9} aria-hidden />
              Takes the pot: {ekub.recipient}
            </span>
          )}
        </div>
        {ekub.yourTurn && (
          <p className="mt-1.5 text-[0.76rem] font-semibold" style={{ color: 'var(--accent)' }}>
            Your turn: {ekub.yourTurn}
          </p>
        )}
      </div>

      <div className="mt-3.5 flex items-center justify-between">
        <div className="flex items-center">
          {ekub.members.map((m, i) => (
            <span
              key={m.id}
              className={`rounded-[11px] ${i === 0 ? '' : '-ml-2'}`}
              style={{ boxShadow: '0 0 0 2px var(--neo-bg2)' }}
            >
              <Avatar initials={m.initials} color={m.color} size={30} src={m.photo} />
            </span>
          ))}
          {extra > 0 && (
            <span
              className="-ml-2 flex h-[30px] min-w-[30px] items-center justify-center rounded-full px-1 text-[0.7rem] font-semibold"
              style={{ background: 'var(--neo-bg)', color: 'var(--t-muted)' }}
            >
              +{extra}
            </span>
          )}
        </div>
        <span
          className="rounded-xl px-3.5 py-2 text-[0.82rem] font-semibold"
          style={
            ekub.toPay
              ? { background: '#c2410c', color: '#fff' }
              : { background: 'var(--neo-bg)', color: 'var(--t-primary)' }
          }
        >
          {ekub.toPay ? `Pay ${ekub.toPay}` : 'Open'}
        </span>
      </div>
    </Link>
  );
}
