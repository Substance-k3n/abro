'use client';

// Phase 8 (docs/WIRING_PLAN.md) -- not an ABRO_FRONTEND_SPEC.md screen
// (no AUTH-0x number). Exists because Google's OAuth redirect
// (apps/api/internal/auth/router.go's googleCallback) lands here after
// already setting the session cookie -- a plain HTTP redirect can't
// carry "is this a new profile" as data the way the OTP path's own
// client-side verifyOtp() response can, so this page's only job is to
// call GET /auth/me and apply the same postSignInPath() routing rule
// the OTP flow uses (~/lib/auth-api.ts), just from a session that
// already exists instead of one just created client-side.
//
// A failed/expired OAuth attempt never reaches this page at all --
// googleCallback redirects those straight to /auth/signin?error=
// oauth_state instead, so there's no error state to handle here.

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { me, postSignInPath } from '~/lib/auth-api';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    me()
      .then((profile) => router.replace(postSignInPath(profile)))
      .catch(() => router.replace('/auth/signin'));
  }, [router]);

  return (
    <main className="fade-in flex min-h-screen flex-col items-center justify-center px-7">
      <div
        className="h-8 w-8 rounded-full border-2"
        style={{
          borderColor: 'rgba(99,102,241,0.3)',
          borderTopColor: 'var(--accent)',
          animation: 'spin 0.7s linear infinite',
        }}
        aria-label="Signing you in"
      />
    </main>
  );
}
