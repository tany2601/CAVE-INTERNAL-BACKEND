import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_GST, GST_MODES, GstConfig, GstMode, isHaircutOrBeard, isValidGstin } from './gst.js';

const KEY = 'gst';

const rate = (x: unknown, fallback: number) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : fallback;
};
const text = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/** The per-service modes from saved settings. Settings saved before there were three modes listed the services "inside the price". */
function cleanModes(v?: (Partial<GstConfig> & { inclusiveServiceIds?: unknown }) | null): Record<string, GstMode> {
  const out: Record<string, GstMode> = {};
  if (Array.isArray(v?.inclusiveServiceIds)) {
    for (const id of v.inclusiveServiceIds) if (typeof id === 'string' && id && id.length <= 64) out[id] = 'INCLUDED_IN_PRICE';
  }
  const saved = v?.serviceModes;
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [id, mode] of Object.entries(saved)) {
      if (id && id.length <= 64 && GST_MODES.includes(mode as GstMode)) out[id] = mode as GstMode;
    }
  }
  return out;
}

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
    serviceModes: cleanModes(v),
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
  /** Mode of every service at this branch (a service missing here is ADD_ON_TOP). */
  serviceModes: Record<string, GstMode>;
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
    const chosen = saved && (saved.serviceModes || Array.isArray((saved as { inclusiveServiceIds?: unknown }).inclusiveServiceIds));
    if (!chosen) {
      const services = await this.prisma.service.findMany({ where: { isActive: true }, select: { id: true, name: true } });
      for (const sv of services) if (isHaircutOrBeard(sv.name)) clean.serviceModes[sv.id] = 'INCLUDED_IN_PRICE';
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
    const modes = await this.prisma.branchServiceGst.findMany({ where: { branchId } });
    return {
      ...base,
      enabled: base.enabled && row.enabled,
      services: { ...base.services, rate: Number(row.servicesRate) },
      products: { rate: Number(row.productsRate), inclusive: row.productsInclusive },
      serviceModes: Object.fromEntries(modes.map((m) => [m.serviceId, m.gstMode as GstMode])),
    };
  }

  /** Every branch with the GST rules its bills use, and whether they were customised or follow the defaults. */
  async listBranches(): Promise<BranchGstSetting[]> {
    const [base, branches, rows, modeRows] = await Promise.all([
      this.get(),
      this.prisma.branch.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true, isActive: true } }),
      this.prisma.branchGst.findMany(),
      this.prisma.branchServiceGst.findMany(),
    ]);
    const byBranch = new Map(rows.map((r) => [r.branchId, r]));
    const modesOf = (branchId: string) =>
      Object.fromEntries(modeRows.filter((m) => m.branchId === branchId).map((m) => [m.serviceId, m.gstMode as GstMode]));
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
        serviceModes: row ? modesOf(b.id) : base.serviceModes,
      };
    });
  }

  async saveBranch(branchId: string, input: Omit<BranchGstSetting, 'branchId' | 'branchName' | 'isActive' | 'customised'>) {
    const data = {
      enabled: input.enabled,
      servicesRate: rate(input.servicesRate, DEFAULT_GST.services.rate),
      productsRate: rate(input.productsRate, DEFAULT_GST.products.rate),
      productsInclusive: input.productsInclusive,
    };
    // Only services that exist can have a mode; anything else in the request is ignored.
    const known = new Set((await this.prisma.service.findMany({ select: { id: true } })).map((x) => x.id));
    const modes = Object.entries(input.serviceModes).filter(([id, mode]) => known.has(id) && GST_MODES.includes(mode));
    await this.prisma.$transaction([
      this.prisma.branchGst.upsert({ where: { branchId }, create: { branchId, ...data }, update: data }),
      this.prisma.branchServiceGst.deleteMany({ where: { branchId } }),
      this.prisma.branchServiceGst.createMany({ data: modes.map(([serviceId, gstMode]) => ({ branchId, serviceId, gstMode })) }),
    ]);
  }

  /** Back to the business defaults. */
  async resetBranch(branchId: string) {
    await this.prisma.$transaction([
      this.prisma.branchGst.deleteMany({ where: { branchId } }),
      this.prisma.branchServiceGst.deleteMany({ where: { branchId } }),
    ]);
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
