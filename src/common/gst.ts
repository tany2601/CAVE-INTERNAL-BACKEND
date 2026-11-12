/**
 * GST on a bill. Everything is worked in whole paise so the result is exact, and CGST always equals SGST
 * (a salon bill is an intra-state supply: the tax is split in two equal halves, never IGST).
 *
 * Two ways a price can relate to tax:
 *  · inclusive: the price already contains GST (a printed MRP). The customer pays exactly the price; the tax is
 *    taken out of it. Each half is the exact tax divided by two, to the nearest paisa, and the taxable value is what remains,
 *    so that CGST == SGST and taxable + CGST + SGST == the price, to the paisa. The tax is never more than a paisa from
 *    the exact figure.
 *  · exclusive: GST is added on top of the price. Each half is the taxable value times half the rate, rounded to
 *    the nearest paisa.
 *
 * The same file is kept in the frontend (src/lib/gst.ts) so the billing screen and the server always agree.
 */

export interface GstSide {
  /** Total GST rate in percent (5 = CGST 2.5% + SGST 2.5%). */
  rate: number;
  /** True when the listed price already contains the GST. */
  inclusive: boolean;
}

/**
 * How GST works for one service:
 *  · ADD_ON_TOP: the menu price is the taxable value; GST is added to it.
 *  · INCLUDED_IN_PRICE: the customer pays the menu price and the GST is taken out of it.
 *  · NO_GST: no GST at all. The price is charged as it is and is not part of any taxable value.
 */
export type GstMode = 'ADD_ON_TOP' | 'INCLUDED_IN_PRICE' | 'NO_GST';
export const GST_MODES: GstMode[] = ['ADD_ON_TOP', 'INCLUDED_IN_PRICE', 'NO_GST'];

export interface GstConfig {
  enabled: boolean;
  gstin: string;
  /** Registered (legal) name printed on the invoice; empty means the branch name is used. */
  legalName: string;
  /** Rate for services (one rate for every service that has GST). */
  services: GstSide;
  products: GstSide;
  /** How GST works for each service (by Service id). A service that is not listed, and a custom service, is ADD_ON_TOP. */
  serviceModes: Record<string, GstMode>;
  /** SAC / HSN codes, printed when filled in. */
  servicesCode: string;
  productsCode: string;
}

export interface GstPart {
  /** The amount after discount, as listed (what GST is worked from). */
  net: number;
  rate: number;
  inclusive: boolean;
  taxable: number;
  cgst: number;
  sgst: number;
  /** What the customer pays for this part: taxable + CGST + SGST (+ any amount that carries no GST). */
  payable: number;
  /** Services only: what was charged on services with NO_GST (after discount). It is not part of `taxable`. */
  exempt: number;
}

export interface BillGst {
  services: GstPart;
  products: GstPart;
  taxable: number;
  cgst: number;
  sgst: number;
  tax: number;
  /** Services plus products as the customer pays them, before any tip. */
  payable: number;
}

const toPaise = (rupees: number) => Math.round(rupees * 100 + 1e-9);
const toRupees = (paise: number) => paise / 100;
/** Half-up integer division of non-negative integers. */
const divRound = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));

export function gstPart(net: number, side: GstSide): GstPart {
  const n = toPaise(Math.max(0, net));
  const rateBp = Math.round(Math.max(0, side.rate) * 100); // percent * 100
  let taxable: number;
  let half: number;
  let payable: number;
  if (n === 0 || rateBp === 0) {
    taxable = n;
    half = 0;
    payable = n;
  } else if (side.inclusive) {
    // Half of the exact tax, to the nearest paisa; the taxable value is whatever is left of the price.
    half = divRound(n * rateBp, 2 * (10000 + rateBp));
    taxable = n - 2 * half;
    payable = n;
  } else {
    taxable = n;
    half = divRound(n * rateBp, 20000);
    payable = n + 2 * half;
  }
  return {
    net: toRupees(n),
    rate: side.rate,
    inclusive: side.inclusive,
    taxable: toRupees(taxable),
    cgst: toRupees(half),
    sgst: toRupees(half),
    payable: toRupees(payable),
    exempt: 0,
  };
}

/** The GST mode of a service on a bill (a custom service has no id, and has GST added on top). */
export const modeOfService = (modes: Record<string, GstMode>, serviceId?: string | null): GstMode =>
  (serviceId && modes[serviceId]) || 'ADD_ON_TOP';

/**
 * The services discount shared between the three kinds of service (GST inside the price, GST on top, no GST) in
 * proportion to what each costs and to the paisa, so the three nets always add up to the services total minus
 * the discount and none goes below zero.
 */
export function serviceBuckets(
  gross: { inclusive: number; exclusive: number; exempt: number },
  discount: number,
): { inclusive: number; exclusive: number; exempt: number } {
  const w = [toPaise(Math.max(0, gross.inclusive)), toPaise(Math.max(0, gross.exclusive)), toPaise(Math.max(0, gross.exempt))];
  const total = w[0] + w[1] + w[2];
  if (total === 0) return { inclusive: 0, exclusive: 0, exempt: 0 };
  const d = Math.min(toPaise(Math.max(0, discount)), total);
  // Whole paise first, then the leftover paise go to the largest fractions (ties: inclusive, exclusive, exempt).
  const base = w.map((x) => Math.floor((d * x) / total));
  const frac = w.map((x) => (d * x) % total);
  let left = d - base[0] - base[1] - base[2];
  for (const i of [0, 1, 2].sort((a, b) => frac[b] - frac[a] || a - b)) {
    if (left <= 0) break;
    if (frac[i] > 0) {
      base[i] += 1;
      left -= 1;
    }
  }
  return { inclusive: toRupees(w[0] - base[0]), exclusive: toRupees(w[1] - base[1]), exempt: toRupees(w[2] - base[2]) };
}

/**
 * GST for one bill. The services are given in three amounts (after discount, before tip): those whose price includes
 * GST, those that have it added on top, and those with no GST. The first two share one rate and are shown together
 * as "services"; the amount with no GST is kept apart and never counts as taxable value.
 */
export function billGst(
  config: Pick<GstConfig, 'services' | 'products'>,
  amounts: { servicesInclusive: number; servicesExclusive: number; servicesExempt?: number; products: number },
): BillGst {
  const inc = gstPart(amounts.servicesInclusive, { rate: config.services.rate, inclusive: true });
  const exc = gstPart(amounts.servicesExclusive, { rate: config.services.rate, inclusive: false });
  const exempt = toPaise(Math.max(0, amounts.servicesExempt ?? 0));
  const add = (a: number, b: number) => toRupees(toPaise(a) + toPaise(b));
  const services: GstPart = {
    net: toRupees(toPaise(inc.net) + toPaise(exc.net) + exempt),
    rate: config.services.rate,
    inclusive: exc.net === 0 && inc.net > 0,
    taxable: add(inc.taxable, exc.taxable),
    cgst: add(inc.cgst, exc.cgst),
    sgst: add(inc.sgst, exc.sgst),
    payable: toRupees(toPaise(inc.payable) + toPaise(exc.payable) + exempt),
    exempt: toRupees(exempt),
  };
  const products = gstPart(amounts.products, config.products);
  const sum = (a: number, b: number) => toRupees(toPaise(a) + toPaise(b));
  const cgst = sum(services.cgst, products.cgst);
  const sgst = sum(services.sgst, products.sgst);
  return {
    services,
    products,
    taxable: sum(services.taxable, products.taxable),
    cgst,
    sgst,
    tax: sum(cgst, sgst),
    payable: sum(services.payable, products.payable),
  };
}

/**
 * Haircuts and beard services are the ones whose menu price includes GST until the admin says otherwise.
 * Combos ("The Essential", "Haircut + Beard Trim") and everything else have GST added on top.
 */
export const isHaircutOrBeard = (name: string): boolean => {
  const n = name.toLowerCase();
  if (/\(|\+|combo|package|\bthe \w+/.test(n)) return false;
  return /hair\s?cut|beard/.test(n);
};

/** The half of a total rate as printed on a bill: 5 -> "2.5", 18 -> "9". */
export const halfRate = (rate: number): string => String(Math.round((rate / 2) * 100) / 100);

const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A GSTIN is valid when it has the right shape and its last character matches the checksum of the first 14. */
export function isValidGstin(value: string): boolean {
  const g = value.trim().toUpperCase();
  if (!GSTIN_FORMAT.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const code = CHARS.indexOf(g[i]);
    const product = code * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === g[14];
}

/** State code from the first two digits (29 = Karnataka). */
export const GST_STATE_NAMES: Record<string, string> = {
  '29': 'Karnataka',
};

export const DEFAULT_GST: GstConfig = {
  enabled: true,
  gstin: '29AAOCC1889N1ZO',
  legalName: '',
  services: { rate: 5, inclusive: false },
  products: { rate: 18, inclusive: false },
  serviceModes: {},
  servicesCode: '',
  productsCode: '',
};

/** The financial year (April to March) a moment falls in, in Indian time, as "26-27". */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + 5.5 * 3600_000);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return `${yy(start)}-${yy(start + 1)}`;
}

/** Invoice numbers are one running series for the GSTIN per financial year, at most 16 characters (Rule 46). */
export const invoiceNumber = (fy: string, seq: number): string => `CV/${fy}/${String(seq).padStart(6, '0')}`;
