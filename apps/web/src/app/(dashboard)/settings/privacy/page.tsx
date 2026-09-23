'use client';

// SET-03 Privacy & Security -- docs/ABRO_FRONTEND_SPEC.md §7 (lines
// 1898-1941). Reached from SET-01's "Privacy" and "Security" rows
// (both point here -- the spec defines one combined route,
// `/settings/privacy`, for both).
//
// Deviations (Confirmed, see ~/lib/mock-data.ts's PrivacySettings
// header comment for the full reasoning):
//  - Password: "Change password" is a disabled placeholder (no real
//    auth backend to change a password against). "Last changed" (the
//    spec's own sub-bullet) is omitted -- this app has never recorded
//    a real password change, so there is no true date to show; a made
//    -up one would misrepresent account history.
//  - Two-Factor Authentication: a real local toggle (PRIVACY_SETTINGS.
//    twoFactorEnabled), but flipping it doesn't back a real TOTP/SMS
//    setup flow -- "Set up" only appears (as a disabled placeholder)
//    once enabled, honestly signaling that the real setup step doesn't
//    exist yet rather than pretending 2FA is actually active.
//  - Privacy: profile visibility / who-can-add-you / who-can-see-your-
//    expenses are real toggled selectors, persisted to
//    PRIVACY_SETTINGS -- nothing in this mock-data app currently reads
//    them to gate anything (same class of "persisted but not yet
//    enforced" as Group Settings' notification toggles), documented
//    honestly rather than silently dropped.
//  - Connected Accounts: Google shown as "Not connected" (this app's
//    mock sign-in flow never completes a real OAuth handshake),
//    Disconnect is a disabled placeholder.
//  - Active Sessions: no fabricated device list. Shows only the one
//    session that's actually real ("This device"), with no fake
//    browser/location/last-active details -- inventing a plausible-
//    looking device list is exactly the kind of fabricated data this
//    project's workflow avoids (same reasoning GRP-05 applied to
//    skipping a fake pairwise-debt network).

import { ArrowLeft, Laptop } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PRIVACY_SETTINGS, updatePrivacySettings } from '~/lib/mock-data';

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends' },
  { value: 'private', label: 'Private' },
] as const;

const WHO_CAN_ADD_OPTIONS = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'friendsOfFriends', label: 'Friends of friends' },
  { value: 'nobody', label: 'Nobody' },
] as const;

const WHO_CAN_SEE_EXPENSES_OPTIONS = [
  { value: 'friends', label: 'Friends' },
  { value: 'nobody', label: 'Nobody' },
] as const;

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`neo-toggle ${on ? 'on' : ''}`} aria-pressed={on}>
      <span className="neo-toggle-thumb" />
    </button>
  );
}

function SelectorRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label
        className="mb-1.5 block pl-1 text-[0.78rem] font-semibold"
        style={{ color: 'var(--t-muted)' }}
      >
        {label}
      </label>
      <div className="neo-inset-sm flex gap-1 rounded-[14px] p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`neo-tab flex-1 border-none text-[0.76rem] ${value === o.value ? 'active' : ''}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PrivacySecurityPage() {
  const router = useRouter();
  const [, forceRerender] = useState(0);

  const set = <K extends keyof typeof PRIVACY_SETTINGS>(
    key: K,
    value: (typeof PRIVACY_SETTINGS)[K],
  ) => {
    updatePrivacySettings({ [key]: value });
    forceRerender((n) => n + 1);
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
        <div className="w-[70px]" />
      </div>

      <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
        <p
          className="font-display px-1 pb-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Password
        </p>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="cursor-not-allowed rounded-xl px-3 py-2.5 text-left text-[0.85rem] font-medium opacity-50"
          style={{ color: 'var(--t-secondary)' }}
        >
          Change password
        </button>
      </section>

      <section className="neo-raised-sm flex flex-col gap-3 rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.85rem] font-semibold" style={{ color: 'var(--t-primary)' }}>
              Two-Factor Authentication
            </p>
            <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
              Add an extra layer of security to your account.
            </p>
          </div>
          <Toggle
            on={PRIVACY_SETTINGS.twoFactorEnabled}
            onClick={() => set('twoFactorEnabled', !PRIVACY_SETTINGS.twoFactorEnabled)}
          />
        </div>
        {PRIVACY_SETTINGS.twoFactorEnabled && (
          <button
            type="button"
            disabled
            title="Coming soon"
            className="neo-btn cursor-not-allowed self-start rounded-xl px-3 py-2 text-[0.78rem] font-semibold opacity-50"
          >
            Set up 2FA
          </button>
        )}
      </section>

      <section className="neo-raised-sm flex flex-col gap-4 rounded-3xl p-4">
        <p
          className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Privacy
        </p>
        <SelectorRow
          label="Profile visibility"
          value={PRIVACY_SETTINGS.profileVisibility}
          options={VISIBILITY_OPTIONS}
          onChange={(v) => set('profileVisibility', v)}
        />
        <SelectorRow
          label="Who can add you"
          value={PRIVACY_SETTINGS.whoCanAddYou}
          options={WHO_CAN_ADD_OPTIONS}
          onChange={(v) => set('whoCanAddYou', v)}
        />
        <SelectorRow
          label="Who can see your expenses"
          value={PRIVACY_SETTINGS.whoCanSeeExpenses}
          options={WHO_CAN_SEE_EXPENSES_OPTIONS}
          onChange={(v) => set('whoCanSeeExpenses', v)}
        />
      </section>

      <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
        <p
          className="font-display px-1 pb-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Connected Accounts
        </p>
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5">
          <span className="text-[0.85rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
            Google
          </span>
          <span className="text-[0.78rem]" style={{ color: 'var(--t-dim)' }}>
            Not connected
          </span>
        </div>
      </section>

      <section className="neo-raised-sm flex flex-col gap-1 rounded-3xl p-3">
        <p
          className="font-display px-1 pb-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Active Sessions
        </p>
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <Laptop size={18} strokeWidth={1.8} style={{ color: 'var(--t-dim)' }} />
          <div className="flex-1">
            <p className="text-[0.85rem] font-medium" style={{ color: 'var(--t-secondary)' }}>
              This device
            </p>
            <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
              Current session
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
