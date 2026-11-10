// Client-side reference data: fixed lists the UI picks from, not facts
// about anyone's money. Moved here from the old ~/lib/mock-data.ts when
// Phase 8 finished replacing every mock fact with apps/api data
// (docs/WIRING_PLAN.md) -- these two lists were all that was left.

/** Expense categories (EXP-01's category selector), from the
 * prototype's `CATEGORIES`. The spec also lists "Restaurant"; it's
 * covered by "Food", as in the prototype. apps/api accepts any 1–60
 * character category, so this list is a UI choice, not a server rule. */
export const CATEGORIES = [
  { label: 'Food', icon: '🍽️' },
  { label: 'Coffee', icon: '☕' },
  { label: 'Transport', icon: '🚗' },
  { label: 'Groceries', icon: '🛒' },
  { label: 'Rent', icon: '🏠' },
  { label: 'Utilities', icon: '⚡' },
  { label: 'Entertainment', icon: '🎬' },
  { label: 'Shopping', icon: '🛍️' },
  { label: 'Travel', icon: '✈️' },
  { label: 'Other', icon: '📦' },
] as const;

/** Group types, from the prototype's GROUP_TYPES plus "Other" (the
 * spec's GRP-01 lists 6). `id.toUpperCase()` is apps/api's group_type
 * enum value (FRIENDS, TRIP, ...) -- see ~/lib/groups-api.ts's
 * groupTypeFor(). `icon` matches packages/ui's GROUP_ICONS keys. */
// Friends and Team used to be '#6366f1'/'#8b5cf6' -- the old indigo/
// violet brand's own hues, left over from before the orange rebrand
// (2026-11-10 feedback: read as an unfinished job, not a deliberate
// category color). Replaced with hues that don't double as anything
// else in the palette: --accent is orange, --owed/--c-green is green,
// --owe/--c-red is red, so none of these six repeat those either.
export const GROUP_TYPES: { id: string; label: string; icon: string; color: string }[] = [
  { id: 'Friends', label: 'Friends', icon: '👫', color: '#0369a1' },
  { id: 'Trip', label: 'Trip', icon: '✈️', color: 'var(--c-amber)' },
  { id: 'Household', label: 'Household', icon: '🏠', color: '#14b8a6' },
  { id: 'Family', label: 'Family', icon: '👨‍👩‍👧', color: '#ec4899' },
  { id: 'Team', label: 'Team', icon: '💼', color: '#334155' },
  { id: 'Other', label: 'Other', icon: '💸', color: '#64748b' },
];
