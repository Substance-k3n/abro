// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's
// /friends routes. Shapes mirror apps/api/internal/apitypes/friends.go.

import { api } from './api-client';
import type { AuthProfile } from './auth-api';

export interface FriendListItem {
  friendshipId: string;
  since: string;
  friend: AuthProfile;
}

export interface IncomingFriendRequest {
  friendshipId: string;
  sentAt: string;
  from: AuthProfile;
}

export interface FriendRequestResult {
  friendshipId: string;
  status: 'PENDING' | 'ACCEPTED';
}

export function listFriends(): Promise<FriendListItem[]> {
  return api.get('/friends/');
}

/** Exact email/phone match only (apps/api never fuzzy-searches the user
 * directory), so this returns at most one profile. Emails are stored
 * lowercased (apitypes.NormalizeEmail) but the search query isn't, so
 * lowercase it here or a capitalised address never matches. */
export function searchUsers(query: string): Promise<AuthProfile[]> {
  const q = query.trim();
  const normalized = q.includes('@') ? q.toLowerCase() : q;
  return api.get(`/friends/search?query=${encodeURIComponent(normalized)}`);
}

export function listIncomingRequests(): Promise<IncomingFriendRequest[]> {
  return api.get('/friends/requests');
}

export function sendFriendRequest(friendId: string): Promise<FriendRequestResult> {
  return api.post('/friends/requests', { friendId });
}

export function acceptFriendRequest(friendshipId: string): Promise<FriendRequestResult> {
  return api.post(`/friends/requests/${friendshipId}/accept`);
}

export function declineFriendRequest(friendshipId: string): Promise<void> {
  return api.delete(`/friends/requests/${friendshipId}`);
}
