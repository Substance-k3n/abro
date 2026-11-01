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

/**
 * Consonants of each row of the Ethiopic block (U+1200, 8 letters a row), in
 * Latin letters. Vowels are dropped on both sides, so only the consonants
 * have to agree: «አበበ» and "Abebe" are both "bb", «ቅዱስ» and "Kidus" "kds".
 */
// prettier-ignore
const ETHIOPIC_ROWS = [
  'h', 'l', 'h', 'm', 's', 'r', 's', 'sh', // ሀ ለ ሐ መ ሠ ረ ሰ ሸ
  'k', 'k', 'k', 'k', 'b', 'v', 't', 'ch', // ቀ ቈ ቐ ቘ በ ቨ ተ ቸ
  'h', 'h', 'n', 'n', '', 'k', 'k', 'h', //   ኀ ኈ ነ ኘ አ ከ ኰ ኸ
  'h', 'w', '', 'z', 'zh', 'y', 'd', 'd', //  ዀ ወ ዐ ዘ ዠ የ ደ ዸ
  'j', 'g', 'g', 'g', 't', 'ch', 'p', 'ts', // ጀ ገ ጐ ጘ ጠ ጨ ጰ ጸ
  'ts', 'f', 'p', //                          ፀ ፈ ፐ
];

/** How a name sounds, as consonants only, the same for Ethiopic and Latin spelling. */
export function soundKey(name: string): string {
  let latin = '';
  // Doubled Latin letters ("Yohannes") are one sound; Ethiopic doesn't write them twice.
  for (const ch of name.toLowerCase().replace(/([a-z])\1+/g, '$1')) {
    const cp = ch.codePointAt(0) ?? 0;
    latin += cp >= 0x1200 && cp < 0x1358 ? (ETHIOPIC_ROWS[(cp - 0x1200) >> 3] ?? '') : ch;
  }
  return latin
    .normalize('NFD')
    .replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/q/g, 'k')
    .replace(/c(?!h)/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/[aeiou]/g, '');
}

/**
 * Best match for a spoken name: exact, then starts-with, then contains; then
 * by sound, for the whole name or one of its words, so a name said in Amharic
 * finds one written in Latin letters and the other way round. A sound match
 * that fits two different people finds nobody, so the caller lists the names
 * and the assistant asks.
 */
export function pick<T>(items: T[], name: (item: T) => string, spoken: string): T | undefined {
  const s = spoken.trim().toLowerCase();
  const names = items.map((i) => name(i).toLowerCase());
  const at =
    [
      names.indexOf(s),
      names.findIndex((n) => n.startsWith(s)),
      names.findIndex((n) => n.includes(s)),
    ].find((i) => i >= 0) ?? -1;
  if (at >= 0) {
    return items[at];
  }
  const key = soundKey(spoken);
  if (!key) {
    return undefined;
  }
  const whole = items.filter((_, i) => soundKey(names[i]!) === key);
  // One word of a longer name ("Abebe" for "Abebe Kebede") needs two sounds, so a
  // short word can't stand for anyone.
  const words = (n: string) => n.split(/\s+/).map(soundKey);
  const matches =
    whole.length || key.length < 2 ? whole : items.filter((_, i) => words(names[i]!).includes(key));
  return matches.length === 1 ? matches[0] : undefined;
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
