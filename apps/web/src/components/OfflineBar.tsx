'use client';

// The connection bar at the top of the signed-in screens (ADR-022):
//  - No internet (~/lib/connection.ts -- the browser says so, or a request
//    found no internet even though the phone is on Wi-Fi or data):
//    "No internet connection", and the screens keep showing the data they
//    saved. Changing anything waits for the connection.
//  - Slow: the internet works but ABRO hasn't answered yet (the free-tier
//    API waking up) -- "Slow connection, still trying".
// When the internet comes back every screen re-checks the server
// (lib/api-client.ts) and the bar goes away.

import { Loader2, WifiOff } from 'lucide-react';

import { useConnection } from '~/lib/connection';

export function OfflineBar() {
  const status = useConnection();

  if (status === 'online') {
    return null;
  }
  const offline = status === 'offline';
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-1.5 text-[0.75rem] font-medium"
      style={{
        background: offline ? 'var(--amber-soft)' : 'var(--neo-bg2)',
        color: offline ? '#1f1300' : 'var(--t-secondary)',
      }}
    >
      {offline ? (
        <>
          <WifiOff size={13} strokeWidth={2.2} aria-hidden />
          No internet connection. You can still see saved data.
        </>
      ) : (
        <>
          <Loader2 size={13} strokeWidth={2.2} className="animate-spin" aria-hidden />
          Slow connection. Still trying…
        </>
      )}
    </div>
  );
}
