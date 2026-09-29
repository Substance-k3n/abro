// Phase 8 slice 9b (docs/WIRING_PLAN.md) -- typed calls into apps/api's
// /settlements route, plus the "how much can I settle with this person"
// figure every settle-up step shows.
//
// A settlement is an Expense row with splitType SETTLEMENT (ADR-003),
// recorded by the person who pays -- apps/api only lets the debtor
// record one. It stores no payment method or note.
//
// The cap is apps/api's own rule, mirrored here for display only (the
// server re-checks it on submit):
//  - Personal: what you owe them across your personal expenses (friend
//    balance, positive = you owe them -- ~/lib/balances-api.ts).
//  - In a group (ADR-010): you must owe the group (net < 0) and they
//    must be owed (net > 0); the cap is the smaller of the two.

import { api } from './api-client';
import { type AuthProfile, me } from './auth-api';
import { getBalancesSummary, getGroupBalances } from './balances-api';
import type { AuthExpense } from './expenses-api';
import { listFriends } from './friends-api';
import { getGroup } from './groups-api';

export interface CreateSettlementInput {
  toUserId: string;
  /** Minor units as a positive integer string. */
  amount: string;
  groupId?: string;
}

/** POST /settlements/. `idempotencyKey` should be stable per settle
 * flow, so a retried confirm can't record the payment twice. */
export function createSettlement(
  input: CreateSettlementInput,
  idempotencyKey: string,
): Promise<AuthExpense> {
  return api.post('/settlements/', input, { 'Idempotency-Key': idempotencyKey });
}

export interface SettleTarget {
  me: AuthProfile;
  person: AuthProfile;
  group: { id: string; name: string } | null;
  /** Most you can settle with them right now; 0 = nothing to settle. */
  outstanding: bigint;
}

/** Everything STL-02/03/04 need about who you're paying. Throws (like
 * any API call) when the group or person can't be loaded; returns
 * `null` when they aren't a friend / group member of yours. */
export async function loadSettleTarget(
  toUserId: string,
  groupId: string | null,
): Promise<SettleTarget | null> {
  if (groupId) {
    const [profile, group, entries] = await Promise.all([
      me(),
      getGroup(groupId),
      getGroupBalances(groupId),
    ]);
    const member = group.members.find((m) => m.userId === toUserId && m.status === 'ACTIVE');
    if (!member) {
      return null;
    }
    const nets = new Map(entries.map((e) => [e.userId, BigInt(e.netBalance)]));
    const myNet = nets.get(profile.id) ?? 0n;
    const theirNet = nets.get(toUserId) ?? 0n;
    const outstanding = myNet < 0n && theirNet > 0n ? (-myNet < theirNet ? -myNet : theirNet) : 0n;
    return {
      me: profile,
      person: member.user,
      group: { id: group.id, name: group.name },
      outstanding,
    };
  }

  const [profile, friends, summary] = await Promise.all([
    me(),
    listFriends(),
    getBalancesSummary(),
  ]);
  const friend = friends.find((f) => f.friend.id === toUserId);
  if (!friend) {
    return null;
  }
  const net = BigInt(summary.friends.find((f) => f.friendId === toUserId)?.netBalance ?? '0');
  return { me: profile, person: friend.friend, group: null, outstanding: net > 0n ? net : 0n };
}
