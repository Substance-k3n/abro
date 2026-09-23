'use client';

// GRP-05 Group Balances -- docs/ABRO_FRONTEND_SPEC.md §5 (lines 1312-
// 1360). Individual view (net position per member) and Simplified view
// (minimum-transaction payment plan), toggled.
//
// Deviations:
//  - "Who owes whom (full network)" (spec's Individual Balances bullet):
//    this app has no real pairwise expense/settlement graph modeled --
//    only aggregate net positions (GROUP_BALANCES, ~/lib/mock-data.ts).
//    Synthesizing a plausible-but-fake pairwise graph just to show
//    something under "full network" would be exactly the kind of
//    fabricated data this project's workflow explicitly avoids. Shows
//    net positions only (which the spec's own "Individual Balance
//    List" component description asks for -- avatar, name, net
//    balance), honestly labeled as such.
//  - Simplified view calls @abro/types' simplifyDebts() directly -- the
//    same tested function apps/api uses server-side (ABRO_PRD.md §18) --
//    over this group's GROUP_BALANCES entries.
//  - "Simplify toggle (if enabled in settings)": gated on
//    Group.simplifyDebts (GRP-07's Financial Settings toggle, added
//    alongside this screen) -- when off, only the Individual view is
//    offered (no method toggle shown at all, since there's nothing to
//    toggle between).
//  - "Mark as settled" links into the real /settle flow (Phase 6) only
//    for payments where you're the payer -- apps/api/internal/
//    settlements/service.go only lets the debtor record a settlement
//    (ADR-003), so a payment owed *to* you stays a disabled placeholder
//    (same reasoning as every other destructive/state-changing mock
//    action with no valid path from this session, e.g. Remove friend).

import { ETB, type NetPosition, formatMoney, simplifyDebts } from '@abro/types';
import { Avatar, EmptyState } from '@abro/ui';
import { ArrowLeft, ArrowRight, Handshake, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ME } from '~/lib/expense-draft';
import { GROUPS, GROUP_BALANCES, resolveParticipants } from '~/lib/mock-data';

type View = 'individual' | 'simplified';

export default function GroupBalancesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<View>('individual');

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
  const memberRows = resolveParticipants(['me', ...group.memberIds]);
  const allSettled = Object.values(balances).every((b) => b === 0n);

  const positions: NetPosition[] = Object.entries(balances).map(([userId, netBalance]) => ({
    userId,
    netBalance,
  }));
  const payments = simplifyDebts(positions);

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push(`/groups/${group.id}`)}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> {group.name}
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Group Balances
        </h2>
        <div className="w-[60px]" />
      </div>

      {group.simplifyDebts && (
        <div className="neo-inset-sm mb-5 flex gap-1 rounded-[14px] p-1">
          {(['individual', 'simplified'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`neo-tab flex-1 border-none capitalize ${view === v ? 'active' : ''}`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {allSettled ? (
        <EmptyState
          icon={<Handshake size={26} strokeWidth={1.5} />}
          title="All settled up!"
          description="No outstanding balances in this group."
        />
      ) : view === 'individual' ? (
        <div className="flex flex-col gap-2.5">
          {memberRows.map((p) => {
            const bal = balances[p.id] ?? 0n;
            return (
              <div
                key={p.id}
                className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
              >
                <Avatar initials={p.initials} color={p.color} size={38} />
                <span
                  className="flex-1 text-[0.88rem] font-semibold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {p.id === ME ? 'You' : p.name}
                </span>
                <span
                  className="font-mono text-[0.88rem] font-bold"
                  style={{
                    color: bal > 0n ? 'var(--c-green)' : bal < 0n ? 'var(--c-red)' : 'var(--t-dim)',
                  }}
                >
                  {bal === 0n
                    ? 'Settled'
                    : `${bal > 0n ? '+' : '-'}${formatMoney(bal < 0n ? -bal : bal, ETB)}`}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {payments.map((tx) => {
            const from = resolveParticipants([tx.fromUserId])[0]!;
            const to = resolveParticipants([tx.toUserId])[0]!;
            return (
              <div
                key={`${tx.fromUserId}-${tx.toUserId}`}
                className="neo-raised-sm flex items-center gap-2.5 rounded-2xl px-3.5 py-3"
              >
                <Avatar initials={from.initials} color={from.color} size={32} />
                <span
                  className="text-[0.85rem] font-medium"
                  style={{ color: 'var(--t-secondary)' }}
                >
                  {from.id === ME ? 'You' : from.name.split(' ')[0]}
                </span>
                <ArrowRight size={14} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
                <Avatar initials={to.initials} color={to.color} size={32} />
                <span
                  className="flex-1 text-[0.85rem] font-medium"
                  style={{ color: 'var(--t-secondary)' }}
                >
                  {to.id === ME ? 'You' : to.name.split(' ')[0]}
                </span>
                <span
                  className="mr-1 font-mono text-[0.85rem] font-bold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {formatMoney(tx.amount, ETB)}
                </span>
                {tx.fromUserId === ME ? (
                  <Link
                    href={`/settle?groupId=${group.id}&toUserId=${tx.toUserId}`}
                    className="neo-btn shrink-0 rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold"
                  >
                    Settle
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="They need to record this from their side"
                    className="neo-flat shrink-0 cursor-not-allowed rounded-lg px-2.5 py-1.5 text-[0.72rem] font-medium opacity-50"
                    style={{ color: 'var(--t-muted)' }}
                  >
                    Settle
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
