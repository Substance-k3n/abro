'use client';

// DASH-05 Groups List — docs/ABRO_FRONTEND_SPEC.md §3 (lines 438-474).
// This is the full-screen expansion of the "Group Summary" preview already
// rendered on Home (home/page.tsx's groupsWithBalance section) -- same
// card visual language (GroupIcon in a tinted neo-raised-sm tile, name,
// balance as the refresh's Amount with "You're owed" / "You owe"), extended here with the type badge, member
// count and last-activity line the spec calls for and the Home preview
// omits for space. Card layout otherwise follows the prototype's
// GroupsScreen (App.tsx:2218): icon tile, name + type pill on one line,
// "members · lastActivity" subline, balance row.
//
// Deviations from spec:
// - A zero balance reads "All square" in `var(--t-dim)` with no amount
//   (no direction to colour) -- the prototype's `g.balance === 0` branch.
// - Loading state is the shared spinner (~/components/LoadStates), not a
//   per-card skeleton -- same as every other Phase 8 screen so far.
//
// Phase 8 (docs/WIRING_PLAN.md), slice 4: rewired from ~/lib/mock-data.ts
// to real GET /groups/ + GET /balances/summary, joined via the same
// deriveGroupRows() Home and Balances use. Member count and last
// activity come from GET /groups/'s list-only `memberCount`/
// `lastActivityAt` fields, added in apps/api for this screen rather than
// fanning out one GET /groups/{id} per card. Deviations (Confirmed):
//  - Last activity is an absolute short date ("Active Sep 23"), not
//    relative ("2h ago") -- same ~/lib/format.ts limitation as Home.
//
// Slice 8c: pending group invites (GET /groups/invites) are listed above
// the groups with Accept/Decline, the same pattern as Friends' incoming
// requests -- creating a group or adding a member only invites people,
// and this is where they join. Accepting reloads the page (the group
// now appears below); declining just drops the invite.

import { GroupIcon } from '@abro/ui';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { type BalancesSummary, deriveGroupRows, getBalancesSummary } from '~/lib/balances-api';
import { formatShortDate } from '~/lib/format';
import { me } from '~/lib/auth-api';
import {
  type GroupInvite,
  type GroupListItem,
  acceptGroupInvite,
  declineGroupInvite,
  groupTypeFor,
  listGroupInvites,
  listGroups,
} from '~/lib/groups-api';
import { type GroupCardData, GroupsView } from '~/components/groups/GroupsView';
import { SectionHeader } from '~/components/refresh';
import { type AuthExpense, listExpenses, toActivityDisplay } from '~/lib/expenses-api';
import { useApiRefresh } from '~/lib/use-api-refresh';

function toCards(groups: GroupListItem[], balances: BalancesSummary): GroupCardData[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  return deriveGroupRows(groups, balances).map((row) => {
    const g = byId.get(row.id)!;
    return {
      id: row.id,
      name: row.name,
      balance: row.balance,
      memberCount: g.memberCount,
      lastActivityAt: g.lastActivityAt,
      groupType: groupTypeFor(row.type),
      photo: row.photo,
    };
  });
}

export default function GroupsPage() {
  const [cards, setCards] = useState<GroupCardData[] | null>(null);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [recent, setRecent] = useState<{ expenses: AuthExpense[]; myId: string } | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      listGroups(),
      getBalancesSummary(),
      listGroupInvites(),
      me(),
      // Best-effort: the list works without the activity strip.
      listExpenses({ limit: 20 }).catch(() => [] as AuthExpense[]),
    ])
      .then(([groups, balances, pending, profile, expenses]) => {
        setCards(toCards(groups, balances));
        setInvites(pending);
        setMyId(profile.id);
        setRecent({ expenses, myId: profile.id });
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your groups.');
      });
  };

  useEffect(load, []);

  useApiRefresh(load);

  const respond = async (invite: GroupInvite, accept: boolean) => {
    setBusyInvite(invite.group.id);
    setInviteError(null);
    try {
      if (accept) {
        await acceptGroupInvite(invite.group.id);
        load();
      } else {
        await declineGroupInvite(invite.group.id, myId!);
        setInvites((list) => list.filter((i) => i.group.id !== invite.group.id));
      }
    } catch (err) {
      setInviteError(
        err instanceof ApiError ? err.message : 'Could not update the invite. Please try again.',
      );
    } finally {
      setBusyInvite(null);
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!cards) {
    return <LoadingState />;
  }

  const groupNameById = new Map(cards.map((g) => [g.id, g.name]));
  const activity = (recent?.expenses ?? [])
    .filter((e) => e.groupId !== null && groupNameById.has(e.groupId))
    .slice(0, 4)
    .map((e) => ({ id: e.id, display: toActivityDisplay(e, recent!.myId, groupNameById) }));

  const inviteList =
    invites.length > 0 ? (
      <div className="mb-6">
        <SectionHeader title={`Group invites (${invites.length})`} />
        {inviteError && (
          <p className="mb-2 text-[0.85rem]" role="alert" style={{ color: 'var(--owe)' }}>
            {inviteError}
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {invites.map((invite) => {
            const type = groupTypeFor(invite.group.type);
            const busy = busyInvite === invite.group.id;
            return (
              <div
                key={invite.group.id}
                className="neo-raised flex items-center gap-3 rounded-2xl px-4 py-3"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: type.tint, color: type.color }}
                >
                  <GroupIcon icon={type.icon} size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[0.92rem] font-semibold"
                    style={{ color: 'var(--t-primary)' }}
                  >
                    {invite.group.name}
                  </p>
                  <p className="truncate text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
                    {type.label} · invited {formatShortDate(invite.invitedAt)}
                  </p>
                </div>
                <button
                  onClick={() => respond(invite, false)}
                  disabled={busy}
                  aria-label={`Decline ${invite.group.name}`}
                  className="neo-btn flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-60"
                >
                  <X size={16} strokeWidth={2.25} style={{ color: 'var(--owe)' }} />
                </button>
                <button
                  onClick={() => respond(invite, true)}
                  disabled={busy}
                  aria-label={`Join ${invite.group.name}`}
                  className="neo-btn-accent flex h-11 w-11 items-center justify-center rounded-xl"
                >
                  <Check size={16} strokeWidth={2.25} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

  return <GroupsView cards={cards} activity={activity} invites={inviteList} />;
}
