'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

import { allowStaleReads, onApiUpdate } from './api-client';

/** For viewing screens (ADR-022): lets the screen's reads answer at once
 * from saved data, even old or offline, and re-runs its `load` whenever
 * the read cache gets newer data in the background or the app becomes
 * visible again -- swapping in the server's answer with no skeleton in
 * between. So `load` must not reset its data to null before fetching.
 * Money flows (settle, edit) don't use this, so they always read fresh. */
export function useApiRefresh(load: () => void): void {
  const latest = useRef(load);
  latest.current = load;
  // Layout effect: runs before the screen's own useEffect(load), so its
  // first reads already may use saved data.
  useLayoutEffect(() => allowStaleReads(), []);
  useEffect(() => onApiUpdate(() => latest.current()), []);
}
