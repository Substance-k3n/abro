// Mock data for Phase 3 (dashboard screens), ported from the Figma Make
// prototype's App.tsx per docs/WIRING_PLAN.md. Values are identical to the
// prototype's (same names, same displayed amounts) but typed as
// `MinorUnits` (integer minor units, per @abro/types) instead of the
// prototype's plain `number` -- the prototype's whole-ETB figures (e.g.
// 1450) become 145000n (ETB has 2 decimal digits). Phase 8 replaces this
// module with real `apps/api` calls, screen by screen.

import type { MinorUnits } from '@abro/types';

/** Converts a whole-ETB amount (as the prototype's mock data used) to
 * minor units. Test/mock-data-only -- real amounts come from the API
 * already in minor units. */
const etb = (amount: number): MinorUnits => BigInt(Math.round(amount * 100));

/** Expense categories, ported from the prototype's `CATEGORIES` constant
 * (App.tsx:234) for Phase 4 (EXP-01's category selector). The frontend
 * spec's category list also includes "Restaurant"; the prototype (what's
 * actually wired) doesn't distinguish it from "Food", so it's treated as
 * covered by "Food" here too -- documented, not a bug. */
export const CATEGORIES = [
  { label: 'Food', icon: '🍽️' },
  { label: 'Coffee', icon: '☕' },
  { label: 'Transport', icon: '🚗' },
  { label: 'Groceries', icon: '🛒' },
  { label: 'Rent', icon: '🏠' },
  { label: 'Utilities', icon: '⚡' },
  { label: 'Entertainment', icon: '🎬' },
  { label: 'Shopping', icon: '🛍️' },
  { label: 'Travel', icon: '✈️' },
  { label: 'Other', icon: '📦' },
] as const;

/** The logged-in user's mock identity -- reused wherever "you" needs an
 * avatar/name (Home's greeting header, and Phase 4's add-expense wizard
 * payer/participant selection). Noted, not fixed: this happens to share
 * a name with FRIENDS id '3' ("Nesredin Haile") -- a pre-existing mock-
 * data coincidence from Phase 3, not introduced here. UI copy always
 * says "You" rather than the name to avoid confusion with that friend. */
export const CURRENT_USER = { name: 'Nesredin', initials: 'NH', color: '#f59e0b' };

export interface Friend {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** They owe you. */
  owes: MinorUnits;
  /** You owe them. */
  iOwe: MinorUnits;
}

export const FRIENDS: Friend[] = [
  {
    id: '1',
    name: 'Abel Tesfaye',
    initials: 'AT',
    color: '#6366f1',
    owes: etb(1450),
    iOwe: etb(0),
  },
  { id: '2', name: 'Hana Girma', initials: 'HG', color: '#ec4899', owes: etb(0), iOwe: etb(780) },
  {
    id: '3',
    name: 'Nesredin Haile',
    initials: 'NH',
    color: 'var(--c-amber)',
    owes: etb(320),
    iOwe: etb(0),
  },
  {
    id: '4',
    name: 'Meron Bekele',
    initials: 'MB',
    color: '#14b8a6',
    owes: etb(0),
    iOwe: etb(2100),
  },
  { id: '5', name: 'Dawit Alemu', initials: 'DA', color: '#8b5cf6', owes: etb(950), iOwe: etb(0) },
];

export interface Group {
  id: string;
  name: string;
  type: string;
  members: number;
  /** Positive: the group owes you. Negative: you owe the group. Zero: settled. */
  balance: MinorUnits;
  icon: string;
  color: string;
  lastActivity: string;
  /** Phase 4 addition: which FRIENDS this group's non-"you" members are.
   * `members` (the count) predates this and already includes "you", so
   * `memberIds.length === members - 1` always holds. Used by the
   * add-expense wizard to pre-select a group expense's participants. */
  memberIds: string[];
}

export const GROUPS: Group[] = [
  {
    id: 'g1',
    name: 'Friday Friends',
    type: 'Friends',
    members: 5,
    balance: etb(1750),
    icon: '👫',
    color: '#6366f1',
    lastActivity: '2h ago',
    memberIds: ['1', '2', '3', '5'],
  },
  {
    id: 'g2',
    name: 'Trip to Hawassa',
    type: 'Trip',
    members: 4,
    balance: etb(-3200),
    icon: '✈️',
    color: 'var(--c-amber)',
    lastActivity: 'Yesterday',
    memberIds: ['1', '2', '5'],
  },
  {
    id: 'g3',
    name: 'Apartment 12B',
    type: 'Household',
    members: 3,
    balance: etb(0),
    icon: '🏠',
    color: '#14b8a6',
    lastActivity: '3 days ago',
    memberIds: ['2', '3'],
  },
];

export interface Activity {
  id: string;
  type: 'expense' | 'settlement';
  title: string;
  sub: string;
  amount: MinorUnits;
  dir: 'owe' | 'receive' | 'paid';
  time: string;
  category: string;
}

export const ACTIVITIES: Activity[] = [
  {
    id: 'a1',
    type: 'expense',
    title: 'Lunch at Kategna',
    sub: 'Friday Friends • Equal split',
    amount: etb(900),
    dir: 'owe',
    time: '2h ago',
    category: 'Food',
  },
  {
    id: 'a2',
    type: 'settlement',
    title: 'Abel settled up',
    sub: 'Paid you directly',
    amount: etb(500),
    dir: 'receive',
    time: 'Yesterday',
    category: 'Settlement',
  },
  {
    id: 'a3',
    type: 'expense',
    title: 'Uber to Bole',
    sub: 'You & Hana Girma',
    amount: etb(180),
    dir: 'paid',
    time: 'Yesterday',
    category: 'Transport',
  },
  {
    id: 'a4',
    type: 'expense',
    title: 'Coffee at Tomoca',
    sub: 'Friday Friends • Equal split',
    amount: etb(360),
    dir: 'owe',
    time: 'Mon',
    category: 'Coffee',
  },
  {
    id: 'a5',
    type: 'expense',
    title: 'Groceries — Shoa',
    sub: 'Apartment 12B',
    amount: etb(1200),
    dir: 'paid',
    time: 'Sun',
    category: 'Groceries',
  },
  {
    id: 'a6',
    type: 'settlement',
    title: 'You settled with Meron',
    sub: 'Bank transfer',
    amount: etb(2100),
    dir: 'paid',
    time: 'Sat',
    category: 'Settlement',
  },
];

export interface SearchPerson {
  id: string;
  name: string;
  initials: string;
  color: string;
  username: string;
}

export const SEARCH_RESULTS: SearchPerson[] = [
  { id: 'sr1', name: 'Kidus Alemu', initials: 'KA', color: '#8b5cf6', username: '@kidus.a' },
  { id: 'sr2', name: 'Tigist Hailu', initials: 'TH', color: '#ec4899', username: '@tigist_h' },
  {
    id: 'sr3',
    name: 'Biruk Getachew',
    initials: 'BG',
    color: 'var(--c-amber)',
    username: '@biruk_g',
  },
  { id: 'sr4', name: 'Rahel Mengesha', initials: 'RM', color: '#14b8a6', username: '@rahel.m' },
];

export interface NotificationMock {
  id: string;
  /** lucide-react icon name, resolved to a component where rendered. */
  icon: 'Wallet' | 'Utensils' | 'UserPlus' | 'Receipt';
  title: string;
  body: string;
  time: string;
  read: boolean;
}

// Ported from NotificationsScreen's local hardcoded array (App.tsx:3955) --
// not derived from ACTIVITIES in the prototype either, a separate mock set.
export const NOTIFICATIONS: NotificationMock[] = [
  {
    id: 'n1',
    icon: 'Wallet',
    title: 'Abel settled up',
    body: 'Abel paid you 500 ETB',
    time: '2h ago',
    read: false,
  },
  {
    id: 'n2',
    icon: 'Utensils',
    title: 'New expense added',
    body: "Hana added 'Dinner at Lucy' — your share: 300 ETB",
    time: 'Yesterday',
    read: false,
  },
  {
    id: 'n3',
    icon: 'UserPlus',
    title: 'New member joined',
    body: 'Dawit Alemu joined Friday Friends',
    time: '2 days ago',
    read: true,
  },
  {
    id: 'n4',
    icon: 'Receipt',
    title: 'Expense updated',
    body: "Meron updated 'Groceries' amount",
    time: '3 days ago',
    read: true,
  },
];
