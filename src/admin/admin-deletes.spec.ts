import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminStaffService } from './staff/admin-staff.service.js';
import { AdminBranchesService } from './branches/admin-branches.service.js';

const count = (n: number) => vi.fn().mockResolvedValue(n);

describe('deleting staff', () => {
  const make = (over: any = {}) => {
    const prisma: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', name: 'Arman', role: { name: 'STYLIST' } }),
        delete: vi.fn().mockResolvedValue({}),
      },
      session: { count: count(0) },
      branchTransaction: { count: count(0) },
      staffPayout: { count: count(0) },
      salaryPayment: { count: count(0) },
      ...over,
    };
    return { prisma, service: new AdminStaffService(prisma) };
  };

  it('deletes someone with no history', async () => {
    const { prisma, service } = make();
    await service.deleteStaff('u1');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('keeps people who have served customers, naming the alternative', async () => {
    const { prisma, service } = make({ session: { count: count(4) } });
    await expect(service.deleteStaff('u1')).rejects.toThrow(ConflictException);
    await expect(service.deleteStaff('u1')).rejects.toThrow(/Deactivate/);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses the admin account and unknown ids', async () => {
    const admin = make({
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'a', name: 'A', role: { name: 'ADMIN' } }), delete: vi.fn() },
    });
    await expect(admin.service.deleteStaff('a')).rejects.toThrow(BadRequestException);
    const none = make({ user: { findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn() } });
    await expect(none.service.deleteStaff('x')).rejects.toThrow(NotFoundException);
  });
});

describe('deleting branches', () => {
  const make = (over: any = {}) => {
    const prisma: any = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'CAVE Test' }),
        delete: vi.fn().mockReturnValue('del-branch'),
      },
      session: { count: count(0) },
      branchTransaction: { count: count(0) },
      staffPayout: { count: count(0) },
      user: { count: count(0) },
      branchServicePricing: { deleteMany: vi.fn().mockReturnValue('del-pricing') },
      $transaction: vi.fn().mockResolvedValue([]),
      ...over,
    };
    return { prisma, service: new AdminBranchesService(prisma, {} as any, {} as any) };
  };

  it('removes an unused branch together with its menu pricing, in one transaction', async () => {
    const { prisma, service } = make();
    await service.deleteBranch('b1');
    expect(prisma.$transaction).toHaveBeenCalledWith(['del-pricing', 'del-branch']);
  });

  it('keeps branches that have traded', async () => {
    const { prisma, service } = make({ session: { count: count(2) } });
    await expect(service.deleteBranch('b1')).rejects.toThrow(/Deactivate/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('asks for staff to be removed first', async () => {
    const { service } = make({ user: { count: count(2) } });
    await expect(service.deleteBranch('b1')).rejects.toThrow(/2 staff members/);
  });
});
