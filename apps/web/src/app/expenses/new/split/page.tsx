'use client';

// EXP-04 Add Expense - Split Method -- docs/ABRO_FRONTEND_SPEC.md §4
// (lines 762-808).
//
// The method cards use .split-card (a CSS class already ported in the
// wizard-foundation PR) and SPLIT_METHODS-style icon/label/description
// content -- ported from the prototype's SPLIT_METHODS constant
// (App.tsx:247), which has a `desc` field for exactly this ("Split
// evenly among all", etc.) even though the prototype's own live UI
// never renders it (it uses a compact icon-only tab row instead, and
// never references the .split-card class at all -- dead CSS in the
// prototype). Spec's EXP-04 explicitly asks for "Split method cards"
// with a description each, so this port uses the fuller card treatment
// the design system already had the pieces for, rather than the
// prototype's more compact (but description-less) tab row.
//
// Reconciling two spec lines that read as slightly contradictory:
// "Split Preview (for Equal): ... Next button" implies staying on this
// screen with a preview + Next, while "Interactions: If equal -> Review"
// reads as an immediate jump. Implemented as: selecting Equal (the
// default) shows the preview below with its own Next -> Review, so
// there's still a chance to review the breakdown before committing;
// selecting Exact/Percentage/Shares navigates immediately to that
// method's own screen, matching "Goes to -> EXP-0X" literally -- those
// screens have their own Next -> Review once their split is valid.

import { MoneyDisplay } from '@abro/ui';
import { BarChart2, Hash, LayoutGrid, SplitSquareHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ME, type SplitMethod, useExpenseDraft } from '~/lib/expense-draft';
import { computeShares, parseAmount } from '~/lib/expense-split';
import { resolveParticipants } from '~/lib/mock-data';

const METHODS: { id: SplitMethod; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'equal',
    label: 'Equal',
    desc: 'Split evenly among all',
    icon: <SplitSquareHorizontal size={22} strokeWidth={1.75} />,
  },
  {
    id: 'exact',
    label: 'Exact',
    desc: 'Enter specific amounts',
    icon: <Hash size={22} strokeWidth={1.75} />,
  },
  {
    id: 'percentage',
    label: 'Percent',
    desc: 'Split by percentage',
    icon: <BarChart2 size={22} strokeWidth={1.75} />,
  },
  {
    id: 'shares',
    label: 'Shares',
    desc: 'Split by share weight',
    icon: <LayoutGrid size={22} strokeWidth={1.75} />,
  },
];

const METHOD_ROUTE: Record<Exclude<SplitMethod, 'equal'>, string> = {
  exact: '/expenses/new/split/exact',
  percentage: '/expenses/new/split/percentage',
  shares: '/expenses/new/split/shares',
};

export default function AddExpenseSplitPage() {
  const router = useRouter();
  const { draft, update } = useExpenseDraft();

  const total = parseAmount(draft.amountInput);
  const participants = resolveParticipants(draft.participantIds);

  const selectMethod = (method: SplitMethod) => {
    update({ splitMethod: method });
    if (method !== 'equal') {
      router.push(METHOD_ROUTE[method]);
    }
  };

  const equalShares =
    draft.splitMethod === 'equal' ? computeShares(draft, draft.participantIds, total) : {};

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/expenses/new/participants')}
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

      <div className="grid grid-cols-2 gap-3">
        {METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => selectMethod(m.id)}
            className={`split-card flex flex-col items-center gap-1.5 text-center ${draft.splitMethod === m.id ? 'selected' : ''}`}
          >
            <span
              style={{ color: draft.splitMethod === m.id ? 'var(--accent)' : 'var(--t-muted)' }}
            >
              {m.icon}
            </span>
            <span className="text-[0.85rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
              {m.label}
            </span>
            <span className="text-[0.7rem]" style={{ color: 'var(--t-dim)' }}>
              {m.desc}
            </span>
          </button>
        ))}
      </div>

      {draft.splitMethod === 'equal' && total > 0n && participants.length > 0 && (
        <div className="neo-raised-sm flex flex-col gap-2.5 rounded-[20px] p-4">
          <p
            className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Equal split
          </p>
          {participants.map((p) => (
            <div
              key={p.id}
              className="neo-inset-sm flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
            >
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
              <MoneyDisplay
                amount={equalShares[p.id] ?? 0n}
                className="font-mono text-[0.85rem] font-bold"
                style={{ color: 'var(--t-primary)' }}
              />
            </div>
          ))}
          <div className="neo-inset-sm flex items-center justify-between rounded-xl px-3.5 py-2">
            <span className="text-[0.75rem]" style={{ color: 'var(--t-muted)' }}>
              Total
            </span>
            <MoneyDisplay
              amount={total}
              className="font-mono text-[0.8rem] font-semibold"
              style={{ color: 'var(--c-green)' }}
            />
          </div>
        </div>
      )}

      {total <= 0n && (
        <div className="neo-inset-sm rounded-[14px] px-3.5 py-3 text-center">
          <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
            Enter an amount in Step 1 to configure the split
          </p>
        </div>
      )}

      {draft.splitMethod === 'equal' && (
        <button
          onClick={() => router.push('/expenses/new/review')}
          disabled={total <= 0n || participants.length === 0}
          className="neo-btn-accent font-display mt-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      )}
    </div>
  );
}
