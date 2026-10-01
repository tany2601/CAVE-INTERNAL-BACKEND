import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AdminStaffController } from './admin-staff.controller.js';
import { AdminStaffService } from './admin-staff.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

describe('AdminStaffController & Guards', () => {
  let controller: AdminStaffController;
  let adminStaffService: {
    createStaff: ReturnType<typeof vi.fn>;
    listStaff: ReturnType<typeof vi.fn>;
    getStaffById: ReturnType<typeof vi.fn>;
    updateStaff: ReturnType<typeof vi.fn>;
    updateStaffStatus: ReturnType<typeof vi.fn>;
  };
  let jwtAuthGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let configService: ConfigService;

  beforeEach(async () => {
    adminStaffService = {
      createStaff: vi.fn(),
      listStaff: vi.fn(),
      getStaffById: vi.fn(),
      updateStaff: vi.fn(),
      updateStaffStatus: vi.fn(),
    };

    configService = new ConfigService({
      JWT_SECRET: 'test-secret-key-12345678901234567890',
    });

    reflector = new Reflector();
    jwtAuthGuard = new JwtAuthGuard(configService);
    rolesGuard = new RolesGuard(reflector);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminStaffController],
      providers: [
        { provide: AdminStaffService, useValue: adminStaffService },
        { provide: ConfigService, useValue: configService },
        { provide: Reflector, useValue: reflector },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<AdminStaffController>(AdminStaffController);
  });

  describe('createStaff endpoint', () => {
    it('1. Delegates createStaff request to AdminStaffService', async () => {
      const mockResult = {
        message: 'Staff member created successfully',
        staff: { id: '1', name: 'Rahul' },
      };
      adminStaffService.createStaff.mockResolvedValue(mockResult);

      const dto = {
        name: 'Rahul',
        roleId: 'role-uuid',
        branchId: 'branch-uuid',
      };
      const result = await controller.createStaff(dto);

      expect(adminStaffService.createStaff).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('listStaff endpoint', () => {
    it('2. Delegates listStaff request to AdminStaffService', async () => {
      const mockResult = {
        data: [{ id: '1', name: 'Rahul' }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      adminStaffService.listStaff.mockResolvedValue(mockResult);

      const query = { page: 1, limit: 10, search: 'Rahul' };
      const result = await controller.listStaff(query);

      expect(adminStaffService.listStaff).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getStaffById endpoint', () => {
    it('3. Delegates getStaffById request to AdminStaffService', async () => {
      const mockResult = { id: 'staff-uuid-123', name: 'Rahul' };
      adminStaffService.getStaffById.mockResolvedValue(mockResult);

      const result = await controller.getStaffById('staff-uuid-123');

      expect(adminStaffService.getStaffById).toHaveBeenCalledWith(
        'staff-uuid-123',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateStaff endpoint', () => {
    it('4. Delegates updateStaff request to AdminStaffService', async () => {
      const mockResult = {
        message: 'Staff member updated successfully',
        staff: { id: 'staff-uuid-123', name: 'Rahul Updated' },
      };
      adminStaffService.updateStaff.mockResolvedValue(mockResult);

      const dto = { name: 'Rahul Updated' };
      const result = await controller.updateStaff('staff-uuid-123', dto);

      expect(adminStaffService.updateStaff).toHaveBeenCalledWith(
        'staff-uuid-123',
        dto,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateStaffStatus endpoint', () => {
    it('5. Delegates updateStaffStatus request to AdminStaffService', async () => {
      const mockResult = {
        message: 'Staff member status updated successfully',
        staff: { id: 'staff-uuid-123', isActive: false },
      };
      adminStaffService.updateStaffStatus.mockResolvedValue(mockResult);

      const dto = { isActive: false };
      const result = await controller.updateStaffStatus(
        'staff-uuid-123',
        dto,
      );

      expect(adminStaffService.updateStaffStatus).toHaveBeenCalledWith(
        'staff-uuid-123',
        dto,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('Authentication & Authorization Guards', () => {
    it('5. Rejects unauthorized request without Authorization header', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
      } as ExecutionContext;

      expect(() => jwtAuthGuard.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('6. Denies access for non-admin role (e.g. STYLIST / MANAGER) (HTTP 403)', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

      const mockContext = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'stylist-1', role: 'STYLIST' } }),
        }),
      } as unknown as ExecutionContext;

      expect(() => rolesGuard.canActivate(mockContext)).toThrow(
        ForbiddenException,
      );
    });

    it('7. Allows access for ADMIN role', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

      const mockContext = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'admin-1', role: 'ADMIN' } }),
        }),
      } as unknown as ExecutionContext;

      expect(rolesGuard.canActivate(mockContext)).toBe(true);
    });
  });
});
