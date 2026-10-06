'use client';

import { useEffect } from 'react';

import { setUpPwa } from '~/lib/pwa';

/** Mounted once in the root layout so the service worker registers and
 * Chrome's install prompt is caught on every page, not just the ones
 * that show an install button. Renders nothing. */
export function PwaSetup() {
  useEffect(setUpPwa, []);
  return null;
}
