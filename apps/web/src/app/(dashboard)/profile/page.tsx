'use client';

// PRF-01 User Profile -- docs/ABRO_FRONTEND_SPEC.md §7 (lines 1754-
// 1800). Reached from the Profile tab (~/components/nav-items.ts) and
// Home's header. Phase 8 slice 10b: your real profile (GET /auth/me),
// saved with PATCH /users/me (~/lib/auth-api.ts's updateProfile).
//
// Deviations (Confirmed):
//  - Editable: display name, username, default currency, language --
//    the fields apps/api's profile has. Phone is dropped (no field).
//    Email is read-only (it's how you sign in).
//  - Avatar: initials on a color derived from your id, the same as
//    everywhere else in the app (~/lib/identity.ts). No color picker or
//    photo upload -- apps/api stores neither a color nor an uploaded
//    image.
//  - Language is saved to your profile, but the app's text is English
//    only for now; the screen says so.
//  - Default currency is what apps/api uses for your new personal
//    expenses and settlements. Group expenses use the group's currency.
//  - Statistics are real: friends and groups from their lists, and
//    this year's spending / what you paid from GET /analytics/yearly
//    (settlements excluded, per apps/api).
//  - "Notifications" links to SET-02, the one home for those settings.
//  - Account actions: App settings only. Change password (sign-in is
//    email code / Google, no password), connected accounts, export and
//    delete account are dropped (user decision 2026-09-29: deferred).

import { ETB, formatMoney } from '@abro/types';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError, api } from '~/lib/api-client';
import { type AuthProfile, me, updateProfile } from '~/lib/auth-api';
import { listFriends } from '~/lib/friends-api';
import { listGroups } from '~/lib/groups-api';
import { colorForId, initialsOf } from '~/lib/identity';

const CURRENCIES = ['ETB', 'USD', 'EUR'];
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'Amharic' },
];

interface Stats {
  friends: number;
  groups: number;
  spentThisYear: bigint;
  paidThisYear: bigint;
}

async function loadStats(): Promise<Stats> {
  const year = new Date().getFullYear();
  const [friends, groups, yearly] = await Promise.all([
    listFriends(),
    listGroups(),
    api.get<{ yearlyTotal: string; personalContribution: string }>(
      `/analytics/yearly?year=${year}`,
    ),
  ]);
  return {
    friends: friends.length,
    groups: groups.length,
    spentThisYear: BigInt(yearly.yearlyTotal),
    paidThisYear: BigInt(yearly.personalContribution),
  };
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setProfile(null);
    Promise.all([me(), loadStats()])
      .then(([p, s]) => {
        setProfile(p);
        setStats(s);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your profile.');
      });
  };

  useEffect(load, []);

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (!profile || !stats) {
    return <LoadingState />;
  }
  return <ProfileForm initial={profile} stats={stats} />;
}

function ProfileForm({ initial, stats }: { initial: AuthProfile; stats: Stats }) {
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username ?? '');
  const [currency, setCurrency] = useState(initial.preferredCurrency);
  const [locale, setLocale] = useState(initial.locale);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const normalizedUsername = username.trim().toLowerCase();
  const changes = {
    ...(name.trim() !== saved.displayName ? { displayName: name.trim() } : {}),
    ...(normalizedUsername !== (saved.username ?? '') ? { username: normalizedUsername } : {}),
    ...(currency !== saved.preferredCurrency ? { preferredCurrency: currency } : {}),
    ...(locale !== saved.locale ? { locale } : {}),
  };
  const dirty = Object.keys(changes).length > 0;
  const valid = name.trim().length > 0 && normalizedUsername.length >= 3;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateProfile(changes);
      setSaved(updated);
      setName(updated.displayName);
      setUsername(updated.username ?? '');
      setJustSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="fade-in flex flex-col gap-5 px-5 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <h2
        className="font-display text-[1.5rem] font-extrabold tracking-tighter"
        style={{ color: 'var(--t-primary)' }}
      >
        Profile
      </h2>

      {/* Profile header */}
      <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
        <div className="flex items-center gap-4">
          <div
            className="neo-raised flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px]"
            style={{ background: colorForId(saved.id) }}
          >
            <span className="font-display text-xl font-extrabold text-white">
              {initialsOf(name || saved.displayName)}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <Field label="Display name">
              <input
                className="neo-input"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                style={{ color: 'var(--t-primary)' }}
              />
            </Field>
          </div>
        </div>

        <Field label="Username">
          <div className="relative">
            <span
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[0.9rem] font-semibold"
              style={{ color: 'var(--t-dim)' }}
            >
              @
            </span>
            <input
              className="neo-input"
              value={username}
              maxLength={24}
              autoCapitalize="none"
              onChange={(e) => setUsername(e.target.value)}
              style={{ color: 'var(--t-primary)', paddingLeft: 32 }}
            />
          </div>
          <p className="mt-1 pl-1 text-[0.7rem]" style={{ color: 'var(--t-dim)' }}>
            3–24 characters: lowercase letters, digits, dots and underscores.
          </p>
        </Field>

        <div className="neo-inset-sm flex items-center gap-2 rounded-xl px-3 py-2.5">
          <span className="flex-1 truncate text-[0.82rem]" style={{ color: 'var(--t-secondary)' }}>
            {saved.email ?? 'No email on file'}
          </span>
          {saved.email && (
            <span
              className="flex items-center gap-1 text-[0.7rem] font-semibold"
              style={{ color: 'var(--c-green)' }}
            >
              <CheckCircle2 size={13} strokeWidth={2} /> Verified
            </span>
          )}
        </div>
      </section>

      {/* Preferences */}
      <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
        <SectionTitle>Preferences</SectionTitle>
        <Field label="Default currency">
          <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`neo-tab flex-1 border-none font-mono ${currency === c ? 'active' : ''}`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="mt-1 pl-1 text-[0.7rem]" style={{ color: 'var(--t-dim)' }}>
            Used for your personal expenses and settlements. Groups keep their own currency.
          </p>
        </Field>
        <Field label="Language">
          <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLocale(l.code)}
                className={`neo-tab flex-1 border-none ${locale === l.code ? 'active' : ''}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="mt-1 pl-1 text-[0.7rem]" style={{ color: 'var(--t-dim)' }}>
            Saved to your profile. The app is in English only for now.
          </p>
        </Field>
        <Link
          href="/settings/notifications"
          className="flex items-center justify-between rounded-xl px-1 py-1 text-[0.85rem]"
          style={{ color: 'var(--t-secondary)' }}
        >
          <span>Notifications</span>
          <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
        </Link>
      </section>

      {saveError && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {saveError}
        </p>
      )}
      <button
        onClick={save}
        disabled={!dirty || !valid || saving}
        className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? 'Saving…' : justSaved && !dirty ? 'Saved ✓' : 'Save Changes'}
      </button>

      {/* Statistics */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Statistics</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard label="Friends" value={String(stats.friends)} />
          <StatCard label="Groups" value={String(stats.groups)} />
          <StatCard
            label={`Shared spending in ${new Date().getFullYear()}`}
            value={formatMoney(stats.spentThisYear, ETB)}
          />
          <StatCard label="You paid this year" value={formatMoney(stats.paidThisYear, ETB)} />
        </div>
      </section>

      {/* Account actions */}
      <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
        <SectionTitle>Account</SectionTitle>
        <Link
          href="/settings"
          className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[0.85rem] font-medium"
          style={{ color: 'var(--t-secondary)' }}
        >
          App settings
          <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--t-dim)' }} />
        </Link>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-display px-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
      style={{ color: 'var(--t-dim)' }}
    >
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label
        className="mb-1 block pl-1 text-[0.72rem] font-semibold"
        style={{ color: 'var(--t-muted)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="neo-raised-sm rounded-2xl px-3.5 py-3">
      <p
        className="font-display mb-1 text-[1.1rem] font-extrabold tracking-tight"
        style={{ color: 'var(--t-primary)' }}
      >
        {value}
      </p>
      <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
        {label}
      </p>
    </div>
  );
}
