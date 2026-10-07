'use client';

// Warms ~/lib/api-client.ts's read cache with what the bottom-bar tabs
// (Home, Friends, Groups, Activity) and Notifications load, so switching
// tabs shows data straight away instead of a skeleton while each screen
// makes its own round trips (trial feedback 2026-10-07: "it lags moving
// from one page to another"). Runs when the browser is idle after each
// navigation; anything already cached (30s) or in flight is reused, not
// fetched again. The paths must match what each screen asks for exactly,
// since the cache is keyed by path. Failures are ignored here -- the
// screen itself shows the error if it still fails when opened.

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { me } from '~/lib/auth-api';
import { getBalancesSummary } from '~/lib/balances-api';
import { ACTIVITY_PAGE_SIZE, listExpenses } from '~/lib/expenses-api';
import { listFriends, listIncomingRequests } from '~/lib/friends-api';
import { listGroupInvites, listGroups } from '~/lib/groups-api';
import { listNotifications } from '~/lib/notifications-api';

function warm(): void {
  const reads: Promise<unknown>[] = [
    me(),
    getBalancesSummary(),
    listFriends(),
    listIncomingRequests(),
    listGroups(),
    listGroupInvites(),
    listExpenses({ limit: 5 }),
    listExpenses({ limit: ACTIVITY_PAGE_SIZE }),
    listNotifications({ unreadOnly: true, limit: 100 }),
    listNotifications({ limit: 50 }),
  ];
  for (const read of reads) {
    read.catch(() => {});
  }
}

export function PrefetchTabs() {
  const pathname = usePathname();
  useEffect(() => {
    // Let the screen that was just opened make its own requests first.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(warm);
    return () => cancel(handle);
  }, [pathname]);
  return null;
}
