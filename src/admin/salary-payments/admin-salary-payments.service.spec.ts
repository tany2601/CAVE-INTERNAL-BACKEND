import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AdminSalaryPaymentsService } from './admin-salary-payments.service.js';

describe('AdminSalaryPaymentsService', () => {
  let prisma: any;
  let service: AdminSalaryPaymentsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: vi.fn() },
      salaryPayment: { create: vi.fn(), findMany: vi.fn() },
    };
    service = new AdminSalaryPaymentsService(prisma);
  });

  it('rejects inactive employees and the admin account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: false, role: { name: 'STYLIST' } });
    await expect(service.create({ userId: 'u1', amount: 100 } as any)).rejects.toThrow(BadRequestException);
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', isActive: true, role: { name: 'ADMIN' } });
    await expect(service.create({ userId: 'u2', amount: 100 } as any)).rejects.toThrow(BadRequestException);
  });

  it('records the payment against the employee\'s branch, defaulting to GPay', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Anas',
      branchId: 'b1',
      isActive: true,
      role: { name: 'STYLIST' },
    });
    prisma.salaryPayment.create.mockImplementation(async ({ data }: any) => ({
      id: 'p1',
      createdAt: new Date(),
      ...data,
    }));
    const res = await service.create({ userId: 'u1', amount: 5000, note: 'Oct' } as any);
    expect(prisma.salaryPayment.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      branchId: 'b1',
      amount: 5000,
      via: 'GPAY',
    });
    expect(res).toMatchObject({ employee: 'Anas', amount: 5000, via: 'GPAY' });
  });
});
