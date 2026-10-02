import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AdminTransactionsController } from './admin-transactions.controller.js';
import { AdminTransactionsService } from './admin-transactions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TransactionType, PaymentMode } from '@prisma/client';

describe('AdminTransactionsController', () => {
  let controller: AdminTransactionsController;
  let adminTransactionsService: {
    createTransaction: ReturnType<typeof vi.fn>;
    listTransactions: ReturnType<typeof vi.fn>;
    getTransactionSummary: ReturnType<typeof vi.fn>;
    updateTransaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    adminTransactionsService = {
      createTransaction: vi.fn(),
      listTransactions: vi.fn(),
      getTransactionSummary: vi.fn(),
      updateTransaction: vi.fn(),
    };

    const configService = new ConfigService({ JWT_SECRET: 'test-secret' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTransactionsController],
      providers: [
        {
          provide: AdminTransactionsService,
          useValue: adminTransactionsService,
        },
        { provide: ConfigService, useValue: configService },
        Reflector,
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<AdminTransactionsController>(
      AdminTransactionsController,
    );
  });

  it('Delegates createTransaction request to AdminTransactionsService', async () => {
    const dto = {
      branchId: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
      type: TransactionType.GENERAL_EXPENSE,
      description: 'Product restock',
      amount: 1200,
      paymentMode: PaymentMode.CASH,
    };

    const mockReq = { user: { id: 'admin-uuid-123', role: 'ADMIN' } };
    const mockResult = {
      message: 'Transaction created successfully',
      transaction: {},
    };
    adminTransactionsService.createTransaction.mockResolvedValue(mockResult);

    const result = await controller.createTransaction(dto, mockReq);

    expect(adminTransactionsService.createTransaction).toHaveBeenCalledWith(
      dto,
      'admin-uuid-123',
    );
    expect(result).toEqual(mockResult);
  });

  it('Delegates getTransactionSummary request to service', async () => {
    const query = { period: 'THIS_MONTH' as any };
    const mockResult = {
      moneyIn: null,
      generalExpenses: 1200,
      employeeAdvances: 3000,
      moneyOut: 4200,
      net: null,
    };
    adminTransactionsService.getTransactionSummary.mockResolvedValue(
      mockResult,
    );

    const result = await controller.getTransactionSummary(query);

    expect(
      adminTransactionsService.getTransactionSummary,
    ).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockResult);
  });

  it('Delegates listTransactions request to service', async () => {
    const query = { page: 1, limit: 10 };
    const mockResult = {
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
    };
    adminTransactionsService.listTransactions.mockResolvedValue(mockResult);

    const result = await controller.listTransactions(query);

    expect(adminTransactionsService.listTransactions).toHaveBeenCalledWith(
      query,
    );
    expect(result).toEqual(mockResult);
  });

  it('Delegates updateTransaction request to service', async () => {
    const transactionId = 't1a2c3d4-e5f6-7890-abcd-ef1234567890';
    const dto = { amount: 1500 };
    const mockResult = {
      message: 'Transaction updated successfully',
      transaction: {},
    };
    adminTransactionsService.updateTransaction.mockResolvedValue(mockResult);

    const result = await controller.updateTransaction(transactionId, dto);

    expect(adminTransactionsService.updateTransaction).toHaveBeenCalledWith(
      transactionId,
      dto,
    );
    expect(result).toEqual(mockResult);
  });
});
