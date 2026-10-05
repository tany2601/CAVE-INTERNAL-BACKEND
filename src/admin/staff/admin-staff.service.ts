import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CommissionModel } from '@prisma/client';
import { CreateStaffDto, CreateStaffSlabDto } from './dto/create-staff.dto.js';
import { ListStaffQueryDto } from './dto/list-staff-query.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto.js';

@Injectable()
export class AdminStaffService {
  constructor(private readonly prisma: PrismaService) {}

  private validateCommissionConfig(
    model?: CommissionModel | null,
    flatPercentage?: number | null,
    dailyTarget?: number | null,
    slabs?: CreateStaffSlabDto[] | null,
  ) {
    if (!model) {
      if (
        flatPercentage !== undefined &&
        flatPercentage !== null
      ) {
        throw new BadRequestException(
          'flatCommissionPercentage should not be set without a commissionModel.',
        );
      }
      if (dailyTarget !== undefined && dailyTarget !== null) {
        throw new BadRequestException(
          'dailyTargetAmount should not be set without a commissionModel.',
        );
      }
      if (slabs && slabs.length > 0) {
        throw new BadRequestException(
          'commissionSlabs should not be set without a commissionModel.',
        );
      }
      return;
    }

    if (model === CommissionModel.FLAT_PERCENTAGE) {
      if (flatPercentage === undefined || flatPercentage === null) {
        throw new BadRequestException(
          'flatCommissionPercentage is required for FLAT_PERCENTAGE commission model.',
        );
      }
      if (flatPercentage < 0 || flatPercentage > 100) {
        throw new BadRequestException(
          'flatCommissionPercentage must be between 0 and 100.',
        );
      }
      if (dailyTarget !== undefined && dailyTarget !== null) {
        throw new BadRequestException(
          'dailyTargetAmount must not be provided for FLAT_PERCENTAGE model.',
        );
      }
      if (slabs && slabs.length > 0) {
        throw new BadRequestException(
          'commissionSlabs must not be provided for FLAT_PERCENTAGE model.',
        );
      }
    } else if (model === CommissionModel.DAILY_TARGET) {
      if (dailyTarget === undefined || dailyTarget === null) {
        throw new BadRequestException(
          'dailyTargetAmount is required for DAILY_TARGET commission model.',
        );
      }
      if (dailyTarget < 0) {
        throw new BadRequestException(
          'dailyTargetAmount must be non-negative.',
        );
      }
      if (flatPercentage !== undefined && flatPercentage !== null) {
        throw new BadRequestException(
          'flatCommissionPercentage must not be provided for DAILY_TARGET model.',
        );
      }
      if (slabs && slabs.length > 0) {
        throw new BadRequestException(
          'commissionSlabs must not be provided for DAILY_TARGET model.',
        );
      }
    } else if (model === CommissionModel.MONTHLY_TARGET) {
      if (!slabs || slabs.length !== 3) {
        throw new BadRequestException(
          'Exactly three commission slabs (slab orders 1, 2, and 3) are required for MONTHLY_TARGET model.',
        );
      }
      if (flatPercentage !== undefined && flatPercentage !== null) {
        throw new BadRequestException(
          'flatCommissionPercentage must not be provided for MONTHLY_TARGET model.',
        );
      }
      if (dailyTarget !== undefined && dailyTarget !== null) {
        throw new BadRequestException(
          'dailyTargetAmount must not be provided for MONTHLY_TARGET model.',
        );
      }

      const orders = slabs.map((s) => s.slabOrder).sort((a, b) => a - b);
      if (orders[0] !== 1 || orders[1] !== 2 || orders[2] !== 3) {
        throw new BadRequestException(
          'Commission slabs must contain exactly slab orders 1, 2, and 3.',
        );
      }

      const sortedSlabs = [...slabs].sort((a, b) => a.slabOrder - b.slabOrder);

      for (const slab of sortedSlabs) {
        if (slab.minRevenue < 0) {
          throw new BadRequestException(
            `Minimum revenue for slab ${slab.slabOrder} must be non-negative.`,
          );
        }
        if (slab.commissionPercentage < 0 || slab.commissionPercentage > 100) {
          throw new BadRequestException(
            `Commission percentage for slab ${slab.slabOrder} must be between 0 and 100.`,
          );
        }
      }

      if (
        sortedSlabs[0].minRevenue >= sortedSlabs[1].minRevenue ||
        sortedSlabs[1].minRevenue >= sortedSlabs[2].minRevenue
      ) {
        throw new BadRequestException(
          'Minimum revenue thresholds for monthly target slabs must strictly increase (Slab 1 < Slab 2 < Slab 3).',
        );
      }
    }
  }

  private formatStaffOutput(staff: any) {
    if (!staff) return null;
    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      roleId: staff.roleId,
      role: staff.role,
      branchId: staff.branchId,
      branch: staff.branch,
      monthlySalary:
        staff.monthlySalary !== null && staff.monthlySalary !== undefined
          ? Number(staff.monthlySalary)
          : null,
      phone: staff.phone ?? null,
      photoUrl: staff.photoUrl ?? null,
      dailyRevenueTarget:
        staff.dailyRevenueTarget !== null && staff.dailyRevenueTarget !== undefined
          ? Number(staff.dailyRevenueTarget)
          : null,
      monthlyRevenueTarget:
        staff.monthlyRevenueTarget !== null && staff.monthlyRevenueTarget !== undefined
          ? Number(staff.monthlyRevenueTarget)
          : null,
      commissionModel: staff.commissionModel ?? null,
      flatCommissionPercentage:
        staff.flatCommissionPercentage !== null &&
        staff.flatCommissionPercentage !== undefined
          ? Number(staff.flatCommissionPercentage)
          : null,
      dailyTargetAmount:
        staff.dailyTargetAmount !== null &&
        staff.dailyTargetAmount !== undefined
          ? Number(staff.dailyTargetAmount)
          : null,
      commissionSlabs: staff.commissionSlabs
        ? staff.commissionSlabs.map((s: any) => ({
            id: s.id,
            slabOrder: s.slabOrder,
            minRevenue: Number(s.minRevenue),
            commissionPercentage: Number(s.commissionPercentage),
          }))
        : [],
      isActive: staff.isActive,
      createdAt: staff.createdAt,
      updatedAt: staff.updatedAt,
    };
  }

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

    // 3. Validate commission configuration
    this.validateCommissionConfig(
      dto.commissionModel,
      dto.flatCommissionPercentage,
      dto.dailyTargetAmount,
      dto.commissionSlabs,
    );

    // 4. Create staff member record & slabs transactionally
    const staff = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: dto.name,
          roleId: dto.roleId,
          branchId: dto.branchId,
          monthlySalary: dto.monthlySalary ?? null,
          phone: dto.phone ?? null,
          photoUrl: dto.photoUrl ?? null,
          dailyRevenueTarget: dto.dailyRevenueTarget ?? null,
          monthlyRevenueTarget: dto.monthlyRevenueTarget ?? null,
          commissionModel: dto.commissionModel ?? null,
          flatCommissionPercentage:
            dto.commissionModel === CommissionModel.FLAT_PERCENTAGE
              ? dto.flatCommissionPercentage
              : null,
          dailyTargetAmount:
            dto.commissionModel === CommissionModel.DAILY_TARGET
              ? dto.dailyTargetAmount
              : null,
          isActive: true,
        },
      });

      if (
        dto.commissionModel === CommissionModel.MONTHLY_TARGET &&
        dto.commissionSlabs
      ) {
        await tx.staffCommissionSlab.createMany({
          data: dto.commissionSlabs.map((slab) => ({
            userId: createdUser.id,
            slabOrder: slab.slabOrder,
            minRevenue: slab.minRevenue,
            commissionPercentage: slab.commissionPercentage,
          })),
        });
      }

      return tx.user.findUnique({
        where: { id: createdUser.id },
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
          monthlySalary: true,
          phone: true,
          photoUrl: true,
          dailyRevenueTarget: true,
          monthlyRevenueTarget: true,
          commissionModel: true,
          flatCommissionPercentage: true,
          dailyTargetAmount: true,
          commissionSlabs: {
            orderBy: { slabOrder: 'asc' },
            select: {
              id: true,
              slabOrder: true,
              minRevenue: true,
              commissionPercentage: true,
            },
          },
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    return {
      message: 'Staff member created successfully',
      staff: this.formatStaffOutput(staff),
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
          monthlySalary: true,
          phone: true,
          photoUrl: true,
          dailyRevenueTarget: true,
          monthlyRevenueTarget: true,
          commissionModel: true,
          flatCommissionPercentage: true,
          dailyTargetAmount: true,
          commissionSlabs: {
            orderBy: { slabOrder: 'asc' },
            select: {
              id: true,
              slabOrder: true,
              minRevenue: true,
              commissionPercentage: true,
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
      data: staffMembers.map((s) => this.formatStaffOutput(s)),
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
        monthlySalary: true,
        phone: true,
        photoUrl: true,
        dailyRevenueTarget: true,
        monthlyRevenueTarget: true,
        commissionModel: true,
        flatCommissionPercentage: true,
        dailyTargetAmount: true,
        commissionSlabs: {
          orderBy: { slabOrder: 'asc' },
          select: {
            id: true,
            slabOrder: true,
            minRevenue: true,
            commissionPercentage: true,
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

    return this.formatStaffOutput(staff);
  }

  async updateStaff(id: string, dto: UpdateStaffDto) {
    const existingStaff = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        commissionSlabs: { orderBy: { slabOrder: 'asc' } },
      },
    });

    if (!existingStaff) {
      throw new NotFoundException('Staff member not found.');
    }

    if (existingStaff.role?.name === 'ADMIN') {
      throw new BadRequestException('Cannot modify Admin account compensation.');
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

    // Determine target commission model
    const targetModel =
      dto.commissionModel !== undefined
        ? dto.commissionModel
        : existingStaff.commissionModel;

    // Resolve target commission fields
    let targetFlatPercentage: number | null | undefined;
    let targetDailyTarget: number | null | undefined;
    let targetSlabs: CreateStaffSlabDto[] | null | undefined;

    if (targetModel === CommissionModel.FLAT_PERCENTAGE) {
      targetFlatPercentage =
        dto.flatCommissionPercentage !== undefined
          ? dto.flatCommissionPercentage
          : existingStaff.flatCommissionPercentage !== null
          ? Number(existingStaff.flatCommissionPercentage)
          : undefined;
    } else if (targetModel === CommissionModel.DAILY_TARGET) {
      targetDailyTarget =
        dto.dailyTargetAmount !== undefined
          ? dto.dailyTargetAmount
          : existingStaff.dailyTargetAmount !== null
          ? Number(existingStaff.dailyTargetAmount)
          : undefined;
    } else if (targetModel === CommissionModel.MONTHLY_TARGET) {
      targetSlabs =
        dto.commissionSlabs !== undefined
          ? dto.commissionSlabs
          : existingStaff.commissionSlabs.map((s) => ({
              slabOrder: s.slabOrder,
              minRevenue: Number(s.minRevenue),
              commissionPercentage: Number(s.commissionPercentage),
            }));
    }

    // Validate commission configuration
    this.validateCommissionConfig(
      targetModel,
      targetFlatPercentage,
      targetDailyTarget,
      targetSlabs,
    );

    // Perform atomic transaction update
    const updatedStaff = await this.prisma.$transaction(async (tx) => {
      const updateUserData: any = {};
      if (dto.name !== undefined) updateUserData.name = dto.name;
      if (dto.roleId !== undefined) updateUserData.roleId = dto.roleId;
      if (dto.branchId !== undefined) updateUserData.branchId = dto.branchId;
      if (dto.monthlySalary !== undefined)
        updateUserData.monthlySalary = dto.monthlySalary;
      if (dto.phone !== undefined) updateUserData.phone = dto.phone;
      if (dto.photoUrl !== undefined) updateUserData.photoUrl = dto.photoUrl;
      if (dto.dailyRevenueTarget !== undefined)
        updateUserData.dailyRevenueTarget = dto.dailyRevenueTarget;
      if (dto.monthlyRevenueTarget !== undefined)
        updateUserData.monthlyRevenueTarget = dto.monthlyRevenueTarget;

      if (dto.commissionModel !== undefined) {
        updateUserData.commissionModel = dto.commissionModel;
      }

      if (targetModel === CommissionModel.FLAT_PERCENTAGE) {
        updateUserData.flatCommissionPercentage = targetFlatPercentage;
        updateUserData.dailyTargetAmount = null;
        await tx.staffCommissionSlab.deleteMany({ where: { userId: id } });
      } else if (targetModel === CommissionModel.DAILY_TARGET) {
        updateUserData.dailyTargetAmount = targetDailyTarget;
        updateUserData.flatCommissionPercentage = null;
        await tx.staffCommissionSlab.deleteMany({ where: { userId: id } });
      } else if (targetModel === CommissionModel.MONTHLY_TARGET) {
        updateUserData.flatCommissionPercentage = null;
        updateUserData.dailyTargetAmount = null;
        if (dto.commissionSlabs !== undefined) {
          await tx.staffCommissionSlab.deleteMany({ where: { userId: id } });
          if (dto.commissionSlabs && dto.commissionSlabs.length === 3) {
            await tx.staffCommissionSlab.createMany({
              data: dto.commissionSlabs.map((slab) => ({
                userId: id,
                slabOrder: slab.slabOrder,
                minRevenue: slab.minRevenue,
                commissionPercentage: slab.commissionPercentage,
              })),
            });
          }
        }
      } else if (targetModel === null) {
        updateUserData.flatCommissionPercentage = null;
        updateUserData.dailyTargetAmount = null;
        await tx.staffCommissionSlab.deleteMany({ where: { userId: id } });
      }

      await tx.user.update({
        where: { id },
        data: updateUserData,
      });

      return tx.user.findUnique({
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
          monthlySalary: true,
          phone: true,
          photoUrl: true,
          dailyRevenueTarget: true,
          monthlyRevenueTarget: true,
          commissionModel: true,
          flatCommissionPercentage: true,
          dailyTargetAmount: true,
          commissionSlabs: {
            orderBy: { slabOrder: 'asc' },
            select: {
              id: true,
              slabOrder: true,
              minRevenue: true,
              commissionPercentage: true,
            },
          },
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    return {
      message: 'Staff member updated successfully',
      staff: this.formatStaffOutput(updatedStaff),
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
        monthlySalary: true,
        phone: true,
        photoUrl: true,
        dailyRevenueTarget: true,
        monthlyRevenueTarget: true,
        commissionModel: true,
        flatCommissionPercentage: true,
        dailyTargetAmount: true,
        commissionSlabs: {
          orderBy: { slabOrder: 'asc' },
          select: {
            id: true,
            slabOrder: true,
            minRevenue: true,
            commissionPercentage: true,
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Staff member status updated successfully',
      staff: this.formatStaffOutput(updatedStaff),
    };
  }
}
