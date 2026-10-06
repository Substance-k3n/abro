'use client';

// Create-group wizard layout -- same pattern as
// apps/web/src/app/expenses/new/layout.tsx: wraps every step route in
// GroupDraftProvider, renders a step indicator, lives outside the
// (dashboard) chrome (focused flow, no sidebar/bottom nav).

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { GroupDraftProvider } from '~/lib/group-draft';

const STEPS = [
  { label: 'Details', match: (path: string) => path === '/groups/new' },
  { label: 'Members', match: (path: string) => path === '/groups/new/members' },
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

export default function CreateGroupLayout({ children }: { children: ReactNode }) {
  return (
    <GroupDraftProvider>
      <div className="fade-in mx-auto max-w-xl px-5 py-6 md:px-8 md:py-8">
        <StepIndicator />
        {children}
      </div>
    </GroupDraftProvider>
  );
}
