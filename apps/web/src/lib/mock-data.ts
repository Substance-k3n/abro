// Mock data for Phase 3 (dashboard screens), ported from the Figma Make
// prototype's App.tsx per docs/WIRING_PLAN.md. Values are identical to the
// prototype's (same names, same displayed amounts) but typed as
// `MinorUnits` (integer minor units, per @abro/types) instead of the
// prototype's plain `number` -- the prototype's whole-ETB figures (e.g.
// 1450) become 145000n (ETB has 2 decimal digits). Phase 8 replaces this
// module with real `apps/api` calls, screen by screen.

import { type MinorUnits, type NetPosition, simplifyDebts } from '@abro/types';

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
 * avatar/name (Home's greeting header, Phase 4's add-expense wizard
 * payer/participant selection, and Phase 7's Profile/Settings screens).
 * Noted, not fixed: this happens to share a name with FRIENDS id '3'
 * ("Nesredin Haile") -- a pre-existing mock-data coincidence from Phase
 * 3, not introduced here. UI copy always says "You" rather than the
 * name to avoid confusion with that friend.
 *
 * Phase 7 (PRF-01) additions -- email/phone/currency/language/
 * memberSince -- are plausible mock values, same footing as every other
 * seeded figure in this file (FRIENDS' balances, GROUPS' names): not
 * fabricated *facts presented as real data*, just the mock identity's
 * profile fields, editable via `updateCurrentUser`. */
export interface CurrentUserProfile {
  name: string;
  initials: string;
  color: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  currency: string;
  language: string;
  memberSince: string;
}

export const CURRENT_USER: CurrentUserProfile = {
  name: 'Nesredin',
  initials: 'NH',
  color: '#f59e0b',
  email: 'nesredin.haile@example.com',
  emailVerified: true,
  phone: null,
  currency: 'ETB',
  language: 'English',
  memberSince: 'Jan 2026',
};

/** Module-level mutation, same pattern as `updateGroup` -- mutates the
 * single `CURRENT_USER` object in place (`Object.assign`, not
 * reassignment) so every existing importer's reference stays valid. */
export function updateCurrentUser(patch: Partial<CurrentUserProfile>): void {
  Object.assign(CURRENT_USER, patch);
}

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

export interface ParticipantIdentity {
  id: string;
  name: string;
  initials: string;
  color: string;
}

/** Resolves a wizard participant id (the `ME` sentinel from
 * ~/lib/expense-draft.tsx, or a FRIENDS id) to a display identity.
 * Every add-expense split screen (EXP-04..EXP-08) needs this -- "you"
 * can be a participant just like any friend, and needs the same
 * avatar/name treatment in a shares list. Takes the id directly rather
 * than importing `ME` from expense-draft.tsx to avoid mock-data.ts
 * depending on wizard-specific state; callers compare against their own
 * `ME` import. */
export function resolveParticipants(ids: readonly string[]): ParticipantIdentity[] {
  return ids.map((id) => {
    const friend = FRIENDS.find((f) => f.id === id);
    if (friend) {
      return friend;
    }
    return { id, name: 'You', initials: CURRENT_USER.initials, color: CURRENT_USER.color };
  });
}

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
  /** Phase 5 addition, display-ready like ExpenseRecord.createdAt --
   * GRP-03's Group Info Card wants a "Created date". */
  createdAt: string;
  /** GRP-01 already collected this; createGroup() previously dropped
   * it. GRP-07 (Settings) is the first screen to actually show/edit
   * it, with the spec's own "not editable if expenses exist" rule. */
  currency: string;
  /** GRP-07's "Simplify debts" toggle -- gates whether GRP-05's
   * Simplified view is offered for this group at all. */
  simplifyDebts: boolean;
  /** GRP-07's "Default split method" -- stored as a preference only;
   * not yet read by the add-expense wizard (EXP-04 always defaults to
   * 'equal' regardless). Wiring that through is a small follow-up, not
   * a structural change, once there's a reason to prioritize it. */
  defaultSplitMethod: 'equal' | 'exact' | 'percentage' | 'shares';
  /** GRP-01 already collected this too; same drop-on-create gap as
   * currency, fixed alongside it. */
  description: string;
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
    createdAt: 'Aug 3, 2026',
    currency: 'ETB',
    simplifyDebts: true,
    defaultSplitMethod: 'equal',
    description: 'Weekly hangouts and shared meals.',
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
    createdAt: 'Sep 10, 2026',
    currency: 'ETB',
    simplifyDebts: true,
    defaultSplitMethod: 'equal',
    description: '',
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
    createdAt: 'Jun 1, 2026',
    currency: 'ETB',
    simplifyDebts: false,
    defaultSplitMethod: 'equal',
    description: 'Shared household expenses for Apartment 12B.',
  },
];

/** Ported from the prototype's GROUP_TYPES constant (App.tsx:5141),
 * plus "Other" (spec's GRP-01 lists 6 types; the prototype only has 5).
 * `icon` values match packages/ui/src/icons.tsx's GROUP_ICONS map keys,
 * so a newly created group's icon renders via the same GroupIcon
 * component every existing group already uses. */
export const GROUP_TYPES: { id: string; label: string; icon: string; color: string }[] = [
  { id: 'Friends', label: 'Friends', icon: '👫', color: '#6366f1' },
  { id: 'Trip', label: 'Trip', icon: '✈️', color: 'var(--c-amber)' },
  { id: 'Household', label: 'Household', icon: '🏠', color: '#14b8a6' },
  { id: 'Family', label: 'Family', icon: '👨‍👩‍👧', color: '#ec4899' },
  { id: 'Team', label: 'Team', icon: '💼', color: '#8b5cf6' },
  { id: 'Other', label: 'Other', icon: '💸', color: '#64748b' },
];

/** Creates a new group and appends it to the shared GROUPS array in
 * place -- same module-level-mutation pattern as updateExpense
 * (~/lib/mock-data.ts), not a real backend. `memberIds` should not
 * include 'me' (implicit in every group, per Group.memberIds' own
 * doc comment). New groups start with a zero balance and no last
 * activity, since there's nothing to owe yet with zero expenses --
 * also seeds GROUP_BALANCES with an all-zero row so every screen that
 * reads it (GRP-03/05/06/08) doesn't need a "might be missing" guard
 * for a freshly created group. References GROUP_BALANCES (defined
 * below, in module source order) safely -- by the time this function
 * is actually called from a click handler, module evaluation has long
 * finished top to bottom. */
export function createGroup(input: {
  name: string;
  type: string;
  memberIds: string[];
  currency?: string;
  description?: string;
}): Group {
  const groupType = GROUP_TYPES.find((t) => t.id === input.type) ?? GROUP_TYPES[0]!;
  const group: Group = {
    id: `g${GROUPS.length + 1}`,
    name: input.name,
    type: input.type,
    members: input.memberIds.length + 1,
    balance: 0n,
    icon: groupType.icon,
    color: groupType.color,
    lastActivity: 'Just now',
    memberIds: input.memberIds,
    createdAt: 'Just now',
    currency: input.currency ?? 'ETB',
    simplifyDebts: true,
    defaultSplitMethod: 'equal',
    description: input.description ?? '',
  };
  GROUPS.push(group);
  GROUP_BALANCES[group.id] = Object.fromEntries(['me', ...input.memberIds].map((id) => [id, 0n]));
  return group;
}

/** Mutates a group in place -- same module-level pattern as
 * updateExpense/createGroup. Used by GRP-07 (Settings) for basic-info
 * and financial-settings edits. */
export function updateGroup(id: string, patch: Partial<Group>): void {
  const index = GROUPS.findIndex((g) => g.id === id);
  if (index !== -1) {
    GROUPS[index] = { ...GROUPS[index]!, ...patch };
  }
}

/** Adds an existing friend to a group -- GRP-06's "Add Member". Updates
 * `members`/`memberIds` and seeds a zero balance for them in
 * GROUP_BALANCES (they've shared no expenses with the group yet, so
 * they can't owe or be owed anything on joining). No-op if they're
 * already a member. */
export function addGroupMember(groupId: string, friendId: string): void {
  const group = GROUPS.find((g) => g.id === groupId);
  if (!group || group.memberIds.includes(friendId)) {
    return;
  }
  group.memberIds.push(friendId);
  group.members += 1;
  const balances = GROUP_BALANCES[groupId];
  if (balances) {
    balances[friendId] = 0n;
  }
}

/**
 * Phase 5 addition: every member's net position within a group (positive
 * = owed, negative = owes, matching debt-simplification.ts's NetPosition
 * convention), keyed by group id then participant id ('me' or a FRIENDS
 * id). Each group's values sum to exactly zero, same ledger-conservation
 * invariant real balances must hold -- money owed within a closed group
 * always nets out, it doesn't appear or vanish. 'me''s entry always
 * matches that group's Group.balance, for consistency with every other
 * screen that already shows "your balance in this group".
 *
 * g3 (Apartment 12B) is deliberately all-zero -- the one worked example
 * of GRP-05's "All settled up!" empty state.
 */
export const GROUP_BALANCES: Record<string, Record<string, MinorUnits>> = {
  g1: { me: etb(1750), '1': etb(-700), '2': etb(-300), '3': etb(-350), '5': etb(-400) },
  g2: { me: etb(-3200), '1': etb(1500), '2': etb(1000), '5': etb(700) },
  g3: { me: etb(0), '2': etb(0), '3': etb(0) },
};

/** Payment methods for STL-03's optional "Payment method" field -- same
 * static-reference-data pattern as CATEGORIES, not wizard state (kept
 * out of settle-draft.tsx for the same reason resolveParticipants keeps
 * mock-data.ts free of wizard-specific imports). */
export const SETTLEMENT_METHODS = ['Cash', 'Bank transfer', 'Mobile Money', 'Other'] as const;

/**
 * Phase 6 (Settlement) -- ABRO_PRD.md §19, and mirroring
 * apps/api/internal/settlements/service.go's real, already-implemented
 * rule (ADR-003): a settlement can only be recorded by the person who
 * owes -- `Service.Create` requires `GetPairwiseBalance(actor, toUser)`
 * to be positive (actor owes toUser), and errors NO_OUTSTANDING_DEBT
 * otherwise. There is no "record that someone paid me" path -- only the
 * debtor's own session can create that row. This app only ever acts as
 * the current user ('me'), so `fromUserId` is always 'me' for anything
 * created via `createSettlement` below; seed rows below include the
 * reverse direction (someone else settling with 'me') as pre-existing
 * history, which is legitimate -- it's just not something *this*
 * session's UI can produce, same as how ACTIVITIES already carries a
 * couple of `dir: 'receive'` settlement rows.
 */
export interface SettlementRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: MinorUnits;
  /** null = personal (no group) settlement. */
  groupId: string | null;
  method: string;
  note: string;
  /** Display-ready, matching ExpenseRecord.date's convention. */
  date: string;
}

/** Seeded from ACTIVITIES' existing settlement rows (a2, a6) rather than
 * invented figures -- same amounts, same people, same direction. */
export const SETTLEMENTS: SettlementRecord[] = [
  {
    id: 's1',
    fromUserId: '1',
    toUserId: 'me',
    amount: etb(500),
    groupId: null,
    method: 'Cash',
    note: '',
    date: 'Yesterday',
  },
  {
    id: 's2',
    fromUserId: 'me',
    toUserId: '4',
    amount: etb(2100),
    groupId: null,
    method: 'Bank transfer',
    note: '',
    date: 'Sat',
  },
];

/** Every group-scoped debt the current user owes, as the exact
 * minimum-transaction payments `simplifyDebts()` (the same tested
 * function GRP-05/GRP-08 already call) computes for that group --
 * filtered to the payments where 'me' is the payer. STL-01's Groups
 * section and its per-group drill-down both read this. */
export function getMyGroupDebts(groupId: string): { toUserId: string; amount: MinorUnits }[] {
  const balances = GROUP_BALANCES[groupId] ?? {};
  const positions: NetPosition[] = Object.entries(balances).map(([userId, netBalance]) => ({
    userId,
    netBalance,
  }));
  return simplifyDebts(positions)
    .filter((tx) => tx.fromUserId === 'me')
    .map((tx) => ({ toUserId: tx.toUserId, amount: tx.amount }));
}

/** The outstanding amount the current user owes `toUserId`, personal or
 * group-scoped -- what STL-02's "Current Balance Display" and its
 * validation ("cannot exceed outstanding balance") are computed
 * against. Personal: FRIENDS.iOwe directly. Group-scoped: this specific
 * pairwise amount from `getMyGroupDebts`, since a flat per-member net
 * position (GROUP_BALANCES) isn't itself a pairwise "I owe exactly this
 * person this much" figure -- the simplified payment plan is. */
export function getOutstanding(toUserId: string, groupId: string | null): MinorUnits {
  if (groupId) {
    return getMyGroupDebts(groupId).find((d) => d.toUserId === toUserId)?.amount ?? 0n;
  }
  return FRIENDS.find((f) => f.id === toUserId)?.iOwe ?? 0n;
}

/**
 * Records a settlement -- module-level mutation, same pattern as
 * createGroup/updateExpense. Applies the ledger effect described in
 * ABRO_PRD.md §19 (full or partial: the paid amount moves off both
 * sides' outstanding balance, preserving whatever remains unpaid) to
 * whichever balance model backs this settlement, appends the record to
 * SETTLEMENTS (STL-05 history) and a matching row to ACTIVITIES (so it
 * shows up immediately in Home/Activity, same as every other mutation
 * in this app).
 */
export function createSettlement(input: {
  toUserId: string;
  groupId: string | null;
  amount: MinorUnits;
  method: string;
  note: string;
}): SettlementRecord {
  const record: SettlementRecord = {
    id: `s${SETTLEMENTS.length + 1}`,
    fromUserId: 'me',
    toUserId: input.toUserId,
    amount: input.amount,
    groupId: input.groupId,
    method: input.method,
    note: input.note,
    date: 'Just now',
  };
  SETTLEMENTS.push(record);

  if (input.groupId) {
    const balances = GROUP_BALANCES[input.groupId];
    if (balances) {
      balances['me'] = (balances['me'] ?? 0n) + input.amount;
      balances[input.toUserId] = (balances[input.toUserId] ?? 0n) - input.amount;
    }
    const group = GROUPS.find((g) => g.id === input.groupId);
    if (group) {
      group.balance += input.amount;
    }
  } else {
    const friend = FRIENDS.find((f) => f.id === input.toUserId);
    if (friend) {
      friend.iOwe -= input.amount;
    }
  }

  const friendName = resolveParticipants([input.toUserId])[0]?.name ?? 'them';
  ACTIVITIES.unshift({
    id: record.id,
    type: 'settlement',
    title: `You settled with ${friendName}`,
    sub: input.method,
    amount: input.amount,
    dir: 'paid',
    time: 'Just now',
    category: 'Settlement',
  });

  return record;
}

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

export interface ExpenseRecord {
  id: string;
  name: string;
  category: string;
  amount: MinorUnits;
  /** Display-ready, matching ACTIVITIES' convention -- not parsed as a
   * real date anywhere in this phase. */
  date: string;
  groupId: string | null;
  /** The literal string 'me' (matching ~/lib/expense-draft.ts's `ME`
   * sentinel, not imported here for the same reason resolveParticipants
   * doesn't -- see that function's comment) or a FRIENDS id. */
  payerId: string;
  participantIds: string[];
  splitMethod: 'equal' | 'exact' | 'percentage' | 'shares';
  /** Final per-participant amount, in minor units. */
  shares: Record<string, MinorUnits>;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

/**
 * Full expense records for EXP-09 (detail view) and EXP-10 (edit) --
 * Phase 4. Shares the same `id`s as ACTIVITIES' `type: 'expense'` rows
 * (a1, a3, a4, a5) so an activity/recent-activity row can link straight
 * to its detail page. Not derived from ACTIVITIES programmatically --
 * ACTIVITIES.dir (the signed direction shown in feeds) and this
 * record's actual payer/participants/shares aren't guaranteed to agree
 * perfectly (e.g. a3's `dir: 'paid'` reads as neutral, but its real
 * payer/participant split below nets to "Hana owes you half"). That's
 * fine for this mock-data phase -- Phase 8 replaces both arrays with
 * one real Expense model from apps/api, where activity feed rows are
 * derived FROM expenses rather than maintained in parallel.
 */
export const EXPENSES: ExpenseRecord[] = [
  {
    id: 'a1',
    name: 'Lunch at Kategna',
    category: 'Food',
    amount: etb(900),
    date: 'Sep 22, 2026',
    groupId: 'g1',
    payerId: '1',
    participantIds: ['me', '1', '2', '3', '5'],
    splitMethod: 'equal',
    shares: { me: etb(180), '1': etb(180), '2': etb(180), '3': etb(180), '5': etb(180) },
    note: '',
    createdBy: '1',
    createdAt: '2h ago',
  },
  {
    id: 'a3',
    name: 'Uber to Bole',
    category: 'Transport',
    amount: etb(180),
    date: 'Sep 21, 2026',
    groupId: null,
    payerId: 'me',
    participantIds: ['me', '2'],
    splitMethod: 'equal',
    shares: { me: etb(90), '2': etb(90) },
    note: '',
    createdBy: 'me',
    createdAt: 'Yesterday',
  },
  {
    id: 'a4',
    name: 'Coffee at Tomoca',
    category: 'Coffee',
    amount: etb(360),
    date: 'Sep 19, 2026',
    groupId: 'g1',
    payerId: '2',
    participantIds: ['me', '1', '2', '3', '5'],
    splitMethod: 'equal',
    shares: { me: etb(72), '1': etb(72), '2': etb(72), '3': etb(72), '5': etb(72) },
    note: '',
    createdBy: '2',
    createdAt: 'Mon',
  },
  {
    id: 'a5',
    name: 'Groceries — Shoa',
    category: 'Groceries',
    amount: etb(1200),
    date: 'Sep 18, 2026',
    groupId: 'g3',
    payerId: 'me',
    participantIds: ['me', '2', '3'],
    splitMethod: 'equal',
    shares: { me: etb(400), '2': etb(400), '3': etb(400) },
    note: '',
    createdBy: 'me',
    createdAt: 'Sun',
  },
];

/** Mutates the shared EXPENSES array in place -- module-level state, not
 * a real backend, but it does mean an edit survives navigating away
 * from and back to a detail page within the same session, which reads
 * better than an edit that silently reverts. Phase 8 replaces this with
 * a real PUT /expenses/:id call. */
export function updateExpense(id: string, patch: Partial<ExpenseRecord>): void {
  const index = EXPENSES.findIndex((e) => e.id === id);
  if (index !== -1) {
    EXPENSES[index] = { ...EXPENSES[index]!, ...patch };
  }
}

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

/**
 * Phase 7 (PRF-01) -- Profile Statistics, computed from real mock data
 * rather than stored/invented figures ("Expenses are facts, balances
 * (and here, stats) are derived projections" -- the same rule this
 * project applies to money, extended to these counts). "Total amount
 * managed" is defined as the sum of every EXPENSES row's amount (the
 * total value of expenses this user has been party to, not a made-up
 * "lifetime volume" figure) -- a documented interpretation, since the
 * spec doesn't define the term precisely.
 */
export function getCurrentUserStats() {
  return {
    totalExpenses: EXPENSES.length,
    totalAmountManaged: EXPENSES.reduce((sum, e) => sum + e.amount, 0n),
    groupsJoined: GROUPS.length,
    friendsCount: FRIENDS.length,
  };
}

/**
 * Phase 7 (SET-02) -- Notification preferences. Simplified from the
 * spec's full "per type per channel" matrix (7 types x push/email) to
 * one toggle per type applying to both channels, plus the two channel
 * master toggles -- same class of simplification as GRP-07's
 * notification toggles, and for the same reason: this app has no real
 * notification-generation system for these settings to actually gate
 * (NOTIFICATIONS above is a static seed list, not produced by any
 * event this toggle set could suppress), so a finer-grained UI would
 * imply more real effect than exists. "Payment due" (spec's own list)
 * is dropped -- the spec marks it "(future)" itself, and there's no
 * recurring-payment-due concept implemented anywhere in this app yet.
 * Quiet hours are UI-only for the same reason -- no scheduler reads them.
 */
export interface NotificationPrefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  types: {
    expenseAdded: boolean;
    expenseUpdated: boolean;
    settlementReceived: boolean;
    groupInvitation: boolean;
    memberJoined: boolean;
    balanceReminder: boolean;
  };
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export const NOTIFICATION_PREFS: NotificationPrefs = {
  pushEnabled: true,
  emailEnabled: true,
  types: {
    expenseAdded: true,
    expenseUpdated: true,
    settlementReceived: true,
    groupInvitation: true,
    memberJoined: false,
    balanceReminder: true,
  },
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

export function updateNotificationPrefs(patch: Partial<NotificationPrefs>): void {
  Object.assign(NOTIFICATION_PREFS, patch);
}

/**
 * Phase 7 (SET-03) -- Privacy & Security settings. "Active Sessions"
 * (spec's §5) is deliberately not modeled here: this app has no real
 * session/device tracking, and inventing a plausible-looking device
 * list (browser names, locations, "last active" times) would be
 * exactly the fabricated data this project's workflow avoids -- the
 * settings page instead states honestly that only this session exists.
 * Two-factor auth is a local toggle only (no real TOTP/SMS flow to back
 * it), same "harmless UI-only toggle" class as GRP-07's notification
 * toggles -- flipping it doesn't grant or revoke anything real.
 */
export interface PrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private';
  whoCanAddYou: 'anyone' | 'friendsOfFriends' | 'nobody';
  whoCanSeeExpenses: 'friends' | 'nobody';
  twoFactorEnabled: boolean;
}

export const PRIVACY_SETTINGS: PrivacySettings = {
  profileVisibility: 'friends',
  whoCanAddYou: 'friendsOfFriends',
  whoCanSeeExpenses: 'friends',
  twoFactorEnabled: false,
};

export function updatePrivacySettings(patch: Partial<PrivacySettings>): void {
  Object.assign(PRIVACY_SETTINGS, patch);
}
