'use client';

// SET-02 Notification Settings -- docs/ABRO_FRONTEND_SPEC.md §7 (lines
// 1857-1896). Reached from SET-01's "Notification types" and PRF-01's
// "Notifications". Phase 8 slice 10c: one switch per notification type
// apps/api sends, backed by GET/PATCH /notifications/preferences (10a).
// A type switched off is never created for you (in-app).
//
// Deviations (Confirmed, user decision 2026-09-29):
//  - In-app only: no push/email channel toggles -- apps/api has neither
//    channel.
//  - Quiet hours dropped (nothing to delay without a push channel).
//  - The spec's "Balance reminder" / "Payment due" are dropped: apps/api
//    sends no such notifications. The list is exactly what it sends.
//  - Each switch saves immediately (like DASH-07's mark-as-read); on
//    failure it flips back and the error shows above the list.

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import {
  type NotificationPreferences,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '~/lib/notifications-api';

const TYPES: { type: string; label: string; sub: string }[] = [
  { type: 'EXPENSE_ADDED', label: 'New expenses', sub: "Someone adds an expense you're on" },
  { type: 'EXPENSE_EDITED', label: 'Expense changes', sub: "An expense you're on is edited" },
  { type: 'EXPENSE_DELETED', label: 'Deleted expenses', sub: "An expense you're on is deleted" },
  { type: 'SETTLEMENT', label: 'Settlements', sub: 'Someone records a payment to you' },
  { type: 'GROUP_INVITATION', label: 'Group invitations', sub: "You're invited to a group" },
  {
    type: 'GROUP_MEMBERSHIP_CHANGE',
    label: 'Group members',
    sub: 'People join or leave, your role changes, or the group is deleted',
  },
  {
    type: 'RECURRING_EXPENSE',
    label: 'Recurring expenses',
    sub: 'A recurring expense is generated',
  },
  {
    type: 'DEBT_SIMPLIFICATION_CHANGE',
    label: 'Debt simplification',
    sub: "A group's simplify setting changes",
  },
  {
    type: 'PAYMENT_REMINDER',
    label: 'Payment reminders',
    sub: 'A group admin reminds you that you owe the group',
  },
  { type: 'FRIEND_REQUEST', label: 'Friend requests', sub: 'Someone wants to be friends' },
  {
    type: 'FRIEND_ACCEPTED',
    label: 'Accepted requests',
    sub: 'Someone accepts your friend request',
  },
];

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    getNotificationPreferences()
      .then(setPrefs)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'Could not load your settings.'),
      );
  };

  useEffect(load, []);

  if (loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!prefs) {
    return <LoadingState />;
  }

  const toggle = async (type: string) => {
    const next = !(prefs[type] ?? true);
    setSaving(type);
    setSaveError(null);
    setPrefs({ ...prefs, [type]: next });
    try {
      setPrefs(await updateNotificationPreferences({ [type]: next }));
    } catch (err) {
      setPrefs((p) => (p ? { ...p, [type]: !next } : p));
      setSaveError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
    }
    setSaving(null);
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

      <p className="px-1 text-[0.78rem]" style={{ color: 'var(--t-muted)' }}>
        Choose what shows up in your in-app notifications. Turning a type off stops new ones; your
        balances and activity are unaffected.
      </p>

      {saveError && (
        <p
          role="alert"
          className="rounded-xl px-3.5 py-2.5 text-[0.8rem] font-medium"
          style={{ background: 'var(--red-bg)', color: 'var(--c-red)' }}
        >
          {saveError}
        </p>
      )}

      <section className="neo-raised-sm flex flex-col gap-3.5 rounded-3xl p-4">
        <p
          className="font-display text-[0.75rem] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--t-dim)' }}
        >
          Notify me about
        </p>
        {TYPES.map(({ type, label, sub }) => {
          const on = prefs[type] ?? true;
          return (
            <div key={type} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.85rem]" style={{ color: 'var(--t-secondary)' }}>
                  {label}
                </p>
                <p className="text-[0.72rem]" style={{ color: 'var(--t-dim)' }}>
                  {sub}
                </p>
              </div>
              <button
                onClick={() => toggle(type)}
                disabled={saving === type}
                className={`neo-toggle shrink-0 ${on ? 'on' : ''}`}
                aria-pressed={on}
                aria-label={label}
              >
                <span className="neo-toggle-thumb" />
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
