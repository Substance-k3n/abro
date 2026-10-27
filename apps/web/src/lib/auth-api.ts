// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's /auth and
// /users routes, backing AUTH-03..06 (signin, verify-email, setup-
// profile) and Home's session check. Shapes mirror apps/api/internal/
// apitypes/{profile,auth,update_profile}.go and the Handler methods in
// apps/api/internal/{auth,users}/router.go exactly -- one place this
// contract is defined on the frontend, matching AuthProfile's own "one
// place this shape is defined" rationale on the Go side.

import { api, clearApiCache } from './api-client';
import { pendingInvite } from './invite';
import { disablePush } from './push';

export interface AuthProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  /** null until the profile completes setup-profile -- the signal this
   * app uses to decide whether to route there after sign-in, instead of
   * a separate isNewUser flag. See apps/api/migrations/0010_username. */
  username: string | null;
  preferredCurrency: string;
  locale: string;
}

export function requestOtp(email: string): Promise<{ sent: boolean }> {
  return api.post('/auth/otp/request', { email });
}

export function verifyOtp(email: string, code: string): Promise<AuthProfile> {
  return api.post('/auth/otp/verify', { email, code });
}

export function me(): Promise<AuthProfile> {
  return api.get('/auth/me');
}

/** Signs out of this device. Push is switched off first (while the
 * session still exists), so the next person to sign in here doesn't get
 * this account's notifications (ADR-021); the data saved for instant
 * screens is wiped whatever happens (ADR-022). */
export async function logout(): Promise<void> {
  await disablePush().catch(() => {});
  try {
    await api.post('/auth/logout');
  } finally {
    clearApiCache();
  }
}

export function checkUsernameAvailable(username: string): Promise<{ available: boolean }> {
  return api.get(`/users/username-available?username=${encodeURIComponent(username)}`);
}

export interface UpdateProfileInput {
  displayName?: string;
  username?: string;
  preferredCurrency?: string;
  locale?: string;
}

export function updateProfile(input: UpdateProfileInput): Promise<AuthProfile> {
  return api.patch('/users/me', input);
}

/** Where AUTH-05/06/onward should route after any successful sign-in --
 * one place this decision lives, so verify-email and the Google OAuth
 * callback page can't drift apart on it. */
/** Where to go after signing in or finishing profile setup: setup first
 * if there's no username yet, then a friend invite opened before signing
 * in (lib/invite.ts), otherwise Home. */
export function postSignInPath(profile: AuthProfile): string {
  if (profile.username === null) {
    return '/auth/setup-profile';
  }
  const invite = pendingInvite();
  return invite ? `/add/${invite}` : '/home';
}
