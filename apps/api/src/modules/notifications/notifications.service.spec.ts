import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService (integration)', () => {
  const prisma = new PrismaService();
  const notifications = new NotificationsService(prisma);
  const createdProfileIds: string[] = [];

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-notifications-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
      },
    });
    createdProfileIds.push(profile.id);
    return profile;
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: createdProfileIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: createdProfileIds } } });
    createdProfileIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates and lists a notification, newest first', async () => {
    const user = await makeProfile('A');
    await notifications.notify(user.id, 'SETTLEMENT', 'Title 1', 'Body 1');
    await notifications.notify(user.id, 'GROUP_INVITATION', 'Title 2', 'Body 2');

    const list = await notifications.list(user.id, { unreadOnly: false });
    expect(list).toHaveLength(2);
    expect(list[0]!.title).toBe('Title 2');
    expect(list[1]!.title).toBe('Title 1');
  });

  it('filters to unread only', async () => {
    const user = await makeProfile('A');
    const first = await notifications.notify(user.id, 'SETTLEMENT', 'Read me', 'Body');
    await notifications.notify(user.id, 'SETTLEMENT', 'Unread', 'Body');
    await notifications.markRead(user.id, first.id);

    const unread = await notifications.list(user.id, { unreadOnly: true });
    expect(unread).toHaveLength(1);
    expect(unread[0]!.title).toBe('Unread');
  });

  it('notifyMany de-dupes recipients and no-ops on an empty list', async () => {
    const user = await makeProfile('A');
    await notifications.notifyMany([user.id, user.id], 'SETTLEMENT', 'Title', 'Body');
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1);

    await expect(
      notifications.notifyMany([], 'SETTLEMENT', 'Title', 'Body'),
    ).resolves.toBeUndefined();
  });

  it("markRead is idempotent and rejects marking someone else's notification", async () => {
    const owner = await makeProfile('A');
    const other = await makeProfile('B');
    const notification = await notifications.notify(owner.id, 'SETTLEMENT', 'Title', 'Body');

    const first = await notifications.markRead(owner.id, notification.id);
    expect(first.readAt).not.toBeNull();
    const second = await notifications.markRead(owner.id, notification.id);
    expect(second.readAt?.getTime()).toBe(first.readAt?.getTime());

    await expect(notifications.markRead(other.id, notification.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('markAllRead clears every unread notification for the user only', async () => {
    const user = await makeProfile('A');
    const other = await makeProfile('B');
    await notifications.notify(user.id, 'SETTLEMENT', 'A', 'Body');
    await notifications.notify(user.id, 'SETTLEMENT', 'B', 'Body');
    await notifications.notify(other.id, 'SETTLEMENT', 'C', 'Body');

    await notifications.markAllRead(user.id);

    expect(await notifications.list(user.id, { unreadOnly: true })).toHaveLength(0);
    expect(await notifications.list(other.id, { unreadOnly: true })).toHaveLength(1);
  });
});
