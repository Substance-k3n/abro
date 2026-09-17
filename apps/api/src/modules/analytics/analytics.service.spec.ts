import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

/**
 * Real Postgres, real AnalyticsService -- matching the pattern used by
 * every other *.service.spec.ts. Expense/ExpenseParticipant rows are
 * created directly via Prisma (not through ExpensesService) since this
 * module only reads already-persisted facts; its business rules (friend
 * checks, share-sum validation) belong to expenses.service.spec.ts, not
 * here.
 */
describe('AnalyticsService (integration)', () => {
  const prisma = new PrismaService();
  const analytics = new AnalyticsService(prisma);

  const createdProfileIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdExpenseIds: string[] = [];

  const YEAR = 2024;

  const makeProfile = async (label: string) => {
    const profile = await prisma.profile.create({
      data: {
        displayName: `Test ${label}`,
        email: `test-analytics-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@abro.test`,
      },
    });
    createdProfileIds.push(profile.id);
    return profile;
  };

  const makeGroup = async (createdById: string, memberIds: string[]) => {
    const group = await prisma.group.create({
      data: {
        name: 'Test Group',
        createdById,
        members: {
          create: [createdById, ...memberIds].map((userId) => ({
            userId,
            role: userId === createdById ? 'ADMIN' : 'MEMBER',
            status: 'ACTIVE',
          })),
        },
      },
    });
    createdGroupIds.push(group.id);
    return group;
  };

  /** month is 1-indexed; defaults to a mid-year date so it never straddles a month/year boundary. */
  const makeExpense = async (opts: {
    paidById: string;
    participants: { userId: string; amount: bigint }[];
    amount: bigint;
    category?: string;
    groupId?: string;
    splitType?: 'EQUAL' | 'SETTLEMENT';
    month?: number;
    year?: number;
  }) => {
    const expense = await prisma.expense.create({
      data: {
        name: 'Test Expense',
        category: opts.category ?? 'General',
        amount: opts.amount,
        paidById: opts.paidById,
        groupId: opts.groupId,
        splitType: opts.splitType ?? 'EQUAL',
        expenseDate: new Date(Date.UTC(opts.year ?? YEAR, (opts.month ?? 6) - 1, 15)),
        participants: { create: opts.participants },
      },
    });
    createdExpenseIds.push(expense.id);
    return expense;
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
    await prisma.group.deleteMany({ where: { id: { in: createdGroupIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: createdProfileIds } } });
    createdExpenseIds.length = 0;
    createdGroupIds.length = 0;
    createdProfileIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('getMonthly', () => {
    it('computes contribution/share/net position/total for a personal expense the user paid', async () => {
      const payer = await makeProfile('A');
      const other = await makeProfile('B');

      await makeExpense({
        paidById: payer.id,
        amount: 1000n,
        participants: [
          { userId: payer.id, amount: 500n },
          { userId: other.id, amount: 500n },
        ],
        month: 3,
      });

      const result = await analytics.getMonthly(payer.id, YEAR, 3);
      expect(result.totalSpending).toBe(1000n);
      expect(result.yourContribution).toBe(1000n);
      expect(result.yourShare).toBe(500n);
      expect(result.netPosition).toBe(500n);
      expect(result.amountOwed).toBe(0n);
    });

    it('computes amountOwed for the non-payer participant', async () => {
      const payer = await makeProfile('A');
      const other = await makeProfile('B');

      await makeExpense({
        paidById: payer.id,
        amount: 1000n,
        participants: [
          { userId: payer.id, amount: 500n },
          { userId: other.id, amount: 500n },
        ],
        month: 3,
      });

      const result = await analytics.getMonthly(other.id, YEAR, 3);
      expect(result.yourContribution).toBe(0n);
      expect(result.yourShare).toBe(500n);
      expect(result.netPosition).toBe(-500n);
      expect(result.amountOwed).toBe(500n);
      expect(result.totalSpending).toBe(1000n);
    });

    it('excludes expenses outside the requested month', async () => {
      const payer = await makeProfile('A');
      await makeExpense({
        paidById: payer.id,
        amount: 1000n,
        participants: [{ userId: payer.id, amount: 1000n }],
        month: 3,
      });

      const result = await analytics.getMonthly(payer.id, YEAR, 4);
      expect(result.totalSpending).toBe(0n);
      expect(result.categoryBreakdown).toEqual([]);
    });

    it('breaks down spending by category', async () => {
      const payer = await makeProfile('A');
      await makeExpense({
        paidById: payer.id,
        amount: 300n,
        category: 'Food',
        participants: [{ userId: payer.id, amount: 300n }],
        month: 5,
      });
      await makeExpense({
        paidById: payer.id,
        amount: 700n,
        category: 'Transport',
        participants: [{ userId: payer.id, amount: 700n }],
        month: 5,
      });

      const result = await analytics.getMonthly(payer.id, YEAR, 5);
      const byCategory = Object.fromEntries(
        result.categoryBreakdown.map((c) => [c.category, c.amount]),
      );
      expect(byCategory.Food).toBe(300n);
      expect(byCategory.Transport).toBe(700n);
    });

    it('separates settlements from ordinary spending totals', async () => {
      const settler = await makeProfile('A');
      const recipient = await makeProfile('B');

      await makeExpense({
        paidById: settler.id,
        amount: 400n,
        splitType: 'SETTLEMENT',
        category: 'Settlement',
        participants: [
          { userId: settler.id, amount: 0n },
          { userId: recipient.id, amount: 400n },
        ],
        month: 7,
      });

      const settlerResult = await analytics.getMonthly(settler.id, YEAR, 7);
      expect(settlerResult.totalSpending).toBe(0n);
      expect(settlerResult.yourContribution).toBe(0n);
      expect(settlerResult.settlements).toEqual({ paid: 400n, received: 0n });

      const recipientResult = await analytics.getMonthly(recipient.id, YEAR, 7);
      expect(recipientResult.totalSpending).toBe(0n);
      expect(recipientResult.settlements).toEqual({ paid: 0n, received: 400n });
      expect(recipientResult.amountReceived).toBe(400n);
    });

    it('counts an expense once when the user is both payer and a participant', async () => {
      const payer = await makeProfile('A');
      const other = await makeProfile('B');
      const another = await makeProfile('C');

      await makeExpense({
        paidById: payer.id,
        amount: 900n,
        participants: [
          { userId: payer.id, amount: 300n },
          { userId: other.id, amount: 300n },
          { userId: another.id, amount: 300n },
        ],
        month: 8,
      });

      const result = await analytics.getMonthly(payer.id, YEAR, 8);
      expect(result.totalSpending).toBe(900n);
    });
  });

  describe('getYearly', () => {
    it('aggregates a monthly trend, group spending, and personal contribution', async () => {
      const payer = await makeProfile('A');
      const member = await makeProfile('B');
      const group = await makeGroup(payer.id, [member.id]);

      await makeExpense({
        paidById: payer.id,
        amount: 1000n,
        groupId: group.id,
        participants: [
          { userId: payer.id, amount: 500n },
          { userId: member.id, amount: 500n },
        ],
        month: 2,
      });
      await makeExpense({
        paidById: payer.id,
        amount: 2000n,
        participants: [{ userId: payer.id, amount: 2000n }],
        month: 9,
      });

      const result = await analytics.getYearly(payer.id, YEAR);
      expect(result.yearlyTotal).toBe(3000n);
      expect(result.personalContribution).toBe(3000n);

      const trendByMonth = Object.fromEntries(
        result.monthlyTrend.map((m) => [m.month, m.totalSpending]),
      );
      expect(trendByMonth[2]).toBe(1000n);
      expect(trendByMonth[9]).toBe(2000n);
      expect(trendByMonth[5]).toBe(0n);
      expect(result.monthlyTrend).toHaveLength(12);

      expect(result.groupSpending).toEqual([
        { groupId: group.id, groupName: group.name, totalSpending: 1000n },
      ]);
    });

    it('omits groups with zero activity in the requested year', async () => {
      const payer = await makeProfile('A');
      const member = await makeProfile('B');
      await makeGroup(payer.id, [member.id]);

      const result = await analytics.getYearly(payer.id, YEAR);
      expect(result.groupSpending).toEqual([]);
    });
  });
});
