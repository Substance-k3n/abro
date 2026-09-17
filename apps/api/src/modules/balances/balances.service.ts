import { Injectable } from '@nestjs/common';
import { type LedgerEntry, netBalance } from '@abro/types';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Net balance between exactly two users, scoped to personal expenses
   * (groupId omitted) or one specific group's expenses. Positive => userA
   * owes userB. Negative => userB owes userA. Zero => settled up. Always
   * computed live from Expense+ExpenseParticipant -- never stored, per
   * ABRO_PRD.md §8.2/§16/§45.
   *
   * Works identically for every splitType, including SETTLEMENT: a
   * settlement Expense (paidBy the person settling, a single non-payer
   * ExpenseParticipant row for the recipient) is just another entry that
   * nets against prior debts, no special-casing needed here.
   */
  async getPairwiseBalance(userA: string, userB: string, groupId?: string): Promise<bigint> {
    const scope = groupId ?? null;
    const rows = await this.prisma.expenseParticipant.findMany({
      where: {
        OR: [
          { userId: userB, expense: { paidById: userA, groupId: scope, deletedAt: null } },
          { userId: userA, expense: { paidById: userB, groupId: scope, deletedAt: null } },
        ],
      },
      select: { userId: true, amount: true },
    });

    const entries: LedgerEntry[] = rows.map((row) => ({
      owedByA: row.userId === userA,
      amount: row.amount,
    }));

    return netBalance(entries);
  }

  /**
   * Each user's net position within a group: what they paid across the
   * group's expenses minus what they owe as a participant. Positive => the
   * group owes them; negative => they owe the group. Not pairwise -- see
   * ABRO_PRD.md §18 (debt simplification), a deliberate follow-up, not
   * built here. Includes anyone with paid/owed activity, even a member who
   * has since left, so a departed member's outstanding balance is never
   * silently hidden (ABRO_PRD.md §20: "settling a debt must never erase its
   * history").
   */
  async getGroupSummary(groupId: string): Promise<{ userId: string; netBalance: bigint }[]> {
    const [paid, owed] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['paidById'],
        where: { groupId, deletedAt: null },
        _sum: { amount: true },
      }),
      this.prisma.expenseParticipant.groupBy({
        by: ['userId'],
        where: { expense: { groupId, deletedAt: null } },
        _sum: { amount: true },
      }),
    ]);

    const paidByUser = new Map(paid.map((row) => [row.paidById, row._sum.amount ?? 0n]));
    const owedByUser = new Map(owed.map((row) => [row.userId, row._sum.amount ?? 0n]));
    const userIds = new Set([...paidByUser.keys(), ...owedByUser.keys()]);

    return Array.from(userIds, (userId) => ({
      userId,
      netBalance: (paidByUser.get(userId) ?? 0n) - (owedByUser.get(userId) ?? 0n),
    }));
  }
}
