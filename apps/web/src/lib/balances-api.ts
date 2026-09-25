// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's
// /balances routes, plus the sign-convention conversion every screen
// that shows a balance needs.
//
// apps/api's two balance sources use OPPOSITE sign conventions, and
// getting this backwards silently shows debts in the wrong direction:
//   - Friend balances (GetPairwiseBalance -> the `friends` array below):
//     positive = "I owe them" (apps/api/internal/balances/service.go's
//     own doc comment: "userA owes userB", userA is always the current
//     user here).
//   - Group balances (GetGroupSummary -> the `groups` array below):
//     positive = "they owe me" / "the group owes me" -- paid minus
//     owed, matching this app's existing mock Group.balance convention
//     exactly (see ~/lib/mock-data.ts's own comment on that field).
// `friendOweSplit` below is the one place the friend conversion happens
// -- every screen showing a friend balance should call it rather than
// re-deriving the sign logic.

import { api } from './api-client';
import type { FriendListItem } from './friends-api';
import type { AuthGroup } from './groups-api';
import { colorForId, initialsOf } from './identity';

export interface FriendBalance {
  friendId: string;
  /** Minor-units integer string, apps/api's `money.MinorUnits` wire
   * format -- BigInt(netBalance) directly, no scaling needed. */
  netBalance: string;
}

export interface GroupBalance {
  groupId: string;
  netBalance: string;
}

export interface BalancesSummary {
  friends: FriendBalance[];
  groups: GroupBalance[];
}

export function getBalancesSummary(): Promise<BalancesSummary> {
  return api.get('/balances/summary');
}

/** Splits one friend's signed net balance into the two unsigned
 * quantities this app's UI has always displayed separately ("they owe
 * you" in green, "you owe them" in red) -- same shape as the mock
 * `Friend.owes`/`Friend.iOwe` fields this replaces. */
export function friendOweSplit(netBalance: bigint): { owes: bigint; iOwe: bigint } {
  return netBalance < 0n ? { owes: -netBalance, iOwe: 0n } : { owes: 0n, iOwe: netBalance };
}

export interface FriendRow {
  id: string;
  name: string;
  initials: string;
  color: string;
  owes: bigint;
  iOwe: bigint;
}

/** Combines `listFriends()` + `getBalancesSummary()` into the per-friend
 * display rows every friend-list screen needs (Home, DASH-03, DASH-06)
 * -- one place this join lives, so they can't drift apart on it. */
export function deriveFriendRows(
  friends: FriendListItem[],
  balances: BalancesSummary,
): FriendRow[] {
  const balanceByFriend = new Map(balances.friends.map((f) => [f.friendId, BigInt(f.netBalance)]));
  return friends.map((f) => {
    const { owes, iOwe } = friendOweSplit(balanceByFriend.get(f.friend.id) ?? 0n);
    return {
      id: f.friend.id,
      name: f.friend.displayName,
      initials: initialsOf(f.friend.displayName),
      color: colorForId(f.friend.id),
      owes,
      iOwe,
    };
  });
}

export interface GroupRow {
  id: string;
  name: string;
  /** apps/api's UPPERCASE group type -- pass to ~/lib/groups-api.ts's
   * `groupTypeFor()` for its icon/color. */
  type: string;
  /** Positive = the group owes you (no sign conversion needed, unlike
   * friend balances -- see this file's header comment). */
  balance: bigint;
}

/** Combines `listGroups()` + `getBalancesSummary()` into the per-group
 * display rows every group-list screen needs (Home, DASH-05, DASH-06)
 * -- icon/color are deliberately not included here (UI-layer reference
 * data); callers map `type` through `groupTypeFor()`. */
export function deriveGroupRows(groups: AuthGroup[], balances: BalancesSummary): GroupRow[] {
  const balanceByGroup = new Map(balances.groups.map((g) => [g.groupId, BigInt(g.netBalance)]));
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    balance: balanceByGroup.get(g.id) ?? 0n,
  }));
}
