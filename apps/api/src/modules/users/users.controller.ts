import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { type UpdateProfileInput, updateProfileSchema } from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { toAuthProfile } from '../../common/mappers/to-auth-profile';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(SessionGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: Profile) {
    return toAuthProfile(user);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: Profile,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    const updated = await this.users.updateProfile(user.id, body);
    return toAuthProfile(updated);
  }
}
