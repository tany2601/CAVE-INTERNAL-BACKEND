import { describe, it, expect } from 'vitest';
import { netSales } from '../admin/reports/finance.js';
import { billGst, financialYear, gstPart, halfRate, invoiceNumber, isHaircutOrBeard, isValidGstin, modeOfService, serviceBuckets } from './gst.js';

const paise = (n: number) => Math.round(n * 100);

describe('GST added on top (services, 5% = 2.5% + 2.5%)', () => {
  const side = { rate: 5, inclusive: false };

  it('a ₹300 haircut: ₹7.50 + ₹7.50, customer pays ₹315', () => {
    expect(gstPart(300, side)).toMatchObject({ taxable: 300, cgst: 7.5, sgst: 7.5, payable: 315 });
  });

  it('three haircuts and a wash (₹1,000), then a 10% discount (₹900 taxable)', () => {
    expect(gstPart(1000, side)).toMatchObject({ cgst: 25, sgst: 25, payable: 1050 });
    expect(gstPart(900, side)).toMatchObject({ taxable: 900, cgst: 22.5, sgst: 22.5, payable: 945 });
  });

  it('rounds each half to the nearest paisa, halves stay equal', () => {
    // ₹101 x 2.5% = ₹2.525 -> ₹2.53 each
    expect(gstPart(101, side)).toMatchObject({ cgst: 2.53, sgst: 2.53, payable: 106.06 });
    // ₹100.10 x 2.5% = ₹2.5025 -> ₹2.50 each
    expect(gstPart(100.1, side)).toMatchObject({ cgst: 2.5, sgst: 2.5, payable: 105.1 });
  });

  it('nothing to tax: a free line or an empty side', () => {
    expect(gstPart(0, side)).toMatchObject({ taxable: 0, cgst: 0, sgst: 0, payable: 0 });
  });
});

describe('GST inside the price (products, 18% = 9% + 9%)', () => {
  const side = { rate: 18, inclusive: true };

  it('an MRP of ₹599: the customer pays ₹599, tax is carved out', () => {
    expect(gstPart(599, side)).toMatchObject({ taxable: 507.62, cgst: 45.69, sgst: 45.69, payable: 599 });
  });

  it('an MRP of ₹95', () => {
    expect(gstPart(95, side)).toMatchObject({ taxable: 80.5, cgst: 7.25, sgst: 7.25, payable: 95 });
  });

  it('an MRP of ₹118 splits cleanly: ₹100 + ₹9 + ₹9', () => {
    expect(gstPart(118, side)).toMatchObject({ taxable: 100, cgst: 9, sgst: 9, payable: 118 });
  });

  it('zero rate leaves the price untouched', () => {
    expect(gstPart(250, { rate: 0, inclusive: true })).toMatchObject({ taxable: 250, cgst: 0, sgst: 0, payable: 250 });
  });
});

describe('a whole bill', () => {
  it('services added on top, products included: 3 haircuts + wash + clay, 10% off services, ₹50 off products', () => {
    const g = billGst(
      { services: { rate: 5, inclusive: false }, products: { rate: 18, inclusive: true } },
      { servicesInclusive: 0, servicesExclusive: 900, products: 549 },
    );
    expect(g.services).toMatchObject({ taxable: 900, cgst: 22.5, sgst: 22.5, payable: 945 });
    expect(g.products).toMatchObject({ payable: 549, taxable: 465.26, cgst: 41.87, sgst: 41.87 });
    expect(g.payable).toBe(945 + 549);
    expect(g.cgst).toBe(g.sgst);
    expect(g.taxable + g.cgst + g.sgst).toBeCloseTo(g.payable, 2);
  });

  it('totals add up to the paisa and CGST always equals SGST (random bills)', () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 4000; i += 1) {
      const sv = Math.round(rand() * 500000) / 100;
      const pr = Math.round(rand() * 500000) / 100;
      const cfg = {
        services: { rate: [5, 12, 18, 0][i % 4], inclusive: i % 2 === 0 },
        products: { rate: [18, 5, 28, 0][i % 4], inclusive: i % 3 !== 0 },
      };
      const g = billGst(cfg, { servicesInclusive: i % 5 === 0 ? sv : 0, servicesExclusive: i % 5 === 0 ? 0 : sv, products: pr });
      expect(paise(g.cgst)).toBe(paise(g.sgst));
      expect(paise(g.taxable) + paise(g.cgst) + paise(g.sgst)).toBe(paise(g.payable));
      expect(paise(g.services.payable) + paise(g.products.payable)).toBe(paise(g.payable));
      if (i % 5 === 0) expect(paise(g.services.payable)).toBe(paise(sv));
      if (cfg.products.inclusive) expect(paise(g.products.payable)).toBe(paise(pr));
      if (i % 5 !== 0) expect(paise(g.services.taxable)).toBe(paise(sv));
      // never more than a paisa away from the exact tax
      const idealTax = cfg.products.inclusive ? (pr * cfg.products.rate) / (100 + cfg.products.rate) : (pr * cfg.products.rate) / 100;
      expect(Math.abs(g.products.cgst + g.products.sgst - idealTax)).toBeLessThanOrEqual(0.0101);
    }
  });
});

describe('GSTIN', () => {
  it('accepts the registered GSTIN', () => {
    expect(isValidGstin('29AAOCC1889N1ZO')).toBe(true);
    expect(isValidGstin(' 29aaocc1889n1zo ')).toBe(true);
  });
  it('rejects typos and malformed numbers', () => {
    expect(isValidGstin('29AAOCC1889N1ZP')).toBe(false); // wrong check character
    expect(isValidGstin('29AAOCC1889N1Z')).toBe(false);
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin('ABAAOCC1889N1ZO')).toBe(false);
  });
});

describe('invoice numbers', () => {
  it('follow the April to March year in Indian time', () => {
    expect(financialYear(new Date('2026-04-01T00:30:00+05:30'))).toBe('26-27');
    expect(financialYear(new Date('2026-03-31T23:59:00+05:30'))).toBe('25-26');
    expect(financialYear(new Date('2027-03-31T23:30:00+05:30'))).toBe('26-27');
    expect(financialYear(new Date('2027-04-01T00:30:00+05:30'))).toBe('27-28');
    expect(financialYear(new Date('2026-11-04T10:00:00Z'))).toBe('26-27');
  });
  it('fit the 16 character limit and are in order', () => {
    expect(invoiceNumber('26-27', 1)).toBe('CV/26-27/000001');
    expect(invoiceNumber('26-27', 999999).length).toBeLessThanOrEqual(16);
  });
  it('prints half the rate on each of CGST and SGST', () => {
    expect(halfRate(5)).toBe('2.5');
    expect(halfRate(18)).toBe('9');
  });
});

describe('what a bill earns the salon (for staff revenue and commission)', () => {
  it('leaves out the tip and the GST', () => {
    const bill = {
      totalAmount: 1534,
      tipAmount: 40,
      gstServicesCgst: 22.5,
      gstServicesSgst: 22.5,
      gstProductsCgst: 41.87,
      gstProductsSgst: 41.87,
    };
    expect(netSales(bill as never)).toBe(1365.26);
    // a bill from before GST is unchanged
    expect(netSales({ totalAmount: 500, tipAmount: 50 } as never)).toBe(450);
  });
});

describe('services with and without GST in the price', () => {
  const cfg = { services: { rate: 5, inclusive: false }, products: { rate: 18, inclusive: false } };

  it('a haircut (price includes GST) and a facial (GST on top) on one bill', () => {
    // haircut ₹300 inclusive: taxable 285.72, 7.14 + 7.14. Facial ₹1,200 on top: 60 + 30 + 30 = ₹1,260
    const g = billGst(cfg, { servicesInclusive: 300, servicesExclusive: 1200, products: 0 });
    expect(g.services).toMatchObject({ net: 1500, taxable: 1485.72, cgst: 37.14, sgst: 37.14, payable: 1560 });
    expect(g.payable).toBe(1560);
    expect(g.cgst).toBe(g.sgst);
  });

  it('shows the price as included only when every service in the bill includes it', () => {
    expect(billGst(cfg, { servicesInclusive: 300, servicesExclusive: 0, products: 0 }).services.inclusive).toBe(true);
    expect(billGst(cfg, { servicesInclusive: 300, servicesExclusive: 100, products: 0 }).services.inclusive).toBe(false);
  });

  it('products added on top: ₹599 + 9% + 9% = ₹706.82', () => {
    expect(gstPart(599, { rate: 18, inclusive: false })).toMatchObject({ taxable: 599, cgst: 53.91, sgst: 53.91, payable: 706.82 });
  });

  it('shares a services discount between the three kinds to the paisa, never below zero', () => {
    expect(serviceBuckets({ inclusive: 300, exclusive: 1200, exempt: 0 }, 150)).toEqual({ inclusive: 270, exclusive: 1080, exempt: 0 });
    expect(serviceBuckets({ inclusive: 300, exclusive: 1200, exempt: 150 }, 165)).toEqual({ inclusive: 270, exclusive: 1080, exempt: 135 });
    const cases: [number, number, number, number][] = [[333.33, 100.01, 77.77, 61.1], [0, 500, 50, 0], [500, 0, 0, 50], [1, 1, 1, 2], [100, 100, 100, 300], [0.01, 0.01, 0.01, 0.02], [150, 0, 0, 0.01]];
    for (const [a, b, c, d] of cases) {
      const n = serviceBuckets({ inclusive: a, exclusive: b, exempt: c }, d);
      expect(paise(n.inclusive) + paise(n.exclusive) + paise(n.exempt)).toBe(paise(a) + paise(b) + paise(c) - paise(d));
      expect(Math.min(n.inclusive, n.exclusive, n.exempt)).toBeGreaterThanOrEqual(0);
    }
  });

  it('a service with NO_GST is charged as it is and never counts as taxable value', () => {
    // Haircut + Hair Wash & Style at ₹150 (NO_GST) with a ₹1,200 facial (GST on top)
    const g = billGst(cfg, { servicesInclusive: 0, servicesExclusive: 1200, servicesExempt: 150, products: 0 });
    expect(g.services).toMatchObject({ taxable: 1200, cgst: 30, sgst: 30, exempt: 150, net: 1350, payable: 1410 });
    expect(g.taxable).toBe(1200); // the ₹150 is not in it
    expect(g.payable).toBe(1410);
    // only no-GST services: nothing taxable, no tax, the price is the total
    const only = billGst(cfg, { servicesInclusive: 0, servicesExclusive: 0, servicesExempt: 150, products: 0 });
    expect(only).toMatchObject({ taxable: 0, cgst: 0, sgst: 0, tax: 0, payable: 150 });
    expect(only.services.exempt).toBe(150);
  });

  it('a service with no mode set is ADD_ON_TOP, and a custom service (no id) too', () => {
    const modes = { a: 'NO_GST', b: 'INCLUDED_IN_PRICE' } as const;
    expect(modeOfService(modes, 'a')).toBe('NO_GST');
    expect(modeOfService(modes, 'b')).toBe('INCLUDED_IN_PRICE');
    expect(modeOfService(modes, 'c')).toBe('ADD_ON_TOP');
    expect(modeOfService(modes, undefined)).toBe('ADD_ON_TOP');
  });

  it('haircuts and beard include GST by default; combos and the rest do not', () => {
    for (const name of ['Haircut', 'Zeta Haircut', 'Hair Cut', 'Beard Trim', 'Beard Spa', 'Beard']) expect(isHaircutOrBeard(name), name).toBe(true);
    for (const name of ['Haircut + Hair Wash & Style', 'The Essential', 'The Basic (Haircut + Beard Trim)', 'Hair Wash', 'Acne Control Facial', 'Head Massage', 'Colour']) {
      expect(isHaircutOrBeard(name), name).toBe(false);
    }
  });
});
