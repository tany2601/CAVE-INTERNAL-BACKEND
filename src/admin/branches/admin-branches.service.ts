import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PinService } from '../../common/security/pin.service.js';
import { PinVaultService } from '../../common/security/pin-vault.service.js';
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
    @Optional() private readonly pinVault?: PinVaultService,
  ) {}

  private lookupSecret(): string {
    const secret = this.configService.get<string>('BRANCH_PIN_LOOKUP_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'BRANCH_PIN_LOOKUP_SECRET is not configured.',
      );
    }
    return secret;
  }

  /**
   * Validates the optional manager / stylist PINs of a create or update request and makes
   * sure none clashes with another branch/role (PIN lookups are globally unique) or with
   * the other PIN in the same request. Nothing is written, so callers can run this before
   * touching the database and fail without leaving partial data behind.
   */
  private async planRolePins(
    branchId: string | null,
    pins: { MANAGER?: string; STYLIST?: string },
  ) {
    const entries = Object.entries(pins).filter(([, pin]) => pin !== undefined && pin !== '') as [
      'MANAGER' | 'STYLIST',
      string,
    ][];
    if (entries.length === 0) return [];

    for (const [, pin] of entries) {
      if (!this.pinService.validate4DigitPin(pin)) {
        throw new BadRequestException('PIN must be exactly 4 numeric digits.');
      }
    }
    if (entries.length === 2 && entries[0][1] === entries[1][1]) {
      throw new ConflictException('Manager and stylist PINs must be different.');
    }

    const secret = this.lookupSecret();
    const plan: {
      roleId: string;
      pinHash: string;
      pinLookup: string;
      pinEncrypted: string | null;
    }[] = [];
    for (const [roleName, pin] of entries) {
      const role = await this.prisma.role.findUnique({ where: { name: roleName } });
      if (!role || !role.isActive) {
        throw new BadRequestException('Role is invalid or inactive.');
      }
      const pinLookup = this.pinService.generatePinLookup(pin, secret);
      const clash = await this.prisma.branchRoleCredential.findUnique({
        where: { pinLookup },
      });
      if (clash && (clash.branchId !== branchId || clash.roleId !== role.id)) {
        throw new ConflictException(
          `The ${roleName.toLowerCase()} PIN is already assigned to another branch or role.`,
        );
      }
      plan.push({
        roleId: role.id,
        pinHash: await this.pinService.hash4DigitPin(pin),
        pinLookup,
        pinEncrypted: this.pinVault ? this.pinVault.encrypt(pin) : null,
      });
    }
    return plan;
  }

  /**
   * Gives a new branch every active service so its menu isn't empty. Prices start from what
   * the other branches charge (most recently updated first) and are 0 for services nobody
   * has priced yet; admins adjust or remove them in Menu pricing.
   */
  private async seedMenu(tx: any, branchId: string) {
    const services = await tx.service.findMany({ where: { isActive: true } });
    if (services.length === 0) return;
    const existing = await tx.branchServicePricing.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { serviceId: true, price: true },
    });
    const priceOf = new Map<string, number>();
    for (const row of existing) {
      if (!priceOf.has(row.serviceId)) priceOf.set(row.serviceId, Number(row.price));
    }
    await tx.branchServicePricing.createMany({
      data: services.map((s: { id: string }) => ({
        branchId,
        serviceId: s.id,
        price: priceOf.get(s.id) ?? 0,
      })),
    });
  }

  /** A branch manager must be an active MANAGER already assigned to that branch. */
  private async assertManager(managerId: string, branchId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: managerId },
      include: { role: true },
    });
    if (
      !user ||
      !user.isActive ||
      user.branchId !== branchId ||
      user.role?.name !== 'MANAGER'
    ) {
      throw new BadRequestException(
        'Manager must be an active MANAGER assigned to this branch.',
      );
    }
  }

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

    // 3. Validate PINs up front, then create branch + credentials atomically so a failure
    //    (e.g. a PIN already in use) never leaves a half-created branch behind.
    const pinPlan = await this.planRolePins(null, {
      MANAGER: dto.managerPin,
      STYLIST: dto.stylistPin,
    });
    const branch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({
      data: {
        name: dto.name,
        code: dto.code,
        address: dto.address ?? null,
        city: dto.city ?? null,
        state: dto.state ?? null,
        phone: dto.phone ?? null,
        imageUrl: dto.imageUrl ?? null,
        monthlyTarget: dto.monthlyTarget ?? 0,
        isActive: true,
      },
      });
      for (const c of pinPlan) {
        await tx.branchRoleCredential.create({ data: { branchId: created.id, ...c } });
      }
      await this.seedMenu(tx, created.id);
      return created;
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
        phone: branch.phone,
        imageUrl: branch.imageUrl,
        monthlyTarget: branch.monthlyTarget,
        managerId: branch.managerId,
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
          phone: true,
          imageUrl: true,
          monthlyTarget: true,
          managerId: true,
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
        phone: true,
        imageUrl: true,
        monthlyTarget: true,
        managerId: true,
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
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl;
    if (dto.monthlyTarget !== undefined) updateData.monthlyTarget = dto.monthlyTarget;
    if (dto.managerId !== undefined) {
      // null un-assigns the manager.
      if (dto.managerId !== null) await this.assertManager(dto.managerId, id);
      updateData.managerId = dto.managerId;
    }

    const pinPlan = await this.planRolePins(id, {
      MANAGER: dto.managerPin,
      STYLIST: dto.stylistPin,
    });
    const updatedBranch = await this.prisma.$transaction(async (tx) => {
      for (const c of pinPlan) {
        await tx.branchRoleCredential.upsert({
          where: { branchId_roleId: { branchId: id, roleId: c.roleId } },
          create: { branchId: id, ...c },
          update: c,
        });
      }
      return tx.branch.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        state: true,
        phone: true,
        imageUrl: true,
        monthlyTarget: true,
        managerId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      });
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
        phone: true,
        imageUrl: true,
        monthlyTarget: true,
        managerId: true,
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
        phone: true,
        imageUrl: true,
        monthlyTarget: true,
        managerId: true,
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
    const pinEncrypted = this.pinVault ? this.pinVault.encrypt(dto.pin) : null;

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
        pinEncrypted,
      },
      update: {
        pinHash,
        pinLookup,
        pinEncrypted,
      },
    });

    return {
      message: 'Role PIN configured successfully',
      branchId,
      role: roleNameUpper,
    };
  }

  /**
   * Current PINs for the Settings screen. A PIN is only available if it was set after
   * viewable PINs were introduced; older ones stay hash-only (value null) until re-set.
   */
  async getRolePinValues(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }
    const credentials = await this.prisma.branchRoleCredential.findMany({
      where: { branchId },
      include: { role: true },
    });
    const valueOf = (name: string) => {
      const c = credentials.find((x) => x.role.name.toUpperCase() === name);
      return {
        role: name,
        isConfigured: !!c,
        pin: c ? (this.pinVault?.decrypt(c.pinEncrypted) ?? null) : null,
      };
    };
    return { branchId, roles: [valueOf('MANAGER'), valueOf('STYLIST')] };
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

  /**
   * Permanently removes a branch that has never traded. Branches with sessions, money records
   * or staff keep their history, so those can only be deactivated.
   */
  async deleteBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!branch) throw new NotFoundException('Branch not found.');

    const [sessions, transactions, payouts, staff] = await Promise.all([
      this.prisma.session.count({ where: { branchId: id } }),
      this.prisma.branchTransaction.count({ where: { branchId: id } }),
      this.prisma.staffPayout.count({ where: { branchId: id } }),
      this.prisma.user.count({ where: { branchId: id } }),
    ]);
    if (sessions + transactions + payouts > 0) {
      throw new ConflictException(
        `${branch.name} has sessions or payments on record, so it can't be deleted. Deactivate it instead to keep the history.`,
      );
    }
    if (staff > 0) {
      throw new ConflictException(
        `${branch.name} still has ${staff} staff member${staff === 1 ? '' : 's'}. Delete or move them first, or deactivate the branch.`,
      );
    }

    // Menu pricing blocks the delete; PINs, checklist ticks and opening balances go with the branch.
    await this.prisma.$transaction([
      this.prisma.branchServicePricing.deleteMany({ where: { branchId: id } }),
      this.prisma.branch.delete({ where: { id } }),
    ]);
    return { message: 'Branch deleted successfully' };
  }
}
