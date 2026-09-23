// Phase 8 (docs/WIRING_PLAN.md) -- shared display-formatting helpers for
// real API timestamps.

/** Absolute short date ("Sep 23"), not relative ("2h ago") -- no
 * relative-time formatter exists in this app yet; adding one is out of
 * scope for the slice that first needed this (Home, DASH-01). Shared
 * here so Notifications (DASH-07) and any later screen don't each grow
 * their own copy. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
