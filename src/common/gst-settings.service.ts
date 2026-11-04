import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_GST, GstConfig, isValidGstin } from './gst.js';

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
    return cleanGst(row?.value as Partial<GstConfig> | undefined);
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
