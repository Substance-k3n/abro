'use client';

// Friend invite landing page (roadmap Phase 3b): abro.../add/<username>,
// shared as a link or QR code from Add Friend (components/InviteCard).
//
//  - Remembers the username first (lib/invite.ts), so if the visitor
//    isn't signed in -- the API client then sends them to /auth/signin --
//    sign-in and profile setup bring them straight back here.
//  - Finds the person by exact username (the search's exact match sorts
//    first) and offers one "Add as friend" button, or says you're already
//    friends, or that it's your own link.
//  - Forgets the pending invite once it has loaded for a signed-in user.

import { Avatar } from '@abro/ui';
import { Check, UserPlus, UserX } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { type AuthProfile, me } from '~/lib/auth-api';
import { listFriends, searchUsers, sendFriendRequest } from '~/lib/friends-api';
import { colorForId, initialsOf } from '~/lib/identity';
import { forgetInvite, isUsername, rememberInvite } from '~/lib/invite';

type View =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'self'; person: AuthProfile }
  | { kind: 'person'; person: AuthProfile; isFriend: boolean }
  | { kind: 'error'; message: string };

export default function AddFromInvitePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const username = decodeURIComponent(params.username ?? '').toLowerCase();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!isUsername(username)) {
      setView({ kind: 'notFound' });
      return;
    }
    rememberInvite(username);
    Promise.all([me(), searchUsers(`@${username}`), listFriends()])
      .then(([profile, results, friends]) => {
        if (profile.username === null) {
          // Signed in but not set up yet: setup comes back here afterwards.
          router.replace('/auth/setup-profile');
          return;
        }
        forgetInvite();
        if (profile.username === username) {
          setView({ kind: 'self', person: profile });
          return;
        }
        const person = results.find((p) => p.username === username);
        if (!person) {
          setView({ kind: 'notFound' });
          return;
        }
        setView({
          kind: 'person',
          person,
          isFriend: friends.some((f) => f.friend.id === person.id),
        });
      })
      .catch((err) => {
        setView({
          kind: 'error',
          message:
            err instanceof ApiError ? err.message : 'Could not open this invite. Please try again.',
        });
      });
  }, [username, router]);

  const add = async (person: AuthProfile) => {
    setSending(true);
    setSendError(null);
    try {
      await sendFriendRequest(person.id);
      setSent(true);
    } catch (err) {
      setSendError(
        err instanceof ApiError ? err.message : 'Could not send the request. Please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  if (view.kind === 'loading') {
    return <LoadingState minHeight="70vh" />;
  }

  return (
    <main className="fade-in flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="neo-raised flex w-full max-w-sm flex-col items-center gap-4 rounded-[26px] px-6 py-8 text-center">
        {view.kind === 'person' || view.kind === 'self' ? (
          <>
            <Avatar
              initials={initialsOf(view.person.displayName)}
              color={colorForId(view.person.id)}
              size={76}
            />
            <div className="flex flex-col gap-1">
              <h1
                className="font-display text-[1.4rem] font-bold"
                style={{ color: 'var(--t-primary)' }}
              >
                {view.person.displayName}
              </h1>
              <p className="font-mono text-[0.85rem]" style={{ color: 'var(--t-dim)' }}>
                @{view.person.username}
              </p>
            </div>

            {view.kind === 'self' ? (
              <p className="text-[0.88rem]" style={{ color: 'var(--t-secondary)' }}>
                This is your own invite link. Share it so friends can add you.
              </p>
            ) : view.isFriend ? (
              <p
                className="flex items-center gap-1.5 text-[0.9rem] font-semibold"
                style={{ color: 'var(--c-green)' }}
              >
                <Check size={17} strokeWidth={2.25} /> You&apos;re already friends
              </p>
            ) : sent ? (
              <div className="flex flex-col gap-1">
                <p
                  className="flex items-center justify-center gap-1.5 text-[0.9rem] font-semibold"
                  style={{ color: 'var(--c-green)' }}
                >
                  <Check size={17} strokeWidth={2.25} /> Friend request sent
                </p>
                <p className="text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
                  Once {view.person.displayName} accepts, you can split expenses together.
                </p>
              </div>
            ) : (
              <>
                <p className="text-[0.88rem]" style={{ color: 'var(--t-secondary)' }}>
                  Add {view.person.displayName} as a friend to split expenses together.
                </p>
                {sendError && (
                  <p role="alert" className="text-[0.82rem]" style={{ color: 'var(--c-red)' }}>
                    {sendError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => add(view.person)}
                  disabled={sending}
                  className="neo-btn-accent font-display flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[0.95rem] font-semibold disabled:opacity-60"
                >
                  <UserPlus size={18} strokeWidth={2.25} />
                  {sending ? 'Sending…' : 'Add as friend'}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div
              className="neo-inset-sm flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ color: 'var(--t-dim)' }}
            >
              <UserX size={28} strokeWidth={1.5} />
            </div>
            <h1
              className="font-display text-[1.25rem] font-bold"
              style={{ color: 'var(--t-primary)' }}
            >
              {view.kind === 'notFound' ? 'Invite not found' : 'Something went wrong'}
            </h1>
            <p className="text-[0.88rem]" style={{ color: 'var(--t-dim)' }}>
              {view.kind === 'notFound'
                ? 'No ABRO account has that username. Ask your friend to send their link again.'
                : view.message}
            </p>
          </>
        )}
      </div>
      <Link
        href="/home"
        className="text-[0.85rem] font-semibold"
        style={{ color: 'var(--accent)' }}
      >
        Go to ABRO
      </Link>
    </main>
  );
}
