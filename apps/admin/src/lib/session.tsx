'use client';

// Who is signed in to the portal (GET /admin/me) and what they may do.
// Pages ask `can(...)` to decide which controls to show; the API checks
// every call again, so hiding is for clarity, not security.

import { createContext, useContext } from 'react';

import type { AdminMe, AdminRole, Permission } from './admin-api';

export interface Session extends AdminMe {
  can: (p: Permission) => boolean;
  reload: () => Promise<void>;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) {
    throw new Error('useSession outside the portal layout');
  }
  return s;
}

export const ROLE_LABEL: Record<AdminRole, string> = {
  SUPPORT: 'Support',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super admin',
};

/** Only same-site paths, so ?next= can't send anyone elsewhere. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : '/';
}
