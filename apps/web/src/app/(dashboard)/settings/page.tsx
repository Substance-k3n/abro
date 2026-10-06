'use client';

// SET-01 Settings -- docs/ABRO_FRONTEND_SPEC.md §7 (lines 1802-1855).
// Reached from PRF-01's "App settings" row. Phase 8 slice 10b: only
// settings that are real (stored by apps/api, or with a real effect).
//
// Deviations (Confirmed):
//  - Account: Profile and one "Privacy & security" row (the spec's
//    single combined /settings/privacy route).
//  - Preferences: currency and language are edited on PRF-01 -- one
//    home for those profile fields, linked from here with their current
//    values -- rather than a second copy of the same form.
//  - Date/number format are dropped: nothing formats by a configurable
//    format, and apps/api stores neither.
//  - Notifications: a link to SET-02 (per-type in-app notifications).
//    The push/email channel toggles are dropped: apps/api has no push or
//    email notifications to switch.
//  - Data (export, clear cache, storage usage) is dropped -- export is
//    deferred (user decision 2026-09-29), and there's no client cache.
//  - About: version mirrors apps/web/package.json. Terms / privacy
//    policy / support pages don't exist yet, so they're not listed.
//  - Sign out really ends the session (POST /auth/logout) before going
//    to sign-in; delete account is deferred (user decision).

import { ArrowLeft, ChevronRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { InstallApp } from '~/components/InstallApp';
import { ApiError } from '~/lib/api-client';
import { type AuthProfile, logout, me } from '~/lib/auth-api';
import { useInstallState } from '~/lib/pwa';

const APP_VERSION = '0.1.0';
const LANGUAGE_LABELS: Record<string, string> = { en: 'English', am: 'Amharic' };

export default function SettingsPage() {
  const router = useRouter();
  const installState = useInstallState();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    // Only for the Preferences summary; the page works without it.
    me()
      .then(setProfile)
      .catch(() => {});
  }, []);

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
          onClick={() => router.push('/profile')}
          className="flex items-center gap-1 text-[0.85rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> Profile
        </button>
        <h2 className="font-display text-[1.05rem] font-bold" style={{ color: 'var(--t-primary)' }}>
          Settings
        </h2>
        <div className="w-[52px]" />
      </div>

      <Section title="Account">
        <NavRow label="Profile" href="/profile" />
        <NavRow label="Privacy & security" href="/settings/privacy" />
      </Section>

      <Section title="Preferences">
        <NavRow
          label="Currency & language"
          href="/profile"
          sub={
            profile
              ? `${profile.preferredCurrency} · ${LANGUAGE_LABELS[profile.locale] ?? profile.locale}`
              : undefined
          }
        />
      </Section>

      <Section title="Notifications">
        <NavRow label="Notification types" href="/settings/notifications" />
      </Section>

      {(installState === 'prompt' || installState === 'ios') && (
        <Section title="App">
          <InstallApp variant="row" />
        </Section>
      )}

      <Section title="About">
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5">
          <span className="text-[0.85rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
            Version
          </span>
          <span className="font-mono text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
            {APP_VERSION}
          </span>
        </div>
      </Section>

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
        <LogOut size={17} strokeWidth={2} /> {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
      <p
        className="font-display px-1 pb-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
        style={{ color: 'var(--t-dim)' }}
      >
        {title}
      </p>
      {children}
    </section>
  );
}

function NavRow({ label, href, sub }: { label: string; href: string; sub?: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-xl px-3 py-2.5">
      <span className="text-[0.85rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
        {label}
      </span>
      <span className="flex items-center gap-1" style={{ color: 'var(--t-dim)' }}>
        {sub && <span className="text-[0.78rem]">{sub}</span>}
        <ChevronRight size={16} strokeWidth={2} />
      </span>
    </Link>
  );
}
