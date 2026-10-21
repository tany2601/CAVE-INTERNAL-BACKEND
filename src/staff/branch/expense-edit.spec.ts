import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BranchOpsService } from './branch.service.js';

const reqUser = { role: 'MANAGER', branchId: 'b1' };
const tx = (over: any = {}) => ({
  id: 't1',
  branchId: 'b1',
  type: 'GENERAL_EXPENSE',
  description: 'Towels',
  amount: 100,
  paymentMode: 'CASH',
  employeeId: null,
  createdAt: new Date(),
  createdBy: { name: 'Manager' },
  ...over,
});

describe('editing an expense', () => {
  let prisma: any;
  let service: BranchOpsService;

  beforeEach(() => {
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'X', isActive: true }) },
      branchTransaction: {
        findUnique: vi.fn().mockResolvedValue(tx()),
        update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...tx(), ...data })),
      },
      dailyBalance: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    service = new BranchOpsService(prisma, {} as any);
  });

  it("changes only what was sent", async () => {
    const res = await service.updateExpense(reqUser, 't1', { amount: 150.5, paymentMode: 'GPAY' } as any);
    expect(prisma.branchTransaction.update.mock.calls[0][0].data).toEqual({ amount: 150.5, paymentMode: 'GPAY' });
    expect(res).toMatchObject({ amount: 150.5, paymentMode: 'GPAY', description: 'Towels' });
  });

  it("won't touch another branch's expense", async () => {
    prisma.branchTransaction.findUnique.mockResolvedValue(tx({ branchId: 'other' }));
    await expect(service.updateExpense(reqUser, 't1', { amount: 1 } as any)).rejects.toThrow(NotFoundException);
    expect(prisma.branchTransaction.update).not.toHaveBeenCalled();
  });

  it('refuses an earlier day, and a day whose books are closed', async () => {
    prisma.branchTransaction.findUnique.mockResolvedValue(tx({ createdAt: new Date(Date.now() - 3 * 86400000) }));
    await expect(service.updateExpense(reqUser, 't1', { amount: 1 } as any)).rejects.toThrow(ConflictException);
    prisma.branchTransaction.findUnique.mockResolvedValue(tx());
    prisma.dailyBalance.findUnique.mockResolvedValue({ closedAt: new Date() });
    await expect(service.updateExpense(reqUser, 't1', { amount: 1 } as any)).rejects.toThrow(ConflictException);
    expect(prisma.branchTransaction.update).not.toHaveBeenCalled();
  });
});
