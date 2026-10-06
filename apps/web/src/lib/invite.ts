// Friend invite links (roadmap Phase 3b): abro.../add/<username> opens a
// one-tap "Add <name> as a friend" page (app/add/[username]).
//
// Someone opening a link before they've signed up gets sent through
// sign-in and profile setup first, so the username is remembered here
// (localStorage, best effort) and postSignInPath() in auth-api brings them
// back to it afterwards. The add page forgets it once it has loaded for a
// signed-in user.

const PENDING_KEY = 'abro.pendingInvite';

/** Usernames are lowercase [a-z0-9_.], 3-24 chars (apps/api apitypes). */
const USERNAME = /^[a-z0-9_.]{3,24}$/;

export function isUsername(value: string): boolean {
  return USERNAME.test(value);
}

export function inviteUrl(username: string): string {
  return `${window.location.origin}/add/${username}`;
}

export function rememberInvite(username: string): void {
  try {
    localStorage.setItem(PENDING_KEY, username);
  } catch {
    // Storage blocked: they land on Home after sign-in and can open the link again.
  }
}

export function pendingInvite(): string | null {
  try {
    const value = localStorage.getItem(PENDING_KEY);
    return value && isUsername(value) ? value : null;
  } catch {
    return null;
  }
}

export function forgetInvite(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to do.
  }
}
