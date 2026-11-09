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
// `?error=<reason>` is apps/api's googleCallback redirecting back here
// after a failed Google attempt (router.go): oauth_state (state
// mismatch/expired), google_cancelled (Cancel on Google's screen),
// google_unverified, suspended (ADR-028), or google (anything else). Shown as a plain error
// banner, not a toast/modal (no toast system exists yet anywhere in this
// app).

import { Logomark } from '@abro/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { ApiError, googleSignInUrl } from '~/lib/api-client';
import { requestOtp } from '~/lib/auth-api';

// Google's actual four-color "G" glyph (brand guideline SVG, not a
// styled letter) -- a text "G" read as a placeholder, not a real
// sign-in option.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: 'Google sign-in expired. Please try again.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_unverified:
    'Your Google account email is not verified. Verify it with Google, or use email sign-in.',
  google: 'Google sign-in failed. Please try again.',
  suspended: "This account is suspended. Contact ABRO support if you think it's a mistake.",
};

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
  const errorParam = searchParams.get('error');
  const oauthError = errorParam ? (OAUTH_ERRORS[errorParam] ?? OAUTH_ERRORS.google) : null;

  // Prefilled when bounced back here from verify-email's "wrong email" link.
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
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
    <main className="flex min-h-screen flex-col px-5 py-12 sm:items-center sm:justify-center sm:py-16">
      <div className="mx-auto w-full max-w-[380px]">
        <div className="mb-9 flex flex-col items-center text-center sm:mb-11">
          <Logomark size={48} className="mb-6" />
          <h2
            className="font-display text-[2.1rem] font-bold leading-[1.1] tracking-tight"
            style={{ color: 'var(--t-primary)' }}
          >
            Welcome back
          </h2>
          <p className="mt-2 text-[0.92rem]" style={{ color: 'var(--t-muted)' }}>
            Sign in to your ABRO account
          </p>
        </div>

        {/* The one card on an otherwise bare screen -- real structure
            instead of a form floating on the page, with a thin top
            accent (a ledger tab, not a gradient) as the single
            deliberate brand touch. */}
        <div className="neo-raised-lg overflow-hidden rounded-[28px]">
          <div className="h-[3px]" style={{ background: 'var(--accent)' }} />
          <form onSubmit={submit} className="flex flex-col gap-4 p-7 sm:p-8">
            <a
              href={googleSignInUrl()}
              className="neo-btn flex items-center justify-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold"
              style={{ color: 'var(--t-secondary)' }}
            >
              <GoogleIcon /> Continue with Google
            </a>

            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--t-dim)' }}>
              <div className="h-px flex-1" style={{ background: 'var(--border-med)' }} />
              or sign in with email
              <div className="h-px flex-1" style={{ background: 'var(--border-med)' }} />
            </div>

            {(oauthError || error) && (
              <p
                className="rounded-xl px-3.5 py-2.5 text-center text-[0.8rem] font-medium"
                style={{ color: 'var(--c-red-text)', background: 'var(--red-bg)' }}
              >
                {error ?? oauthError}
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
              className="neo-btn-accent font-display mt-1 rounded-[18px] px-4 py-4 text-base font-semibold"
            >
              {submitting ? 'Sending code…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
