// Typed calls into apps/api's /ekubs routes (ADR-024). Shapes mirror
// apps/api/internal/apitypes/ekubs.go; amounts are minor-unit strings on
// the wire and bigint here.

import { api } from './api-client';

export type EkubCadence = 'WEEKLY' | 'MONTHLY';
export type EkubMemberStatus = 'INVITED' | 'ACTIVE' | 'LEFT';
/** DUE: nothing recorded yet. PENDING: the payer says paid, waiting for
 * the person paid. CONFIRMED: done. */
export type EkubPaymentStatus = 'DUE' | 'PENDING' | 'CONFIRMED';

export interface Ekub {
  id: string;
  name: string;
  currency: string;
  slotAmount: bigint;
  cadence: EkubCadence;
  status: 'DRAFT' | 'ACTIVE';
  /** YYYY-MM-DD, set when the admin starts it. */
  startDate: string | null;
  createdById: string;
  myStatus: EkubMemberStatus;
  myRole: 'ADMIN' | 'MEMBER';
  memberCount: number;
}

export interface EkubMember {
  id: string;
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  role: 'ADMIN' | 'MEMBER';
  status: EkubMemberStatus;
  /** Their part of their turn, put in every round. */
  amount: bigint;
  /** The round their turn takes the pot. */
  slotPosition: number;
  /** The first round they put in (1 unless they joined later). */
  joinedRound: number;
}

export interface EkubRound {
  round: number;
  dueDate: string | null;
  memberIds: string[];
  /** What the others put in (each recipient also keeps their own part). */
  pot: bigint;
  confirmed: bigint;
}

export interface EkubObligation {
  payerMemberId: string;
  recipientMemberId: string;
  amount: bigint;
  round: number;
  status: EkubPaymentStatus;
  paymentId: string | null;
}

export interface EkubDetail extends Ekub {
  myMemberId: string;
  /** The round now collecting; 0 before the start. */
  currentRound: number;
  members: EkubMember[];
  rounds: EkubRound[];
  obligations: EkubObligation[];
  canLeave: boolean;
  leaveBlockedWhy: string | null;
}

type Wire<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };
type WireDetail = Omit<Wire<EkubDetail>, 'members' | 'rounds' | 'obligations'> & {
  members: Wire<EkubMember>[];
  rounds: Wire<EkubRound>[];
  obligations: Wire<EkubObligation>[];
};

function toEkub(e: Wire<Ekub>): Ekub {
  return { ...e, slotAmount: BigInt(e.slotAmount) };
}

function toDetail(d: WireDetail): EkubDetail {
  return {
    ...d,
    slotAmount: BigInt(d.slotAmount),
    members: d.members.map((m) => ({ ...m, amount: BigInt(m.amount) })),
    rounds: d.rounds.map((r) => ({ ...r, pot: BigInt(r.pot), confirmed: BigInt(r.confirmed) })),
    obligations: d.obligations.map((o) => ({ ...o, amount: BigInt(o.amount) })),
  };
}

export async function listEkubs(): Promise<Ekub[]> {
  return (await api.get<Wire<Ekub>[]>('/ekubs/')).map(toEkub);
}

export async function getEkub(id: string): Promise<EkubDetail> {
  return toDetail(await api.get<WireDetail>(`/ekubs/${id}`));
}

/** One person's part of a turn. `id` is a user id when creating and a
 * member id when rearranging. */
export interface EkubShareInput {
  id: string;
  amount: bigint;
  /** Before the start: the round they joined in, for an ekub that was
   * already running (default 1). */
  joinedRound?: number;
}

const wireSlots = (slots: EkubShareInput[][]) =>
  slots.map((slot) =>
    slot.map((s) => ({ id: s.id, amount: s.amount.toString(), joinedRound: s.joinedRound })),
  );

export interface CreateEkubInput {
  name: string;
  slotAmount: bigint;
  cadence: EkubCadence;
  /** In payout order. You must be in one; the others are your friends
   * and get invited. */
  slots: EkubShareInput[][];
}

export async function createEkub(input: CreateEkubInput): Promise<EkubDetail> {
  return toDetail(
    await api.post<WireDetail>('/ekubs/', {
      name: input.name,
      slotAmount: input.slotAmount.toString(),
      cadence: input.cadence,
      slots: wireSlots(input.slots),
    }),
  );
}

export async function updateEkubSlots(id: string, slots: EkubShareInput[][]): Promise<EkubDetail> {
  return toDetail(await api.patch<WireDetail>(`/ekubs/${id}/slots`, { slots: wireSlots(slots) }));
}

/** A past `startDate` enters an ekub that was already running;
 * `pastPaid` records the rounds already over as paid. */
export async function startEkub(
  id: string,
  startDate: string,
  pastPaid: boolean,
): Promise<EkubDetail> {
  return toDetail(await api.post<WireDetail>(`/ekubs/${id}/start`, { startDate, pastPaid }));
}

export async function addEkubMember(
  id: string,
  input: { userId: string; amount?: bigint; position?: number },
): Promise<EkubDetail> {
  return toDetail(
    await api.post<WireDetail>(`/ekubs/${id}/members`, {
      userId: input.userId,
      amount: input.amount?.toString(),
      position: input.position,
    }),
  );
}

export async function removeEkubMember(id: string, memberId: string): Promise<EkubDetail> {
  return toDetail(await api.delete<WireDetail>(`/ekubs/${id}/members/${memberId}`));
}

export async function acceptEkub(id: string): Promise<EkubDetail> {
  return toDetail(await api.post<WireDetail>(`/ekubs/${id}/accept`));
}

/** Also declines an invitation. */
export function leaveEkub(id: string): Promise<void> {
  return api.post(`/ekubs/${id}/leave`);
}

export function deleteEkub(id: string): Promise<void> {
  return api.delete(`/ekubs/${id}`);
}

/** PAID: I paid `memberId` (waits for them to confirm). RECEIVED:
 * `memberId` paid me (counts at once). */
export async function recordEkubPayment(
  id: string,
  memberId: string,
  direction: 'PAID' | 'RECEIVED',
): Promise<EkubDetail> {
  return toDetail(await api.post<WireDetail>(`/ekubs/${id}/payments`, { memberId, direction }));
}

export async function resolveEkubPayment(
  id: string,
  paymentId: string,
  confirm: boolean,
): Promise<EkubDetail> {
  return toDetail(
    await api.post<WireDetail>(
      `/ekubs/${id}/payments/${paymentId}/${confirm ? 'confirm' : 'reject'}`,
    ),
  );
}
