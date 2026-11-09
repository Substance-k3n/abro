'use client';

// Desktop counterpart to BottomNav -- no prototype reference (the Figma
// Make export only ever targeted the phone-frame mobile layout); built
// fresh per docs/ABRO_FRONTEND_SPEC.md §11's "Desktop (> 1024px): Sidebar
// navigation" requirement, reusing the shared nav items and neomorphic
// active-state language as BottomNav so the two feel like one system.

import { Logomark } from '@abro/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SIDEBAR_NAV_ITEMS } from './nav-items';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 p-5 md:flex"
      style={{ background: 'var(--neo-bg2)', borderRight: '1px solid var(--border-med)' }}
    >
      <div className="mb-8 flex items-center gap-2.5 px-2 pt-2">
        <Logomark size={30} />
        <span
          className="font-display text-lg font-extrabold tracking-tight"
          style={{ color: 'var(--t-primary)' }}
        >
          abro
        </span>
      </div>

      {SIDEBAR_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-all ${
              isActive ? '' : 'hover:bg-[var(--border-sub)]'
            }`}
            style={{
              background: isActive ? 'var(--accent-light)' : 'transparent',
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
