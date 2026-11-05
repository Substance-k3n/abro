'use client';

import { CloudOff, WifiOff } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { OFFLINE_MESSAGE } from '~/lib/api-client';
import { onBackOnline, useConnection } from '~/lib/connection';

// Phase 8 (docs/WIRING_PLAN.md) -- the loading and error-with-retry blocks
// every API-backed screen renders while its first fetch is in flight or
// after it fails. Slices 2-3 grew one private copy per page (Home,
// Friends, Balances, Notifications); extracted here in slice 4 once
// Activity, Friend Detail and Groups would have added three more.
//
// Loading is a skeleton (roadmap Phase 2b), not a spinner: grey shapes in
// the layout most screens share -- a title, a summary card and a list --
// so the screen never flashes empty and the real content lands where the
// eye already is. It pulses gently, and not at all with reduced motion.
//
// `minHeight` is inline style rather than a Tailwind class so callers can
// pass any value without it being purged. `inline` drops the page padding
// for the two places that render it inside an already padded area.
//
// No internet (~/lib/connection.ts): the skeleton says so after a moment
// rather than pulse forever, and ErrorState shows a no-internet card that
// retries by itself once the internet is back.

/** When the skeleton starts explaining itself. */
const SLOW_HINT_MS = 6_000;

function Bone({ className, style }: { className: string; style?: React.CSSProperties }) {
  return <div className={`skeleton-bone ${className}`} style={style} aria-hidden />;
}

export function LoadingState({
  minHeight = '50vh',
  inline = false,
}: {
  minHeight?: string;
  inline?: boolean;
}) {
  // Still loading after a while: say why rather than leave grey shapes.
  const status = useConnection();
  const [long, setLong] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLong(true), SLOW_HINT_MS);
    return () => clearTimeout(t);
  }, []);
  const hint =
    status === 'offline'
      ? 'No internet connection. Waiting for it to come back…'
      : long || status === 'slow'
        ? 'Still loading… your connection seems slow.'
        : null;

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={hint ?? 'Loading'}
      className={`flex flex-col gap-4 ${inline ? '' : 'mx-auto w-full max-w-2xl px-5 py-6 md:px-8 md:py-8'}`}
      style={{ minHeight }}
    >
      {hint && (
        <p className="text-center text-[0.8rem] font-medium" style={{ color: 'var(--t-muted)' }}>
          {hint}
        </p>
      )}
      <Bone className="h-6 w-2/5 rounded-lg" />
      <div className="neo-raised-sm flex flex-col gap-3 rounded-[20px] p-5">
        <Bone className="h-3.5 w-1/4 rounded-md" />
        <Bone className="h-8 w-1/2 rounded-lg" />
        <Bone className="h-3.5 w-1/3 rounded-md" />
      </div>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="neo-raised-sm flex items-center gap-3 rounded-[18px] p-4">
          <Bone className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Bone className="h-3.5 rounded-md" style={{ width: `${60 - row * 8}%` }} />
            <Bone className="h-3 w-1/4 rounded-md" />
          </div>
          <Bone className="h-4 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  minHeight = '50vh',
}: {
  message: string;
  onRetry: () => void;
  minHeight?: string;
}) {
  const status = useConnection();
  // No internet gets its own card (phone feedback 2026-11-05: it used to
  // read like the app was broken), and tries again by itself the moment
  // the internet is back.
  const offline = status === 'offline' || message === OFFLINE_MESSAGE;
  const retry = useRef(onRetry);
  retry.current = onRetry;
  useEffect(() => (offline ? onBackOnline(() => retry.current()) : undefined), [offline]);

  const Icon = offline ? WifiOff : CloudOff;
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 px-8 text-center"
      style={{ minHeight }}
    >
      <div
        className="neo-raised flex h-16 w-16 items-center justify-center rounded-full"
        style={{ color: offline ? 'var(--c-amber)' : 'var(--t-muted)' }}
      >
        <Icon size={26} strokeWidth={1.8} aria-hidden />
      </div>
      <div className="flex max-w-xs flex-col gap-1.5">
        <p className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          {offline ? 'No internet connection' : "Couldn't load this"}
        </p>
        <p className="text-[0.85rem]" style={{ color: 'var(--t-muted)' }}>
          {offline
            ? "Check your Wi-Fi or mobile data. ABRO will try again by itself when you're back online."
            : message}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="neo-btn-accent rounded-2xl px-5 py-2.5 text-[0.85rem] font-semibold"
      >
        Try again
      </button>
    </div>
  );
}
