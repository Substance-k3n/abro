'use client';

// Phase 8 slice 8b (docs/WIRING_PLAN.md) -- the data every group screen
// under /groups/[id] reads (GRP-03 detail, GRP-04 expenses, GRP-05
// balances, GRP-08 simplified): you, the group with its members, and
// each person's net position in it. One loader + one not-found/error
// shell, so the four screens can't drift apart on how they load or
// what "not found" means.
//
// Nets come from getGroupBalances (GET /balances/groups/{id}): paid minus owed over the
// group's expenses and settlements, positive = the group owes them
// (the same convention as ~/lib/balances-api.ts's group balances -- no
// sign flip, unlike friend balances). Someone with no expenses in the
// group is absent there, i.e. 0.
//
// `people` covers every membership row, LEFT and INVITED included: a
// balance or an old expense can name someone who has since left.

import { Avatar, EmptyState } from '@abro/ui';
import { ArrowLeft, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';

import { ApiError } from './api-client';
import { type AuthProfile, me } from './auth-api';
import { getGroupBalances } from './balances-api';
import { type AuthGroup, type GroupMember, getGroup } from './groups-api';
import { colorForId, initialsOf } from './identity';
import { photoSrc } from '~/lib/photos';
import { useApiRefresh } from './use-api-refresh';

export interface GroupView {
  profile: AuthProfile;
  group: AuthGroup;
  /** Your own membership row (always ACTIVE -- apps/api refuses the
   * group to anyone else). */
  myMembership: GroupMember;
  activeMembers: GroupMember[];
  nets: Map<string, bigint>;
  people: Map<string, AuthProfile>;
}

async function loadGroupView(id: string): Promise<GroupView> {
  const [profile, group, entries] = await Promise.all([me(), getGroup(id), getGroupBalances(id)]);
  const myMembership = group.members.find((m) => m.userId === profile.id);
  if (!myMembership) {
    throw new ApiError(403, 'NOT_GROUP_MEMBER', 'Not an active member of this group.');
  }
  return {
    profile,
    group,
    myMembership,
    activeMembers: group.members.filter((m) => m.status === 'ACTIVE'),
    nets: new Map(entries.map((e) => [e.userId, BigInt(e.netBalance)])),
    people: new Map(group.members.map((m) => [m.userId, m.user])),
  };
}

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: GroupView };

/** Loads a GroupView and renders the shared loading / not-found / error
 * states; `children` runs only once it's ready. apps/api answers 404 for
 * an unknown or deleted group and 403 when you're not an active member
 * (a malformed id is a 404 too) -- all shown as "Group not found". */
export function GroupViewLoader({
  groupId,
  extra,
  children,
}: {
  groupId: string;
  /** Anything else the page needs, loaded alongside (e.g. expenses). */
  extra?: () => Promise<void>;
  children: (view: GroupView, reload: () => void) => ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = () => {
    // Keep showing what's there while it refreshes (ADR-022).
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    Promise.all([loadGroupView(groupId), extra?.()])
      .then(([data]) => setState({ status: 'ready', data }))
      .catch((err) => {
        if (err instanceof ApiError && [400, 403, 404].includes(err.status)) {
          setState({ status: 'notFound' });
          return;
        }
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Could not load this group.',
        });
      });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [groupId]);
  useApiRefresh(load);

  if (state.status === 'loading') {
    return <LoadingState minHeight="60vh" />;
  }
  if (state.status === 'error') {
    return <ErrorState message={state.message} onRetry={load} minHeight="60vh" />;
  }
  if (state.status === 'notFound') {
    return (
      <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
        <button
          onClick={() => router.push('/groups')}
          className="mb-4 flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Groups
        </button>
        <EmptyState
          icon={<Users size={26} strokeWidth={1.5} />}
          title="Group not found"
          description="This group doesn't exist, you're not a member, or the link may be out of date."
        />
      </div>
    );
  }
  return <>{children(state.data, load)}</>;
}

/** "You" for yourself, else the person's name (first name only when
 * `short`). */
export function nameIn(view: GroupView, userId: string, short = false): string {
  if (userId === view.profile.id) {
    return 'You';
  }
  const name = view.people.get(userId)?.displayName ?? 'Former member';
  return short ? name.split(' ')[0]! : name;
}

/** Avatar for anyone in the group (same initials/color as everywhere
 * else, via ~/lib/identity.ts). */
export function PersonAvatar({
  view,
  userId,
  size,
}: {
  view: GroupView;
  userId: string;
  size: number;
}) {
  const person = view.people.get(userId);
  return (
    <Avatar
      initials={initialsOf(person?.displayName ?? '?')}
      color={colorForId(userId)}
      size={size}
      src={photoSrc(person?.avatarUrl)}
    />
  );
}
