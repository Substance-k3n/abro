'use client';

// Installable-app plumbing (docs/DECISIONS.md ADR-015): registers the
// service worker and keeps Chrome's install prompt for whichever screen
// shows an "Install ABRO" button.
//
// Chrome/Edge/Android fire `beforeinstallprompt` once, early in page
// load -- usually before Settings or Home has mounted -- so it's caught
// here at app start (PwaSetup in the root layout) and held in a module-
// level store that useInstallState() subscribes to. iPhone Safari has no
// install API at all: there the button shows the "Add to Home Screen"
// steps instead.

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** installed: already running as the app. prompt: Chrome can install it
 * now. ios: show manual steps. unavailable: this browser can't (or Chrome
 * hasn't offered yet). */
export type InstallState = 'installed' | 'prompt' | 'ios' | 'unavailable';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; the touch points give it away.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function currentState(): InstallState {
  if (installedNow || isStandalone()) {
    return 'installed';
  }
  if (deferredPrompt) {
    return 'prompt';
  }
  return isIos() ? 'ios' : 'unavailable';
}

/** Called once from the root layout. The service worker is registered in
 * production only: in `next dev` it would cache dev bundles and get in
 * the way of hot reload. */
export function setUpPwa(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferredPrompt = null;
    installedNow = true;
    notify();
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);

  if ('serviceWorker' in navigator) {
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Not installable without it, but the site itself works fine.
      });
    } else {
      // A worker left over from running a production build on this same
      // localhost port would serve stale dev bundles from its cache.
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => void r.unregister()));
    }
  }

  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

export function useInstallState(): InstallState {
  // 'unavailable' on the server and first render, so nothing flashes.
  const [state, setState] = useState<InstallState>('unavailable');
  useEffect(() => {
    const update = () => setState(currentState());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
}

/** Opens Chrome's install dialog. The saved prompt can only be used once,
 * whatever the user picks. */
export async function promptInstall(): Promise<void> {
  const prompt = deferredPrompt;
  if (!prompt) {
    return;
  }
  deferredPrompt = null;
  await prompt.prompt();
  await prompt.userChoice;
  notify();
}
