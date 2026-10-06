'use client';

// Ported from the Figma Make prototype's BottomNav (App.tsx) per
// docs/WIRING_PLAN.md Phase 1/3 -- converted from local setTab/setScreen
// state to real next/navigation routing, and from a phone-frame-relative
// flex item to a real fixed bottom bar (the prototype's whole app lived
// inside a fixed-height frame, so it didn't need position: fixed itself).
// Simplified from the prototype's dual solid/outline SVG icon sets to one
// lucide-react icon per tab with an active/inactive style -- the dominant
// active signal is the raised-shadow pill + accent color, same as every
// other active-state pattern in this design system.

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS } from './nav-items';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex shrink-0 items-center justify-around px-1.5 pb-[22px] pt-2.5 md:hidden"
      style={{
        background: 'var(--neo-bg)',
        boxShadow: 'var(--nav-shadow)',
        borderRadius: '28px 28px 0 0',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;

        if (item.id === 'add') {
          return (
            <Link
              key={item.id}
              href={item.href}
              className="-mt-3.5 flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[18px] text-white transition-transform"
              style={{
                background: 'linear-gradient(145deg, #8183ff, #4f52e8)',
                boxShadow: isActive
                  ? 'inset 4px 4px 10px rgba(50,52,180,0.5), inset -2px -2px 6px rgba(255,255,255,0.15)'
                  : '6px 6px 16px rgba(99,102,241,0.45), -4px -4px 10px rgba(255,255,255,0.7)',
                transform: isActive ? 'scale(0.94)' : 'scale(1)',
              }}
            >
              <Plus size={24} strokeWidth={2.5} />
            </Link>
          );
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            className="flex max-w-[72px] flex-1 flex-col items-center gap-0 p-0"
          >
            <div
              className="mb-1 flex h-9 items-center justify-center rounded-xl transition-all"
              style={{
                width: isActive ? 56 : 40,
                background: isActive ? 'var(--neo-bg)' : 'transparent',
                boxShadow: isActive
                  ? 'inset 4px 4px 9px var(--neo-dark), inset -4px -4px 9px var(--neo-light)'
                  : 'none',
                color: isActive ? 'var(--accent)' : '#a0a8b8',
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2 : 1.6} />
            </div>
            <span
              className="text-[0.62rem] leading-none transition-all"
              style={{
                fontWeight: isActive ? 700 : 400,
                color: isActive ? 'var(--accent)' : '#b0b8c8',
              }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
