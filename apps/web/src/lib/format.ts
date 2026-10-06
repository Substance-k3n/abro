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

/** Masks an email address for display ("chiefwevoo1@gmail.com" →
 * "ch*****o1@gmail.com"), so a screen that shows where a code was sent
 * doesn't print the full address to anyone looking over a shoulder. The
 * star count is fixed rather than one per hidden character, so it doesn't
 * reveal the address's length either. Local parts of 4 characters or
 * fewer keep only their first character, since keeping two at each end
 * would show nearly all of them. The domain stays readable, so the user
 * can still tell which inbox to check. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) {
    return email;
  }
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const masked =
    local.length <= 4 ? `${local[0]}*****` : `${local.slice(0, 2)}*****${local.slice(-2)}`;
  return masked + domain;
}
