import { BottomNav } from './BottomNav';
import { OfflineBar } from './OfflineBar';
import { PrefetchTabs } from './PrefetchTabs';
import { PullToRefresh } from './PullToRefresh';
import { Sidebar } from './Sidebar';

/** Wraps every route under the `(dashboard)` route group: sidebar nav on
 * desktop, fixed bottom nav on mobile, per
 * docs/ABRO_FRONTEND_SPEC.md §11's responsive requirements. The one
 * shared chrome piece Phase 1 left unbuilt ("AppShell + BottomNav") --
 * finished here now that Phase 3 has real routes for it to wrap.
 *
 * The page itself scrolls, not <main>: <main> used to be its own
 * scroll box (overflow-y-auto) with scroll chaining turned off
 * (overscroll-none) while never actually overflowing, and on Android
 * (Samsung Internet, Chrome) a one-finger swipe landed on it and went
 * nowhere -- scrolling took two fingers (trial feedback 2026-10-07). */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen md:flex-row">
      <Sidebar />
      <main className="min-h-screen min-w-0 flex-1 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-0">
        <OfflineBar />
        <PullToRefresh>{children}</PullToRefresh>
      </main>
      <BottomNav />
      <PrefetchTabs />
    </div>
  );
}
