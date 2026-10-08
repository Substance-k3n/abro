'use client';

// "Phone notifications" (docs/DECISIONS.md ADR-021), in two places, like
// InstallApp:
//  - Settings -> Notifications (`variant="section"`): the switch, with
//    what to do when it can't be on (blocked, or iPhone not installed).
//  - A card at the top of Home (`variant="banner"`): only while push is
//    possible but off; dismissible, remembered in this browser
//    (localStorage, best effort). Never an automatic permission popup --
//    the browser only asks after a tap (user decision 2026-10-08).
// Which types arrive is the same list as in-app: the switches below it.

import { BellRing, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ApiError } from '~/lib/api-client';
import { usePush } from '~/lib/push';

const DISMISS_KEY = 'abro.pushBannerDismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function PushNotifications({ variant }: { variant: 'section' | 'banner' }) {
  const { state, enable, disable } = usePush();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => setDismissed(readDismissed()), []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not change notifications. Please try again.',
      );
    }
    setBusy(false);
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private mode or blocked storage: it just shows again next time.
    }
  };

  if (variant === 'banner') {
    if (state !== 'off' || dismissed) {
      return null;
    }
    return (
      <div className="neo-raised-sm mb-5 flex items-start gap-3 rounded-[18px] p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
          aria-hidden
        >
          <BellRing size={18} strokeWidth={2} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[0.88rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
            Get notified on this device
          </p>
          <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
            Hear about new expenses and payments without opening ABRO.
          </p>
          {error && (
            <p role="alert" className="text-[0.78rem]" style={{ color: 'var(--c-red)' }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => run(enable)}
            disabled={busy}
            className="mt-1 self-start text-[0.82rem] font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            {busy ? 'Turning on…' : 'Turn on'}
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0"
          style={{ color: 'var(--t-dim)' }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    );
  }

  if (state === null || state === 'unavailable') {
    return null;
  }

  const on = state === 'on';
  return (
    <section className="neo-raised-sm flex flex-col gap-2.5 rounded-3xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.85rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
            Phone notifications
          </p>
          <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
            {on
              ? 'On for this device. The types below decide what arrives.'
              : 'Get the types below on this device, even when ABRO is closed.'}
          </p>
        </div>
        {(state === 'on' || state === 'off') && (
          <button
            onClick={() => run(on ? disable : enable)}
            disabled={busy}
            className={`neo-toggle shrink-0 ${on ? 'on' : ''}`}
            aria-pressed={on}
            aria-label="Phone notifications"
          >
            <span className="neo-toggle-thumb" />
          </button>
        )}
      </div>
      {state === 'blocked' && (
        <p className="text-[0.75rem]" style={{ color: 'var(--t-muted)' }}>
          Notifications are blocked for ABRO in this browser. Allow them in the browser&apos;s site
          settings, then come back here.
        </p>
      )}
      {state === 'needs-install' && (
        <p className="text-[0.75rem]" style={{ color: 'var(--t-muted)' }}>
          On iPhone, notifications only work in the installed app.{' '}
          <Link href="/settings" className="font-semibold" style={{ color: 'var(--accent)' }}>
            Install ABRO
          </Link>{' '}
          (Share → Add to Home Screen), open it from your home screen, and turn this on there.
        </p>
      )}
      {error && (
        <p role="alert" className="text-[0.75rem]" style={{ color: 'var(--c-red)' }}>
          {error}
        </p>
      )}
    </section>
  );
}
