'use client';

// GRP-08 Simplified Debt View -- docs/ABRO_FRONTEND_SPEC.md §5 (lines
// 1454-1495). The standalone version of GRP-05's Simplified tab, with
// an explanation and an info panel on the algorithm.
//
// Deviations:
//  - "Payment count: '3 payments instead of 7'" -- the "instead of 7"
//    half needs a real unsimplified pairwise debt graph to count
//    honestly, and (same reasoning as GRP-05's header comment) this
//    app only models aggregate net positions, not a real pairwise
//    ledger. Fabricating a plausible "7" would be exactly the kind of
//    invented data this project's workflow avoids. Shows only the real
//    number: "N payments to settle up".
//  - "Info modal" is an inline dismissible panel below the info
//    button, not a full-screen backdrop modal -- consistent with this
//    app's established pattern of inline reveals over a modal library
//    (Expense Detail's "•••" menu, Group Members' "•••" menu, etc.).
//  - "Mark as Settled" / "Record full settlement" are disabled
//    placeholders, same reasoning as GRP-05's identical button and
//    every other destructive/state-changing mock action in this app.

import { ETB, type NetPosition, formatMoney, simplifyDebts } from '@abro/types';
import { Avatar, EmptyState } from '@abro/ui';
import { ArrowLeft, ArrowRight, Handshake, Info, Users } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ME } from '~/lib/expense-draft';
import { GROUPS, GROUP_BALANCES, resolveParticipants } from '~/lib/mock-data';

export default function SimplifiedDebtsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [showInfo, setShowInfo] = useState(false);

  const group = GROUPS.find((g) => g.id === params.id);

  if (!group) {
    return (
      <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
        <button
          onClick={() => router.push('/groups')}
          className="mb-4 flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Groups
        </button>
        <EmptyState
          icon={<Users size={26} strokeWidth={1.5} />}
          title="Group not found"
          description="This group doesn't exist, or the link may be out of date."
        />
      </div>
    );
  }

  const balances = GROUP_BALANCES[group.id] ?? {};
  const positions: NetPosition[] = Object.entries(balances).map(([userId, netBalance]) => ({
    userId,
    netBalance,
  }));
  const payments = simplifyDebts(positions);

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push(`/groups/${group.id}/balances`)}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> {group.name}
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Simplified Debts
        </h2>
        <div className="relative">
          <button
            onClick={() => setShowInfo((v) => !v)}
            className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ color: 'var(--accent)' }}
          >
            <Info size={17} strokeWidth={2} />
          </button>
          {showInfo && (
            <div className="neo-raised-sm absolute right-0 top-11 z-10 w-64 rounded-2xl p-4">
              <p
                className="mb-2 text-[0.82rem] font-semibold"
                style={{ color: 'var(--t-primary)' }}
              >
                How this works
              </p>
              <p
                className="mb-2 text-[0.76rem] leading-relaxed"
                style={{ color: 'var(--t-muted)' }}
              >
                Total obligations remain exactly the same -- only the payment path is optimized, so
                fewer transactions settle the same debts.
              </p>
              <p className="text-[0.76rem] leading-relaxed" style={{ color: 'var(--t-muted)' }}>
                Everyone still ends up owing/being owed the same net amount as before.
              </p>
            </div>
          )}
        </div>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon={<Handshake size={26} strokeWidth={1.5} />}
          title="All settled up!"
          description="No outstanding balances in this group."
        />
      ) : (
        <>
          <p className="mb-4 text-[0.85rem]" style={{ color: 'var(--t-muted)' }}>
            To settle all debts with minimum transactions:{' '}
            <strong style={{ color: 'var(--t-primary)' }}>
              {payments.length} payment{payments.length !== 1 ? 's' : ''} to settle up
            </strong>
            .
          </p>

          <div className="flex flex-col gap-2.5">
            {payments.map((tx) => {
              const from = resolveParticipants([tx.fromUserId])[0]!;
              const to = resolveParticipants([tx.toUserId])[0]!;
              return (
                <div
                  key={`${tx.fromUserId}-${tx.toUserId}`}
                  className="neo-raised-sm flex flex-col gap-2.5 rounded-2xl p-4"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={from.initials} color={from.color} size={36} />
                    <span
                      className="text-[0.85rem] font-semibold"
                      style={{ color: 'var(--t-primary)' }}
                    >
                      {from.id === ME ? 'You' : from.name.split(' ')[0]}
                    </span>
                    <ArrowRight size={16} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
                    <Avatar initials={to.initials} color={to.color} size={36} />
                    <span
                      className="flex-1 text-[0.85rem] font-semibold"
                      style={{ color: 'var(--t-primary)' }}
                    >
                      {to.id === ME ? 'You' : to.name.split(' ')[0]}
                    </span>
                    <span
                      className="font-mono text-[0.95rem] font-bold"
                      style={{ color: 'var(--t-primary)' }}
                    >
                      {formatMoney(tx.amount, ETB)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    className="neo-flat cursor-not-allowed rounded-xl py-2 text-[0.78rem] font-semibold opacity-50"
                    style={{ color: 'var(--c-green)' }}
                  >
                    Mark as Settled
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
