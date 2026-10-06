'use client';

// "Install ABRO" (docs/DECISIONS.md ADR-015), in two places:
//  - Settings' App section (`variant="row"`): always there until the app
//    is installed, so people can find it later.
//  - A card at the top of Home (`variant="banner"`): dismissible, and the
//    dismissal is remembered in this browser (localStorage, best effort).
// Chrome and Android get the real install dialog. iPhone gets the Safari
// "Share -> Add to Home Screen" steps, since iOS has no install API.
// Nothing shows when the app is already installed, or when the browser
// can't install it.

import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { promptInstall, useInstallState } from '~/lib/pwa';

const DISMISS_KEY = 'abro.installBannerDismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function IosSteps() {
  return (
    <p className="text-[0.8rem] leading-relaxed" style={{ color: 'var(--t-dim)' }}>
      In Safari, tap <Share size={13} strokeWidth={2} className="inline align-[-2px]" /> Share, then{' '}
      <strong style={{ color: 'var(--t-secondary)' }}>Add to Home Screen</strong>.
    </p>
  );
}

export function InstallApp({ variant }: { variant: 'row' | 'banner' }) {
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(true);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => setDismissed(readDismissed()), []);

  if (state === 'installed' || state === 'unavailable') {
    return null;
  }
  if (variant === 'banner' && dismissed) {
    return null;
  }

  const onInstall = () => {
    if (state === 'prompt') {
      void promptInstall();
    } else {
      setShowIosSteps(true);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private mode or blocked storage: it just shows again next time.
    }
  };

  if (variant === 'row') {
    return (
      <div className="flex flex-col gap-2 rounded-xl px-3 py-2.5">
        <button type="button" onClick={onInstall} className="flex items-center justify-between">
          <span className="text-[0.85rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
            Install ABRO on this device
          </span>
          <Download size={16} strokeWidth={2} style={{ color: 'var(--accent)' }} />
        </button>
        {showIosSteps && <IosSteps />}
      </div>
    );
  }

  return (
    <div className="neo-raised-sm mb-5 flex items-start gap-3 rounded-[18px] p-4">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
        aria-hidden
      >
        <Download size={18} strokeWidth={2} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[0.88rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
          Get the ABRO app
        </p>
        {showIosSteps ? (
          <IosSteps />
        ) : (
          <>
            <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
              Install it on your home screen. It opens like any app, full screen.
            </p>
            <button
              type="button"
              onClick={onInstall}
              className="mt-1 self-start text-[0.82rem] font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              Install
            </button>
          </>
        )}
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
