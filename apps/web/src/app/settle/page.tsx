'use client';

// STL-01 Settle Up - Choose Person -- docs/ABRO_FRONTEND_SPEC.md §6
// (lines 1557-1590).
//
// Deviations:
//  - "People who owe you" is shown but not tappable into the settle flow.
//    Per apps/api/internal/settlements/service.go (already implemented,
//    ADR-003): a settlement can only be recorded by the debtor -- the
//    service checks the *actor's* outstanding balance to `toUserId` and
//    errors NO_OUTSTANDING_DEBT if the actor doesn't owe them. This app
//    only ever acts as the current user, so there is no valid way to
//    record "so-and-so paid me" from this session -- that has to happen
//    from their own account. Rows here are informational (tap -> Friend
//    Detail), not a fabricated settle path that would 400 the moment
//    Phase 8 wires the real endpoint. Same reasoning documented in
//    mock-data.ts' SettlementRecord header comment.
//  - "Groups" doesn't list a flat "your balance in each group" like the
//    spec text -- a group balance is an aggregate net position, not a
//    pairwise debt, and settling requires knowing exactly *who* in the
//    group you owe and how much. Selecting a group drills into that
//    group's specific outstanding payments (computed via
//    `getMyGroupDebts`, which calls the same tested `simplifyDebts()`
//    GRP-05/GRP-08 already use) rather than jumping straight to an
//    ambiguous amount screen. This keeps the route count matching the
//    spec (still just `/settle`, no extra screen) while staying correct
//    about which specific person is being settled with.
//  - `?friendId=` / `?groupId=` query params (pre-wired from Home,
//    Friends, Friend Detail, Groups, and the Balances overview screens
//    across earlier phases) are handled here: a valid `friendId` with a
//    real outstanding balance skips straight to /settle/amount; a valid
//    `groupId` pre-opens that group's drill-down.

import { ArrowRight, ChevronLeft, Handshake, Search as SearchIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { ETB, formatMoney } from '@abro/types';
import { AmountBadge, EmptyState, GroupIcon, PersonRow } from '@abro/ui';

import { useSettleDraft } from '~/lib/settle-draft';
import { FRIENDS, GROUPS, getMyGroupDebts, resolveParticipants } from '~/lib/mock-data';

export default function SettleChoosePage() {
  return (
    <Suspense>
      <SettleChooseForm />
    </Suspense>
  );
}

function SettleChooseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { draft, update } = useSettleDraft();
  const [search, setSearch] = useState('');
  const [handledParams, setHandledParams] = useState(false);

  const youOwe = FRIENDS.filter((f) => f.iOwe > 0n);
  const owedToYou = FRIENDS.filter((f) => f.owes > 0n);
  const groupsYouOweIn = useMemo(() => GROUPS.filter((g) => getMyGroupDebts(g.id).length > 0), []);

  useEffect(() => {
    if (handledParams) {
      return;
    }
    setHandledParams(true);

    const friendId = searchParams.get('friendId');
    if (friendId) {
      const friend = FRIENDS.find((f) => f.id === friendId);
      if (friend && friend.iOwe > 0n) {
        update({ toUserId: friendId, groupId: null });
        router.replace('/settle/amount');
        return;
      }
    }

    const groupId = searchParams.get('groupId');
    if (groupId && GROUPS.some((g) => g.id === groupId)) {
      const toUserId = searchParams.get('toUserId');
      if (toUserId && getMyGroupDebts(groupId).some((d) => d.toUserId === toUserId)) {
        update({ toUserId, groupId });
        router.replace('/settle/amount');
        return;
      }
      update({ groupId, toUserId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, handledParams]);

  const q = search.trim().toLowerCase();
  const filteredYouOwe = q ? youOwe.filter((f) => f.name.toLowerCase().includes(q)) : youOwe;
  const filteredOwedToYou = q
    ? owedToYou.filter((f) => f.name.toLowerCase().includes(q))
    : owedToYou;
  const filteredGroups = q
    ? groupsYouOweIn.filter((g) => g.name.toLowerCase().includes(q))
    : groupsYouOweIn;

  const activeGroup = draft.groupId ? GROUPS.find((g) => g.id === draft.groupId) : undefined;

  if (activeGroup) {
    const debts = getMyGroupDebts(activeGroup.id);
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => update({ groupId: null })}
            className="flex items-center gap-1 text-[0.85rem] font-medium"
            style={{ color: 'var(--accent)' }}
          >
            <ChevronLeft size={16} strokeWidth={2.5} /> Groups
          </button>
          <h2
            className="font-display text-[1.05rem] font-bold"
            style={{ color: 'var(--t-primary)' }}
          >
            {activeGroup.name}
          </h2>
          <div className="w-[70px]" />
        </div>

        {debts.length === 0 ? (
          <EmptyState
            icon={<Handshake size={26} strokeWidth={1.5} />}
            title="Nothing to settle"
            description="You don't owe anyone in this group right now."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {debts.map((d) => {
              const person = resolveParticipants([d.toUserId])[0]!;
              return (
                <PersonRow
                  key={d.toUserId}
                  initials={person.initials}
                  color={person.color}
                  name={person.name}
                  sub="In this group"
                  right={<AmountBadge amount={d.amount} dir="owe" />}
                  onClick={() => {
                    update({ toUserId: d.toUserId, groupId: activeGroup.id });
                    router.push('/settle/amount');
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const isEmpty =
    filteredYouOwe.length === 0 && filteredOwedToYou.length === 0 && filteredGroups.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/home')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ChevronLeft size={16} strokeWidth={2.5} /> Home
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Settle Up
        </h2>
        <div className="w-[60px]" />
      </div>

      <div className="relative">
        <SearchIcon
          size={17}
          strokeWidth={2}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--t-dim)' }}
        />
        <input
          className="neo-input"
          placeholder="Search people or groups"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 42 }}
        />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<Handshake size={26} strokeWidth={1.5} />}
          title="All settled up"
          description="No outstanding balances to settle right now."
        />
      ) : (
        <>
          {filteredYouOwe.length > 0 && (
            <div>
              <p
                className="mb-2 pl-1 text-[0.8rem] font-semibold"
                style={{ color: 'var(--t-muted)' }}
              >
                You owe
              </p>
              <div className="flex flex-col gap-2.5">
                {filteredYouOwe.map((f) => (
                  <PersonRow
                    key={f.id}
                    initials={f.initials}
                    color={f.color}
                    name={f.name}
                    right={<AmountBadge amount={f.iOwe} dir="owe" />}
                    onClick={() => {
                      update({ toUserId: f.id, groupId: null });
                      router.push('/settle/amount');
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredGroups.length > 0 && (
            <div>
              <p
                className="mb-2 pl-1 text-[0.8rem] font-semibold"
                style={{ color: 'var(--t-muted)' }}
              >
                Groups
              </p>
              <div className="flex flex-col gap-2.5">
                {filteredGroups.map((g) => {
                  const owed = getMyGroupDebts(g.id).reduce((sum, d) => sum + d.amount, 0n);
                  return (
                    <button
                      key={g.id}
                      onClick={() => update({ groupId: g.id })}
                      className="neo-raised-sm flex items-center gap-3 rounded-[18px] border-none px-3.5 py-[13px] text-left"
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                        style={{ background: `${g.color}22`, color: g.color }}
                      >
                        <GroupIcon icon={g.icon} size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="mb-0.5 text-[0.9rem] font-semibold"
                          style={{ color: 'var(--t-primary)' }}
                        >
                          {g.name}
                        </p>
                        <p className="text-[0.74rem]" style={{ color: 'var(--t-dim)' }}>
                          {formatMoney(owed, ETB)} owed across this group
                        </p>
                      </div>
                      <ArrowRight size={16} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredOwedToYou.length > 0 && (
            <div>
              <p
                className="mb-2 pl-1 text-[0.8rem] font-semibold"
                style={{ color: 'var(--t-muted)' }}
              >
                Owed to you
              </p>
              <div className="flex flex-col gap-2.5">
                {filteredOwedToYou.map((f) => (
                  <PersonRow
                    key={f.id}
                    initials={f.initials}
                    color={f.color}
                    name={f.name}
                    sub="They can settle from their side"
                    right={<AmountBadge amount={f.owes} dir="receive" />}
                    onClick={() => router.push(`/friends/${f.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
