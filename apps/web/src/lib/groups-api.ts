// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's /groups
// routes. Shapes mirror apps/api/internal/apitypes/groups.go.
//
// `members` is always `[]` on the list endpoint (apps/api's own
// GET /groups/ never populates it -- only GET /groups/{id} does). For a
// member count use the list-only `memberCount` field instead (added to
// GET /groups/ in slice 4 for DASH-05, alongside `lastActivityAt`).

import { api } from './api-client';
import { GROUP_TYPES } from './mock-data';

export interface AuthGroup {
  id: string;
  name: string;
  type: string;
  currency: string;
  description: string | null;
  simplifyDebts: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  members: unknown[];
}

/** GET /groups/'s element shape (apps/api/internal/apitypes/groups.go's
 * GroupListItem): an AuthGroup plus two list-only summary fields. */
export interface GroupListItem extends AuthGroup {
  /** ACTIVE members only -- pending invites don't count. */
  memberCount: number;
  /** Most recent non-deleted expense's createdAt, or the group's own
   * createdAt if it has none yet. */
  lastActivityAt: string;
}

export function listGroups(): Promise<GroupListItem[]> {
  return api.get('/groups/');
}

export type GroupType = (typeof GROUP_TYPES)[number];

/** Icon/color/label for a real group's UPPERCASE `type` enum, via
 * ~/lib/mock-data.ts's GROUP_TYPES table (client-side reference data,
 * not mock facts), falling back to "Other" for an unknown value -- the
 * one place this match lives, shared by Home, Balances and Groups. */
export function groupTypeFor(type: string): GroupType {
  return (
    GROUP_TYPES.find((t) => t.id.toUpperCase() === type) ?? GROUP_TYPES[GROUP_TYPES.length - 1]!
  );
}
