import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AdminBranchesController } from './admin-branches.controller.js';
import { AdminBranchesService } from './admin-branches.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

describe('AdminBranchesController & Guards', () => {
  let controller: AdminBranchesController;
  let adminBranchesService: {
    createBranch: ReturnType<typeof vi.fn>;
    listBranches: ReturnType<typeof vi.fn>;
    getBranchById: ReturnType<typeof vi.fn>;
    updateBranch: ReturnType<typeof vi.fn>;
    updateBranchStatus: ReturnType<typeof vi.fn>;
    setRolePin: ReturnType<typeof vi.fn>;
    getRolePinsStatus: ReturnType<typeof vi.fn>;
    resetRolePin: ReturnType<typeof vi.fn>;
  };
  let jwtAuthGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let configService: ConfigService;

  beforeEach(async () => {
    adminBranchesService = {
      createBranch: vi.fn(),
      listBranches: vi.fn(),
      getBranchById: vi.fn(),
      updateBranch: vi.fn(),
      updateBranchStatus: vi.fn(),
      setRolePin: vi.fn(),
      getRolePinsStatus: vi.fn(),
      resetRolePin: vi.fn(),
    };

    configService = new ConfigService({
      JWT_SECRET: 'test-secret-key-12345678901234567890',
    });

    reflector = new Reflector();
    jwtAuthGuard = new JwtAuthGuard(configService);
    rolesGuard = new RolesGuard(reflector);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminBranchesController],
      providers: [
        { provide: AdminBranchesService, useValue: adminBranchesService },
        { provide: ConfigService, useValue: configService },
        { provide: Reflector, useValue: reflector },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<AdminBranchesController>(AdminBranchesController);
  });

  describe('setRolePin endpoint', () => {
    it('Delegates setRolePin request to AdminBranchesService', async () => {
      const mockResult = {
        message: 'Role PIN configured successfully',
        branchId: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
        role: 'MANAGER',
      };
      adminBranchesService.setRolePin.mockResolvedValue(mockResult);

      const branchId = 'b1a2c3d4-e5f6-7890-abcd-ef1234567890';
      const dto = { pin: '1234' };
      const result = await controller.setRolePin(branchId, 'MANAGER', dto);

      expect(adminBranchesService.setRolePin).toHaveBeenCalledWith(
        branchId,
        'MANAGER',
        dto,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getRolePinsStatus endpoint', () => {
    it('Delegates getRolePinsStatus request to AdminBranchesService', async () => {
      const mockResult = {
        branchId: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
        roles: [
          { role: 'MANAGER', isConfigured: true },
          { role: 'STYLIST', isConfigured: false },
        ],
      };
      adminBranchesService.getRolePinsStatus.mockResolvedValue(mockResult);

      const branchId = 'b1a2c3d4-e5f6-7890-abcd-ef1234567890';
      const result = await controller.getRolePinsStatus(branchId);

      expect(adminBranchesService.getRolePinsStatus).toHaveBeenCalledWith(
        branchId,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('resetRolePin endpoint', () => {
    it('Delegates resetRolePin request to AdminBranchesService', async () => {
      const mockResult = {
        message: 'Role PIN deleted successfully',
        branchId: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
        role: 'MANAGER',
      };
      adminBranchesService.resetRolePin.mockResolvedValue(mockResult);

      const branchId = 'b1a2c3d4-e5f6-7890-abcd-ef1234567890';
      const result = await controller.resetRolePin(branchId, 'MANAGER');

      expect(adminBranchesService.resetRolePin).toHaveBeenCalledWith(
        branchId,
        'MANAGER',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateBranch endpoint', () => {
    it('Delegates updateBranch request to AdminBranchesService', async () => {
      const mockResult = {
        message: 'Branch updated successfully',
        branch: { id: 'branch-1', name: 'Updated Branch', code: 'DT01' },
      };
      adminBranchesService.updateBranch.mockResolvedValue(mockResult);

      const branchId = '12c9bc67-4306-4039-9eea-fe856360e1cf';
      const dto = { name: 'Updated Branch' };
      const result = await controller.updateBranch(branchId, dto);

      expect(adminBranchesService.updateBranch).toHaveBeenCalledWith(
        branchId,
        dto,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('Authentication & Authorization Guards', () => {
    it('Rejects unauthorized request without Authorization header', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
      } as ExecutionContext;

      expect(() => jwtAuthGuard.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('Denies access for non-admin role (e.g., STYLIST / MANAGER) (HTTP 403)', () => {
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

    it('Allows access for ADMIN role', () => {
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
