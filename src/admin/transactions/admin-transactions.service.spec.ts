import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AdminTransactionsService } from './admin-transactions.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TransactionType, PaymentMode } from '@prisma/client';

describe('AdminTransactionsService', () => {
  let service: AdminTransactionsService;
  let prisma: {
    branch: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    branchTransaction: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  const mockBranch = {
    id: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Downtown Salon',
    code: 'DT01',
    isActive: true,
  };

  const mockInactiveBranch = {
    id: 'b1a2c3d4-e5f6-7890-abcd-ef1234567899',
    name: 'Closed Branch',
    code: 'CB01',
    isActive: false,
  };

  const mockEmployee = {
    id: 'u1a2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Rahul Stylist',
    branchId: mockBranch.id,
    isActive: true,
    role: { name: 'STYLIST' },
  };

  const mockOtherBranchEmployee = {
    id: 'u1a2c3d4-e5f6-7890-abcd-ef1234567899',
    name: 'Other Stylist',
    branchId: 'b-other',
    isActive: true,
    role: { name: 'STYLIST' },
  };

  const mockAdminUser = {
    id: 'u1a2c3d4-admin',
    name: 'Admin User',
    branchId: mockBranch.id,
    isActive: true,
    role: { name: 'ADMIN' },
  };

  beforeEach(() => {
    prisma = {
      branch: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      branchTransaction: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    service = new AdminTransactionsService(prisma as unknown as PrismaService);
  });

  describe('createTransaction', () => {
    it('1. Successfully creates GENERAL_EXPENSE transaction', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);

      const mockCreated = {
        id: 't1',
        branchId: mockBranch.id,
        branch: mockBranch,
        type: TransactionType.GENERAL_EXPENSE,
        description: 'Product restock',
        amount: 1200.5,
        paymentMode: PaymentMode.CASH,
        employeeId: null,
        employee: null,
        createdById: 'admin-1',
        createdBy: { id: 'admin-1', name: 'Admin' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.branchTransaction.create.mockResolvedValue(mockCreated);

      const dto = {
        branchId: mockBranch.id,
        type: TransactionType.GENERAL_EXPENSE,
        description: 'Product restock',
        amount: 1200.5,
        paymentMode: PaymentMode.CASH,
      };

      const result = await service.createTransaction(dto, 'admin-1');

      expect(result.message).toBe('Transaction created successfully');
      expect(result.transaction.amount).toBe(1200.5);
      expect(result.transaction.employeeId).toBeNull();
    });

    it('2. Successfully creates EMPLOYEE_ADVANCE transaction', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.user.findUnique.mockResolvedValue(mockEmployee);

      const mockCreated = {
        id: 't2',
        branchId: mockBranch.id,
        branch: mockBranch,
        type: TransactionType.EMPLOYEE_ADVANCE,
        description: 'Salary advance',
        amount: 3000,
        paymentMode: PaymentMode.CASH,
        employeeId: mockEmployee.id,
        employee: { id: mockEmployee.id, name: mockEmployee.name },
        createdById: 'admin-1',
        createdBy: { id: 'admin-1', name: 'Admin' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.branchTransaction.create.mockResolvedValue(mockCreated);

      const dto = {
        branchId: mockBranch.id,
        type: TransactionType.EMPLOYEE_ADVANCE,
        description: 'Salary advance',
        amount: 3000,
        paymentMode: PaymentMode.CASH,
        employeeId: mockEmployee.id,
      };

      const result = await service.createTransaction(dto, 'admin-1');

      expect(result.transaction.type).toBe('EMPLOYEE_ADVANCE');
      expect(result.transaction.employeeId).toBe(mockEmployee.id);
    });

    it('3. Rejects GENERAL_EXPENSE when employeeId is provided', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);

      const dto = {
        branchId: mockBranch.id,
        type: TransactionType.GENERAL_EXPENSE,
        description: 'Product restock',
        amount: 1200,
        paymentMode: PaymentMode.CASH,
        employeeId: mockEmployee.id,
      };

      await expect(service.createTransaction(dto, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('4. Rejects EMPLOYEE_ADVANCE when employeeId is missing', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);

      const dto = {
        branchId: mockBranch.id,
        type: TransactionType.EMPLOYEE_ADVANCE,
        description: 'Salary advance',
        amount: 3000,
        paymentMode: PaymentMode.CASH,
      };

      await expect(service.createTransaction(dto, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('5. Rejects creation when branch is inactive or not found', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);

      const dto = {
        branchId: 'invalid-branch',
        type: TransactionType.GENERAL_EXPENSE,
        description: 'Test',
        amount: 100,
        paymentMode: PaymentMode.CASH,
      };

      await expect(service.createTransaction(dto, 'admin-1')).rejects.toThrow(
        NotFoundException,
      );

      prisma.branch.findUnique.mockResolvedValue(mockInactiveBranch);

      await expect(
        service.createTransaction(
          { ...dto, branchId: mockInactiveBranch.id },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('6. Rejects EMPLOYEE_ADVANCE when employee belongs to another branch', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.user.findUnique.mockResolvedValue(mockOtherBranchEmployee);

      const dto = {
        branchId: mockBranch.id,
        type: TransactionType.EMPLOYEE_ADVANCE,
        description: 'Salary advance',
        amount: 3000,
        paymentMode: PaymentMode.CASH,
        employeeId: mockOtherBranchEmployee.id,
      };

      await expect(service.createTransaction(dto, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('7. Rejects EMPLOYEE_ADVANCE when employee is an Admin', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);
      prisma.user.findUnique.mockResolvedValue(mockAdminUser);

      const dto = {
        branchId: mockBranch.id,
        type: TransactionType.EMPLOYEE_ADVANCE,
        description: 'Salary advance',
        amount: 3000,
        paymentMode: PaymentMode.CASH,
        employeeId: mockAdminUser.id,
      };

      await expect(service.createTransaction(dto, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('8. Rejects invalid amount (<= 0 or more than 2 decimal places)', async () => {
      prisma.branch.findUnique.mockResolvedValue(mockBranch);

      await expect(
        service.createTransaction(
          {
            branchId: mockBranch.id,
            type: TransactionType.GENERAL_EXPENSE,
            description: 'Test',
            amount: 0,
            paymentMode: PaymentMode.CASH,
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createTransaction(
          {
            branchId: mockBranch.id,
            type: TransactionType.GENERAL_EXPENSE,
            description: 'Test',
            amount: 10.123,
            paymentMode: PaymentMode.CASH,
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTransactionSummary', () => {
    it('9. Aggregates general expenses and employee advances into totals and breakdown', async () => {
      prisma.branchTransaction.findMany.mockResolvedValue([
        { type: TransactionType.GENERAL_EXPENSE, paymentMode: PaymentMode.CASH, amount: 1200 },
        { type: TransactionType.GENERAL_EXPENSE, paymentMode: PaymentMode.GPAY, amount: 500 },
        { type: TransactionType.EMPLOYEE_ADVANCE, paymentMode: PaymentMode.CASH, amount: 3000 },
      ]);

      const result = await service.getTransactionSummary({
        period: 'THIS_MONTH' as any,
      });

      expect(result.moneyIn).toBeNull();
      expect(result.net).toBeNull();
      expect(result.generalExpenses).toBe(1700);
      expect(result.employeeAdvances).toBe(3000);
      expect(result.moneyOut).toBe(4700);
      expect(result.breakdown.cash.total).toBe(4200);
      expect(result.breakdown.gpay.total).toBe(500);
    });
  });

  describe('updateTransaction', () => {
    it('10. Successfully updates transaction description, amount, or payment mode', async () => {
      const existingTx = {
        id: 't1',
        branchId: mockBranch.id,
        type: TransactionType.GENERAL_EXPENSE,
        description: 'Old desc',
        amount: 1000,
        paymentMode: PaymentMode.CASH,
      };
      prisma.branchTransaction.findUnique.mockResolvedValue(existingTx);

      const updatedMock = {
        ...existingTx,
        description: 'Updated desc',
        amount: 1500,
        paymentMode: PaymentMode.GPAY,
        branch: mockBranch,
        createdBy: { id: 'admin-1', name: 'Admin' },
      };
      prisma.branchTransaction.update.mockResolvedValue(updatedMock);

      const result = await service.updateTransaction('t1', {
        description: 'Updated desc',
        amount: 1500,
        paymentMode: PaymentMode.GPAY,
      });

      expect(result.transaction.description).toBe('Updated desc');
      expect(result.transaction.amount).toBe(1500);
      expect(result.transaction.paymentMode).toBe('GPAY');
    });
  });
});
