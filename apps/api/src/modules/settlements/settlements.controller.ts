import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { type CreateSettlementInput, createSettlementSchema } from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SettlementsService } from './settlements.service';

@Controller('settlements')
@UseGuards(SessionGuard)
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: Profile,
    @Body(new ZodValidationPipe(createSettlementSchema)) body: CreateSettlementInput,
  ) {
    return this.settlements.create(user.id, body);
  }
}
