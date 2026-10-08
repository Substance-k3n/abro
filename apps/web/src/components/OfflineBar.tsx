'use client';

// "Offline -- showing saved data" (ADR-022): a slim bar at the top of the
// signed-in screens while the device has no connection. Screens keep
// showing the last data they saved; changing anything waits for the
// connection (it fails with "You're offline"). When the connection comes
// back, every screen re-checks the server.

import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { markApiCacheStale } from '~/lib/api-client';

export function OfflineBar() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const backOnline = () => {
      update();
      markApiCacheStale();
    };
    update();
    window.addEventListener('offline', update);
    window.addEventListener('online', backOnline);
    return () => {
      window.removeEventListener('offline', update);
      window.removeEventListener('online', backOnline);
    };
  }, []);

  if (!offline) {
    return null;
  }
  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-1.5 text-[0.75rem] font-medium"
      style={{ background: 'var(--amber-soft)', color: '#1f1300' }}
    >
      <WifiOff size={13} strokeWidth={2.2} aria-hidden />
      Offline. Showing your saved data.
    </div>
  );
}
