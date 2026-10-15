import { DiscountType } from '@prisma/client';

/** One discount as the screens see it: always a percentage or rupees (never "none"). */
export interface DiscountSetting {
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
}

export interface BranchDiscountSetting {
  /** When on, the billing screen starts with these discounts (staff can still change them on a bill). */
  enabled: boolean;
  services: DiscountSetting;
  products: DiscountSetting;
}

export const NO_DISCOUNT: BranchDiscountSetting = {
  enabled: false,
  services: { type: 'PERCENTAGE', value: 0 },
  products: { type: 'PERCENTAGE', value: 0 },
};

const part = (type: DiscountType | undefined, value: unknown): DiscountSetting => ({
  type: type === DiscountType.FIXED ? 'FIXED' : 'PERCENTAGE',
  value: Number(value ?? 0),
});

/** A saved row (or nothing) as the setting the screens use. */
export function toSetting(
  row?: { enabled: boolean; serviceType: DiscountType; serviceValue: unknown; productType: DiscountType; productValue: unknown } | null,
): BranchDiscountSetting {
  if (!row) return NO_DISCOUNT;
  return {
    enabled: row.enabled,
    services: part(row.serviceType, row.serviceValue),
    products: part(row.productType, row.productValue),
  };
}
