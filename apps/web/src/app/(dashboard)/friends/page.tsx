'use client';

// DASH-03 Friends List — docs/ABRO_FRONTEND_SPEC.md §3 (lines 337-381).
// Ported the prototype's FriendsScreen (App.tsx:1937) for the two
// balance sections' visual language, and its separate
// FriendsManageScreen (App.tsx:4415) for the search bar + "settled up"
// section that FriendsScreen itself lacks -- the spec requires both,
// and FriendsManageScreen already had the pattern (there collapsed
// behind a "Manage friends" entry point; here collapsed by default via
// local state per the spec's explicit "collapsed by default").
//
// Phase 8 (docs/WIRING_PLAN.md) rewiring: real GET /friends/ + the
// GET /balances/summary this app's Home (DASH-01) slice already added,
// combined via ~/lib/balances-api.ts's deriveFriendRows() -- the exact
// same helper Home uses, so the two screens can't disagree about a
// friend's balance. "Settled up" (spec's third section) is new here --
// Home never needed it (it hides zero-balance friends entirely) --
// derived as `owes === 0n && iOwe === 0n`.
//
// Tabs (trial feedback 2026-10-07, replacing the spec's collapsed
// "Settled up" section): Unsettled (owe you / you owe), Settled, All.
// Opens on Unsettled when anyone has a balance, otherwise All.
//
// A friend row opens Friend Detail (`/friends/[friendId]`, DASH-04,
// real since slice 4).
//
// Friend requests: incoming PENDING requests (GET /friends/requests) are
// listed above the balance sections with Accept/Decline. Accepting
// reloads the whole page so the new friend appears with their (zero)
// balance from the same deriveFriendRows() path as everyone else.
//
// PersonRow (@abro/ui) renders as a <button>, so it navigates via its
// own `onClick` + router.push rather than being wrapped in a Link
// (which would nest a button inside an anchor).

import { Avatar } from '@abro/ui';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { FriendsView } from '~/components/friends/FriendsView';
import { Panel, Row, SectionHeader } from '~/components/refresh';
import { ApiError } from '~/lib/api-client';
import { deriveFriendRows, getBalancesSummary } from '~/lib/balances-api';
import {
  type FriendListItem,
  type IncomingFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  listFriends,
  listIncomingRequests,
} from '~/lib/friends-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { photoSrc } from '~/lib/photos';
import { remindFriend } from '~/lib/reminders-api';
import { useApiRefresh } from '~/lib/use-api-refresh';

export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendListItem[] | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof deriveFriendRows> | null>(null);
  const [requests, setRequests] = useState<IncomingFriendRequest[]>([]);
  const [busyRequest, setBusyRequest] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([listFriends(), getBalancesSummary(), listIncomingRequests()])
      .then(([friendList, balances, incoming]) => {
        setRequests(incoming);
        setFriends(friendList);
        setRows(deriveFriendRows(friendList, balances));
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your friends.');
      });
  };

  useEffect(load, []);

  useApiRefresh(load);

  const respond = async (req: IncomingFriendRequest, accept: boolean) => {
    setBusyRequest(req.friendshipId);
    setRequestError(null);
    try {
      if (accept) {
        await acceptFriendRequest(req.friendshipId);
        load();
      } else {
        await declineFriendRequest(req.friendshipId);
        setRequests((rs) => rs.filter((r) => r.friendshipId !== req.friendshipId));
      }
    } catch (err) {
      setRequestError(
        err instanceof ApiError ? err.message : 'Could not update the request. Please try again.',
      );
    } finally {
      setBusyRequest(null);
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!friends || !rows) {
    return <LoadingState />;
  }

  // Reminders are rate limited by the API (429 + a plain-English message);
  // that message is shown as is.
  const remind = async (friendId: string): Promise<string | null> => {
    try {
      await remindFriend(friendId);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Could not send the reminder.';
    }
  };

  const requestList =
    requests.length > 0 ? (
      <div className="mb-6">
        <SectionHeader title={`Friend requests (${requests.length})`} />
        {requestError && (
          <p className="mb-2 px-1 text-[0.85rem]" role="alert" style={{ color: 'var(--owe)' }}>
            {requestError}
          </p>
        )}
        <Panel className="md:max-w-xl">
          {requests.map((r) => {
            const busy = busyRequest === r.friendshipId;
            return (
              <Row
                key={r.friendshipId}
                leading={
                  <Avatar
                    initials={initialsOf(r.from.displayName)}
                    color={colorForId(r.from.id)}
                    size={40}
                    src={photoSrc(r.from.avatarUrl)}
                  />
                }
                title={r.from.displayName}
                sub="wants to be friends"
                trailing={
                  <span className="flex gap-2">
                    <button
                      onClick={() => respond(r, false)}
                      disabled={busy}
                      aria-label={`Decline ${r.from.displayName}`}
                      className="neo-btn flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-60"
                    >
                      <X size={16} strokeWidth={2.25} style={{ color: 'var(--owe)' }} />
                    </button>
                    <button
                      onClick={() => respond(r, true)}
                      disabled={busy}
                      aria-label={`Accept ${r.from.displayName}`}
                      className="neo-btn-accent flex h-11 w-11 items-center justify-center rounded-xl"
                    >
                      <Check size={16} strokeWidth={2.25} />
                    </button>
                  </span>
                }
              />
            );
          })}
        </Panel>
      </div>
    ) : null;

  return <FriendsView rows={rows} requests={requestList} onRemind={remind} />;
}
