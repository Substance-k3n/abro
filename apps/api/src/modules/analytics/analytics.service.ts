import { Injectable } from '@nestjs/common';
import type {
  CategoryAmount,
  GroupSpending,
  MonthlyAnalytics,
  MonthlySpending,
  YearlyAnalytics,
} from '@abro/types';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Read-only aggregation over Expense/ExpenseParticipant -- ABRO_PRD.md §26.
 * No new persistence, no derived data stored: every figure here is computed
 * live from the same facts BalancesService reads, per the ABRO invariant
 * "expenses are facts, balances/analytics are derived projections."
 *
 * Scope: every expense the user is involved in, across their personal
 * (groupId: null) activity and every group they belong to -- not scoped to
 * one group, since PRD §26's "Group spending" (yearly) is a *breakdown*
 * within the overall picture, implying the top-level query already spans
 * groups. (Documented as an Assumption in docs/BACKEND_PLAN.md item 2 --
 * no PRD text pins this down explicitly.)
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthly(userId: string, year: number, month: number): Promise<MonthlyAnalytics> {
    const { start, end } = monthRange(year, month);

    const [totals, categoryBreakdown, settlementsPaid, settlementsReceived] = await Promise.all([
      this.userTotals(userId, start, end),
      this.categoryBreakdown(userId, start, end),
      this.settlementSum(userId, start, end, 'paid'),
      this.settlementSum(userId, start, end, 'received'),
    ]);

    return {
      year,
      month,
      totalSpending: totals.totalSpending,
      yourContribution: totals.yourContribution,
      yourShare: totals.yourShare,
      netPosition: totals.yourContribution - totals.yourShare,
      amountOwed: totals.amountOwed,
      amountReceived: settlementsReceived,
      settlements: { paid: settlementsPaid, received: settlementsReceived },
      categoryBreakdown,
    };
  }

  async getYearly(userId: string, year: number): Promise<YearlyAnalytics> {
    const { start, end } = yearRange(year);

    const [totals, categoryDistribution, groupSpending, monthlyTrend] = await Promise.all([
      this.userTotals(userId, start, end),
      this.categoryBreakdown(userId, start, end),
      this.groupSpending(userId, start, end),
      this.monthlyTrend(userId, year),
    ]);

    return {
      year,
      yearlyTotal: totals.totalSpending,
      monthlyTrend,
      categoryDistribution,
      groupSpending,
      personalContribution: totals.yourContribution,
    };
  }

  /**
   * Total Spending / Your Contribution / Your Share / amount owed for the
   * period, excluding SETTLEMENT rows (see analytics.ts's field docs).
   */
  private async userTotals(userId: string, start: Date, end: Date) {
    const [paidRows, participantRows] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          paidById: userId,
          splitType: { not: 'SETTLEMENT' },
          deletedAt: null,
          expenseDate: { gte: start, lt: end },
        },
        select: { id: true, amount: true },
      }),
      this.prisma.expenseParticipant.findMany({
        where: {
          userId,
          expense: {
            splitType: { not: 'SETTLEMENT' },
            deletedAt: null,
            expenseDate: { gte: start, lt: end },
          },
        },
        select: { amount: true, expense: { select: { id: true, paidById: true } } },
      }),
    ]);

    const yourContribution = sumBy(paidRows, (r) => r.amount);
    const yourShare = sumBy(participantRows, (r) => r.amount);
    const amountOwed = sumBy(
      participantRows.filter((r) => r.expense.paidById !== userId),
      (r) => r.amount,
    );

    const involvedExpenseIds = new Set<string>([
      ...paidRows.map((r) => r.id),
      ...participantRows.map((r) => r.expense.id),
    ]);
    const totalSpending =
      involvedExpenseIds.size === 0
        ? 0n
        : sumBy(
            await this.prisma.expense.findMany({
              where: { id: { in: Array.from(involvedExpenseIds) } },
              select: { amount: true },
            }),
            (r) => r.amount,
          );

    return { totalSpending, yourContribution, yourShare, amountOwed };
  }

  private async categoryBreakdown(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<CategoryAmount[]> {
    const rows = await this.prisma.expense.findMany({
      where: {
        splitType: { not: 'SETTLEMENT' },
        deletedAt: null,
        expenseDate: { gte: start, lt: end },
        OR: [{ paidById: userId }, { participants: { some: { userId } } }],
      },
      select: { category: true, amount: true },
    });

    const byCategory = new Map<string, bigint>();
    for (const row of rows) {
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0n) + row.amount);
    }
    return Array.from(byCategory, ([category, amount]) => ({ category, amount }));
  }

  private async groupSpending(userId: string, start: Date, end: Date): Promise<GroupSpending[]> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { group: { select: { id: true, name: true } } },
    });

    const results = await Promise.all(
      memberships.map(async ({ group }) => {
        const rows = await this.prisma.expense.findMany({
          where: {
            groupId: group.id,
            splitType: { not: 'SETTLEMENT' },
            deletedAt: null,
            expenseDate: { gte: start, lt: end },
            OR: [{ paidById: userId }, { participants: { some: { userId } } }],
          },
          select: { amount: true },
        });
        return {
          groupId: group.id,
          groupName: group.name,
          totalSpending: sumBy(rows, (r) => r.amount),
        };
      }),
    );

    return results.filter((r) => r.totalSpending > 0n);
  }

  private async monthlyTrend(userId: string, year: number): Promise<MonthlySpending[]> {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    return Promise.all(
      months.map(async (month) => {
        const { start, end } = monthRange(year, month);
        const rows = await this.prisma.expense.findMany({
          where: {
            splitType: { not: 'SETTLEMENT' },
            deletedAt: null,
            expenseDate: { gte: start, lt: end },
            OR: [{ paidById: userId }, { participants: { some: { userId } } }],
          },
          select: { amount: true },
        });
        return { month, totalSpending: sumBy(rows, (r) => r.amount) };
      }),
    );
  }

  /**
   * `direction: 'paid'` -- settlements the user initiated (paidById = user).
   * `direction: 'received'` -- settlements where the user is the recipient
   * participant (see SettlementsService: recipient's ExpenseParticipant.amount
   * carries the settled amount, payer's is always 0).
   */
  private async settlementSum(
    userId: string,
    start: Date,
    end: Date,
    direction: 'paid' | 'received',
  ): Promise<bigint> {
    if (direction === 'paid') {
      const rows = await this.prisma.expense.findMany({
        where: {
          paidById: userId,
          splitType: 'SETTLEMENT',
          deletedAt: null,
          expenseDate: { gte: start, lt: end },
        },
        select: { amount: true },
      });
      return sumBy(rows, (r) => r.amount);
    }

    const rows = await this.prisma.expenseParticipant.findMany({
      where: {
        userId,
        amount: { gt: 0n },
        expense: {
          splitType: 'SETTLEMENT',
          paidById: { not: userId },
          deletedAt: null,
          expenseDate: { gte: start, lt: end },
        },
      },
      select: { amount: true },
    });
    return sumBy(rows, (r) => r.amount);
  }
}

const sumBy = <T>(rows: T[], pick: (row: T) => bigint): bigint =>
  rows.reduce((total, row) => total + pick(row), 0n);

const monthRange = (year: number, month: number) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  end: new Date(Date.UTC(year, month, 1)),
});

const yearRange = (year: number) => ({
  start: new Date(Date.UTC(year, 0, 1)),
  end: new Date(Date.UTC(year + 1, 0, 1)),
});
