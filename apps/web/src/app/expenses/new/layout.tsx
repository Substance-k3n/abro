'use client';

// Add-expense wizard layout -- wraps every step route under
// /expenses/new in ExpenseDraftProvider (~/lib/expense-draft.tsx; see
// its header comment for why the draft lives here instead of in a
// single collapsed screen component) and renders the step indicator.
//
// Deliberately outside the (dashboard) route group: no sidebar/bottom
// nav. ABRO_FRONTEND_SPEC.md's screen-flow section (§ "Tab 3: Add
// Expense -> EXP-01 (Modal/Sheet)") frames this as a focused, modal-like
// flow entered from the bottom nav's center button, not a page within
// the persistent dashboard chrome -- matches how most expense-splitting
// apps treat multi-step entry forms (fewer exit points, full attention
// on the flow).
//
// Step indicator groups routes into 5 stops matching the spec's actual
// screen count (EXP-01 Details, EXP-02 Payer, EXP-03 Participants,
// EXP-04..07 Split, EXP-08 Review) -- the prototype's own indicator only
// has 4 stops ("Details"/"Who"/"Split"/"Review") because it combines
// payer+participant selection into one internal step; since this port
// follows the spec's separate-route structure for those two (same
// precedent as Phase 2's auth flow), the indicator reflects that too.
// EXP-05/06/07 (the three custom-split screens) all resolve to the same
// "Split" stop -- they're sub-flows of step 4, not separate stops,
// matching the prototype's own step-grouping for that part.

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { ExpenseDraftProvider } from '~/lib/expense-draft';

const STEPS = [
  { label: 'Details', match: (path: string) => path === '/expenses/new' },
  { label: 'Payer', match: (path: string) => path === '/expenses/new/payer' },
  { label: 'Participants', match: (path: string) => path === '/expenses/new/participants' },
  { label: 'Split', match: (path: string) => path.startsWith('/expenses/new/split') },
  { label: 'Review', match: (path: string) => path === '/expenses/new/review' },
];

function StepIndicator() {
  const pathname = usePathname();
  const activeIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.match(pathname)),
  );

  return (
    <div className="mb-6 flex items-center gap-1.5">
      {STEPS.map((s, i) => (
        <div
          key={s.label}
          className={`flex items-center gap-1.5 ${i < STEPS.length - 1 ? 'flex-1' : ''}`}
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] font-mono text-[0.7rem] font-bold transition-colors"
            style={{
              background:
                i < activeIndex ? '#22c55e' : i === activeIndex ? 'var(--accent)' : 'var(--neo-bg)',
              color: i <= activeIndex ? 'white' : 'var(--neo-dark)',
              boxShadow:
                i <= activeIndex
                  ? `3px 3px 8px ${i < activeIndex ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.3)'}, -2px -2px 5px rgba(255,255,255,0.5)`
                  : '3px 3px 8px var(--neo-dark), -3px -3px 8px var(--neo-light)',
            }}
          >
            {i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div
              className="h-0.5 flex-1 rounded-full transition-colors"
              style={{
                background: i < activeIndex ? '#22c55e' : 'var(--neo-dark)',
                opacity: i < activeIndex ? 0.6 : 0.3,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function AddExpenseLayout({ children }: { children: ReactNode }) {
  return (
    <ExpenseDraftProvider>
      <div className="fade-in mx-auto max-w-xl px-5 py-6 md:px-8 md:py-8">
        <StepIndicator />
        {children}
      </div>
    </ExpenseDraftProvider>
  );
}
