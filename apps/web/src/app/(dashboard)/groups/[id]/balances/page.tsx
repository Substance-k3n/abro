'use client';

// GRP-05 Group Balances -- docs/ABRO_FRONTEND_SPEC.md §5 (lines 1312-
// 1360). Individual view (net position per member) and Simplified view
// (who pays whom), toggled. Phase 8 slice 8b: nets from
// GET /balances/groups/{id} and the plan from its /simplified sibling,
// both via ~/lib/balances-api.ts -- apps/api computes both, so the
// browser never re-derives a balance.
//
// Deviations:
//  - "Who owes whom (full network)": apps/api exposes net positions and
//    the simplified plan, not a raw pairwise graph, so Individual shows
//    nets only (the spec's own "Individual Balance List" component).
//  - The Simplified view is offered only when the group's "Simplify
//    debts" setting is on (GRP-07); off, only Individual shows.
//  - "Mark as settled" opens /settle only for payments you make --
//    apps/api only lets the debtor record a settlement (ADR-003); a
//    payment owed to you stays disabled.
//  - Someone who left the group but still has a balance is listed,
//    marked "(left)", so no debt disappears from view.

import { ETB, abs, formatMoney } from '@abro/types';
import { EmptyState } from '@abro/ui';
import { ArrowLeft, Handshake } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { PaymentRow } from '~/components/PaymentRow';
import { type SimplifiedPayment, getSimplifiedPayments } from '~/lib/balances-api';
import { type GroupView, GroupViewLoader, PersonAvatar, nameIn } from '~/lib/group-view';

type View = 'individual' | 'simplified';

export default function GroupBalancesPage() {
  const params = useParams<{ id: string }>();
  const [payments, setPayments] = useState<SimplifiedPayment[]>([]);

  return (
    <GroupViewLoader
      groupId={params.id}
      extra={() => getSimplifiedPayments(params.id).then(setPayments)}
    >
      {(view) => <GroupBalances view={view} payments={payments} />}
    </GroupViewLoader>
  );
}

function GroupBalances({ view, payments }: { view: GroupView; payments: SimplifiedPayment[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<View>('individual');
  const { group, activeMembers, nets } = view;

  const ids = [
    ...activeMembers.map((m) => m.userId),
    ...[...nets.keys()].filter((id) => !activeMembers.some((m) => m.userId === id)),
  ];
  const allSettled = [...nets.values()].every((b) => b === 0n);

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push(`/groups/${group.id}`)}
          className="flex min-w-0 items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{group.name}</span>
        </button>
        <h2
          className="font-display shrink-0 px-2 text-[1.05rem] font-bold"
          style={{ color: 'var(--t-primary)' }}
        >
          Group Balances
        </h2>
        <div className="w-[60px]" />
      </div>

      {group.simplifyDebts && !allSettled && (
        <div className="neo-inset-sm mb-5 flex gap-1 rounded-[14px] p-1">
          {(['individual', 'simplified'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className={`neo-tab flex-1 border-none capitalize ${mode === v ? 'active' : ''}`}
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
      ) : mode === 'individual' ? (
        <div className="flex flex-col gap-2.5">
          {ids.map((id) => {
            const bal = nets.get(id) ?? 0n;
            return (
              <div
                key={id}
                className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
              >
                <PersonAvatar view={view} userId={id} size={38} />
                <span
                  className="flex-1 text-[0.88rem] font-semibold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {nameIn(view, id)}
                  {!activeMembers.some((m) => m.userId === id) && (
                    <span
                      className="ml-1.5 text-[0.7rem] font-normal"
                      style={{ color: 'var(--t-dim)' }}
                    >
                      (left)
                    </span>
                  )}
                </span>
                <span
                  className="font-mono text-[0.88rem] font-bold"
                  style={{
                    color: bal > 0n ? 'var(--c-green)' : bal < 0n ? 'var(--c-red)' : 'var(--t-dim)',
                  }}
                >
                  {bal === 0n ? 'Settled' : `${bal > 0n ? '+' : '-'}${formatMoney(abs(bal), ETB)}`}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {payments.map((tx) => (
            <PaymentRow key={`${tx.fromUserId}-${tx.toUserId}`} view={view} payment={tx} />
          ))}
        </div>
      )}
    </div>
  );
}
