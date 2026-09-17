import { ConflictException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GroupsService } from './groups.service';

/** Hits the real dev Postgres — see friends.service.spec.ts for why. */
describe('GroupsService (integration)', () => {
  const prisma = new PrismaService();
  const notifications = new NotificationsService(prisma);
  const friendsService = new FriendsService(prisma);
  const groups = new GroupsService(prisma, friendsService, notifications);

  const createdProfileIds: string[] = [];
  const createdGroupIds: string[] = [];

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-groups-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
      },
    });
    createdProfileIds.push(profile.id);
    return profile;
  };

  /** Creates an ACCEPTED friendship directly, bypassing the request/accept flow. */
  const makeFriends = async (userId: string, friendId: string) => {
    await prisma.friendship.create({ data: { userId, friendId, status: 'ACCEPTED' } });
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.groupMember.deleteMany({ where: { groupId: { in: createdGroupIds } } });
    await prisma.group.deleteMany({ where: { id: { in: createdGroupIds } } });
    await prisma.friendship.deleteMany({
      where: {
        OR: [{ userId: { in: createdProfileIds } }, { friendId: { in: createdProfileIds } }],
      },
    });
    await prisma.notification.deleteMany({ where: { userId: { in: createdProfileIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: createdProfileIds } } });
    await prisma.$disconnect();
  });

  it('creates a group, making the creator the sole ACTIVE admin', async () => {
    const owner = await makeProfile('Owner');

    const group = await groups.create(owner.id, {
      name: 'Trip',
      type: 'TRIP',
      currency: 'ETB',
      simplifyDebts: true,
    });
    createdGroupIds.push(group.id);

    expect(group.members).toHaveLength(1);
    expect(group.members[0]).toMatchObject({ userId: owner.id, role: 'ADMIN', status: 'ACTIVE' });
  });

  it('rejects a non-friend as an initial member on create', async () => {
    const owner = await makeProfile('Owner');
    const stranger = await makeProfile('Stranger');

    await expect(
      groups.create(owner.id, {
        name: 'Trip',
        type: 'TRIP',
        currency: 'ETB',
        simplifyDebts: true,
        memberIds: [stranger.id],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('adds a friend-only initial member as INVITED, who then accepts to become ACTIVE', async () => {
    const owner = await makeProfile('Owner');
    const friend = await makeProfile('Friend');
    await makeFriends(owner.id, friend.id);

    const group = await groups.create(owner.id, {
      name: 'Trip',
      type: 'TRIP',
      currency: 'ETB',
      simplifyDebts: true,
      memberIds: [friend.id],
    });
    createdGroupIds.push(group.id);

    const friendMember = group.members.find((m) => m.userId === friend.id)!;
    expect(friendMember.status).toBe('INVITED');

    const invites = await groups.listMyInvites(friend.id);
    expect(invites.map((i) => i.group.id)).toContain(group.id);

    await groups.acceptInvite(friend.id, group.id);
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: friend.id } },
    });
    expect(membership?.status).toBe('ACTIVE');
  });

  it('blocks addMember for a non-friend even by an admin', async () => {
    const owner = await makeProfile('Owner');
    const stranger = await makeProfile('Stranger');
    const group = await groups.create(owner.id, {
      name: 'Trip',
      type: 'TRIP',
      currency: 'ETB',
      simplifyDebts: true,
    });
    createdGroupIds.push(group.id);

    await expect(groups.addMember(owner.id, group.id, stranger.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('blocks a non-admin from updating the group', async () => {
    const owner = await makeProfile('Owner');
    const friend = await makeProfile('Friend');
    await makeFriends(owner.id, friend.id);

    const group = await groups.create(owner.id, {
      name: 'Trip',
      type: 'TRIP',
      currency: 'ETB',
      simplifyDebts: true,
      memberIds: [friend.id],
    });
    createdGroupIds.push(group.id);
    await groups.acceptInvite(friend.id, group.id);

    await expect(groups.update(friend.id, group.id, { name: 'Renamed' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('blocks removing the last active admin', async () => {
    const owner = await makeProfile('Owner');
    const group = await groups.create(owner.id, {
      name: 'Solo',
      type: 'OTHER',
      currency: 'ETB',
      simplifyDebts: true,
    });
    createdGroupIds.push(group.id);

    await expect(groups.removeMember(owner.id, group.id, owner.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('blocks demoting the last active admin', async () => {
    const owner = await makeProfile('Owner');
    const group = await groups.create(owner.id, {
      name: 'Solo',
      type: 'OTHER',
      currency: 'ETB',
      simplifyDebts: true,
    });
    createdGroupIds.push(group.id);

    await expect(groups.updateMemberRole(owner.id, group.id, owner.id, 'MEMBER')).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows removing an admin once a second admin exists, and leaving is a soft LEFT status not a row delete', async () => {
    const owner = await makeProfile('Owner');
    const friend = await makeProfile('Friend');
    await makeFriends(owner.id, friend.id);

    const group = await groups.create(owner.id, {
      name: 'Trip',
      type: 'TRIP',
      currency: 'ETB',
      simplifyDebts: true,
      memberIds: [friend.id],
    });
    createdGroupIds.push(group.id);
    await groups.acceptInvite(friend.id, group.id);
    await groups.updateMemberRole(owner.id, group.id, friend.id, 'ADMIN');

    await groups.removeMember(owner.id, group.id, owner.id);

    const removed = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: owner.id } },
    });
    expect(removed?.status).toBe('LEFT');
    expect(removed).not.toBeNull();

    // A departed member no longer counts as an active member.
    await expect(groups.requireActiveMembership(group.id, owner.id)).rejects.toThrow(
      ForbiddenException,
    );
    // But the historical row itself still exists (never deleted), so past
    // expense attribution to them survives.
    const stillListed = await groups.listMine(owner.id);
    expect(stillListed.map((g) => g.id)).not.toContain(group.id);
  });

  it('re-inviting a member who left refreshes joinedAt, so listMyInvites shows the new invite, not the stale one', async () => {
    const owner = await makeProfile('Owner');
    const friend = await makeProfile('Friend');
    await makeFriends(owner.id, friend.id);

    const group = await groups.create(owner.id, {
      name: 'Trip',
      type: 'TRIP',
      currency: 'ETB',
      simplifyDebts: true,
      memberIds: [friend.id],
    });
    createdGroupIds.push(group.id);
    const firstInvite = (await groups.listMyInvites(friend.id))[0]!;

    await groups.acceptInvite(friend.id, group.id);
    await groups.removeMember(friend.id, group.id, friend.id);
    await groups.addMember(owner.id, group.id, friend.id);

    const secondInvite = (await groups.listMyInvites(friend.id))[0]!;
    expect(secondInvite.invitedAt.getTime()).toBeGreaterThan(firstInvite.invitedAt.getTime());
  });

  describe('notifications (ABRO_PRD.md §34)', () => {
    it('notifies invited members on create, and a re-invited member via addMember', async () => {
      const owner = await makeProfile('NotifyOwner');
      const friend = await makeProfile('NotifyFriend');
      await makeFriends(owner.id, friend.id);

      const group = await groups.create(owner.id, {
        name: 'Notify Trip',
        type: 'TRIP',
        currency: 'ETB',
        simplifyDebts: true,
        memberIds: [friend.id],
      });
      createdGroupIds.push(group.id);

      expect(
        await prisma.notification.count({ where: { userId: friend.id, type: 'GROUP_INVITATION' } }),
      ).toBe(1);
      expect(
        await prisma.notification.count({ where: { userId: owner.id, type: 'GROUP_INVITATION' } }),
      ).toBe(0);

      await groups.acceptInvite(friend.id, group.id);
      await groups.removeMember(friend.id, group.id, friend.id);
      await groups.addMember(owner.id, group.id, friend.id);

      expect(
        await prisma.notification.count({ where: { userId: friend.id, type: 'GROUP_INVITATION' } }),
      ).toBe(2);
    });

    it('notifies other active members when someone joins or leaves, but not the actor', async () => {
      const owner = await makeProfile('NotifyJoinOwner');
      const friend = await makeProfile('NotifyJoinFriend');
      const observer = await makeProfile('NotifyJoinObserver');
      await makeFriends(owner.id, friend.id);
      await makeFriends(owner.id, observer.id);

      const group = await groups.create(owner.id, {
        name: 'Notify Household',
        type: 'HOUSEHOLD',
        currency: 'ETB',
        simplifyDebts: true,
        memberIds: [friend.id, observer.id],
      });
      createdGroupIds.push(group.id);
      await groups.acceptInvite(observer.id, group.id);

      const countOf = (userId: string) =>
        prisma.notification.count({ where: { userId, type: 'GROUP_MEMBERSHIP_CHANGE' } });
      const [ownerBefore, observerBefore] = await Promise.all([
        countOf(owner.id),
        countOf(observer.id),
      ]);

      await groups.acceptInvite(friend.id, group.id);
      // owner + observer are active at this point -- both should hear about it, not friend themself.
      expect(await countOf(friend.id)).toBe(0);
      expect(await countOf(owner.id)).toBe(ownerBefore + 1);
      expect(await countOf(observer.id)).toBe(observerBefore + 1);

      const ownerAfterJoin = await countOf(owner.id);
      await groups.removeMember(friend.id, group.id, friend.id);
      expect(await countOf(owner.id)).toBe(ownerAfterJoin + 1);
    });

    it('notifies only the target member on a role change', async () => {
      const owner = await makeProfile('NotifyRoleOwner');
      const friend = await makeProfile('NotifyRoleFriend');
      await makeFriends(owner.id, friend.id);

      const group = await groups.create(owner.id, {
        name: 'Notify Role Group',
        type: 'OTHER',
        currency: 'ETB',
        simplifyDebts: true,
        memberIds: [friend.id],
      });
      createdGroupIds.push(group.id);
      await groups.acceptInvite(friend.id, group.id);

      const countOf = (userId: string) =>
        prisma.notification.count({ where: { userId, type: 'GROUP_MEMBERSHIP_CHANGE' } });
      const [friendBefore, ownerBefore] = await Promise.all([
        countOf(friend.id),
        countOf(owner.id),
      ]);

      await groups.updateMemberRole(owner.id, group.id, friend.id, 'ADMIN');

      expect(await countOf(friend.id)).toBe(friendBefore + 1);
      expect(await countOf(owner.id)).toBe(ownerBefore);
    });

    it('notifies other active members when simplifyDebts is toggled, not on unrelated updates', async () => {
      const owner = await makeProfile('NotifySimplifyOwner');
      const friend = await makeProfile('NotifySimplifyFriend');
      await makeFriends(owner.id, friend.id);

      const group = await groups.create(owner.id, {
        name: 'Notify Simplify Group',
        type: 'OTHER',
        currency: 'ETB',
        simplifyDebts: true,
        memberIds: [friend.id],
      });
      createdGroupIds.push(group.id);
      await groups.acceptInvite(friend.id, group.id);

      await groups.update(owner.id, group.id, { description: 'no simplify change' });
      expect(
        await prisma.notification.count({
          where: { userId: friend.id, type: 'DEBT_SIMPLIFICATION_CHANGE' },
        }),
      ).toBe(0);

      await groups.update(owner.id, group.id, { simplifyDebts: false });
      expect(
        await prisma.notification.count({
          where: { userId: friend.id, type: 'DEBT_SIMPLIFICATION_CHANGE' },
        }),
      ).toBe(1);
    });
  });
});
