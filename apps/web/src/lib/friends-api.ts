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

/** Exact email, phone or username match only (apps/api never
 * fuzzy-searches the user directory), so this returns at most one
 * profile. apps/api lowercases the query for the email and username
 * checks and accepts a leading "@" on usernames. The result's email is
 * null unless the query was that email. */
export function searchUsers(query: string): Promise<AuthProfile[]> {
  return api.get(`/friends/search?query=${encodeURIComponent(query.trim())}`);
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
