import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateSettlementInput } from '@abro/types';

import { PrismaService } from '../../prisma/prisma.service';
import { GroupsService } from '../groups/groups.service';
import { BalancesService } from '../balances/balances.service';
import { NotificationsService } from '../notifications/notifications.service';

const SETTLEMENT_INCLUDE = { participants: { include: { user: true } }, paidBy: true } as const;

/**
 * docs/DECISIONS.md ADR-003: settlements are Expense rows with
 * splitType: SETTLEMENT, never a separate table, and must never go through
 * the general create-expense path -- this service is that dedicated path.
 *
 * Shape decided here (ADR-003 predates this implementation): every
 * ExpenseParticipant.amount stays non-negative, matching every other split
 * type. `{ paidById: settler, amount: settlementAmount }` with participants
 * `[{settler, 0}, {recipient, settlementAmount}]` still satisfies
 * "sum(participant shares) = expense total" (ABRO_PRD.md §45) unchanged,
 * and BalancesService.getPairwiseBalance nets it correctly with zero
 * splitType-specific branching in the read path.
 */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: BalancesService,
    private readonly groups: GroupsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(actorId: string, input: CreateSettlementInput) {
    if (actorId === input.toUserId) {
      throw new BadRequestException({
        code: 'CANNOT_SETTLE_WITH_SELF',
        message: 'You cannot record a settlement with yourself.',
      });
    }

    const toUser = await this.prisma.profile.findUnique({ where: { id: input.toUserId } });
    if (!toUser) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'No such user.' });
    }

    const currency = await this.resolveCurrency(actorId, input);

    // ABRO_PRD.md §19/§45: "settlement <= outstanding debt", validated
    // against the live balance, never a client-supplied figure.
    const amount = BigInt(input.amount);
    const outstanding = await this.balances.getPairwiseBalance(
      actorId,
      input.toUserId,
      input.groupId,
    );

    if (outstanding <= 0n) {
      throw new ConflictException({
        code: 'NO_OUTSTANDING_DEBT',
        message: 'You do not currently owe this user anything to settle.',
      });
    }
    if (amount > outstanding) {
      throw new ConflictException({
        code: 'EXCEEDS_OUTSTANDING_DEBT',
        message: `Settlement amount (${amount}) exceeds the outstanding debt (${outstanding}).`,
      });
    }

    const settlement = await this.prisma.expense.create({
      data: {
        groupId: input.groupId,
        name: 'Settlement',
        category: 'Settlement',
        amount,
        currency,
        paidById: actorId,
        splitType: 'SETTLEMENT',
        expenseDate: new Date(),
        participants: {
          create: [
            { userId: actorId, amount: 0n },
            { userId: input.toUserId, amount },
          ],
        },
      },
      include: SETTLEMENT_INCLUDE,
    });

    // ABRO_PRD.md §34 SETTLEMENT event -- only the recipient, the actor
    // already knows they just recorded this.
    const actor = await this.prisma.profile.findUnique({ where: { id: actorId } });
    await this.notifications.notify(
      input.toUserId,
      'SETTLEMENT',
      'Settlement recorded',
      `${actor?.displayName ?? 'Someone'} recorded a settlement of ${amount} ${currency}.`,
    );

    return settlement;
  }

  /** Also enforces group-membership authorization as a side effect, matching how expenses.service.ts resolves currency. */
  private async resolveCurrency(actorId: string, input: CreateSettlementInput): Promise<string> {
    if (!input.groupId) {
      const actor = await this.prisma.profile.findUniqueOrThrow({ where: { id: actorId } });
      return actor.preferredCurrency;
    }

    const group = await this.prisma.group.findUnique({ where: { id: input.groupId } });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'No such group.' });
    }
    await this.groups.requireActiveMembership(input.groupId, actorId);
    await this.groups.requireActiveMembership(input.groupId, input.toUserId);
    return group.currency;
  }
}
