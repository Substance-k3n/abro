import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Profile } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { GoogleOAuthService } from './google-oauth.service';
import { OTP_MAILER, type OtpMailer } from './otp-mailer';
import { generateOtpCode, generateSessionToken, hashToken } from './crypto.util';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);

interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

interface SessionResult {
  profile: Profile;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleOAuthService,
    @Inject(OTP_MAILER) private readonly mailer: OtpMailer,
  ) {}

  async requestOtp(email: string): Promise<void> {
    const recent = await this.prisma.otpCode.findFirst({
      where: { email, createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new HttpException(
        { code: 'OTP_COOLDOWN', message: 'Wait a moment before requesting another code.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = generateOtpCode();
    await this.prisma.otpCode.create({
      data: { email, codeHash: hashToken(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });

    await this.mailer.send(email, code);
  }

  async verifyOtp(email: string, code: string, meta: SessionMeta): Promise<SessionResult> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: 'Code expired or not found. Request a new one.',
      });
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException({
        code: 'OTP_LOCKED',
        message: 'Too many incorrect attempts. Request a new code.',
      });
    }

    if (otp.codeHash !== hashToken(code)) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException({ code: 'OTP_INCORRECT', message: 'Incorrect code.' });
    }

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const profile = await this.prisma.profile.upsert({
      where: { email },
      update: {},
      create: { email, displayName: email.split('@')[0] ?? email },
    });

    return this.createSession(profile, meta);
  }

  async signInWithGoogle(code: string, meta: SessionMeta): Promise<SessionResult> {
    const googleProfile = await this.google.exchangeCode(code);

    if (googleProfile.email_verified === false) {
      throw new BadRequestException({
        code: 'GOOGLE_EMAIL_UNVERIFIED',
        message: 'Your Google account email is not verified.',
      });
    }

    const existingAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: googleProfile.sub },
      },
      include: { user: true },
    });

    if (existingAccount) {
      return this.createSession(existingAccount.user, meta);
    }

    // Links to an existing Profile by email (e.g. one created via OTP
    // earlier) instead of creating a duplicate — see ADR-004.
    const profile = await this.prisma.profile.upsert({
      where: { email: googleProfile.email },
      update: {},
      create: {
        email: googleProfile.email,
        displayName: googleProfile.name ?? googleProfile.email.split('@')[0] ?? googleProfile.email,
        avatarUrl: googleProfile.picture,
      },
    });

    await this.prisma.oAuthAccount.create({
      data: { userId: profile.id, provider: 'GOOGLE', providerAccountId: googleProfile.sub },
    });

    return this.createSession(profile, meta);
  }

  async revokeSession(rawToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createSession(profile: Profile, meta: SessionMeta): Promise<SessionResult> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        userId: profile.id,
        tokenHash: hashToken(token),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt,
      },
    });

    return { profile, token, expiresAt };
  }
}
