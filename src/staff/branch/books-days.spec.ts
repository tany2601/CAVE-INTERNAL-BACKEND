import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentMode } from '@prisma/client';
import { BranchOpsService } from './branch.service.js';
import { addDaysToKey, dayKey, dayStart } from '../../common/time.util.js';

const reqUser = { role: 'MANAGER', branchId: 'b1' };
const today = dayKey();
const daysAgo = (n: number) => addDaysToKey(today, -n);

describe('catching up on earlier days (opening / closing books)', () => {
  let prisma: any;
  let service: BranchOpsService;

  beforeEach(() => {
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'CAVE X', isActive: true }) },
      dailyBalance: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockImplementation(async ({ create }: any) => ({ ...create })),
      },
      session: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
      branchTransaction: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
      staffPayout: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new BranchOpsService(prisma, {} as any);
  });

  it('records the opening balance for an earlier day', async () => {
    const res = await service.setOpeningBalance(reqUser, { date: daysAgo(1), cash: 5000, gpay: 2000 } as any);
    expect(prisma.dailyBalance.upsert.mock.calls[0][0].create.date.toISOString().slice(0, 10)).toBe(daysAgo(1));
    expect(res).toMatchObject({ openingSet: true, openingCash: 5000, openingGpay: 2000 });
  });

  it('refuses future days, old days and malformed dates', async () => {
    for (const date of [addDaysToKey(today, 1), daysAgo(61), '2026-13-45', 'yesterday']) {
      await expect(service.setOpeningBalance(reqUser, { date, cash: 1, gpay: 1 } as any)).rejects.toThrow(
        BadRequestException,
      );
    }
  });

  it("closes an earlier day using only that day's sales, expenses and payouts", async () => {
    prisma.dailyBalance.findUnique.mockResolvedValue({ openingCash: 1000, openingGpay: 500 });
    prisma.session.groupBy.mockResolvedValue([{ paymentMode: PaymentMode.CASH, _sum: { totalAmount: 800 } }]);
    await service.closeDay(reqUser, { date: daysAgo(2), actualCash: 1800, actualGpay: 500 } as any);

    // The sales query is bounded to that IST day: from its start to the start of the next day.
    const where = prisma.session.groupBy.mock.calls[0][0].where.closedAt;
    expect(where.gte.getTime()).toBe(dayStart(daysAgo(2)).getTime());
    expect(where.lt.getTime()).toBe(dayStart(daysAgo(1)).getTime());
    const row = prisma.dailyBalance.upsert.mock.calls[0][0].create;
    expect(row).toMatchObject({ expectedCash: 1800, expectedGpay: 500, closingCash: 1800 });
    expect(row.date.toISOString().slice(0, 10)).toBe(daysAgo(2));
  });

  it("won't close the same day twice", async () => {
    prisma.dailyBalance.findUnique.mockResolvedValue({ closedAt: new Date() });
    await expect(
      service.closeDay(reqUser, { date: daysAgo(1), actualCash: 1, actualGpay: 1 } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('shows the live expected balances for a chosen day before it is closed', async () => {
    prisma.dailyBalance.findUnique.mockResolvedValue({ date: new Date(`${daysAgo(1)}T00:00:00Z`), openingCash: 1000, openingGpay: 0, openingSetAt: new Date(), closedAt: null });
    prisma.session.groupBy.mockResolvedValue([{ paymentMode: PaymentMode.GPAY, _sum: { totalAmount: 250.5 } }]);
    prisma.branchTransaction.groupBy.mockResolvedValue([{ paymentMode: PaymentMode.CASH, _sum: { amount: 100 } }]);
    const day = await service.getDay(reqUser, daysAgo(1));
    expect(day).toMatchObject({ date: daysAgo(1), openingSet: true, closed: false, expectedCash: 900, expectedGpay: 250.5 });
    expect(day.flow).toMatchObject({ salesGpay: 250.5, expensesCash: 100 });
  });

  it('lists only recent days that had business but are missing an opening or closing', async () => {
    const at = (key: string) => new Date(dayStart(key).getTime() + 3 * 3600_000);
    prisma.session.findMany.mockResolvedValue([{ closedAt: at(daysAgo(1)) }, { closedAt: at(daysAgo(2)) }, { closedAt: at(daysAgo(3)) }]);
    prisma.branchTransaction.findMany.mockResolvedValue([{ createdAt: at(daysAgo(2)) }]);
    prisma.dailyBalance.findMany.mockResolvedValue([
      // 1 day ago: complete. 2 days ago: opened but never closed. 3 days ago: nothing recorded.
      { date: new Date(`${daysAgo(1)}T00:00:00Z`), openingSetAt: new Date(), closedAt: new Date() },
      { date: new Date(`${daysAgo(2)}T00:00:00Z`), openingSetAt: new Date(), closedAt: null },
    ]);
    const res = await service.getPendingDays(reqUser);
    expect(res.data).toEqual([
      { date: daysAgo(2), openingMissing: false, closingMissing: true },
      { date: daysAgo(3), openingMissing: true, closingMissing: true },
    ]);
  });

  it('has nothing pending when the earlier days were quiet', async () => {
    expect((await service.getPendingDays(reqUser)).data).toEqual([]);
  });
});
