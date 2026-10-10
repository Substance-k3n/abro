'use client';

// Ekub list (ADR-024): the rotating savings groups you're in, with
// invitations first. Reached from the Groups screen on a phone and from
// the sidebar on desktop. Joining or declining happens on the ekub's own
// screen, where you can see your turn and amount first.

import { EmptyState, SectionLabel } from '@abro/ui';
import { ArrowLeft, PiggyBank, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { cadenceLabel, ekubMoney } from '~/lib/ekub-view';
import { type Ekub, listEkubs } from '~/lib/ekubs-api';
import { useApiRefresh } from '~/lib/use-api-refresh';

function EkubCard({ ekub }: { ekub: Ekub }) {
  const invited = ekub.myStatus === 'INVITED';
  return (
    <Link
      href={`/ekub/${ekub.id}`}
      className="neo-raised flex items-center gap-3.5 rounded-[20px] p-4"
    >
      <div
        className="neo-raised-sm flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl"
        style={{ color: 'var(--accent)' }}
      >
        <PiggyBank size={24} strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <p
            className="font-display truncate text-[0.95rem] font-bold tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            {ekub.name}
          </p>
          <span
            className="neo-flat shrink-0 rounded-lg px-2 py-0.5 text-[0.68rem] font-semibold"
            style={{ color: invited ? 'var(--accent)' : 'var(--t-muted)' }}
          >
            {invited ? 'Invited' : ekub.status === 'DRAFT' ? 'Not started' : 'Running'}
          </span>
        </div>
        <p className="text-[0.75rem]" style={{ color: 'var(--t-dim)' }}>
          {ekubMoney(ekub.slotAmount, ekub)} a turn, {cadenceLabel(ekub.cadence)} ·{' '}
          {ekub.memberCount} {ekub.memberCount === 1 ? 'person' : 'people'}
        </p>
      </div>
    </Link>
  );
}

export default function EkubListPage() {
  const [ekubs, setEkubs] = useState<Ekub[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    listEkubs()
      .then(setEkubs)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load your ekubs.'),
      );
  };
  useEffect(load, []);
  useApiRefresh(load);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!ekubs) {
    return <LoadingState />;
  }

  const invites = ekubs.filter((e) => e.myStatus === 'INVITED');
  const mine = ekubs.filter((e) => e.myStatus !== 'INVITED');

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-4xl md:px-8 md:py-8">
      <Link
        href="/groups"
        className="mb-3 flex items-center gap-1 text-[0.85rem] font-medium md:hidden"
        style={{ color: 'var(--accent)' }}
      >
        <ArrowLeft size={16} strokeWidth={2} /> Groups
      </Link>
      <div className="mb-2 flex items-center justify-between">
        <h2
          className="font-display text-[1.5rem] font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          Ekub
        </h2>
        <Link
          href="/ekub/new"
          className="neo-btn-accent flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[0.8rem] font-semibold"
        >
          <Plus size={14} strokeWidth={2.5} />
          New Ekub
        </Link>
      </div>
      <p className="mb-6 text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
        Everyone puts in every round and one turn takes the pot. ABRO keeps track of who has paid;
        the money moves between you.
      </p>

      {invites.length > 0 && (
        <div className="mb-6">
          <SectionLabel>Invitations ({invites.length})</SectionLabel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {invites.map((e) => (
              <EkubCard key={e.id} ekub={e} />
            ))}
          </div>
        </div>
      )}

      {mine.length === 0 ? (
        invites.length === 0 && (
          <EmptyState
            icon={<PiggyBank size={26} strokeWidth={1.5} />}
            title="No ekubs yet"
            description="Start one with your friends: set the amount, the turns and the order."
          />
        )
      ) : (
        <div>
          <SectionLabel>Your ekubs</SectionLabel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {mine.map((e) => (
              <EkubCard key={e.id} ekub={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
