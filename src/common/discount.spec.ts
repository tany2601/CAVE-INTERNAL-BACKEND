import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { billDiscount, discountPart, wholeBillDiscount } from './discount.js';

const P = DiscountType.PERCENTAGE;
const F = DiscountType.FIXED;

describe('discount on one part of the bill', () => {
  it('takes a percentage or rupees off, to the paisa', () => {
    expect(discountPart({ type: P, value: 10 }, 1250, 'Services').amount).toBe(125);
    expect(discountPart({ type: P, value: 12.5 }, 99.99, 'Services').amount).toBe(12.5); // 12.49875
    expect(discountPart({ type: F, value: 49.5 }, 200, 'Products').amount).toBe(49.5);
    expect(discountPart(undefined, 200, 'Products')).toMatchObject({ type: 'NONE', amount: 0 });
  });

  it('refuses a discount bigger than the part it is on', () => {
    expect(() => discountPart({ type: P, value: 101 }, 100, 'Services')).toThrow(/more than 100%/);
    expect(() => discountPart({ type: F, value: 300.01 }, 300, 'Services')).toThrow(/more than the services total/);
    expect(() => discountPart({ type: F, value: 1 }, 0, 'Products')).toThrow(/more than the products total/);
    expect(() => discountPart({ type: P, value: -1 }, 100, 'Services')).toThrow(BadRequestException);
    expect(discountPart({ type: F, value: 300 }, 300, 'Services').amount).toBe(300); // all of it is allowed
  });
});

describe('the bill discount (services and products apart)', () => {
  it('adds the two exactly, and never exceeds what was sold', () => {
    const d = billDiscount({ services: { type: P, value: 12.5 }, products: { type: P, value: 12.5 } }, 99.99, 33.33);
    expect(d.services.amount).toBe(12.5);
    expect(d.products.amount).toBe(4.17); // 4.16625
    expect(d.total).toBe(16.67);
    expect(d.total).toBe(Math.round((d.services.amount + d.products.amount) * 100) / 100);
    expect(d.summary).toEqual({ type: 'PERCENTAGE', value: 12.5 }); // the same percentage on both
  });

  it('keeps a services-only or products-only discount on that part', () => {
    const s = billDiscount({ services: { type: P, value: 10 } }, 1000, 500);
    expect([s.services.amount, s.products.amount, s.total]).toEqual([100, 0, 100]);
    const p = billDiscount({ products: { type: F, value: 50 } }, 1000, 500);
    expect([p.services.amount, p.products.amount, p.total]).toEqual([0, 50, 50]);
    expect(p.summary).toEqual({ type: 'FIXED', value: 50 });
  });

  it('is nothing when nothing is set, and summarises a one-sided percentage as that percentage', () => {
    expect(billDiscount({}, 100, 100)).toMatchObject({ total: 0, summary: { type: 'NONE', value: 0 } });
    expect(billDiscount({ services: { type: P, value: 15 } }, 400, 0).summary).toEqual({ type: 'PERCENTAGE', value: 15 });
  });

  it('a different discount on each part is summed and summarised in rupees', () => {
    const d = billDiscount({ services: { type: P, value: 10 }, products: { type: F, value: 25 } }, 800, 300);
    expect([d.services.amount, d.products.amount, d.total]).toEqual([80, 25, 105]);
    expect(d.summary).toEqual({ type: 'FIXED', value: 105 });
  });
});

describe('one whole-bill discount (older screens)', () => {
  it('splits in proportion and the parts always add up to the whole', () => {
    const d = wholeBillDiscount(P, 10, 66.67, 33.34);
    expect(d.total).toBe(10);
    expect(Math.round((d.services.amount + d.products.amount) * 100)).toBe(1000);
    expect(d.summary).toEqual({ type: 'PERCENTAGE', value: 10 });
  });

  it('keeps the old rules and messages', () => {
    expect(() => wholeBillDiscount(P, 120, 100, 0)).toThrow(/between 0 and 100/);
    expect(() => wholeBillDiscount(F, 150, 100, 0)).toThrow(/cannot exceed/);
    expect(wholeBillDiscount(DiscountType.NONE, 0, 100, 50)).toMatchObject({ total: 0, summary: { type: 'NONE', value: 0 } });
    expect(wholeBillDiscount(F, 30, 100, 0)).toMatchObject({ total: 30, summary: { type: 'FIXED', value: 30 } });
  });
});
