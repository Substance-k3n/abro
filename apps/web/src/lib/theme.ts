'use client';

// Light / Dark / "Match my phone" (globals.css). The choice is a per-device
// preference kept in localStorage (best effort: private mode or blocked
// storage just means the default). Light is the default whatever the
// phone's own setting.
//
// The resolved theme is stamped on <html data-theme> twice: by THEME_SCRIPT
// inline in the root layout's <head>, before the first paint, so there's
// no flash of the wrong theme; and by applyTheme() whenever the choice
// changes, or the phone switches while "Match my phone" is on.

import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'abro.theme';

/** Runs before React. Kept tiny and dependency-free; mirrors
 * readChoice() + resolve() below. */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem('${STORAGE_KEY}');var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'system' ? value : 'light';
  } catch {
    return 'light';
  }
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && systemDark().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Mounted once (ThemeSync in the root layout): follows the phone while
 * "Match my phone" is the choice. */
export function watchSystemTheme(): () => void {
  const query = systemDark();
  const onChange = () => {
    if (readChoice() === 'system') {
      applyTheme('system');
    }
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  // 'light' on the server and first render; the real choice right after.
  const [choice, setChoice] = useState<ThemeChoice>('light');
  useEffect(() => setChoice(readChoice()), []);

  const update = (next: ThemeChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered on this device, but still applied for this visit.
    }
    applyTheme(next);
    setChoice(next);
  };
  return [choice, update];
}
