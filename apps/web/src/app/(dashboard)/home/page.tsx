'use client';

// DASH-01 Home Dashboard -- docs/ABRO_FRONTEND_SPEC.md §3.
//
// This page only loads data and shapes it; the layout lives in
// ~/components/home/HomeView so it can be reviewed with sample data.
// Redesigned 2026-11-19 from the Stitch "Terracotta Kin" mockup: friends
// strip, the ekub in progress and groups as cards were added; every
// section is fed by calls the old Home or the Ekub screens already made.
//
// Phase 8 (docs/WIRING_PLAN.md), slice 2: real apps/api calls, in
// parallel on mount. The ekub card is best-effort -- if the ekub request
// fails, Home still loads without it. Balance sign conventions go through
// ~/lib/balances-api.ts's friendOweSplit() / balanceTotals().
//
// Avatar color is derived from the person's id (~/lib/identity.ts), not
// stored. "Friends" are ordered by how much is owed either way, then by
// name: the API keeps no "how often" signal, so the mockup's "Frequent"
// label would claim something we don't know.

import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { HomeView, type HomeViewProps } from '~/components/home/HomeView';
import { ApiError } from '~/lib/api-client';
import { type AuthProfile, me } from '~/lib/auth-api';
import {
  type BalancesSummary,
  balanceTotals,
  deriveFriendRows,
  deriveGroupRows,
  getBalancesSummary,
} from '~/lib/balances-api';
import { type EkubDetail, listEkubs } from '~/lib/ekubs-api';
import { loadRunningEkubs, toEkubCard } from '~/lib/ekub-card';
import { type AuthExpense, listExpenses, toActivityDisplay } from '~/lib/expenses-api';
import { type FriendListItem, listFriends } from '~/lib/friends-api';
import { type AuthGroup, groupTypeFor, listGroups } from '~/lib/groups-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { listNotifications } from '~/lib/notifications-api';
import { photoSrc } from '~/lib/photos';
import { type SettlementRequest, listSettlementRequests } from '~/lib/settlements-api';
import { useApiRefresh } from '~/lib/use-api-refresh';

interface HomeData {
  profile: AuthProfile;
  friends: FriendListItem[];
  groups: AuthGroup[];
  balances: BalancesSummary;
  unreadCount: number;
  recentActivity: AuthExpense[];
  toConfirm: SettlementRequest[];
  ekub: EkubDetail | null;
}

/** The first ekub that is running and that I take part in. Never throws:
 * Home is more important than this card. */
async function loadActiveEkub(): Promise<EkubDetail | null> {
  try {
    const [first] = await loadRunningEkubs(await listEkubs());
    return first ?? null;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      me(),
      listFriends(),
      listGroups(),
      getBalancesSummary(),
      listNotifications({ unreadOnly: true, limit: 100 }),
      listExpenses({ limit: 5 }),
      listSettlementRequests(),
      loadActiveEkub(),
    ])
      .then(([profile, friends, groups, balances, unread, recentActivity, requests, ekub]) => {
        setData({
          profile,
          friends,
          groups,
          balances,
          unreadCount: unread.length,
          recentActivity,
          toConfirm: requests.filter(
            (r) => r.status === 'PENDING' && r.recipient.id === profile.id,
          ),
          ekub,
        });
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your dashboard. Please try again.',
        );
      });
  };

  useEffect(load, []);

  useApiRefresh(load);

  if (error) {
    return <ErrorState message={error} onRetry={load} minHeight="60vh" />;
  }
  if (!data) {
    return <LoadingState minHeight="60vh" />;
  }

  const { profile, friends, groups, balances, recentActivity, toConfirm } = data;
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

  const friendRows = deriveFriendRows(friends, balances);
  const groupRows = deriveGroupRows(groups, balances).map((g) => ({
    ...g,
    groupType: groupTypeFor(g.type),
  }));
  const { owedTotal, oweTotal, net } = balanceTotals(friendRows, groupRows);

  const size = (f: (typeof friendRows)[number]) => (f.owes > f.iOwe ? f.owes : f.iOwe);
  const orderedFriends = [...friendRows].sort(
    (a, b) => Number(size(b) - size(a)) || a.name.localeCompare(b.name),
  );

  const view: HomeViewProps = {
    profile: {
      id: profile.id,
      firstName: profile.displayName.split(' ')[0] ?? profile.displayName,
      initials: initialsOf(profile.displayName),
      color: colorForId(profile.id),
      photo: photoSrc(profile.avatarUrl),
    },
    unreadCount: data.unreadCount,
    net,
    owedTotal,
    oweTotal,
    friends: orderedFriends,
    ekub: data.ekub ? toEkubCard(data.ekub) : null,
    groups: groupRows,
    activity: recentActivity.map((e) => ({
      id: e.id,
      display: toActivityDisplay(e, profile.id, groupNameById),
    })),
    toConfirm:
      toConfirm.length > 0
        ? {
            count: toConfirm.length,
            total: toConfirm.reduce((sum, r) => sum + BigInt(r.amount), 0n),
            firstName: toConfirm[0]!.payer.displayName.split(' ')[0] ?? 'Someone',
          }
        : null,
  };

  return <HomeView {...view} />;
}
