import { Injectable, Logger } from '@nestjs/common';

export const OTP_MAILER = Symbol('OTP_MAILER');

export interface OtpMailer {
  send(email: string, code: string): Promise<void>;
}

/**
 * Dev-only stand-in: logs the code instead of emailing it. No real provider
 * has been chosen yet (Resend/SES/etc. — see docs/DECISIONS.md ADR-004's
 * Consequence section) — swap this binding in auth.module.ts once one is.
 */
@Injectable()
export class ConsoleOtpMailer implements OtpMailer {
  private readonly logger = new Logger('OtpMailer');

  async send(email: string, code: string): Promise<void> {
    this.logger.warn(`[DEV ONLY, no real mailer configured] OTP for ${email}: ${code}`);
  }
}
