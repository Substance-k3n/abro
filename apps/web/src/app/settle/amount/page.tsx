'use client';

// STL-02 Settle Up - Enter Amount -- docs/ABRO_FRONTEND_SPEC.md §6
// (lines 1592-1639). Phase 8 slice 9b: who you're paying and the most
// you can settle come from ~/lib/settlements-api.ts's loadSettleTarget
// (apps/api's own rule, ADR-010 for groups); apps/api re-checks on
// submit.
//
// Deviations:
//  - No calculator keypad: a `type="number"` input already gets the OS
//    numeric keypad (same call as EXP-01).
//  - No date/currency picker: a settlement is recorded "now", in ETB.
//  - Nothing to settle (they're not your friend / not in the group, or
//    you don't owe them) shows a message instead of an amount form.
//
// Reads `toUserId`/`groupId` from its own query params (every entry
// point passes them this way) rather than trusting the draft to hold
// them already -- the previous route's context update may not have
// committed yet. Resolved values are mirrored into the draft so
// Confirm/Success can read them from context.

import { ArrowRight, ChevronLeft, Handshake } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ETB, formatMoney, toDecimal } from '@abro/types';
import { EmptyState } from '@abro/ui';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { parseAmount } from '~/lib/expense-split';
import { type SettleTarget, loadSettleTarget } from '~/lib/settlements-api';
import { useSettleDraft } from '~/lib/settle-draft';

export default function SettleAmountPage() {
  return (
    <Suspense>
      <SettleAmountForm />
    </Suspense>
  );
}

function SettleAmountForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { draft, update } = useSettleDraft();
  const [target, setTarget] = useState<SettleTarget | null | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);

  const toUserId = searchParams.get('toUserId');
  const groupId = searchParams.get('groupId');

  const load = () => {
    setError(null);
    setTarget('loading');
    if (!toUserId) {
      setTarget(null);
      return;
    }
    loadSettleTarget(toUserId, groupId)
      .then((t) => {
        setTarget(t);
        if (t && (draft.toUserId !== toUserId || draft.groupId !== groupId)) {
          update({ toUserId, groupId, amountInput: '' });
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && [400, 403, 404].includes(err.status)) {
          setTarget(null);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load this balance.');
      });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [toUserId, groupId]);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (target === 'loading') {
    return <LoadingState />;
  }
  if (!target || target.outstanding <= 0n) {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => router.push('/settle')}
          className="flex items-center gap-1 self-start text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ChevronLeft size={16} strokeWidth={2.5} /> Settle Up
        </button>
        <EmptyState
          icon={<Handshake size={26} strokeWidth={1.5} />}
          title="Nothing to settle"
          description={
            target
              ? `You don't owe ${target.person.displayName.split(' ')[0]} anything${target.group ? ' in this group' : ''} right now.`
              : "This person isn't one of your friends, or isn't in this group."
          }
        />
      </div>
    );
  }

  const { outstanding, person } = target;
  const firstName = person.displayName.split(' ')[0];
  const amount = parseAmount(draft.amountInput);
  const isValid = amount > 0n && amount <= outstanding;
  const isPartial = amount > 0n && amount < outstanding;

  const fill = (value: bigint) => {
    update({ amountInput: toDecimal(value, ETB.decimalDigits).toFixed(ETB.decimalDigits) });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/settle')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ChevronLeft size={16} strokeWidth={2.5} /> Back
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Settle with {firstName}
        </h2>
        <div className="w-[60px]" />
      </div>

      <div className="neo-inset-sm rounded-2xl px-4 py-3 text-center">
        <p className="mb-1 text-[0.76rem]" style={{ color: 'var(--t-dim)' }}>
          {target.group
            ? `You can settle with ${firstName} in ${target.group.name}`
            : `You owe ${firstName}`}
        </p>
        <p
          className="font-display text-[1.4rem] font-extrabold tracking-tight"
          style={{ color: 'var(--c-red)' }}
        >
          {formatMoney(outstanding, ETB)}
        </p>
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Settlement amount
        </label>
        <div className="relative">
          <span
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[0.9rem] font-semibold"
            style={{ color: 'var(--t-dim)' }}
          >
            ETB
          </span>
          <input
            className="neo-input font-mono text-[1.2rem] font-bold"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={draft.amountInput}
            onChange={(e) => update({ amountInput: e.target.value })}
            style={{ color: 'var(--t-primary)', paddingLeft: 52 }}
          />
        </div>
        {amount > outstanding && (
          <p className="mt-2 pl-1 text-[0.76rem]" style={{ color: 'var(--c-red)' }}>
            Can&apos;t exceed the outstanding balance of {formatMoney(outstanding, ETB)}.
          </p>
        )}
        {isPartial && (
          <p className="mt-2 pl-1 text-[0.76rem]" style={{ color: 'var(--t-dim)' }}>
            Partial settlement -- {formatMoney(outstanding - amount, ETB)} will still be owed.
          </p>
        )}
      </div>

      <div className="flex gap-2.5">
        <button
          onClick={() => fill(outstanding)}
          className="neo-flat flex-1 rounded-xl border-none py-2.5 text-[0.82rem] font-semibold"
          style={{ color: 'var(--accent)' }}
        >
          Full amount
        </button>
        <button
          onClick={() => fill(outstanding / 2n)}
          className="neo-flat flex-1 rounded-xl border-none py-2.5 text-[0.82rem] font-semibold"
          style={{ color: 'var(--accent)' }}
        >
          Half amount
        </button>
      </div>

      <button
        onClick={() => router.push(`/settle/confirm`)}
        disabled={!isValid}
        className="neo-btn-accent font-display mt-2 flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next <ArrowRight size={17} strokeWidth={2.25} />
      </button>
    </div>
  );
}
