import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  type MonthlyAnalyticsQuery,
  type YearlyAnalyticsQuery,
  monthlyAnalyticsQuerySchema,
  yearlyAnalyticsQuerySchema,
} from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(SessionGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('monthly')
  monthly(
    @CurrentUser() user: Profile,
    @Query(new ZodValidationPipe(monthlyAnalyticsQuerySchema)) query: MonthlyAnalyticsQuery,
  ) {
    return this.analytics.getMonthly(user.id, query.year, query.month);
  }

  @Get('yearly')
  yearly(
    @CurrentUser() user: Profile,
    @Query(new ZodValidationPipe(yearlyAnalyticsQuerySchema)) query: YearlyAnalyticsQuery,
  ) {
    return this.analytics.getYearly(user.id, query.year);
  }
}
