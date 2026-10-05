import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentMode, PayoutKind } from '@prisma/client';
import { BranchOpsService } from './branch.service.js';

describe('BranchOpsService · day balances, payouts and checklist', () => {
  const branch = { id: 'branch-1', name: 'CAVE Karkala', code: 'KARKALA', isActive: true };
  const reqUser = { branchId: branch.id, role: 'MANAGER' };
  let prisma: any;
  let service: BranchOpsService;

  beforeEach(() => {
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue(branch) },
      dailyBalance: { findUnique: vi.fn(), upsert: vi.fn() },
      session: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
      branchTransaction: { groupBy: vi.fn().mockResolvedValue([]) },
      staffPayout: { groupBy: vi.fn().mockResolvedValue([]), count: vi.fn(), create: vi.fn() },
      user: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      sessionService: { findMany: vi.fn().mockResolvedValue([]) },
      checklistTask: { findMany: vi.fn(), findUnique: vi.fn() },
      checklistCompletion: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    };
    service = new BranchOpsService(prisma, { formatSessionOutput: vi.fn() } as any);
  });

  describe('opening balance', () => {
    it('saves the opening balances for today', async () => {
      prisma.dailyBalance.findUnique.mockResolvedValue(null);
      prisma.dailyBalance.upsert.mockResolvedValue({
        date: new Date('2026-10-04T00:00:00Z'),
        openingCash: 10000,
        openingGpay: 5000,
        openingSetAt: new Date(),
        closedAt: null,
      });
      const res = await service.setOpeningBalance(reqUser, { cash: 10000, gpay: 5000 });
      expect(res).toMatchObject({ openingSet: true, openingCash: 10000, openingGpay: 5000, closed: false });
    });

    it('refuses to change the opening once the day is closed', async () => {
      prisma.dailyBalance.findUnique.mockResolvedValue({ closedAt: new Date() });
      await expect(service.setOpeningBalance(reqUser, { cash: 1, gpay: 1 })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('closeDay', () => {
    it('stores the ledger-expected balances next to the counted ones', async () => {
      prisma.dailyBalance.findUnique.mockResolvedValue({ openingCash: 10000, openingGpay: 5000 });
      prisma.session.groupBy.mockResolvedValue([
        { paymentMode: PaymentMode.CASH, _sum: { totalAmount: 1000 } },
        { paymentMode: PaymentMode.GPAY, _sum: { totalAmount: 700 } },
      ]);
      prisma.branchTransaction.groupBy.mockResolvedValue([
        { paymentMode: PaymentMode.CASH, _sum: { amount: 850 } },
      ]);
      prisma.staffPayout.groupBy.mockResolvedValue([
        { paymentMode: PaymentMode.CASH, _sum: { amount: 150 } },
      ]);
      prisma.dailyBalance.upsert.mockImplementation(async ({ create }: any) => ({
        ...create,
        date: new Date('2026-10-04T00:00:00Z'),
      }));

      const res = await service.closeDay(reqUser, { actualCash: 9900, actualGpay: 5700 });

      // cash: 10000 + 1000 - 850 - 150 ; gpay: 5000 + 700
      expect(res.expectedCash).toBe(10000);
      expect(res.expectedGpay).toBe(5700);
      expect(res).toMatchObject({ closed: true, closingCash: 9900, closingGpay: 5700 });
    });

    it('cannot close twice', async () => {
      prisma.dailyBalance.findUnique.mockResolvedValue({ closedAt: new Date() });
      await expect(service.closeDay(reqUser, { actualCash: 1, actualGpay: 1 })).rejects.toThrow(
        /already closed/,
      );
    });
  });

  describe('createPayout', () => {
    const staff = { id: 'u1', isActive: true, branchId: branch.id };

    it('rejects staff from another branch', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...staff, branchId: 'other' });
      await expect(
        service.createPayout(reqUser, { userId: 'u1', paymentMode: PaymentMode.CASH }),
      ).rejects.toThrow(BadRequestException);
    });

    it("won't pay a stylist's commission twice in a day", async () => {
      prisma.user.findUnique.mockResolvedValue(staff);
      prisma.staffPayout.count.mockResolvedValue(1);
      await expect(
        service.createPayout(reqUser, { userId: 'u1', paymentMode: PaymentMode.CASH, amount: 100 }),
      ).rejects.toThrow(ConflictException);
    });

    it('records an explicit commission amount in the ledger', async () => {
      prisma.user.findUnique.mockResolvedValue(staff);
      prisma.staffPayout.count.mockResolvedValue(0);
      prisma.staffPayout.create.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        kind: PayoutKind.COMMISSION,
        amount: 254.82,
        paymentMode: PaymentMode.CASH,
        createdAt: new Date(),
      });
      const res = await service.createPayout(reqUser, {
        userId: 'u1',
        paymentMode: PaymentMode.CASH,
        amount: 254.82,
      });
      expect(prisma.staffPayout.create.mock.calls[0][0].data).toMatchObject({
        branchId: branch.id,
        userId: 'u1',
        amount: 254.82,
        kind: PayoutKind.COMMISSION,
      });
      expect(res.amount).toBe(254.82);
    });

    it('refuses a zero payout', async () => {
      prisma.user.findUnique.mockResolvedValue(staff);
      prisma.staffPayout.count.mockResolvedValue(0);
      // no commission accrued -> computed amount is 0
      await expect(
        service.createPayout(reqUser, { userId: 'u1', paymentMode: PaymentMode.CASH }),
      ).rejects.toThrow(/nothing to pay out/);
    });
  });

  describe('checklist', () => {
    it("marks today's completions on the shared template", async () => {
      prisma.checklistTask.findMany.mockResolvedValue([
        { id: 't1', task: 'Open workstation', description: 'Lights', sortOrder: 1 },
        { id: 't2', task: 'Check towels', description: null, sortOrder: 2 },
      ]);
      prisma.checklistCompletion.findMany.mockResolvedValue([{ taskId: 't1' }]);
      const res = await service.getChecklist(reqUser);
      expect(res.data).toEqual([
        { id: 't1', task: 'Open workstation', description: 'Lights', done: true },
        { id: 't2', task: 'Check towels', description: '', done: false },
      ]);
    });

    it('does not let a branch tick another branch\'s task', async () => {
      prisma.checklistTask.findUnique.mockResolvedValue({ id: 't9', isActive: true, branchId: 'other' });
      await expect(service.setChecklistItem(reqUser, 't9', true)).rejects.toThrow(NotFoundException);
    });

    it('unticking removes the completion', async () => {
      prisma.checklistTask.findUnique.mockResolvedValue({ id: 't1', isActive: true, branchId: null });
      prisma.checklistTask.findMany.mockResolvedValue([]);
      prisma.checklistCompletion.findMany.mockResolvedValue([]);
      await service.setChecklistItem(reqUser, 't1', false);
      expect(prisma.checklistCompletion.deleteMany).toHaveBeenCalled();
      expect(prisma.checklistCompletion.upsert).not.toHaveBeenCalled();
    });
  });
});
