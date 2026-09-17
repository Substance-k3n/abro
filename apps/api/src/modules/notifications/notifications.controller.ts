import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { type ListNotificationsQuery, listNotificationsQuerySchema } from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: Profile,
    @Query(new ZodValidationPipe(listNotificationsQuerySchema)) query: ListNotificationsQuery,
  ) {
    return this.notifications.list(user.id, query);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: Profile) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: Profile, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
