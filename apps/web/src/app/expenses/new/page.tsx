'use client';

// EXP-01 Add Expense - Basic Details -- docs/ABRO_FRONTEND_SPEC.md §4
// (lines 625-676). Ported from the prototype's AddExpenseScreen step 1
// (App.tsx:2896 onward) -- name input + quick suggestions, amount input
// with ETB prefix, category grid (.cat-pill, from CATEGORIES in
// ~/lib/mock-data), date picker, optional group selector.
//
// Deviations:
//  - "Calculator-style keypad on mobile" (spec) isn't built -- a plain
//    `type="number"` input already gets the OS numeric keypad on mobile
//    browsers, and a custom on-screen calculator UI is a much bigger
//    build than this pass needs; revisit only if the native keypad turns
//    out to be insufficient in real use.
//  - "Save as draft" (spec's Components list) is deferred -- there's no
//    draft-persistence layer yet (see expense-draft.tsx's header comment
//    on why the wizard state is in-memory only for this phase).
//  - Group selector is a flat list of pills (Personal + each GROUPS
//    entry), not a dropdown/sheet -- GROUPS has only 3 mock entries, not
//    enough to need a searchable picker yet.
//  - Phase 5 addition: a `?groupId=` query param (used by Group Detail's
//    and Group Expenses' "Add expense" quick actions, per GRP-03/GRP-04)
//    pre-selects that group once, on mount, without overriding a group
//    the user has already picked by navigating back to this step.
//    useSearchParams() requires a Suspense boundary (Next.js opts a page
//    using it out of full static rendering otherwise) -- the default
//    export below just wraps the real page in one.

import { ArrowRight, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { useExpenseDraft } from '~/lib/expense-draft';
import { CATEGORIES, GROUPS } from '~/lib/mock-data';

const QUICK_NAMES = ['Lunch', 'Dinner', 'Coffee', 'Groceries'];

export default function AddExpenseDetailsPage() {
  return (
    <Suspense>
      <AddExpenseDetailsForm />
    </Suspense>
  );
}

function AddExpenseDetailsForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { draft, update } = useExpenseDraft();

  useEffect(() => {
    const groupId = searchParams.get('groupId');
    if (groupId && draft.groupId === null && GROUPS.some((g) => g.id === groupId)) {
      update({ groupId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const amount = Number(draft.amountInput);
  const isValid = draft.name.trim().length > 0 && Number.isFinite(amount) && amount > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/home')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <X size={16} strokeWidth={2} /> Cancel
        </button>
        <h2 className="font-display text-[1.1rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Add Expense
        </h2>
        <div className="w-[60px]" />
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Expense name
        </label>
        <input
          className="neo-input"
          placeholder="e.g. Lunch at Kategna"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
        />
        <div className="mt-2.5 flex flex-wrap gap-2">
          {QUICK_NAMES.map((s) => (
            <button
              key={s}
              onClick={() => update({ name: s })}
              className="neo-flat rounded-[10px] border-none px-3 py-1.5 text-[0.78rem] font-medium"
              style={{ color: 'var(--t-muted)' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Amount
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
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Category
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              onClick={() => update({ category: c.label })}
              className={`cat-pill border-none ${draft.category === c.label ? 'selected' : ''}`}
            >
              <span>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Date
        </label>
        <input
          className="neo-input"
          type="date"
          value={draft.date}
          onChange={(e) => update({ date: e.target.value })}
          style={{ color: 'var(--t-primary)' }}
        />
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          Group
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => update({ groupId: null })}
            className={`neo-flat rounded-xl border-none px-3.5 py-2 text-[0.8rem] font-medium ${draft.groupId === null ? 'ring-2' : ''}`}
            style={{
              color: draft.groupId === null ? 'var(--accent)' : 'var(--t-muted)',
              ...(draft.groupId === null ? { boxShadow: '0 0 0 2px var(--accent)' } : {}),
            }}
          >
            Personal (no group)
          </button>
          {GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => update({ groupId: g.id })}
              className="neo-flat rounded-xl border-none px-3.5 py-2 text-[0.8rem] font-medium"
              style={{
                color: draft.groupId === g.id ? 'var(--accent)' : 'var(--t-muted)',
                ...(draft.groupId === g.id ? { boxShadow: '0 0 0 2px var(--accent)' } : {}),
              }}
            >
              {g.icon} {g.name}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => router.push('/expenses/new/payer')}
        disabled={!isValid}
        className="neo-btn-accent font-display mt-2 flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next <ArrowRight size={17} strokeWidth={2.25} />
      </button>
    </div>
  );
}
