import {
  generateOAuthState,
  generateOtpCode,
  generateSessionToken,
  hashToken,
} from './crypto.util';

describe('crypto.util', () => {
  describe('generateOtpCode', () => {
    it('always produces a zero-padded 6-digit string', () => {
      for (let i = 0; i < 200; i++) {
        const code = generateOtpCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });

    it('is not constant across calls', () => {
      const codes = new Set(Array.from({ length: 50 }, () => generateOtpCode()));
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe('generateSessionToken', () => {
    it('produces a 64-char hex string (32 random bytes)', () => {
      const token = generateSessionToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is unique across calls', () => {
      const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
      expect(tokens.size).toBe(50);
    });
  });

  describe('generateOAuthState', () => {
    it('produces a 32-char hex string (16 random bytes)', () => {
      const state = generateOAuthState();
      expect(state).toMatch(/^[0-9a-f]{32}$/);
    });

    it('is unique across calls', () => {
      const states = new Set(Array.from({ length: 50 }, () => generateOAuthState()));
      expect(states.size).toBe(50);
    });
  });

  describe('hashToken', () => {
    it('is deterministic for the same input', () => {
      expect(hashToken('abc')).toBe(hashToken('abc'));
    });

    it('produces a 64-char hex string (sha256 digest)', () => {
      expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different hashes for different inputs', () => {
      expect(hashToken('abc')).not.toBe(hashToken('abd'));
    });
  });
});
