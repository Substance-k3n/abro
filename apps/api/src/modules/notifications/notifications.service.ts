import { Injectable, NotFoundException } from '@nestjs/common';
import type { ListNotificationsQuery, NotificationType } from '@abro/types';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * In-app notifications -- ABRO_PRD.md §34. No push/email/Telegram (PRD:
 * "Later"). Called from the modules that own each event (expenses, groups,
 * settlements, and eventually recurring) rather than emitting anything
 * itself -- this service only knows how to store and read rows.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userId: string, type: NotificationType, title: string, body: string) {
    return this.prisma.notification.create({ data: { userId, type, title, body } });
  }

  /** Fans the same event out to several recipients; de-dupes and no-ops on an empty list. */
  async notifyMany(userIds: string[], type: NotificationType, title: string, body: string) {
    const recipients = Array.from(new Set(userIds));
    if (recipients.length === 0) {
      return;
    }
    await this.prisma.notification.createMany({
      data: recipients.map((userId) => ({ userId, type, title, body })),
    });
  }

  list(userId: string, query: ListNotificationsQuery) {
    return this.prisma.notification.findMany({
      where: { userId, ...(query.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
    });
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'No such notification.',
      });
    }
    if (notification.readAt) {
      return notification;
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
