'use client';

// EXP-06 Custom Split - Percentage -- docs/ABRO_FRONTEND_SPEC.md §4
// (lines 854-896). Ported from the prototype's percentage-split editor
// (App.tsx:3495-3551), same deviations as EXP-05 (exact split): a
// 3-state balanced/over/under badge, and "Split remaining equally" only
// fills empty inputs (with whatever percentage is left of 100%) rather
// than overwriting everyone -- "Reset all" is the separate, explicit
// way to clear entered values.
//
// Phase 8: everything here counts in whole basis points (33.33% ->
// 3333), because that's how apps/api checks a PERCENTAGE split -- it
// must total exactly 10000, not "about 100". The badge and "Split
// remaining equally" use the same unit so they can't disagree with the
// server (0.1 and 1/3-style splits used to look balanced here and then
// fail on submit).

import { ETB, formatMoney } from '@abro/types';
import { useRouter } from 'next/navigation';

import { useExpenseDirectory } from '~/lib/expense-directory';
import { ME, useExpenseDraft } from '~/lib/expense-draft';
import {
  computeShares,
  isSplitValid,
  parseAmount,
  percentageBasisPoints,
} from '~/lib/expense-split';

export default function AddExpensePercentageSplitPage() {
  const router = useRouter();
  const { draft, update } = useExpenseDraft();

  const total = parseAmount(draft.amountInput);
  const { resolve } = useExpenseDirectory();
  const participants = draft.participantIds.map(resolve);
  const percentSumBp = draft.participantIds.reduce(
    (sum, id) => sum + percentageBasisPoints(draft.percentages[id]),
    0,
  );
  const diffBp = 10000 - percentSumBp;
  const valid = isSplitValid(draft, draft.participantIds, total);
  const amounts = computeShares(draft, draft.participantIds, total);

  const setPercent = (id: string, value: string) =>
    update({ percentages: { ...draft.percentages, [id]: value } });

  const splitRemainingEqually = () => {
    const empty = draft.participantIds.filter((id) => !draft.percentages[id]);
    if (empty.length === 0) {
      return;
    }
    const filledBp = draft.participantIds
      .filter((id) => draft.percentages[id])
      .reduce((sum, id) => sum + percentageBasisPoints(draft.percentages[id]), 0);
    const remainingBp = Math.max(0, 10000 - filledBp);
    // Whole basis points, with the leftover handed out one at a time
    // from the top, so the filled-in values total exactly 100%
    // (3 people -> 33.34 / 33.33 / 33.33, not 33.3 x 3 = 99.9).
    const base = Math.floor(remainingBp / empty.length);
    const extra = remainingBp % empty.length;
    const next = { ...draft.percentages };
    empty.forEach((id, i) => {
      next[id] = formatPercent(base + (i < extra ? 1 : 0));
    });
    update({ percentages: next });
  };

  const resetAll = () => update({ percentages: {} });

  const badge =
    diffBp === 0
      ? { text: '✓ Balanced', color: 'var(--c-green)', bg: 'var(--green-bg)' }
      : diffBp > 0
        ? {
            text: `${formatPercent(diffBp)}% left`,
            color: 'var(--c-amber)',
            bg: 'rgba(245,158,11,0.12)',
          }
        : {
            text: `${formatPercent(-diffBp)}% over`,
            color: 'var(--c-red)',
            bg: 'var(--red-bg)',
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
            Percentage split
          </p>
          <span
            className="rounded-lg px-2.5 py-0.5 font-mono text-[0.78rem] font-semibold"
            style={{ background: badge.bg, color: badge.color }}
          >
            {badge.text}
          </span>
        </div>

        {participants.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold text-white"
              style={{ background: p.color }}
            >
              {p.initials}
            </div>
            <span
              className="flex-1 text-[0.85rem] font-medium"
              style={{ color: 'var(--t-secondary)' }}
            >
              {p.id === ME ? 'You' : p.name}
            </span>
            <div className="relative w-20">
              <input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={draft.percentages[p.id] ?? ''}
                onChange={(e) => setPercent(p.id, e.target.value)}
                className="neo-input font-mono text-[0.88rem] font-semibold"
                style={{ color: 'var(--t-primary)', padding: '8px 24px 8px 12px' }}
              />
              <span
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.7rem]"
                style={{ color: 'var(--t-dim)' }}
              >
                %
              </span>
            </div>
            <span
              className="w-[70px] text-right font-mono text-[0.8rem] font-semibold"
              style={{ color: 'var(--t-muted)' }}
            >
              {formatMoney(amounts[p.id] ?? 0n, ETB)}
            </span>
          </div>
        ))}

        <div className="flex gap-2">
          <button
            onClick={splitRemainingEqually}
            className="neo-flat rounded-[10px] border-none px-3.5 py-2 text-[0.75rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Split remaining equally
          </button>
          <button
            onClick={resetAll}
            className="neo-flat rounded-[10px] border-none px-3.5 py-2 text-[0.75rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Reset all
          </button>
        </div>
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

/** 3333 -> "33.33", 5000 -> "50", 150 -> "1.5". */
function formatPercent(basisPoints: number): string {
  return String(basisPoints / 100);
}
