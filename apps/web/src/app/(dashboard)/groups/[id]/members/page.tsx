'use client';

// GRP-06 Group Members -- docs/ABRO_FRONTEND_SPEC.md §5 (lines 1362-
// 1405). Member list with role badges and per-group balance, an
// inline (not modal) Add Member panel.
//
// Deviations:
//  - "Add member button (if admin)" / member actions "(admin only)":
//    same as GRP-03's Members tab -- there's no real membership/role
//    system, "you" are always treated as Admin of every group in this
//    app's mock model, so these are always shown rather than
//    conditionally gated on a role that doesn't really exist yet.
//  - Add Member is an inline expandable panel (search + friend list),
//    not a modal -- consistent with this app's established pattern of
//    inline reveal panels over a modal library (e.g. EXP-02's "Someone
//    else paid" friend picker). It's also real, not a placeholder:
//    tapping a friend calls addGroupMember() (~/lib/mock-data.ts),
//    which actually updates the group's member list and balances.
//  - Email/phone invite (spec's Add Member list) are dropped, same
//    reasoning as every other dropped invite flow in this app (EXP-03,
//    GRP-02): no invite mechanism exists anywhere else to be
//    consistent with.
//  - "Make admin" / "Remove from group" are disabled placeholders in a
//    per-member "•••" menu -- "make admin" has no real role system to
//    act on, and "remove from group" would need to handle outstanding
//    balances/reassign expenses, which is real product logic this
//    mock-data phase shouldn't fake. Confirmation dialogs (spec's own
//    Components list) aren't needed for actions that don't do anything
//    yet.

import { ETB, formatMoney } from '@abro/types';
import { Avatar, EmptyState, PersonRow } from '@abro/ui';
import {
  ArrowLeft,
  MoreHorizontal,
  Search,
  Shield,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ME } from '~/lib/expense-draft';
import {
  FRIENDS,
  GROUPS,
  GROUP_BALANCES,
  addGroupMember,
  resolveParticipants,
} from '~/lib/mock-data';

export default function GroupMembersPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // addGroupMember() mutates GROUPS/GROUP_BALANCES in place, which
  // React has no way to notice on its own -- `group`/`balances` below
  // are recomputed fresh on every render already, so bumping this on
  // each add is enough to force that re-render (setSearch('') alone
  // isn't reliable: React bails out of re-rendering a no-op '' -> ''
  // state update when the search box was already empty).
  const [refreshTick, setRefreshTick] = useState(0);

  const group = GROUPS.find((g) => g.id === params.id);

  if (!group) {
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
          description="This group doesn't exist, or the link may be out of date."
        />
      </div>
    );
  }

  const balances = GROUP_BALANCES[group.id] ?? {};
  const memberRows = resolveParticipants(['me', ...group.memberIds]);
  const query = search.trim().toLowerCase();
  const candidates = FRIENDS.filter(
    (f) => !group.memberIds.includes(f.id) && (!query || f.name.toLowerCase().includes(query)),
  );

  const handleAdd = (friendId: string) => {
    addGroupMember(group.id, friendId);
    setSearch('');
    setRefreshTick((t) => t + 1);
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push(`/groups/${group.id}`)}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> {group.name}
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Members
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="neo-btn flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ color: 'var(--accent)' }}
        >
          <UserPlus size={17} strokeWidth={2} />
        </button>
      </div>

      {adding && (
        <div className="neo-raised-sm mb-4 flex flex-col gap-2.5 rounded-2xl p-3.5">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--t-dim)' }}
            />
            <input
              className="neo-input"
              placeholder="Search friends to add…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
          {candidates.length === 0 ? (
            <p className="px-1 py-2 text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
              {query ? 'No friends match.' : 'Everyone is already in this group.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {candidates.map((f) => (
                <PersonRow
                  key={f.id}
                  initials={f.initials}
                  color={f.color}
                  name={f.name}
                  right={
                    <span
                      className="text-[0.75rem] font-semibold"
                      style={{ color: 'var(--accent)' }}
                    >
                      Add
                    </span>
                  }
                  onClick={() => handleAdd(f.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div key={refreshTick} className="flex flex-col gap-2.5">
        {memberRows.map((p) => {
          const bal = balances[p.id] ?? 0n;
          const isYou = p.id === ME;
          return (
            <div
              key={p.id}
              className="neo-raised-sm flex items-center gap-3 rounded-2xl px-3.5 py-3"
            >
              <Avatar initials={p.initials} color={p.color} size={42} />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <p
                    className="truncate text-[0.88rem] font-semibold"
                    style={{ color: 'var(--t-primary)' }}
                  >
                    {isYou ? 'You' : p.name}
                  </p>
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[0.64rem] font-semibold"
                    style={{
                      color: isYou ? 'var(--accent)' : 'var(--t-dim)',
                      background: isYou ? 'var(--accent-light)' : 'transparent',
                    }}
                  >
                    {isYou ? 'Admin' : 'Member'}
                  </span>
                </div>
                <p
                  className="font-mono text-[0.75rem] font-semibold"
                  style={{
                    color: bal > 0n ? 'var(--c-green)' : bal < 0n ? 'var(--c-red)' : 'var(--t-dim)',
                  }}
                >
                  {bal === 0n
                    ? 'Settled'
                    : `${bal > 0n ? '+' : '-'}${formatMoney(bal < 0n ? -bal : bal, ETB)}`}
                </p>
              </div>
              {!isYou && (
                <div className="relative">
                  <button
                    onClick={() => setMenuFor((v) => (v === p.id ? null : p.id))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ color: 'var(--t-dim)' }}
                  >
                    <MoreHorizontal size={16} strokeWidth={2} />
                  </button>
                  {menuFor === p.id && (
                    <div className="neo-raised-sm absolute right-0 top-9 z-10 flex w-44 flex-col gap-1 rounded-2xl p-2">
                      <button
                        type="button"
                        disabled
                        title="Coming soon"
                        className="flex cursor-not-allowed items-center gap-2 rounded-xl px-3 py-2 text-[0.8rem] font-medium opacity-50"
                        style={{ color: 'var(--t-secondary)' }}
                      >
                        <Shield size={14} strokeWidth={2} /> Make admin
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Coming soon"
                        className="flex cursor-not-allowed items-center gap-2 rounded-xl px-3 py-2 text-[0.8rem] font-medium opacity-50"
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
    </div>
  );
}
