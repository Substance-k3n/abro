import { z } from 'zod';

/** ABRO_PRD.md §26 "Monthly" -- GET /analytics/monthly?year=&month= */
export const monthlyAnalyticsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type MonthlyAnalyticsQuery = z.infer<typeof monthlyAnalyticsQuerySchema>;

/** ABRO_PRD.md §26 "Yearly" -- GET /analytics/yearly?year= */
export const yearlyAnalyticsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});
export type YearlyAnalyticsQuery = z.infer<typeof yearlyAnalyticsQuerySchema>;

export interface CategoryAmount {
  category: string;
  amount: bigint;
}

/**
 * Shared field definitions (ABRO_PRD.md §26):
 *   Total Spending  -- sum of relevant expense totals (each expense counted
 *                      once, full amount, for every expense the user paid
 *                      or participated in).
 *   Your Contribution -- amount actually paid by the user.
 *   Your Share      -- amount allocated to the user.
 *   Net Position    -- Your Contribution minus Your Share (matches
 *                      BalancesService.getGroupSummary's netBalance).
 * All exclude soft-deleted expenses and SETTLEMENT-type rows (settlements
 * are reported separately, in `settlements`, to avoid double-counting a
 * debt transfer as new "spending").
 */
export interface MonthlyAnalytics {
  year: number;
  month: number;
  totalSpending: bigint;
  yourContribution: bigint;
  yourShare: bigint;
  netPosition: bigint;
  amountOwed: bigint;
  amountReceived: bigint;
  settlements: { paid: bigint; received: bigint };
  categoryBreakdown: CategoryAmount[];
}

export interface MonthlySpending {
  month: number;
  totalSpending: bigint;
}

export interface GroupSpending {
  groupId: string;
  groupName: string;
  totalSpending: bigint;
}

export interface YearlyAnalytics {
  year: number;
  yearlyTotal: bigint;
  monthlyTrend: MonthlySpending[];
  categoryDistribution: CategoryAmount[];
  groupSpending: GroupSpending[];
  personalContribution: bigint;
}
