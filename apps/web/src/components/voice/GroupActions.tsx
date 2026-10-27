'use client';

// Voice actions for groups and ekub (ADR-027): make a group and invite
// friends, invite one more, and answer questions -- a group's balances,
// who pays next (ADR-025), and where the user stands in an ekub
// (ADR-024). Inviting is admin-only in apps/api; its answer is passed on.

import { useCapability } from '@tezaz/react';
import { useRouter } from 'next/navigation';

import { getGroupBalances, getNextPayers } from '~/lib/balances-api';
import { formatDay, memberById, myPosition } from '~/lib/ekub-view';
import { getEkub, listEkubs } from '~/lib/ekubs-api';
import { addGroupMember, createGroup, getGroup } from '~/lib/groups-api';
import { GROUP_TYPES } from '~/lib/reference-data';

import { money, pick, useDirectory } from './shared';

const GROUP = { type: 'string', description: 'The group name as the user said it.' } as const;

export function GroupActions() {
  const router = useRouter();
  const { findGroup, findFriend, friendNamed } = useDirectory();

  /** Group member names by user id, active members and anyone who left. */
  const memberNames = async (groupId: string) =>
    new Map((await getGroup(groupId)).members.map((m) => [m.userId, m.user.displayName]));

  useCapability<{ name: string; type?: string; friends?: string[] }>({
    name: 'create_group',
    description:
      'Create a new group and invite friends to it. They join when they accept. Currency is birr.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The new group name.' },
        type: { type: 'string', enum: GROUP_TYPES.map((t) => t.id) },
        friends: {
          type: 'array',
          items: { type: 'string' },
          description: 'Friends to invite, by name.',
        },
      },
      required: ['name'],
    },
    confirm: true,
    describe: ({ name, friends }) => {
      const who = (friends ?? []).map((f) => friendNamed(f)?.displayName ?? f);
      return `Create the group "${name}"${who.length ? ` and invite ${who.join(', ')}` : ''}?`;
    },
    handler: async ({ name, type, friends }) => {
      const invitees = await Promise.all((friends ?? []).map((f) => findFriend(f)));
      const group = await createGroup({
        name: name.trim().slice(0, 80),
        type: (type ?? 'Other').toUpperCase(),
        currency: 'ETB',
        memberIds: invitees.map((f) => f.id),
      });
      router.push(`/groups/${group.id}`);
      return `Created ${group.name}${invitees.length ? `, invited ${invitees.map((f) => f.displayName).join(', ')}` : ''}.`;
    },
  });

  useCapability<{ group: string; friend: string }>({
    name: 'add_group_member',
    description: 'Invite a friend to one of the groups the user is an admin of.',
    parameters: {
      type: 'object',
      properties: {
        group: GROUP,
        friend: { type: 'string', description: 'The friend to invite, by name.' },
      },
      required: ['group', 'friend'],
    },
    confirm: true,
    describe: ({ group, friend }) =>
      `Invite ${friendNamed(friend)?.displayName ?? friend} to ${group}?`,
    handler: async ({ group, friend }) => {
      const [g, f] = await Promise.all([findGroup(group), findFriend(friend)]);
      await addGroupMember(g.id, f.id);
      return `Invited ${f.displayName} to ${g.name}. They join when they accept.`;
    },
  });

  useCapability<{ group: string }>({
    name: 'group_balances',
    description: 'Who is owed and who owes in one group.',
    parameters: { type: 'object', properties: { group: GROUP }, required: ['group'] },
    handler: async ({ group }) => {
      const g = await findGroup(group);
      const [entries, names] = await Promise.all([getGroupBalances(g.id), memberNames(g.id)]);
      const lines = entries
        .map((e) => ({ name: names.get(e.userId) ?? 'someone', net: BigInt(e.netBalance) }))
        .filter((e) => e.net !== 0n)
        // Group convention: positive = the group owes them.
        .map((e) =>
          e.net > 0n
            ? `${e.name} is owed ${money(e.net, g.currency)}.`
            : `${e.name} owes ${money(-e.net, g.currency)}.`,
        );
      return lines.length ? `In ${g.name}: ${lines.join(' ')}` : `${g.name} is all settled.`;
    },
  });

  useCapability<{ group: string }>({
    name: 'who_pays_next',
    description: "Whose turn it is to pay the group's next bill, in order.",
    parameters: { type: 'object', properties: { group: GROUP }, required: ['group'] },
    handler: async ({ group }) => {
      const g = await findGroup(group);
      const [{ payers }, names] = await Promise.all([getNextPayers(g.id), memberNames(g.id)]);
      if (payers.length === 0) {
        return `Nobody in ${g.name} owes the group, so anyone can pay next.`;
      }
      return `In ${g.name}, next to pay: ${payers
        .map((p) => `${names.get(p.userId) ?? 'someone'} (owes ${money(p.owes, g.currency)})`)
        .join(', then ')}.`;
    },
  });

  useCapability<{ ekub?: string }>({
    name: 'ekub_status',
    description:
      "Where the user stands in an ekub: this round's turn, what they pay and receive, and when their own turn comes. Name the ekub if they have several.",
    parameters: {
      type: 'object',
      properties: { ekub: { type: 'string', description: 'The ekub name, if given.' } },
    },
    handler: async ({ ekub }) => {
      const mine = (await listEkubs()).filter((e) => e.myStatus === 'ACTIVE');
      const chosen = ekub
        ? pick(mine, (e) => e.name, ekub)
        : mine.length === 1
          ? mine[0]
          : undefined;
      if (!chosen) {
        throw new Error(
          mine.length === 0
            ? 'You are not in any ekub.'
            : `Which ekub? ${mine.map((e) => e.name).join(', ')}.`,
        );
      }
      const d = await getEkub(chosen.id);
      const pos = myPosition(d);
      if (d.status !== 'ACTIVE' || !pos) {
        return `${d.name} hasn't started yet.`;
      }
      const byId = memberById(d);
      const round = d.rounds.find((r) => r.round === d.currentRound);
      const takers = (round?.memberIds ?? []).map((id) => byId.get(id)?.displayName ?? 'someone');
      const due = pos.toPay.filter((o) => o.round <= d.currentRound && o.status !== 'CONFIRMED');
      const owed = due.reduce((sum, o) => sum + o.amount, 0n);
      const myRound = d.rounds.find((r) => r.memberIds.includes(pos.me.id));
      const parts = [
        `${d.name}, round ${d.currentRound}${round?.dueDate ? ` (due ${formatDay(round.dueDate)})` : ''}: ${takers.join(' and ')} take${takers.length === 1 ? 's' : ''} the pot.`,
        owed > 0n
          ? `You still have ${money(owed, d.currency)} to pay.`
          : 'You have paid everything due.',
        myRound
          ? myRound.round === d.currentRound
            ? `It's your turn this round: ${money(pos.take, d.currency)}.`
            : `Your turn ${myRound.round < d.currentRound ? 'was' : 'is'} round ${myRound.round}${myRound.dueDate ? `, ${formatDay(myRound.dueDate)}` : ''}: ${money(pos.take, d.currency)}.`
          : '',
      ];
      router.push(`/ekub/${d.id}`);
      return parts.filter(Boolean).join(' ');
    },
  });

  return null;
}
