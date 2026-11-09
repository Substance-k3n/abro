'use client';

// Create-group wizard layout -- same pattern as
// apps/web/src/app/expenses/new/layout.tsx: wraps every step route in
// GroupDraftProvider, renders a step indicator, lives outside the
// (dashboard) chrome (focused flow, no bottom nav on phone -- the
// desktop sidebar is still shown, see expenses/new/layout.tsx's header
// comment for why).

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Sidebar } from '~/components/Sidebar';
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

export default function CreateGroupLayout({ children }: { children: ReactNode }) {
  return (
    <GroupDraftProvider>
      <div className="flex min-h-screen md:flex-row">
        <Sidebar />
        <main className="min-h-screen min-w-0 flex-1">
          <div className="fade-in mx-auto max-w-xl px-5 py-6 md:px-8 md:py-8">
            <StepIndicator />
            {children}
          </div>
        </main>
      </div>
    </GroupDraftProvider>
  );
}
