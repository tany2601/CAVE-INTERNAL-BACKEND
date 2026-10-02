import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminServicesService } from './admin-services.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('AdminServicesService', () => {
  let service: AdminServicesService;
  let prisma: {
    service: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prisma = {
      service: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    service = new AdminServicesService(prisma as unknown as PrismaService);
  });

  describe('createService', () => {
    it('successfully creates a global service without branch ID', async () => {
      prisma.service.findUnique.mockResolvedValue(null);
      const createdMock = {
        id: 'service-1',
        name: 'Haircut',
        description: 'Basic haircut',
        category: 'Hair Care',
        durationMin: 30,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.service.create.mockResolvedValue(createdMock);

      const dto = {
        name: 'Haircut',
        description: 'Basic haircut',
        category: 'Hair Care',
        durationMin: 30,
      };

      const result = await service.createService(dto);

      expect(prisma.service.findUnique).toHaveBeenCalledWith({
        where: { name: 'Haircut' },
      });
      expect(prisma.service.create).toHaveBeenCalledWith({
        data: {
          name: 'Haircut',
          description: 'Basic haircut',
          category: 'Hair Care',
          durationMin: 30,
          isActive: true,
        },
      });
      expect(result).toEqual({
        message: 'Service created successfully',
        service: createdMock,
      });
    });

    it('throws ConflictException if service name already exists', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: 'existing-1', name: 'Haircut' });

      await expect(
        service.createService({ name: 'Haircut' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listServices', () => {
    it('returns paginated list of services with filters', async () => {
      const mockServices = [
        { id: '1', name: 'Haircut', isActive: true },
        { id: '2', name: 'Hair Wash', isActive: true },
      ];
      prisma.service.findMany.mockResolvedValue(mockServices);
      prisma.service.count.mockResolvedValue(2);

      const result = await service.listServices({ page: 1, limit: 10, search: 'Hair' });

      expect(result).toEqual({
        data: mockServices,
        meta: {
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });
  });

  describe('updateService', () => {
    it('successfully updates service details', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: '1', name: 'Haircut' });
      prisma.service.findFirst.mockResolvedValue(null);
      const updatedMock = { id: '1', name: 'Haircut VIP' };
      prisma.service.update.mockResolvedValue(updatedMock);

      const result = await service.updateService('1', { name: 'Haircut VIP' });

      expect(result).toEqual({
        message: 'Service updated successfully',
        service: updatedMock,
      });
    });

    it('throws NotFoundException if service does not exist', async () => {
      prisma.service.findUnique.mockResolvedValue(null);

      await expect(
        service.updateService('non-existent', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if updating to duplicate service name', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: '1', name: 'Haircut' });
      prisma.service.findFirst.mockResolvedValue({ id: '2', name: 'Hair Colour' });

      await expect(
        service.updateService('1', { name: 'Hair Colour' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateServiceStatus', () => {
    it('deactivates service while preserving record', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: '1', name: 'Haircut', isActive: true });
      const updatedMock = { id: '1', name: 'Haircut', isActive: false };
      prisma.service.update.mockResolvedValue(updatedMock);

      const result = await service.updateServiceStatus('1', { isActive: false });

      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: false },
      });
      expect(result).toEqual({
        message: 'Service status updated successfully',
        service: updatedMock,
      });
    });
  });
});
