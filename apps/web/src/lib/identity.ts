// Phase 8 (docs/WIRING_PLAN.md) -- shared display-identity helpers for
// real `AuthProfile`s (~/lib/auth-api.ts). Real profiles have no stored
// avatar color (AUTH-06/PRF-01's color swatch picker is cosmetic-only,
// never sent to the API -- see those screens' own header comments), so
// every screen that renders a real person's avatar needs a client-side
// substitute: initials computed the same way setup-profile already
// does, and a color deterministically derived from their id so the same
// person renders the same color everywhere and across reloads, without
// needing to store one.

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#14b8a6', '#8b5cf6', '#f43f5e'];

export function initialsOf(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return '?';
  }
  return trimmed
    .split(' ')
    .map((word) => word[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

/** Deterministic, not random -- a simple string hash over `id` (stable
 * across sessions/reloads) indexes into the same palette AUTH-06/PRF-01
 * use, so a manually-chosen color and an auto-derived one look like they
 * belong to the same system. */
export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}
