'use client';

// GRP-05 Group Balances -- docs/ABRO_FRONTEND_SPEC.md §5 (lines 1312-
// 1360). Individual view (net position per member), Who owes whom (each
// pair's own debt) and Simplified view (fewest payments), as tabs.
// Phase 8 slice 8b: nets from GET /balances/groups/{id}, the pairs from
// its /raw sibling and the plan from /simplified, all via
// ~/lib/balances-api.ts -- apps/api computes them, so the browser never
// re-derives a balance.
//
// Deviations:
//  - "Who owes whom (full network)" is its own tab, always there: the
//    simplified plan can route a debt through someone who never shared a
//    bill with the payer (A owes B, C owes B, A owes D -> "C pays D"),
//    and testers needed to see the real pairs.
//  - The Simplified view is offered only when the group's "Simplify
//    debts" setting is on (GRP-07).
//  - "Mark as settled" opens /settle only for payments you make --
//    apps/api only lets the debtor record a settlement (ADR-003); a
//    payment owed to you stays disabled.
//  - Someone who left the group but still has a balance is listed,
//    marked "(left)", so no debt disappears from view.
//  - A debt open 30+ days is tagged "Overdue", for every member to see
//    (ADR-023, the user's choice).

import { ETB, abs, formatMoney } from '@abro/types';
import { EmptyState } from '@abro/ui';
import { ArrowLeft, Handshake } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { OverdueTag } from '~/components/OverdueTag';
import { PaymentRow } from '~/components/PaymentRow';
import {
  type SimplifiedPayment,
  getRawGroupDebts,
  getSimplifiedPayments,
} from '~/lib/balances-api';
import { type GroupView, GroupViewLoader, PersonAvatar, nameIn } from '~/lib/group-view';

type View = 'individual' | 'raw' | 'simplified';

const VIEW_LABELS: Record<View, string> = {
  individual: 'Individual',
  raw: 'Who owes whom',
  simplified: 'Simplified',
};

export default function GroupBalancesPage() {
  const params = useParams<{ id: string }>();
  const [payments, setPayments] = useState<SimplifiedPayment[]>([]);
  const [rawDebts, setRawDebts] = useState<SimplifiedPayment[]>([]);

  return (
    <GroupViewLoader
      groupId={params.id}
      extra={() =>
        Promise.all([
          getSimplifiedPayments(params.id).then(setPayments),
          getRawGroupDebts(params.id).then(setRawDebts),
        ]).then(() => undefined)
      }
    >
      {(view) => <GroupBalances view={view} payments={payments} rawDebts={rawDebts} />}
    </GroupViewLoader>
  );
}

function GroupBalances({
  view,
  payments,
  rawDebts,
}: {
  view: GroupView;
  payments: SimplifiedPayment[];
  rawDebts: SimplifiedPayment[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<View>('individual');
  const { group, activeMembers, nets, owingSince } = view;

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

      {!allSettled && (
        <div className="neo-inset-sm mb-5 flex gap-1 rounded-[14px] p-1">
          {(group.simplifyDebts
            ? (['individual', 'raw', 'simplified'] as const)
            : (['individual', 'raw'] as const)
          ).map((v) => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className={`neo-tab flex-1 whitespace-nowrap border-none ${mode === v ? 'active' : ''}`}
            >
              {VIEW_LABELS[v]}
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
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span
                    className="text-[0.88rem] font-semibold"
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
                  {bal < 0n && <OverdueTag owingSince={owingSince.get(id)} />}
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
      ) : mode === 'raw' ? (
        <>
          <p className="mb-4 text-[0.82rem]" style={{ color: 'var(--t-muted)' }}>
            What each person owes the people who actually paid for them, before any simplifying.
          </p>
          <div className="flex flex-col gap-2.5">
            {rawDebts.map((tx) => (
              <PaymentRow key={`${tx.fromUserId}-${tx.toUserId}`} view={view} payment={tx} raw />
            ))}
          </div>
        </>
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
