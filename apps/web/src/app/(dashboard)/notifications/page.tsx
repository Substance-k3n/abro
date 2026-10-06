'use client';

// DASH-07 Notifications — docs/ABRO_FRONTEND_SPEC.md §3 (lines 530-570).
// Ported from the prototype's NotificationsScreen (App.tsx:3954): type
// icon, title/body/time, unread accent border + dot.
//
// Phase 8 (docs/WIRING_PLAN.md) rewiring: real GET /notifications on
// mount, real PATCH /notifications/read-all and PATCH /notifications/
// {id}/read on click -- both apply optimistically to local state first
// (same instant-feedback UX the mock version already had) and roll
// back on failure, rather than waiting on a round trip before the UI
// updates.
//
// Icon-per-type mapping is new here -- the mock version hardcoded one
// icon per seeded notification; real ones carry a real `type`
// (apps/api/internal/notifications/service.go's `Type` enum:
// EXPENSE_ADDED/EXPENSE_EDITED/EXPENSE_DELETED/SETTLEMENT/
// GROUP_INVITATION/GROUP_MEMBERSHIP_CHANGE/RECURRING_EXPENSE/
// DEBT_SIMPLIFICATION_CHANGE), mapped to the same four lucide icons the
// mock version used, matched by category rather than 1:1.

import { EmptyState } from '@abro/ui';
import { Bell, type LucideIcon, Receipt, UserPlus, Utensils, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';

import { LoadingState } from '~/components/LoadStates';
import { ApiError } from '~/lib/api-client';
import { formatShortDate } from '~/lib/format';
import {
  type Notification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '~/lib/notifications-api';

const ICONS: Record<string, LucideIcon> = {
  EXPENSE_ADDED: Utensils,
  EXPENSE_EDITED: Receipt,
  EXPENSE_DELETED: Receipt,
  SETTLEMENT: Wallet,
  GROUP_INVITATION: UserPlus,
  GROUP_MEMBERSHIP_CHANGE: UserPlus,
  RECURRING_EXPENSE: Receipt,
  DEBT_SIMPLIFICATION_CHANGE: Receipt,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setNotifications(null);
    listNotifications({ limit: 50 })
      .then(setNotifications)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load notifications.');
      });
  };

  useEffect(load, []);

  const markAllRead = () => {
    if (!notifications) {
      return;
    }
    const previous = notifications;
    const now = new Date().toISOString();
    setNotifications(previous.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    markAllNotificationsRead().catch(() => setNotifications(previous));
  };

  const markRead = (id: string) => {
    if (!notifications) {
      return;
    }
    const target = notifications.find((n) => n.id === id);
    if (!target || target.readAt) {
      return;
    }
    const previous = notifications;
    setNotifications(
      previous.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    markNotificationRead(id).catch(() => setNotifications(previous));
  };

  return (
    <div className="fade-in px-5 py-6 md:mx-auto md:max-w-4xl md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <h2
          className="font-display text-[1.5rem] font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          Notifications
        </h2>
        {notifications && notifications.some((n) => !n.readAt) && (
          <button
            onClick={markAllRead}
            className="text-[0.78rem] font-medium"
            style={{ color: 'var(--accent)' }}
          >
            Mark all read
          </button>
        )}
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-[0.9rem]" style={{ color: 'var(--t-muted)' }}>
            {error}
          </p>
          <button
            onClick={load}
            className="neo-btn-accent rounded-2xl px-5 py-2.5 text-[0.85rem] font-semibold"
          >
            Try again
          </button>
        </div>
      ) : !notifications ? (
        <LoadingState />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={26} strokeWidth={1.5} />}
          title="All caught up!"
          description="No notifications right now."
        />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {notifications.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            const isRead = n.readAt !== null;
            return (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className="neo-raised-sm flex items-start gap-3 rounded-2xl p-3.5 text-left"
                style={{ borderLeft: isRead ? 'none' : '3px solid var(--accent)' }}
              >
                <div
                  className="neo-raised-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                  style={{ color: 'var(--t-muted)' }}
                >
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <div className="flex-1">
                  <p
                    className="mb-0.5 text-[0.88rem]"
                    style={{ color: 'var(--t-primary)', fontWeight: isRead ? 500 : 700 }}
                  >
                    {n.title}
                  </p>
                  <p
                    className="mb-1 text-[0.78rem] leading-relaxed"
                    style={{ color: 'var(--t-muted)' }}
                  >
                    {n.body}
                  </p>
                  <p className="text-[0.7rem]" style={{ color: '#b0b5c0' }}>
                    {formatShortDate(n.createdAt)}
                  </p>
                </div>
                {!isRead && <div className="notif-dot mt-1 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
