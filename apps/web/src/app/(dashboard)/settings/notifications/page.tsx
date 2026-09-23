'use client';

// SET-02 Notification Settings -- docs/ABRO_FRONTEND_SPEC.md §7 (lines
// 1857-1896). Reached from SET-01's "Notification types" row.
//
// Deviations (Confirmed, see ~/lib/mock-data.ts's NOTIFICATION_PREFS
// header comment for the full reasoning): one toggle per type applying
// to both channels (not a per-type-per-channel matrix); "Payment due"
// dropped (the spec itself marks it "(future)"); quiet hours are local/
// UI-only state (`useState`, not `NOTIFICATION_PREFS`) -- nothing reads
// them, so persisting would overstate their real effect, same reasoning
// as SET-01's date/number format fields.

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { NOTIFICATION_PREFS, updateNotificationPrefs } from '~/lib/mock-data';

const TYPE_LABELS: { key: keyof typeof NOTIFICATION_PREFS.types; label: string }[] = [
  { key: 'expenseAdded', label: "Expense added (you're involved)" },
  { key: 'expenseUpdated', label: 'Expense updated' },
  { key: 'settlementReceived', label: 'Settlement received' },
  { key: 'groupInvitation', label: 'Group invitation' },
  { key: 'memberJoined', label: 'Member joined group' },
  { key: 'balanceReminder', label: 'Balance reminder' },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`neo-toggle ${on ? 'on' : ''}`} aria-pressed={on}>
      <span className="neo-toggle-thumb" />
    </button>
  );
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [, forceRerender] = useState(0);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(NOTIFICATION_PREFS.quietHoursEnabled);
  const [quietHoursStart, setQuietHoursStart] = useState(NOTIFICATION_PREFS.quietHoursStart);
  const [quietHoursEnd, setQuietHoursEnd] = useState(NOTIFICATION_PREFS.quietHoursEnd);

  const toggleChannel = (channel: 'pushEnabled' | 'emailEnabled') => {
    updateNotificationPrefs({ [channel]: !NOTIFICATION_PREFS[channel] });
    forceRerender((n) => n + 1);
  };

  const toggleType = (key: keyof typeof NOTIFICATION_PREFS.types) => {
    updateNotificationPrefs({
      types: { ...NOTIFICATION_PREFS.types, [key]: !NOTIFICATION_PREFS.types[key] },
    });
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
          Notifications
        </h2>
        <div className="w-[70px]" />
      </div>

      <section className="neo-raised-sm flex flex-col gap-3.5 rounded-3xl p-4">
        <p
          className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Channels
        </p>
        <div className="flex items-center justify-between">
          <p className="text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
            Push notifications
          </p>
          <Toggle
            on={NOTIFICATION_PREFS.pushEnabled}
            onClick={() => toggleChannel('pushEnabled')}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
            Email notifications
          </p>
          <Toggle
            on={NOTIFICATION_PREFS.emailEnabled}
            onClick={() => toggleChannel('emailEnabled')}
          />
        </div>
      </section>

      <section className="neo-raised-sm flex flex-col gap-3.5 rounded-3xl p-4">
        <p
          className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Notify me about
        </p>
        {TYPE_LABELS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <p className="text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
              {label}
            </p>
            <Toggle on={NOTIFICATION_PREFS.types[key]} onClick={() => toggleType(key)} />
          </div>
        ))}
      </section>

      <section className="neo-raised-sm flex flex-col gap-3.5 rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <p
            className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
            style={{ color: 'var(--t-dim)' }}
          >
            Quiet Hours
          </p>
          <Toggle on={quietHoursEnabled} onClick={() => setQuietHoursEnabled((v) => !v)} />
        </div>
        {quietHoursEnabled && (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label
                className="mb-1.5 block pl-1 text-[0.72rem] font-semibold"
                style={{ color: 'var(--t-muted)' }}
              >
                Start
              </label>
              <input
                type="time"
                className="neo-input font-mono"
                value={quietHoursStart}
                onChange={(e) => setQuietHoursStart(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label
                className="mb-1.5 block pl-1 text-[0.72rem] font-semibold"
                style={{ color: 'var(--t-muted)' }}
              >
                End
              </label>
              <input
                type="time"
                className="neo-input font-mono"
                value={quietHoursEnd}
                onChange={(e) => setQuietHoursEnd(e.target.value)}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
