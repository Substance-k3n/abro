// Payment reminders between friends, and your automatic-reminder
// setting (ADR-023) -- apps/api/internal/reminders. A group admin's
// reminders are in ~/lib/group-admin-api.ts.

import { api } from './api-client';

export interface FriendReminder {
  friendId: string;
  /** Sent by the daily job rather than by you. */
  automatic: boolean;
  remindedAt: string;
  /** When you can remind them again. */
  nextAllowedAt: string;
}

/** POST /friends/{id}/remind: remind a friend who owes you. 429
 * REMINDER_TOO_SOON within 24 hours of the last reminder; 409
 * NOTHING_OWED if they've since paid. */
export function remindFriend(friendId: string): Promise<FriendReminder> {
  return api.post(`/friends/${friendId}/remind`);
}

/** GET /friends/{id}/reminder: the latest reminder they got for what
 * they owe you, or null. */
export function getFriendReminder(friendId: string): Promise<FriendReminder | null> {
  return api.get(`/friends/${friendId}/reminder`);
}

export interface ReminderSettings {
  /** Friends who owe you get automatic reminders once it's overdue. */
  autoRemindFriends: boolean;
}

export function getReminderSettings(): Promise<ReminderSettings> {
  return api.get('/reminders/settings');
}

export function updateReminderSettings(settings: ReminderSettings): Promise<ReminderSettings> {
  return api.patch('/reminders/settings', settings);
}
