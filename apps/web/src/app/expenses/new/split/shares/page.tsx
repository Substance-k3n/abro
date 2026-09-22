'use client';

// EXP-07 Custom Split - Shares -- docs/ABRO_FRONTEND_SPEC.md §4 (lines
// 898-936). Ported from the prototype's shares editor (App.tsx:3555-
// 3591): per-participant +/- steppers (default weight 1), amount +
// percentage preview, total-shares summary badge.
//
// Spec lists two Quick Actions here -- "Reset all to 1" and "Equal
// shares" -- which are the same operation (setting every participant's
// weight to 1 necessarily makes the split equal too). Built as one
// button rather than two identical ones under different labels.

import { ETB, formatMoney } from '@abro/types';
import { useRouter } from 'next/navigation';

import { ME, useExpenseDraft } from '~/lib/expense-draft';
import { computeShares, isSplitValid, parseAmount } from '~/lib/expense-split';
import { resolveParticipants } from '~/lib/mock-data';

export default function AddExpenseSharesSplitPage() {
  const router = useRouter();
  const { draft, update } = useExpenseDraft();

  const total = parseAmount(draft.amountInput);
  const participants = resolveParticipants(draft.participantIds);
  const totalShares = draft.participantIds.reduce(
    (sum, id) => sum + Math.max(1, draft.shares[id] ?? 1),
    0,
  );
  const amounts = computeShares(draft, draft.participantIds, total);
  const valid = isSplitValid(draft, draft.participantIds, total);

  const setShares = (id: string, weight: number) =>
    update({ shares: { ...draft.shares, [id]: Math.max(1, weight) } });

  const resetToEqualShares = () => {
    const next: Record<string, number> = {};
    draft.participantIds.forEach((id) => {
      next[id] = 1;
    });
    update({ shares: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/expenses/new/split')}
          className="text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          Back
        </button>
        <h2 className="font-display text-[1.1rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Add Expense
        </h2>
        <div className="w-[60px]" />
      </div>

      <div className="neo-raised-sm flex flex-col gap-2.5 rounded-[20px] p-4">
        <div className="flex items-center justify-between">
          <p
            className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Share weights
          </p>
          <span
            className="rounded-lg px-2.5 py-0.5 font-mono text-[0.78rem] font-semibold"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
          >
            {totalShares} total shares
          </span>
        </div>

        {participants.map((p) => {
          const weight = Math.max(1, draft.shares[p.id] ?? 1);
          const pct = totalShares > 0 ? Math.round((weight / totalShares) * 100) : 0;
          return (
            <div key={p.id} className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold text-white"
                style={{ background: p.color }}
              >
                {p.initials}
              </div>
              <div className="flex-1">
                <p className="text-[0.85rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
                  {p.id === ME ? 'You' : p.name}
                </p>
                <p className="font-mono text-[0.65rem]" style={{ color: 'var(--t-dim)' }}>
                  {pct}% · {formatMoney(amounts[p.id] ?? 0n, ETB)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShares(p.id, weight - 1)}
                  className="neo-flat flex h-8 w-8 items-center justify-center rounded-[10px] border-none text-[1rem] font-bold"
                  style={{ color: 'var(--t-secondary)' }}
                >
                  −
                </button>
                <span
                  className="w-6 text-center font-mono text-[1rem] font-bold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {weight}
                </span>
                <button
                  onClick={() => setShares(p.id, weight + 1)}
                  className="neo-flat flex h-8 w-8 items-center justify-center rounded-[10px] border-none text-[1rem] font-bold"
                  style={{ color: 'var(--accent)' }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}

        <button
          onClick={resetToEqualShares}
          className="neo-flat self-start rounded-[10px] border-none px-3.5 py-2 text-[0.75rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Equal shares
        </button>
      </div>

      <button
        onClick={() => router.push('/expenses/new/review')}
        disabled={!valid}
        className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
