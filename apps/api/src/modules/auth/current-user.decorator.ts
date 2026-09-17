import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Profile } from '@prisma/client';
import type { Request } from 'express';

/** Reads the Profile SessionGuard attached to the request. Only valid behind @UseGuards(SessionGuard). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Profile => {
  const req = ctx.switchToHttp().getRequest<Request & { user: Profile }>();
  return req.user;
});
