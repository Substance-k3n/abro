'use client';

// Add Friend -- target of DASH-03's "Add friend" button
// (docs/ABRO_FRONTEND_SPEC.md §3). The spec names the button but no screen
// behind it; this is the smallest screen apps/api's friends module
// supports: GET /friends/search (exact email or phone, never a fuzzy name
// search -- apps/api/queries/friends.sql) then POST /friends/requests.
// The other person accepts from their own Friends list's "Friend
// requests" section.
//
// No outgoing-requests list: apps/api has no endpoint for it, so "Request
// sent" is only shown for the request just made in this session. Sending
// again surfaces apps/api's own FRIENDSHIP_EXISTS message instead.

import { Avatar, BackButton, EmptyState } from '@abro/ui';
import { Check, Search, UserPlus, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { ApiError } from '~/lib/api-client';
import type { AuthProfile } from '~/lib/auth-api';
import { searchUsers, sendFriendRequest } from '~/lib/friends-api';
import { colorForId, initialsOf } from '~/lib/identity';

type SendState = 'idle' | 'sending' | 'sent';

export default function AddFriendPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<AuthProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendState, setSendState] = useState<Record<string, SendState>>({});

  const canSearch = query.trim().length >= 3 && !searching;

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSearch) {
      return;
    }
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      setResults(await searchUsers(query));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const onSend = async (profile: AuthProfile) => {
    setError(null);
    setSendState((s) => ({ ...s, [profile.id]: 'sending' }));
    try {
      await sendFriendRequest(profile.id);
      setSendState((s) => ({ ...s, [profile.id]: 'sent' }));
    } catch (err) {
      setSendState((s) => ({ ...s, [profile.id]: 'idle' }));
      setError(
        err instanceof ApiError ? err.message : 'Could not send the request. Please try again.',
      );
    }
  };

  return (
    <div className="fade-in px-5 py-6 md:px-8 md:py-8">
      <BackButton onBack={() => router.push('/friends')} label="Friends" />

      <div className="mx-auto max-w-md">
        <h2
          className="font-display mb-1 text-[1.5rem] font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          Add Friend
        </h2>
        <p className="mb-5 text-[0.85rem]" style={{ color: 'var(--t-dim)' }}>
          Enter your friend&apos;s exact email address or phone number. They&apos;ll need to accept
          your request before you can split expenses.
        </p>

        <form onSubmit={onSearch} className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <Search
              size={17}
              strokeWidth={2}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--t-dim)' }}
            />
            <input
              type="text"
              inputMode="email"
              autoComplete="off"
              className="neo-input pl-11"
              placeholder="friend@example.com"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Friend's email or phone"
            />
          </div>
          <button
            type="submit"
            disabled={!canSearch}
            className="neo-btn-accent font-display rounded-2xl px-5 text-sm font-semibold disabled:opacity-60"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && (
          <p className="mb-4 text-[0.85rem]" role="alert" style={{ color: 'var(--c-red)' }}>
            {error}
          </p>
        )}

        {results && results.length === 0 && (
          <EmptyState
            icon={<UserX size={26} strokeWidth={1.5} />}
            title="No one found"
            description="No ABRO account uses that email or phone. Check it and try again."
          />
        )}

        {results?.map((p) => {
          const state = sendState[p.id] ?? 'idle';
          return (
            <div key={p.id} className="neo-raised flex items-center gap-3 rounded-2xl p-4">
              <Avatar initials={initialsOf(p.displayName)} color={colorForId(p.id)} size={44} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[0.95rem] font-semibold"
                  style={{ color: 'var(--t-primary)' }}
                >
                  {p.displayName}
                </p>
                {p.email && (
                  <p className="truncate text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
                    {p.email}
                  </p>
                )}
              </div>
              {state === 'sent' ? (
                <span
                  className="flex items-center gap-1 text-[0.82rem] font-semibold"
                  style={{ color: 'var(--c-green)' }}
                >
                  <Check size={16} strokeWidth={2.25} />
                  Request sent
                </span>
              ) : (
                <button
                  onClick={() => onSend(p)}
                  disabled={state === 'sending'}
                  className="neo-btn-accent font-display flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  <UserPlus size={16} strokeWidth={2.25} />
                  {state === 'sending' ? 'Sending…' : 'Add'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
