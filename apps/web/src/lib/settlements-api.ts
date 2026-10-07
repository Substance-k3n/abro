// Phase 8 slice 9b (docs/WIRING_PLAN.md) -- typed calls into apps/api's
// /settlements route, plus the "how much can I settle with this person"
// figure every settle-up step shows.
//
// A settlement is an Expense row with splitType SETTLEMENT (ADR-003). It
// stores no payment method or note.
//
// ADR-019 (confirmation): when the person who owes records a payment, it
// is a *request* that changes nothing until the person paid confirms it
// (or rejects it; the payer can cancel it while it waits). When the
// person paid records it ("They paid me"), it counts at once.
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

export type SettlementRequestStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

/** apps/api/internal/apitypes/settlements.go's SettlementRequest. */
export interface SettlementRequest {
  id: string;
  payer: AuthProfile;
  recipient: AuthProfile;
  groupId: string | null;
  /** null for a group that has since been deleted. */
  groupName: string | null;
  /** Minor units. */
  amount: string;
  currency: string;
  status: SettlementRequestStatus;
  hasReceipt: boolean;
  /** The SETTLEMENT expense, once confirmed. */
  settlementId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** POST /settlements/: records a payment you made, as a request the
 * person you paid must confirm. `idempotencyKey` should be stable per
 * settle flow, so a retried submit can't record it twice. */
export function createSettlement(
  input: CreateSettlementInput,
  idempotencyKey: string,
): Promise<SettlementRequest> {
  return api.post('/settlements/', input, { 'Idempotency-Key': idempotencyKey });
}

export interface RecordReceivedInput {
  fromUserId: string;
  /** Minor units as a positive integer string. */
  amount: string;
  groupId?: string;
}

/** POST /settlements/received: you record a payment you received. It
 * counts straight away. */
export function recordReceived(
  input: RecordReceivedInput,
  idempotencyKey: string,
): Promise<AuthExpense> {
  return api.post('/settlements/received', input, { 'Idempotency-Key': idempotencyKey });
}

/** GET /settlements/requests: yours, either side -- every pending one
 * and those resolved in the last 30 days. */
export function listSettlementRequests(): Promise<SettlementRequest[]> {
  return api.get('/settlements/requests');
}

export function confirmSettlementRequest(id: string): Promise<SettlementRequest> {
  return api.post(`/settlements/requests/${id}/confirm`);
}

export function rejectSettlementRequest(id: string): Promise<SettlementRequest> {
  return api.post(`/settlements/requests/${id}/reject`);
}

export function cancelSettlementRequest(id: string): Promise<SettlementRequest> {
  return api.post(`/settlements/requests/${id}/cancel`);
}

/** Attach proof (a transfer screenshot, a receipt) to your pending
 * payment. Same image rules as expense receipts. */
export function uploadSettlementReceipt(id: string, file: Blob): Promise<SettlementRequest> {
  const form = new FormData();
  form.append('file', file);
  return api.postForm(`/settlements/requests/${id}/receipt`, form);
}

export function getSettlementReceiptUrl(id: string): Promise<{ url: string }> {
  return api.get(`/settlements/requests/${id}/receipt`);
}

/** What someone owes you (their side of SettleTarget), for "They paid
 * me". Personal: their friend balance; in a group: they owe the group
 * and you're owed, capped by the smaller (ADR-010). */
export async function loadReceiveTarget(
  fromUserId: string,
  groupId: string | null,
): Promise<SettleTarget | null> {
  if (groupId) {
    const [profile, group, entries] = await Promise.all([
      me(),
      getGroup(groupId),
      getGroupBalances(groupId),
    ]);
    const member = group.members.find((m) => m.userId === fromUserId && m.status === 'ACTIVE');
    if (!member) {
      return null;
    }
    const nets = new Map(entries.map((e) => [e.userId, BigInt(e.netBalance)]));
    const myNet = nets.get(profile.id) ?? 0n;
    const theirNet = nets.get(fromUserId) ?? 0n;
    const outstanding = theirNet < 0n && myNet > 0n ? (-theirNet < myNet ? -theirNet : myNet) : 0n;
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
  const friend = friends.find((f) => f.friend.id === fromUserId);
  if (!friend) {
    return null;
  }
  // Friend balances: positive = you owe them, negative = they owe you.
  const net = BigInt(summary.friends.find((f) => f.friendId === fromUserId)?.netBalance ?? '0');
  return { me: profile, person: friend.friend, group: null, outstanding: net < 0n ? -net : 0n };
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
