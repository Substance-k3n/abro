import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AddExpenseNoteInput,
  type CreateExpenseInput,
  type ListExpensesQuery,
  type UpdateExpenseInput,
  addExpenseNoteSchema,
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { toAuthExpense } from '../../common/mappers/to-auth-expense';
import { toAuthExpenseNote } from '../../common/mappers/to-auth-expense-note';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@UseGuards(SessionGuard)
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: Profile,
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.run(user.id, idempotencyKey, 'POST /expenses', async () =>
      toAuthExpense(await this.expenses.create(user.id, body)),
    );
  }

  @Get()
  async list(
    @CurrentUser() user: Profile,
    @Query(new ZodValidationPipe(listExpensesQuerySchema)) query: ListExpensesQuery,
  ) {
    return (await this.expenses.list(user.id, query)).map(toAuthExpense);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: Profile, @Param('id') id: string) {
    return toAuthExpense(await this.expenses.findById(user.id, id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: Profile,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExpenseSchema)) body: UpdateExpenseInput,
  ) {
    return toAuthExpense(await this.expenses.update(user.id, id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: Profile, @Param('id') id: string) {
    return this.expenses.softDelete(user.id, id);
  }

  @Get(':id/notes')
  async listNotes(@CurrentUser() user: Profile, @Param('id') id: string) {
    return (await this.expenses.listNotes(user.id, id)).map(toAuthExpenseNote);
  }

  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  async addNote(
    @CurrentUser() user: Profile,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addExpenseNoteSchema)) body: AddExpenseNoteInput,
  ) {
    return toAuthExpenseNote(await this.expenses.addNote(user.id, id, body.content));
  }
}
