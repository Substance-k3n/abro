'use client';

// STL-01 Settle Up - Choose Person -- docs/ABRO_FRONTEND_SPEC.md §6
// (lines 1557-1590). Phase 8 slice 9b: real friends, balances and
// groups; a group's payments come from apps/api's simplified plan.
//
// Deviations:
//  - "People who owe you" is shown but not tappable into the settle
//    flow: apps/api only lets the debtor record a settlement (ADR-003),
//    so "they paid me" has to be recorded from their account. Rows open
//    Friend Detail instead.
//  - "Groups" lists the groups you owe in (your net < 0). Selecting one
//    shows your payments from that group's simplified plan
//    (GET /balances/groups/{id}/simplified, the same plan GRP-05/08
//    show) -- each is payable because apps/api checks group
//    settlements against nets (ADR-010).
//  - Deep links (?friendId=, ?groupId=, ?groupId=&toUserId=) from Home,
//    Friends, Friend Detail, Groups and Balances: a friend or a group
//    payee goes straight to /settle/amount (which checks there's
//    something to settle and bounces back here if not); a bare groupId
//    opens that group's payments.
//  - Hand-offs to /settle/amount go through its query params, never a
//    context update made just before navigating (the new route can
//    render before the update commits -- a real repro in Phase 6).

import { ArrowRight, ChevronLeft, Handshake, Search as SearchIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useEffect, useState } from 'react';

import { ETB, formatMoney } from '@abro/types';
import { AmountBadge, EmptyState, GroupIcon, PersonRow } from '@abro/ui';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { me } from '~/lib/auth-api';
import {
  type FriendRow,
  type SimplifiedPayment,
  deriveFriendRows,
  getBalancesSummary,
  getSimplifiedPayments,
} from '~/lib/balances-api';
import { listFriends } from '~/lib/friends-api';
import { type AuthGroup, getGroup, groupTypeFor, listGroups } from '~/lib/groups-api';
import { colorForId, initialsOf } from '~/lib/identity';

export default function SettleChoosePage() {
  return (
    <Suspense>
      <SettleChooseForm />
    </Suspense>
  );
}

interface OwedGroup {
  id: string;
  name: string;
  type: string;
  /** What you owe the group overall (your net, made positive). */
  owed: bigint;
}

interface Data {
  meId: string;
  friends: FriendRow[];
  groups: OwedGroup[];
}

function SettleChooseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  const friendId = searchParams.get('friendId');
  const paramGroupId = searchParams.get('groupId');
  const paramToUserId = searchParams.get('toUserId');
  const redirecting = !!friendId || (!!paramGroupId && !!paramToUserId);

  const load = () => {
    setError(null);
    setData(null);
    Promise.all([me(), listFriends(), getBalancesSummary(), listGroups()])
      .then(([profile, friends, summary, groups]) => {
        const netByGroup = new Map(summary.groups.map((g) => [g.groupId, BigInt(g.netBalance)]));
        setData({
          meId: profile.id,
          friends: deriveFriendRows(friends, summary),
          groups: groups
            .filter((g) => (netByGroup.get(g.id) ?? 0n) < 0n)
            .map((g) => ({ id: g.id, name: g.name, type: g.type, owed: -netByGroup.get(g.id)! })),
        });
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your balances.');
      });
  };

  useEffect(() => {
    if (friendId) {
      router.replace(`/settle/amount?toUserId=${friendId}`);
      return;
    }
    if (paramGroupId && paramToUserId) {
      router.replace(`/settle/amount?toUserId=${paramToUserId}&groupId=${paramGroupId}`);
      return;
    }
    if (paramGroupId) {
      setOpenGroupId(paramGroupId);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (redirecting) {
    return <LoadingState />;
  }
  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!data) {
    return <LoadingState />;
  }

  if (openGroupId) {
    return (
      <GroupPayments
        groupId={openGroupId}
        meId={data.meId}
        onBack={() => setOpenGroupId(null)}
        onPick={(toUserId) =>
          router.push(`/settle/amount?toUserId=${toUserId}&groupId=${openGroupId}`)
        }
      />
    );
  }

  const q = search.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const youOwe = data.friends.filter((f) => f.iOwe > 0n && match(f.name));
  const owedToYou = data.friends.filter((f) => f.owes > 0n && match(f.name));
  const groups = data.groups.filter((g) => match(g.name));
  const isEmpty = youOwe.length === 0 && owedToYou.length === 0 && groups.length === 0;

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
          {youOwe.length > 0 && (
            <Section title="You owe">
              {youOwe.map((f) => (
                <PersonRow
                  key={f.id}
                  initials={f.initials}
                  color={f.color}
                  name={f.name}
                  right={<AmountBadge amount={f.iOwe} dir="owe" />}
                  onClick={() => router.push(`/settle/amount?toUserId=${f.id}`)}
                />
              ))}
            </Section>
          )}

          {groups.length > 0 && (
            <Section title="Groups">
              {groups.map((g) => {
                const type = groupTypeFor(g.type);
                return (
                  <button
                    key={g.id}
                    onClick={() => setOpenGroupId(g.id)}
                    className="neo-raised-sm flex items-center gap-3 rounded-[18px] border-none px-3.5 py-[13px] text-left"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                      style={{ background: type.tint, color: type.color }}
                    >
                      <GroupIcon icon={type.icon} size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="mb-0.5 text-[0.9rem] font-semibold"
                        style={{ color: 'var(--t-primary)' }}
                      >
                        {g.name}
                      </p>
                      <p className="text-[0.74rem]" style={{ color: 'var(--t-dim)' }}>
                        You owe {formatMoney(g.owed, ETB)} in this group
                      </p>
                    </div>
                    <ArrowRight size={16} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
                  </button>
                );
              })}
            </Section>
          )}

          {owedToYou.length > 0 && (
            <Section title="Owed to you">
              {owedToYou.map((f) => (
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
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 pl-1 text-[0.8rem] font-semibold" style={{ color: 'var(--t-muted)' }}>
        {title}
      </p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

/** One group's payments you make, from apps/api's simplified plan. */
function GroupPayments({
  groupId,
  meId,
  onBack,
  onPick,
}: {
  groupId: string;
  meId: string;
  onBack: () => void;
  onPick: (toUserId: string) => void;
}) {
  const [state, setState] = useState<
    { group: AuthGroup; payments: SimplifiedPayment[] } | 'loading' | 'notFound' | string
  >('loading');

  const load = () => {
    setState('loading');
    Promise.all([getGroup(groupId), getSimplifiedPayments(groupId)])
      .then(([group, plan]) =>
        setState({ group, payments: plan.filter((p) => p.fromUserId === meId) }),
      )
      .catch((err) => {
        if (err instanceof ApiError && [400, 403, 404].includes(err.status)) {
          setState('notFound');
          return;
        }
        setState(err instanceof ApiError ? err.message : 'Could not load this group.');
      });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [groupId]);

  if (state === 'loading') {
    return <LoadingState />;
  }
  if (typeof state === 'string' && state !== 'notFound') {
    return <ErrorState message={state} onRetry={load} />;
  }

  const group = typeof state === 'object' ? state.group : null;
  const payments = typeof state === 'object' ? state.payments : [];
  const nameOf = (id: string) =>
    group?.members.find((m) => m.userId === id)?.user.displayName ?? 'Former member';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ChevronLeft size={16} strokeWidth={2.5} /> Settle Up
        </button>
        <h2
          className="font-display truncate px-2 text-[1.05rem] font-bold"
          style={{ color: 'var(--t-primary)' }}
        >
          {group?.name ?? 'Group'}
        </h2>
        <div className="w-[70px]" />
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon={<Handshake size={26} strokeWidth={1.5} />}
          title={group ? 'Nothing to settle' : 'Group not found'}
          description={
            group
              ? "You don't owe anyone in this group right now."
              : "This group doesn't exist, or you're not a member."
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {payments.map((p) => (
            <PersonRow
              key={p.toUserId}
              initials={initialsOf(nameOf(p.toUserId))}
              color={colorForId(p.toUserId)}
              name={nameOf(p.toUserId)}
              sub="Suggested payment in this group"
              right={<AmountBadge amount={p.amount} dir="owe" />}
              onClick={() => onPick(p.toUserId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
