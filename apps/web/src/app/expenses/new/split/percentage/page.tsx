'use client';

// EXP-06 Custom Split - Percentage -- docs/ABRO_FRONTEND_SPEC.md §4
// (lines 854-896). Ported from the prototype's percentage-split editor
// (App.tsx:3495-3551), same deviations as EXP-05 (exact split): a
// 3-state balanced/over/under badge, and "Split remaining equally" only
// fills empty inputs (with whatever percentage is left of 100%) rather
// than overwriting everyone -- "Reset all" is the separate, explicit
// way to clear entered values.

import { ETB, formatMoney } from '@abro/types';
import { useRouter } from 'next/navigation';

import { ME, useExpenseDraft } from '~/lib/expense-draft';
import { computeShares, isSplitValid, parseAmount } from '~/lib/expense-split';
import { resolveParticipants } from '~/lib/mock-data';

export default function AddExpensePercentageSplitPage() {
  const router = useRouter();
  const { draft, update } = useExpenseDraft();

  const total = parseAmount(draft.amountInput);
  const participants = resolveParticipants(draft.participantIds);
  const percentSum = draft.participantIds.reduce(
    (sum, id) => sum + (Number(draft.percentages[id] ?? '0') || 0),
    0,
  );
  const diff = 100 - percentSum;
  const valid = isSplitValid(draft, draft.participantIds, total);
  const amounts = computeShares(draft, draft.participantIds, total);

  const setPercent = (id: string, value: string) =>
    update({ percentages: { ...draft.percentages, [id]: value } });

  const splitRemainingEqually = () => {
    const empty = draft.participantIds.filter((id) => !draft.percentages[id]);
    if (empty.length === 0) {
      return;
    }
    const filledSum = draft.participantIds
      .filter((id) => draft.percentages[id])
      .reduce((sum, id) => sum + (Number(draft.percentages[id]) || 0), 0);
    const remaining = Math.max(0, 100 - filledSum);
    const each = (remaining / empty.length).toFixed(1);
    const next = { ...draft.percentages };
    empty.forEach((id) => {
      next[id] = each;
    });
    update({ percentages: next });
  };

  const resetAll = () => update({ percentages: {} });

  const badge =
    Math.abs(diff) < 0.01
      ? { text: '✓ Balanced', color: 'var(--c-green)', bg: 'var(--green-bg)' }
      : diff > 0
        ? { text: `${diff.toFixed(0)}% left`, color: 'var(--c-amber)', bg: 'rgba(245,158,11,0.12)' }
        : {
            text: `${Math.abs(diff).toFixed(0)}% over`,
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
