import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PayoutKind, PaymentMode, CommissionModel } from '@prisma/client';
import { BranchOpsService } from './branch.service.js';

/** One stylist on a flat 10% commission who has billed `revenue` today, with `paid` already handed over. */
const make = (revenue: number, paid: number) => {
  const prisma: any = {
    branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'CAVE X', isActive: true }) },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'u1', isActive: true, branchId: 'b1' }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'u1',
          name: 'Arman',
          commissionModel: CommissionModel.FLAT_PERCENTAGE,
          flatCommissionPercentage: 10,
          commissionSlabs: [],
          dailyRevenueTarget: 0,
        },
      ]),
    },
    session: {
      // Completed bills today, or the (empty) list of bills still in the chair.
      findMany: vi.fn().mockImplementation(async (args: any) =>
        args.where.status === 'COMPLETED' && revenue
          ? [
              {
                stylistId: 'u1',
                totalAmount: revenue,
                tipAmount: 0,
                paymentMode: 'CASH',
                startedAt: null,
                closedAt: null,
                services: [{ serviceName: 'Haircut' }],
              },
            ]
          : [],
      ),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    sessionService: { findMany: vi.fn().mockResolvedValue([]) },
    staffPayout: {
      groupBy: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: paid || null } }),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'p1', createdAt: new Date(), ...data })),
    },
  };
  return { prisma, service: new BranchOpsService(prisma, {} as any) };
};
const mgr = { role: 'MANAGER', branchId: 'b1' };
const pay = (over: object = {}) => ({ userId: 'u1', paymentMode: PaymentMode.CASH, ...over }) as any;

describe('commission payouts', () => {
  it('pays the full amount earned when nothing has been paid yet', async () => {
    const { prisma, service } = make(2548.2, 0);
    const res = await service.createPayout(mgr, pay());
    expect(res.amount).toBe(254.82);
    expect(prisma.staffPayout.create.mock.calls[0][0].data.kind).toBe(PayoutKind.COMMISSION);
  });

  it('after a payout, only the commission earned since then is owed', async () => {
    // earned 10% of 3000 = 300; 254.82 already paid -> 45.18 still owed
    const { service } = make(3000, 254.82);
    const res = await service.createPayout(mgr, pay());
    expect(res.amount).toBe(45.18);
  });

  it('refuses to pay more than is owed, to the paisa', async () => {
    const { service } = make(3000, 254.82);
    await expect(service.createPayout(mgr, pay({ amount: 45.19 }))).rejects.toThrow(/Only ₹45.18/);
    await expect(service.createPayout(mgr, pay({ amount: 45.18 }))).resolves.toBeTruthy();
  });

  it('says settled once everything earned has been paid', async () => {
    const { service } = make(2548.2, 254.82);
    await expect(service.createPayout(mgr, pay())).rejects.toThrow(ConflictException);
  });

  it('refuses a payout when nothing has been earned', async () => {
    const { service } = make(0, 0);
    await expect(service.createPayout(mgr, pay())).rejects.toThrow(ConflictException);
  });

  it('rejects staff from another branch', async () => {
    const { prisma, service } = make(1000, 0);
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: true, branchId: 'other' });
    await expect(service.createPayout(mgr, pay())).rejects.toThrow(BadRequestException);
  });
});
