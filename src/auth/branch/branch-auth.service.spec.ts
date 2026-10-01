import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BranchAuthService } from './branch-auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PinService } from '../../common/security/pin.service.js';

describe('BranchAuthService', () => {
  let service: BranchAuthService;
  let prismaService: {
    branchRoleCredential: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let pinService: {
    validate4DigitPin: ReturnType<typeof vi.fn>;
    generatePinLookup: ReturnType<typeof vi.fn>;
    verify4DigitPin: ReturnType<typeof vi.fn>;
  };
  let configService: ConfigService;

  const lookupSecret = 'test-branch-lookup-secret-12345';

  const mockBranch = {
    id: 'branch-uuid-123',
    name: 'Downtown Salon',
    code: 'DT01',
    isActive: true,
  };

  const mockManagerRole = {
    id: 'role-manager-id',
    name: 'MANAGER',
    isActive: true,
  };

  const mockStylistRole = {
    id: 'role-stylist-id',
    name: 'STYLIST',
    isActive: true,
  };

  const mockManagerCredential = {
    id: 'cred-manager-uuid',
    branchId: mockBranch.id,
    roleId: mockManagerRole.id,
    pinHash: '$2b$10$hashedManagerPin',
    pinLookup: 'manager-pin-lookup-hex',
    branch: mockBranch,
    role: mockManagerRole,
  };

  const mockStylistCredential = {
    id: 'cred-stylist-uuid',
    branchId: mockBranch.id,
    roleId: mockStylistRole.id,
    pinHash: '$2b$10$hashedStylistPin',
    pinLookup: 'stylist-pin-lookup-hex',
    branch: mockBranch,
    role: mockStylistRole,
  };

  beforeEach(async () => {
    configService = new ConfigService({
      BRANCH_PIN_LOOKUP_SECRET: lookupSecret,
      JWT_SECRET: 'test-jwt-secret-key-12345678901234567890',
    });

    prismaService = {
      branchRoleCredential: {
        findUnique: vi.fn(),
      },
    };

    pinService = {
      validate4DigitPin: vi.fn(),
      generatePinLookup: vi.fn(),
      verify4DigitPin: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchAuthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: PinService, useValue: pinService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<BranchAuthService>(BranchAuthService);
  });

  describe('login', () => {
    it('1. Successful Manager login returning JWT with branchId and MANAGER role', async () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      pinService.generatePinLookup.mockReturnValue('manager-pin-lookup-hex');
      prismaService.branchRoleCredential.findUnique.mockResolvedValue(
        mockManagerCredential,
      );
      pinService.verify4DigitPin.mockResolvedValue(true);

      const result = await service.login({ pin: '1234' }, 'client-ip-1');

      expect(result).toHaveProperty('accessToken');
      expect(result.role).toBe('MANAGER');
      expect(result.branch).toEqual({
        id: mockBranch.id,
        name: mockBranch.name,
        code: mockBranch.code,
      });

      // Verify JWT claims by decoding base64 payload
      const payloadB64 = result.accessToken.split('.')[1];
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8'),
      );

      expect(payload.sub).toBe(mockManagerCredential.id);
      expect(payload.branchId).toBe(mockBranch.id);
      expect(payload.role).toBe('MANAGER');
      expect(payload.type).toBe('branch_auth');
    });

    it('2. Successful Stylist login returning JWT with branchId and STYLIST role', async () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      pinService.generatePinLookup.mockReturnValue('stylist-pin-lookup-hex');
      prismaService.branchRoleCredential.findUnique.mockResolvedValue(
        mockStylistCredential,
      );
      pinService.verify4DigitPin.mockResolvedValue(true);

      const result = await service.login({ pin: '2345' }, 'client-ip-2');

      expect(result).toHaveProperty('accessToken');
      expect(result.role).toBe('STYLIST');

      const payloadB64 = result.accessToken.split('.')[1];
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8'),
      );

      expect(payload.role).toBe('STYLIST');
    });

    it('3. Rejects login when PIN is not 4 digits', async () => {
      pinService.validate4DigitPin.mockReturnValue(false);

      await expect(
        service.login({ pin: '123' }, 'client-ip-3'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('4. Rejects login when credential is not found or PIN is wrong', async () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      pinService.generatePinLookup.mockReturnValue('wrong-pin-lookup');
      prismaService.branchRoleCredential.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ pin: '9999' }, 'client-ip-4'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('5. Rejects login when branch is inactive', async () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      pinService.generatePinLookup.mockReturnValue('inactive-branch-lookup');
      prismaService.branchRoleCredential.findUnique.mockResolvedValue({
        ...mockManagerCredential,
        branch: { ...mockBranch, isActive: false },
      });

      await expect(
        service.login({ pin: '1234' }, 'client-ip-5'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('6. Locks out client IP after 5 consecutive failed login attempts', async () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      pinService.generatePinLookup.mockReturnValue('failed-lookup');
      prismaService.branchRoleCredential.findUnique.mockResolvedValue(null);

      const ip = 'brute-force-ip';

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await expect(service.login({ pin: '0000' }, ip)).rejects.toThrow(
          UnauthorizedException,
        );
      }

      // 6th attempt should be locked out
      await expect(service.login({ pin: '0000' }, ip)).rejects.toThrow(
        'Too many failed login attempts. Please try again later.',
      );
    });
  });
});
