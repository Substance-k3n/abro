'use client';

// AUTH-04 (Sign In) — docs/ABRO_FRONTEND_SPEC.md §2. Also stands in for
// AUTH-03 (Sign up): the prototype converges both into one screen, with
// "Sign up" leading to the same OTP step as "Sign In" — ported as designed.
//
// "Continue with Google" and "Forgot password?" are inert here, matching
// the prototype (no handler in the source) — real auth logic lands in
// Phase 8 once apps/api's auth module exists.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const continueToOtp = (event: React.FormEvent) => {
    event.preventDefault();
    router.push('/auth/verify-email');
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

        <form onSubmit={continueToOtp} className="flex flex-col gap-4">
          <button
            type="button"
            className="neo-btn flex items-center justify-center gap-2.5 rounded-2xl px-4 py-3.5 text-sm font-medium"
            style={{ color: 'var(--t-secondary)' }}
          >
            <span className="text-lg">G</span> Continue with Google
          </button>

          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--t-dim)' }}>
            <div className="h-px flex-1" style={{ background: 'var(--neo-dark)', opacity: 0.5 }} />
            or
            <div className="h-px flex-1" style={{ background: 'var(--neo-dark)', opacity: 0.5 }} />
          </div>

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

          <div>
            <label
              htmlFor="password"
              className="mb-2 block pl-1 text-[0.8rem] font-semibold"
              style={{ color: 'var(--t-muted)' }}
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                className="neo-input pr-12"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[0.85rem]"
                style={{ color: 'var(--t-dim)' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="button"
            className="self-end text-[0.8rem] font-medium"
            style={{ color: 'var(--accent)' }}
          >
            Forgot password?
          </button>

          <button
            type="submit"
            className="neo-btn-accent font-display mt-1 rounded-[18px] px-4 py-4 text-base font-semibold"
          >
            Sign In
          </button>

          <p className="text-center text-[0.85rem]" style={{ color: 'var(--t-muted)' }}>
            Don&apos;t have an account?{' '}
            <Link
              href="/auth/verify-email"
              className="font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
