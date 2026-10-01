import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AdminRolesController } from './admin-roles.controller.js';
import { AdminRolesService } from './admin-roles.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

describe('AdminRolesController & Guards', () => {
  let controller: AdminRolesController;
  let adminRolesService: {
    getRoles: ReturnType<typeof vi.fn>;
  };
  let jwtAuthGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let configService: ConfigService;

  beforeEach(async () => {
    adminRolesService = {
      getRoles: vi.fn(),
    };

    configService = new ConfigService({
      JWT_SECRET: 'test-secret-key-12345678901234567890',
    });

    reflector = new Reflector();
    jwtAuthGuard = new JwtAuthGuard(configService);
    rolesGuard = new RolesGuard(reflector);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminRolesController],
      providers: [
        { provide: AdminRolesService, useValue: adminRolesService },
        { provide: ConfigService, useValue: configService },
        { provide: Reflector, useValue: reflector },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<AdminRolesController>(AdminRolesController);
  });

  describe('getRoles endpoint', () => {
    it('1. Delegates getRoles request to AdminRolesService', async () => {
      const mockResult = { data: [{ id: '1', name: 'MANAGER', description: 'Manager' }] };
      adminRolesService.getRoles.mockResolvedValue(mockResult);

      const query = { includeAdmin: false };
      const result = await controller.getRoles(query);

      expect(adminRolesService.getRoles).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });

    it('2. Rejects unauthorized request without Authorization header', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
      } as ExecutionContext;

      expect(() => jwtAuthGuard.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('3. Denies access for non-admin role (e.g., STYLIST / MANAGER) (HTTP 403)', () => {
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

    it('4. Allows access for ADMIN role', () => {
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
