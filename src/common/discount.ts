import { BadRequestException } from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { round2 } from './commission.util.js';

export interface DiscountPart {
  type: DiscountType;
  value: number;
  /** The rupees taken off, to the paisa. */
  amount: number;
}

export interface BillDiscount {
  services: DiscountPart;
  products: DiscountPart;
  /** services + products */
  total: number;
  /**
   * The old single-discount summary of the two parts (kept on the bill for older screens and exports):
   * the same percentage on both → that percentage; nothing → NONE; anything else → the rupees taken off.
   */
  summary: { type: DiscountType; value: number };
}

const NONE: DiscountPart = { type: DiscountType.NONE, value: 0, amount: 0 };

/**
 * One discount on one part of the bill: a percentage (0–100) of `base`, or a number of rupees that must not
 * be more than `base`. `label` is "Services" or "Products", for the message when it is too much.
 */
export function discountPart(
  input: { type?: DiscountType | null; value?: number | null } | undefined,
  base: number,
  label: string,
): DiscountPart {
  const type = input?.type ?? DiscountType.NONE;
  const value = input?.value ?? 0;
  if (type === DiscountType.NONE) return NONE;
  if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`${label} discount must be zero or more.`);
  if (type === DiscountType.PERCENTAGE) {
    if (value > 100) throw new BadRequestException(`${label} discount cannot be more than 100%.`);
    return { type, value: round2(value), amount: round2((base * value) / 100) };
  }
  if (round2(value) > round2(base)) {
    throw new BadRequestException(`${label} discount cannot be more than the ${label.toLowerCase()} total.`);
  }
  return { type, value: round2(value), amount: round2(value) };
}

/**
 * The bill's discount, from a separate discount on the services and on the products. The total is always
 * exactly the two amounts added up, and can never be more than what was sold.
 */
export function billDiscount(
  input: {
    services?: { type?: DiscountType | null; value?: number | null };
    products?: { type?: DiscountType | null; value?: number | null };
  },
  servicesSubtotal: number,
  productsSubtotal: number,
): BillDiscount {
  const services = discountPart(input.services, servicesSubtotal, 'Services');
  const products = discountPart(input.products, productsSubtotal, 'Products');
  const total = round2(services.amount + products.amount);
  let summary: BillDiscount['summary'] = { type: DiscountType.FIXED, value: total };
  if (total === 0) summary = { type: DiscountType.NONE, value: 0 };
  else if (
    services.type === DiscountType.PERCENTAGE &&
    products.type === DiscountType.PERCENTAGE &&
    services.value === products.value
  ) {
    summary = { type: DiscountType.PERCENTAGE, value: services.value };
  } else if (services.type === DiscountType.PERCENTAGE && productsSubtotal === 0) {
    summary = { type: DiscountType.PERCENTAGE, value: services.value };
  } else if (products.type === DiscountType.PERCENTAGE && servicesSubtotal === 0) {
    summary = { type: DiscountType.PERCENTAGE, value: products.value };
  }
  return { services, products, total, summary };
}

/**
 * A single whole-bill discount (what older screens send) split between services and products in proportion to
 * their value, with the two parts always adding up to exactly the whole.
 */
export function wholeBillDiscount(
  type: DiscountType,
  rawValue: number,
  servicesSubtotal: number,
  productsSubtotal: number,
): BillDiscount {
  const pre = round2(servicesSubtotal + productsSubtotal);
  let total = 0;
  let value = 0;
  if (type === DiscountType.PERCENTAGE) {
    if (rawValue < 0 || rawValue > 100) throw new BadRequestException('Percentage discount must be between 0 and 100.');
    value = rawValue;
    total = round2((pre * value) / 100);
  } else if (type === DiscountType.FIXED) {
    if (rawValue < 0) throw new BadRequestException('Fixed discount amount must be non-negative.');
    if (rawValue > pre) throw new BadRequestException('Fixed discount amount cannot exceed pre-discount subtotal.');
    value = rawValue;
    total = round2(value);
  }
  if (total > pre) throw new BadRequestException('Discount amount cannot exceed pre-discount subtotal.');
  const svcAmount = pre > 0 ? round2((total * servicesSubtotal) / pre) : 0;
  const prodAmount = round2(total - svcAmount);
  const part = (amount: number): DiscountPart =>
    type === DiscountType.NONE || amount === 0 && total === 0
      ? NONE
      : { type: type === DiscountType.PERCENTAGE ? type : DiscountType.FIXED, value: type === DiscountType.PERCENTAGE ? value : amount, amount };
  return {
    services: part(svcAmount),
    products: part(prodAmount),
    total,
    summary: { type, value: type === DiscountType.NONE ? 0 : value },
  };
}
