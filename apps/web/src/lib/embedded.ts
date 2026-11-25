'use client';

// ABRO can open inside a wallet's mini-app frame (an in-app browser in a
// mobile-money or super app) as well as in a normal browser or as the
// installed app. Two things differ in there:
//
// - Google refuses to sign people in from an embedded browser
//   ("disallowed_useragent"), so the sign-in page offers email only.
// - There is nothing to install: the wallet is the app.
//
// A wallet can say so by opening ABRO with `?embed=1` (remembered for the
// visit); otherwise the usual in-app-browser user agents are recognised.

import { useSyncExternalStore } from 'react';

const KEY = 'abro_embedded';

function standalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isEmbedded(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('embed') === '1') {
      sessionStorage.setItem(KEY, '1');
    }
    if (sessionStorage.getItem(KEY) === '1') {
      return true;
    }
  } catch {
    // storage blocked: fall back to the user agent
  }
  // The installed app on an iPhone also has no "Safari" in its user agent.
  if (standalone()) {
    return false;
  }
  const ua = navigator.userAgent;
  // Android WebView marks itself "; wv)"; an iOS in-app browser is WebKit
  // without "Safari".
  return /; wv\)/.test(ua) || (/iphone|ipad|ipod/i.test(ua) && !/safari/i.test(ua));
}

const never = () => () => {};

/** isEmbedded() for components; false while server-rendering. */
export function useEmbedded(): boolean {
  return useSyncExternalStore(never, isEmbedded, () => false);
}
