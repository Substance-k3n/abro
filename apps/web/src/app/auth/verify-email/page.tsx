'use client';

// AUTH-05 (Email OTP Verification) — docs/ABRO_FRONTEND_SPEC.md §2.
// Auto-advances focus per digit, auto-submits once all 6 digits are
// filled -- unchanged UX from the mock version.
//
// Phase 8 rewiring (docs/WIRING_PLAN.md): auto-submit now calls the real
// POST /auth/otp/verify (~/lib/auth-api.ts). On success, routes via
// postSignInPath() -- /auth/setup-profile for a profile with no username
// yet, /home otherwise -- rather than always going to setup-profile like
// the mock version did. A wrong/expired code clears the boxes and shows
// apps/api's own error message (OTP_INCORRECT/OTP_EXPIRED/OTP_LOCKED,
// see apps/api/internal/auth/service.go) instead of silently doing
// nothing. Resend now calls the real POST /auth/otp/request again,
// respecting apps/api's 60s cooldown (OTP_COOLDOWN) by disabling the
// button for that long client-side too, so the real 429 is the
// exception path, not the expected one.
//
// No email in the query string when this screen is reached without one
// (shouldn't happen now that signin always collects an email first, but
// kept as a defensive fallback rather than crashing) -- redirects back
// to sign-in, since there's no code to verify without an address it was
// sent to.

import { Mail } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { ApiError } from '~/lib/api-client';
import { postSignInPath, requestOtp, verifyOtp } from '~/lib/auth-api';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) {
      router.replace('/auth/signin');
    }
  }, [email, router]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!email || verifying || !otp.every((digit) => digit)) {
      return;
    }
    const code = otp.join('');
    setVerifying(true);
    setError(null);
    verifyOtp(email, code)
      .then((profile) => router.push(postSignInPath(profile)))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
        setOtp(['', '', '', '', '', '']);
        setVerifying(false);
        inputRefs.current[0]?.focus();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, email]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) {
      return;
    }
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const resend = async () => {
    if (!email || cooldown > 0) {
      return;
    }
    setError(null);
    try {
      await requestOtp(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  if (!email) {
    return null;
  }

  return (
    <main className="fade-in flex min-h-screen flex-col items-center px-7 py-16 sm:py-20">
      <div
        className="neo-raised-lg mb-7 flex h-[72px] w-[72px] items-center justify-center rounded-[24px]"
        aria-hidden
      >
        <Mail size={32} strokeWidth={1.5} color="var(--accent)" />
      </div>

      <h2
        className="font-display text-center text-[1.8rem] font-bold tracking-tight"
        style={{ color: 'var(--t-primary)' }}
      >
        Check your email
      </h2>
      <p
        className="mb-6 mt-2 text-center text-sm leading-relaxed"
        style={{ color: 'var(--t-muted)' }}
      >
        We sent a 6-digit code to
        <br />
        <strong style={{ color: 'var(--t-secondary)' }}>{email}</strong>
      </p>

      {error && (
        <p className="mb-4 text-center text-[0.8rem] font-medium" style={{ color: 'var(--c-red)' }}>
          {error}
        </p>
      )}

      <div className="mb-8 flex gap-2.5">
        {otp.map((digit, index) => (
          <input
            // Fixed 6-slot positional layout that never reorders — index is the
            // correct, stable identity for "digit N of the code", not a code smell here.
            key={`otp-digit-${index}`}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            className="otp-box"
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={verifying}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            aria-label={`Digit ${index + 1} of 6`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={resend}
        disabled={cooldown > 0}
        className="text-[0.85rem] font-medium disabled:opacity-50"
        style={{ color: 'var(--accent)' }}
      >
        {cooldown > 0 ? `Resend code (0:${cooldown.toString().padStart(2, '0')})` : 'Resend code'}
      </button>
    </main>
  );
}
