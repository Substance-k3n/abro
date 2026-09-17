import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Exact email/phone match only — never a fuzzy name search, so you can't browse the user directory. */
  async search(query: string, excludeUserId: string) {
    const profile = await this.prisma.profile.findFirst({
      where: {
        id: { not: excludeUserId },
        OR: [{ email: query }, { phone: query }],
      },
    });
    return profile ? [profile] : [];
  }

  async list(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userId }, { friendId: userId }] },
      include: { user: true, friend: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      friendshipId: row.id,
      since: row.createdAt,
      friend: row.userId === userId ? row.friend : row.user,
    }));
  }

  async listIncomingRequests(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { friendId: userId, status: 'PENDING' },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({ friendshipId: row.id, from: row.user, sentAt: row.createdAt }));
  }

  async sendRequest(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new ConflictException({
        code: 'CANNOT_FRIEND_SELF',
        message: 'You cannot friend yourself.',
      });
    }

    const target = await this.prisma.profile.findUnique({ where: { id: friendId } });
    if (!target) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'No such user.' });
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'FRIENDSHIP_EXISTS',
        message: `A friendship already exists with status ${existing.status}.`,
      });
    }

    return this.prisma.friendship.create({ data: { userId, friendId } });
  }

  async acceptRequest(userId: string, friendshipId: string) {
    const friendship = await this.findOrThrow(friendshipId);

    if (friendship.friendId !== userId) {
      throw new ForbiddenException({
        code: 'NOT_REQUEST_RECIPIENT',
        message: 'Only the recipient can accept this request.',
      });
    }
    if (friendship.status !== 'PENDING') {
      throw new ConflictException({
        code: 'NOT_PENDING',
        message: 'This request is no longer pending.',
      });
    }

    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED' },
    });
  }

  async declineRequest(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.findOrThrow(friendshipId);

    if (friendship.friendId !== userId) {
      throw new ForbiddenException({
        code: 'NOT_REQUEST_RECIPIENT',
        message: 'Only the recipient can decline this request.',
      });
    }
    if (friendship.status !== 'PENDING') {
      throw new ConflictException({
        code: 'NOT_PENDING',
        message: 'This request is no longer pending.',
      });
    }

    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }

  async unfriend(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.findOrThrow(friendshipId);

    if (friendship.userId !== userId && friendship.friendId !== userId) {
      throw new ForbiddenException({
        code: 'NOT_PARTICIPANT',
        message: 'Not part of this friendship.',
      });
    }
    if (friendship.status !== 'ACCEPTED') {
      throw new ConflictException({ code: 'NOT_FRIENDS', message: 'Not currently friends.' });
    }

    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }

  /** Used by other modules to enforce "must already be friends" invariants (e.g. adding a group member). */
  async areFriends(userIdA: string, userIdB: string): Promise<boolean> {
    if (userIdA === userIdB) {
      return true;
    }
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userId: userIdA, friendId: userIdB },
          { userId: userIdB, friendId: userIdA },
        ],
      },
    });
    return friendship !== null;
  }

  private async findOrThrow(friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) {
      throw new NotFoundException({
        code: 'FRIENDSHIP_NOT_FOUND',
        message: 'No such friend request.',
      });
    }
    return friendship;
  }
}
