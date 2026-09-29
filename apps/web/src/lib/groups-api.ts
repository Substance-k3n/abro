// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's /groups
// routes. Shapes mirror apps/api/internal/apitypes/groups.go.
//
// `members` is always `[]` on the list endpoint (apps/api's own
// GET /groups/ never populates it -- only GET /groups/{id} does). For a
// member count use the list-only `memberCount` field instead (added to
// GET /groups/ in slice 4 for DASH-05, alongside `lastActivityAt`).

import { api } from './api-client';
import type { AuthProfile } from './auth-api';
import { GROUP_TYPES } from './mock-data';

/** apps/api/internal/apitypes/groups.go's GroupMember. */
export interface GroupMember {
  id: string;
  userId: string;
  role: 'ADMIN' | 'MEMBER';
  status: 'INVITED' | 'ACTIVE' | 'LEFT';
  joinedAt: string;
  user: AuthProfile;
}

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
  /** Populated by getGroup() only -- always `[]` from listGroups(). */
  members: GroupMember[];
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

/** GET /groups/{id} -- the one endpoint that populates `members`. */
export function getGroup(id: string): Promise<AuthGroup> {
  return api.get(`/groups/${id}`);
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
