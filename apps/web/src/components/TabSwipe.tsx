'use client';

// Swipe sideways on a tab screen to move to the next tab, like a phone app
// (trial feedback 2026-10-10): finger to the left opens the tab on the
// right, finger to the right opens the one on the left, in bottom-bar order
// (Home, Friends, Groups, Activity -- Add is skipped). Only on the tab
// screens themselves; on a detail page sideways means nothing.
//
// Left alone so they keep working: swipes that start near the screen edge
// (Android's own Back gesture lives there), on a form field or anything
// that scrolls sideways or opts out with data-no-swipe, and mostly
// vertical moves (scrolling, PullToRefresh). Touch only. History follows
// ~/components/tab-nav.ts, the same as tapping the bottom bar.

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { SWIPE_TABS, goToTab, isTabRoot } from './tab-nav';

/** Sideways distance (px) that counts as a swipe. */
const MIN_DISTANCE = 70;
/** Starts this close (px) to the left/right edge belong to the phone. */
const EDGE = 28;

function ignoresSwipe(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable], [data-no-swipe]')) {
      return true;
    }
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) {
      return true;
    }
  }
  return false;
}

export function TabSwipe() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isTabRoot(pathname)) {
      return;
    }
    let start: { x: number; y: number } | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start =
        e.touches.length === 1 &&
        t &&
        t.clientX > EDGE &&
        t.clientX < window.innerWidth - EDGE &&
        !ignoresSwipe(e.target)
          ? { x: t.clientX, y: t.clientY }
          : null;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!start || !t) {
        return;
      }
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      start = null;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) {
        return;
      }
      const next = SWIPE_TABS[SWIPE_TABS.indexOf(pathname) + (dx < 0 ? 1 : -1)];
      if (next) {
        goToTab(router, pathname, next);
      }
    };
    const onCancel = () => {
      start = null;
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onCancel);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onCancel);
    };
  }, [pathname, router]);

  return null;
}
