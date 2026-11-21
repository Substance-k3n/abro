'use client';

// EXP-01 Add Expense - Basic Details -- docs/ABRO_FRONTEND_SPEC.md §4
// (lines 625-676). Ported from the prototype's AddExpenseScreen step 1
// (App.tsx:2896 onward) -- name input + quick suggestions, amount input
// with ETB prefix, category grid (.cat-pill, from CATEGORIES in
// ~/lib/reference-data), date picker, optional group selector.
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
//  - Group selector is a flat list of pills (Personal + each of your
//    real groups), not a dropdown/sheet -- revisit with a searchable
//    picker if people end up in many groups.
//  - Phase 8: picking a different group resets payer + participants to
//    just you -- who's eligible differs per group (see
//    ~/lib/expense-directory.tsx), so earlier picks may no longer be.
//  - Phase 5 addition: a `?groupId=` query param (used by Group Detail's
//    and Group Expenses' "Add expense" quick actions, per GRP-03/GRP-04)
//    pre-selects that group once, on mount, without overriding a group
//    the user has already picked by navigating back to this step.
//    useSearchParams() requires a Suspense boundary (Next.js opts a page
//    using it out of full static rendering otherwise) -- the default
//    export below just wraps the real page in one.

import { CategoryIcon, GroupIcon } from '@abro/ui';
import { ArrowRight, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { useExpenseDirectory } from '~/lib/expense-directory';
import { ME, useExpenseDraft } from '~/lib/expense-draft';
import { groupTypeFor } from '~/lib/groups-api';
import { CATEGORIES } from '~/lib/reference-data';

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
  const { groups } = useExpenseDirectory();

  const selectGroup = (groupId: string | null) => {
    if (groupId !== draft.groupId) {
      update({ groupId, payerId: ME, participantIds: [ME] });
    }
  };

  useEffect(() => {
    const groupId = searchParams.get('groupId');
    if (groupId && draft.groupId === null && groups.some((g) => g.id === groupId)) {
      selectGroup(groupId);
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

      {/* Amount -- the hero figure. What this screen exists to record. */}
      <div className="flex flex-col items-center gap-2 py-2">
        <span
          className="text-[0.78rem] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--t-dim)' }}
        >
          Amount
        </span>
        <div className="flex items-baseline justify-center gap-2">
          <span className="font-mono text-[1.4rem] font-semibold" style={{ color: 'var(--t-dim)' }}>
            ETB
          </span>
          <input
            className="amount-hero-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={draft.amountInput}
            onChange={(e) => update({ amountInput: e.target.value })}
            style={{ maxWidth: 220 }}
          />
        </div>
        <div className="h-px w-16" style={{ background: 'var(--border-med)' }} />
      </div>

      <div>
        <label
          className="mb-2 block pl-1 text-[0.8rem] font-semibold"
          style={{ color: 'var(--t-muted)' }}
        >
          For
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
          Category
        </label>
        <div className="hide-scroll scroll-fade-x -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:-mx-8 md:px-8">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              onClick={() => update({ category: c.label })}
              className={`cat-pill shrink-0 border-none ${draft.category === c.label ? 'selected' : ''}`}
            >
              <CategoryIcon label={c.label} size={14} />
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
          className="neo-input w-40"
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
        <div className="hide-scroll scroll-fade-x -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:-mx-8 md:px-8">
          <button
            onClick={() => selectGroup(null)}
            className={`cat-pill shrink-0 border-none ${draft.groupId === null ? 'selected' : ''}`}
          >
            Personal
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => selectGroup(g.id)}
              className={`cat-pill shrink-0 border-none ${draft.groupId === g.id ? 'selected' : ''}`}
            >
              <GroupIcon icon={groupTypeFor(g.type).icon} size={14} />
              {g.name}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => router.push('/expenses/new/payer')}
        disabled={!isValid}
        className="neo-btn-accent font-display mt-2 flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed"
      >
        Next <ArrowRight size={17} strokeWidth={2.25} />
      </button>
    </div>
  );
}
