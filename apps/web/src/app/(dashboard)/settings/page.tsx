'use client';

// SET-01 Settings -- docs/ABRO_FRONTEND_SPEC.md §7 (lines 1802-1855).
// Reached from PRF-01's "App settings" Account Actions row (that link
// was added specifically for this route -- see PRF-01's header comment).
//
// Deviations (Confirmed):
//  - Account category's "Profile" / "Privacy" / "Security" sub-items are
//    links (Profile -> `/profile`, Privacy & Security both -> SET-03's
//    single `/settings/privacy` route, matching the spec's own route
//    list which defines one combined Privacy & Security screen, not
//    two).
//  - Currency/Language mirror PRF-01's own Preferences fields (same
//    `CURRENT_USER` fields, same `updateCurrentUser` mutator) -- this
//    is intentionally the same setting reachable from two places, not a
//    second independent value; the spec lists Preferences under both
//    PRF-01 and SET-01 UI text, and it's the same underlying settings.
//  - Date format / Number format: local UI state only, not persisted --
//    no formatting function anywhere in this app reads a configurable
//    format (every screen calls `formatMoney`/hardcoded date strings
//    directly), so persisting a setting nothing consumes would imply
//    more real effect than exists. Documented, not silently dropped.
//  - Notification toggles mutate `NOTIFICATION_PREFS` immediately on
//    click (no separate Save step) -- same instant-mutation pattern as
//    DASH-07's mark-as-read, appropriate for a single boolean flip.
//  - Data category's "Storage usage" (spec's §4) is omitted entirely --
//    this is a mock-data app with no real client cache/storage to
//    report a size for; showing an invented number would be exactly
//    the fabricated data this project's workflow avoids. Export all
//    data / Clear cache stay as disabled placeholders for the same
//    "no real backing system" reason.
//  - About: Version is a literal string mirroring `apps/web/package.
//    json`'s `version` field (not build-time-resolved) -- Terms/
//    Privacy policy/Contact support/Rate app are disabled placeholders,
//    no real content pages exist for them yet.
//  - Sign out navigates to `/auth/signin` for real (there's no session
//    token in this mock-data phase to actually destroy, but the
//    navigation itself is real, not a disabled placeholder). Delete
//    account stays a disabled placeholder, same class as PRF-01's.

import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  CURRENT_USER,
  NOTIFICATION_PREFS,
  updateCurrentUser,
  updateNotificationPrefs,
} from '~/lib/mock-data';

const APP_VERSION = '0.1.0';
const CURRENCIES = ['ETB', 'USD', 'EUR'];
const LANGUAGES = ['English', 'Amharic'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY'];
const NUMBER_FORMATS = ['1,234.56', '1.234,56'];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-display px-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
      style={{ color: 'var(--t-dim)' }}
    >
      {children}
    </p>
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

function DisabledRow({ label, danger }: { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className="cursor-not-allowed rounded-xl px-3 py-2.5 text-left text-[0.85rem] font-medium opacity-50"
      style={{ color: danger ? 'var(--c-red)' : 'var(--t-secondary)' }}
    >
      {label}
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [currency, setCurrency] = useState(CURRENT_USER.currency);
  const [language, setLanguage] = useState(CURRENT_USER.language);
  const [dateFormat, setDateFormat] = useState(DATE_FORMATS[0]!);
  const [numberFormat, setNumberFormat] = useState(NUMBER_FORMATS[0]!);
  const [, forceRerender] = useState(0);

  const setCurrencyAndSave = (c: string) => {
    setCurrency(c);
    updateCurrentUser({ currency: c });
  };
  const setLanguageAndSave = (l: string) => {
    setLanguage(l);
    updateCurrentUser({ language: l });
  };
  const toggleNotifChannel = (channel: 'pushEnabled' | 'emailEnabled') => {
    updateNotificationPrefs({ [channel]: !NOTIFICATION_PREFS[channel] });
    forceRerender((n) => n + 1);
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

      <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
        <SectionLabel>Account</SectionLabel>
        <NavRow label="Profile" href="/profile" />
        <NavRow label="Privacy" href="/settings/privacy" />
        <NavRow label="Security" href="/settings/privacy" />
      </section>

      <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
        <SectionLabel>Preferences</SectionLabel>
        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Currency
          </label>
          <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrencyAndSave(c)}
                className={`neo-tab flex-1 border-none font-mono ${currency === c ? 'active' : ''}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Language
          </label>
          <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                onClick={() => setLanguageAndSave(l)}
                className={`neo-tab flex-1 border-none ${language === l ? 'active' : ''}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Date format
          </label>
          <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
            {DATE_FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setDateFormat(f)}
                className={`neo-tab flex-1 border-none font-mono text-[0.72rem] ${dateFormat === f ? 'active' : ''}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Number format
          </label>
          <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
            {NUMBER_FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setNumberFormat(f)}
                className={`neo-tab flex-1 border-none font-mono text-[0.72rem] ${numberFormat === f ? 'active' : ''}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="neo-raised-sm flex flex-col gap-3.5 rounded-3xl p-4">
        <SectionLabel>Notifications</SectionLabel>
        <div className="flex items-center justify-between">
          <p className="text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
            Push notifications
          </p>
          <button
            onClick={() => toggleNotifChannel('pushEnabled')}
            className={`neo-toggle ${NOTIFICATION_PREFS.pushEnabled ? 'on' : ''}`}
            aria-pressed={NOTIFICATION_PREFS.pushEnabled}
          >
            <span className="neo-toggle-thumb" />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
            Email notifications
          </p>
          <button
            onClick={() => toggleNotifChannel('emailEnabled')}
            className={`neo-toggle ${NOTIFICATION_PREFS.emailEnabled ? 'on' : ''}`}
            aria-pressed={NOTIFICATION_PREFS.emailEnabled}
          >
            <span className="neo-toggle-thumb" />
          </button>
        </div>
        <NavRow label="Notification types" href="/settings/notifications" />
      </section>

      <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
        <SectionLabel>Data</SectionLabel>
        <DisabledRow label="Export all data" />
        <DisabledRow label="Clear cache" />
      </section>

      <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
        <SectionLabel>About</SectionLabel>
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5">
          <span className="text-[0.85rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
            Version
          </span>
          <span className="font-mono text-[0.8rem]" style={{ color: 'var(--t-dim)' }}>
            {APP_VERSION}
          </span>
        </div>
        <DisabledRow label="Terms of service" />
        <DisabledRow label="Privacy policy" />
        <DisabledRow label="Contact support" />
        <DisabledRow label="Rate app" />
      </section>

      <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
        <SectionLabel>Account</SectionLabel>
        <button
          type="button"
          onClick={() => router.push('/auth/signin')}
          className="rounded-xl px-3 py-2.5 text-left text-[0.85rem] font-medium"
          style={{ color: 'var(--t-secondary)' }}
        >
          Sign out
        </button>
        <DisabledRow label="Delete account" danger />
      </section>
    </div>
  );
}
