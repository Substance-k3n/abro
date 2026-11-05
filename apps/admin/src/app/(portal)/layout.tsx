'use client';

// Every signed-in portal page: checks the session once, then renders the
// sidebar shell. Signed out -> /signin (back here after). Signed in but
// not an admin -> a plain refusal with a sign-out button, so a PWA
// account that wandered in isn't left with a live session here.

import { ShieldAlert } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Shell } from '~/components/Shell';
import { type AdminMe, getMe, signOut } from '~/lib/admin-api';
import { ApiError, SIGNED_OUT } from '~/lib/api';
import { type Session, SessionContext } from '~/lib/session';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; me: AdminMe }
  | { kind: 'not-admin' }
  | { kind: 'error'; message: string };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ kind: 'loading' });
  // Read at sign-out time, so navigating doesn't re-run the session check.
  const path = useRef(pathname);
  path.current = pathname;

  const load = useCallback(async () => {
    try {
      setState({ kind: 'ready', me: await getMe() });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && SIGNED_OUT.has(err.code)) {
        const why = (err.details as { reason?: string } | undefined)?.reason;
        router.replace(
          `/signin?next=${encodeURIComponent(path.current)}${why ? `&why=${encodeURIComponent(why)}` : ''}`,
        );
        return;
      }
      if (err instanceof ApiError && err.code === 'NOT_ADMIN') {
        setState({ kind: 'not-admin' });
        return;
      }
      setState({
        kind: 'error',
        message: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const session = useMemo<Session | null>(
    () =>
      state.kind === 'ready'
        ? { ...state.me, can: (p) => state.me.permissions.includes(p), reload: load }
        : null,
    [state, load],
  );

  if (state.kind === 'loading') {
    return (
      <div className="bg-page flex min-h-screen items-center justify-center">
        <div className="text-ink-3 flex items-center gap-3 text-sm">
          <span className="border-line-strong border-t-accent size-4 animate-spin rounded-full border-2" />
          Opening the admin portal…
        </div>
      </div>
    );
  }
  if (state.kind === 'not-admin' || state.kind === 'error') {
    return (
      <div className="bg-side flex min-h-screen items-center justify-center p-6">
        <div className="card w-full max-w-md p-8 text-center">
          <ShieldAlert className="text-bad mx-auto size-10" aria-hidden />
          <h1 className="font-display mt-4 text-xl font-semibold">
            {state.kind === 'not-admin'
              ? "This account isn't an ABRO admin"
              : "Couldn't open the portal"}
          </h1>
          <p className="text-ink-2 mt-2 text-sm">
            {state.kind === 'not-admin'
              ? 'Ask a super admin to give your account a role, then sign in again.'
              : state.message}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {state.kind === 'error' && (
              <button type="button" className="btn btn-primary" onClick={() => void load()}>
                Try again
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                await signOut().catch(() => {});
                router.replace('/signin');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={session}>
      <Shell>{children}</Shell>
    </SessionContext.Provider>
  );
}
