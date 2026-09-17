import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateGroupInput, UpdateGroupInput } from '@abro/types';

import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, input: CreateGroupInput) {
    // Deduped once and reused everywhere below -- a duplicate memberId
    // would otherwise both re-check the same friendship redundantly and
    // (worse) hit GroupMember's [groupId, userId] unique constraint when
    // creating members.
    const memberIds = [...new Set(input.memberIds ?? [])];

    for (const memberId of memberIds) {
      if (!(await this.friends.areFriends(userId, memberId))) {
        throw new ConflictException({
          code: 'NOT_FRIENDS',
          message: `User ${memberId} must be a friend before joining a group.`,
        });
      }
    }

    const group = await this.prisma.group.create({
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
            ...memberIds.map((memberId) => ({
              userId: memberId,
              role: 'MEMBER' as const,
              status: 'INVITED' as const,
            })),
          ],
        },
      },
      include: { members: { include: { user: true } } },
    });

    await this.notifications.notifyMany(
      memberIds,
      'GROUP_INVITATION',
      'Group invitation',
      `You've been invited to join "${group.name}".`,
    );

    return group;
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
    const before = await this.prisma.group.findUniqueOrThrow({ where: { id: groupId } });

    const updated = await this.prisma.group.update({
      where: { id: groupId },
      data: input,
    });

    // ABRO_PRD.md §34 DEBT_SIMPLIFICATION_CHANGE (Assumption: the only
    // concrete trigger for this event, since simplification itself is a
    // computed view, not stored data -- see analytics.ts's sibling note
    // in docs/BACKEND_PLAN.md item 3 for the same kind of scope call).
    if (input.simplifyDebts !== undefined && input.simplifyDebts !== before.simplifyDebts) {
      const others = await this.prisma.groupMember.findMany({
        where: { groupId, status: 'ACTIVE', userId: { not: userId } },
        select: { userId: true },
      });
      await this.notifications.notifyMany(
        others.map((m) => m.userId),
        'DEBT_SIMPLIFICATION_CHANGE',
        'Debt simplification setting changed',
        `Debt simplification is now ${updated.simplifyDebts ? 'on' : 'off'} for "${updated.name}".`,
      );
    }

    return updated;
  }

  async addMember(actorId: string, groupId: string, targetUserId: string) {
    const group = await this.requireGroup(groupId);
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

    const membership = existing
      ? // joinedAt doubles as invitedAt for listMyInvites -- reset it so a
        // re-invite after leaving shows up as a fresh invite, not the stale
        // timestamp/ordering from their original membership.
        await this.prisma.groupMember.update({
          where: { id: existing.id },
          data: { status: 'INVITED', role: 'MEMBER', joinedAt: new Date() },
        })
      : await this.prisma.groupMember.create({
          data: { groupId, userId: targetUserId, role: 'MEMBER', status: 'INVITED' },
        });

    await this.notifications.notify(
      targetUserId,
      'GROUP_INVITATION',
      'Group invitation',
      `You've been invited to join "${group.name}".`,
    );

    return membership;
  }

  async acceptInvite(userId: string, groupId: string) {
    const membership = await this.requireMembership(groupId, userId);
    if (membership.status !== 'INVITED') {
      throw new ConflictException({
        code: 'NOT_INVITED',
        message: 'No pending invite for this group.',
      });
    }
    const updated = await this.prisma.groupMember.update({
      where: { id: membership.id },
      data: { status: 'ACTIVE' },
    });

    await this.notifyOtherActiveMembers(groupId, userId, 'joined the group');
    return updated;
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
    await this.notifyOtherActiveMembers(groupId, targetUserId, 'left the group');
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

    const updated = await this.prisma.groupMember.update({
      where: { id: target.id },
      data: { role },
    });

    // ABRO_PRD.md §34 GROUP_MEMBERSHIP_CHANGE (Assumption: only the
    // affected member is notified of their own role change, not the whole
    // group -- kept narrow deliberately, unlike join/leave which are
    // group-wide news).
    if (targetUserId !== actorId) {
      const group = await this.prisma.group.findUniqueOrThrow({ where: { id: groupId } });
      await this.notifications.notify(
        targetUserId,
        'GROUP_MEMBERSHIP_CHANGE',
        'Role changed',
        `Your role in "${group.name}" is now ${role}.`,
      );
    }

    return updated;
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

  private async requireGroup(groupId: string) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'No such group.' });
    }
    return group;
  }

  /** ABRO_PRD.md §34 GROUP_MEMBERSHIP_CHANGE: tells everyone still active except the member who joined/left. */
  private async notifyOtherActiveMembers(
    groupId: string,
    subjectUserId: string,
    verb: string,
  ): Promise<void> {
    const [group, subject, others] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({ where: { id: groupId } }),
      this.prisma.profile.findUnique({ where: { id: subjectUserId } }),
      this.prisma.groupMember.findMany({
        where: { groupId, status: 'ACTIVE', userId: { not: subjectUserId } },
        select: { userId: true },
      }),
    ]);

    await this.notifications.notifyMany(
      others.map((m) => m.userId),
      'GROUP_MEMBERSHIP_CHANGE',
      'Group membership changed',
      `${subject?.displayName ?? 'Someone'} ${verb} in "${group.name}".`,
    );
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
