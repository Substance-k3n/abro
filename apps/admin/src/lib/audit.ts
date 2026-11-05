// Plain-English lines for audit-log actions (apps/api/internal/admin's
// Action* constants). Unknown actions show their raw name, so a new one
// is never hidden.

import type { AuditEntry } from './admin-api';

const ROLE: Record<string, string> = {
  SUPPORT: 'Support',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super admin',
};
const MODE: Record<string, string> = { off: 'Off', listed: 'Listed people', everyone: 'Everyone' };

export const ACTION_LABELS: Record<string, string> = {
  'user.suspend': 'Suspended an account',
  'user.unsuspend': 'Unsuspended an account',
  'user.sessions.revoke_all': 'Signed someone out everywhere',
  'user.session.revoke': 'Ended one session',
  'user.voice.grant': 'Turned voice on for someone',
  'user.voice.revoke': 'Turned voice off for someone',
  'admin.role.set': 'Changed an admin role',
  'admin.role.remove': 'Removed an admin role',
  'voice.mode.set': 'Changed who has voice',
};

/** The detail line for one entry, e.g. "Reason: spam · 2 sessions ended". */
export function auditDetail(e: AuditEntry): string {
  const d = e.details;
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null);
  switch (e.action) {
    case 'user.suspend': {
      const n = typeof d.sessionsEnded === 'number' ? d.sessionsEnded : 0;
      return `Reason: ${str('reason') ?? '—'} · ${n} ${n === 1 ? 'session' : 'sessions'} ended`;
    }
    case 'user.sessions.revoke_all': {
      const n = typeof d.sessionsEnded === 'number' ? d.sessionsEnded : 0;
      return `${n} ${n === 1 ? 'session' : 'sessions'} ended`;
    }
    case 'admin.role.set':
      return `${str('from') ? (ROLE[str('from')!] ?? str('from')) : 'No role'} → ${ROLE[str('to') ?? ''] ?? str('to')}`;
    case 'admin.role.remove':
      return `Was ${ROLE[str('from') ?? ''] ?? str('from')}`;
    case 'voice.mode.set':
      return `${MODE[str('from') ?? ''] ?? str('from')} → ${MODE[str('to') ?? ''] ?? str('to')}`;
  }
  return '';
}
