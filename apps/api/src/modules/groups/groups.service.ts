import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateGroupInput, UpdateGroupInput } from '@abro/types';

import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) {}

  async create(userId: string, input: CreateGroupInput) {
    for (const memberId of input.memberIds ?? []) {
      if (!(await this.friends.areFriends(userId, memberId))) {
        throw new ConflictException({
          code: 'NOT_FRIENDS',
          message: `User ${memberId} must be a friend before joining a group.`,
        });
      }
    }

    return this.prisma.group.create({
      data: {
        name: input.name,
        type: input.type,
        currency: input.currency,
        description: input.description,
        simplifyDebts: input.simplifyDebts,
        createdById: userId,
        members: {
          create: [
            { userId, role: 'ADMIN', status: 'ACTIVE' },
            ...(input.memberIds ?? []).map((memberId) => ({
              userId: memberId,
              role: 'MEMBER' as const,
              status: 'INVITED' as const,
            })),
          ],
        },
      },
      include: { members: { include: { user: true } } },
    });
  }

  async listMine(userId: string) {
    return this.prisma.group.findMany({
      where: { members: { some: { userId, status: 'ACTIVE' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listMyInvites(userId: string) {
    const rows = await this.prisma.groupMember.findMany({
      where: { userId, status: 'INVITED' },
      include: { group: true },
      orderBy: { joinedAt: 'desc' },
    });
    return rows.map((row) => ({ group: row.group, invitedAt: row.joinedAt }));
  }

  async findById(userId: string, groupId: string) {
    await this.requireActiveMembership(groupId, userId);

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: { include: { user: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'No such group.' });
    }
    return group;
  }

  async update(userId: string, groupId: string, input: UpdateGroupInput) {
    await this.requireActiveAdmin(groupId, userId);

    return this.prisma.group.update({
      where: { id: groupId },
      data: input,
    });
  }

  async addMember(actorId: string, groupId: string, targetUserId: string) {
    await this.requireActiveAdmin(groupId, actorId);

    if (!(await this.friends.areFriends(actorId, targetUserId))) {
      throw new ConflictException({
        code: 'NOT_FRIENDS',
        message: 'Can only add an existing friend to a group.',
      });
    }

    const existing = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (existing && existing.status !== 'LEFT') {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: 'Already a member or invited.',
      });
    }

    if (existing) {
      return this.prisma.groupMember.update({
        where: { id: existing.id },
        data: { status: 'INVITED', role: 'MEMBER' },
      });
    }

    return this.prisma.groupMember.create({
      data: { groupId, userId: targetUserId, role: 'MEMBER', status: 'INVITED' },
    });
  }

  async acceptInvite(userId: string, groupId: string) {
    const membership = await this.requireMembership(groupId, userId);
    if (membership.status !== 'INVITED') {
      throw new ConflictException({
        code: 'NOT_INVITED',
        message: 'No pending invite for this group.',
      });
    }
    return this.prisma.groupMember.update({
      where: { id: membership.id },
      data: { status: 'ACTIVE' },
    });
  }

  async removeMember(actorId: string, groupId: string, targetUserId: string): Promise<void> {
    const target = await this.requireMembership(groupId, targetUserId);

    if (actorId !== targetUserId) {
      await this.requireActiveAdmin(groupId, actorId);
    }

    if (target.status === 'ACTIVE' && target.role === 'ADMIN') {
      const remainingAdmins = await this.prisma.groupMember.count({
        where: { groupId, role: 'ADMIN', status: 'ACTIVE', userId: { not: targetUserId } },
      });
      if (remainingAdmins === 0) {
        throw new ConflictException({
          code: 'LAST_ADMIN',
          message: 'Promote another member to admin before removing the last one.',
        });
      }
    }

    await this.prisma.groupMember.update({ where: { id: target.id }, data: { status: 'LEFT' } });
  }

  async updateMemberRole(
    actorId: string,
    groupId: string,
    targetUserId: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    await this.requireActiveAdmin(groupId, actorId);
    const target = await this.requireMembership(groupId, targetUserId);

    if (target.status !== 'ACTIVE') {
      throw new ConflictException({ code: 'NOT_ACTIVE_MEMBER', message: 'Member is not active.' });
    }

    if (target.role === 'ADMIN' && role === 'MEMBER') {
      const remainingAdmins = await this.prisma.groupMember.count({
        where: { groupId, role: 'ADMIN', status: 'ACTIVE', userId: { not: targetUserId } },
      });
      if (remainingAdmins === 0) {
        throw new ConflictException({
          code: 'LAST_ADMIN',
          message: 'Promote another member to admin before demoting the last one.',
        });
      }
    }

    return this.prisma.groupMember.update({ where: { id: target.id }, data: { role } });
  }

  /** Used by the expenses module to validate paidBy/participants are active group members. */
  async requireActiveMembership(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'NOT_GROUP_MEMBER',
        message: 'Not an active member of this group.',
      });
    }
    return membership;
  }

  private async requireActiveAdmin(groupId: string, userId: string) {
    const membership = await this.requireActiveMembership(groupId, userId);
    if (membership.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'NOT_GROUP_ADMIN',
        message: 'Only a group admin can do this.',
      });
    }
    return membership;
  }

  private async requireMembership(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'No membership record found.',
      });
    }
    return membership;
  }
}
