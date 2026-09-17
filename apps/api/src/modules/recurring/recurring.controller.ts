import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreateRecurringExpenseInput,
  type SetRecurringEnabledInput,
  createRecurringExpenseSchema,
  setRecurringEnabledSchema,
} from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RecurringService } from './recurring.service';

@Controller('recurring')
@UseGuards(SessionGuard)
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Post()
  create(
    @CurrentUser() user: Profile,
    @Body(new ZodValidationPipe(createRecurringExpenseSchema)) body: CreateRecurringExpenseInput,
  ) {
    return this.recurring.create(user.id, body);
  }

  @Get()
  listMine(@CurrentUser() user: Profile) {
    return this.recurring.listMine(user.id);
  }

  @Patch(':id/enabled')
  setEnabled(
    @CurrentUser() user: Profile,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setRecurringEnabledSchema)) body: SetRecurringEnabledInput,
  ) {
    return this.recurring.setEnabled(user.id, id, body.enabled);
  }

  /**
   * Manual/external trigger for MVP -- see recurring.service.ts's doc
   * comment and docs/DECISIONS.md ADR-005. Any authenticated user can call
   * this today (it only ever generates what's genuinely due, so it's
   * harmless, not a privilege issue) -- a known limitation, not a
   * production-ready cron replacement. Revisit in a hardening pass.
   */
  @Post('generate-due')
  generateDue() {
    return this.recurring.generateDue();
  }
}
