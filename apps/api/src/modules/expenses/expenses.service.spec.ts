import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { GroupsService } from '../groups/groups.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExpensesService } from './expenses.service';

/** Hits the real dev Postgres — see friends.service.spec.ts for why. */
describe('ExpensesService (integration)', () => {
  const prisma = new PrismaService();
  const notifications = new NotificationsService(prisma);
  const friendsService = new FriendsService(prisma);
  const groupsService = new GroupsService(prisma, friendsService, notifications);
  const expenses = new ExpensesService(prisma, groupsService, friendsService, notifications);

  const createdProfileIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdExpenseIds: string[] = [];

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-expenses-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
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
    await prisma.notification.deleteMany({ where: { userId: { in: createdProfileIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: createdProfileIds } } });
    await prisma.$disconnect();
  });

  describe('personal (non-group) expenses', () => {
    it('creates an EQUAL split between friends with correct remainder distribution', async () => {
      const payer = await makeProfile('Payer');
      const friend = await makeProfile('Friend');
      await makeFriends(payer.id, friend.id);

      const expense = track(
        await expenses.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Dinner',
          category: 'Food',
          amount: '100',
          expenseDate: new Date(),
          participants: [{ userId: payer.id }, { userId: friend.id }],
        }),
      );

      const amounts = expense.participants.map((p) => p.amount.toString()).sort();
      expect(amounts).toEqual(['50', '50']);
      expect(expense.currency).toBe('ETB');
    });

    it('rejects a non-friend participant', async () => {
      const payer = await makeProfile('Payer');
      const stranger = await makeProfile('Stranger');

      await expect(
        expenses.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Dinner',
          category: 'Food',
          amount: '100',
          expenseDate: new Date(),
          participants: [{ userId: payer.id }, { userId: stranger.id }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an actor who is neither payer nor participant', async () => {
      const payer = await makeProfile('Payer');
      const friend = await makeProfile('Friend');
      const bystander = await makeProfile('Bystander');
      await makeFriends(payer.id, friend.id);
      await makeFriends(payer.id, bystander.id);
      await makeFriends(friend.id, bystander.id);

      await expect(
        expenses.create(bystander.id, {
          splitType: 'EQUAL',
          name: 'Dinner',
          category: 'Food',
          amount: '100',
          paidById: payer.id,
          expenseDate: new Date(),
          participants: [{ userId: payer.id }, { userId: friend.id }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects EXACT shares that do not sum to the total', async () => {
      const payer = await makeProfile('Payer');
      const friend = await makeProfile('Friend');
      await makeFriends(payer.id, friend.id);

      await expect(
        expenses.create(payer.id, {
          splitType: 'EXACT',
          name: 'Dinner',
          category: 'Food',
          amount: '100',
          expenseDate: new Date(),
          participants: [
            { userId: payer.id, amount: '40' },
            { userId: friend.id, amount: '40' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects PERCENTAGE shares that do not sum to 100', async () => {
      const payer = await makeProfile('Payer');
      const friend = await makeProfile('Friend');
      await makeFriends(payer.id, friend.id);

      await expect(
        expenses.create(payer.id, {
          splitType: 'PERCENTAGE',
          name: 'Dinner',
          category: 'Food',
          amount: '100',
          expenseDate: new Date(),
          participants: [
            { userId: payer.id, percentage: 40 },
            { userId: friend.id, percentage: 40 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('computes a SHARES split proportionally', async () => {
      const payer = await makeProfile('Payer');
      const friend = await makeProfile('Friend');
      await makeFriends(payer.id, friend.id);

      const expense = track(
        await expenses.create(payer.id, {
          splitType: 'SHARES',
          name: 'Rent',
          category: 'Housing',
          amount: '300',
          expenseDate: new Date(),
          participants: [
            { userId: payer.id, shares: 1 },
            { userId: friend.id, shares: 2 },
          ],
        }),
      );

      const byUser = Object.fromEntries(
        expense.participants.map((p) => [p.userId, p.amount.toString()]),
      );
      expect(byUser[payer.id]).toBe('100');
      expect(byUser[friend.id]).toBe('200');
    });

    it('soft-deletes: the row survives but becomes invisible via findById', async () => {
      const payer = await makeProfile('Payer');
      const friend = await makeProfile('Friend');
      await makeFriends(payer.id, friend.id);

      const expense = track(
        await expenses.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Coffee',
          category: 'Food',
          amount: '20',
          expenseDate: new Date(),
          participants: [{ userId: payer.id }, { userId: friend.id }],
        }),
      );

      await expenses.softDelete(payer.id, expense.id);

      await expect(expenses.findById(payer.id, expense.id)).rejects.toThrow(NotFoundException);
      const raw = await prisma.expense.findUnique({ where: { id: expense.id } });
      expect(raw).not.toBeNull();
      expect(raw?.deletedAt).not.toBeNull();
    });

    it('only lets the payer or a group admin edit an expense', async () => {
      const payer = await makeProfile('Payer');
      const friend = await makeProfile('Friend');
      await makeFriends(payer.id, friend.id);

      const expense = track(
        await expenses.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Coffee',
          category: 'Food',
          amount: '20',
          expenseDate: new Date(),
          participants: [{ userId: payer.id }, { userId: friend.id }],
        }),
      );

      await expect(
        expenses.update(friend.id, expense.id, {
          splitType: 'EQUAL',
          name: 'Coffee (edited)',
          category: 'Food',
          amount: '25',
          expenseDate: new Date(),
          participants: [{ userId: payer.id }, { userId: friend.id }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('group expenses', () => {
    it('forces the group currency and rejects a non-member participant', async () => {
      const owner = await makeProfile('Owner');
      const friend = await makeProfile('Friend');
      const outsider = await makeProfile('Outsider');
      await makeFriends(owner.id, friend.id);
      await makeFriends(owner.id, outsider.id);

      const group = await groupsService.create(owner.id, {
        name: 'Trip',
        type: 'TRIP',
        currency: 'USD',
        simplifyDebts: true,
        memberIds: [friend.id],
      });
      createdGroupIds.push(group.id);
      await groupsService.acceptInvite(friend.id, group.id);

      await expect(
        expenses.create(owner.id, {
          splitType: 'EQUAL',
          name: 'Taxi',
          category: 'Transport',
          amount: '100',
          currency: 'ETB',
          groupId: group.id,
          expenseDate: new Date(),
          participants: [{ userId: owner.id }, { userId: outsider.id }],
        }),
      ).rejects.toThrow(ForbiddenException);

      const valid = track(
        await expenses.create(owner.id, {
          splitType: 'EQUAL',
          name: 'Taxi',
          category: 'Transport',
          amount: '100',
          currency: 'ETB',
          groupId: group.id,
          expenseDate: new Date(),
          participants: [{ userId: owner.id }, { userId: friend.id }],
        }),
      );
      expect(valid.currency).toBe('USD');
    });

    it('a member who leaves the group loses visibility into an expense they were not a participant of', async () => {
      const owner = await makeProfile('Owner');
      const friend = await makeProfile('Friend');
      const observer = await makeProfile('Observer');
      await makeFriends(owner.id, friend.id);
      await makeFriends(owner.id, observer.id);
      await makeFriends(friend.id, observer.id);

      const group = await groupsService.create(owner.id, {
        name: 'Trip',
        type: 'TRIP',
        currency: 'ETB',
        simplifyDebts: true,
        memberIds: [friend.id, observer.id],
      });
      createdGroupIds.push(group.id);
      await groupsService.acceptInvite(friend.id, group.id);
      await groupsService.acceptInvite(observer.id, group.id);

      const expense = track(
        await expenses.create(owner.id, {
          splitType: 'EQUAL',
          name: 'Hotel',
          category: 'Lodging',
          amount: '200',
          groupId: group.id,
          expenseDate: new Date(),
          participants: [{ userId: owner.id }, { userId: friend.id }],
        }),
      );

      // Observer is an active group member, not a participant, so they can see it for now.
      await expect(expenses.findById(observer.id, expense.id)).resolves.toBeTruthy();

      await groupsService.removeMember(observer.id, group.id, observer.id);

      await expect(expenses.findById(observer.id, expense.id)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('notifications (ABRO_PRD.md §34)', () => {
    it('notifies the other participant on create, not the actor', async () => {
      const payer = await makeProfile('NotifyPayer');
      const friend = await makeProfile('NotifyFriend');
      await makeFriends(payer.id, friend.id);

      track(
        await expenses.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Coffee',
          category: 'Food',
          amount: '100',
          expenseDate: new Date(),
          participants: [{ userId: payer.id }, { userId: friend.id }],
        }),
      );

      const payerNotifications = await prisma.notification.findMany({
        where: { userId: payer.id, type: 'EXPENSE_ADDED' },
      });
      expect(payerNotifications).toHaveLength(0);

      const friendNotifications = await prisma.notification.findMany({
        where: { userId: friend.id, type: 'EXPENSE_ADDED' },
      });
      expect(friendNotifications).toHaveLength(1);
      expect(friendNotifications[0]!.body).toContain('Coffee');
    });

    it('notifies participants on edit and on soft delete', async () => {
      const payer = await makeProfile('NotifyEditPayer');
      const friend = await makeProfile('NotifyEditFriend');
      await makeFriends(payer.id, friend.id);

      const expense = track(
        await expenses.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Groceries',
          category: 'Food',
          amount: '100',
          expenseDate: new Date(),
          participants: [{ userId: payer.id }, { userId: friend.id }],
        }),
      );

      await expenses.update(payer.id, expense.id, {
        splitType: 'EQUAL',
        name: 'Groceries (updated)',
        category: 'Food',
        amount: '120',
        expenseDate: new Date(),
        participants: [{ userId: payer.id }, { userId: friend.id }],
      });

      expect(
        await prisma.notification.count({ where: { userId: friend.id, type: 'EXPENSE_EDITED' } }),
      ).toBe(1);

      await expenses.softDelete(payer.id, expense.id);

      expect(
        await prisma.notification.count({ where: { userId: friend.id, type: 'EXPENSE_DELETED' } }),
      ).toBe(1);
    });
  });
});
