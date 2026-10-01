import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { ListStaffQueryDto } from './dto/list-staff-query.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto.js';

@Injectable()
export class AdminStaffService {
  constructor(private readonly prisma: PrismaService) {}

  async createStaff(dto: CreateStaffDto) {
    // 1. Validate role existence, active status, and non-ADMIN constraint
    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });

    if (!role || !role.isActive) {
      throw new BadRequestException('Invalid or inactive role.');
    }

    if (role.name === 'ADMIN') {
      throw new BadRequestException('Cannot assign ADMIN role to staff members.');
    }

    // 2. Validate branch existence and active status
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });

    if (!branch || !branch.isActive) {
      throw new BadRequestException('Invalid or inactive branch.');
    }

    // 3. Create staff member record
    const staff = await this.prisma.user.create({
      data: {
        name: dto.name,
        roleId: dto.roleId,
        branchId: dto.branchId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        role: {
          select: { id: true, name: true, description: true },
        },
        branchId: true,
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            city: true,
            state: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Staff member created successfully',
      staff,
    };
  }

  async listStaff(query: ListStaffQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.roleId) {
      where.roleId = query.roleId;
    } else {
      where.role = {
        name: { in: ['MANAGER', 'STYLIST'] },
      };
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search && query.search.trim() !== '') {
      where.name = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    const [staffMembers, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          roleId: true,
          role: {
            select: { id: true, name: true, description: true },
          },
          branchId: true,
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              address: true,
              city: true,
              state: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      data: staffMembers,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async getStaffById(id: string) {
    const staff = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        role: {
          select: { id: true, name: true, description: true },
        },
        branchId: true,
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            city: true,
            state: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found.');
    }

    return staff;
  }

  async updateStaff(id: string, dto: UpdateStaffDto) {
    const existingStaff = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingStaff) {
      throw new NotFoundException('Staff member not found.');
    }

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });

      if (!role || !role.isActive) {
        throw new BadRequestException('Invalid or inactive role.');
      }

      if (role.name === 'ADMIN') {
        throw new BadRequestException('Cannot assign ADMIN role to staff members.');
      }
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
      });

      if (!branch || !branch.isActive) {
        throw new BadRequestException('Invalid or inactive branch.');
      }
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.roleId !== undefined) updateData.roleId = dto.roleId;
    if (dto.branchId !== undefined) updateData.branchId = dto.branchId;

    const updatedStaff = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        role: {
          select: { id: true, name: true, description: true },
        },
        branchId: true,
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            city: true,
            state: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Staff member updated successfully',
      staff: updatedStaff,
    };
  }

  async updateStaffStatus(id: string, dto: UpdateStaffStatusDto) {
    const existingStaff = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
      },
    });

    if (!existingStaff) {
      throw new NotFoundException('Staff member not found.');
    }

    if (existingStaff.role?.name === 'ADMIN') {
      throw new BadRequestException('Cannot modify status of Admin account.');
    }

    const updatedStaff = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: dto.isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        role: {
          select: { id: true, name: true, description: true },
        },
        branchId: true,
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            city: true,
            state: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Staff member status updated successfully',
      staff: updatedStaff,
    };
  }
}
