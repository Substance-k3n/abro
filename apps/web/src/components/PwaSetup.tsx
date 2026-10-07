'use client';

import { useEffect } from 'react';

import { setUpPwa } from '~/lib/pwa';

/** Mounted once in the root layout so the service worker registers and
 * Chrome's install prompt is caught on every page, not just the ones
 * that show an install button. Renders nothing. */
export function PwaSetup() {
  useEffect(setUpPwa, []);
  useEffect(preventPinchZoom, []);
  return null;
}

/** iOS Safari ignores the viewport's user-scalable=no, so pinch zoom is
 * stopped at its gesture events (iOS-only; other browsers never fire
 * them). Double-tap zoom is off everywhere via touch-action in
 * globals.css. */
function preventPinchZoom() {
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', stop);
  document.addEventListener('gesturechange', stop);
  return () => {
    document.removeEventListener('gesturestart', stop);
    document.removeEventListener('gesturechange', stop);
  };
}
