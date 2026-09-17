import { Injectable, InternalServerErrorException } from '@nestjs/common';

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Raw OAuth2 code exchange against Google's endpoints — no passport
 * dependency, since the flow is just two HTTP calls. Scaffolded against env
 * placeholders per docs/DECISIONS.md ADR-004; isConfigured() lets the
 * controller fail clearly instead of crashing when they're unset.
 */
@Injectable()
export class GoogleOAuthService {
  private get clientId() {
    return process.env.GOOGLE_CLIENT_ID;
  }
  private get clientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET;
  }
  private get callbackUrl() {
    return process.env.GOOGLE_CALLBACK_URL;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.callbackUrl);
  }

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId ?? '',
      redirect_uri: this.callbackUrl ?? '',
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleProfile> {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId ?? '',
        client_secret: this.clientSecret ?? '',
        redirect_uri: this.callbackUrl ?? '',
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new InternalServerErrorException({
        code: 'GOOGLE_TOKEN_EXCHANGE_FAILED',
        message: 'Could not complete Google sign-in.',
      });
    }

    const tokens = (await tokenResponse.json()) as { access_token: string };

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new InternalServerErrorException({
        code: 'GOOGLE_USERINFO_FAILED',
        message: 'Could not complete Google sign-in.',
      });
    }

    return (await userInfoResponse.json()) as GoogleProfile;
  }
}
