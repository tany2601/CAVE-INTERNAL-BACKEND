import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentMode } from '@prisma/client';
import { AdminReportsService } from './admin-reports.service.js';
import { SummaryPeriod } from '../transactions/dto/transactions-summary-query.dto.js';

describe('AdminReportsService', () => {
  let prisma: any;
  let service: AdminReportsService;

  beforeEach(() => {
    prisma = {
      session: { groupBy: vi.fn() },
      branch: { findMany: vi.fn().mockResolvedValue([{ id: 'b1', name: 'CAVE Karkala' }]) },
    };
    service = new AdminReportsService(prisma);
  });

  it('splits collected revenue by payment mode and excludes tips from revenue', async () => {
    prisma.session.groupBy.mockResolvedValue([
      {
        branchId: 'b1',
        paymentMode: PaymentMode.CASH,
        _sum: { totalAmount: 300, tipAmount: 0 },
        _count: { _all: 1 },
      },
      {
        branchId: 'b1',
        paymentMode: PaymentMode.GPAY,
        _sum: { totalAmount: 724.1, tipAmount: 50 },
        _count: { _all: 1 },
      },
    ]);

    const res = await service.getRevenueSummary({
      period: SummaryPeriod.TODAY,
    } as any);

    expect(res).toMatchObject({
      sessions: 2,
      collected: 1024.1,
      tips: 50,
      revenue: 974.1,
      cashCollected: 300,
      gpayCollected: 724.1,
    });
    expect(res.byBranch).toEqual([
      { branchId: 'b1', name: 'CAVE Karkala', collected: 1024.1, sessions: 2 },
    ]);
  });

  it('does not bound the query by date for ALL_TIME', async () => {
    prisma.session.groupBy.mockResolvedValue([]);
    await service.getRevenueSummary({ period: SummaryPeriod.ALL_TIME } as any);
    expect(prisma.session.groupBy.mock.calls[0][0].where.closedAt).toBeUndefined();
  });

  it('scopes to a single branch when requested', async () => {
    prisma.session.groupBy.mockResolvedValue([]);
    await service.getRevenueSummary({
      period: SummaryPeriod.THIS_MONTH,
      branchId: 'b1',
    } as any);
    expect(prisma.session.groupBy.mock.calls[0][0].where.branchId).toBe('b1');
  });
});
