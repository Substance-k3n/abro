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
