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

import { ArrowRight, Loader2, Lock, Mail } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import {
  AuthCard,
  AuthHeading,
  AuthShell,
  BrandTile,
  ErrorNote,
} from '~/components/auth/AuthShell';
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
    const address = email.trim();
    try {
      await requestOtp(address);
      router.push(`/auth/verify-email?email=${encodeURIComponent(address)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <BrandTile />
      <AuthHeading title="Welcome to ABRO">
        Sign in, or create your account, in one step. No password to remember.
      </AuthHeading>

      <AuthCard>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <a
            href={googleSignInUrl()}
            className="neo-btn flex items-center justify-center gap-3 rounded-2xl px-4 py-3.5 text-[0.9rem] font-semibold"
            style={{ color: 'var(--t-primary)' }}
          >
            <GoogleIcon /> Continue with Google
          </a>

          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--t-dim)' }}>
            <div className="h-px flex-1" style={{ background: 'var(--border-med)' }} />
            or use your email
            <div className="h-px flex-1" style={{ background: 'var(--border-med)' }} />
          </div>

          {(oauthError || error) && <ErrorNote>{error ?? oauthError}</ErrorNote>}

          <div>
            <label
              htmlFor="email"
              className="mb-2 block pl-1 text-[0.8rem] font-semibold"
              style={{ color: 'var(--t-muted)' }}
            >
              Email address
            </label>
            <div className="relative">
              <Mail
                size={18}
                strokeWidth={1.9}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--t-dim)' }}
                aria-hidden
              />
              <input
                id="email"
                className="neo-input pl-11"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="neo-btn-accent font-display flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[0.98rem] font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden /> Sending code…
              </>
            ) : (
              <>
                Continue <ArrowRight size={18} strokeWidth={2.2} aria-hidden />
              </>
            )}
          </button>
        </form>
      </AuthCard>

      <p
        className="mt-5 flex items-center justify-center gap-1.5 text-center text-[0.78rem]"
        style={{ color: 'var(--t-dim)' }}
      >
        <Lock size={13} strokeWidth={2} aria-hidden />
        We will email you a 6-digit code. It takes a few seconds.
      </p>
    </AuthShell>
  );
}
