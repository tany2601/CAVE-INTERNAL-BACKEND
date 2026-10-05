import { describe, it, expect } from 'vitest';
import { CommissionModel } from '@prisma/client';
import { computeCommission } from './commission.util.js';

const slabs = [
  { slabOrder: 1, minRevenue: 10000, commissionPercentage: 5 },
  { slabOrder: 2, minRevenue: 25000, commissionPercentage: 8 },
  { slabOrder: 3, minRevenue: 50000, commissionPercentage: 12 },
];

describe('computeCommission', () => {
  it('applies a flat percentage to the revenue', () => {
    expect(
      computeCommission(
        { commissionModel: CommissionModel.FLAT_PERCENTAGE, flatCommissionPercentage: 20 },
        1000,
        0,
      ),
    ).toBe(200);
  });

  it('uses the highest slab reached by month-to-date revenue', () => {
    const staff = { commissionModel: CommissionModel.MONTHLY_TARGET, commissionSlabs: slabs };
    expect(computeCommission(staff, 1000, 30000)).toBe(80);
    expect(computeCommission(staff, 1000, 12000)).toBe(50);
  });

  it('pays nothing below the first slab', () => {
    const staff = { commissionModel: CommissionModel.MONTHLY_TARGET, commissionSlabs: slabs };
    expect(computeCommission(staff, 1000, 500)).toBe(0);
  });

  it('accrues nothing for DAILY_TARGET (no percentage configured) or no model', () => {
    expect(computeCommission({ commissionModel: CommissionModel.DAILY_TARGET }, 1000, 1000)).toBe(0);
    expect(computeCommission({ commissionModel: null }, 1000, 1000)).toBe(0);
  });
});
