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

const RANK: Record<AdminRole, number> = { SUPPORT: 1, ADMIN: 2, SUPER_ADMIN: 3 };

/** Mirrors apps/api/internal/admin's target(): never yourself, never an
 * owner, only someone ranked below you. Returns why not, or null. The API
 * decides; this only explains a disabled button before anyone clicks. */
export function whyCantActOn(
  s: Pick<Session, 'profile' | 'role' | 'owner'>,
  target: { id: string; owner: boolean; adminRole: AdminRole | null },
): string | null {
  if (target.id === s.profile.id) {
    return "You can't do this to your own account.";
  }
  if (target.owner) {
    return "Set in the server settings (ADMIN_EMAILS); it can't be changed here.";
  }
  const mine = s.owner ? 4 : RANK[s.role];
  const theirs = target.adminRole ? RANK[target.adminRole] : 0;
  if (theirs >= mine) {
    return 'Only someone with a higher admin role than theirs can do this.';
  }
  return null;
}

/** Roles the signed-in admin may give: only those below their own rank
 * (owners may make super admins). Mirrors apps/api's SetRole check. */
export function grantableRoles(s: Pick<Session, 'role' | 'owner'>): AdminRole[] {
  const mine = s.owner ? 4 : RANK[s.role];
  return (['SUPPORT', 'ADMIN', 'SUPER_ADMIN'] as const).filter((r) => RANK[r] < mine);
}
