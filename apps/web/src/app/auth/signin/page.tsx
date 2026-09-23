'use client';

// AUTH-04 (Sign In) — docs/ABRO_FRONTEND_SPEC.md §2. Also stands in for
// AUTH-03 (Sign up): apps/api's auth is email-OTP or Google OAuth only
// (apps/api/internal/auth/service.go) -- there is no separate sign-up
// step or password to collect, so one form serves both, same as the
// mock version's own header comment already said before this rewrite.
//
// Phase 8 rewiring (docs/WIRING_PLAN.md) -- was fully mock: a password
// field with no backend concept to match (removed entirely, since
// keeping it would imply an auth mechanism this app doesn't have), and
// "Continue with Google"/submit did nothing real. Now: submit calls the
// real POST /auth/otp/request (~/lib/auth-api.ts), Google is a real
// full-page navigation to apps/api's OAuth start endpoint (a redirect
// dance, not a fetch -- googleSignInUrl()). "Forgot password?" is gone
// with the password field it belonged to. The removed "Sign up" link
// (which used to skip straight to verify-email with no email collected
// at all) is also gone -- collecting the email here is what makes OTP
// verification possible, so there's no valid shortcut around this form.
//
// `?error=oauth_state` is apps/api's googleCallback redirecting back
// here on a state-mismatch/expired OAuth attempt (router.go) -- shown as
// a plain error banner, not a toast/modal (no toast system exists yet
// anywhere in this app).

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { ApiError, googleSignInUrl } from '~/lib/api-client';
import { requestOtp } from '~/lib/auth-api';

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get('error') === 'oauth_state';

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestOtp(email);
      router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <main className="fade-in flex min-h-screen flex-col px-7 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-9">
          <h2
            className="font-display text-[2rem] font-extrabold tracking-tighter"
            style={{ color: 'var(--t-primary)' }}
          >
            Welcome back
          </h2>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--t-muted)' }}>
            Sign in to your ABRO account
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <a
            href={googleSignInUrl()}
            className="neo-btn flex items-center justify-center gap-2.5 rounded-2xl px-4 py-3.5 text-sm font-medium"
            style={{ color: 'var(--t-secondary)' }}
          >
            <span className="text-lg">G</span> Continue with Google
          </a>

          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--t-dim)' }}>
            <div className="h-px flex-1" style={{ background: 'var(--neo-dark)', opacity: 0.5 }} />
            or
            <div className="h-px flex-1" style={{ background: 'var(--neo-dark)', opacity: 0.5 }} />
          </div>

          {(oauthError || error) && (
            <p className="text-center text-[0.8rem] font-medium" style={{ color: 'var(--c-red)' }}>
              {error ?? 'Google sign-in failed. Please try again.'}
            </p>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-2 block pl-1 text-[0.8rem] font-semibold"
              style={{ color: 'var(--t-muted)' }}
            >
              Email address
            </label>
            <input
              id="email"
              className="neo-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="neo-btn-accent font-display mt-1 rounded-[18px] px-4 py-4 text-base font-semibold disabled:opacity-60"
          >
            {submitting ? 'Sending code…' : 'Continue'}
          </button>
        </form>
      </div>
    </main>
  );
}
