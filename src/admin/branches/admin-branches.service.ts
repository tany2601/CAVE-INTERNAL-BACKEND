import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PinService } from '../../common/security/pin.service.js';
import { CreateBranchDto } from './dto/create-branch.dto.js';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto.js';
import { UpdateBranchDto } from './dto/update-branch.dto.js';
import { UpdateBranchStatusDto } from './dto/update-branch-status.dto.js';
import { SetRolePinDto } from './dto/set-role-pin.dto.js';

@Injectable()
export class AdminBranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pinService: PinService,
    private readonly configService: ConfigService,
  ) {}

  async createBranch(dto: CreateBranchDto) {
    // 1. Check for duplicate branch name
    const existingName = await this.prisma.branch.findUnique({
      where: { name: dto.name },
    });
    if (existingName) {
      throw new ConflictException('Branch with this name already exists.');
    }

    // 2. Check for duplicate branch code
    const existingCode = await this.prisma.branch.findUnique({
      where: { code: dto.code },
    });
    if (existingCode) {
      throw new ConflictException('Branch with this code already exists.');
    }

    // 3. Create branch record in database
    const branch = await this.prisma.branch.create({
      data: {
        name: dto.name,
        code: dto.code,
        address: dto.address ?? null,
        city: dto.city ?? null,
        state: dto.state ?? null,
        isActive: true,
      },
    });

    return {
      message: 'Branch created successfully',
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        address: branch.address,
        city: branch.city,
        state: branch.state,
        isActive: branch.isActive,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
      },
    };
  }

  async listBranches(query: ListBranchesQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search && query.search.trim() !== '') {
      const searchTerm = query.search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { code: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [branches, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
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
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.branch.count({ where }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      data: branches,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async getBranchById(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
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
    });

    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    return branch;
  }

  async updateBranch(id: string, dto: UpdateBranchDto) {
    const existingBranch = await this.prisma.branch.findUnique({
      where: { id },
    });

    if (!existingBranch) {
      throw new NotFoundException('Branch not found.');
    }

    if (dto.name && dto.name !== existingBranch.name) {
      const duplicateName = await this.prisma.branch.findFirst({
        where: {
          name: dto.name,
          NOT: { id },
        },
      });
      if (duplicateName) {
        throw new ConflictException('Branch with this name already exists.');
      }
    }

    if (dto.code && dto.code !== existingBranch.code) {
      const duplicateCode = await this.prisma.branch.findFirst({
        where: {
          code: dto.code,
          NOT: { id },
        },
      });
      if (duplicateCode) {
        throw new ConflictException('Branch with this code already exists.');
      }
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.code !== undefined) updateData.code = dto.code;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.state !== undefined) updateData.state = dto.state;

    const updatedBranch = await this.prisma.branch.update({
      where: { id },
      data: updateData,
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
    });

    return {
      message: 'Branch updated successfully',
      branch: updatedBranch,
    };
  }

  async updateBranchStatus(id: string, dto: UpdateBranchStatusDto) {
    const existingBranch = await this.prisma.branch.findUnique({
      where: { id },
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
    });

    if (!existingBranch) {
      throw new NotFoundException('Branch not found.');
    }

    if (existingBranch.isActive === dto.isActive) {
      return {
        message: 'Branch status updated successfully',
        branch: existingBranch,
      };
    }

    const updatedBranch = await this.prisma.branch.update({
      where: { id },
      data: { isActive: dto.isActive },
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
    });

    return {
      message: 'Branch status updated successfully',
      branch: updatedBranch,
    };
  }

  async setRolePin(
    branchId: string,
    roleNameInput: string,
    dto: SetRolePinDto,
  ) {
    const roleNameUpper = roleNameInput
      ? roleNameInput.trim().toUpperCase()
      : '';
    if (!['MANAGER', 'STYLIST'].includes(roleNameUpper)) {
      throw new BadRequestException(
        'Invalid role name. Must be MANAGER or STYLIST.',
      );
    }

    if (!this.pinService.validate4DigitPin(dto.pin)) {
      throw new BadRequestException('PIN must be exactly 4 numeric digits.');
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    if (!branch.isActive) {
      throw new BadRequestException('Branch is inactive.');
    }

    const role = await this.prisma.role.findUnique({
      where: { name: roleNameUpper },
    });

    if (!role || !role.isActive) {
      throw new BadRequestException('Role is invalid or inactive.');
    }

    const lookupSecret = this.configService.get<string>(
      'BRANCH_PIN_LOOKUP_SECRET',
    );
    if (!lookupSecret) {
      throw new InternalServerErrorException(
        'BRANCH_PIN_LOOKUP_SECRET is not configured.',
      );
    }

    const pinLookup = this.pinService.generatePinLookup(dto.pin, lookupSecret);

    const existingPinCredential =
      await this.prisma.branchRoleCredential.findUnique({
        where: { pinLookup },
      });

    if (existingPinCredential) {
      if (
        existingPinCredential.branchId !== branchId ||
        existingPinCredential.roleId !== role.id
      ) {
        throw new ConflictException(
          'PIN is already assigned to another branch or role.',
        );
      }
    }

    const pinHash = await this.pinService.hash4DigitPin(dto.pin);

    await this.prisma.branchRoleCredential.upsert({
      where: {
        branchId_roleId: {
          branchId,
          roleId: role.id,
        },
      },
      create: {
        branchId,
        roleId: role.id,
        pinHash,
        pinLookup,
      },
      update: {
        pinHash,
        pinLookup,
      },
    });

    return {
      message: 'Role PIN configured successfully',
      branchId,
      role: roleNameUpper,
    };
  }

  async getRolePinsStatus(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const credentials = await this.prisma.branchRoleCredential.findMany({
      where: { branchId },
      include: { role: true },
    });

    const configuredRoles = new Set(
      credentials.map((c) => c.role.name.toUpperCase()),
    );

    return {
      branchId,
      roles: [
        { role: 'MANAGER', isConfigured: configuredRoles.has('MANAGER') },
        { role: 'STYLIST', isConfigured: configuredRoles.has('STYLIST') },
      ],
    };
  }

  async resetRolePin(branchId: string, roleNameInput: string) {
    const roleNameUpper = roleNameInput
      ? roleNameInput.trim().toUpperCase()
      : '';
    if (!['MANAGER', 'STYLIST'].includes(roleNameUpper)) {
      throw new BadRequestException(
        'Invalid role name. Must be MANAGER or STYLIST.',
      );
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const role = await this.prisma.role.findUnique({
      where: { name: roleNameUpper },
    });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    const credential = await this.prisma.branchRoleCredential.findUnique({
      where: {
        branchId_roleId: {
          branchId,
          roleId: role.id,
        },
      },
    });

    if (!credential) {
      throw new NotFoundException(
        'Role PIN credential not found for this branch and role.',
      );
    }

    await this.prisma.branchRoleCredential.delete({
      where: {
        id: credential.id,
      },
    });

    return {
      message: 'Role PIN deleted successfully',
      branchId,
      role: roleNameUpper,
    };
  }

  async getBranchStaffForDropdown(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    if (!branch.isActive) {
      throw new BadRequestException('Branch is inactive.');
    }

    const staffMembers = await this.prisma.user.findMany({
      where: {
        branchId,
        isActive: true,
        role: {
          name: { in: ['MANAGER', 'STYLIST'] },
        },
      },
      select: {
        id: true,
        name: true,
        role: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return staffMembers.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role.name,
    }));
  }
}
