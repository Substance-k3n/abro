// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's
// /notifications routes. Shapes mirror apps/api/internal/apitypes/
// notification.go.

import { api } from './api-client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function listNotifications(opts?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Notification[]> {
  const params = new URLSearchParams();
  if (opts?.unreadOnly) {
    params.set('unreadOnly', 'true');
  }
  if (opts?.limit) {
    params.set('limit', String(opts.limit));
  }
  const qs = params.toString();
  return api.get(`/notifications/${qs ? `?${qs}` : ''}`);
}

export function markAllNotificationsRead(): Promise<void> {
  return api.patch('/notifications/read-all');
}

export function markNotificationRead(id: string): Promise<Notification> {
  return api.patch(`/notifications/${id}/read`);
}

/** Every notification type apps/api sends (notifications.AllTypes),
 * mapped to whether you get it. */
export type NotificationPreferences = Record<string, boolean>;

/** GET /notifications/preferences -- all types, on unless you opted out. */
export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return api.get('/notifications/preferences');
}

/** PATCH /notifications/preferences with only the types to change;
 * answers with the full, updated map. */
export function updateNotificationPreferences(
  changes: NotificationPreferences,
): Promise<NotificationPreferences> {
  return api.patch('/notifications/preferences', changes);
}
