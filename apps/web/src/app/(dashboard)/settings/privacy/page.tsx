'use client';

// SET-03 Privacy & Security -- docs/ABRO_FRONTEND_SPEC.md §7 (lines
// 1898-1941). Reached from SET-01's "Privacy & security" row. Phase 8
// slice 10b: trimmed to what's real (user decision 2026-09-29).
//
// Shown:
//  - How you sign in: the account's email, with ABRO's methods (a
//    one-time email code, or Google with the same email -- ADR-004).
//    There's no password, so there's nothing to change or reset.
//  - What others can see, as apps/api actually enforces it: friends
//    find you by exact email/phone search; only people on an expense
//    (or in its group) can see it.
//  - Sign out of this device (POST /auth/logout).
//
// Dropped until they're real server-side: change password (none
// exists), two-factor authentication, the active-sessions list, profile
// visibility / who-can-add-you / who-can-see-your-expenses selectors,
// and connected-account management (apps/api doesn't record which
// method a session used).

import { ArrowLeft, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { type AuthProfile, logout, me } from '~/lib/auth-api';
import { useApiRefresh } from '~/lib/use-api-refresh';

export default function PrivacySettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    me()
      .then(setProfile)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load your account.'),
      );
  };

  useEffect(load, []);

  useApiRefresh(load);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!profile) {
    return <LoadingState />;
  }

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await logout();
      router.replace('/auth/signin');
    } catch (err) {
      setSignOutError(
        err instanceof ApiError ? err.message : 'Could not sign out. Please try again.',
      );
      setSigningOut(false);
    }
  };

  return (
    <div className="fade-in flex flex-col gap-5 px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/settings')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Settings
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Privacy &amp; Security
        </h2>
        <div className="w-[60px]" />
      </div>

      <Card icon={<KeyRound size={18} strokeWidth={2} />} title="How you sign in">
        <p className="text-[0.85rem]" style={{ color: 'var(--t-primary)' }}>
          {profile.email ?? 'No email on file'}
        </p>
        <p className="text-[0.78rem] leading-relaxed" style={{ color: 'var(--t-muted)' }}>
          ABRO signs you in with a one-time code sent to this email, or with Google using the same
          email. There&apos;s no password to change or leak.
        </p>
      </Card>

      <Card icon={<ShieldCheck size={18} strokeWidth={2} />} title="Who can see what">
        <ul
          className="flex list-disc flex-col gap-1.5 pl-4 text-[0.78rem] leading-relaxed"
          style={{ color: 'var(--t-muted)' }}
        >
          <li>People can find you only by searching your exact email or phone number.</li>
          <li>Someone becomes your friend only after you accept their request.</li>
          <li>An expense is visible only to the people on it, and to the members of its group.</li>
        </ul>
      </Card>

      {signOutError && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {signOutError}
        </p>
      )}
      <button
        onClick={signOut}
        disabled={signingOut}
        className="neo-btn flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[0.9rem] font-semibold disabled:opacity-50"
        style={{ color: 'var(--c-red)' }}
      >
        <LogOut size={17} strokeWidth={2} />{' '}
        {signingOut ? 'Signing out…' : 'Sign out of this device'}
      </button>
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="neo-raised-sm flex flex-col gap-2.5 rounded-3xl p-4">
      <div className="flex items-center gap-2" style={{ color: 'var(--accent)' }}>
        {icon}
        <p className="font-display text-[0.9rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}
