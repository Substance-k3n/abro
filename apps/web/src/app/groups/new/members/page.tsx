'use client';

// GRP-02 Create Group - Add Members -- docs/ABRO_FRONTEND_SPEC.md §5
// (lines 1157-1196). Search bar, added-member chips, your friends with
// their balance, "Skip for now". Phase 8 slice 8c: friends from
// GET /friends/ + GET /balances/summary (~/lib/balances-api.ts's
// deriveFriendRows, the same rows as Friends/Home), and "Create Group"
// calls POST /groups/.
//
// Deviations:
//  - Email/phone invite (spec's Components list) are dropped: apps/api
//    only adds existing friends (NOT_FRIENDS otherwise).
//  - Picked friends are *invited*, not added: they join from the
//    invites list on their Groups page. The screen says so.
//  - "Create group" is this screen's own final action (the spec's
//    Interactions list ends with it) -- on success you land on the new
//    group's detail page. A server error shows
//    above the button and keeps the draft; the button is disabled while
//    the request is in flight (apps/api has no idempotency key for
//    groups, so that's the double-submit guard).

import { EmptyState, PersonRow } from '@abro/ui';
import { ETB, formatMoney } from '@abro/types';
import { Check, Search, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { type FriendRow, deriveFriendRows, getBalancesSummary } from '~/lib/balances-api';
import { listFriends } from '~/lib/friends-api';
import { useGroupDraft } from '~/lib/group-draft';
import { createGroup } from '~/lib/groups-api';

export default function CreateGroupMembersPage() {
  const router = useRouter();
  const { draft, update } = useGroupDraft();
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    setFriends(null);
    Promise.all([listFriends(), getBalancesSummary()])
      .then(([list, balances]) => setFriends(deriveFriendRows(list, balances)))
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load your friends.');
      });
  };

  useEffect(load, []);

  // Refreshing on this step loses the in-memory draft -- start over.
  useEffect(() => {
    if (!draft.name.trim()) {
      router.replace('/groups/new');
    }
  }, [draft.name, router]);

  if (loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!friends) {
    return <LoadingState />;
  }

  const query = search.trim().toLowerCase();
  const filtered = query ? friends.filter((f) => f.name.toLowerCase().includes(query)) : friends;
  const added = friends.filter((f) => draft.memberIds.includes(f.id));

  const toggle = (id: string) =>
    update({
      memberIds: draft.memberIds.includes(id)
        ? draft.memberIds.filter((m) => m !== id)
        : [...draft.memberIds, id],
    });

  const finish = async (memberIds: string[]) => {
    setCreating(true);
    setCreateError(null);
    const description = draft.description.trim();
    try {
      const group = await createGroup({
        name: draft.name.trim(),
        type: draft.type.toUpperCase(),
        currency: draft.currency,
        ...(description ? { description } : {}),
        memberIds,
      });
      // No reset(): the draft lives in this wizard's layout and goes away
      // with it (and clearing the name would trip the redirect above).
      router.push(`/groups/${group.id}`);
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : 'Could not create the group. Please try again.',
      );
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/groups/new')}
          className="text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          Back
        </button>
        <h2 className="font-display text-[1.1rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Add Members
        </h2>
        <button
          onClick={() => finish([])}
          disabled={creating}
          className="text-[0.85rem] font-medium disabled:opacity-40"
          style={{ color: 'var(--t-dim)' }}
        >
          Skip
        </button>
      </div>

      <p className="pl-1 text-[0.78rem]" style={{ color: 'var(--t-muted)' }}>
        Friends you pick get an invite to join <strong>{draft.name.trim()}</strong>.
      </p>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--t-dim)' }}
        />
        <input
          className="neo-input"
          placeholder="Search friends…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 40 }}
        />
      </div>

      {added.length > 0 && (
        <div>
          <p
            className="mb-2 pl-1 text-[0.72rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            To invite · {added.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {added.map((f) => (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                className="neo-flat flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[0.78rem] font-medium"
                style={{ color: 'var(--t-secondary)' }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[0.6rem] font-bold text-white"
                  style={{ background: f.color }}
                >
                  {f.initials}
                </span>
                {f.name.split(' ')[0]}
                <X size={12} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={26} strokeWidth={1.5} />}
          title={friends.length === 0 ? 'No friends yet' : 'No friends found'}
          description={
            friends.length === 0
              ? 'Add friends first, or create the group now and invite them later.'
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((f) => {
            const selected = draft.memberIds.includes(f.id);
            const balanceLabel =
              f.owes > 0n
                ? `+${formatMoney(f.owes, ETB)}`
                : f.iOwe > 0n
                  ? `-${formatMoney(f.iOwe, ETB)}`
                  : 'Settled';
            return (
              <PersonRow
                key={f.id}
                initials={f.initials}
                photo={f.photo}
                color={f.color}
                name={f.name}
                sub={balanceLabel}
                right={
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-lg"
                    style={{
                      background: selected ? 'var(--accent)' : 'transparent',
                      boxShadow: selected
                        ? '3px 3px 8px rgba(99,102,241,0.3), -2px -2px 5px rgba(255,255,255,0.5)'
                        : 'inset 3px 3px 7px var(--neo-dark), inset -3px -3px 7px var(--neo-light)',
                    }}
                  >
                    {selected && <Check size={14} strokeWidth={2.5} color="white" />}
                  </div>
                }
                onClick={() => toggle(f.id)}
              />
            );
          })}
        </div>
      )}

      {createError && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {createError}
        </p>
      )}

      <button
        onClick={() => finish(draft.memberIds)}
        disabled={creating}
        className="neo-btn-accent font-display mt-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:opacity-40"
      >
        {creating ? 'Creating…' : 'Create Group'}
      </button>
    </div>
  );
}
