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
import { PinVaultService } from '../../common/security/pin-vault.service.js';

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
      service: { findMany: vi.fn().mockResolvedValue([]) },
      branchServicePricing: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn() },
      $transaction: vi.fn((fn: any) => fn(prismaService)),
      role: {
        findUnique: vi.fn(),
      },
      branchRoleCredential: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
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
        {
          provide: PinVaultService,
          useValue: {
            encrypt: (pin: string) => `enc:${pin}`,
            decrypt: (blob: string | null) => (blob ? blob.replace('enc:', '') : null),
          },
        },
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

  describe('atomic branch + PIN saves', () => {
    const setupPins = () => {
      pinService.validate4DigitPin.mockReturnValue(true);
      pinService.generatePinLookup.mockImplementation((pin: string) => `lookup-${pin}`);
      pinService.hash4DigitPin.mockImplementation(async (pin: string) => `hash-${pin}`);
      prismaService.role.findUnique.mockImplementation(async ({ where }: any) =>
        where.name === 'MANAGER' ? mockManagerRole : mockStylistRole,
      );
    };

    it('creates the branch and both role credentials together', async () => {
      setupPins();
      prismaService.branch.findUnique.mockResolvedValue(null);
      prismaService.branchRoleCredential.findUnique.mockResolvedValue(null);
      prismaService.branch.create.mockResolvedValue(mockBranch);

      await service.createBranch({
        name: 'New',
        code: 'NEW',
        managerPin: '4321',
        stylistPin: '1234',
      });

      expect(prismaService.branchRoleCredential.create).toHaveBeenCalledTimes(2);
      expect(prismaService.branchRoleCredential.create.mock.calls[0][0].data).toMatchObject({
        branchId: mockBranch.id,
        roleId: mockManagerRole.id,
        pinLookup: 'lookup-4321',
        pinEncrypted: 'enc:4321',
      });
    });

    it('creates nothing when a PIN is already used by another branch', async () => {
      setupPins();
      prismaService.branch.findUnique.mockResolvedValue(null);
      prismaService.branchRoleCredential.findUnique.mockResolvedValue({
        branchId: 'other-branch',
        roleId: mockStylistRole.id,
      });

      await expect(
        service.createBranch({ name: 'New', code: 'NEW', managerPin: '4321', stylistPin: '1234' }),
      ).rejects.toThrow(/already assigned/);

      expect(prismaService.branch.create).not.toHaveBeenCalled();
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('rejects identical manager and stylist PINs before touching the database', async () => {
      setupPins();
      prismaService.branch.findUnique.mockResolvedValue(null);
      await expect(
        service.createBranch({ name: 'New', code: 'NEW', managerPin: '1111', stylistPin: '1111' }),
      ).rejects.toThrow(/must be different/);
      expect(prismaService.branch.create).not.toHaveBeenCalled();
    });

    it('updates a branch and its PINs in one transaction, leaving the branch unchanged on a PIN clash', async () => {
      setupPins();
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);
      prismaService.branch.findFirst.mockResolvedValue(null);
      prismaService.branchRoleCredential.findUnique.mockResolvedValue({
        branchId: 'other-branch',
        roleId: mockManagerRole.id,
      });
      await expect(
        service.updateBranch(mockBranch.id, { city: 'Udupi', managerPin: '4321' }),
      ).rejects.toThrow(/already assigned/);
      expect(prismaService.branch.update).not.toHaveBeenCalled();
    });

    it('re-saving a branch\'s own PIN is not a clash', async () => {
      setupPins();
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);
      prismaService.branch.findFirst.mockResolvedValue(null);
      prismaService.branchRoleCredential.findUnique.mockResolvedValue({
        branchId: mockBranch.id,
        roleId: mockManagerRole.id,
      });
      prismaService.branch.update.mockResolvedValue(mockBranch);
      await service.updateBranch(mockBranch.id, { managerPin: '4321' });
      expect(prismaService.branchRoleCredential.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('menu for new branches', () => {
    it('gives a new branch every active service, priced like the other branches (0 if unpriced)', async () => {
      prismaService.branch.findUnique.mockResolvedValue(null);
      prismaService.branch.create.mockResolvedValue(mockBranch);
      prismaService.service.findMany.mockResolvedValue([{ id: 's-cut' }, { id: 's-beard' }, { id: 's-new' }]);
      prismaService.branchServicePricing.findMany.mockResolvedValue([
        { serviceId: 's-cut', price: 350 }, // most recently updated first
        { serviceId: 's-cut', price: 300 },
        { serviceId: 's-beard', price: 150 },
      ]);

      await service.createBranch({ name: 'New', code: 'NEW' });

      expect(prismaService.branchServicePricing.createMany).toHaveBeenCalledWith({
        data: [
          { branchId: mockBranch.id, serviceId: 's-cut', price: 350 },
          { branchId: mockBranch.id, serviceId: 's-beard', price: 150 },
          { branchId: mockBranch.id, serviceId: 's-new', price: 0 },
        ],
      });
    });

    it('skips the menu when there are no services yet', async () => {
      prismaService.branch.findUnique.mockResolvedValue(null);
      prismaService.branch.create.mockResolvedValue(mockBranch);
      prismaService.service.findMany.mockResolvedValue([]);
      await service.createBranch({ name: 'New', code: 'NEW' });
      expect(prismaService.branchServicePricing.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getRolePinValues', () => {
    it('returns viewable PINs and null for hash-only credentials', async () => {
      prismaService.branch.findUnique.mockResolvedValue(mockBranch);
      prismaService.branchRoleCredential.findMany.mockResolvedValue([
        { role: mockManagerRole, pinEncrypted: 'enc:4321' },
        { role: mockStylistRole, pinEncrypted: null },
      ]);
      const res = await service.getRolePinValues(mockBranch.id);
      expect(res.roles).toEqual([
        { role: 'MANAGER', isConfigured: true, pin: '4321' },
        { role: 'STYLIST', isConfigured: true, pin: null },
      ]);
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
          pinEncrypted: 'enc:1234',
        },
        update: {
          pinHash: 'bcrypt-hash-1234',
          pinLookup: 'lookup-hex-1234',
          pinEncrypted: 'enc:1234',
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
