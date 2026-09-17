import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { SessionGuard } from './session.guard';
import { ConsoleOtpMailer, OTP_MAILER } from './otp-mailer';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleOAuthService,
    SessionGuard,
    { provide: OTP_MAILER, useClass: ConsoleOtpMailer },
  ],
  // SessionGuard is reused by every other module that needs @UseGuards(SessionGuard).
  exports: [SessionGuard],
})
export class AuthModule {}
