'use client';

// Ekub list as a pure view (the page owns fetching). Layout follows the
// Stitch "Terracotta Kin" redesign: a summary of what is due, your running
// ekubs as progress cards, then invitations and ekubs not started yet.
//
// Left out of the mockup because the app has no such thing: join codes,
// pool chat, collateral / escrow claims and a "total received" tally.

import { EmptyState, SectionLabel } from '@abro/ui';
import { ArrowLeft, CalendarDays, PiggyBank, Plus } from 'lucide-react';
import Link from 'next/link';

import { EkubCard, type EkubCardData } from '~/components/ekub/EkubCard';
import { Tile } from '~/components/refresh';
import { cadenceLabel, ekubMoney } from '~/lib/ekub-view';
import type { Ekub } from '~/lib/ekubs-api';

export interface EkubListViewProps {
  /** Running ekubs I take part in, with round progress. */
  running: EkubCardData[];
  /** Invitations to ekubs I haven't joined. */
  invites: Ekub[];
  /** Ekubs I'm in that haven't started, or whose detail didn't load. */
  others: Ekub[];
}

export function EkubListView({ running, invites, others }: EkubListViewProps) {
  const due = running.filter((e) => e.toPay);
  const nothing = running.length === 0 && invites.length === 0 && others.length === 0;

  return (
    <div className="hide-scroll px-5 py-6 md:mx-auto md:max-w-4xl md:px-8 md:py-8">
      <Link
        href="/groups"
        className="mb-3 flex items-center gap-1 text-[0.85rem] font-medium md:hidden"
        style={{ color: 'var(--accent)' }}
      >
        <ArrowLeft size={16} strokeWidth={2} aria-hidden /> Groups
      </Link>
      <div className="mb-2 flex items-center justify-between">
        <h1
          className="font-display text-[1.6rem] font-semibold tracking-tight"
          style={{ color: 'var(--t-primary)' }}
        >
          Ekub
        </h1>
        <Link
          href="/ekub/new"
          className="neo-btn-accent flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[0.82rem] font-semibold"
        >
          <Plus size={15} strokeWidth={2.5} aria-hidden />
          New Ekub
        </Link>
      </div>
      <p className="mb-5 text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
        Everyone puts in every round and one turn takes the pot. ABRO keeps track of who has paid;
        the money moves between you.
      </p>

      {running.length > 0 && (
        <section className="neo-raised mb-6 rounded-[22px] p-4" aria-label="Ekub overview">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--neo-bg)' }}>
              <p className="text-[0.74rem]" style={{ color: 'var(--t-muted)' }}>
                Running
              </p>
              <p
                className="font-display mt-1 text-[1.6rem] font-semibold leading-none"
                style={{ color: 'var(--t-primary)' }}
              >
                {running.length}
              </p>
              <p className="mt-1 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                {running.length === 1 ? 'ekub' : 'ekubs'}
              </p>
            </div>
            <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--neo-bg)' }}>
              <p className="text-[0.74rem]" style={{ color: 'var(--t-muted)' }}>
                Due from you
              </p>
              {due.length === 0 ? (
                <>
                  <p
                    className="font-display mt-1 text-[1.1rem] font-semibold leading-tight"
                    style={{ color: 'var(--owed)' }}
                  >
                    Nothing due
                  </p>
                  <p className="mt-1 text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                    You are up to date
                  </p>
                </>
              ) : (
                <>
                  <p
                    className="font-display mt-1 text-[1.1rem] font-semibold leading-tight"
                    style={{ color: 'var(--owe)' }}
                  >
                    {due.length === 1 ? due[0]!.toPay : `${due.length} payments`}
                  </p>
                  <p
                    className="mt-1 inline-flex items-center gap-1 text-[0.72rem]"
                    style={{ color: 'var(--t-dim)' }}
                  >
                    {due.length === 1 && due[0]!.nextDue ? (
                      <>
                        <CalendarDays size={12} strokeWidth={1.9} aria-hidden />
                        Due {due[0]!.nextDue}
                      </>
                    ) : (
                      'This round'
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {invites.length > 0 && (
        <div className="mb-6">
          <SectionLabel>Invitations ({invites.length})</SectionLabel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {invites.map((e) => (
              <EkubRow key={e.id} ekub={e} />
            ))}
          </div>
        </div>
      )}

      {running.length > 0 && (
        <div className="mb-6">
          <SectionLabel>Running</SectionLabel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
            {running.map((e) => (
              <EkubCard key={e.id} ekub={e} />
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <SectionLabel>{running.length > 0 ? 'Other ekubs' : 'Your ekubs'}</SectionLabel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {others.map((e) => (
              <EkubRow key={e.id} ekub={e} />
            ))}
          </div>
        </div>
      )}

      {nothing && (
        <EmptyState
          icon={<PiggyBank size={26} strokeWidth={1.5} />}
          title="No ekubs yet"
          description="Start one with your friends: set the amount, the turns and the order."
        />
      )}
    </div>
  );
}

/** A plain row for an ekub with no round progress to show: an invitation,
 * one not started, or one whose detail didn't load. */
function EkubRow({ ekub }: { ekub: Ekub }) {
  const invited = ekub.myStatus === 'INVITED';
  return (
    <Link
      href={`/ekub/${ekub.id}`}
      className="neo-raised flex items-center gap-3.5 rounded-[20px] p-4"
    >
      <Tile tint="var(--accent-light)" color="var(--accent)" size={50}>
        <PiggyBank size={23} strokeWidth={1.8} />
      </Tile>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <p
            className="font-display truncate text-[1rem] font-semibold tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            {ekub.name}
          </p>
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold"
            style={
              invited
                ? { background: 'var(--accent-light)', color: 'var(--accent)' }
                : { background: 'var(--neo-bg)', color: 'var(--t-muted)' }
            }
          >
            {invited ? 'Invited' : ekub.status === 'DRAFT' ? 'Not started' : 'Running'}
          </span>
        </div>
        <p className="text-[0.76rem]" style={{ color: 'var(--t-dim)' }}>
          {ekubMoney(ekub.slotAmount, ekub)} a turn, {cadenceLabel(ekub.cadence)} ·{' '}
          {ekub.memberCount} {ekub.memberCount === 1 ? 'person' : 'people'}
        </p>
      </div>
    </Link>
  );
}
