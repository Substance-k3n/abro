import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  type RequestOtpInput,
  type VerifyOtpInput,
  requestOtpSchema,
  verifyOtpSchema,
} from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { toAuthProfile } from '../../common/mappers/to-auth-profile';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { SESSION_COOKIE, SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';
import { generateOAuthState } from './crypto.util';

const OAUTH_STATE_COOKIE = 'abro_oauth_state';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3200';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleOAuthService,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOtp(@Body(new ZodValidationPipe(requestOtpSchema)) body: RequestOtpInput) {
    await this.auth.requestOtp(body.email);
    return { sent: true };
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) body: VerifyOtpInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { profile, token, expiresAt } = await this.auth.verifyOtp(body.email, body.code, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });
    this.setSessionCookie(res, token, expiresAt);
    return toAuthProfile(profile);
  }

  @Get('google')
  googleStart(@Res() res: Response) {
    if (!this.google.isConfigured()) {
      res.status(HttpStatus.NOT_IMPLEMENTED).json({
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
        message: 'Google OAuth credentials are not configured on this server.',
        path: '/auth/google',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const state = generateOAuthState();
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000,
    });
    res.redirect(this.google.buildAuthUrl(state));
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const expectedState: string | undefined = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE);

    if (!code || !state || !expectedState || state !== expectedState) {
      res.redirect(`${WEB_ORIGIN}/sign-in?error=oauth_state`);
      return;
    }

    const { profile, token, expiresAt } = await this.auth.signInWithGoogle(code, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });
    this.setSessionCookie(res, token, expiresAt);
    res.redirect(`${WEB_ORIGIN}/dashboard`);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw: string | undefined = req.cookies?.[SESSION_COOKIE];
    if (raw) {
      await this.auth.revokeSession(raw);
    }
    res.clearCookie(SESSION_COOKIE);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: Profile) {
    return toAuthProfile(user);
  }

  private setSessionCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
  }
}
