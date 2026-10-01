import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminBranchesService } from './admin-branches.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PinService } from '../../common/security/pin.service.js';

describe('AdminBranchesService', () => {
  let service: AdminBranchesService;
  let configService: ConfigService;
  let prismaService: {
    branch: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    role: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    branchRoleCredential: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let pinService: {
    validate4DigitPin: ReturnType<typeof vi.fn>;
    hash4DigitPin: ReturnType<typeof vi.fn>;
    generatePinLookup: ReturnType<typeof vi.fn>;
    verify4DigitPin: ReturnType<typeof vi.fn>;
  };

  const lookupSecret = 'test-branch-pin-lookup-secret-key-12345';

  const mockBranch = {
    id: 'branch-uuid-123',
    name: 'Downtown Salon',
    code: 'DT01',
    address: '123 Main St',
    city: 'Metropolis',
    state: 'NY',
    isActive: true,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedAt: new Date('2026-10-01T12:00:00.000Z'),
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

  beforeEach(async () => {
    configService = new ConfigService({
      BRANCH_PIN_LOOKUP_SECRET: lookupSecret,
    });

    prismaService = {
      branch: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      role: {
        findUnique: vi.fn(),
      },
      branchRoleCredential: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
    };

    pinService = {
      validate4DigitPin: vi.fn(),
      hash4DigitPin: vi.fn(),
      generatePinLookup: vi.fn(),
      verify4DigitPin: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBranchesService,
        { provide: PrismaService, useValue: prismaService },
        { provide: PinService, useValue: pinService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AdminBranchesService>(AdminBranchesService);
  });

  describe('createBranch', () => {
    it('1. Successfully creates a branch', async () => {
      prismaService.branch.findUnique.mockResolvedValue(null);
      prismaService.branch.create.mockResolvedValue(mockBranch);

      const result = await service.createBranch({
        name: 'Downtown Salon',
        code: 'DT01',
      });

      expect(result).toEqual({
        message: 'Branch created successfully',
        branch: mockBranch,
      });
    });

    it('2. Throws ConflictException for duplicate branch name', async () => {
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);

      await expect(
        service.createBranch({ name: 'Downtown Salon', code: 'DT01' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('setRolePin', () => {
    it('3. Successfully sets Manager role 4-digit PIN', async () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      pinService.generatePinLookup.mockReturnValue('lookup-hex-1234');
      pinService.hash4DigitPin.mockResolvedValue('bcrypt-hash-1234');
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);
      prismaService.role.findUnique.mockResolvedValue(mockManagerRole);
      prismaService.branchRoleCredential.findUnique.mockResolvedValue(null);
      prismaService.branchRoleCredential.upsert.mockResolvedValue({});

      const result = await service.setRolePin(mockBranch.id, 'MANAGER', {
        pin: '1234',
      });

      expect(result).toEqual({
        message: 'Role PIN configured successfully',
        branchId: mockBranch.id,
        role: 'MANAGER',
      });

      expect(prismaService.branchRoleCredential.upsert).toHaveBeenCalledWith({
        where: {
          branchId_roleId: {
            branchId: mockBranch.id,
            roleId: mockManagerRole.id,
          },
        },
        create: {
          branchId: mockBranch.id,
          roleId: mockManagerRole.id,
          pinHash: 'bcrypt-hash-1234',
          pinLookup: 'lookup-hex-1234',
        },
        update: {
          pinHash: 'bcrypt-hash-1234',
          pinLookup: 'lookup-hex-1234',
        },
      });
    });

    it('4. Successfully sets Stylist role 4-digit PIN', async () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      pinService.generatePinLookup.mockReturnValue('lookup-hex-2345');
      pinService.hash4DigitPin.mockResolvedValue('bcrypt-hash-2345');
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);
      prismaService.role.findUnique.mockResolvedValue(mockStylistRole);
      prismaService.branchRoleCredential.findUnique.mockResolvedValue(null);
      prismaService.branchRoleCredential.upsert.mockResolvedValue({});

      const result = await service.setRolePin(mockBranch.id, 'STYLIST', {
        pin: '2345',
      });

      expect(result).toEqual({
        message: 'Role PIN configured successfully',
        branchId: mockBranch.id,
        role: 'STYLIST',
      });
    });

    it('5. Throws BadRequestException for invalid role name', async () => {
      await expect(
        service.setRolePin(mockBranch.id, 'INVALID_ROLE', { pin: '1234' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('6. Throws BadRequestException for invalid 4-digit PIN format', async () => {
      pinService.validate4DigitPin.mockReturnValue(false);

      await expect(
        service.setRolePin(mockBranch.id, 'MANAGER', { pin: '12345' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('7. Throws ConflictException if PIN is already assigned to another branch/role', async () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      pinService.generatePinLookup.mockReturnValue('lookup-hex-duplicate');
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);
      prismaService.role.findUnique.mockResolvedValue(mockManagerRole);
      prismaService.branchRoleCredential.findUnique.mockResolvedValue({
        id: 'other-cred-id',
        branchId: 'other-branch-id',
        roleId: mockManagerRole.id,
      });

      await expect(
        service.setRolePin(mockBranch.id, 'MANAGER', { pin: '1234' }),
      ).rejects.toThrow(ConflictException);
    });

    it('8. Throws NotFoundException if branch does not exist', async () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      prismaService.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.setRolePin('missing-branch-id', 'MANAGER', { pin: '1234' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRolePinsStatus', () => {
    it('9. Returns configuration status for both MANAGER and STYLIST', async () => {
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);
      prismaService.branchRoleCredential.findMany.mockResolvedValue([
        { role: mockManagerRole },
      ]);

      const result = await service.getRolePinsStatus(mockBranch.id);

      expect(result).toEqual({
        branchId: mockBranch.id,
        roles: [
          { role: 'MANAGER', isConfigured: true },
          { role: 'STYLIST', isConfigured: false },
        ],
      });
    });
  });

  describe('resetRolePin', () => {
    it('10. Successfully resets one role PIN without affecting the other', async () => {
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);
      prismaService.role.findUnique.mockResolvedValue(mockManagerRole);
      prismaService.branchRoleCredential.findUnique.mockResolvedValue({
        id: 'cred-manager-id',
        branchId: mockBranch.id,
        roleId: mockManagerRole.id,
      });

      const result = await service.resetRolePin(mockBranch.id, 'MANAGER');

      expect(result).toEqual({
        message: 'Role PIN deleted successfully',
        branchId: mockBranch.id,
        role: 'MANAGER',
      });

      expect(prismaService.branchRoleCredential.delete).toHaveBeenCalledWith({
        where: { id: 'cred-manager-id' },
      });
    });

    it('11. Throws NotFoundException if role PIN credential does not exist', async () => {
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);
      prismaService.role.findUnique.mockResolvedValue(mockStylistRole);
      prismaService.branchRoleCredential.findUnique.mockResolvedValue(null);

      await expect(
        service.resetRolePin(mockBranch.id, 'STYLIST'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
