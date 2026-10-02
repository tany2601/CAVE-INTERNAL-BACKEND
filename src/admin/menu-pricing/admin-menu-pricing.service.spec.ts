import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AdminMenuPricingService } from './admin-menu-pricing.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('AdminMenuPricingService', () => {
  let service: AdminMenuPricingService;
  let prisma: {
    branch: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    service: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    branchServicePricing: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      branch: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      service: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      branchServicePricing: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    service = new AdminMenuPricingService(prisma as unknown as PrismaService);
  });

  describe('createBranchPricing', () => {
    it('successfully creates branch pricing record', async () => {
      const branchId = 'b1';
      const dto = { serviceId: 's1', price: 150 };

      prisma.branch.findUnique.mockResolvedValue({ id: branchId, isActive: true });
      prisma.service.findUnique.mockResolvedValue({ id: 's1', isActive: true });
      prisma.branchServicePricing.findUnique.mockResolvedValue(null);

      const createdMock = { id: 'p1', branchId, serviceId: 's1', price: 150, isActive: true };
      prisma.branchServicePricing.create.mockResolvedValue(createdMock);

      const result = await service.createBranchPricing(branchId, dto);

      expect(prisma.branchServicePricing.create).toHaveBeenCalledWith({
        data: {
          branchId,
          serviceId: 's1',
          price: 150,
          isActive: true,
        },
        include: { service: true },
      });
      expect(result).toEqual({
        message: 'Branch menu pricing created successfully',
        pricing: createdMock,
      });
    });

    it('throws NotFoundException if branch does not exist', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.createBranchPricing('invalid-branch', { serviceId: 's1', price: 100 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if branch is inactive', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: 'b1', isActive: false });

      await expect(
        service.createBranchPricing('b1', { serviceId: 's1', price: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if duplicate branch-service pricing exists', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: 'b1', isActive: true });
      prisma.service.findUnique.mockResolvedValue({ id: 's1', isActive: true });
      prisma.branchServicePricing.findUnique.mockResolvedValue({ id: 'existing-p' });

      await expect(
        service.createBranchPricing('b1', { serviceId: 's1', price: 100 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deactivateBranchPricing', () => {
    it('deactivates pricing record preserving transaction history', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: 'b1', isActive: true });
      prisma.branchServicePricing.findFirst.mockResolvedValue({ id: 'p1', branchId: 'b1', isActive: true });
      prisma.branchServicePricing.update.mockResolvedValue({ id: 'p1', isActive: false });

      const result = await service.deactivateBranchPricing('b1', 'p1');

      expect(prisma.branchServicePricing.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { isActive: false },
      });
      expect(result).toEqual({
        message: 'Branch menu pricing deactivated successfully',
        pricingId: 'p1',
      });
    });
  });

  describe('configureBulkPricing', () => {
    it('executes transaction for bulk pricing payload', async () => {
      const dto = {
        items: [
          { branchId: 'b1', serviceId: 's1', price: 150 },
          { branchId: 'b2', serviceId: 's1', price: 120 },
        ],
      };

      prisma.branch.findMany.mockResolvedValue([
        { id: 'b1', name: 'Bangalore', isActive: true },
        { id: 'b2', name: 'Karkala', isActive: true },
      ]);
      prisma.service.findMany.mockResolvedValue([
        { id: 's1', name: 'Haircut', isActive: true },
      ]);
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.configureBulkPricing(dto);

      expect(prisma.branch.findMany).toHaveBeenCalled();
      expect(prisma.service.findMany).toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Bulk menu pricing configured successfully',
        count: 2,
      });
    });

    it('rejects duplicate branch-service pairs in bulk payload', async () => {
      const dto = {
        items: [
          { branchId: 'b1', serviceId: 's1', price: 150 },
          { branchId: 'b1', serviceId: 's1', price: 200 },
        ],
      };

      await expect(service.configureBulkPricing(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects bulk pricing if any branch is inactive', async () => {
      const dto = {
        items: [{ branchId: 'b1', serviceId: 's1', price: 150 }],
      };

      prisma.branch.findMany.mockResolvedValue([
        { id: 'b1', name: 'Bangalore', isActive: false },
      ]);

      await expect(service.configureBulkPricing(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
