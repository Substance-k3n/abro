'use client';

// STL-02 Settle Up - Enter Amount -- docs/ABRO_FRONTEND_SPEC.md §6
// (lines 1592-1639).
//
// Deviations:
//  - "Calculator-style keypad on mobile" isn't built -- same call as
//    EXP-01's amount input (see its header comment): a plain
//    `type="number"` input already gets the OS numeric keypad.
//  - No date/currency picker here -- currency is fixed (ETB-only app,
//    same as everywhere else); there's no per-settlement date field in
//    this screen at all (STL-03 has a read-only "Today", see its
//    header comment).
//
// Reads `toUserId`/`groupId` from its own `?toUserId=`/`?groupId=` query
// params (every entry point -- STL-01's rows and its own `?friendId=`/
// `?groupId=` redirect -- passes them this way) rather than trusting
// SettleDraftProvider to already hold them: a context update made by
// the page navigating here and this page's first render are two
// different components, with no guarantee the update commits before
// this page reads it. Confirmed by a real repro during development.
// Resolved values are mirrored into the shared draft via effect so
// Confirm/Success (later steps) can keep reading from context alone.

import { ArrowRight, ChevronLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { ETB, formatMoney, toDecimal } from '@abro/types';

import { parseAmount } from '~/lib/expense-split';
import { getOutstanding, resolveParticipants } from '~/lib/mock-data';
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

  const toUserId = searchParams.get('toUserId');
  const groupId = searchParams.get('groupId');
  const outstanding = toUserId ? getOutstanding(toUserId, groupId) : 0n;

  useEffect(() => {
    if (!toUserId || outstanding <= 0n) {
      router.replace('/settle');
      return;
    }
    if (draft.toUserId !== toUserId || draft.groupId !== groupId) {
      update({ toUserId, groupId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toUserId, groupId, outstanding]);

  if (!toUserId || outstanding <= 0n) {
    return null;
  }

  const person = resolveParticipants([toUserId])[0]!;
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
          Settle with {person.name.split(' ')[0]}
        </h2>
        <div className="w-[60px]" />
      </div>

      <div className="neo-inset-sm rounded-2xl px-4 py-3 text-center">
        <p className="mb-1 text-[0.76rem]" style={{ color: 'var(--t-dim)' }}>
          You owe {person.name.split(' ')[0]}
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
        onClick={() => router.push('/settle/confirm')}
        disabled={!isValid}
        className="neo-btn-accent font-display mt-2 flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next <ArrowRight size={17} strokeWidth={2.25} />
      </button>
    </div>
  );
}
