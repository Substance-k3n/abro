import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import {
  type CreateExpenseInput,
  type ListExpensesQuery,
  type UpdateExpenseInput,
  assertSharesMatchTotal,
  splitByWeights,
  splitEqually,
} from '@abro/types';
import type { Expense } from '@prisma/client';
import { randomUUID } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptStorageService } from '../../common/storage/receipt-storage.service';
import { FriendsService } from '../friends/friends.service';
import { GroupsService } from '../groups/groups.service';
import { NotificationsService } from '../notifications/notifications.service';

interface PreparedWrite {
  paidById: string;
  currency: string;
  participantAmounts: { userId: string; amount: bigint }[];
}

const EXPENSE_INCLUDE = { participants: { include: { user: true } }, paidBy: true } as const;

/** ABRO_PRD.md §36 "Supported initially". */
const RECEIPT_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
    private readonly receiptStorage: ReceiptStorageService,
  ) {}

  async create(actorId: string, input: CreateExpenseInput) {
    const { paidById, currency, participantAmounts } = await this.prepareWrite(actorId, input);

    const expense = await this.prisma.expense.create({
      data: {
        groupId: input.groupId,
        name: input.name,
        category: input.category,
        amount: BigInt(input.amount),
        currency,
        paidById,
        splitType: input.splitType,
        expenseDate: input.expenseDate,
        receiptPath: input.receiptPath,
        notes: input.notes,
        participants: { create: participantAmounts },
      },
      include: EXPENSE_INCLUDE,
    });

    await this.notifyParties(
      actorId,
      expense,
      'EXPENSE_ADDED',
      (actor) =>
        `${actor} added an expense: "${expense.name}" (${expense.amount} ${expense.currency}).`,
    );

    return expense;
  }

  async update(actorId: string, expenseId: string, input: UpdateExpenseInput) {
    const expense = await this.requireVisible(actorId, expenseId);
    await this.requireEditAuthority(actorId, expense);

    const { paidById, currency, participantAmounts } = await this.prepareWrite(actorId, input);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.expenseParticipant.deleteMany({ where: { expenseId } });
      return tx.expense.update({
        where: { id: expenseId },
        data: {
          groupId: input.groupId,
          name: input.name,
          category: input.category,
          amount: BigInt(input.amount),
          currency,
          paidById,
          splitType: input.splitType,
          expenseDate: input.expenseDate,
          receiptPath: input.receiptPath,
          notes: input.notes,
          updatedById: actorId,
          participants: { create: participantAmounts },
        },
        include: EXPENSE_INCLUDE,
      });
    });

    await this.notifyParties(
      actorId,
      updated,
      'EXPENSE_EDITED',
      (actor) =>
        `${actor} edited an expense: "${updated.name}" (${updated.amount} ${updated.currency}).`,
    );

    return updated;
  }

  async softDelete(actorId: string, expenseId: string): Promise<void> {
    const expense = await this.requireVisible(actorId, expenseId);
    await this.requireEditAuthority(actorId, expense);

    await this.prisma.expense.update({
      where: { id: expenseId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });

    // Participant rows survive a soft delete (only Expense.deletedAt changes),
    // so the pre-delete audience is still queryable here.
    const full = await this.prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: EXPENSE_INCLUDE,
    });
    await this.notifyParties(
      actorId,
      full,
      'EXPENSE_DELETED',
      (actor) => `${actor} deleted an expense: "${full.name}" (${full.amount} ${full.currency}).`,
    );
  }

  async findById(actorId: string, expenseId: string) {
    const expense = await this.requireVisible(actorId, expenseId);
    return this.prisma.expense.findUniqueOrThrow({
      where: { id: expense.id },
      include: EXPENSE_INCLUDE,
    });
  }

  async list(actorId: string, query: ListExpensesQuery) {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    if (query.groupId) {
      await this.groups.requireActiveMembership(query.groupId, actorId);
    }

    const where = query.groupId
      ? { groupId: query.groupId, deletedAt: null }
      : query.friendId
        ? {
            groupId: null,
            deletedAt: null,
            AND: [
              { participants: { some: { userId: actorId } } },
              { participants: { some: { userId: query.friendId } } },
            ],
          }
        : {
            deletedAt: null,
            OR: [
              { groupId: null, participants: { some: { userId: actorId } } },
              { group: { members: { some: { userId: actorId, status: 'ACTIVE' as const } } } },
            ],
          };

    return this.prisma.expense.findMany({
      where,
      include: EXPENSE_INCLUDE,
      orderBy: { expenseDate: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async addNote(actorId: string, expenseId: string, content: string) {
    await this.requireVisible(actorId, expenseId);
    return this.prisma.expenseNote.create({
      data: { expenseId, authorId: actorId, content },
      include: { author: true },
    });
  }

  async listNotes(actorId: string, expenseId: string) {
    await this.requireVisible(actorId, expenseId);
    return this.prisma.expenseNote.findMany({
      where: { expenseId },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * ABRO_PRD.md §36. Replaces any existing receipt -- one per expense,
   * matching the schema's singular `receiptPath`. Uploads the new object
   * before deleting the old one, so a failed upload never destroys a
   * working receipt.
   */
  async uploadReceipt(
    actorId: string,
    expenseId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ) {
    this.requireStorageConfigured();
    const expense = await this.requireVisible(actorId, expenseId);
    await this.requireEditAuthority(actorId, expense);

    const extension = RECEIPT_EXTENSION_BY_MIME_TYPE[file.mimetype];
    if (!extension) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_RECEIPT_TYPE',
        message: 'Receipts must be JPG, PNG, or WebP.',
      });
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      throw new BadRequestException({
        code: 'RECEIPT_TOO_LARGE',
        message: `Receipt must be ${MAX_RECEIPT_BYTES / (1024 * 1024)}MB or smaller.`,
      });
    }

    const key = `receipts/${expenseId}/${randomUUID()}.${extension}`;
    await this.receiptStorage.upload(key, file.buffer, file.mimetype);

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: { receiptPath: key },
      include: EXPENSE_INCLUDE,
    });

    if (expense.receiptPath) {
      await this.receiptStorage.delete(expense.receiptPath);
    }

    return updated;
  }

  /** A short-lived presigned URL -- the caller must already be authorized to view the expense, same as any other read. */
  async getReceiptUrl(actorId: string, expenseId: string): Promise<{ url: string }> {
    this.requireStorageConfigured();
    const expense = await this.requireVisible(actorId, expenseId);
    if (!expense.receiptPath) {
      throw new NotFoundException({
        code: 'RECEIPT_NOT_FOUND',
        message: 'This expense has no receipt.',
      });
    }
    return { url: await this.receiptStorage.getPresignedGetUrl(expense.receiptPath) };
  }

  async deleteReceipt(actorId: string, expenseId: string): Promise<void> {
    this.requireStorageConfigured();
    const expense = await this.requireVisible(actorId, expenseId);
    await this.requireEditAuthority(actorId, expense);
    if (!expense.receiptPath) {
      throw new NotFoundException({
        code: 'RECEIPT_NOT_FOUND',
        message: 'This expense has no receipt.',
      });
    }

    await this.receiptStorage.delete(expense.receiptPath);
    await this.prisma.expense.update({ where: { id: expenseId }, data: { receiptPath: null } });
  }

  /** Same pattern as GoogleOAuthService.isConfigured()'s controller-side gate, applied here instead since receipts have no dedicated controller check of their own. */
  private requireStorageConfigured(): void {
    if (!this.receiptStorage.isConfigured()) {
      throw new NotImplementedException({
        code: 'RECEIPT_STORAGE_NOT_CONFIGURED',
        message: 'Receipt storage is not configured on this server.',
      });
    }
  }

  /** Shared by create/update: resolves payer + currency, checks membership/friendship invariants, computes shares. */
  private async prepareWrite(
    actorId: string,
    input: CreateExpenseInput | UpdateExpenseInput,
  ): Promise<PreparedWrite> {
    const paidById = input.paidById ?? actorId;
    const participantIds = input.participants.map((p) => p.userId);
    if (new Set(participantIds).size !== participantIds.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_PARTICIPANT',
        message: 'A participant appears more than once.',
      });
    }

    let currency = input.currency ?? 'ETB';

    if (input.groupId) {
      const group = await this.prisma.group.findUnique({ where: { id: input.groupId } });
      if (!group) {
        throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'No such group.' });
      }
      currency = group.currency;

      await this.groups.requireActiveMembership(input.groupId, actorId);
      await this.groups.requireActiveMembership(input.groupId, paidById);
      for (const participantId of new Set(participantIds)) {
        await this.groups.requireActiveMembership(input.groupId, participantId);
      }
    } else {
      const involvedIds = new Set([paidById, ...participantIds]);
      if (!involvedIds.has(actorId)) {
        throw new ForbiddenException({
          code: 'NOT_INVOLVED',
          message: 'You must be the payer or a participant.',
        });
      }
      for (const otherId of involvedIds) {
        if (otherId !== actorId && !(await this.friends.areFriends(actorId, otherId))) {
          throw new ConflictException({
            code: 'NOT_FRIENDS',
            message: `User ${otherId} must be a friend.`,
          });
        }
      }
      if (!input.currency) {
        const payer = await this.prisma.profile.findUnique({ where: { id: paidById } });
        currency = payer?.preferredCurrency ?? 'ETB';
      }
    }

    const amount = BigInt(input.amount);
    const participantAmounts = this.computeParticipantAmounts(input, amount);

    return { paidById, currency, participantAmounts };
  }

  /** ABRO_PRD.md §14 Split Logic. Exhaustive over the zod discriminated union — see @abro/types expenses.ts. */
  private computeParticipantAmounts(
    input: CreateExpenseInput | UpdateExpenseInput,
    amount: bigint,
  ): { userId: string; amount: bigint }[] {
    switch (input.splitType) {
      case 'EQUAL': {
        const shares = splitEqually(amount, input.participants.length);
        return input.participants.map((p, i) => ({ userId: p.userId, amount: shares[i]! }));
      }
      case 'EXACT': {
        const result = input.participants.map((p) => ({
          userId: p.userId,
          amount: BigInt(p.amount),
        }));
        try {
          assertSharesMatchTotal(amount, result);
        } catch (error) {
          // assertSharesMatchTotal throws a plain Error (it's shared with apps/web, which
          // doesn't know about HttpException) — a bad EXACT split is a 400, not a 500.
          throw new BadRequestException({
            code: 'SHARES_DO_NOT_MATCH_TOTAL',
            message:
              error instanceof Error ? error.message : 'Participant shares must sum to the total.',
          });
        }
        return result;
      }
      case 'PERCENTAGE': {
        const basisPoints = input.participants.map((p) => BigInt(Math.round(p.percentage * 100)));
        const totalBasisPoints = basisPoints.reduce((a, b) => a + b, 0n);
        if (totalBasisPoints !== 10000n) {
          throw new BadRequestException({
            code: 'PERCENTAGES_MUST_SUM_TO_100',
            message: `Percentages must sum to exactly 100 (got ${Number(totalBasisPoints) / 100}).`,
          });
        }
        const amounts = splitByWeights(amount, basisPoints);
        return input.participants.map((p, i) => ({ userId: p.userId, amount: amounts[i]! }));
      }
      case 'SHARES': {
        const weights = input.participants.map((p) => BigInt(p.shares));
        const amounts = splitByWeights(amount, weights);
        return input.participants.map((p, i) => ({ userId: p.userId, amount: amounts[i]! }));
      }
    }
  }

  /** ABRO_PRD.md §34: EXPENSE_ADDED/EDITED/DELETED to everyone involved (payer + participants) except the actor. */
  private async notifyParties(
    actorId: string,
    expense: { paidById: string; participants: { userId: string }[] },
    type: 'EXPENSE_ADDED' | 'EXPENSE_EDITED' | 'EXPENSE_DELETED',
    body: (actorName: string) => string,
  ): Promise<void> {
    const recipients = new Set([expense.paidById, ...expense.participants.map((p) => p.userId)]);
    recipients.delete(actorId);
    if (recipients.size === 0) {
      return;
    }

    const actor = await this.prisma.profile.findUnique({ where: { id: actorId } });
    const title =
      type === 'EXPENSE_ADDED'
        ? 'New expense'
        : type === 'EXPENSE_EDITED'
          ? 'Expense updated'
          : 'Expense deleted';
    await this.notifications.notifyMany(
      Array.from(recipients),
      type,
      title,
      body(actor?.displayName ?? 'Someone'),
    );
  }

  private async requireVisible(actorId: string, expenseId: string): Promise<Expense> {
    const expense = await this.prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense || expense.deletedAt) {
      throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND', message: 'No such expense.' });
    }

    if (expense.paidById === actorId) {
      return expense;
    }

    const isParticipant = await this.prisma.expenseParticipant.findUnique({
      where: { expenseId_userId: { expenseId, userId: actorId } },
    });
    if (isParticipant) {
      return expense;
    }

    if (expense.groupId) {
      const membership = await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: expense.groupId, userId: actorId } },
      });
      if (membership?.status === 'ACTIVE') {
        return expense;
      }
    }

    throw new ForbiddenException({
      code: 'NOT_VISIBLE',
      message: 'Not authorized to view this expense.',
    });
  }

  private async requireEditAuthority(actorId: string, expense: Expense): Promise<void> {
    if (expense.paidById === actorId) {
      return;
    }
    if (expense.groupId) {
      const membership = await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: expense.groupId, userId: actorId } },
      });
      if (membership?.status === 'ACTIVE' && membership.role === 'ADMIN') {
        return;
      }
    }
    throw new ForbiddenException({
      code: 'NOT_EDIT_AUTHORIZED',
      message: 'Only the payer or a group admin can edit this expense.',
    });
  }
}
