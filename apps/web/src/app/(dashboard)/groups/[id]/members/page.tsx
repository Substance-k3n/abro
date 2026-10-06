'use client';

// GRP-06 Group Members -- docs/ABRO_FRONTEND_SPEC.md §5 (lines 1362-
// 1405). Members with role badges and their balance in the group, an
// inline Add Member panel, and per-member actions. Phase 8 slice 8d:
// real group via ~/lib/group-view.tsx; actions call apps/api
// (~/lib/groups-api.ts), then reload.
//
// Deviations / rules:
//  - Add Member and the per-member menu are admin-only, as apps/api
//    enforces (NOT_GROUP_ADMIN); members see the list only.
//  - Add Member *invites* a friend (apps/api only adds friends, as
//    INVITED); they join from their Groups page. Pending invites show
//    below the members with "Invited", and an admin can cancel one.
//  - Email/phone invites are dropped (apps/api invites friends only).
//  - Remove asks for confirmation inline (no modal library). apps/api
//    refuses while that member's balance in the group isn't 0
//    (OUTSTANDING_BALANCE, ADR-009) or for the last admin
//    (LAST_ADMIN); its message shows above the list.
//  - Leaving yourself is on GRP-07's Danger Zone, not here.

import { ETB, abs, formatMoney } from '@abro/types';
import { PersonRow } from '@abro/ui';
import { ArrowLeft, MoreHorizontal, Search, Shield, UserMinus, UserPlus } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError } from '~/lib/api-client';
import { type FriendListItem, listFriends } from '~/lib/friends-api';
import { type GroupView, GroupViewLoader, PersonAvatar, nameIn } from '~/lib/group-view';
import {
  type GroupMember,
  addGroupMember,
  removeGroupMember,
  setGroupMemberRole,
} from '~/lib/groups-api';
import { colorForId, initialsOf } from '~/lib/identity';

export default function GroupMembersPage() {
  const params = useParams<{ id: string }>();
  const [friends, setFriends] = useState<FriendListItem[]>([]);

  return (
    <GroupViewLoader groupId={params.id} extra={() => listFriends().then(setFriends)}>
      {(view, reload) => <GroupMembers view={view} friends={friends} reload={reload} />}
    </GroupViewLoader>
  );
}

function GroupMembers({
  view,
  friends,
  reload,
}: {
  view: GroupView;
  friends: FriendListItem[];
  reload: () => void;
}) {
  const router = useRouter();
  const { group, profile, myMembership, activeMembers, nets } = view;
  const isAdmin = myMembership.role === 'ADMIN';
  const invited = group.members.filter((m) => m.status === 'INVITED');

  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<GroupMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const inGroup = new Set(group.members.filter((m) => m.status !== 'LEFT').map((m) => m.userId));
  const query = search.trim().toLowerCase();
  const candidates = friends
    .map((f) => f.friend)
    .filter((f) => !inGroup.has(f.id) && (!query || f.displayName.toLowerCase().includes(query)));

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setActionError(null);
    setMenuFor(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
      setBusy(false);
    }
    setConfirmRemove(null);
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push(`/groups/${group.id}`)}
          className="flex min-w-0 items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{group.name}</span>
        </button>
        <h2
          className="font-display shrink-0 px-2 text-[1.05rem] font-bold"
          style={{ color: 'var(--t-primary)' }}
        >
          Members
        </h2>
        {isAdmin ? (
          <button
            onClick={() => setAdding((v) => !v)}
            aria-label="Add member"
            className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ color: 'var(--accent)' }}
          >
            <UserPlus size={17} strokeWidth={2} />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {adding && isAdmin && (
        <div className="neo-raised-sm mb-4 flex flex-col gap-2.5 rounded-2xl p-3.5">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--t-dim)' }}
            />
            <input
              className="neo-input"
              placeholder="Search friends to invite…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
          {candidates.length === 0 ? (
            <p className="px-1 py-2 text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
              {query ? 'No friends match.' : 'All your friends are already in or invited.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {candidates.map((f) => (
                <PersonRow
                  key={f.id}
                  initials={initialsOf(f.displayName)}
                  color={colorForId(f.id)}
                  name={f.displayName}
                  right={
                    <span
                      className="text-[0.75rem] font-semibold"
                      style={{ color: 'var(--accent)' }}
                    >
                      Invite
                    </span>
                  }
                  onClick={() =>
                    !busy && run(() => addGroupMember(group.id, f.id), 'Could not send the invite.')
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {actionError}
        </p>
      )}

      {confirmRemove && (
        <div className="neo-raised-sm mb-4 flex flex-col gap-3 rounded-[18px] p-4">
          <p className="text-[0.85rem]" style={{ color: 'var(--t-primary)' }}>
            {confirmRemove.status === 'INVITED' ? 'Cancel the invite for' : 'Remove'}{' '}
            <strong>{nameIn(view, confirmRemove.userId)}</strong>
            {confirmRemove.status === 'INVITED' ? '?' : ' from this group?'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmRemove(null)}
              disabled={busy}
              className="neo-btn flex-1 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold"
              style={{ color: 'var(--t-secondary)' }}
            >
              Keep
            </button>
            <button
              onClick={() =>
                run(
                  () => removeGroupMember(group.id, confirmRemove.userId),
                  'Could not remove this member.',
                )
              }
              disabled={busy}
              className="flex-1 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--c-red)' }}
            >
              {busy ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {activeMembers.map((m) => {
          const bal = nets.get(m.userId) ?? 0n;
          const isYou = m.userId === profile.id;
          return (
            <div
              key={m.id}
              className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
            >
              <PersonAvatar view={view} userId={m.userId} size={42} />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <p
                    className="truncate text-[0.88rem] font-semibold"
                    style={{ color: 'var(--t-primary)' }}
                  >
                    {nameIn(view, m.userId)}
                  </p>
                  <RoleBadge admin={m.role === 'ADMIN'} />
                </div>
                <p
                  className="font-mono text-[0.75rem] font-semibold"
                  style={{
                    color: bal > 0n ? 'var(--c-green)' : bal < 0n ? 'var(--c-red)' : 'var(--t-dim)',
                  }}
                >
                  {bal === 0n ? 'Settled' : `${bal > 0n ? '+' : '-'}${formatMoney(abs(bal), ETB)}`}
                </p>
              </div>
              {isAdmin && !isYou && (
                <div className="relative">
                  <button
                    onClick={() => setMenuFor((v) => (v === m.userId ? null : m.userId))}
                    aria-label={`Actions for ${nameIn(view, m.userId)}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ color: 'var(--t-dim)' }}
                  >
                    <MoreHorizontal size={16} strokeWidth={2} />
                  </button>
                  {menuFor === m.userId && (
                    <div className="neo-raised-sm absolute right-0 top-9 z-10 flex w-48 flex-col gap-1 rounded-2xl p-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              setGroupMemberRole(
                                group.id,
                                m.userId,
                                m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN',
                              ),
                            'Could not change the role.',
                          )
                        }
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-[0.8rem] font-medium"
                        style={{ color: 'var(--t-secondary)' }}
                      >
                        <Shield size={14} strokeWidth={2} />
                        {m.role === 'ADMIN' ? 'Remove admin' : 'Make admin'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setMenuFor(null);
                          setActionError(null);
                          setConfirmRemove(m);
                        }}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-[0.8rem] font-medium"
                        style={{ color: 'var(--c-red)' }}
                      >
                        <UserMinus size={14} strokeWidth={2} /> Remove from group
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {invited.length > 0 && (
        <div className="mt-6">
          <p
            className="mb-2 pl-1 text-[0.72rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Invited · {invited.length}
          </p>
          <div className="flex flex-col gap-2">
            {invited.map((m) => (
              <div
                key={m.id}
                className="neo-flat flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
              >
                <PersonAvatar view={view} userId={m.userId} size={36} />
                <p
                  className="flex-1 truncate text-[0.85rem] font-medium"
                  style={{ color: 'var(--t-secondary)' }}
                >
                  {nameIn(view, m.userId)}
                </p>
                {isAdmin ? (
                  <button
                    onClick={() => {
                      setActionError(null);
                      setConfirmRemove(m);
                    }}
                    disabled={busy}
                    className="text-[0.75rem] font-semibold"
                    style={{ color: 'var(--c-red)' }}
                  >
                    Cancel invite
                  </button>
                ) : (
                  <span className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                    Invited
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ admin }: { admin: boolean }) {
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[0.64rem] font-semibold"
      style={{
        color: admin ? 'var(--accent)' : 'var(--t-dim)',
        background: admin ? 'var(--accent-light)' : 'transparent',
      }}
    >
      {admin ? 'Admin' : 'Member'}
    </span>
  );
}
