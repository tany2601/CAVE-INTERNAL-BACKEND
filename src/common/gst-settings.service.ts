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
