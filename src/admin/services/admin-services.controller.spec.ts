import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AdminServicesController } from './admin-services.controller.js';
import { AdminServicesService } from './admin-services.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

describe('AdminServicesController', () => {
  let controller: AdminServicesController;
  let adminServicesService: {
    createService: ReturnType<typeof vi.fn>;
    listServices: ReturnType<typeof vi.fn>;
    getServiceById: ReturnType<typeof vi.fn>;
    updateService: ReturnType<typeof vi.fn>;
    updateServiceStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    adminServicesService = {
      createService: vi.fn(),
      listServices: vi.fn(),
      getServiceById: vi.fn(),
      updateService: vi.fn(),
      updateServiceStatus: vi.fn(),
    };

    const configService = new ConfigService({ JWT_SECRET: 'test-secret' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminServicesController],
      providers: [
        { provide: AdminServicesService, useValue: adminServicesService },
        { provide: ConfigService, useValue: configService },
        Reflector,
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<AdminServicesController>(AdminServicesController);
  });

  it('Delegates createService request to AdminServicesService', async () => {
    const dto = { name: 'Haircut', durationMin: 30 };
    const mockResult = { message: 'Service created successfully', service: { id: '1', ...dto } };
    adminServicesService.createService.mockResolvedValue(mockResult);

    const result = await controller.createService(dto);

    expect(adminServicesService.createService).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockResult);
  });

  it('Delegates listServices request to AdminServicesService', async () => {
    const query = { page: 1, limit: 10 };
    const mockResult = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
    adminServicesService.listServices.mockResolvedValue(mockResult);

    const result = await controller.listServices(query);

    expect(adminServicesService.listServices).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockResult);
  });

  it('Delegates updateService request to AdminServicesService', async () => {
    const serviceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const dto = { name: 'Haircut Premium' };
    const mockResult = { message: 'Service updated successfully', service: { id: serviceId, ...dto } };
    adminServicesService.updateService.mockResolvedValue(mockResult);

    const result = await controller.updateService(serviceId, dto);

    expect(adminServicesService.updateService).toHaveBeenCalledWith(serviceId, dto);
    expect(result).toEqual(mockResult);
  });

  it('Delegates updateServiceStatus request to AdminServicesService', async () => {
    const serviceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const dto = { isActive: false };
    const mockResult = { message: 'Service status updated successfully', service: { id: serviceId, isActive: false } };
    adminServicesService.updateServiceStatus.mockResolvedValue(mockResult);

    const result = await controller.updateServiceStatus(serviceId, dto);

    expect(adminServicesService.updateServiceStatus).toHaveBeenCalledWith(serviceId, dto);
    expect(result).toEqual(mockResult);
  });
});
