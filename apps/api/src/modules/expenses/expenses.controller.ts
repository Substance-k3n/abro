import {
  Body,
  Controller,
  Delete,
  Get,
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
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@UseGuards(SessionGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  create(
    @CurrentUser() user: Profile,
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
  ) {
    return this.expenses.create(user.id, body);
  }

  @Get()
  list(
    @CurrentUser() user: Profile,
    @Query(new ZodValidationPipe(listExpensesQuerySchema)) query: ListExpensesQuery,
  ) {
    return this.expenses.list(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: Profile, @Param('id') id: string) {
    return this.expenses.findById(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: Profile,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExpenseSchema)) body: UpdateExpenseInput,
  ) {
    return this.expenses.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: Profile, @Param('id') id: string) {
    return this.expenses.softDelete(user.id, id);
  }

  @Get(':id/notes')
  listNotes(@CurrentUser() user: Profile, @Param('id') id: string) {
    return this.expenses.listNotes(user.id, id);
  }

  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  addNote(
    @CurrentUser() user: Profile,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addExpenseNoteSchema)) body: AddExpenseNoteInput,
  ) {
    return this.expenses.addNote(user.id, id, body.content);
  }
}
