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
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border font-mono text-[0.7rem] font-bold transition-colors"
            style={{
              background:
                i < activeIndex ? '#16a34a' : i === activeIndex ? '#c2410c' : 'var(--neo-bg)',
              borderColor: i <= activeIndex ? 'transparent' : 'var(--border-med)',
              color: i <= activeIndex ? 'white' : 'var(--t-dim)',
            }}
          >
            {i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div
              className="h-0.5 flex-1 rounded-full transition-colors"
              style={{
                background: i < activeIndex ? '#16a34a' : 'var(--border-med)',
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
