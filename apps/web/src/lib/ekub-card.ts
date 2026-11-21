// Turns an ekub's detail into what the card shows (components/ekub/
// EkubCard.tsx), for Home and the Ekub list.

import type { EkubCardData } from '~/components/ekub/EkubCard';

import { cadenceLabel, ekubMoney, formatDay, myPosition, turns } from './ekub-view';
import { type Ekub, type EkubDetail, getEkub } from './ekubs-api';
import { colorForId, initialsOf } from './identity';
import { photoSrc } from './photos';

/** Full detail for the ekubs that are running and that I take part in.
 * Best-effort: one that fails to load is left out, never an error, because
 * the pages around it matter more than this card. */
export async function loadRunningEkubs(list: Ekub[]): Promise<EkubDetail[]> {
  const running = list.filter((e) => e.status === 'ACTIVE' && e.myStatus === 'ACTIVE');
  const details = await Promise.all(running.map((e) => getEkub(e.id).catch(() => null)));
  return details.filter((d): d is EkubDetail => d !== null);
}

/** What I still have to put in this round (nothing recorded yet), in
 * minor units. */
export function dueThisRound(d: EkubDetail): bigint {
  return (myPosition(d)?.toPay ?? [])
    .filter((o) => o.round === d.currentRound && o.status === 'DUE')
    .reduce((sum, o) => sum + o.amount, 0n);
}

export function toEkubCard(d: EkubDetail): EkubCardData {
  const round = Math.max(d.currentRound, 1);
  const position = myPosition(d);
  const due = dueThisRound(d);
  const taking = turns(d)[round - 1] ?? [];
  const active = d.members.filter((m) => m.status === 'ACTIVE');
  const roundDue = d.rounds[round - 1]?.dueDate ?? null;
  const myTurnDue = position ? (d.rounds[position.me.slotPosition - 1]?.dueDate ?? null) : null;
  return {
    id: d.id,
    name: d.name,
    memberCount: active.length,
    contribution: `${ekubMoney(d.slotAmount, d)} ${cadenceLabel(d.cadence)}`,
    currentRound: round,
    totalRounds: d.rounds.length,
    nextDue: roundDue ? formatDay(roundDue) : null,
    recipient: taking.length > 0 ? taking.map((m) => m.displayName.split(' ')[0]).join(', ') : null,
    yourTurn: position
      ? `Round ${position.me.slotPosition}${myTurnDue ? ` · ${formatDay(myTurnDue)}` : ''}`
      : null,
    members: active.slice(0, 3).map((m) => ({
      id: m.id,
      initials: initialsOf(m.displayName),
      color: colorForId(m.userId),
      photo: photoSrc(m.avatarUrl),
    })),
    toPay: due > 0n ? ekubMoney(due, d) : null,
  };
}
