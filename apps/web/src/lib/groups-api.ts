// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's /groups
// routes. Shapes mirror apps/api/internal/apitypes/groups.go.
//
// `members` is always `[]` on the list endpoint (apps/api's own
// GET /groups/ never populates it -- only GET /groups/{id} does), so
// nothing here should rely on it for a member count; that needs its own
// per-group fetch, deferred to whichever later slice needs it (Groups
// DASH-05, Group Detail GRP-03).

import { api } from './api-client';

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

export function listGroups(): Promise<AuthGroup[]> {
  return api.get('/groups/');
}
