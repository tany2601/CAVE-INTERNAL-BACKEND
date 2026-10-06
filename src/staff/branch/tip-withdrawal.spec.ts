import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { BranchOpsService } from './branch.service.js';

/** Branch ops with one stylist who earned tips today and has already withdrawn some. */
const make = (tips: number, withdrawn: number) => {
  const closed = (tip: number, mode: string, mins: number) => ({
    stylistId: 'u1',
    totalAmount: 500 + tip,
    tipAmount: tip,
    paymentMode: mode,
    startedAt: new Date(Date.now() - mins * 60000),
    closedAt: new Date(),
    services: [{ serviceName: 'Haircut' }],
  });
  const prisma: any = {
    branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'CAVE X', isActive: true }) },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'u1', isActive: true, branchId: 'b1' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'u1', name: 'Arman', commissionSlabs: [], dailyRevenueTarget: 0 }]),
    },
    session: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([closed(tips - 20, 'CASH', 30), closed(20, 'GPAY', 50)]) // completed
        .mockResolvedValueOnce([]), // active
      groupBy: vi.fn().mockResolvedValue([]),
    },
    sessionService: { findMany: vi.fn().mockResolvedValue([]) },
    staffPayout: {
      groupBy: vi.fn().mockResolvedValue(withdrawn ? [{ userId: 'u1', _sum: { amount: withdrawn } }] : []),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'p1', createdAt: new Date(), ...data })),
    },
  };
  return { prisma, service: new BranchOpsService(prisma, {} as any) };
};
const mgr = { role: 'MANAGER', branchId: 'b1' };

describe('tip withdrawal', () => {
  it('withdraws everything that is left when no amount is given', async () => {
    const { prisma, service } = make(100, 30);
    const res = await service.createPayout(mgr, { userId: 'u1', kind: 'TIP_WITHDRAWAL', paymentMode: 'CASH' } as any);
    expect(res.amount).toBe(70);
    expect(prisma.staffPayout.create.mock.calls[0][0].data.kind).toBe('TIP_WITHDRAWAL');
  });

  it('refuses more than the tips available', async () => {
    const { service } = make(100, 30);
    await expect(
      service.createPayout(mgr, { userId: 'u1', kind: 'TIP_WITHDRAWAL', paymentMode: 'CASH', amount: 80 } as any),
    ).rejects.toThrow(/Only ₹70/);
  });

  it('says so when there is nothing left', async () => {
    const { service } = make(100, 100);
    await expect(
      service.createPayout(mgr, { userId: 'u1', kind: 'TIP_WITHDRAWAL', paymentMode: 'CASH' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('reports the cash/GPay split and session times in today\'s stats', async () => {
    const { service } = make(100, 0);
    const day = await service.getStats(mgr, 'TODAY');
    expect(day.stylists[0]).toMatchObject({
      cashRevenue: 500,
      gpayRevenue: 500,
      cashTips: 80,
      gpayTips: 20,
      workMinutes: 80,
      avgSessionMinutes: 40,
      tipsAvailable: 100,
    });
  });
});
