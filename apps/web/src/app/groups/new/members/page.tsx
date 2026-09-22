'use client';

// GRP-02 Create Group - Add Members -- docs/ABRO_FRONTEND_SPEC.md §5
// (lines 1157-1196). Ported from the prototype's CreateGroupScreen step
// 2 (App.tsx:5342-5428) -- search bar, added-member chips, friend list
// with balance sub-text, "Skip for now".
//
// Deviations:
//  - Email/phone invite (spec's Components list) are dropped, same
//    reasoning as EXP-03's dropped invite panel: no invite flow exists
//    anywhere else in this app.
//  - "Create group" is this screen's own final action (spec's GRP-02
//    Interactions list ends with "Create group", not a hand-off to a
//    separate review screen) -- calls createGroup() (~/lib/mock-
//    data.ts), resets the draft, and navigates straight to the new
//    group's detail page.

import { EmptyState, PersonRow } from '@abro/ui';
import { ETB, formatMoney } from '@abro/types';
import { Check, Search, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useGroupDraft } from '~/lib/group-draft';
import { FRIENDS, createGroup } from '~/lib/mock-data';

export default function CreateGroupMembersPage() {
  const router = useRouter();
  const { draft, update, reset } = useGroupDraft();
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = query ? FRIENDS.filter((f) => f.name.toLowerCase().includes(query)) : FRIENDS;
  const added = FRIENDS.filter((f) => draft.memberIds.includes(f.id));

  const toggle = (id: string) =>
    update({
      memberIds: draft.memberIds.includes(id)
        ? draft.memberIds.filter((m) => m !== id)
        : [...draft.memberIds, id],
    });

  const finish = () => {
    const group = createGroup({
      name: draft.name.trim(),
      type: draft.type,
      memberIds: draft.memberIds,
      currency: draft.currency,
      description: draft.description.trim(),
    });
    reset();
    router.push(`/groups/${group.id}`);
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
          onClick={finish}
          className="text-[0.85rem] font-medium"
          style={{ color: 'var(--t-dim)' }}
        >
          Skip
        </button>
      </div>

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
            Added · {added.length}
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
        <EmptyState icon={<Users size={26} strokeWidth={1.5} />} title="No friends found" />
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

      <button
        onClick={finish}
        className="neo-btn-accent font-display mt-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold"
      >
        Create Group
      </button>
    </div>
  );
}
