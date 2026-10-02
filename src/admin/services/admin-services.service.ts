import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { UpdateServiceStatusDto } from './dto/update-service-status.dto.js';
import { ListServicesQueryDto } from './dto/list-services-query.dto.js';

@Injectable()
export class AdminServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async createService(dto: CreateServiceDto) {
    const existing = await this.prisma.service.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Service with this name already exists.');
    }

    const service = await this.prisma.service.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? null,
        durationMin: dto.durationMin ?? null,
        isActive: true,
      },
    });

    return {
      message: 'Service created successfully',
      service,
    };
  }

  async listServices(query: ListServicesQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.category && query.category.trim() !== '') {
      where.category = { equals: query.category.trim(), mode: 'insensitive' };
    }

    if (query.search && query.search.trim() !== '') {
      const searchTerm = query.search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { category: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [services, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.service.count({ where }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      data: services,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async getServiceById(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
    });
    if (!service) {
      throw new NotFoundException('Service not found.');
    }
    return service;
  }

  async updateService(id: string, dto: UpdateServiceDto) {
    const existing = await this.prisma.service.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Service not found.');
    }

    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.service.findFirst({
        where: {
          name: dto.name,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new ConflictException('Service with this name already exists.');
      }
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.durationMin !== undefined) updateData.durationMin = dto.durationMin;

    const updatedService = await this.prisma.service.update({
      where: { id },
      data: updateData,
    });

    return {
      message: 'Service updated successfully',
      service: updatedService,
    };
  }

  async updateServiceStatus(id: string, dto: UpdateServiceStatusDto) {
    const existing = await this.prisma.service.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Service not found.');
    }

    const updatedService = await this.prisma.service.update({
      where: { id },
      data: { isActive: dto.isActive },
    });

    return {
      message: 'Service status updated successfully',
      service: updatedService,
    };
  }
}
