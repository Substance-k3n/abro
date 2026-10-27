'use client';

// Voice commands through Tezaz (docs/DECISIONS.md ADR-027), for testers
// only: apps/api's GET /voice decides, so everyone else renders nothing
// and loads no session. The assistant can only call the actions below,
// and each one goes through the same ~/lib/*-api.ts calls the screens
// use -- apps/api still checks every rule and permission. Adding an
// expense moves money, so the widget asks before it runs (dangerous).
//
// It sits beside the page, not around it, so turning voice on never
// remounts the screen underneath.

import { type MinorUnits, formatMoney } from '@abro/types';
import { TezazProvider, TezazWidget, useCapability } from '@tezaz/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { friendOweSplit, getBalancesSummary } from '~/lib/balances-api';
import { currencyMeta } from '~/lib/ekub-view';
import { parseAmount } from '~/lib/expense-split';
import { createExpense } from '~/lib/expenses-api';
import { type FriendListItem, listFriends } from '~/lib/friends-api';
import { type GroupListItem, getGroup, listGroups } from '~/lib/groups-api';
import { CATEGORIES } from '~/lib/reference-data';
import { type VoiceStatus, getVoiceStatus, getVoiceToken } from '~/lib/voice-api';

/** Pages the assistant may open by name. */
const PAGES: Record<string, string> = {
  home: '/home',
  groups: '/groups',
  friends: '/friends',
  balances: '/balances',
  activity: '/activity',
  payments: '/payments',
  notifications: '/notifications',
  settings: '/settings',
  profile: '/profile',
  'add expense': '/expenses/new',
};

/** Best match for a spoken name: exact, then starts-with, then contains. */
function pick<T>(items: T[], name: (item: T) => string, spoken: string): T | undefined {
  const s = spoken.trim().toLowerCase();
  const names = items.map((i) => name(i).toLowerCase());
  const at =
    [
      names.indexOf(s),
      names.findIndex((n) => n.startsWith(s)),
      names.findIndex((n) => n.includes(s)),
    ].find((i) => i >= 0) ?? -1;
  return items[at];
}

const money = (amount: MinorUnits, currency: string) => formatMoney(amount, currencyMeta(currency));

function VoiceActions() {
  const router = useRouter();
  // Loaded once per session so the confirmation question can name the
  // group and its size without a request; refreshed when an action runs.
  const groups = useRef<GroupListItem[]>([]);
  const friends = useRef<FriendListItem[]>([]);
  useEffect(() => {
    listGroups().then(
      (g) => (groups.current = g),
      () => {},
    );
    listFriends().then(
      (f) => (friends.current = f),
      () => {},
    );
  }, []);

  const findGroup = async (spoken: string) => {
    groups.current = await listGroups();
    const group = pick(groups.current, (g) => g.name, spoken);
    if (!group) {
      throw new Error(
        `No group called "${spoken}". The groups are: ${groups.current.map((g) => g.name).join(', ') || 'none'}.`,
      );
    }
    return group;
  };

  useCapability<{ page: string }>({
    name: 'open_page',
    description: 'Open one of the app pages.',
    parameters: {
      type: 'object',
      properties: { page: { type: 'string', enum: Object.keys(PAGES) } },
      required: ['page'],
    },
    handler: ({ page }) => {
      router.push(PAGES[page]!);
      return `opened ${page}`;
    },
  });

  useCapability<{ group: string }>({
    name: 'open_group',
    description: "Open a group's page by its name.",
    parameters: {
      type: 'object',
      properties: { group: { type: 'string', description: 'The group name as the user said it.' } },
      required: ['group'],
    },
    handler: async ({ group }) => {
      const g = await findGroup(group);
      router.push(`/groups/${g.id}`);
      return `opened the group ${g.name}`;
    },
  });

  useCapability<{ friend: string }>({
    name: 'open_friend',
    description: "Open a friend's page, with what you owe each other, by their name.",
    parameters: {
      type: 'object',
      properties: { friend: { type: 'string', description: 'The name as the user said it.' } },
      required: ['friend'],
    },
    handler: async ({ friend }) => {
      friends.current = await listFriends();
      const f = pick(friends.current, (x) => x.friend.displayName, friend);
      if (!f) {
        throw new Error(`No friend called "${friend}".`);
      }
      router.push(`/friends/${f.friend.id}`);
      return `opened ${f.friend.displayName}`;
    },
  });

  useCapability({
    name: 'get_balances',
    description:
      'Who owes the user and whom the user owes: each friend and each group with a balance. Use for "who owes me", "what do I owe", "my balance".',
    handler: async () => {
      const [summary, fs, gs] = await Promise.all([
        getBalancesSummary(),
        listFriends(),
        listGroups(),
      ]);
      const nameOf = new Map(fs.map((f) => [f.friend.id, f.friend.displayName]));
      const groupOf = new Map(gs.map((g) => [g.id, g]));
      const lines: string[] = [];
      for (const b of summary.friends) {
        const { owes, iOwe } = friendOweSplit(BigInt(b.netBalance));
        const name = nameOf.get(b.friendId) ?? 'a friend';
        if (iOwe > 0n) {
          lines.push(`You owe ${name} ${money(iOwe, 'ETB')}.`);
        }
        if (owes > 0n) {
          lines.push(`${name} owes you ${money(owes, 'ETB')}.`);
        }
      }
      for (const b of summary.groups) {
        const net = BigInt(b.netBalance);
        const g = groupOf.get(b.groupId);
        // Group net positive = the group owes me.
        if (g && net > 0n) {
          lines.push(`In ${g.name}, the group owes you ${money(net, g.currency)}.`);
        } else if (g && net < 0n) {
          lines.push(`In ${g.name}, you owe ${money(-net, g.currency)}.`);
        }
      }
      return lines.length ? lines.join(' ') : 'All settled: nobody owes anything.';
    },
  });

  useCapability<{ group: string; amount: number; description: string; category?: string }>({
    name: 'add_group_expense',
    description:
      'Add an expense the user paid in one of their groups, split equally between all its members. Ask for the amount and what it was for if missing.',
    parameters: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'The group name as the user said it.' },
        amount: { type: 'number', description: 'In the group currency, e.g. 300 or 45.50.' },
        description: { type: 'string', description: 'What it was for, e.g. "lunch".' },
        category: { type: 'string', enum: CATEGORIES.map((c) => c.label) },
      },
      required: ['group', 'amount', 'description'],
    },
    dangerous: true,
    describe: ({ group, amount, description }) => {
      const g = pick(groups.current, (x) => x.name, group);
      const where = g
        ? `${g.name}, split equally between ${g.memberCount} people`
        : `the group "${group}"`;
      return `Add ${money(parseAmount(String(amount)), g?.currency ?? 'ETB')} for "${description}" in ${where}, paid by you?`;
    },
    handler: async ({ group, amount, description, category }) => {
      const g = await findGroup(group);
      const minor = parseAmount(String(amount));
      if (minor <= 0n) {
        throw new Error('The amount must be more than zero.');
      }
      const members = (await getGroup(g.id)).members.filter((m) => m.status === 'ACTIVE');
      const expense = await createExpense(
        {
          splitType: 'EQUAL',
          name: description.trim().slice(0, 100) || 'Expense',
          category: category ?? 'Other',
          amount: minor.toString(),
          groupId: g.id,
          expenseDate: new Date().toISOString().slice(0, 10),
          participants: members.map((m) => ({ userId: m.userId })),
        },
        crypto.randomUUID(),
      );
      router.push(`/expenses/${expense.id}`);
      return `Added ${money(minor, g.currency)} for "${expense.name}" in ${g.name}, split between ${members.length} people.`;
    },
  });

  return null;
}

export function VoiceAssistant() {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    getVoiceStatus().then(setStatus, () => setStatus({ enabled: false }));
    // Above the bottom nav on phones (md breakpoint, as in AppShell).
    const mq = window.matchMedia('(max-width: 767px)');
    setNarrow(mq.matches);
    const on = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  if (!status?.enabled) {
    return null;
  }
  return (
    <TezazProvider
      relayUrl={status.sessionUrl}
      token={getVoiceToken}
      language="am-ET"
      autoConnect={false}
    >
      <VoiceActions />
      <TezazWidget offset={narrow ? 104 : 24} strings={{ title: 'ABRO' }} />
    </TezazProvider>
  );
}
