'use client';

// Read-only voice actions (ADR-027): find expenses, read the latest
// activity, and explain a balance with one friend from the expenses
// behind it. Everything comes from GET /expenses (listExpenses) and the
// balance calls the screens use; nothing here changes data.

import { useCapability } from '@tezaz/react';

import { type AuthProfile, me } from '~/lib/auth-api';
import { friendOweSplit, getFriendBalance } from '~/lib/balances-api';
import { type AuthExpense, listExpenses } from '~/lib/expenses-api';

import { money, useDirectory } from './shared';

/** One expense as a short sentence, with the user's own share. */
function line(e: AuthExpense, myId: string): string {
  const mine = e.participants.find((p) => p.user.id === myId);
  const share = mine ? `, your share ${money(BigInt(mine.amount), e.currency)}` : '';
  const payer = e.paidBy.id === myId ? 'you' : e.paidBy.displayName;
  return `${e.expenseDate.slice(0, 10)}: ${e.name}, ${money(BigInt(e.amount), e.currency)} paid by ${payer}${share}`;
}

/** Totals per currency, so a mixed list doesn't add birr to dollars. */
function totals(list: AuthExpense[]): string {
  const sums = new Map<string, bigint>();
  for (const e of list) {
    sums.set(e.currency, (sums.get(e.currency) ?? 0n) + BigInt(e.amount));
  }
  return [...sums].map(([c, v]) => money(v, c)).join(' and ');
}

export function SearchActions() {
  const { findGroup, findFriend } = useDirectory();

  useCapability<{ text?: string; group?: string; friend?: string }>({
    name: 'search_expenses',
    description:
      'Find expenses by words in their name (e.g. "fuel"), and/or in one group, and/or with one friend. Use for "what did we spend on…", "show the taxi expenses".',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Words to look for in the expense name.' },
        group: { type: 'string', description: 'A group name, if the user named one.' },
        friend: { type: 'string', description: 'A friend name, if the user named one.' },
      },
    },
    handler: async ({ text, group, friend }) => {
      const [profile, g, f] = await Promise.all([
        me(),
        group ? findGroup(group) : undefined,
        friend ? findFriend(friend) : undefined,
      ]);
      const found = (
        await listExpenses({
          ...(text ? { search: text } : {}),
          ...(g ? { groupId: g.id } : {}),
          ...(f ? { friendId: f.id } : {}),
          limit: 30,
        })
      ).filter((e) => !e.deletedAt);
      if (found.length === 0) {
        return 'No expenses match.';
      }
      const shown = found.slice(0, 8).map((e) => line(e, profile.id));
      return `${found.length}${found.length === 30 ? '+' : ''} expenses, ${totals(found)} in all. ${shown.join('. ')}.`;
    },
  });

  useCapability({
    name: 'recent_activity',
    description: 'The latest expenses and payments the user is part of.',
    handler: async () => {
      const [profile, list] = await Promise.all([me(), listExpenses({ limit: 8 })]);
      const live = list.filter((e) => !e.deletedAt);
      return live.length
        ? live.map((e) => line(e, profile.id)).join('. ')
        : 'Nothing has happened yet.';
    },
  });

  useCapability<{ friend: string }>({
    name: 'explain_balance',
    description:
      'Explain where the balance with one friend comes from: the total, and the latest expenses and payments between you.',
    parameters: {
      type: 'object',
      properties: { friend: { type: 'string', description: 'The name as the user said it.' } },
      required: ['friend'],
    },
    handler: async ({ friend }) => {
      const f: AuthProfile = await findFriend(friend);
      const [profile, balance, list] = await Promise.all([
        me(),
        getFriendBalance(f.id),
        listExpenses({ friendId: f.id, limit: 10 }),
      ]);
      const { owes, iOwe } = friendOweSplit(BigInt(balance.netBalance));
      const total =
        iOwe > 0n
          ? `You owe ${f.displayName} ${money(iOwe, 'ETB')}`
          : owes > 0n
            ? `${f.displayName} owes you ${money(owes, 'ETB')}`
            : `You and ${f.displayName} are settled`;
      const since = balance.owingSince ? `, unpaid since ${balance.owingSince.slice(0, 10)}` : '';
      const latest = list.filter((e) => !e.deletedAt).map((e) => line(e, profile.id));
      return `${total}${since}. ${latest.length ? `Latest: ${latest.join('. ')}.` : ''}`;
    },
  });

  return null;
}
