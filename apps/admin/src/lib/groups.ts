// Group types as the PWA shows them (apps/web/src/lib/reference-data.ts's
// GROUP_TYPES), keyed by apps/api's group_type enum.

const TYPES: Record<string, { label: string; icon: string }> = {
  FRIENDS: { label: 'Friends', icon: '👫' },
  TRIP: { label: 'Trip', icon: '✈️' },
  HOUSEHOLD: { label: 'Household', icon: '🏠' },
  FAMILY: { label: 'Family', icon: '👨‍👩‍👧' },
  TEAM: { label: 'Team', icon: '💼' },
  OTHER: { label: 'Other', icon: '💸' },
};

export const groupType = (t: string) =>
  TYPES[t] ?? { label: t.charAt(0) + t.slice(1).toLowerCase(), icon: '💸' };
