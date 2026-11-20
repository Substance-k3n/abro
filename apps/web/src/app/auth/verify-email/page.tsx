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
//
// The address is shown masked (maskEmail in ~/lib/format.ts) -- enough to
// recognize which inbox to check without printing it in full on screen.

import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import {
  AuthCard,
  AuthHeading,
  AuthShell,
  BrandTile,
  ErrorNote,
} from '~/components/auth/AuthShell';
import { ApiError } from '~/lib/api-client';
import { postSignInPath, requestOtp, verifyOtp } from '~/lib/auth-api';
import { maskEmail } from '~/lib/format';

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
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, email]);

  // After a wrong code the boxes are emptied; put the cursor back in the
  // first one. Done here, once they are enabled again: calling focus() from
  // the failure handler ran while they were still disabled and did nothing.
  useEffect(() => {
    if (!verifying && otp.every((digit) => !digit)) {
      inputRefs.current[0]?.focus();
    }
  }, [verifying, otp]);

  // Spreads digits across the boxes from `start`: a pasted code, or a phone
  // offering the emailed code in one go (autoComplete="one-time-code"), both
  // arrive as several characters in a single box. Typing one digit at a time
  // is the same call with one digit.
  const fillFrom = (start: number, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6 - start);
    if (!digits) {
      return;
    }
    const next = [...otp];
    [...digits].forEach((digit, i) => {
      next[start + i] = digit;
    });
    setOtp(next);
    inputRefs.current[Math.min(start + digits.length, 5)]?.focus();
  };

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      fillFrom(index, value);
      return;
    }
    if (!/^\d*$/.test(value)) {
      return;
    }
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text');
    // A whole code always starts at the first box, wherever focus was.
    fillFrom(text.replace(/\D/g, '').length >= 6 ? 0 : index, text);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
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
    <AuthShell>
      <BrandTile icon={<Mail size={30} strokeWidth={1.7} />} />
      <AuthHeading title="Check your email">
        We sent a 6-digit code to{' '}
        <strong style={{ color: 'var(--t-primary)' }}>{maskEmail(email)}</strong>
      </AuthHeading>

      <AuthCard>
        <div className="flex flex-col gap-5">
          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="grid grid-cols-6 gap-2" role="group" aria-label="6-digit code">
            {otp.map((digit, index) => (
              <input
                // Fixed 6-slot positional layout that never reorders — index is the
                // correct, stable identity for "digit N of the code", not a code smell here.
                key={`otp-digit-${index}`}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                className={`otp-box ${digit ? 'otp-box-filled' : ''}`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus={index === 0}
                value={digit}
                disabled={verifying}
                onChange={(e) => handleChange(index, e.target.value)}
                onPaste={(e) => handlePaste(index, e)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onFocus={(e) => e.target.select()}
                aria-label={`Digit ${index + 1} of 6`}
              />
            ))}
          </div>

          <p
            className="flex min-h-[1.25rem] items-center justify-center gap-2 text-center text-[0.82rem]"
            style={{ color: 'var(--t-muted)' }}
            aria-live="polite"
          >
            {verifying ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden /> Checking your code…
              </>
            ) : (
              'The code is entered automatically once all 6 digits are in.'
            )}
          </p>

          <div
            className="flex items-center justify-between border-t pt-4 text-[0.82rem]"
            style={{ borderColor: 'var(--hairline)' }}
          >
            <button
              type="button"
              onClick={resend}
              disabled={cooldown > 0}
              className="font-semibold disabled:opacity-50"
              style={{ color: 'var(--accent)' }}
            >
              {cooldown > 0
                ? `Resend code (0:${cooldown.toString().padStart(2, '0')})`
                : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/auth/signin?email=${encodeURIComponent(email)}`)}
              className="inline-flex items-center gap-1 font-medium"
              style={{ color: 'var(--t-muted)' }}
            >
              <ArrowLeft size={14} strokeWidth={2} aria-hidden /> Change email
            </button>
          </div>
        </div>
      </AuthCard>

      <p className="mt-5 text-center text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
        Nothing yet? Check your spam or promotions folder.
      </p>
    </AuthShell>
  );
}
