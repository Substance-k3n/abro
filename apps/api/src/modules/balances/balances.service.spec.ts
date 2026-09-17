import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptStorageService } from '../../common/storage/receipt-storage.service';
import { FriendsService } from '../friends/friends.service';
import { GroupsService } from '../groups/groups.service';
import { ExpensesService } from '../expenses/expenses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BalancesService } from './balances.service';

/** Hits the real dev Postgres — see friends.service.spec.ts for why. */
describe('BalancesService (integration)', () => {
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
  const balances = new BalancesService(prisma);

  const createdProfileIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdExpenseIds: string[] = [];

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-balances-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
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

  describe('getPairwiseBalance', () => {
    it('is zero between two friends with no shared expenses', async () => {
      const a = await makeProfile('A');
      const b = await makeProfile('B');
      await makeFriends(a.id, b.id);

      expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(0n);
    });

    it('is positive when A owes B (B paid, A is a participant)', async () => {
      const a = await makeProfile('A');
      const b = await makeProfile('B');
      await makeFriends(a.id, b.id);

      track(
        await expensesService.create(b.id, {
          splitType: 'EQUAL',
          name: 'Lunch',
          category: 'Food',
          amount: '100',
          expenseDate: new Date(),
          participants: [{ userId: a.id }, { userId: b.id }],
        }),
      );

      expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(50n);
      expect(await balances.getPairwiseBalance(b.id, a.id)).toBe(-50n);
    });

    it('nets opposing debts across multiple expenses (PRD §16 example: owe 500, owed 200 -> net 300)', async () => {
      const a = await makeProfile('A');
      const b = await makeProfile('B');
      await makeFriends(a.id, b.id);

      // B pays 1000, split EQUAL between A and B -> A owes B 500.
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
      // A pays 400, split EQUAL between A and B -> B owes A 200.
      track(
        await expensesService.create(a.id, {
          splitType: 'EQUAL',
          name: 'Groceries',
          category: 'Food',
          amount: '400',
          expenseDate: new Date(),
          participants: [{ userId: a.id }, { userId: b.id }],
        }),
      );

      expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(300n);
    });

    it('ignores a group expense when scoped to personal (groupId omitted)', async () => {
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

      expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(0n);
      expect(await balances.getPairwiseBalance(a.id, b.id, group.id)).toBe(50n);
    });

    it('excludes an expense where a third party paid, even if both A and B are participants', async () => {
      const a = await makeProfile('A');
      const b = await makeProfile('B');
      const c = await makeProfile('C');
      await makeFriends(a.id, b.id);
      await makeFriends(a.id, c.id);
      await makeFriends(b.id, c.id);

      track(
        await expensesService.create(c.id, {
          splitType: 'EQUAL',
          name: 'Dinner',
          category: 'Food',
          amount: '300',
          paidById: c.id,
          expenseDate: new Date(),
          participants: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
        }),
      );

      // Both A and B owe C, but that's not a debt between A and B.
      expect(await balances.getPairwiseBalance(a.id, b.id)).toBe(0n);
    });
  });

  describe('getGroupSummary', () => {
    it('nets to zero across all members (conservation invariant)', async () => {
      const owner = await makeProfile('Owner');
      const friend = await makeProfile('Friend');
      const third = await makeProfile('Third');
      await makeFriends(owner.id, friend.id);
      await makeFriends(owner.id, third.id);
      await makeFriends(friend.id, third.id);

      const group = await groupsService.create(owner.id, {
        name: 'Trip',
        type: 'TRIP',
        currency: 'ETB',
        simplifyDebts: true,
        memberIds: [friend.id, third.id],
      });
      createdGroupIds.push(group.id);
      await groupsService.acceptInvite(friend.id, group.id);
      await groupsService.acceptInvite(third.id, group.id);

      track(
        await expensesService.create(owner.id, {
          splitType: 'EQUAL',
          name: 'Hotel',
          category: 'Lodging',
          amount: '900',
          groupId: group.id,
          expenseDate: new Date(),
          participants: [{ userId: owner.id }, { userId: friend.id }, { userId: third.id }],
        }),
      );
      track(
        await expensesService.create(friend.id, {
          splitType: 'SHARES',
          name: 'Taxi',
          category: 'Transport',
          amount: '150',
          groupId: group.id,
          expenseDate: new Date(),
          participants: [
            { userId: owner.id, shares: 1 },
            { userId: friend.id, shares: 2 },
          ],
        }),
      );

      const summary = await balances.getGroupSummary(group.id);
      const total = summary.reduce((sum, row) => sum + row.netBalance, 0n);
      expect(total).toBe(0n);

      const byUser = Object.fromEntries(summary.map((row) => [row.userId, row.netBalance]));
      // owner paid 900, owes 300 (hotel share) + 50 (taxi share) = net +550
      expect(byUser[owner.id]).toBe(550n);
      // friend paid 150, owes 300 (hotel) + 100 (taxi share) = net -250
      expect(byUser[friend.id]).toBe(-250n);
      // third paid nothing, owes 300 (hotel only) = net -300
      expect(byUser[third.id]).toBe(-300n);
    });
  });

  describe('getSimplifiedGroupDebts', () => {
    it("collapses a chain of expenses (PRD §18's own example) into a single transaction", async () => {
      const a = await makeProfile('A');
      const b = await makeProfile('B');
      const c = await makeProfile('C');
      const d = await makeProfile('D');
      await makeFriends(b.id, a.id);
      await makeFriends(b.id, c.id);
      await makeFriends(b.id, d.id);

      const group = await groupsService.create(b.id, {
        name: 'Chain',
        type: 'OTHER',
        currency: 'ETB',
        simplifyDebts: true,
        memberIds: [a.id, c.id, d.id],
      });
      createdGroupIds.push(group.id);
      await groupsService.acceptInvite(a.id, group.id);
      await groupsService.acceptInvite(c.id, group.id);
      await groupsService.acceptInvite(d.id, group.id);

      // A owes B 100 (B pays, A is the sole participant).
      track(
        await expensesService.create(b.id, {
          splitType: 'EQUAL',
          name: 'Leg 1',
          category: 'Misc',
          amount: '100',
          groupId: group.id,
          expenseDate: new Date(),
          participants: [{ userId: a.id }],
        }),
      );
      // B owes C 100.
      track(
        await expensesService.create(c.id, {
          splitType: 'EQUAL',
          name: 'Leg 2',
          category: 'Misc',
          amount: '100',
          groupId: group.id,
          expenseDate: new Date(),
          participants: [{ userId: b.id }],
        }),
      );
      // C owes D 100.
      track(
        await expensesService.create(d.id, {
          splitType: 'EQUAL',
          name: 'Leg 3',
          category: 'Misc',
          amount: '100',
          groupId: group.id,
          expenseDate: new Date(),
          participants: [{ userId: c.id }],
        }),
      );

      const simplified = await balances.getSimplifiedGroupDebts(group.id);
      expect(simplified).toEqual([{ fromUserId: a.id, toUserId: d.id, amount: 100n }]);
    });
  });
});
