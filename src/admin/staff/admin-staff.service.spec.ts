import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminStaffService } from './admin-staff.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CommissionModel } from '@prisma/client';

describe('AdminStaffService', () => {
  let service: AdminStaffService;
  let prismaService: {
    role: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    branch: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    user: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    staffCommissionSlab: {
      createMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  const mockActiveStylistRole = {
    id: 'role-stylist-uuid',
    name: 'STYLIST',
    description: 'Salon Stylist',
    isActive: true,
  };

  const mockActiveAdminRole = {
    id: 'role-admin-uuid',
    name: 'ADMIN',
    description: 'System Administrator',
    isActive: true,
  };

  const mockActiveBranch = {
    id: 'branch-active-uuid',
    name: 'Downtown Salon',
    code: 'DT01',
    address: '123 Main St',
    city: 'Metropolis',
    state: 'NY',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStaffUser = {
    id: 'staff-user-uuid',
    name: 'Rahul',
    email: null,
    roleId: mockActiveStylistRole.id,
    role: {
      id: mockActiveStylistRole.id,
      name: mockActiveStylistRole.name,
      description: mockActiveStylistRole.description,
    },
    branchId: mockActiveBranch.id,
    branch: mockActiveBranch,
    monthlySalary: 25000,
    commissionModel: CommissionModel.FLAT_PERCENTAGE,
    flatCommissionPercentage: 10,
    dailyTargetAmount: null,
    commissionSlabs: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prismaService = {
      role: {
        findUnique: vi.fn(),
      },
      branch: {
        findUnique: vi.fn(),
      },
      user: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      staffCommissionSlab: {
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn((cb) => {
        if (typeof cb === 'function') {
          return cb(prismaService);
        }
        return Promise.all(cb);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminStaffService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<AdminStaffService>(AdminStaffService);
  });

  describe('createStaff', () => {
    it('1. Successfully creates staff with FLAT_PERCENTAGE commission model', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockActiveStylistRole);
      prismaService.branch.findUnique.mockResolvedValue(mockActiveBranch);
      prismaService.user.create.mockResolvedValue({ id: 'staff-user-uuid' });
      prismaService.user.findUnique.mockResolvedValue(mockStaffUser);

      const dto = {
        name: 'Rahul',
        roleId: mockActiveStylistRole.id,
        branchId: mockActiveBranch.id,
        monthlySalary: 25000,
        commissionModel: CommissionModel.FLAT_PERCENTAGE,
        flatCommissionPercentage: 10,
      };

      const result = await service.createStaff(dto);

      expect(result.message).toBe('Staff member created successfully');
      expect(result.staff.flatCommissionPercentage).toBe(10);
      expect(result.staff.commissionModel).toBe('FLAT_PERCENTAGE');
    });

    it('2. Successfully creates staff with DAILY_TARGET commission model', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockActiveStylistRole);
      prismaService.branch.findUnique.mockResolvedValue(mockActiveBranch);
      prismaService.user.create.mockResolvedValue({ id: 'staff-user-uuid' });

      const mockDailyUser = {
        ...mockStaffUser,
        commissionModel: CommissionModel.DAILY_TARGET,
        flatCommissionPercentage: null,
        dailyTargetAmount: 5000,
      };
      prismaService.user.findUnique.mockResolvedValue(mockDailyUser);

      const dto = {
        name: 'Rahul',
        roleId: mockActiveStylistRole.id,
        branchId: mockActiveBranch.id,
        monthlySalary: 25000,
        commissionModel: CommissionModel.DAILY_TARGET,
        dailyTargetAmount: 5000,
      };

      const result = await service.createStaff(dto);

      expect(result.staff.dailyTargetAmount).toBe(5000);
      expect(result.staff.commissionModel).toBe('DAILY_TARGET');
    });

    it('3. Successfully creates staff with MONTHLY_TARGET commission model and 3 slabs', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockActiveStylistRole);
      prismaService.branch.findUnique.mockResolvedValue(mockActiveBranch);
      prismaService.user.create.mockResolvedValue({ id: 'staff-user-uuid' });

      const mockMonthlyUser = {
        ...mockStaffUser,
        commissionModel: CommissionModel.MONTHLY_TARGET,
        flatCommissionPercentage: null,
        dailyTargetAmount: null,
        commissionSlabs: [
          { id: 's1', slabOrder: 1, minRevenue: 10000, commissionPercentage: 5 },
          { id: 's2', slabOrder: 2, minRevenue: 20000, commissionPercentage: 10 },
          { id: 's3', slabOrder: 3, minRevenue: 30000, commissionPercentage: 15 },
        ],
      };
      prismaService.user.findUnique.mockResolvedValue(mockMonthlyUser);

      const dto = {
        name: 'Rahul',
        roleId: mockActiveStylistRole.id,
        branchId: mockActiveBranch.id,
        monthlySalary: 25000,
        commissionModel: CommissionModel.MONTHLY_TARGET,
        commissionSlabs: [
          { slabOrder: 1, minRevenue: 10000, commissionPercentage: 5 },
          { slabOrder: 2, minRevenue: 20000, commissionPercentage: 10 },
          { slabOrder: 3, minRevenue: 30000, commissionPercentage: 15 },
        ],
      };

      const result = await service.createStaff(dto);

      expect(result.staff.commissionModel).toBe('MONTHLY_TARGET');
      expect(result.staff.commissionSlabs).toHaveLength(3);
      expect(prismaService.staffCommissionSlab.createMany).toHaveBeenCalled();
    });

    it('4. Rejects FLAT_PERCENTAGE model when flatCommissionPercentage is missing', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockActiveStylistRole);
      prismaService.branch.findUnique.mockResolvedValue(mockActiveBranch);

      await expect(
        service.createStaff({
          name: 'Rahul',
          roleId: mockActiveStylistRole.id,
          branchId: mockActiveBranch.id,
          commissionModel: CommissionModel.FLAT_PERCENTAGE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('5. Rejects MONTHLY_TARGET model when revenue thresholds do not strictly increase', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockActiveStylistRole);
      prismaService.branch.findUnique.mockResolvedValue(mockActiveBranch);

      const dto = {
        name: 'Rahul',
        roleId: mockActiveStylistRole.id,
        branchId: mockActiveBranch.id,
        commissionModel: CommissionModel.MONTHLY_TARGET,
        commissionSlabs: [
          { slabOrder: 1, minRevenue: 20000, commissionPercentage: 5 },
          { slabOrder: 2, minRevenue: 10000, commissionPercentage: 10 },
          { slabOrder: 3, minRevenue: 30000, commissionPercentage: 15 },
        ],
      };

      await expect(service.createStaff(dto)).rejects.toThrow(BadRequestException);
    });

    it('6. Rejects attempt to assign ADMIN role', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockActiveAdminRole);

      await expect(
        service.createStaff({
          name: 'Rahul',
          roleId: mockActiveAdminRole.id,
          branchId: mockActiveBranch.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStaff', () => {
    it('7. Switches commission model from FLAT_PERCENTAGE to DAILY_TARGET and clears old fields', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockStaffUser)
        .mockResolvedValueOnce({
          ...mockStaffUser,
          commissionModel: CommissionModel.DAILY_TARGET,
          flatCommissionPercentage: null,
          dailyTargetAmount: 6000,
        });

      prismaService.user.update.mockResolvedValue({});

      const result = await service.updateStaff(mockStaffUser.id, {
        commissionModel: CommissionModel.DAILY_TARGET,
        dailyTargetAmount: 6000,
      });

      expect(result.staff.commissionModel).toBe('DAILY_TARGET');
      expect(result.staff.dailyTargetAmount).toBe(6000);
      expect(prismaService.staffCommissionSlab.deleteMany).toHaveBeenCalled();
    });

    it('8. Throws BadRequestException when modifying Admin user compensation', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockStaffUser,
        role: mockActiveAdminRole,
      });

      await expect(
        service.updateStaff('admin-uuid', { monthlySalary: 50000 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStaffStatus', () => {
    it('9. Deactivates a staff member successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockStaffUser);
      const deactivated = { ...mockStaffUser, isActive: false };
      prismaService.user.update.mockResolvedValue(deactivated);

      const result = await service.updateStaffStatus(mockStaffUser.id, {
        isActive: false,
      });

      expect(result.staff.isActive).toBe(false);
    });
  });
});
