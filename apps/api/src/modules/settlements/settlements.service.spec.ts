import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { GroupsService } from '../groups/groups.service';
import { ExpensesService } from '../expenses/expenses.service';
import { BalancesService } from '../balances/balances.service';
import { SettlementsService } from './settlements.service';

/** Hits the real dev Postgres — see friends.service.spec.ts for why. */
describe('SettlementsService (integration)', () => {
  const prisma = new PrismaService();
  const friendsService = new FriendsService(prisma);
  const groupsService = new GroupsService(prisma, friendsService);
  const expensesService = new ExpensesService(prisma, groupsService, friendsService);
  const balances = new BalancesService(prisma);
  const settlements = new SettlementsService(prisma, balances, groupsService);

  const createdProfileIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdExpenseIds: string[] = [];

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-settlements-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
      },
    });
    createdProfileIds.push(profile.id);
    return profile;
  };

  const makeFriends = async (userId: string, friendId: string) => {
    await prisma.friendship.create({ data: { userId, friendId, status: 'ACCEPTED' } });
  };

  const track = <T extends { id: string }>(expense: T): T => {
    createdExpenseIds.push(expense.id);
    return expense;
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.expenseParticipant.deleteMany({ where: { expenseId: { in: createdExpenseIds } } });
    await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
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

  it('rejects settling with yourself', async () => {
    const a = await makeProfile('A');
    await expect(settlements.create(a.id, { toUserId: a.id, amount: '100' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects settling when there is no outstanding debt', async () => {
    const a = await makeProfile('A');
    const b = await makeProfile('B');
    await makeFriends(a.id, b.id);

    await expect(settlements.create(a.id, { toUserId: b.id, amount: '100' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects a settlement amount that exceeds the outstanding debt', async () => {
    const a = await makeProfile('A');
    const b = await makeProfile('B');
    await makeFriends(a.id, b.id);

    // B pays 100, EQUAL split -> A owes B 50.
    track(
      await expensesService.create(b.id, {
        splitType: 'EQUAL',
        name: 'Coffee',
        category: 'Food',
        amount: '100',
        expenseDate: new Date(),
        participants: [{ userId: a.id }, { userId: b.id }],
      }),
    );

    await expect(settlements.create(a.id, { toUserId: b.id, amount: '51' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('fully settles a debt to zero (PRD §19/§74) and records visible history', async () => {
    const a = await makeProfile('A');
    const b = await makeProfile('B');
    await makeFriends(a.id, b.id);

    track(
      await expensesService.create(b.id, {
        splitType: 'EQUAL',
        name: 'Dinner',
        category: 'Food',
        amount: '200',
        expenseDate: new Date(),
        participants: [{ userId: a.id }, { userId: b.id }],
      }),
    );
    expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(100n);

    const settlement = track(await settlements.create(a.id, { toUserId: b.id, amount: '100' }));

    expect(settlement.splitType).toBe('SETTLEMENT');
    expect(settlement.paidById).toBe(a.id);
    expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(0n);

    // History is preserved -- both the original expense and the settlement
    // are still visible, per ABRO_PRD.md §20.
    const history = await expensesService.list(a.id, { friendId: b.id });
    expect(history.map((e) => e.splitType).sort()).toEqual(['EQUAL', 'SETTLEMENT']);
  });

  it('partially settles a debt, leaving the remainder outstanding (PRD §75)', async () => {
    const a = await makeProfile('A');
    const b = await makeProfile('B');
    await makeFriends(a.id, b.id);

    track(
      await expensesService.create(b.id, {
        splitType: 'EQUAL',
        name: 'Rent',
        category: 'Housing',
        amount: '1000',
        expenseDate: new Date(),
        participants: [{ userId: a.id }, { userId: b.id }],
      }),
    );
    expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(500n);

    track(await settlements.create(a.id, { toUserId: b.id, amount: '200' }));

    expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(300n);
  });

  it('settles a debt scoped to a specific group, without affecting the personal balance', async () => {
    const a = await makeProfile('A');
    const b = await makeProfile('B');
    await makeFriends(a.id, b.id);

    const group = await groupsService.create(a.id, {
      name: 'Trip',
      type: 'TRIP',
      currency: 'ETB',
      simplifyDebts: true,
      memberIds: [b.id],
    });
    createdGroupIds.push(group.id);
    await groupsService.acceptInvite(b.id, group.id);

    track(
      await expensesService.create(b.id, {
        splitType: 'EQUAL',
        name: 'Taxi',
        category: 'Transport',
        amount: '100',
        groupId: group.id,
        expenseDate: new Date(),
        participants: [{ userId: a.id }, { userId: b.id }],
      }),
    );
    expect(await balances.getPairwiseBalance(a.id, b.id, group.id)).toBe(50n);

    track(await settlements.create(a.id, { toUserId: b.id, amount: '50', groupId: group.id }));

    expect(await balances.getPairwiseBalance(a.id, b.id, group.id)).toBe(0n);
    // Personal balance is untouched -- the debts are scoped independently.
    expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(0n);
  });

  it('rejects a group settlement when either party is not an active member', async () => {
    const a = await makeProfile('A');
    const outsider = await makeProfile('Outsider');
    await makeFriends(a.id, outsider.id);

    const group = await groupsService.create(a.id, {
      name: 'Trip',
      type: 'TRIP',
      currency: 'ETB',
      simplifyDebts: true,
    });
    createdGroupIds.push(group.id);

    await expect(
      settlements.create(a.id, { toUserId: outsider.id, amount: '10', groupId: group.id }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects settling with an unknown user', async () => {
    const a = await makeProfile('A');
    await expect(
      settlements.create(a.id, { toUserId: 'does-not-exist', amount: '10' }),
    ).rejects.toThrow(NotFoundException);
  });
});
