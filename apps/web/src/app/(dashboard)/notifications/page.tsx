'use client';

// DASH-07 Notifications — docs/ABRO_FRONTEND_SPEC.md §3 (lines 530-570).
// Ported from the prototype's NotificationsScreen (App.tsx:3954): type
// icon, title/body/time, unread accent border + dot. Unlike the
// prototype's inert "Mark all read" button, this one actually works
// against local state (still mock data, but the interaction itself is
// real) -- Phase 8 replaces the local state with a real
// PATCH /notifications/read-all call.

import { EmptyState } from '@abro/ui';
import { Bell, type LucideIcon, Receipt, UserPlus, Utensils, Wallet } from 'lucide-react';
import { useState } from 'react';

import { NOTIFICATIONS, type NotificationMock } from '~/lib/mock-data';

const ICONS: Record<NotificationMock['icon'], LucideIcon> = {
  Wallet,
  Utensils,
  UserPlus,
  Receipt,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(NOTIFICATIONS);

  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  const markRead = (id: string) =>
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

  return (
    <div className="fade-in px-5 py-6 md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <h2
          className="font-display text-[1.5rem] font-extrabold tracking-tighter"
          style={{ color: 'var(--t-primary)' }}
        >
          Notifications
        </h2>
        <button
          onClick={markAllRead}
          className="text-[0.78rem] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          Mark all read
        </button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={26} strokeWidth={1.5} />}
          title="All caught up!"
          description="No notifications right now."
        />
      ) : (
        <div className="flex max-w-xl flex-col gap-2.5">
          {notifications.map((n) => {
            const Icon = ICONS[n.icon];
            return (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className="neo-raised-sm flex items-start gap-3 rounded-2xl p-3.5 text-left"
                style={{ borderLeft: n.read ? 'none' : '3px solid var(--accent)' }}
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
                    style={{ color: 'var(--t-primary)', fontWeight: n.read ? 500 : 700 }}
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
                    {n.time}
                  </p>
                </div>
                {!n.read && <div className="notif-dot mt-1 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
