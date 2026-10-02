import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AdminMenuPricingController } from './admin-menu-pricing.controller.js';
import { AdminMenuPricingService } from './admin-menu-pricing.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

describe('AdminMenuPricingController', () => {
  let controller: AdminMenuPricingController;
  let adminMenuPricingService: {
    listBranchPricing: ReturnType<typeof vi.fn>;
    createBranchPricing: ReturnType<typeof vi.fn>;
    updateBranchPricing: ReturnType<typeof vi.fn>;
    deactivateBranchPricing: ReturnType<typeof vi.fn>;
    configureBulkPricing: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    adminMenuPricingService = {
      listBranchPricing: vi.fn(),
      createBranchPricing: vi.fn(),
      updateBranchPricing: vi.fn(),
      deactivateBranchPricing: vi.fn(),
      configureBulkPricing: vi.fn(),
    };

    const configService = new ConfigService({ JWT_SECRET: 'test-secret' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMenuPricingController],
      providers: [
        { provide: AdminMenuPricingService, useValue: adminMenuPricingService },
        { provide: ConfigService, useValue: configService },
        Reflector,
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<AdminMenuPricingController>(
      AdminMenuPricingController,
    );
  });

  it('Delegates listBranchPricing request to service', async () => {
    const branchId = 'b1a2c3d4-e5f6-7890-abcd-ef1234567890';
    const query = { page: 1, limit: 10 };
    const mockResult = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
    adminMenuPricingService.listBranchPricing.mockResolvedValue(mockResult);

    const result = await controller.listBranchPricing(branchId, query);

    expect(adminMenuPricingService.listBranchPricing).toHaveBeenCalledWith(
      branchId,
      query,
    );
    expect(result).toEqual(mockResult);
  });

  it('Delegates createBranchPricing request to service', async () => {
    const branchId = 'b1a2c3d4-e5f6-7890-abcd-ef1234567890';
    const dto = { serviceId: 's1a2c3d4-e5f6-7890-abcd-ef1234567890', price: 150 };
    const mockResult = { message: 'Branch menu pricing created successfully', pricing: {} };
    adminMenuPricingService.createBranchPricing.mockResolvedValue(mockResult);

    const result = await controller.createBranchPricing(branchId, dto);

    expect(adminMenuPricingService.createBranchPricing).toHaveBeenCalledWith(
      branchId,
      dto,
    );
    expect(result).toEqual(mockResult);
  });

  it('Delegates updateBranchPricing request to service', async () => {
    const branchId = 'b1a2c3d4-e5f6-7890-abcd-ef1234567890';
    const pricingId = 'p1a2c3d4-e5f6-7890-abcd-ef1234567890';
    const dto = { price: 160 };
    const mockResult = { message: 'Branch menu pricing updated successfully', pricing: {} };
    adminMenuPricingService.updateBranchPricing.mockResolvedValue(mockResult);

    const result = await controller.updateBranchPricing(
      branchId,
      pricingId,
      dto,
    );

    expect(adminMenuPricingService.updateBranchPricing).toHaveBeenCalledWith(
      branchId,
      pricingId,
      dto,
    );
    expect(result).toEqual(mockResult);
  });

  it('Delegates deactivateBranchPricing request to service', async () => {
    const branchId = 'b1a2c3d4-e5f6-7890-abcd-ef1234567890';
    const pricingId = 'p1a2c3d4-e5f6-7890-abcd-ef1234567890';
    const mockResult = { message: 'Branch menu pricing deactivated successfully', pricingId };
    adminMenuPricingService.deactivateBranchPricing.mockResolvedValue(mockResult);

    const result = await controller.deactivateBranchPricing(branchId, pricingId);

    expect(adminMenuPricingService.deactivateBranchPricing).toHaveBeenCalledWith(
      branchId,
      pricingId,
    );
    expect(result).toEqual(mockResult);
  });

  it('Delegates configureBulkPricing request to service', async () => {
    const dto = {
      items: [{ branchId: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890', serviceId: 's1a2c3d4-e5f6-7890-abcd-ef1234567890', price: 150 }],
    };
    const mockResult = { message: 'Bulk menu pricing configured successfully', count: 1 };
    adminMenuPricingService.configureBulkPricing.mockResolvedValue(mockResult);

    const result = await controller.configureBulkPricing(dto);

    expect(adminMenuPricingService.configureBulkPricing).toHaveBeenCalledWith(
      dto,
    );
    expect(result).toEqual(mockResult);
  });
});
