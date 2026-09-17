import { ConflictException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { GroupsService } from './groups.service';

/** Hits the real dev Postgres — see friends.service.spec.ts for why. */
describe('GroupsService (integration)', () => {
  const prisma = new PrismaService();
  const friendsService = new FriendsService(prisma);
  const groups = new GroupsService(prisma, friendsService);

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
});
