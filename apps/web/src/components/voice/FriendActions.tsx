'use client';

// Voice actions for friends and paying (ADR-027): expenses and loans with
// one friend, payments either way, reminders and friend requests. The
// money rules stay apps/api's: a payment you record is a claim the other
// person confirms (ADR-019); "they paid me" counts at once; the settle
// caps are checked here first only to give a clear spoken answer.

import { useCapability } from '@tezaz/react';
import { useRouter } from 'next/navigation';

import { me } from '~/lib/auth-api';
import { createExpense } from '~/lib/expenses-api';
import { searchUsers, sendFriendRequest } from '~/lib/friends-api';
import { getGroup } from '~/lib/groups-api';
import { CATEGORIES } from '~/lib/reference-data';
import { remindFriend } from '~/lib/reminders-api';
import {
  createSettlement,
  loadReceiveTarget,
  loadSettleTarget,
  recordReceived,
} from '~/lib/settlements-api';

import { money, pick, spokenAmount, useDirectory } from './shared';

const PERSON = { type: 'string', description: 'The name as the user said it.' } as const;
const GROUP = {
  type: 'string',
  description: 'Only when the user names a group; omit for a personal payment.',
} as const;

export function FriendActions() {
  const router = useRouter();
  const { findGroup, findFriend, friendNamed } = useDirectory();

  /** Someone to pay or be paid by: a group member when a group is named, else a friend. */
  const findPerson = async (spoken: string, group?: string) => {
    if (!group) {
      return { person: await findFriend(spoken), groupId: null, groupName: null };
    }
    const g = await findGroup(group);
    const members = (await getGroup(g.id)).members.filter((m) => m.status === 'ACTIVE');
    const m = pick(members, (x) => x.user.displayName, spoken);
    if (!m) {
      throw new Error(`Nobody called "${spoken}" in ${g.name}.`);
    }
    return { person: m.user, groupId: g.id, groupName: g.name };
  };

  const nameOf = (spoken: string) => friendNamed(spoken)?.displayName ?? spoken;
  const inGroup = (group?: string) => (group ? ` in ${group}` : '');

  useCapability<{
    friend: string;
    amount: number;
    description: string;
    paid_by: 'me' | 'them';
    split: 'equal' | 'all';
    category?: string;
  }>({
    name: 'add_friend_expense',
    description:
      'Add an expense or a loan with one friend, outside any group. paid_by: who paid. split "equal" halves it; "all" means the one who did not pay owes the whole amount (a loan, e.g. "I lent Abebe 500").',
    parameters: {
      type: 'object',
      properties: {
        friend: PERSON,
        amount: { type: 'number', description: 'In birr, e.g. 200 or 45.50.' },
        description: { type: 'string', description: 'What it was for, e.g. "taxi".' },
        paid_by: { type: 'string', enum: ['me', 'them'] },
        split: { type: 'string', enum: ['equal', 'all'] },
        category: { type: 'string', enum: CATEGORIES.map((c) => c.label) },
      },
      required: ['friend', 'amount', 'description', 'paid_by', 'split'],
    },
    dangerous: true,
    describe: ({ friend, amount, description, paid_by, split }) => {
      const who = nameOf(friend);
      const total = money(spokenAmount(amount), 'ETB');
      const payer = paid_by === 'me' ? 'you paid' : `${who} paid`;
      const owes =
        split === 'equal'
          ? 'split equally between you two'
          : paid_by === 'me'
            ? `${who} owes you all of it`
            : `you owe ${who} all of it`;
      return `Add ${total} for "${description}" with ${who}: ${payer}, ${owes}?`;
    },
    handler: async ({ friend, amount, description, paid_by, split, category }) => {
      const [f, profile] = await Promise.all([findFriend(friend), me()]);
      const minor = spokenAmount(amount);
      const payer = paid_by === 'me' ? profile.id : f.id;
      const debtor = paid_by === 'me' ? f.id : profile.id;
      const expense = await createExpense(
        {
          splitType: split === 'equal' ? 'EQUAL' : 'EXACT',
          name: description.trim().slice(0, 100) || 'Expense',
          category: category ?? 'Other',
          amount: minor.toString(),
          paidById: payer,
          expenseDate: new Date().toISOString().slice(0, 10),
          participants:
            split === 'equal'
              ? [{ userId: profile.id }, { userId: f.id }]
              : [{ userId: debtor, amount: minor.toString() }],
        },
        crypto.randomUUID(),
      );
      router.push(`/expenses/${expense.id}`);
      return `Added ${money(minor, 'ETB')} for "${expense.name}" with ${f.displayName}.`;
    },
  });

  useCapability<{ person: string; amount: number; group?: string }>({
    name: 'record_payment',
    description:
      'Record that the user paid someone back. It waits until that person confirms it. Name a group only if the debt is in that group.',
    parameters: {
      type: 'object',
      properties: {
        person: PERSON,
        amount: { type: 'number', description: 'In birr.' },
        group: GROUP,
      },
      required: ['person', 'amount'],
    },
    dangerous: true,
    describe: ({ person, amount, group }) =>
      `Record that you paid ${nameOf(person)} ${money(spokenAmount(amount), 'ETB')}${inGroup(group)}? They'll be asked to confirm it.`,
    handler: async ({ person, amount, group }) => {
      const { person: p, groupId, groupName } = await findPerson(person, group);
      const target = await loadSettleTarget(p.id, groupId);
      const minor = spokenAmount(amount);
      if (!target || target.outstanding === 0n) {
        throw new Error(
          `You don't owe ${p.displayName} anything${inGroup(groupName ?? undefined)}.`,
        );
      }
      if (minor > target.outstanding) {
        throw new Error(
          `You owe ${p.displayName} ${money(target.outstanding, 'ETB')}, so you can record at most that.`,
        );
      }
      await createSettlement(
        { toUserId: p.id, amount: minor.toString(), ...(groupId ? { groupId } : {}) },
        crypto.randomUUID(),
      );
      router.push('/payments');
      return `Recorded ${money(minor, 'ETB')} paid to ${p.displayName}. It counts once they confirm it.`;
    },
  });

  useCapability<{ person: string; amount: number; group?: string }>({
    name: 'record_received',
    description:
      'Record that someone paid the user back. It counts at once. Name a group only if the debt is in that group.',
    parameters: {
      type: 'object',
      properties: {
        person: PERSON,
        amount: { type: 'number', description: 'In birr.' },
        group: GROUP,
      },
      required: ['person', 'amount'],
    },
    dangerous: true,
    describe: ({ person, amount, group }) =>
      `Record that ${nameOf(person)} paid you ${money(spokenAmount(amount), 'ETB')}${inGroup(group)}?`,
    handler: async ({ person, amount, group }) => {
      const { person: p, groupId, groupName } = await findPerson(person, group);
      const target = await loadReceiveTarget(p.id, groupId);
      const minor = spokenAmount(amount);
      if (!target || target.outstanding === 0n) {
        throw new Error(
          `${p.displayName} doesn't owe you anything${inGroup(groupName ?? undefined)}.`,
        );
      }
      if (minor > target.outstanding) {
        throw new Error(
          `${p.displayName} owes you ${money(target.outstanding, 'ETB')}, so you can record at most that.`,
        );
      }
      await recordReceived(
        { fromUserId: p.id, amount: minor.toString(), ...(groupId ? { groupId } : {}) },
        crypto.randomUUID(),
      );
      router.push('/payments');
      return `Recorded that ${p.displayName} paid you ${money(minor, 'ETB')}.`;
    },
  });

  useCapability<{ friend: string }>({
    name: 'remind_friend',
    description: 'Send a payment reminder to a friend who owes the user money.',
    parameters: { type: 'object', properties: { friend: PERSON }, required: ['friend'] },
    confirm: true,
    describe: ({ friend }) => `Send ${nameOf(friend)} a reminder to pay you?`,
    handler: async ({ friend }) => {
      const f = await findFriend(friend);
      await remindFriend(f.id);
      return `Reminded ${f.displayName}.`;
    },
  });

  useCapability<{ name: string }>({
    name: 'send_friend_request',
    description: 'Send a friend request to someone on ABRO, found by name or username.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Their name or username.' } },
      required: ['name'],
    },
    confirm: true,
    describe: ({ name }) => `Send a friend request to "${name}"?`,
    handler: async ({ name }) => {
      const found = await searchUsers(name);
      if (found.length === 0) {
        throw new Error(`Nobody on ABRO matches "${name}".`);
      }
      if (found.length > 1) {
        throw new Error(
          `Several people match "${name}": ${found
            .slice(0, 5)
            .map((u) => `${u.displayName}${u.username ? ` (@${u.username})` : ''}`)
            .join(', ')}. Ask which one.`,
        );
      }
      await sendFriendRequest(found[0]!.id);
      return `Sent a friend request to ${found[0]!.displayName}.`;
    },
  });

  return null;
}
