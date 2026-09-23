// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's
// /friends routes. Shapes mirror apps/api/internal/apitypes/friends.go.

import { api } from './api-client';
import type { AuthProfile } from './auth-api';

export interface FriendListItem {
  friendshipId: string;
  since: string;
  friend: AuthProfile;
}

export function listFriends(): Promise<FriendListItem[]> {
  return api.get('/friends/');
}
