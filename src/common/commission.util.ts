import { CommissionModel } from '@prisma/client';

interface CommissionConfig {
  commissionModel: CommissionModel | null;
  flatCommissionPercentage?: unknown;
  commissionSlabs?: { minRevenue: unknown; commissionPercentage: unknown; slabOrder: number }[];
}

/**
 * Commission earned on `revenue`.
 * - FLAT_PERCENTAGE: flat % of revenue.
 * - MONTHLY_TARGET: % of the highest slab reached by the month-to-date revenue.
 * - DAILY_TARGET: no percentage is configured for this model, so nothing accrues.
 */
export function computeCommission(
  staff: CommissionConfig,
  revenue: number,
  monthToDateRevenue: number,
): number {
  if (staff.commissionModel === CommissionModel.FLAT_PERCENTAGE) {
    return (revenue * Number(staff.flatCommissionPercentage ?? 0)) / 100;
  }
  if (staff.commissionModel === CommissionModel.MONTHLY_TARGET) {
    const slab = [...(staff.commissionSlabs ?? [])]
      .sort((a, b) => a.slabOrder - b.slabOrder)
      .reverse()
      .find((s) => monthToDateRevenue >= Number(s.minRevenue));
    return slab ? (revenue * Number(slab.commissionPercentage)) / 100 : 0;
  }
  return 0;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
