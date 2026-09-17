import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { type CreateSettlementInput, createSettlementSchema } from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { toAuthExpense } from '../../common/mappers/to-auth-expense';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SettlementsService } from './settlements.service';

@Controller('settlements')
@UseGuards(SessionGuard)
export class SettlementsController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: Profile,
    @Body(new ZodValidationPipe(createSettlementSchema)) body: CreateSettlementInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.run(user.id, idempotencyKey, 'POST /settlements', async () =>
      toAuthExpense(await this.settlements.create(user.id, body)),
    );
  }
}
