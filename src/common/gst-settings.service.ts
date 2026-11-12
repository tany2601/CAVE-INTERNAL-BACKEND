import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_GST, GstConfig, isHaircutOrBeard, isValidGstin } from './gst.js';

const KEY = 'gst';

const rate = (x: unknown, fallback: number) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : fallback;
};
const text = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/** Saved GST settings with anything missing or invalid replaced by the standard values. */
export function cleanGst(v?: Partial<GstConfig> | null): GstConfig {
  const gstin = (typeof v?.gstin === 'string' ? v.gstin : DEFAULT_GST.gstin).trim().toUpperCase();
  return {
    // An invalid GSTIN never goes onto a bill: GST stays off until it is corrected.
    enabled: v?.enabled !== false && isValidGstin(gstin),
    gstin,
    legalName: text(v?.legalName, 120),
    services: {
      rate: rate(v?.services?.rate, DEFAULT_GST.services.rate),
      inclusive: typeof v?.services?.inclusive === 'boolean' ? v.services.inclusive : DEFAULT_GST.services.inclusive,
    },
    products: {
      rate: rate(v?.products?.rate, DEFAULT_GST.products.rate),
      inclusive: typeof v?.products?.inclusive === 'boolean' ? v.products.inclusive : DEFAULT_GST.products.inclusive,
    },
    inclusiveServiceIds: Array.isArray(v?.inclusiveServiceIds)
      ? [...new Set(v.inclusiveServiceIds.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))]
      : [],
    servicesCode: text(v?.servicesCode, 8),
    productsCode: text(v?.productsCode, 8),
  };
}

export interface BranchGstSetting {
  branchId: string;
  branchName: string;
  isActive: boolean;
  /** false while the branch follows the business defaults */
  customised: boolean;
  enabled: boolean;
  servicesRate: number;
  productsRate: number;
  productsInclusive: boolean;
  inclusiveServiceIds: string[];
}

/** The business's GST details: GSTIN, the rates, and whether prices already include the tax. */
@Injectable()
export class GstSettings {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<GstConfig> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    const saved = row?.value as Partial<GstConfig> | undefined;
    const clean = cleanGst(saved);
    // Before the admin has chosen, haircuts and beard services are the ones that include GST.
    if (!Array.isArray(saved?.inclusiveServiceIds)) {
      const services = await this.prisma.service.findMany({ where: { isActive: true }, select: { id: true, name: true } });
      clean.inclusiveServiceIds = services.filter((s) => isHaircutOrBeard(s.name)).map((s) => s.id);
    }
    return clean;
  }

  /**
   * The GST rules for one branch's bills: the business details (GSTIN, name, codes) with the branch's own switch,
   * rates and service list on top. A branch that has not been customised follows the business defaults.
   */
  async getForBranch(branchId: string): Promise<GstConfig> {
    const [base, row] = await Promise.all([this.get(), this.prisma.branchGst.findUnique({ where: { branchId } })]);
    if (!row) return base;
    return {
      ...base,
      enabled: base.enabled && row.enabled,
      services: { ...base.services, rate: Number(row.servicesRate) },
      products: { rate: Number(row.productsRate), inclusive: row.productsInclusive },
      inclusiveServiceIds: row.inclusiveServiceIds ?? [],
    };
  }

  /** Every branch with the GST rules its bills use, and whether they were customised or follow the defaults. */
  async listBranches(): Promise<BranchGstSetting[]> {
    const [base, branches, rows] = await Promise.all([
      this.get(),
      this.prisma.branch.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true, isActive: true } }),
      this.prisma.branchGst.findMany(),
    ]);
    const byBranch = new Map(rows.map((r) => [r.branchId, r]));
    return branches.map((b) => {
      const row = byBranch.get(b.id);
      return {
        branchId: b.id,
        branchName: b.name,
        isActive: b.isActive,
        customised: !!row,
        enabled: row ? row.enabled : true,
        servicesRate: row ? Number(row.servicesRate) : base.services.rate,
        productsRate: row ? Number(row.productsRate) : base.products.rate,
        productsInclusive: row ? row.productsInclusive : base.products.inclusive,
        inclusiveServiceIds: row ? (row.inclusiveServiceIds ?? []) : base.inclusiveServiceIds,
      };
    });
  }

  async saveBranch(branchId: string, input: Omit<BranchGstSetting, 'branchId' | 'branchName' | 'isActive' | 'customised'>) {
    const data = {
      enabled: input.enabled,
      servicesRate: rate(input.servicesRate, DEFAULT_GST.services.rate),
      productsRate: rate(input.productsRate, DEFAULT_GST.products.rate),
      productsInclusive: input.productsInclusive,
      inclusiveServiceIds: [...new Set(input.inclusiveServiceIds)],
    };
    await this.prisma.branchGst.upsert({ where: { branchId }, create: { branchId, ...data }, update: data });
  }

  /** Back to the business defaults. */
  async resetBranch(branchId: string) {
    await this.prisma.branchGst.deleteMany({ where: { branchId } });
  }

  async save(value: GstConfig): Promise<GstConfig> {
    const clean = cleanGst(value);
    await this.prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: clean as never },
      update: { value: clean as never },
    });
    return clean;
  }
}

@Global()
@Module({ providers: [GstSettings], exports: [GstSettings] })
export class GstModule {}
