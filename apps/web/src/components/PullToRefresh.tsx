'use client';

// Pull down from the top of any signed-in screen and let go to reload its
// data, like other phone apps (trial feedback 2026-10-07). The browser's
// own pull-to-refresh is off (globals.css sets overscroll-behavior: none
// so the app doesn't rubber-band), and an installed app has none anyway.
//
// Refreshing empties the read cache (~/lib/api-client.ts) and remounts
// the screen under a new key, so it loads everything again the way it
// does when first opened -- no full page reload, and the bottom bar
// stays put. Touch only; a pull that starts anywhere but the very top
// of the page is an ordinary scroll.

import { RefreshCw } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { clearApiCache } from '~/lib/api-client';

/** How far (px) the finger must pull before letting go refreshes. */
const TRIGGER = 70;
/** The indicator never travels further than this. */
const MAX_PULL = 110;

export function PullToRefresh({ children }: { children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [generation, setGeneration] = useState(0);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0]!.clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) {
        return;
      }
      const dy = e.touches[0]!.clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      // Resistance: the indicator moves slower than the finger.
      pullRef.current = Math.min(MAX_PULL, dy * 0.5);
      setPull(pullRef.current);
    };
    const onEnd = () => {
      const pulled = pullRef.current;
      start.current = null;
      pullRef.current = 0;
      setPull(0);
      if (pulled >= TRIGGER) {
        setRefreshing(true);
        clearApiCache();
        setGeneration((g) => g + 1);
        window.setTimeout(() => setRefreshing(false), 700);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const visible = refreshing || pull > 0;
  const offset = refreshing ? TRIGGER * 0.75 : pull;
  const ready = pull >= TRIGGER;

  return (
    <>
      {visible && (
        <div
          aria-hidden={!refreshing}
          role={refreshing ? 'status' : undefined}
          className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
          style={{ top: `calc(env(safe-area-inset-top) + ${offset - 40}px)` }}
        >
          <div
            className="neo-raised-sm flex h-10 w-10 items-center justify-center rounded-full"
            style={{ color: ready || refreshing ? 'var(--accent)' : 'var(--t-dim)' }}
          >
            <RefreshCw
              size={18}
              strokeWidth={2.25}
              className={refreshing ? 'animate-spin' : undefined}
              style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
            />
            {refreshing && <span className="sr-only">Refreshing</span>}
          </div>
        </div>
      )}
      <div key={generation}>{children}</div>
    </>
  );
}
