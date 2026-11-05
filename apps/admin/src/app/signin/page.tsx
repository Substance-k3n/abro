'use client';

// Portal sign-in: the same email codes as the PWA (apps/api/internal/
// auth), with a session that belongs to this site only. No Google button:
// Google's callback returns to the PWA, not here. After the code, the
// account must be an admin (GET /admin/me); if it isn't, it's signed
// straight back out, so no non-admin session is left on the admin site.

import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { getMe, requestCode, signOut, verifyCode } from '~/lib/admin-api';
import { ApiError } from '~/lib/api';
import { safeNext } from '~/lib/session';

const RESEND_AFTER_S = 60;

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
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

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
      setCode('');
      setWait(RESEND_AFTER_S);
      setTimeout(() => codeRef.current?.focus(), 0);
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
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-side flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display text-4xl font-semibold tracking-tight text-white">ABRO</div>
          <div className="text-side-muted mt-1 text-sm">Admin Portal</div>
        </div>
        <div className="card p-7 shadow-2xl shadow-black/30">
          {step === 'email' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <h1 className="font-display text-xl font-semibold">Sign in</h1>
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
                if (code.length === 6) {
                  void verify(code);
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
              <h1 className="font-display mt-3 text-xl font-semibold">Enter your code</h1>
              <p className="text-ink-3 mt-1 text-sm">
                Sent to <span className="text-ink font-medium">{email.trim().toLowerCase()}</span>
              </p>
              <label htmlFor="code" className="label mt-6 block">
                6-digit code
              </label>
              <input
                id="code"
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="input mt-1.5 text-center font-mono text-xl tracking-[0.5em]"
                value={code}
                disabled={busy}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(v);
                  if (v.length === 6) {
                    void verify(v);
                  }
                }}
              />
              {error && (
                <p role="alert" className="bg-bad-soft text-bad mt-4 rounded-lg px-3 py-2 text-sm">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="btn btn-primary mt-6 w-full"
                disabled={busy || code.length !== 6}
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
        <p className="text-side-muted mt-6 flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" aria-hidden /> Every admin action is recorded.
        </p>
      </div>
    </div>
  );
}
