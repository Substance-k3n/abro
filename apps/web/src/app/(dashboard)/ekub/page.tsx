'use client';

// Ekub list (ADR-024): the rotating savings groups you're in, with
// invitations first. Reached from the Groups screen on a phone and from
// the sidebar on desktop. Joining or declining happens on the ekub's own
// screen, where you can see your turn and amount first.
//
// Redesigned 2026-11-19 (Stitch "Terracotta Kin"): running ekubs show round
// progress, which needs each one's detail. A detail that fails to load
// drops that ekub to a plain row instead of failing the page. The layout
// lives in ~/components/ekub/EkubListView.

import { useEffect, useState } from 'react';

import { EkubListView, type EkubListViewProps } from '~/components/ekub/EkubListView';
import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { loadRunningEkubs, toEkubCard } from '~/lib/ekub-card';
import { listEkubs } from '~/lib/ekubs-api';
import { useApiRefresh } from '~/lib/use-api-refresh';

export default function EkubListPage() {
  const [view, setView] = useState<EkubListViewProps | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    listEkubs()
      .then(async (ekubs) => {
        const details = await loadRunningEkubs(ekubs);
        const shown = new Set(details.map((d) => d.id));
        setView({
          running: details.map(toEkubCard),
          invites: ekubs.filter((e) => e.myStatus === 'INVITED'),
          others: ekubs.filter((e) => e.myStatus !== 'INVITED' && !shown.has(e.id)),
        });
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load your ekubs.'),
      );
  };
  useEffect(load, []);
  useApiRefresh(load);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!view) {
    return <LoadingState />;
  }
  return <EkubListView {...view} />;
}
