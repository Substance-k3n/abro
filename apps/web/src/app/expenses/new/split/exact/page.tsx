'use client';

// EXP-05 Custom Split - Exact Amounts -- docs/ABRO_FRONTEND_SPEC.md §4
// (lines 810-852). Ported from the prototype's exact-split editor
// (App.tsx:3441-3491): per-participant amount input, running total
// badge, quick-fill button.
//
// Two deviations from the prototype, both to match the spec text more
// closely:
//  - The badge is 3-state (balanced / over / under), matching spec's
//    "Red if over, Orange if under" -- the prototype's is 2-state
//    (balanced vs. not, always red otherwise).
//  - "Split remaining equally" (spec's actual wording) only fills
//    participants with an EMPTY input, splitting whatever's left of the
//    total among just those -- it does NOT touch amounts already
//    entered. The prototype's "Auto-fill equal" is a blunter "overwrite
//    everyone" action; spec explicitly separates that into its own
//    "Reset all" button, which this port also has.

import { ETB, formatMoney, splitEqually } from '@abro/types';
import { useRouter } from 'next/navigation';

import { ME, useExpenseDraft } from '~/lib/expense-draft';
import { enteredExactTotal, isSplitValid, parseAmount } from '~/lib/expense-split';
import { resolveParticipants } from '~/lib/mock-data';

export default function AddExpenseExactSplitPage() {
  const router = useRouter();
  const { draft, update } = useExpenseDraft();

  const total = parseAmount(draft.amountInput);
  const participants = resolveParticipants(draft.participantIds);
  const entered = enteredExactTotal(draft.exactAmounts, draft.participantIds);
  const diff = total - entered;
  const valid = isSplitValid(draft, draft.participantIds, total);

  const setAmount = (id: string, value: string) =>
    update({ exactAmounts: { ...draft.exactAmounts, [id]: value } });

  const splitRemainingEqually = () => {
    const empty = draft.participantIds.filter((id) => !draft.exactAmounts[id]);
    if (empty.length === 0) {
      return;
    }
    const filledSum = draft.participantIds
      .filter((id) => draft.exactAmounts[id])
      .reduce((sum, id) => sum + parseAmount(draft.exactAmounts[id] ?? ''), 0n);
    const remaining = total - filledSum;
    const shares = remaining > 0n ? splitEqually(remaining, empty.length) : empty.map(() => 0n);
    const next = { ...draft.exactAmounts };
    empty.forEach((id, i) => {
      next[id] = (Number(shares[i]) / 10 ** ETB.decimalDigits).toString();
    });
    update({ exactAmounts: next });
  };

  const resetAll = () => update({ exactAmounts: {} });

  const badge =
    diff === 0n
      ? { text: '✓ Balanced', color: 'var(--c-green)', bg: 'var(--green-bg)' }
      : diff > 0n
        ? {
            text: `${formatMoney(diff, ETB)} left`,
            color: 'var(--c-amber)',
            bg: 'rgba(245,158,11,0.12)',
          }
        : { text: `${formatMoney(-diff, ETB)} over`, color: 'var(--c-red)', bg: 'var(--red-bg)' };

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
            Exact amounts
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
            <div className="relative w-[120px]">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={draft.exactAmounts[p.id] ?? ''}
                onChange={(e) => setAmount(p.id, e.target.value)}
                className="neo-input font-mono text-[0.88rem] font-semibold"
                style={{ color: 'var(--t-primary)', padding: '8px 40px 8px 12px' }}
              />
              <span
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.65rem]"
                style={{ color: 'var(--t-dim)' }}
              >
                ETB
              </span>
            </div>
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
