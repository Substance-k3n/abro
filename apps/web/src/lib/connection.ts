'use client';

// Is there internet? (phone feedback 2026-11-05: with no internet the app
// sat on its loading skeleton instead of saying so.)
//
// The browser's `navigator.onLine` only knows whether the device is on a
// network, not whether that network reaches anything: on Wi-Fi with no
// internet, or mobile data that has stopped working, it stays true and a
// request can hang for minutes. So the app keeps its own answer:
//   - 'offline': no internet -- the browser says so, a request failed to
//     connect, or a slow request's quick check (internetReachable) failed;
//   - 'slow': the internet works but ABRO hasn't answered yet (e.g. the
//     free-tier API waking up);
//   - 'online': the last request came back.
// lib/api-client.ts reports into it; the connection bar, ErrorState and
// LoadingState read it. Coming back online re-checks every screen.

import { useSyncExternalStore } from 'react';

export type Connection = 'online' | 'offline' | 'slow';

let status: Connection = 'online';
const listeners = new Set<() => void>();
const backOnline = new Set<() => void>();
let recheck: ReturnType<typeof setInterval> | null = null;

/** How often to look for the internet again while offline. */
const RECHECK_MS = 8_000;
/** How long the quick reachability check may take. */
const PROBE_TIMEOUT_MS = 4_000;

export function connection(): Connection {
  return status;
}

export function setConnection(next: Connection): void {
  if (next === status) {
    return;
  }
  const wasOffline = status === 'offline';
  status = next;
  if (next === 'offline' && !recheck && typeof window !== 'undefined') {
    // The browser fires 'online' when the device rejoins a network, but
    // not when a network that was up without internet gets it back.
    recheck = setInterval(() => {
      void internetReachable().then((ok) => {
        if (ok) {
          setConnection('online');
        }
      });
    }, RECHECK_MS);
  }
  if (next !== 'offline' && recheck) {
    clearInterval(recheck);
    recheck = null;
  }
  listeners.forEach((l) => l());
  if (wasOffline && next !== 'offline') {
    backOnline.forEach((l) => l());
  }
}

/** Calls `listener` each time the connection comes back. */
export function onBackOnline(listener: () => void): () => void {
  backOnline.add(listener);
  return () => {
    backOnline.delete(listener);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current connection, re-rendering when it changes. */
export function useConnection(): Connection {
  return useSyncExternalStore(subscribe, connection, () => 'online');
}

/** Whether this site itself answers within a few seconds -- a tiny file
 * the service worker never caches (public/sw.js leaves it to the network),
 * so it measures the internet, not the API. */
export async function internetReachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`/manifest.webmanifest?reach=${Date.now()}`, {
      cache: 'no-store',
      signal: abort.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

if (typeof window !== 'undefined') {
  if (!navigator.onLine) {
    setConnection('offline');
  }
  window.addEventListener('offline', () => setConnection('offline'));
  window.addEventListener('online', () => {
    // On a network again -- but check it reaches anything before saying so.
    void internetReachable().then((ok) => setConnection(ok ? 'online' : 'offline'));
  });
}
