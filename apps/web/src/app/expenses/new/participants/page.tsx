'use client';

// EXP-03 Add Expense - Select Participants -- docs/ABRO_FRONTEND_SPEC.md
// §4 (lines 714-760). Ported from the prototype's AddExpenseScreen "Who"
// step (App.tsx:3191-3307) -- select-all toggle, FRIENDS list with a
// checkbox-style indicator, dimmed non-group-members when the draft has
// a group, "N participants selected" summary footer. Split out of the
// prototype's combined step into its own route per the spec (see
// expense-draft.tsx's header comment for why).
//
// Deviations:
//  - The prototype's "invite new member by email" panel isn't ported --
//    no such flow exists anywhere else in this app (friends are added
//    via the Friends screen, not inline mid-expense), and the spec's
//    own component list for this screen doesn't ask for one either.
//  - "You" is always shown as the first row, using PersonRow like every
//    other participant, rather than the prototype's separate bare
//    select-all-only treatment (the prototype excludes "you" from the
//    FRIENDS.map entirely). Per spec: "You (always included if you paid,
//    optional otherwise)" -- if you're the payer, your row is locked
//    selected (not toggleable); otherwise it toggles like anyone else.
//  - When the draft has a group and no manual participant edit has
//    happened yet, participants are pre-selected to that group's
//    members + you (one-time effect below) -- the prototype does this
//    at group-selection time; here it happens on landing on this step
//    instead, since group selection (EXP-01) and participant selection
//    (EXP-03) are now separate routes.

import { EmptyState, PersonRow } from '@abro/ui';
import { Check, Search, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ME, useExpenseDraft } from '~/lib/expense-draft';
import { CURRENT_USER, FRIENDS, GROUPS } from '~/lib/mock-data';

export default function AddExpenseParticipantsPage() {
  const router = useRouter();
  const { draft, update } = useExpenseDraft();
  const [search, setSearch] = useState('');

  const group = draft.groupId ? GROUPS.find((g) => g.id === draft.groupId) : null;

  // One-time pre-select of group members, only while the draft is still
  // at its untouched default ([ME]) -- doesn't clobber a manual edit if
  // the user has already added/removed anyone.
  useEffect(() => {
    if (group && draft.participantIds.length === 1 && draft.participantIds[0] === ME) {
      update({ participantIds: [ME, ...group.memberIds] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  const isPayer = draft.payerId === ME;
  const youSelected = draft.participantIds.includes(ME);

  const toggle = (id: string) => {
    if (id === ME && isPayer) {
      return; // locked in -- you paid, so you're always a participant.
    }
    update({
      participantIds: draft.participantIds.includes(id)
        ? draft.participantIds.filter((p) => p !== id)
        : [...draft.participantIds, id],
    });
  };

  const query = search.trim().toLowerCase();
  const filtered = query ? FRIENDS.filter((f) => f.name.toLowerCase().includes(query)) : FRIENDS;

  const allFriendsSelected = FRIENDS.every((f) => draft.participantIds.includes(f.id));
  const toggleSelectAll = () => {
    update({
      participantIds: allFriendsSelected
        ? youSelected
          ? [ME]
          : []
        : [...new Set([...draft.participantIds, ...FRIENDS.map((f) => f.id)])],
    });
  };

  const selectedFriends = FRIENDS.filter((f) => draft.participantIds.includes(f.id));
  const totalSelected = draft.participantIds.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/expenses/new/payer')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          Back
        </button>
        <h2 className="font-display text-[1.1rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Add Expense
        </h2>
        <div className="w-[60px]" />
      </div>

      {group && (
        <div className="neo-inset-sm flex items-center gap-2 rounded-[14px] px-3.5 py-2.5">
          <span style={{ color: 'var(--t-muted)' }}>{group.icon}</span>
          <p className="text-[0.8rem] font-medium" style={{ color: 'var(--t-muted)' }}>
            Showing members of <strong>{group.name}</strong>
          </p>
        </div>
      )}

      <p className="pl-0.5 text-[0.82rem]" style={{ color: 'var(--t-muted)' }}>
        Select everyone involved in this expense.
      </p>

      {totalSelected > 0 && (
        <div className="flex flex-wrap gap-2">
          {youSelected && (
            <span
              className="neo-flat flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[0.78rem] font-medium"
              style={{ color: 'var(--t-secondary)' }}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-bold text-white"
                style={{ background: CURRENT_USER.color }}
              >
                {CURRENT_USER.initials}
              </span>
              You
              {!isPayer && (
                <button onClick={() => toggle(ME)} aria-label="Remove yourself">
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </span>
          )}
          {selectedFriends.map((f) => (
            <span
              key={f.id}
              className="neo-flat flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[0.78rem] font-medium"
              style={{ color: 'var(--t-secondary)' }}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-bold text-white"
                style={{ background: f.color }}
              >
                {f.initials}
              </span>
              {f.name.split(' ')[0]}
              <button onClick={() => toggle(f.id)} aria-label={`Remove ${f.name}`}>
                <X size={12} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--t-dim)' }}
        />
        <input
          className="neo-input"
          placeholder="Search friends"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 40 }}
        />
      </div>

      <button
        onClick={toggleSelectAll}
        className="flex items-center gap-2 border-none py-1 pl-0.5 text-[0.78rem] font-semibold"
        style={{ color: 'var(--accent)' }}
      >
        <div
          className="flex h-5 w-5 items-center justify-center rounded-[6px]"
          style={{
            background: allFriendsSelected ? 'var(--accent)' : 'transparent',
            boxShadow: allFriendsSelected
              ? '3px 3px 8px rgba(99,102,241,0.3), -2px -2px 5px rgba(255,255,255,0.5)'
              : 'inset 3px 3px 7px var(--neo-dark), inset -3px -3px 7px var(--neo-light)',
          }}
        >
          {allFriendsSelected && <Check size={12} strokeWidth={2.5} color="white" />}
        </div>
        Select all
      </button>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users size={26} strokeWidth={1.5} />} title="No friends found" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((f) => {
            const selected = draft.participantIds.includes(f.id);
            const isGroupMember = group ? group.memberIds.includes(f.id) : true;
            return (
              <div key={f.id} style={{ opacity: isGroupMember ? 1 : 0.6 }}>
                <PersonRow
                  initials={f.initials}
                  color={f.color}
                  name={f.name}
                  sub={group && isGroupMember ? 'Group member' : undefined}
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
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => router.push('/expenses/new/split')}
        disabled={totalSelected === 0}
        className="neo-btn-accent font-display mt-2 rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
