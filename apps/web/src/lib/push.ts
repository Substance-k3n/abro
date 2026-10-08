'use client';

// Phone/browser push (docs/DECISIONS.md ADR-021). Turning it on asks the
// browser for permission, subscribes this device with the API's VAPID key
// and hands the subscription to apps/api's /push routes; from then on
// every in-app notification (minus the types switched off in Settings)
// also arrives on this device, shown by public/sw.js.
//
// Push needs the service worker, which only runs in production builds
// (lib/pwa.ts). On iPhone it only works in the installed app (iOS 16.4+),
// never in Safari itself -- that case gets "install first" instead.

import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from './api-client';

/** on/off: this device can do it. blocked: the user said no in the
 * browser, only browser settings can undo it. needs-install: iPhone in
 * Safari. unavailable: no support here, or the server has no keys. */
export type PushState = 'on' | 'off' | 'blocked' | 'needs-install' | 'unavailable';

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** The service worker's registration, or null if none is running (dev
 * builds, or it failed to register). Doesn't wait forever like
 * navigator.serviceWorker.ready would. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) {
    return null;
  }
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
}

let publicKey: Promise<string | null> | null = null;

/** The server's VAPID key, or null when push isn't set up there (501). */
function getPublicKey(): Promise<string | null> {
  publicKey ??= api
    .get<{ publicKey: string }>('/push/public-key')
    .then((r) => r.publicKey)
    .catch((err) => {
      publicKey = null;
      if (err instanceof ApiError && err.status === 501) {
        return null;
      }
      throw err;
    });
  return publicKey;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) {
    return isIos() && !isStandalone() ? 'needs-install' : 'unavailable';
  }
  const reg = await registration();
  if (!reg || !(await getPublicKey())) {
    return 'unavailable';
  }
  if (Notification.permission === 'denied') {
    return 'blocked';
  }
  const sub = await reg.pushManager.getSubscription();
  if (sub && Notification.permission === 'granted') {
    // Re-send it: harmless if the server has it, and it re-links the
    // device if the server forgot it (e.g. it expired once).
    await api.post('/push/subscriptions', sub.toJSON()).catch(() => {});
    return 'on';
  }
  return 'off';
}

/** Asks for permission (must run from a tap) and subscribes. Returns the
 * resulting state: 'blocked' if the user said no. */
export async function enablePush(): Promise<PushState> {
  const reg = await registration();
  const key = await getPublicKey();
  if (!reg || !key) {
    return 'unavailable';
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return permission === 'denied' ? 'blocked' : 'off';
  }
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    }));
  await api.post('/push/subscriptions', sub.toJSON());
  return 'on';
}

/** Stops push on this device: tells the server, then drops the browser's
 * subscription so nothing else can use it. */
export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) {
    return;
  }
  await api.delete('/push/subscriptions', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/** Push state for a screen, re-read after enable/disable. */
export function usePush() {
  const [state, setState] = useState<PushState | null>(null);

  useEffect(() => {
    let live = true;
    getPushState()
      .catch(() => 'unavailable' as const)
      .then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, []);

  const enable = useCallback(async () => setState(await enablePush()), []);
  const disable = useCallback(async () => {
    await disablePush();
    setState('off');
  }, []);

  return { state, enable, disable };
}
