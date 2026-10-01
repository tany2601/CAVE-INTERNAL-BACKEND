import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

describe('AdminAuthController & Guards', () => {
  let controller: AdminAuthController;
  let adminAuthService: {
    changePin: ReturnType<typeof vi.fn>;
    setupAdmin: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
  };
  let jwtAuthGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let configService: ConfigService;

  beforeEach(async () => {
    adminAuthService = {
      changePin: vi.fn(),
      setupAdmin: vi.fn(),
      login: vi.fn(),
    };

    configService = new ConfigService({
      JWT_SECRET: 'test-secret-key-12345678901234567890',
    });

    reflector = new Reflector();
    jwtAuthGuard = new JwtAuthGuard(configService);
    rolesGuard = new RolesGuard(reflector);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuthController],
      providers: [
        { provide: AdminAuthService, useValue: adminAuthService },
        { provide: ConfigService, useValue: configService },
        { provide: Reflector, useValue: reflector },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<AdminAuthController>(AdminAuthController);
  });

  describe('login endpoint', () => {
    it('Delegates login request to AdminAuthService', async () => {
      const mockResult = { accessToken: 'header.payload.signature' };
      adminAuthService.login.mockResolvedValue(mockResult);

      const dto = { pin: '123456' };
      const result = await controller.login(dto);

      expect(adminAuthService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('changePin endpoint', () => {
    it('Delegates changePin request to AdminAuthService', async () => {
      const mockResult = { message: 'Admin PIN changed successfully' };
      adminAuthService.changePin.mockResolvedValue(mockResult);

      const dto = { currentPin: '482613', newPin: '739214' };
      const result = await controller.changePin('admin-id-123', dto);

      expect(adminAuthService.changePin).toHaveBeenCalledWith(
        'admin-id-123',
        dto,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('JwtAuthGuard (Unauthenticated Request)', () => {
    it('1. Rejects request without Authorization header', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
      } as ExecutionContext;

      expect(() => jwtAuthGuard.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('2. Rejects request with non-Bearer token format', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: 'Basic 12345' } }),
        }),
      } as ExecutionContext;

      expect(() => jwtAuthGuard.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('3. Accepts request with valid JWT token', () => {
      const header = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: 'admin-id-123', role: 'ADMIN' }),
      ).toString('base64url');
      const token = `${header}.${payload}.signature`;

      const requestObj: any = { headers: { authorization: `Bearer ${token}` } };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => requestObj,
        }),
      } as ExecutionContext;

      const canActivate = jwtAuthGuard.canActivate(mockContext);
      expect(canActivate).toBe(true);
      expect(requestObj.user).toEqual({
        sub: 'admin-id-123',
        role: 'ADMIN',
        id: 'admin-id-123',
      });
    });
  });

  describe('RolesGuard (Non-admin Access)', () => {
    it('1. Allows access for ADMIN role', () => {
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

    it('2. Denies access for non-admin role (e.g., STYLIST / MANAGER) (HTTP 403)', () => {
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
  });
});
