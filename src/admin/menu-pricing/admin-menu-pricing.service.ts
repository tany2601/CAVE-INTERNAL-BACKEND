import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateBranchPricingDto } from './dto/create-branch-pricing.dto.js';
import { UpdateBranchPricingDto } from './dto/update-branch-pricing.dto.js';
import { ListBranchPricingQueryDto } from './dto/list-branch-pricing-query.dto.js';
import { BulkMenuPricingDto } from './dto/bulk-menu-pricing.dto.js';

@Injectable()
export class AdminMenuPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async listBranchPricing(branchId: string, query: ListBranchPricingQueryDto) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const where: any = { branchId };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search && query.search.trim() !== '') {
      const searchTerm = query.search.trim();
      where.service = {
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { category: { contains: searchTerm, mode: 'insensitive' } },
        ],
      };
    }

    const [pricing, total] = await Promise.all([
      this.prisma.branchServicePricing.findMany({
        where,
        include: {
          service: {
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              durationMin: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.branchServicePricing.count({ where }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      data: pricing,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async createBranchPricing(branchId: string, dto: CreateBranchPricingDto) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }
    if (!branch.isActive) {
      throw new BadRequestException('Branch is inactive.');
    }

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service) {
      throw new NotFoundException('Service not found.');
    }
    if (!service.isActive) {
      throw new BadRequestException('Service is inactive.');
    }

    const existingPricing = await this.prisma.branchServicePricing.findUnique({
      where: {
        branchId_serviceId: {
          branchId,
          serviceId: dto.serviceId,
        },
      },
    });

    if (existingPricing) {
      throw new ConflictException(
        'Branch menu pricing already exists for this service.',
      );
    }

    const pricing = await this.prisma.branchServicePricing.create({
      data: {
        branchId,
        serviceId: dto.serviceId,
        price: dto.price,
        isActive: true,
      },
      include: {
        service: true,
      },
    });

    return {
      message: 'Branch menu pricing created successfully',
      pricing,
    };
  }

  async updateBranchPricing(
    branchId: string,
    pricingId: string,
    dto: UpdateBranchPricingDto,
  ) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const existingPricing = await this.prisma.branchServicePricing.findFirst({
      where: {
        id: pricingId,
        branchId,
      },
    });

    if (!existingPricing) {
      throw new NotFoundException(
        'Branch menu pricing record not found for this branch.',
      );
    }

    const updateData: any = {};
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updatedPricing = await this.prisma.branchServicePricing.update({
      where: { id: pricingId },
      data: updateData,
      include: {
        service: true,
      },
    });

    return {
      message: 'Branch menu pricing updated successfully',
      pricing: updatedPricing,
    };
  }

  async deactivateBranchPricing(branchId: string, pricingId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const existingPricing = await this.prisma.branchServicePricing.findFirst({
      where: {
        id: pricingId,
        branchId,
      },
    });

    if (!existingPricing) {
      throw new NotFoundException(
        'Branch menu pricing record not found for this branch.',
      );
    }

    await this.prisma.branchServicePricing.update({
      where: { id: pricingId },
      data: { isActive: false },
    });

    return {
      message: 'Branch menu pricing deactivated successfully',
      pricingId,
    };
  }

  async configureBulkPricing(dto: BulkMenuPricingDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Items payload cannot be empty.');
    }

    // 1. Check for duplicate branchId + serviceId combinations in the request payload
    const seenPairs = new Set<string>();
    for (const item of dto.items) {
      const pairKey = `${item.branchId}_${item.serviceId}`;
      if (seenPairs.has(pairKey)) {
        throw new BadRequestException(
          `Duplicate pricing entry found in bulk request for branch ${item.branchId} and service ${item.serviceId}.`,
        );
      }
      seenPairs.add(pairKey);
    }

    // 2. Validate all unique branchIds exist and are active
    const uniqueBranchIds = Array.from(new Set(dto.items.map((i) => i.branchId)));
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: uniqueBranchIds } },
    });

    if (branches.length !== uniqueBranchIds.length) {
      throw new NotFoundException(
        'One or more specified branches were not found.',
      );
    }

    const inactiveBranch = branches.find((b) => !b.isActive);
    if (inactiveBranch) {
      throw new BadRequestException(
        `Branch '${inactiveBranch.name}' (${inactiveBranch.id}) is inactive.`,
      );
    }

    // 3. Validate all unique serviceIds exist and are active
    const uniqueServiceIds = Array.from(new Set(dto.items.map((i) => i.serviceId)));
    const services = await this.prisma.service.findMany({
      where: { id: { in: uniqueServiceIds } },
    });

    if (services.length !== uniqueServiceIds.length) {
      throw new NotFoundException(
        'One or more specified services were not found.',
      );
    }

    const inactiveService = services.find((s) => !s.isActive);
    if (inactiveService) {
      throw new BadRequestException(
        `Service '${inactiveService.name}' (${inactiveService.id}) is inactive.`,
      );
    }

    // 4. Perform atomic database transaction so partial updates do not occur
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.branchServicePricing.upsert({
          where: {
            branchId_serviceId: {
              branchId: item.branchId,
              serviceId: item.serviceId,
            },
          },
          create: {
            branchId: item.branchId,
            serviceId: item.serviceId,
            price: item.price,
            isActive: true,
          },
          update: {
            price: item.price,
            isActive: true,
          },
        }),
      ),
    );

    return {
      message: 'Bulk menu pricing configured successfully',
      count: dto.items.length,
    };
  }
}
