// Roadmap P6 -- the group admin dashboard's calls into apps/api:
// group spending stats (apps/api/internal/analytics/group.go), payment
// reminders (ADR-018) and resending invites. Shapes mirror
// apps/api/internal/apitypes. Amounts come back as minor-unit strings
// and are turned into bigint here, like ~/lib/balances-api.ts.

import { api } from './api-client';

export interface MemberSpending {
  userId: string;
  paid: bigint;
  share: bigint;
}

export interface CategorySpending {
  category: string;
  amount: bigint;
}

export interface MonthSpending {
  year: number;
  /** 1-12, UTC calendar month. */
  month: number;
  total: bigint;
}

export interface GroupStats {
  totalSpent: bigint;
  expenseCount: number;
  settledTotal: bigint;
  /** Biggest payer first. Shares add up to totalSpent. */
  members: MemberSpending[];
  /** Biggest first. */
  categories: CategorySpending[];
  /** The last six calendar months, oldest first. */
  monthlyTrend: MonthSpending[];
}

interface GroupStatsWire {
  totalSpent: string;
  expenseCount: number;
  settledTotal: string;
  members: { userId: string; paid: string; share: string }[];
  categories: { category: string; amount: string }[];
  monthlyTrend: { year: number; month: number; totalSpending: string }[];
}

/** GET /analytics/groups/{id}: the group's whole-life spending
 * (settlements only in settledTotal, never as spending). */
export async function getGroupStats(groupId: string): Promise<GroupStats> {
  const s: GroupStatsWire = await api.get(`/analytics/groups/${groupId}`);
  return {
    totalSpent: BigInt(s.totalSpent),
    expenseCount: s.expenseCount,
    settledTotal: BigInt(s.settledTotal),
    members: s.members.map((m) => ({
      userId: m.userId,
      paid: BigInt(m.paid),
      share: BigInt(m.share),
    })),
    categories: s.categories.map((c) => ({ category: c.category, amount: BigInt(c.amount) })),
    monthlyTrend: s.monthlyTrend.map((m) => ({
      year: m.year,
      month: m.month,
      total: BigInt(m.totalSpending),
    })),
  };
}

export interface PaymentReminder {
  groupId: string;
  recipientId: string;
  /** Null for an automatic reminder from the daily job (ADR-023). */
  senderId: string | null;
  automatic: boolean;
  remindedAt: string;
  /** When this member can be reminded in this group again. */
  nextAllowedAt: string;
}

/** GET /groups/{id}/reminders (admins): the latest reminder per member. */
export function listReminders(groupId: string): Promise<PaymentReminder[]> {
  return api.get(`/groups/${groupId}/reminders`);
}

/** POST /groups/{id}/members/{userId}/remind. 429 REMINDER_TOO_SOON
 * within 24 hours of the last one; 409 NOTHING_OWED if they've since
 * settled. */
export function remindMember(groupId: string, userId: string): Promise<PaymentReminder> {
  return api.post(`/groups/${groupId}/members/${userId}/remind`);
}

/** The member's invite is resendable 24 hours after it was sent (or last
 * resent) -- `joinedAt` is the invite time while INVITED. */
export const INVITE_RESEND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** POST /groups/{id}/members/{userId}/resend-invite. 429
 * INVITE_RESENT_RECENTLY within 24 hours. */
export function resendInvite(groupId: string, userId: string): Promise<unknown> {
  return api.post(`/groups/${groupId}/members/${userId}/resend-invite`);
}

/** "3h", "2d", "5m" -- a short, rounded-up distance for "in 5h" / "3h
 * ago" labels. */
export function shortDuration(ms: number): string {
  const minutes = Math.max(1, Math.ceil(Math.abs(ms) / 60_000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
}
