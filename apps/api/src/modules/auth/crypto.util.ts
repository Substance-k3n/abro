import { createHash, randomBytes, randomInt } from 'crypto';

/** A 6-digit code, per ABRO_PRD.md §39 ("Enter the verification code"). */
export const generateOtpCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

/** The raw token that goes in the session cookie — never stored as-is, see hashToken. */
export const generateSessionToken = (): string => randomBytes(32).toString('hex');

/** CSRF/replay guard for the OAuth redirect round-trip. */
export const generateOAuthState = (): string => randomBytes(16).toString('hex');

/** One-way hash for anything stored in the DB that must not be replayable from a DB leak alone. */
export const hashToken = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
