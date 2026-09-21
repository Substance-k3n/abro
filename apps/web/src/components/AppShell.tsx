import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

/** Wraps every route under the `(dashboard)` route group: sidebar nav on
 * desktop, fixed bottom nav on mobile, per
 * docs/ABRO_FRONTEND_SPEC.md §11's responsive requirements. The one
 * shared chrome piece Phase 1 left unbuilt ("AppShell + BottomNav") --
 * finished here now that Phase 3 has real routes for it to wrap. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen md:flex-row">
      <Sidebar />
      <main className="hide-scroll min-h-screen flex-1 overflow-y-auto pb-28 md:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
