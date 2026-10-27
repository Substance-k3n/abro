'use client';

// Helpers the voice actions share (ADR-027): matching a spoken name to a
// group or friend, and the lists the confirmation questions read without
// a request of their own.

import { type MinorUnits, formatMoney } from '@abro/types';
import { useEffect, useRef } from 'react';

import { currencyMeta } from '~/lib/ekub-view';
import { parseAmount } from '~/lib/expense-split';
import { type FriendListItem, listFriends } from '~/lib/friends-api';
import { type GroupListItem, listGroups } from '~/lib/groups-api';

/** Best match for a spoken name: exact, then starts-with, then contains. */
export function pick<T>(items: T[], name: (item: T) => string, spoken: string): T | undefined {
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

export const money = (amount: MinorUnits, currency: string) =>
  formatMoney(amount, currencyMeta(currency));

/** A spoken amount in minor units; throws for zero or less. */
export function spokenAmount(amount: number): MinorUnits {
  const minor = parseAmount(String(amount));
  if (minor <= 0n) {
    throw new Error('The amount must be more than zero.');
  }
  return minor;
}

/** The user's groups and friends: loaded once per session so the
 * confirmation questions can name people and head counts, and reloaded
 * whenever an action looks one up. */
export function useDirectory() {
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

  const findFriend = async (spoken: string) => {
    friends.current = await listFriends();
    const friend = pick(friends.current, (f) => f.friend.displayName, spoken);
    if (!friend) {
      throw new Error(
        `No friend called "${spoken}". Your friends are: ${friends.current.map((f) => f.friend.displayName).join(', ') || 'none'}.`,
      );
    }
    return friend.friend;
  };

  /** For confirmation questions: no request, best guess from the loaded lists. */
  const groupNamed = (spoken: string) => pick(groups.current, (g) => g.name, spoken);
  const friendNamed = (spoken: string) =>
    pick(friends.current, (f) => f.friend.displayName, spoken)?.friend;

  return { findGroup, findFriend, groupNamed, friendNamed };
}
