import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminAuthService } from './admin-auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PinService } from '../../common/security/pin.service.js';

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let configService: ConfigService;
  let prismaService: {
    role: { findUnique: ReturnType<typeof vi.fn> };
    user: {
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let pinService: {
    hashPin: ReturnType<typeof vi.fn>;
    verifyPin: ReturnType<typeof vi.fn>;
    validatePin: ReturnType<typeof vi.fn>;
  };

  const mockAdminRole = {
    id: 'role-admin-uuid-123',
    name: 'ADMIN',
    description: 'System administrator',
    isActive: true,
  };

  const mockSetupDto = {
    name: 'CAVE Admin',
    email: 'admin@cave.com',
    pin: '482613',
  };

  beforeEach(async () => {
    configService = new ConfigService({
      JWT_SECRET: 'test-jwt-secret-key-12345678901234567890',
    });

    prismaService = {
      role: {
        findUnique: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    pinService = {
      hashPin: vi.fn(),
      verifyPin: vi.fn(),
      validatePin: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: PinService, useValue: pinService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AdminAuthService>(AdminAuthService);
  });

  describe('setupAdmin', () => {
    it('1. Creates Admin when none exists', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      pinService.hashPin.mockResolvedValue('$2b$10$hashedPinValue123');

      const createdUserRecord = {
        id: 'user-admin-uuid-999',
        name: mockSetupDto.name,
        email: mockSetupDto.email,
        pinHash: '$2b$10$hashedPinValue123',
        roleId: mockAdminRole.id,
        branchId: null,
        isActive: true,
        role: mockAdminRole,
      };
      prismaService.user.create.mockResolvedValue(createdUserRecord);

      const result = await service.setupAdmin(mockSetupDto);

      expect(result.message).toBe('Admin account created successfully');
      expect(result.admin).toEqual({
        id: 'user-admin-uuid-999',
        name: 'CAVE Admin',
        email: 'admin@cave.com',
        role: 'ADMIN',
      });
    });

    it('2. Rejects creation when Admin already exists', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue({
        id: 'existing-admin-id',
        roleId: mockAdminRole.id,
      });

      await expect(service.setupAdmin(mockSetupDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('3. Hashes the PIN', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      pinService.hashPin.mockResolvedValue('$2b$10$hashedPinValue123');
      prismaService.user.create.mockResolvedValue({
        id: 'user-admin-uuid-999',
        name: mockSetupDto.name,
        email: mockSetupDto.email,
        role: mockAdminRole,
      });

      await service.setupAdmin(mockSetupDto);

      expect(pinService.hashPin).toHaveBeenCalledWith('482613');
    });

    it('4. Stores branchId as null', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      pinService.hashPin.mockResolvedValue('$2b$10$hashedPinValue123');
      prismaService.user.create.mockResolvedValue({
        id: 'user-admin-uuid-999',
        name: mockSetupDto.name,
        email: mockSetupDto.email,
        role: mockAdminRole,
      });

      await service.setupAdmin(mockSetupDto);

      expect(prismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: null,
          }),
        }),
      );
    });

    it('5. Uses ADMIN role', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      pinService.hashPin.mockResolvedValue('$2b$10$hashedPinValue123');
      prismaService.user.create.mockResolvedValue({
        id: 'user-admin-uuid-999',
        name: mockSetupDto.name,
        email: mockSetupDto.email,
        role: mockAdminRole,
      });

      await service.setupAdmin(mockSetupDto);

      expect(prismaService.role.findUnique).toHaveBeenCalledWith({
        where: { name: 'ADMIN' },
      });
      expect(prismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roleId: mockAdminRole.id,
          }),
        }),
      );
    });

    it('6. Does not return pinHash', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      pinService.hashPin.mockResolvedValue('$2b$10$hashedPinValue123');
      prismaService.user.create.mockResolvedValue({
        id: 'user-admin-uuid-999',
        name: mockSetupDto.name,
        email: mockSetupDto.email,
        pinHash: '$2b$10$hashedPinValue123',
        role: mockAdminRole,
      });

      const result = await service.setupAdmin(mockSetupDto);

      expect(result.admin).not.toHaveProperty('pinHash');
    });

    it('7. Does not return plaintext PIN', async () => {
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      pinService.hashPin.mockResolvedValue('$2b$10$hashedPinValue123');
      prismaService.user.create.mockResolvedValue({
        id: 'user-admin-uuid-999',
        name: mockSetupDto.name,
        email: mockSetupDto.email,
        role: mockAdminRole,
      });

      const result = await service.setupAdmin(mockSetupDto);

      expect(result.admin).not.toHaveProperty('pin');
    });
  });

  describe('changePin', () => {
    const adminId = 'admin-user-uuid-123';
    const mockChangeDto = {
      currentPin: '482613',
      newPin: '739214',
    };

    const mockAdminUser = {
      id: adminId,
      name: 'CAVE Admin',
      email: 'admin@cave.com',
      pinHash: '$2b$10$oldPinHashValue123',
      roleId: mockAdminRole.id,
      role: mockAdminRole,
    };

    it('1. Changes PIN successfully', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.user.findUnique.mockResolvedValue(mockAdminUser);
      pinService.verifyPin.mockResolvedValue(true);
      pinService.hashPin.mockResolvedValue('$2b$10$newPinHashValue789');
      prismaService.user.update.mockResolvedValue({
        ...mockAdminUser,
        pinHash: '$2b$10$newPinHashValue789',
      });

      const result = await service.changePin(adminId, mockChangeDto);

      expect(result).toEqual({ message: 'Admin PIN changed successfully' });
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: adminId },
        data: { pinHash: '$2b$10$newPinHashValue789' },
      });
    });

    it('2. Rejects request with incorrect current PIN (HTTP 401)', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.user.findUnique.mockResolvedValue(mockAdminUser);
      pinService.verifyPin.mockResolvedValue(false);

      await expect(
        service.changePin(adminId, mockChangeDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('3. Rejects request with invalid new PIN format (HTTP 400)', async () => {
      pinService.validatePin.mockImplementation(
        (pin: string) => typeof pin === 'string' && /^\d{6}$/.test(pin),
      );

      await expect(
        service.changePin(adminId, { currentPin: '482613', newPin: '12345' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. Rejects request when Admin account is missing', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePin('non-existent-admin-id', mockChangeDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('5. Hashes the new PIN before storage', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.user.findUnique.mockResolvedValue(mockAdminUser);
      pinService.verifyPin.mockResolvedValue(true);
      pinService.hashPin.mockResolvedValue('$2b$10$hashedNewPin');
      prismaService.user.update.mockResolvedValue({});

      await service.changePin(adminId, mockChangeDto);

      expect(pinService.hashPin).toHaveBeenCalledWith('739214');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: adminId },
        data: { pinHash: '$2b$10$hashedNewPin' },
      });
    });

    it('6. Does not return plaintext PIN or pinHash in response', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.user.findUnique.mockResolvedValue(mockAdminUser);
      pinService.verifyPin.mockResolvedValue(true);
      pinService.hashPin.mockResolvedValue('$2b$10$hashedNewPin');
      prismaService.user.update.mockResolvedValue({});

      const result = await service.changePin(adminId, mockChangeDto);

      expect(result).not.toHaveProperty('pin');
      expect(result).not.toHaveProperty('currentPin');
      expect(result).not.toHaveProperty('newPin');
      expect(result).not.toHaveProperty('pinHash');
    });
  });

  describe('login', () => {
    const mockLoginDto = { pin: '123456' };

    const mockAdminUser = {
      id: 'admin-user-uuid-999',
      name: 'CAVE Admin',
      email: 'admin@cave.com',
      pinHash: '$2b$10$validPinHashValue123',
      roleId: mockAdminRole.id,
      branchId: null,
      isActive: true,
      role: mockAdminRole,
    };

    it('1. Successful PIN-only login', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(mockAdminUser);
      pinService.verifyPin.mockResolvedValue(true);

      const result = await service.login(mockLoginDto);

      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
      expect(pinService.validatePin).toHaveBeenCalledWith('123456');
      expect(pinService.verifyPin).toHaveBeenCalledWith(
        '123456',
        '$2b$10$validPinHashValue123',
      );
    });

    it('2. Invalid PIN format (HTTP 401)', async () => {
      pinService.validatePin.mockReturnValue(false);

      await expect(service.login({ pin: 'abc' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('3. Invalid PIN hash mismatch (HTTP 401)', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(mockAdminUser);
      pinService.verifyPin.mockResolvedValue(false);

      await expect(service.login({ pin: '654321' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('4. No active global Admin (HTTP 401)', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.login(mockLoginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('5. Inactive Admin (HTTP 401)', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue({
        ...mockAdminUser,
        isActive: false,
      });

      await expect(service.login(mockLoginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('6. Correct JWT payload and response structure', async () => {
      pinService.validatePin.mockReturnValue(true);
      prismaService.role.findUnique.mockResolvedValue(mockAdminRole);
      prismaService.user.findFirst.mockResolvedValue(mockAdminUser);
      pinService.verifyPin.mockResolvedValue(true);

      const result = await service.login(mockLoginDto);

      expect(Object.keys(result)).toEqual(['accessToken']);

      const [headerB64, payloadB64] = result.accessToken.split('.');
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8'),
      );

      expect(payload).toMatchObject({
        sub: mockAdminUser.id,
        role: 'ADMIN',
      });
      expect(payload).toHaveProperty('exp');
      expect(payload).toHaveProperty('iat');

      const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString('utf-8'),
      );
      expect(header).toEqual({
        alg: 'HS256',
        typ: 'JWT',
      });
    });
  });
});
