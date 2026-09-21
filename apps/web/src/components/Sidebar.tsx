'use client';

// Desktop counterpart to BottomNav -- no prototype reference (the Figma
// Make export only ever targeted the phone-frame mobile layout); built
// fresh per docs/ABRO_FRONTEND_SPEC.md §11's "Desktop (> 1024px): Sidebar
// navigation" requirement, reusing the same NAV_ITEMS and neomorphic
// active-state language as BottomNav so the two feel like one system.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS } from './nav-items';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 p-5 md:flex"
      style={{ background: 'var(--neo-bg)', boxShadow: '4px 0 24px rgba(184,190,199,0.35)' }}
    >
      <div className="mb-8 flex items-center gap-2.5 px-2 pt-2">
        <div className="neo-raised-sm flex h-9 w-9 items-center justify-center rounded-xl">
          <span
            className="font-display text-sm font-extrabold"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            AB
          </span>
        </div>
        <span
          className="font-display text-lg font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          ABRO
        </span>
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-all"
            style={{
              background: isActive ? 'var(--neo-bg)' : 'transparent',
              boxShadow: isActive
                ? 'inset 4px 4px 9px var(--neo-dark), inset -4px -4px 9px var(--neo-light)'
                : 'none',
              color: isActive ? 'var(--accent)' : 'var(--t-nav-inactive)',
              fontWeight: isActive ? 700 : 500,
            }}
          >
            <Icon size={19} strokeWidth={isActive ? 2 : 1.6} />
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
