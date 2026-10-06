'use client';

// Settle-up wizard layout -- wraps every step route under /settle in
// SettleDraftProvider (~/lib/settle-draft.tsx) and renders the step
// indicator, same pattern as expenses/new/layout.tsx (see its header
// comment). Deliberately outside the (dashboard) route group, same
// "focused flow" framing as the add-expense wizard.
//
// 4 stops matching ABRO_FRONTEND_SPEC.md's STL-01..04: Choose, Amount,
// Confirm, Done. STL-05 (Settlement History, /settlements) is a separate,
// non-wizard route under (dashboard) -- it's a browsable list, not a step
// in this flow.

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { SettleDraftProvider } from '~/lib/settle-draft';

const STEPS = [
  { label: 'Choose', match: (path: string) => path === '/settle' },
  { label: 'Amount', match: (path: string) => path === '/settle/amount' },
  { label: 'Confirm', match: (path: string) => path === '/settle/confirm' },
  { label: 'Done', match: (path: string) => path === '/settle/success' },
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

export default function SettleLayout({ children }: { children: ReactNode }) {
  return (
    <SettleDraftProvider>
      <div className="fade-in mx-auto max-w-xl px-5 py-6 md:px-8 md:py-8">
        <StepIndicator />
        {children}
      </div>
    </SettleDraftProvider>
  );
}
