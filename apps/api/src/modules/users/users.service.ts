import { Injectable } from '@nestjs/common';
import type { UpdateProfileInput } from '@abro/types';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  updateProfile(userId: string, input: UpdateProfileInput) {
    return this.prisma.profile.update({ where: { id: userId }, data: input });
  }
}
