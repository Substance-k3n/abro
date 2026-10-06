// "Who owes what" (roadmap Phase 5): everything owed to you, or everything
// you owe, per person -- the screens behind Home's "Owed to you" / "You
// owe" figures.
//
// A person's total combines:
//  - your personal balance with them (friend balances, ~/lib/balances-api),
//  - and, for each group you share, what the group's simplified payments
//    (GET /balances/groups/{id}/simplified) have them pay you, or you pay
//    them.
// Simplified payments move exactly each member's net, so the per-person
// totals add up to the same owed/owe totals Home's card shows
// (balanceTotals), not a different number. People who aren't your friends
// (group members only) are included, named from the group's member list.

import { type AuthProfile, me } from './auth-api';
import { deriveFriendRows, getBalancesSummary, getSimplifiedPayments } from './balances-api';
import { listFriends } from './friends-api';
import { getGroup, listGroups } from './groups-api';
import { colorForId, initialsOf } from './identity';
import { photoSrc } from './photos';

export type Direction = 'owed' | 'owe';

export interface BreakdownLine {
  /** null for the personal (non-group) balance. */
  groupId: string | null;
  groupName: string | null;
  amount: bigint;
}

export interface PersonBreakdown {
  id: string;
  name: string;
  initials: string;
  color: string;
  photo: string | null;
  /** Whether they're your friend (personal lines link to their page). */
  isFriend: boolean;
  total: bigint;
  lines: BreakdownLine[];
}

export interface Breakdown {
  direction: Direction;
  total: bigint;
  people: PersonBreakdown[];
}

export async function loadBreakdown(direction: Direction): Promise<Breakdown> {
  const [profile, friends, groups, summary] = await Promise.all([
    me(),
    listFriends(),
    listGroups(),
    getBalancesSummary(),
  ]);

  const people = new Map<string, PersonBreakdown>();
  const personFor = (user: AuthProfile, isFriend: boolean): PersonBreakdown => {
    let person = people.get(user.id);
    if (!person) {
      person = {
        id: user.id,
        name: user.displayName,
        initials: initialsOf(user.displayName),
        color: colorForId(user.id),
        photo: photoSrc(user.avatarUrl),
        isFriend,
        total: 0n,
        lines: [],
      };
      people.set(user.id, person);
    }
    return person;
  };
  const add = (person: PersonBreakdown, line: BreakdownLine) => {
    person.lines.push(line);
    person.total += line.amount;
  };

  // Personal balances.
  const friendIds = new Set(friends.map((f) => f.friend.id));
  const rows = deriveFriendRows(friends, summary);
  for (const f of friends) {
    const row = rows.find((r) => r.id === f.friend.id);
    const amount = direction === 'owed' ? (row?.owes ?? 0n) : (row?.iOwe ?? 0n);
    if (amount > 0n) {
      add(personFor(f.friend, true), { groupId: null, groupName: null, amount });
    }
  }

  // Groups where your own net points this way: owed (> 0) or owe (< 0).
  const myNet = new Map(summary.groups.map((g) => [g.groupId, BigInt(g.netBalance)]));
  const relevant = groups.filter((g) => {
    const net = myNet.get(g.id) ?? 0n;
    return direction === 'owed' ? net > 0n : net < 0n;
  });
  const details = await Promise.all(
    relevant.map((g) => Promise.all([getGroup(g.id), getSimplifiedPayments(g.id)])),
  );
  for (const [group, payments] of details) {
    for (const payment of payments) {
      const otherId =
        direction === 'owed'
          ? payment.toUserId === profile.id
            ? payment.fromUserId
            : null
          : payment.fromUserId === profile.id
            ? payment.toUserId
            : null;
      if (otherId) {
        const member = group.members.find((m) => m.userId === otherId);
        const user: AuthProfile = member?.user ?? {
          id: otherId,
          displayName: 'Former member',
          avatarUrl: null,
          email: null,
          username: null,
          preferredCurrency: group.currency,
          locale: 'en',
        };
        add(personFor(user, friendIds.has(otherId)), {
          groupId: group.id,
          groupName: group.name,
          amount: payment.amount,
        });
      }
    }
  }

  const list = [...people.values()].sort((a, b) =>
    b.total === a.total ? a.name.localeCompare(b.name) : b.total > a.total ? 1 : -1,
  );
  return { direction, total: list.reduce((sum, p) => sum + p.total, 0n), people: list };
}
