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

/** apps/api's CreateGroupInput. `type` is the UPPERCASE enum
 * (FRIENDS/TRIP/...); `memberIds` must all be your friends, and each
 * is added as INVITED -- they join once they accept. */
export interface CreateGroupInput {
  name: string;
  type: string;
  currency: string;
  description?: string;
  memberIds: string[];
}

/** POST /groups/ -- you become its only ACTIVE member (and admin). */
export function createGroup(input: CreateGroupInput): Promise<AuthGroup> {
  return api.post('/groups/', input);
}

export interface GroupInvite {
  /** `members` is always `[]` here. */
  group: AuthGroup;
  invitedAt: string;
}

/** GET /groups/invites -- groups you've been invited to and haven't
 * answered yet. */
export function listGroupInvites(): Promise<GroupInvite[]> {
  return api.get('/groups/invites');
}

/** POST /groups/{id}/invite/accept -- you become an ACTIVE member. */
export function acceptGroupInvite(groupId: string): Promise<unknown> {
  return api.post(`/groups/${groupId}/invite/accept`);
}

/** Declining is leaving: apps/api has no separate decline route, and
 * DELETE /groups/{id}/members/{you} marks your INVITED row LEFT (an
 * admin can re-invite you later). */
export function declineGroupInvite(groupId: string, myId: string): Promise<void> {
  return api.delete(`/groups/${groupId}/members/${myId}`);
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
