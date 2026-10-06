'use client';

import { useEffect } from 'react';

import { watchSystemTheme } from '~/lib/theme';

/** Mounted once in the root layout so "Match my phone" follows the phone
 * switching between light and dark while ABRO is open. Renders nothing. */
export function ThemeSync() {
  useEffect(watchSystemTheme, []);
  return null;
}
