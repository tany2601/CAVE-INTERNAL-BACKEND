/** Pure helpers that turn bills and report figures into WhatsApp template parameters. */

/** "₹1,234.50" (Indian grouping); whole amounts drop the decimals. */
export const inr = (n: number): string => {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const text = Math.abs(v).toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${v < 0 ? '-' : ''}₹${text}`;
};

/** A line's price, or FREE for a ₹0 line (the free-haircut visit). */
export const priceLabel = (n: number): string => (Number(n) === 0 ? 'FREE' : inr(n));

/**
 * Lines with the same name and price become one line with a quantity ("Haircut ×3"), so a customer paying for
 * friends' haircuts sees one line and its total. A free line (price 0) stays apart from the paid ones.
 */
export function groupLines<T extends { name: string; price: number }>(lines: T[]): { name: string; price: number; qty: number; total: number }[] {
  const out: { name: string; price: number; qty: number; total: number }[] = [];
  for (const l of lines) {
    const found = out.find((o) => o.name === l.name && o.price === l.price);
    if (found) {
      found.qty += 1;
      found.total = Math.round((found.total + l.price) * 100) / 100;
    } else out.push({ name: l.name, price: l.price, qty: 1, total: l.price });
  }
  return out;
}

/** "Haircut" or "Haircut ×3" */
export const withQty = (name: string, qty: number) => (qty > 1 ? `${name} ×${qty}` : name);

/**
 * A phone number as WhatsApp wants it: country code + number, digits only.
 * 10-digit Indian numbers get 91 added; anything that can't be a real number returns null.
 */
export function toWhatsappNumber(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits[2])) return digits;
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits[1])) return `91${digits.slice(1)}`;
  return null;
}

/**
 * Template parameters can't contain new lines, tabs or runs of spaces, can't be empty, and are
 * limited in length, so every value goes through here.
 */
export function cleanParam(value: unknown, max = 900): string {
  const text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' · ')
    .replace(/ {2,}/g, ' ')
    .trim();
  const out = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  return out || '-';
}

export interface BillSession {
  id: string;
  customerName: string;
  paymentMode: string | null;
  discountAmount: unknown;
  tipAmount: unknown;
  totalAmount: unknown;
  branch?: { name: string } | null;
  services: { serviceName: string; price: unknown }[];
  products: { productName: string; price: unknown }[];
}

const num = (v: unknown) => Number(v ?? 0);

/** Short bill number printed on the message: the last 6 characters of the session id. */
/** Product-only sales are billed to a placeholder name; nobody should be thanked by it. */
export const isWalkInName = (name: string) => /^product sale$/i.test(name.trim());

export const billNumber = (id: string) => id.replace(/-/g, '').slice(-6).toUpperCase();

/**
 * Body variables for the `cave_bill` template, in order:
 *  1 customer name · 2 branch · 3 items (one line) · 4 total · 5 paid by · 6 bill number
 */
export function buildBillParams(s: BillSession): string[] {
  const lines = [
    ...groupLines(s.services.map((x) => ({ name: x.serviceName, price: num(x.price) }))).map((x) => `${withQty(x.name, x.qty)} ${priceLabel(x.total)}`),
    ...groupLines(s.products.map((x) => ({ name: x.productName, price: num(x.price) }))).map((x) => `${withQty(x.name, x.qty)} ${priceLabel(x.total)}`),
  ];
  if (num(s.discountAmount) > 0) lines.push(`Discount -${inr(num(s.discountAmount))}`);
  if (num(s.tipAmount) > 0) lines.push(`Tip ${inr(num(s.tipAmount))}`);
  return [
    isWalkInName(s.customerName) ? 'there' : cleanParam(s.customerName, 60),
    cleanParam(s.branch?.name ?? 'CAVE', 60),
    cleanParam(lines.join(', '), 700),
    cleanParam(inr(num(s.totalAmount)), 20),
    s.paymentMode === 'GPAY' ? 'GPay' : 'Cash',
    billNumber(s.id),
  ];
}

export interface DigestBranch {
  name: string;
  revenue: number;
  customers: number;
}

export interface Digest {
  /** "Daily", "Weekly" or "Monthly" */
  label: string;
  /** "Tue 6 Oct 2026", "29 Sep – 5 Oct 2026", "September 2026" */
  period: string;
  revenue: number;
  customers: number;
  tips: number;
  /** Expenses plus employee advances. */
  expenses: number;
  /** Commission and tip withdrawals handed to staff. */
  payouts: number;
  netInHand: number;
  branches: DigestBranch[];
}

/**
 * Body variables for the `cave_report` template, in order:
 *  1 report type · 2 period · 3 revenue · 4 customers · 5 tips · 6 expenses+advances ·
 *  7 staff payouts · 8 net in hand · 9 branch breakdown (one line)
 */
export function buildReportParams(d: Digest): string[] {
  const breakdown = d.branches.length
    ? d.branches.map((b) => `${b.name.replace(/^CAVE\s+/i, '')} ${inr(b.revenue)} (${b.customers})`).join(' · ')
    : 'No branches';
  return [
    cleanParam(d.label, 20),
    cleanParam(d.period, 40),
    cleanParam(inr(d.revenue), 20),
    String(d.customers),
    cleanParam(inr(d.tips), 20),
    cleanParam(inr(d.expenses), 20),
    cleanParam(inr(d.payouts), 20),
    cleanParam(inr(d.netInHand), 20),
    cleanParam(breakdown, 800),
  ];
}
