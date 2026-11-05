'use client';

// The portal's side of its session limits (ADR-028). apps/api ends a
// portal session after 30 idle minutes or 12 hours, but an open
// dashboard refreshes itself every minute and would never look idle to
// the API. So this watches for a person -- mouse, keys, touch, scroll --
// and after the same 30 minutes without one, signs out here too. Two
// minutes before, and when the 12 hours are nearly up, it says so.

import { Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { signOut } from '~/lib/admin-api';
import { useSession } from '~/lib/session';

const WARN_IDLE_MS = 2 * 60_000;
const WARN_END_MS = 10 * 60_000;
const TICK_MS = 15_000;
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function SessionGuard() {
  const { session } = useSession();
  const idleMs = session.idleMinutes * 60_000;
  const endsAt = new Date(session.endsAt).getTime();
  const lastInput = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const leaving = useRef(false);

  useEffect(() => {
    const seen = () => {
      lastInput.current = Date.now();
    };
    for (const e of EVENTS) {
      window.addEventListener(e, seen, { passive: true });
    }
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      for (const e of EVENTS) {
        window.removeEventListener(e, seen);
      }
      clearInterval(t);
    };
  }, []);

  const idleLeft = idleMs - (now - lastInput.current);
  const endLeft = endsAt - now;

  useEffect(() => {
    if (leaving.current || (idleLeft > 0 && endLeft > 0)) {
      return;
    }
    leaving.current = true;
    const why = endLeft <= 0 ? 'max_age' : 'idle';
    const here = window.location.pathname + window.location.search;
    void signOut()
      .catch(() => {})
      .finally(() =>
        window.location.replace(`/signin?next=${encodeURIComponent(here)}&why=${why}`),
      );
  }, [idleLeft, endLeft]);

  if (idleLeft > 0 && idleLeft <= WARN_IDLE_MS) {
    return (
      <Banner>
        You&apos;ll be signed out in about {Math.max(1, Math.ceil(idleLeft / 60_000))} min for being
        idle.
        <button
          type="button"
          className="btn btn-primary ml-3 h-7 px-3 text-xs"
          onClick={() => {
            lastInput.current = Date.now();
            setNow(Date.now());
          }}
        >
          Stay signed in
        </button>
      </Banner>
    );
  }
  if (endLeft > 0 && endLeft <= WARN_END_MS) {
    const at = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Addis_Ababa',
    }).format(endsAt);
    return (
      <Banner>
        This sign-in ends at {at} (portal sign-ins last {session.maxHours} hours). Finish what
        you&apos;re doing, then sign in again.
      </Banner>
    );
  }
  return null;
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="bg-warn-soft text-warn border-warn/20 sticky top-16 z-10 flex items-center justify-center gap-2 border-b px-8 py-2 text-sm font-medium"
    >
      <Clock className="size-4 shrink-0" aria-hidden />
      <span className="flex flex-wrap items-center">{children}</span>
    </div>
  );
}
