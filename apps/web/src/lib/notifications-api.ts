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
