import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptStorageService } from '../../common/storage/receipt-storage.service';
import { FriendsService } from '../friends/friends.service';
import { GroupsService } from '../groups/groups.service';
import { ExpensesService } from '../expenses/expenses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RecurringService } from './recurring.service';

/** Hits the real dev Postgres — see friends.service.spec.ts for why. */
describe('RecurringService (integration)', () => {
  const prisma = new PrismaService();
  const notifications = new NotificationsService(prisma);
  const receiptStorage = new ReceiptStorageService();
  const friendsService = new FriendsService(prisma);
  const groupsService = new GroupsService(prisma, friendsService, notifications);
  const expensesService = new ExpensesService(
    prisma,
    groupsService,
    friendsService,
    notifications,
    receiptStorage,
  );
  const recurring = new RecurringService(prisma, expensesService, notifications);

  const createdProfileIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdRecurringIds: string[] = [];

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-recurring-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
      },
    });
    createdProfileIds.push(profile.id);
    return profile;
  };

  const makeFriends = async (userId: string, friendId: string) => {
    await prisma.friendship.create({ data: { userId, friendId, status: 'ACCEPTED' } });
  };

  const track = <T extends { id: string }>(recurringExpense: T): T => {
    createdRecurringIds.push(recurringExpense.id);
    return recurringExpense;
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    // Generated occurrences are independent rows with no FK back to the
    // RecurringExpense (only the template has that relation) -- every
    // expense in this spec (template or generated) was paid by one of our
    // own test profiles, so that's the reliable way to find them all.
    await prisma.recurringExpense.deleteMany({ where: { id: { in: createdRecurringIds } } });
    const allExpenseIds = (
      await prisma.expense.findMany({
        where: { paidById: { in: createdProfileIds } },
        select: { id: true },
      })
    ).map((e) => e.id);
    await prisma.expenseParticipant.deleteMany({ where: { expenseId: { in: allExpenseIds } } });
    await prisma.expense.deleteMany({ where: { id: { in: allExpenseIds } } });
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

  it('creates a template Expense and computes nextRunAt one period ahead', async () => {
    const payer = await makeProfile('Payer');
    const friend = await makeProfile('Friend');
    await makeFriends(payer.id, friend.id);

    const expenseDate = new Date('2024-01-15T00:00:00.000Z');
    const created = track(
      await recurring.create(payer.id, {
        splitType: 'EQUAL',
        name: 'Rent',
        category: 'Housing',
        amount: '1000',
        expenseDate,
        frequency: 'MONTHLY',
        participants: [{ userId: payer.id }, { userId: friend.id }],
      }),
    );

    expect(created.frequency).toBe('MONTHLY');
    expect(created.enabled).toBe(true);
    expect(created.templateExpense.name).toBe('Rent');
    expect(created.nextRunAt.toISOString()).toBe('2024-02-15T00:00:00.000Z');
  });

  it('lists templates visible to a personal-expense participant', async () => {
    const payer = await makeProfile('Payer');
    const friend = await makeProfile('Friend');
    const stranger = await makeProfile('Stranger');
    await makeFriends(payer.id, friend.id);

    const created = track(
      await recurring.create(payer.id, {
        splitType: 'EQUAL',
        name: 'Internet',
        category: 'Utilities',
        amount: '500',
        expenseDate: new Date('2024-01-01T00:00:00.000Z'),
        frequency: 'MONTHLY',
        participants: [{ userId: payer.id }, { userId: friend.id }],
      }),
    );

    expect((await recurring.listMine(friend.id)).map((r) => r.id)).toContain(created.id);
    expect((await recurring.listMine(stranger.id)).map((r) => r.id)).not.toContain(created.id);
  });

  describe('setEnabled', () => {
    it('lets the payer disable and re-enable, but rejects an uninvolved user', async () => {
      const payer = await makeProfile('Payer');
      const outsider = await makeProfile('Outsider');

      const created = track(
        await recurring.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Subscription',
          category: 'Entertainment',
          amount: '200',
          expenseDate: new Date('2024-01-01T00:00:00.000Z'),
          frequency: 'MONTHLY',
          participants: [{ userId: payer.id }],
        }),
      );

      await expect(recurring.setEnabled(outsider.id, created.id, false)).rejects.toThrow(
        ForbiddenException,
      );

      const disabled = await recurring.setEnabled(payer.id, created.id, false);
      expect(disabled.enabled).toBe(false);
    });
  });

  describe('generateDue', () => {
    it('generates an independent Expense for a due template and advances nextRunAt by one period', async () => {
      const payer = await makeProfile('Payer');
      const friend = await makeProfile('Friend');
      await makeFriends(payer.id, friend.id);

      const created = track(
        await recurring.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Household bill',
          category: 'Utilities',
          amount: '300',
          expenseDate: new Date('2024-01-01T00:00:00.000Z'),
          frequency: 'WEEKLY',
          participants: [{ userId: payer.id }, { userId: friend.id }],
        }),
      );
      // nextRunAt is 2024-01-08; due as of "now".
      const result = await recurring.generateDue(new Date('2024-01-08T00:00:00.000Z'));
      expect(result.generated).toBe(1);

      const generatedExpenses = await prisma.expense.findMany({
        where: { name: 'Household bill', id: { not: created.templateExpense.id } },
      });
      expect(generatedExpenses).toHaveLength(1);
      expect(generatedExpenses[0]!.amount).toBe(300n);
      expect(generatedExpenses[0]!.id).not.toBe(created.templateExpense.id);

      const updated = await prisma.recurringExpense.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(updated.nextRunAt.toISOString()).toBe('2024-01-15T00:00:00.000Z');
    });

    it('notifies participants except the payer when a recurring expense generates', async () => {
      const payer = await makeProfile('Payer');
      const friend = await makeProfile('Friend');
      await makeFriends(payer.id, friend.id);

      track(
        await recurring.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Notify Bill',
          category: 'Utilities',
          amount: '100',
          expenseDate: new Date('2024-01-01T00:00:00.000Z'),
          frequency: 'WEEKLY',
          participants: [{ userId: payer.id }, { userId: friend.id }],
        }),
      );

      await recurring.generateDue(new Date('2024-01-08T00:00:00.000Z'));

      expect(
        await prisma.notification.count({
          where: { userId: friend.id, type: 'RECURRING_EXPENSE' },
        }),
      ).toBe(1);
      expect(
        await prisma.notification.count({ where: { userId: payer.id, type: 'RECURRING_EXPENSE' } }),
      ).toBe(0);
    });

    it('does not generate for a disabled template or one not yet due', async () => {
      const payer = await makeProfile('Payer');

      const disabledTemplate = track(
        await recurring.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Disabled bill',
          category: 'Utilities',
          amount: '150',
          expenseDate: new Date('2024-01-01T00:00:00.000Z'),
          frequency: 'WEEKLY',
          participants: [{ userId: payer.id }],
        }),
      );
      await recurring.setEnabled(payer.id, disabledTemplate.id, false);

      track(
        await recurring.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Future bill',
          category: 'Utilities',
          amount: '150',
          expenseDate: new Date('2030-01-01T00:00:00.000Z'),
          frequency: 'YEARLY',
          participants: [{ userId: payer.id }],
        }),
      );

      await recurring.generateDue(new Date('2024-01-08T00:00:00.000Z'));

      const generated = await prisma.expense.findMany({
        where: { name: { in: ['Disabled bill', 'Future bill'] } },
      });
      // Only the two templates themselves exist -- neither generated an extra row.
      expect(generated).toHaveLength(2);
    });

    it("editing the template afterward never changes an already-generated occurrence's amount", async () => {
      const payer = await makeProfile('Payer');

      const created = track(
        await recurring.create(payer.id, {
          splitType: 'EQUAL',
          name: 'Editable bill',
          category: 'Utilities',
          amount: '400',
          expenseDate: new Date('2024-01-01T00:00:00.000Z'),
          frequency: 'MONTHLY',
          participants: [{ userId: payer.id }],
        }),
      );

      await recurring.generateDue(new Date('2024-02-01T00:00:00.000Z'));
      const generatedBefore = await prisma.expense.findFirstOrThrow({
        where: { name: 'Editable bill', id: { not: created.templateExpense.id } },
      });
      expect(generatedBefore.amount).toBe(400n);

      await expensesService.update(payer.id, created.templateExpense.id, {
        splitType: 'EQUAL',
        name: 'Editable bill',
        category: 'Utilities',
        amount: '900',
        expenseDate: created.templateExpense.expenseDate,
        participants: [{ userId: payer.id }],
      });

      const generatedAfter = await prisma.expense.findUniqueOrThrow({
        where: { id: generatedBefore.id },
      });
      expect(generatedAfter.amount).toBe(400n);
    });
  });
});
