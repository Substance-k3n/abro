'use client';

// STL-03 Settle Up - Confirm -- docs/ABRO_FRONTEND_SPEC.md §6 (lines
// 1641-1677).
//
// Deviations:
//  - Date is a read-only "Today" label, not a picker -- no date-picker
//    component exists anywhere else in this app (every other
//    display-ready date in mock-data.ts is a plain string), and every
//    settlement created here genuinely does happen "now". Not worth
//    building a picker for a field that's always going to read today's
//    date in this mock-data phase.
//  - The "Important Notice" copy is taken directly from the spec text
//    (ABRO_PRD.md §19's "Important" note says the same thing) --
//    real product copy, not paraphrased.

import { ArrowLeft, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ETB, formatMoney } from '@abro/types';

import { parseAmount } from '~/lib/expense-split';
import {
  SETTLEMENT_METHODS,
  createSettlement,
  getOutstanding,
  resolveParticipants,
} from '~/lib/mock-data';
import { useSettleDraft } from '~/lib/settle-draft';

export default function SettleConfirmPage() {
  const router = useRouter();
  const { draft, update } = useSettleDraft();

  const outstanding = draft.toUserId ? getOutstanding(draft.toUserId, draft.groupId) : 0n;
  const amount = parseAmount(draft.amountInput);

  useEffect(() => {
    if (!draft.toUserId || amount <= 0n || amount > outstanding) {
      router.replace('/settle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.toUserId, amount, outstanding]);

  if (!draft.toUserId || amount <= 0n || amount > outstanding) {
    return null;
  }

  const person = resolveParticipants([draft.toUserId])[0]!;
  const remaining = outstanding - amount;

  const confirm = () => {
    createSettlement({
      toUserId: draft.toUserId!,
      groupId: draft.groupId,
      amount,
      method: draft.method,
      note: draft.note,
    });
    router.push('/settle/success');
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/settle/amount')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Back
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Confirm
        </h2>
        <div className="w-[60px]" />
      </div>

      <div className="neo-raised-sm rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
            Settling with
          </span>
          <span className="text-[0.88rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
            {person.name}
          </span>
        </div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
            Amount
          </span>
          <span
            className="font-mono text-[0.95rem] font-bold"
            style={{ color: 'var(--t-primary)' }}
          >
            {formatMoney(amount, ETB)}
          </span>
        </div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
            Direction
          </span>
          <span className="text-[0.85rem] font-semibold" style={{ color: 'var(--c-red)' }}>
            You pay
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[0.82rem]" style={{ color: 'var(--t-dim)' }}>
            Balance after
          </span>
          <span
            className="font-mono text-[0.85rem] font-bold"
            style={{ color: remaining === 0n ? 'var(--t-dim)' : 'var(--c-red)' }}
          >
            {remaining === 0n ? 'Settled' : `-${formatMoney(remaining, ETB)}`}
          </span>
        </div>
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Payment method
        </label>
        <div className="flex flex-wrap gap-2">
          {SETTLEMENT_METHODS.map((m) => (
            <button
              key={m}
              onClick={() => update({ method: m })}
              className="neo-flat rounded-xl border-none px-3.5 py-2 text-[0.8rem] font-medium"
              style={{
                color: draft.method === m ? 'var(--accent)' : 'var(--t-muted)',
                ...(draft.method === m ? { boxShadow: '0 0 0 2px var(--accent)' } : {}),
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Note (optional)
        </label>
        <input
          className="neo-input"
          placeholder="e.g. Cash at dinner"
          value={draft.note}
          onChange={(e) => update({ note: e.target.value })}
        />
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Date
        </label>
        <div
          className="neo-inset-sm rounded-xl px-4 py-2.5 text-[0.85rem]"
          style={{ color: 'var(--t-primary)' }}
        >
          Today
        </div>
      </div>

      <div className="neo-inset-sm flex gap-2.5 rounded-2xl p-4">
        <Info
          size={17}
          strokeWidth={2}
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--accent)' }}
        />
        <p className="text-[0.78rem] leading-relaxed" style={{ color: 'var(--t-muted)' }}>
          This records that payment was made. ABRO does not process payments -- make the actual
          payment separately.
        </p>
      </div>

      <div className="flex gap-2.5">
        <button
          onClick={() => router.push('/settle')}
          className="neo-flat flex-1 rounded-2xl border-none py-3.5 text-[0.9rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          className="neo-btn-green font-display flex-[2] rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold"
        >
          Confirm Settlement
        </button>
      </div>
    </div>
  );
}
