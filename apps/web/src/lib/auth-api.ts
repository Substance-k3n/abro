// Phase 8 (docs/WIRING_PLAN.md) -- typed calls into apps/api's /auth and
// /users routes, backing AUTH-03..06 (signin, verify-email, setup-
// profile) and Home's session check. Shapes mirror apps/api/internal/
// apitypes/{profile,auth,update_profile}.go and the Handler methods in
// apps/api/internal/{auth,users}/router.go exactly -- one place this
// contract is defined on the frontend, matching AuthProfile's own "one
// place this shape is defined" rationale on the Go side.

import { api } from './api-client';

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

export function logout(): Promise<void> {
  return api.post('/auth/logout');
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
export function postSignInPath(profile: AuthProfile): string {
  return profile.username === null ? '/auth/setup-profile' : '/home';
}
