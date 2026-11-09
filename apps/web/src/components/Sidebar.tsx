'use client';

// Desktop counterpart to BottomNav -- no prototype reference (the Figma
// Make export only ever targeted the phone-frame mobile layout); built
// fresh per docs/ABRO_FRONTEND_SPEC.md §11's "Desktop (> 1024px): Sidebar
// navigation" requirement, reusing the shared nav items and neomorphic
// active-state language as BottomNav so the two feel like one system.
//
// Collapsible to an icon rail (2026-11-09 feedback: fixed 240px read as
// too much dead width on a wide monitor). Remembered in localStorage;
// read in an effect, not the initial render, so there's nothing to do
// differently server-side -- the one frame at default width before it
// syncs is a smaller cost than a flash-of-wrong-layout workaround for a
// preference, not a theme, would be worth.

import { Logomark } from '@abro/ui';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { SIDEBAR_NAV_ITEMS } from './nav-items';

const STORAGE_KEY = 'abro-sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      setCollapsed(true);
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-1 p-3 transition-[width] duration-200 md:flex ${
        collapsed ? 'w-[76px]' : 'w-60 p-5'
      }`}
      style={{ background: 'var(--neo-bg2)', borderRight: '1px solid var(--border-med)' }}
    >
      <div
        className={`mb-8 flex items-center pt-2 ${collapsed ? 'flex-col gap-3' : 'justify-between gap-2.5 px-2'}`}
      >
        <div className="flex items-center gap-2.5">
          <Logomark size={30} />
          {!collapsed && (
            <span
              className="font-display text-lg font-extrabold tracking-tight"
              style={{ color: 'var(--t-primary)' }}
            >
              abro
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--border-sub)]"
          style={{ color: 'var(--t-dim)' }}
        >
          {collapsed ? (
            <PanelLeftOpen size={17} strokeWidth={1.8} />
          ) : (
            <PanelLeftClose size={17} strokeWidth={1.8} />
          )}
        </button>
      </div>

      {SIDEBAR_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-3 rounded-2xl py-2.5 text-sm font-medium transition-all ${
              collapsed ? 'justify-center px-0' : 'px-3.5'
            } ${isActive ? '' : 'hover:bg-[var(--border-sub)]'}`}
            style={{
              background: isActive ? 'var(--accent-light)' : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--t-nav-inactive)',
              fontWeight: isActive ? 700 : 500,
            }}
          >
            <Icon size={19} strokeWidth={isActive ? 2 : 1.6} />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </aside>
  );
}
