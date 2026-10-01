import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminStaffService } from './admin-staff.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

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
  };

  const mockActiveManagerRole = {
    id: 'role-manager-uuid',
    name: 'MANAGER',
    description: 'Branch Manager',
    isActive: true,
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

  const mockInactiveRole = {
    id: 'role-inactive-uuid',
    name: 'STYLIST',
    description: 'Old Stylist Role',
    isActive: false,
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

  const mockInactiveBranch = {
    id: 'branch-inactive-uuid',
    name: 'Closed Branch',
    code: 'CB01',
    address: '456 Old Rd',
    city: 'Metropolis',
    state: 'NY',
    isActive: false,
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
    it('1. Successfully creates staff with valid MANAGER/STYLIST role and active branch', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockActiveStylistRole);
      prismaService.branch.findUnique.mockResolvedValue(mockActiveBranch);
      prismaService.user.create.mockResolvedValue(mockStaffUser);

      const dto = {
        name: 'Rahul',
        roleId: mockActiveStylistRole.id,
        branchId: mockActiveBranch.id,
      };

      const result = await service.createStaff(dto);

      expect(result).toEqual({
        message: 'Staff member created successfully',
        staff: mockStaffUser,
      });

      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          name: 'Rahul',
          roleId: mockActiveStylistRole.id,
          branchId: mockActiveBranch.id,
          isActive: true,
        },
        select: expect.any(Object),
      });
    });

    it('2. Throws BadRequestException if role does not exist or is inactive', async () => {
      prismaService.role.findUnique.mockResolvedValue(null);

      await expect(
        service.createStaff({
          name: 'Rahul',
          roleId: 'non-existent-role',
          branchId: mockActiveBranch.id,
        }),
      ).rejects.toThrow(BadRequestException);

      prismaService.role.findUnique.mockResolvedValue(mockInactiveRole);

      await expect(
        service.createStaff({
          name: 'Rahul',
          roleId: mockInactiveRole.id,
          branchId: mockActiveBranch.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. Throws BadRequestException if attempting to assign ADMIN role', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockActiveAdminRole);

      await expect(
        service.createStaff({
          name: 'Rahul',
          roleId: mockActiveAdminRole.id,
          branchId: mockActiveBranch.id,
        }),
      ).rejects.toThrow(
        new BadRequestException('Cannot assign ADMIN role to staff members.'),
      );
    });

    it('4. Throws BadRequestException if branch does not exist or is inactive', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockActiveStylistRole);
      prismaService.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.createStaff({
          name: 'Rahul',
          roleId: mockActiveStylistRole.id,
          branchId: 'non-existent-branch',
        }),
      ).rejects.toThrow(BadRequestException);

      prismaService.branch.findUnique.mockResolvedValue(mockInactiveBranch);

      await expect(
        service.createStaff({
          name: 'Rahul',
          roleId: mockActiveStylistRole.id,
          branchId: mockInactiveBranch.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listStaff', () => {
    it('5. Lists staff members with default pagination and search/filters', async () => {
      prismaService.user.findMany.mockResolvedValue([mockStaffUser]);
      prismaService.user.count.mockResolvedValue(1);

      const result = await service.listStaff({
        page: 1,
        limit: 10,
        search: 'Rahul',
        branchId: mockActiveBranch.id,
        isActive: true,
      });

      expect(result).toEqual({
        data: [mockStaffUser],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });

      expect(prismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          role: { name: { in: ['MANAGER', 'STYLIST'] } },
          branchId: mockActiveBranch.id,
          isActive: true,
          name: { contains: 'Rahul', mode: 'insensitive' },
        },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });

    it('6. Returns empty list when no staff members match filters', async () => {
      prismaService.user.findMany.mockResolvedValue([]);
      prismaService.user.count.mockResolvedValue(0);

      const result = await service.listStaff({ search: 'NonExistent' });

      expect(result).toEqual({
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      });
    });
  });

  describe('getStaffById', () => {
    it('7. Returns staff member details by ID excluding sensitive fields', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockStaffUser);

      const result = await service.getStaffById(mockStaffUser.id);

      expect(result).toEqual(mockStaffUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockStaffUser.id },
        select: expect.any(Object),
      });
    });

    it('8. Throws NotFoundException if staff member is not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getStaffById('non-existent-staff-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStaff', () => {
    it('9. Successfully updates staff member details', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaService.role.findUnique.mockResolvedValue(mockActiveManagerRole);
      prismaService.branch.findUnique.mockResolvedValue(mockActiveBranch);

      const updatedUser = {
        ...mockStaffUser,
        name: 'Rahul Updated',
        roleId: mockActiveManagerRole.id,
        role: mockActiveManagerRole,
      };

      prismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateStaff(mockStaffUser.id, {
        name: 'Rahul Updated',
        roleId: mockActiveManagerRole.id,
      });

      expect(result).toEqual({
        message: 'Staff member updated successfully',
        staff: updatedUser,
      });
    });

    it('10. Throws NotFoundException if updating non-existent staff member', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStaff('non-existent-uuid', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('11. Throws BadRequestException when updating to ADMIN role', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaService.role.findUnique.mockResolvedValue(mockActiveAdminRole);

      await expect(
        service.updateStaff(mockStaffUser.id, {
          roleId: mockActiveAdminRole.id,
        }),
      ).rejects.toThrow(
        new BadRequestException('Cannot assign ADMIN role to staff members.'),
      );
    });

    it('12. Throws BadRequestException when updating to invalid or inactive branch', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaService.branch.findUnique.mockResolvedValue(mockInactiveBranch);

      await expect(
        service.updateStaff(mockStaffUser.id, {
          branchId: mockInactiveBranch.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStaffStatus', () => {
    it('13. Successfully deactivates a staff member', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockStaffUser);

      const deactivatedStaff = { ...mockStaffUser, isActive: false };
      prismaService.user.update.mockResolvedValue(deactivatedStaff);

      const result = await service.updateStaffStatus(mockStaffUser.id, {
        isActive: false,
      });

      expect(result).toEqual({
        message: 'Staff member status updated successfully',
        staff: deactivatedStaff,
      });

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockStaffUser.id },
        data: { isActive: false },
        select: expect.any(Object),
      });
    });

    it('14. Successfully activates a staff member', async () => {
      const inactiveStaffUser = { ...mockStaffUser, isActive: false };
      prismaService.user.findUnique.mockResolvedValue(inactiveStaffUser);

      const activatedStaff = { ...mockStaffUser, isActive: true };
      prismaService.user.update.mockResolvedValue(activatedStaff);

      const result = await service.updateStaffStatus(mockStaffUser.id, {
        isActive: true,
      });

      expect(result).toEqual({
        message: 'Staff member status updated successfully',
        staff: activatedStaff,
      });
    });

    it('15. Throws NotFoundException if staff member does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStaffStatus('non-existent-uuid', { isActive: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('16. Throws BadRequestException when attempting to modify global Admin status', async () => {
      const adminUser = {
        id: 'admin-user-uuid',
        name: 'Super Admin',
        role: mockActiveAdminRole,
        isActive: true,
      };

      prismaService.user.findUnique.mockResolvedValue(adminUser);

      await expect(
        service.updateStaffStatus('admin-user-uuid', { isActive: false }),
      ).rejects.toThrow(
        new BadRequestException('Cannot modify status of Admin account.'),
      );
    });
  });
});
