import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateRecurringExpenseInput } from '@abro/types';
import type { RecurringFrequency } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { NotificationsService } from '../notifications/notifications.service';

const TEMPLATE_INCLUDE = { participants: true } as const;

/**
 * ABRO_PRD.md §35. The "template" is a real Expense (created through the
 * normal expenses.create path -- reuse, don't duplicate split computation),
 * wrapped by a RecurringExpense row carrying frequency/nextRunAt/enabled.
 * Each generation produces an independent Expense row with the template's
 * exact amounts (see generateDue()'s doc comment for why weights, not just
 * amounts, can't be replayed) -- editing the template later can never
 * retroactively change a past occurrence, since generated rows are full
 * copies, not references.
 *
 * Trigger mechanism (docs/BACKEND_PLAN.md item 4's flagged infra decision):
 * generateDue() is exposed as a plain authenticated endpoint
 * (POST /recurring/generate-due) rather than an in-process cron job for
 * MVP -- no scheduler infra (@nestjs/schedule, external cron) exists yet
 * in this repo. See docs/DECISIONS.md ADR-005.
 */
@Injectable()
export class RecurringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpensesService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(actorId: string, input: CreateRecurringExpenseInput) {
    const { frequency, ...expenseInput } = input;
    const template = await this.expenses.create(actorId, expenseInput);

    return this.prisma.recurringExpense.create({
      data: {
        templateExpenseId: template.id,
        frequency,
        nextRunAt: nextOccurrence(template.expenseDate, frequency),
        enabled: true,
      },
      include: { templateExpense: { include: TEMPLATE_INCLUDE } },
    });
  }

  /** Every recurring template the user is involved in, same visibility rule as ExpensesService.list's default view. */
  async listMine(userId: string) {
    return this.prisma.recurringExpense.findMany({
      where: {
        templateExpense: {
          deletedAt: null,
          OR: [
            { groupId: null, participants: { some: { userId } } },
            { group: { members: { some: { userId, status: 'ACTIVE' as const } } } },
          ],
        },
      },
      include: { templateExpense: { include: TEMPLATE_INCLUDE } },
      orderBy: { nextRunAt: 'asc' },
    });
  }

  async setEnabled(actorId: string, recurringId: string, enabled: boolean) {
    const recurring = await this.requireVisible(recurringId);
    await this.requireEditAuthority(actorId, recurring.templateExpense);

    return this.prisma.recurringExpense.update({
      where: { id: recurringId },
      data: { enabled },
      include: { templateExpense: { include: TEMPLATE_INCLUDE } },
    });
  }

  /**
   * Generates every occurrence whose nextRunAt is due. Reuses
   * ExpensesService.create() with splitType: EXACT and the template's
   * already-resolved participant amounts -- a PERCENTAGE/SHARES template's
   * original *weights* aren't retained once split into fixed amounts, so
   * regeneration always reproduces the template's exact amounts rather than
   * re-deriving a split. Fine for PRD §35's own examples (rent, internet,
   * subscriptions -- fixed recurring bills); changing the recurring amount
   * means editing the template Expense itself first.
   *
   * Sequential by design (each generation's authorization/friend-membership
   * checks must run against current state, not a stale snapshot), so this
   * is one row at a time, not Promise.all.
   */
  async generateDue(now: Date = new Date()): Promise<{ generated: number }> {
    const due = await this.prisma.recurringExpense.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      include: { templateExpense: { include: TEMPLATE_INCLUDE } },
    });

    let generated = 0;
    for (const recurring of due) {
      const template = recurring.templateExpense;

      const created = await this.expenses.create(template.paidById, {
        splitType: 'EXACT',
        name: template.name,
        category: template.category,
        amount: template.amount.toString(),
        currency: template.currency,
        groupId: template.groupId ?? undefined,
        paidById: template.paidById,
        expenseDate: recurring.nextRunAt,
        notes: template.notes ?? undefined,
        participants: template.participants.map((p) => ({
          userId: p.userId,
          amount: p.amount.toString(),
        })),
      });

      await this.notifications.notifyMany(
        template.participants.map((p) => p.userId).filter((userId) => userId !== template.paidById),
        'RECURRING_EXPENSE',
        'Recurring expense generated',
        `A recurring expense was generated: "${created.name}" (${created.amount} ${created.currency}).`,
      );

      await this.prisma.recurringExpense.update({
        where: { id: recurring.id },
        data: { nextRunAt: nextOccurrence(recurring.nextRunAt, recurring.frequency) },
      });
      generated += 1;
    }

    return { generated };
  }

  private async requireVisible(recurringId: string) {
    const recurring = await this.prisma.recurringExpense.findUnique({
      where: { id: recurringId },
      include: { templateExpense: { include: TEMPLATE_INCLUDE } },
    });
    if (!recurring) {
      throw new NotFoundException({
        code: 'RECURRING_EXPENSE_NOT_FOUND',
        message: 'No such recurring expense.',
      });
    }
    return recurring;
  }

  /** Same authority rule as ExpensesService.requireEditAuthority: the payer, or a group admin. */
  private async requireEditAuthority(
    actorId: string,
    template: { paidById: string; groupId: string | null },
  ): Promise<void> {
    if (template.paidById === actorId) {
      return;
    }
    if (template.groupId) {
      const membership = await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: template.groupId, userId: actorId } },
      });
      if (membership?.status === 'ACTIVE' && membership.role === 'ADMIN') {
        return;
      }
    }
    throw new ForbiddenException({
      code: 'NOT_EDIT_AUTHORIZED',
      message: 'Only the payer or a group admin can change this recurring expense.',
    });
  }
}

const nextOccurrence = (from: Date, frequency: RecurringFrequency): Date => {
  const next = new Date(from);
  switch (frequency) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'MONTHLY':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case 'YEARLY':
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }
  return next;
};
