import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TransactionType, PaymentMode } from '@prisma/client';
import { BranchOpsService } from './branch.service.js';

describe('BranchOpsService', () => {
  const branch = { id: 'branch-1', name: 'CAVE Karkala', code: 'KARKALA', isActive: true };
  const reqUser = { branchId: branch.id, role: 'MANAGER' };

  let prisma: any;
  let service: BranchOpsService;

  beforeEach(() => {
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue(branch) },
      branchServicePricing: { findMany: vi.fn() },
      customer: { findUnique: vi.fn() },
      user: { findUnique: vi.fn(), findFirst: vi.fn() },
      branchTransaction: { create: vi.fn() },
    };
    service = new BranchOpsService(prisma, { formatSessionOutput: vi.fn() } as any);
  });

  describe('branch context', () => {
    it('rejects tokens without a branch', async () => {
      await expect(service.getMenu({ role: 'MANAGER' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects inactive branches', async () => {
      prisma.branch.findUnique.mockResolvedValue({ ...branch, isActive: false });
      await expect(service.getMenu(reqUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMenu', () => {
    it('returns pricing ids as menu ids with numeric prices', async () => {
      prisma.branchServicePricing.findMany.mockResolvedValue([
        { id: 'p1', serviceId: 's1', price: 300, service: { name: 'Haircut', category: null } },
      ]);
      const res = await service.getMenu(reqUser);
      expect(res.data).toEqual([
        { id: 'p1', serviceId: 's1', name: 'Haircut', category: null, price: 300 },
      ]);
      expect(prisma.branchServicePricing.findMany.mock.calls[0][0].where).toMatchObject({
        branchId: branch.id,
        isActive: true,
      });
    });
  });

  describe('lookupCustomer', () => {
    it('reports an unknown customer as zero visits', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      const res = await service.lookupCustomer('+91 98765 43210');
      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { phone: '9876543210' },
      });
      expect(res).toMatchObject({ found: false, visitCount: 0, rewardReady: false });
    });

    it('shows progress within the 6-visit cycle', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        name: 'Rohan',
        qualifyingCompletedSessionsCount: 8,
      });
      const res = await service.lookupCustomer('9876543210');
      expect(res).toMatchObject({ found: true, visitCount: 2, rewardReady: false });
    });

    it('flags the reward once the 6th qualifying session is completed', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        name: 'Rohan',
        qualifyingCompletedSessionsCount: 6,
      });
      const res = await service.lookupCustomer('9876543210');
      expect(res).toMatchObject({ visitCount: 6, loyaltyTarget: 6, rewardReady: true });
    });
  });

  describe('createExpense', () => {
    const base = {
      description: 'Towels',
      amount: 850,
      paymentMode: PaymentMode.CASH,
    };

    it('requires an employee for advances', async () => {
      await expect(
        service.createExpense(reqUser, { ...base, type: TransactionType.EMPLOYEE_ADVANCE }),
      ).rejects.toThrow(/employeeId is required/);
    });

    it('rejects employees from another branch', async () => {
      prisma.user.findUnique.mockResolvedValue({ isActive: true, branchId: 'other' });
      await expect(
        service.createExpense(reqUser, {
          ...base,
          type: TransactionType.EMPLOYEE_ADVANCE,
          employeeId: 'u1',
        }),
      ).rejects.toThrow(/does not belong to your branch/);
    });

    it('rejects an employee on a general expense', async () => {
      await expect(
        service.createExpense(reqUser, {
          ...base,
          type: TransactionType.GENERAL_EXPENSE,
          employeeId: 'u1',
        }),
      ).rejects.toThrow(/only allowed for EMPLOYEE_ADVANCE/);
    });

    it('needs an active branch manager to attribute the entry to', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.createExpense(reqUser, { ...base, type: TransactionType.GENERAL_EXPENSE }),
      ).rejects.toThrow(/no active manager/);
    });

    it('records the expense against the branch manager', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'mgr-1', name: 'Branch Manager' });
      prisma.branchTransaction.create.mockResolvedValue({
        id: 't1',
        type: TransactionType.GENERAL_EXPENSE,
        description: 'Towels',
        amount: 850,
        paymentMode: PaymentMode.CASH,
        employeeId: null,
        createdAt: new Date('2026-10-04T10:00:00Z'),
      });
      const res = await service.createExpense(reqUser, {
        ...base,
        type: TransactionType.GENERAL_EXPENSE,
      });
      expect(prisma.branchTransaction.create.mock.calls[0][0].data).toMatchObject({
        branchId: branch.id,
        createdById: 'mgr-1',
        amount: 850,
      });
      expect(res).toMatchObject({ id: 't1', amount: 850, addedBy: 'Branch Manager' });
    });
  });
});
