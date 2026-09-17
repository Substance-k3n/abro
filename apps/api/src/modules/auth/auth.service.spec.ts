import { BadRequestException, HttpException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashToken } from './crypto.util';
import { GoogleOAuthService, type GoogleProfile } from './google-oauth.service';
import type { OtpMailer } from './otp-mailer';

/**
 * Real Postgres + real AuthService, matching the pattern established by
 * friends/groups/expenses/balances/settlements specs -- no mocked Prisma.
 *
 * Two dependencies of AuthService can't reasonably hit the real world in a
 * test: the OTP mailer (would need a real inbox) and GoogleOAuthService
 * (would need a real Google OAuth code exchange). Both are swapped for
 * hand-written test doubles that satisfy the same class/interface instead
 * of using a mocking library -- RecordingOtpMailer just remembers the last
 * code passed to send(), and FakeGoogleOAuthService is a GoogleOAuthService
 * subclass whose exchangeCode() returns a canned profile instead of calling
 * Google. This is the "small design choice" flagged in docs/BACKEND_PLAN.md
 * item 1.
 */
class RecordingOtpMailer implements OtpMailer {
  lastEmail: string | null = null;
  lastCode: string | null = null;

  async send(email: string, code: string): Promise<void> {
    this.lastEmail = email;
    this.lastCode = code;
  }
}

class FakeGoogleOAuthService extends GoogleOAuthService {
  nextProfile!: GoogleProfile;

  async exchangeCode(): Promise<GoogleProfile> {
    return this.nextProfile;
  }
}

describe('AuthService (integration)', () => {
  const prisma = new PrismaService();
  const mailer = new RecordingOtpMailer();
  const google = new FakeGoogleOAuthService();
  const auth = new AuthService(prisma, google, mailer);

  const createdProfileEmails: string[] = [];
  const testEmail = (label: string) =>
    `test-auth-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.session.deleteMany({
      where: { user: { email: { in: createdProfileEmails } } },
    });
    await prisma.oAuthAccount.deleteMany({
      where: { user: { email: { in: createdProfileEmails } } },
    });
    await prisma.otpCode.deleteMany({ where: { email: { in: createdProfileEmails } } });
    await prisma.profile.deleteMany({ where: { email: { in: createdProfileEmails } } });
    createdProfileEmails.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('requestOtp / verifyOtp', () => {
    it('sends a 6-digit code and lets verifyOtp with that code create a profile + session', async () => {
      const email = testEmail('otp-happy');
      createdProfileEmails.push(email);

      await auth.requestOtp(email);
      expect(mailer.lastEmail).toBe(email);
      expect(mailer.lastCode).toMatch(/^\d{6}$/);

      const result = await auth.verifyOtp(email, mailer.lastCode!, {});
      expect(result.profile.email).toBe(email);
      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const session = await prisma.session.findFirst({ where: { userId: result.profile.id } });
      expect(session).not.toBeNull();
    });

    it('rejects a second requestOtp within the cooldown window', async () => {
      const email = testEmail('otp-cooldown');
      createdProfileEmails.push(email);

      await auth.requestOtp(email);
      await expect(auth.requestOtp(email)).rejects.toThrow(HttpException);
    });

    it('rejects an incorrect code and increments attempts', async () => {
      const email = testEmail('otp-incorrect');
      createdProfileEmails.push(email);

      await auth.requestOtp(email);
      const wrongCode = mailer.lastCode === '000000' ? '111111' : '000000';

      await expect(auth.verifyOtp(email, wrongCode, {})).rejects.toThrow(BadRequestException);

      const otp = await prisma.otpCode.findFirst({ where: { email } });
      expect(otp?.attempts).toBe(1);
    });

    it('locks out after OTP_MAX_ATTEMPTS incorrect attempts, even with the right code', async () => {
      const email = testEmail('otp-lockout');
      createdProfileEmails.push(email);

      await auth.requestOtp(email);
      const correctCode = mailer.lastCode!;
      const wrongCode = correctCode === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i++) {
        await expect(auth.verifyOtp(email, wrongCode, {})).rejects.toThrow(BadRequestException);
      }

      await expect(auth.verifyOtp(email, correctCode, {})).rejects.toMatchObject({
        response: { code: 'OTP_LOCKED' },
      });
    });

    it('rejects an expired code', async () => {
      const email = testEmail('otp-expired');
      createdProfileEmails.push(email);

      const code = '654321';
      await prisma.otpCode.create({
        data: {
          email,
          codeHash: hashToken(code),
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      await expect(auth.verifyOtp(email, code, {})).rejects.toMatchObject({
        response: { code: 'OTP_EXPIRED' },
      });
    });

    it('rejects verifyOtp when no code was ever requested', async () => {
      const email = testEmail('otp-none');
      createdProfileEmails.push(email);

      await expect(auth.verifyOtp(email, '123456', {})).rejects.toMatchObject({
        response: { code: 'OTP_EXPIRED' },
      });
    });

    it('reuses an existing Profile on a second OTP sign-in for the same email', async () => {
      const email = testEmail('otp-reuse');
      createdProfileEmails.push(email);

      await auth.requestOtp(email);
      const first = await auth.verifyOtp(email, mailer.lastCode!, {});

      // A second requestOtp() within the 60s cooldown would itself throw
      // (verified separately above) -- inserted directly here to isolate
      // the "does verifyOtp reuse the Profile" behavior from the cooldown.
      const secondCode = '135790';
      await prisma.otpCode.create({
        data: { email, codeHash: hashToken(secondCode), expiresAt: new Date(Date.now() + 60_000) },
      });
      const second = await auth.verifyOtp(email, secondCode, {});

      expect(second.profile.id).toBe(first.profile.id);
      const profileCount = await prisma.profile.count({ where: { email } });
      expect(profileCount).toBe(1);
    });
  });

  describe('signInWithGoogle', () => {
    it('creates a new Profile + OAuthAccount on first sign-in', async () => {
      const email = testEmail('google-new');
      createdProfileEmails.push(email);
      google.nextProfile = {
        sub: `sub-${email}`,
        email,
        email_verified: true,
        name: 'Google User',
      };

      const result = await auth.signInWithGoogle('unused-code', {});
      expect(result.profile.email).toBe(email);
      expect(result.profile.displayName).toBe('Google User');

      const link = await prisma.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: `sub-${email}` },
        },
      });
      expect(link?.userId).toBe(result.profile.id);
    });

    it('reuses the linked Profile on a second sign-in via the same Google account', async () => {
      const email = testEmail('google-repeat');
      createdProfileEmails.push(email);
      google.nextProfile = { sub: `sub-${email}`, email, email_verified: true };

      const first = await auth.signInWithGoogle('unused-code', {});
      const second = await auth.signInWithGoogle('unused-code', {});

      expect(second.profile.id).toBe(first.profile.id);
      const accountCount = await prisma.oAuthAccount.count({
        where: { providerAccountId: `sub-${email}` },
      });
      expect(accountCount).toBe(1);
    });

    it('links to an existing OTP-created Profile by email instead of duplicating it', async () => {
      const email = testEmail('google-link');
      createdProfileEmails.push(email);

      await auth.requestOtp(email);
      const otpResult = await auth.verifyOtp(email, mailer.lastCode!, {});

      google.nextProfile = { sub: `sub-${email}`, email, email_verified: true };
      const googleResult = await auth.signInWithGoogle('unused-code', {});

      expect(googleResult.profile.id).toBe(otpResult.profile.id);
      const profileCount = await prisma.profile.count({ where: { email } });
      expect(profileCount).toBe(1);
    });

    it('normalizes Google email casing to match the OTP schema (case-insensitive linking)', async () => {
      const email = testEmail('google-case');
      createdProfileEmails.push(email);

      await auth.requestOtp(email);
      const otpResult = await auth.verifyOtp(email, mailer.lastCode!, {});

      google.nextProfile = {
        sub: `sub-${email}`,
        email: email.toUpperCase(),
        email_verified: true,
      };
      const googleResult = await auth.signInWithGoogle('unused-code', {});

      expect(googleResult.profile.id).toBe(otpResult.profile.id);
    });

    it('rejects an unverified Google email', async () => {
      const email = testEmail('google-unverified');
      createdProfileEmails.push(email);
      google.nextProfile = { sub: `sub-${email}`, email, email_verified: false };

      await expect(auth.signInWithGoogle('unused-code', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeSession', () => {
    it('marks the session revoked so it can no longer be used', async () => {
      const email = testEmail('revoke');
      createdProfileEmails.push(email);

      await auth.requestOtp(email);
      const result = await auth.verifyOtp(email, mailer.lastCode!, {});

      await auth.revokeSession(result.token);

      const session = await prisma.session.findFirst({ where: { userId: result.profile.id } });
      expect(session?.revokedAt).not.toBeNull();
    });

    it('is a no-op for an unknown token (does not throw)', async () => {
      await expect(auth.revokeSession('not-a-real-token')).resolves.toBeUndefined();
    });
  });
});
