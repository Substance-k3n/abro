'use client';

// GRP-08 Simplified Debt View -- docs/ABRO_FRONTEND_SPEC.md §5 (lines
// 1454-1495). The standalone version of GRP-05's Simplified view, with
// an explanation of the algorithm. Phase 8 slice 8b: the plan is
// apps/api's GET /balances/groups/{id}/simplified (~/lib/balances-api.ts)
// -- the server computes it, the browser only shows it.
//
// Deviations:
//  - "Payment count: '3 payments instead of 7'" -- the "instead of 7"
//    half needs the unsimplified pairwise graph, which apps/api doesn't
//    expose. Shows the real number only: "N payments to settle up".
//  - "Info modal" is an inline panel under the info button, consistent
//    with this app's inline reveals (EXP-09's actions menu, etc.).
//  - "Mark as Settled" opens /settle only for payments you make
//    (ADR-003: only the debtor records a settlement); others stay
//    disabled. See ~/components/PaymentRow.tsx.

import { EmptyState } from '@abro/ui';
import { ArrowLeft, Handshake, Info } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { PaymentRow } from '~/components/PaymentRow';
import { type SimplifiedPayment, getSimplifiedPayments } from '~/lib/balances-api';
import { type GroupView, GroupViewLoader } from '~/lib/group-view';

export default function SimplifiedDebtsPage() {
  const params = useParams<{ id: string }>();
  const [payments, setPayments] = useState<SimplifiedPayment[]>([]);

  return (
    <GroupViewLoader
      groupId={params.id}
      extra={() => getSimplifiedPayments(params.id).then(setPayments)}
    >
      {(view) => <SimplifiedDebts view={view} payments={payments} />}
    </GroupViewLoader>
  );
}

function SimplifiedDebts({ view, payments }: { view: GroupView; payments: SimplifiedPayment[] }) {
  const router = useRouter();
  const [showInfo, setShowInfo] = useState(false);
  const { group } = view;

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
          Simplified Debts
        </h2>
        <div className="relative">
          <button
            onClick={() => setShowInfo((v) => !v)}
            aria-label="How this works"
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
            {payments.map((tx) => (
              <PaymentRow key={`${tx.fromUserId}-${tx.toUserId}`} view={view} payment={tx} large />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
