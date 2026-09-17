import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';
import { hashToken } from './crypto.util';

export const SESSION_COOKIE = 'abro_session';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const raw: string | undefined = req.cookies?.[SESSION_COOKIE];

    if (!raw) {
      throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Not signed in.' });
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'INVALID_SESSION',
        message: 'Session expired or invalid.',
      });
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    (req as Request & { user: typeof session.user }).user = session.user;
    return true;
  }
}
