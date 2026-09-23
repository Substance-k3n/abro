'use client';

// PRF-01 User Profile -- docs/ABRO_FRONTEND_SPEC.md §7 (lines 1754-
// 1800). Phase 7's first screen, reached from two pre-existing entry
// points shipped in Phase 3: the Profile tab in BottomNav/Sidebar
// (~/components/nav-items.ts) and Home's header settings icon
// (`(dashboard)/home/page.tsx`'s `Link href="/profile"`) -- both were
// wired ahead of this route existing, same phased-landing pattern as
// every other cross-phase link in this app.
//
// Deviations (Confirmed):
//  - "Notifications" (spec's Preferences §2, item 3): a summary row
//    linking to SET-02 (`/settings/notifications`), not inline toggles
//    here -- SET-02 is the real, more detailed home for that state
//    (~/lib/mock-data.ts's NOTIFICATION_PREFS), avoiding two screens
//    that both claim to be the source of truth for the same settings.
//  - Statistics are computed from real mock data (`getCurrentUserStats`
//    in ~/lib/mock-data.ts), never invented figures -- same "derived,
//    not stored" rule this project applies to financial balances.
//  - Account Actions: Change password, Export data, and Delete account
//    are disabled placeholders (no real auth/export/delete endpoint
//    exists yet), same class as every other unbuildable destructive
//    action in this app (Remove friend, Delete group, ...). Connected
//    accounts shows Google as "Not connected" (this app's own mock
//    auth flow never actually completes an OAuth handshake) with a
//    disabled Connect button, for the same reason.
//  - "App settings" is an extra Account Actions row not in the spec's
//    own bullet list -- added so SET-01 (`/settings`) has a real
//    discoverable entry point from somewhere in the app; the spec's
//    Settings screen (§7, SET-01) itself lists "Profile" as an Account
//    sub-item, implying mutual reachability was always intended.
//  - Avatar editing: color swatch picker only (same palette as AUTH-06's
//    setup-profile screen), not a real image upload -- no image storage
//    exists in this mock-data phase. Initials recompute from the edited
//    display name on Save, matching setup-profile's own `initialsOf`.

import { ETB, formatMoney } from '@abro/types';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  CURRENT_USER,
  NOTIFICATION_PREFS,
  getCurrentUserStats,
  updateCurrentUser,
} from '~/lib/mock-data';

const AVATAR_COLORS = ['#f59e0b', '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6', '#f43f5e'];
const CURRENCIES = ['ETB', 'USD', 'EUR'];
const LANGUAGES = ['English', 'Amharic'];

const initialsOf = (fullName: string) => {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return '?';
  }
  return trimmed
    .split(' ')
    .map((word) => word[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
};

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

function ActionRow({
  label,
  href,
  danger,
  disabled,
}: {
  label: string;
  href: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = danger ? 'var(--c-red)' : 'var(--t-secondary)';
  const className =
    'flex items-center justify-between rounded-xl px-3 py-2.5 text-[0.85rem] font-medium';

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title="Coming soon"
        className={`${className} cursor-not-allowed opacity-50`}
        style={{ color }}
      >
        {label}
      </button>
    );
  }

  return (
    <Link href={href} className={className} style={{ color }}>
      {label}
    </Link>
  );
}

export default function ProfilePage() {
  const [name, setName] = useState(CURRENT_USER.name);
  const [phone, setPhone] = useState(CURRENT_USER.phone ?? '');
  const [colorIndex, setColorIndex] = useState(
    Math.max(0, AVATAR_COLORS.indexOf(CURRENT_USER.color)),
  );
  const [currency, setCurrency] = useState(CURRENT_USER.currency);
  const [language, setLanguage] = useState(CURRENT_USER.language);
  const [saved, setSaved] = useState(false);

  const stats = getCurrentUserStats();
  const notifSummary =
    NOTIFICATION_PREFS.pushEnabled && NOTIFICATION_PREFS.emailEnabled
      ? 'Push & email on'
      : NOTIFICATION_PREFS.pushEnabled
        ? 'Push only'
        : NOTIFICATION_PREFS.emailEnabled
          ? 'Email only'
          : 'All off';

  const save = () => {
    const trimmedName = name.trim() || CURRENT_USER.name;
    updateCurrentUser({
      name: trimmedName,
      initials: initialsOf(trimmedName),
      color: AVATAR_COLORS[colorIndex]!,
      phone: phone.trim() || null,
      currency,
      language,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
          <div className="flex flex-col items-center gap-2">
            <div
              className="neo-raised flex h-16 w-16 items-center justify-center rounded-[20px]"
              style={{ background: AVATAR_COLORS[colorIndex] }}
            >
              <span className="font-display text-xl font-extrabold text-white">
                {initialsOf(name)}
              </span>
            </div>
            <div className="flex gap-1.5">
              {AVATAR_COLORS.map((color, index) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Avatar color ${index + 1}`}
                  onClick={() => setColorIndex(index)}
                  className="h-4 w-4 rounded-full transition-transform"
                  style={{
                    background: color,
                    transform: colorIndex === index ? 'scale(1.25)' : 'scale(1)',
                    boxShadow:
                      colorIndex === index ? `0 0 0 2px var(--neo-bg), 0 0 0 3px ${color}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <div>
              <label
                className="mb-1 block pl-1 text-[0.72rem] font-semibold"
                style={{ color: 'var(--t-muted)' }}
              >
                Display name
              </label>
              <input
                className="neo-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ color: 'var(--t-primary)' }}
              />
            </div>
          </div>
        </div>

        <div className="neo-inset-sm flex items-center gap-2 rounded-xl px-3 py-2.5">
          <span className="flex-1 text-[0.82rem]" style={{ color: 'var(--t-secondary)' }}>
            {CURRENT_USER.email}
          </span>
          {CURRENT_USER.emailVerified && (
            <span
              className="flex items-center gap-1 text-[0.7rem] font-semibold"
              style={{ color: 'var(--c-green)' }}
            >
              <CheckCircle2 size={13} strokeWidth={2} /> Verified
            </span>
          )}
        </div>

        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Phone
          </label>
          <input
            className="neo-input"
            placeholder="Not set"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ color: 'var(--t-primary)' }}
          />
        </div>
      </section>

      {/* Preferences */}
      <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
        <p
          className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Preferences
        </p>
        <div>
          <label
            className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
            style={{ color: 'var(--t-muted)' }}
          >
            Default currency
          </label>
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
                onClick={() => setLanguage(l)}
                className={`neo-tab flex-1 border-none ${language === l ? 'active' : ''}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <Link
          href="/settings/notifications"
          className="flex items-center justify-between rounded-xl px-1 py-1 text-[0.85rem]"
          style={{ color: 'var(--t-secondary)' }}
        >
          <span>Notifications</span>
          <span style={{ color: 'var(--t-dim)' }}>{notifSummary}</span>
        </Link>
      </section>

      <button
        onClick={save}
        className="neo-btn-accent font-display rounded-2xl px-5 py-3.5 text-[0.95rem] font-semibold"
      >
        {saved ? 'Saved ✓' : 'Save Changes'}
      </button>

      {/* Statistics */}
      <section className="flex flex-col gap-3">
        <p
          className="font-display px-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Statistics
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard label="Expenses tracked" value={String(stats.totalExpenses)} />
          <StatCard label="Amount managed" value={formatMoney(stats.totalAmountManaged, ETB)} />
          <StatCard label="Groups joined" value={String(stats.groupsJoined)} />
          <StatCard label="Friends" value={String(stats.friendsCount)} />
        </div>
      </section>

      {/* Account actions */}
      <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
        <p
          className="font-display px-1 pb-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Account
        </p>
        <ActionRow label="App settings" href="/settings" />
        <ActionRow label="Change password" href="#" disabled />
        <ActionRow label="Connected accounts (Google: not connected)" href="#" disabled />
        <ActionRow label="Export data" href="#" disabled />
        <ActionRow label="Delete account" href="#" danger disabled />
      </section>
    </div>
  );
}
