// Typed calls into apps/api's /admin routes (apps/api/internal/admin,
// shapes from apps/api/internal/apitypes/admin*.go). Amounts arrive as
// minor-unit strings and become bigint here.

import { api, query } from './api';

export type AdminRole = 'SUPPORT' | 'ADMIN' | 'SUPER_ADMIN';

export type Permission =
  | 'overview.view'
  | 'users.view'
  | 'groups.view'
  | 'audit.view'
  | 'admins.view'
  | 'users.suspend'
  | 'users.sessions'
  | 'voice.manage'
  | 'admins.manage';

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  username: string | null;
}

export interface AdminMe {
  profile: Profile;
  role: AdminRole;
  /** A super admin from ADMIN_EMAILS (Render), above every stored role. */
  owner: boolean;
  permissions: Permission[];
}

export const getMe = () => api.get<AdminMe>('/admin/me');

// --- sign-in (the same email codes as the PWA, apps/api/internal/auth) ---

export const requestCode = (email: string) => api.post<unknown>('/auth/otp/request', { email });
export const verifyCode = (email: string, code: string) =>
  api.post<Profile>('/auth/otp/verify', { email, code });
export const signOut = () => api.post<unknown>('/auth/logout');

// --- overview ---

export type OverviewRange = 7 | 30 | 90;

export interface OverviewDay {
  /** Addis Ababa calendar day, YYYY-MM-DD. */
  day: string;
  signups: number;
  expenses: number;
  settlements: number;
  voiceSessions: number;
}

export interface Overview {
  rangeDays: OverviewRange;
  since: string;
  users: { total: number; new: number; active: number; suspended: number };
  groups: { total: number; new: number };
  activity: { expenses: number; settlements: number };
  queue: {
    openDisputes: number;
    pendingConfirmations: number;
    staleConfirmations: number;
    pendingInvites: number;
    staleInvites: number;
  };
  voice: { sessions: number; users: number };
  series: OverviewDay[];
  categories: { category: string; expenses: number }[];
  volume: { currency: string; total: bigint; expenses: number }[];
  groupTypes: { type: string; groups: number }[];
}

interface OverviewWire extends Omit<Overview, 'volume'> {
  volume: { currency: string; total: string; expenses: number }[];
}

export async function getOverview(range: OverviewRange): Promise<Overview> {
  const o = await api.get<OverviewWire>(`/admin/overview${query({ range })}`);
  return { ...o, volume: o.volume.map((v) => ({ ...v, total: BigInt(v.total) })) };
}
