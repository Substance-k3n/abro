'use client';

// Phase 8 slice 7 (docs/WIRING_PLAN.md) -- the real people and groups
// the add-expense wizard picks from, replacing ~/lib/mock-data's
// CURRENT_USER/FRIENDS/GROUPS/resolveParticipants for every step under
// /expenses/new.
//
// Who can be on an expense is apps/api's rule (expenses.Service's
// prepareWrite), mirrored here so the wizard only ever offers people the
// server will accept:
//  - Personal expense: the payer and every participant must be you or a
//    friend of yours.
//  - Group expense: the payer and every participant must be an ACTIVE
//    member of that group -- friends or not.
// So `candidates` (everyone but you) is the group's active members when
// the draft has a group, and your friends otherwise. Changing the group
// in EXP-01 resets the payer and participants (see that screen), since
// the previous pool's picks may not be valid in the new one.
//
// me/friends/groups load once for the whole wizard (the layout shows a
// loading/error state until they have); a group's members load when
// the draft's group changes.

import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import { type AuthProfile, me } from './auth-api';
import { ME, useExpenseDraft } from './expense-draft';
import { listFriends } from './friends-api';
import { type GroupListItem, getGroup, listGroups } from './groups-api';
import { colorForId, initialsOf } from './identity';
import { photoSrc } from './photos';

export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** Profile photo as an <img src>, or null (ADR-017). */
  photo: string | null;
}

function toPerson(profile: AuthProfile): Person {
  return {
    id: profile.id,
    name: profile.displayName,
    initials: initialsOf(profile.displayName),
    color: colorForId(profile.id),
    photo: photoSrc(profile.avatarUrl),
  };
}

interface BaseData {
  me: AuthProfile;
  friends: Person[];
  groups: GroupListItem[];
}

interface ExpenseDirectoryValue {
  me: AuthProfile;
  groups: GroupListItem[];
  /** The draft's group, or null for a personal expense. */
  group: GroupListItem | null;
  /** Everyone besides you who may pay or take part -- see header. */
  candidates: Person[];
  /** False only while a group's member list is still loading. */
  candidatesReady: boolean;
  /** Display identity for a draft id: ME -> "You", else the matching
   * candidate. Unknown ids (shouldn't happen) fall back to a neutral
   * placeholder rather than throwing mid-render. */
  resolve: (id: string) => Person;
}

const ExpenseDirectoryContext = createContext<ExpenseDirectoryValue | null>(null);

type Loaded<T> =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Must sit inside ExpenseDraftProvider -- reads the draft's groupId.
 * Renders `fallback(state)` instead of children until base data loads. */
export function ExpenseDirectoryProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: (state: { error: string | null; retry: () => void }) => ReactNode;
}) {
  const { draft } = useExpenseDraft();
  const [base, setBase] = useState<Loaded<BaseData>>({ status: 'loading' });
  const [members, setMembers] = useState<{ groupId: string; people: Person[] } | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);

  const loadBase = () => {
    setBase({ status: 'loading' });
    Promise.all([me(), listFriends(), listGroups()])
      .then(([profile, friends, groups]) => {
        setBase({
          status: 'ready',
          data: { me: profile, friends: friends.map((f) => toPerson(f.friend)), groups },
        });
      })
      .catch((err) => {
        setBase({
          status: 'error',
          message: errorMessage(err, 'Could not load your friends and groups. Please try again.'),
        });
      });
  };

  useEffect(loadBase, []);

  const [membersAttempt, setMembersAttempt] = useState(0);

  useEffect(() => {
    const groupId = draft.groupId;
    if (!groupId || base.status !== 'ready') {
      return;
    }
    let cancelled = false;
    setMembersError(null);
    getGroup(groupId)
      .then((group) => {
        if (cancelled) {
          return;
        }
        const people = group.members
          .filter((m) => m.status === 'ACTIVE' && m.userId !== base.data.me.id)
          .map((m) => toPerson(m.user));
        setMembers({ groupId, people });
      })
      .catch((err) => {
        if (!cancelled) {
          setMembersError(errorMessage(err, 'Could not load this group’s members.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft.groupId, base.status, membersAttempt]);

  if (base.status !== 'ready') {
    return fallback({ error: base.status === 'error' ? base.message : null, retry: loadBase });
  }
  if (membersError) {
    return fallback({ error: membersError, retry: () => setMembersAttempt((n) => n + 1) });
  }

  const { data } = base;
  const group = draft.groupId ? (data.groups.find((g) => g.id === draft.groupId) ?? null) : null;
  const candidatesReady = !draft.groupId || members?.groupId === draft.groupId;
  const candidates = draft.groupId ? (candidatesReady ? members!.people : []) : data.friends;

  // Keeps the ME sentinel as its id (not the real profile id): every
  // step keys its per-participant maps (shares, exact amounts,
  // percentages) by the draft's ids, so resolve(id).id must equal id.
  const you: Person = { ...toPerson(data.me), id: ME, name: 'You' };
  const resolve = (id: string): Person => {
    if (id === ME) {
      return you;
    }
    return (
      candidates.find((p) => p.id === id) ?? {
        id,
        name: 'Unknown',
        initials: '?',
        color: '#94a3b8',
        photo: null,
      }
    );
  };

  return (
    <ExpenseDirectoryContext.Provider
      value={{ me: data.me, groups: data.groups, group, candidates, candidatesReady, resolve }}
    >
      {children}
    </ExpenseDirectoryContext.Provider>
  );
}

export function useExpenseDirectory(): ExpenseDirectoryValue {
  const ctx = useContext(ExpenseDirectoryContext);
  if (!ctx) {
    throw new Error('useExpenseDirectory must be used within ExpenseDirectoryProvider');
  }
  return ctx;
}
