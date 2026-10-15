import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BranchDiscountSetting, toSetting } from './discount-settings.js';
import { SaveBranchDiscountDto } from './dto/save-discount.dto.js';

/** The discount each branch's billing screens start with (Admin → Discounts). */
@Injectable()
export class AdminDiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every branch with its discount (a branch that has never been set has it switched off at 0). */
  async list(): Promise<{ data: ({ branchId: string; branchName: string; isActive: boolean } & BranchDiscountSetting)[] }> {
    const branches = await this.prisma.branch.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, isActive: true, discount: true },
    });
    return {
      data: branches.map((b) => ({ branchId: b.id, branchName: b.name, isActive: b.isActive, ...toSetting(b.discount) })),
    };
  }

  async save(branchId: string, dto: SaveBranchDiscountDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) throw new NotFoundException('Branch not found.');
    for (const [label, d] of [['Services', dto.services], ['Products', dto.products]] as const) {
      if (d.type === 'PERCENTAGE' && d.value > 100) throw new BadRequestException(`${label} discount cannot be more than 100%.`);
    }
    const data = {
      enabled: dto.enabled,
      serviceType: dto.services.type as DiscountType,
      serviceValue: dto.services.value,
      productType: dto.products.type as DiscountType,
      productValue: dto.products.value,
    };
    const row = await this.prisma.branchDiscount.upsert({
      where: { branchId },
      create: { branchId, ...data },
      update: data,
    });
    return { message: 'Discount saved', discount: toSetting(row) };
  }
}
