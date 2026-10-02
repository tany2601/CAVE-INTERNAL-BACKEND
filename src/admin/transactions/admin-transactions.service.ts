import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TransactionType } from '@prisma/client';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';
import {
  TransactionsSummaryQueryDto,
  SummaryPeriod,
} from './dto/transactions-summary-query.dto.js';

@Injectable()
export class AdminTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private formatTransactionOutput(tx: any) {
    if (!tx) return null;
    return {
      id: tx.id,
      branchId: tx.branchId,
      branch: tx.branch
        ? {
            id: tx.branch.id,
            name: tx.branch.name,
            code: tx.branch.code,
          }
        : null,
      type: tx.type,
      description: tx.description,
      amount: Number(tx.amount),
      paymentMode: tx.paymentMode,
      employeeId: tx.employeeId ?? null,
      employee: tx.employee
        ? {
            id: tx.employee.id,
            name: tx.employee.name,
          }
        : null,
      createdById: tx.createdById,
      createdBy: tx.createdBy
        ? {
            id: tx.createdBy.id,
            name: tx.createdBy.name,
          }
        : null,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  }

  async createTransaction(dto: CreateTransactionDto, createdById: string) {
    // 1. Validate branch existence & active status
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    if (!branch.isActive) {
      throw new BadRequestException('Branch is inactive.');
    }

    // 2. Validate amount precision
    if (dto.amount <= 0 || Number(dto.amount.toFixed(2)) !== dto.amount) {
      throw new BadRequestException(
        'Amount must be greater than zero with at most two decimal places.',
      );
    }

    // 3. Conditional validation for transaction type
    if (dto.type === TransactionType.GENERAL_EXPENSE) {
      if (dto.employeeId) {
        throw new BadRequestException(
          'employeeId must not be provided for GENERAL_EXPENSE transactions.',
        );
      }
    } else if (dto.type === TransactionType.EMPLOYEE_ADVANCE) {
      if (!dto.employeeId) {
        throw new BadRequestException(
          'employeeId is required for EMPLOYEE_ADVANCE transactions.',
        );
      }

      const employee = await this.prisma.user.findUnique({
        where: { id: dto.employeeId },
        include: { role: true },
      });

      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }

      if (!employee.isActive) {
        throw new BadRequestException('Employee is inactive.');
      }

      if (employee.branchId !== dto.branchId) {
        throw new BadRequestException(
          'Employee does not belong to the selected branch.',
        );
      }

      if (employee.role?.name === 'ADMIN') {
        throw new BadRequestException('Cannot issue advance to Admin user.');
      }
    }

    // 4. Create transaction record
    const createdTx = await this.prisma.branchTransaction.create({
      data: {
        branchId: dto.branchId,
        type: dto.type,
        description: dto.description,
        amount: dto.amount,
        paymentMode: dto.paymentMode,
        employeeId:
          dto.type === TransactionType.EMPLOYEE_ADVANCE ? dto.employeeId : null,
        createdById,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        employee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return {
      message: 'Transaction created successfully',
      transaction: this.formatTransactionOutput(createdTx),
    };
  }

  async listTransactions(query: ListTransactionsQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.paymentMode) {
      where.paymentMode = query.paymentMode;
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search && query.search.trim() !== '') {
      where.description = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    const [transactions, total] = await Promise.all([
      this.prisma.branchTransaction.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          employee: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.branchTransaction.count({ where }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      data: transactions.map((t) => this.formatTransactionOutput(t)),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async getTransactionSummary(query: TransactionsSummaryQueryDto) {
    if (query.branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: query.branchId },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found.');
      }
    }

    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    const period = query.period || SummaryPeriod.THIS_MONTH;

    if (period === SummaryPeriod.TODAY) {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === SummaryPeriod.THIS_WEEK) {
      const dayOfWeek = now.getDay();
      const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === SummaryPeriod.THIS_MONTH) {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }

    const where: any = {};
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const transactions = await this.prisma.branchTransaction.findMany({
      where,
      select: {
        type: true,
        paymentMode: true,
        amount: true,
      },
    });

    let generalExpensesCash = 0;
    let generalExpensesGPay = 0;
    let employeeAdvancesCash = 0;
    let employeeAdvancesGPay = 0;

    for (const tx of transactions) {
      const amt = Number(tx.amount);
      if (tx.type === TransactionType.GENERAL_EXPENSE) {
        if (tx.paymentMode === 'CASH') generalExpensesCash += amt;
        else if (tx.paymentMode === 'GPAY') generalExpensesGPay += amt;
      } else if (tx.type === TransactionType.EMPLOYEE_ADVANCE) {
        if (tx.paymentMode === 'CASH') employeeAdvancesCash += amt;
        else if (tx.paymentMode === 'GPAY') employeeAdvancesGPay += amt;
      }
    }

    const generalExpenses = generalExpensesCash + generalExpensesGPay;
    const employeeAdvances = employeeAdvancesCash + employeeAdvancesGPay;
    const moneyOut = generalExpenses + employeeAdvances;

    const totalCash = generalExpensesCash + employeeAdvancesCash;
    const totalGPay = generalExpensesGPay + employeeAdvancesGPay;

    return {
      period,
      moneyIn: null,
      generalExpenses: Number(generalExpenses.toFixed(2)),
      employeeAdvances: Number(employeeAdvances.toFixed(2)),
      moneyOut: Number(moneyOut.toFixed(2)),
      net: null,
      breakdown: {
        cash: {
          generalExpenses: Number(generalExpensesCash.toFixed(2)),
          employeeAdvances: Number(employeeAdvancesCash.toFixed(2)),
          total: Number(totalCash.toFixed(2)),
        },
        gpay: {
          generalExpenses: Number(generalExpensesGPay.toFixed(2)),
          employeeAdvances: Number(employeeAdvancesGPay.toFixed(2)),
          total: Number(totalGPay.toFixed(2)),
        },
      },
      dateRange: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
      },
    };
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto) {
    const existingTx = await this.prisma.branchTransaction.findUnique({
      where: { id },
    });

    if (!existingTx) {
      throw new NotFoundException('Transaction not found.');
    }

    if (dto.amount !== undefined) {
      if (dto.amount <= 0 || Number(dto.amount.toFixed(2)) !== dto.amount) {
        throw new BadRequestException(
          'Amount must be greater than zero with at most two decimal places.',
        );
      }
    }

    const updateData: any = {};
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.paymentMode !== undefined) updateData.paymentMode = dto.paymentMode;

    const updatedTx = await this.prisma.branchTransaction.update({
      where: { id },
      data: updateData,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        employee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return {
      message: 'Transaction updated successfully',
      transaction: this.formatTransactionOutput(updatedTx),
    };
  }
}
