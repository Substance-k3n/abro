'use client';

// Portal sign-in: the same email codes as the PWA (apps/api/internal/
// auth), with a session that belongs to this site only. No Google button:
// Google's callback returns to the PWA, not here. After the code, the
// account must be an admin (GET /admin/me); if it isn't, it's signed
// straight back out, so no non-admin session is left on the admin site.

import { Logomark } from '@abro/ui';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { getMe, requestCode, signOut, verifyCode } from '~/lib/admin-api';
import { ApiError } from '~/lib/api';
import { safeNext } from '~/lib/session';

const RESEND_AFTER_S = 60;
const EMPTY_CODE = ['', '', '', '', '', ''];

// Why the portal sent you here (?why=, from apps/api's session limits or
// the portal's own idle lock).
const WHY: Record<string, string> = {
  idle: 'You were signed out after 30 minutes without use.',
  max_age: 'Portal sign-ins last 12 hours. Sign in again to carry on.',
};

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const why = WHY[params.get('why') ?? ''];
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState<string[]>(EMPTY_CODE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Already signed in as an admin: straight in.
  useEffect(() => {
    getMe()
      .then(() => router.replace(next))
      .catch(() => {});
  }, [router, next]);

  useEffect(() => {
    if (wait <= 0) {
      return;
    }
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestCode(email.trim().toLowerCase());
      setStep('code');
      setCode(EMPTY_CODE);
      setWait(RESEND_AFTER_S);
      setTimeout(() => digitRefs.current[0]?.focus(), 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email.trim().toLowerCase(), value);
      try {
        await getMe();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NOT_ADMIN') {
          await signOut().catch(() => {});
          setError("This account isn't an ABRO admin. Ask a super admin for a role.");
          setStep('email');
          return;
        }
        throw err;
      }
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
      setCode(EMPTY_CODE);
      digitRefs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) {
      return;
    }
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    if (value && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
    if (next.every((d) => d)) {
      void verify(next.join(''));
    }
  };

  const onDigitKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Brand panel -- its own full surface, not a card floating on it. */}
      <div className="bg-side grid-texture relative flex shrink-0 items-center justify-center overflow-hidden px-6 py-14 md:w-[42%] md:py-0">
        <div className="relative flex flex-col items-center gap-3 text-center">
          <Logomark size={44} />
          <div className="font-display text-2xl font-semibold tracking-tight text-white">abro</div>
          <div className="text-side-muted -mt-1 text-sm">Admin Portal</div>
          <p className="text-side-muted mt-10 flex items-center justify-center gap-1.5 text-xs">
            <ShieldCheck className="size-3.5" aria-hidden /> Every admin action is recorded.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 md:py-0">
        <div className="w-full max-w-sm">
          {step === 'email' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <h1 className="font-display text-2xl font-semibold">Sign in</h1>
              <p className="text-ink-3 mt-1 text-sm">We&apos;ll email you a 6-digit code.</p>
              {why && !error && (
                <p
                  role="status"
                  className="bg-warn-soft text-warn mt-4 rounded-lg px-3 py-2 text-sm"
                >
                  {why}
                </p>
              )}
              <label htmlFor="email" className="label mt-6 block">
                Email
              </label>
              <div className="relative mt-1.5">
                <Mail
                  className="text-ink-3 pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  className="input pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {error && (
                <p role="alert" className="bg-bad-soft text-bad mt-4 rounded-lg px-3 py-2 text-sm">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="btn btn-primary mt-6 w-full"
                disabled={busy || !email.trim()}
              >
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (code.every((d) => d)) {
                  void verify(code.join(''));
                }
              }}
            >
              <button
                type="button"
                className="text-ink-3 hover:text-ink -ml-1 inline-flex items-center gap-1 text-sm"
                onClick={() => {
                  setStep('email');
                  setError(null);
                }}
              >
                <ArrowLeft className="size-4" aria-hidden /> Change email
              </button>
              <h1 className="font-display mt-3 text-2xl font-semibold">Enter your code</h1>
              <p className="text-ink-3 mt-1 text-sm">
                Sent to <span className="text-ink font-medium">{email.trim().toLowerCase()}</span>
              </p>
              <span className="label mt-6 block">6-digit code</span>
              <div className="mt-1.5 flex justify-between gap-2">
                {code.map((digit, index) => (
                  <input
                    key={`code-digit-${index}`}
                    ref={(el) => {
                      digitRefs.current[index] = el;
                    }}
                    inputMode="numeric"
                    maxLength={1}
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${index + 1} of 6`}
                    className="border-line-strong text-ink focus:border-accent focus:ring-accent/20 h-12 w-11 rounded-lg border bg-white text-center font-mono text-lg font-semibold outline-none focus:ring-2 disabled:opacity-60"
                    value={digit}
                    disabled={busy}
                    onChange={(e) => setDigit(index, e.target.value)}
                    onKeyDown={(e) => onDigitKeyDown(index, e)}
                  />
                ))}
              </div>
              {error && (
                <p role="alert" className="bg-bad-soft text-bad mt-4 rounded-lg px-3 py-2 text-sm">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="btn btn-primary mt-6 w-full"
                disabled={busy || code.some((d) => !d)}
              >
                {busy ? 'Checking…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="text-accent disabled:text-ink-3 mt-3 w-full text-sm font-medium"
                disabled={busy || wait > 0}
                onClick={() => void send()}
              >
                {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
