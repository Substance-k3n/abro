import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from './friends.service';

/**
 * Hits the real dev Postgres (matches how this module was originally verified
 * by curl) rather than mocking Prisma — the invariants under test are
 * enforced by DB-backed lookups (unique constraints, findFirst OR-queries),
 * which a mock would let silently pass. Requires the dev DB from
 * infra/docker/dev/compose.yml to be running (DATABASE_URL in apps/api/.env).
 */
describe('FriendsService (integration)', () => {
  const prisma = new PrismaService();
  const friends = new FriendsService(prisma);
  const createdProfileIds: string[] = [];

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-friends-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
      },
    });
    createdProfileIds.push(profile.id);
    return profile;
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.friendship.deleteMany({
      where: {
        OR: [{ userId: { in: createdProfileIds } }, { friendId: { in: createdProfileIds } }],
      },
    });
  });

  afterAll(async () => {
    await prisma.profile.deleteMany({ where: { id: { in: createdProfileIds } } });
    await prisma.$disconnect();
  });

  it('runs a full request -> accept -> areFriends -> unfriend lifecycle', async () => {
    const a = await makeProfile('A');
    const b = await makeProfile('B');

    const request = await friends.sendRequest(a.id, b.id);
    expect(request.status).toBe('PENDING');

    const incoming = await friends.listIncomingRequests(b.id);
    expect(incoming.map((r) => r.friendshipId)).toContain(request.id);

    await friends.acceptRequest(b.id, request.id);
    expect(await friends.areFriends(a.id, b.id)).toBe(true);

    const aList = await friends.list(a.id);
    expect(aList.map((f) => f.friend.id)).toContain(b.id);

    await friends.unfriend(a.id, request.id);
    expect(await friends.areFriends(a.id, b.id)).toBe(false);

    // Unfriending is a hard delete (per docs/DECISIONS.md, unlike Expense's soft-delete-only scope).
    const row = await prisma.friendship.findUnique({ where: { id: request.id } });
    expect(row).toBeNull();
  });

  it('lets the recipient decline a request, hard-deleting it', async () => {
    const a = await makeProfile('A');
    const b = await makeProfile('B');

    const request = await friends.sendRequest(a.id, b.id);
    await friends.declineRequest(b.id, request.id);

    expect(await prisma.friendship.findUnique({ where: { id: request.id } })).toBeNull();
    expect(await friends.areFriends(a.id, b.id)).toBe(false);
  });

  it('rejects a self-friend request', async () => {
    const a = await makeProfile('A');
    await expect(friends.sendRequest(a.id, a.id)).rejects.toThrow(ConflictException);
  });

  it('rejects a duplicate request in either direction', async () => {
    const a = await makeProfile('A');
    const b = await makeProfile('B');

    await friends.sendRequest(a.id, b.id);
    await expect(friends.sendRequest(a.id, b.id)).rejects.toThrow(ConflictException);
    await expect(friends.sendRequest(b.id, a.id)).rejects.toThrow(ConflictException);
  });

  it('only lets the recipient accept a request', async () => {
    const a = await makeProfile('A');
    const b = await makeProfile('B');
    const request = await friends.sendRequest(a.id, b.id);

    await expect(friends.acceptRequest(a.id, request.id)).rejects.toThrow(ForbiddenException);
  });

  it('treats a user as their own friend for areFriends (self-paid expense participant checks)', async () => {
    const a = await makeProfile('A');
    expect(await friends.areFriends(a.id, a.id)).toBe(true);
  });

  it('throws NotFoundException for an unknown friendship id', async () => {
    await expect(friends.acceptRequest('nobody', 'does-not-exist')).rejects.toThrow(
      NotFoundException,
    );
  });
});
