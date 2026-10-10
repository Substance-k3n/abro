// Display helpers for the ekub screens (ADR-024): money in the ekub's
// currency, round dates, and what the viewer owes and is owed, all read
// off the detail the API already derived (~/lib/ekubs-api.ts).

import { type CurrencyMeta, ETB, formatMoney } from '@abro/types';

import type { Ekub, EkubDetail, EkubMember, EkubObligation } from './ekubs-api';

export function currencyMeta(code: string): CurrencyMeta {
  return code === ETB.code ? ETB : { ...ETB, code, symbol: code, nativeSymbol: code };
}

export function ekubMoney(amount: bigint, ekub: Pick<Ekub, 'currency'>): string {
  return formatMoney(amount, currencyMeta(ekub.currency));
}

export function cadenceLabel(cadence: Ekub['cadence']): string {
  return cadence === 'WEEKLY' ? 'weekly' : 'monthly';
}

/** "Mon 2 Mar" from a YYYY-MM-DD date, read as a calendar day. */
export function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Today as YYYY-MM-DD in the viewer's own time zone. */
export function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** How many rounds are already over (due before `today`) for an ekub
 * starting on `start` -- the same counting as the API's CurrentRound.
 * Dates are YYYY-MM-DD; months step like Go's AddDate (31 Jan + 1 month
 * = 3 Mar). */
export function roundsOver(start: string, cadence: Ekub['cadence'], today: string): number {
  const [y, m, d] = start.split('-').map(Number);
  const due = (round: number) => {
    const date =
      cadence === 'MONTHLY'
        ? new Date(Date.UTC(y!, m! - 1 + round - 1, d!))
        : new Date(Date.UTC(y!, m! - 1, d! + 7 * (round - 1)));
    return date.toISOString().slice(0, 10);
  };
  let over = 0;
  while (due(over + 1) < today) {
    over++;
  }
  return over;
}

export function memberById(detail: EkubDetail): Map<string, EkubMember> {
  return new Map(detail.members.map((m) => [m.id, m]));
}

/** A payment still open after its round's due date has passed. */
export function isOverdue(o: EkubObligation, detail: EkubDetail): boolean {
  return detail.status === 'ACTIVE' && o.status !== 'CONFIRMED' && o.round < detail.currentRound;
}

export interface MyPosition {
  me: EkubMember;
  /** What the others put into my pot, and my own part back. */
  fromOthers: bigint;
  take: bigint;
  /** Payments I make / receive, by round. */
  toPay: EkubObligation[];
  toReceive: EkubObligation[];
}

export function myPosition(detail: EkubDetail): MyPosition | null {
  const me = detail.members.find((m) => m.id === detail.myMemberId);
  if (!me) {
    return null;
  }
  const toPay = detail.obligations.filter((o) => o.payerMemberId === me.id);
  const toReceive = detail.obligations.filter((o) => o.recipientMemberId === me.id);
  const fromOthers = toReceive.reduce((sum, o) => sum + o.amount, 0n);
  return { me, fromOthers, take: fromOthers + me.amount, toPay, toReceive };
}

/** The turns, in order, as groups of members (taking part only). */
export function turns(detail: EkubDetail): EkubMember[][] {
  const byId = memberById(detail);
  return detail.rounds.map((r) =>
    r.memberIds.map((id) => byId.get(id)).filter((m): m is EkubMember => !!m),
  );
}

/** Key for one payment, payer then recipient. */
export const paymentKey = (payer: string, recipient: string) => `${payer}>${recipient}`;

/** What happens to a missed payment from before the ekub was entered
 * (the API decides the same way): if the payer's own turn is still to
 * come the two skip each other; if they already took the pot, it stays
 * owed. */
export function missedKind(o: EkubObligation, detail: EkubDetail): 'skip' | 'owed' {
  const payer = memberById(detail).get(o.payerMemberId);
  return payer && payer.slotPosition > o.round ? 'skip' : 'owed';
}

/** The payments of the rounds already over (1..`over`), for marking who
 * didn't pay when entering a running ekub. A payment drops out once the
 * other way round was marked missed in an earlier round: the two skip
 * each other, so it was never due. */
export function pastPayments(
  detail: EkubDetail,
  over: number,
  missed: ReadonlySet<string>,
): EkubObligation[] {
  const byId = memberById(detail);
  return detail.obligations.filter((o) => {
    if (o.round > over) {
      return false;
    }
    const payerTurn = byId.get(o.payerMemberId)?.slotPosition ?? 0;
    return !(payerTurn < o.round && missed.has(paymentKey(o.recipientMemberId, o.payerMemberId)));
  });
}
