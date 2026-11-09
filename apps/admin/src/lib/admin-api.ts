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
  /** Portal sign-ins end after idleMinutes unused or maxHours after
   * signing in (apps/api/internal/admin/security.go). */
  session: { idleMinutes: number; maxHours: number; startedAt: string; endsAt: string };
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

// --- users ---

export type UserStatus = '' | 'active' | 'suspended' | 'admins';

export interface UserSummary {
  id: string;
  displayName: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string;
  suspendedAt: string | null;
  adminRole: AdminRole | null;
  lastActiveAt: string | null;
  groupCount: number;
}

export interface UserPage {
  users: UserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  live: boolean;
}

export interface UserGroup {
  id: string;
  name: string;
  type: string;
  role: 'ADMIN' | 'MEMBER';
  status: 'INVITED' | 'ACTIVE' | 'LEFT';
  joinedAt: string;
  deleted: boolean;
  memberCount: number;
}

export interface UserDetail {
  id: string;
  displayName: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  adminRole: AdminRole | null;
  owner: boolean;
  lastActiveAt: string | null;
  groupCount: number;
  friendCount: number;
  expenseCount: number;
  settlementCount: number;
  sessions: AdminSession[];
  groups: UserGroup[];
}

export const listUsers = (q: string, status: UserStatus, page: number) =>
  api.get<UserPage>(`/admin/users${query({ q, status, page })}`);
export const getUser = (id: string) => api.get<UserDetail>(`/admin/users/${id}`);
export const suspendUser = (id: string, reason: string) =>
  api.post<UserDetail>(`/admin/users/${id}/suspend`, { reason });
export const unsuspendUser = (id: string) => api.post<UserDetail>(`/admin/users/${id}/unsuspend`);
export const endAllSessions = (id: string) =>
  api.post<UserDetail>(`/admin/users/${id}/sessions/revoke`);
export const endSession = (id: string, sessionId: string) =>
  api.delete<UserDetail>(`/admin/users/${id}/sessions/${sessionId}`);

// --- audit log ---

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  targetEmail: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  nextCursor: string | null;
}

export const listAudit = (f: {
  actor?: string;
  target?: string;
  action?: string;
  cursor?: string;
}) => api.get<AuditPage>(`/admin/audit${query(f)}`);

// --- groups ---

export type GroupStatus = '' | 'deleted' | 'all';

export interface GroupSummary {
  id: string;
  name: string;
  type: string;
  currency: string;
  createdAt: string;
  deletedAt: string | null;
  creatorId: string;
  creatorName: string;
  memberCount: number;
  invitedCount: number;
  expenseCount: number;
  lastActivityAt: string | null;
}

export interface GroupPage {
  groups: GroupSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  suspendedAt: string | null;
  role: 'ADMIN' | 'MEMBER';
  status: 'INVITED' | 'ACTIVE' | 'LEFT';
  joinedAt: string;
}

export interface GroupDetail {
  id: string;
  name: string;
  type: string;
  currency: string;
  description: string | null;
  createdAt: string;
  deletedAt: string | null;
  creatorId: string;
  creatorName: string;
  expenseCount: number;
  settlementCount: number;
  lastActivityAt: string | null;
  members: GroupMember[];
}

export const listGroups = (q: string, status: GroupStatus, page: number) =>
  api.get<GroupPage>(`/admin/groups${query({ q, status, page })}`);
export const getGroup = (id: string) => api.get<GroupDetail>(`/admin/groups/${id}`);

// --- site admins (roles) ---

export interface SiteAdmin {
  userId: string;
  displayName: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  role: AdminRole;
  /** From ADMIN_EMAILS on Render; can't be changed here. */
  owner: boolean;
  grantedAt: string | null;
  grantedByName: string | null;
}

export const listAdmins = () => api.get<SiteAdmin[]>('/admin/admins');
export const setAdminRole = (userId: string, role: AdminRole) =>
  api.put<SiteAdmin[]>(`/admin/admins/${userId}`, { role });
export const removeAdminRole = (userId: string) =>
  api.delete<SiteAdmin[]>(`/admin/admins/${userId}`);

// --- your own sessions (Security) ---

export interface OwnSession extends AdminSession {
  /** The one this browser is using. */
  current: boolean;
}

export const mySessions = () => api.get<OwnSession[]>('/admin/me/sessions');
export const endMySession = (id: string) => api.delete<OwnSession[]>(`/admin/me/sessions/${id}`);
export const endMyOtherSessions = () => api.post<OwnSession[]>('/admin/me/sessions/revoke-others');
