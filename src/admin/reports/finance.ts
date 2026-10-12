import { PaymentMode } from '@prisma/client';
import { round2 } from '../../common/commission.util.js';

export interface FinSession {
  id: string;
  branchId: string;
  stylistId: string | null;
  customerId: string | null;
  customerName: string;
  customerMobile: string | null;
  paymentMode: PaymentMode | null;
  subtotal: unknown;
  discountAmount: unknown;
  tipAmount: unknown;
  totalAmount: unknown;
  startedAt: Date | null;
  createdAt: Date;
  closedAt: Date | null;
  isEdited: boolean;
  services: { serviceName: string; price: unknown }[];
  products: { price: unknown; paymentMode: PaymentMode }[];
}

export interface FinTransaction {
  branchId: string;
  type: 'GENERAL_EXPENSE' | 'EMPLOYEE_ADVANCE';
  amount: unknown;
  paymentMode: PaymentMode;
  createdAt: Date;
}

export interface FinPayout {
  branchId: string;
  kind: 'COMMISSION' | 'TIP_WITHDRAWAL';
  amount: unknown;
  paymentMode: PaymentMode;
  forDate: Date;
}

export const SESSION_FIN_SELECT = {
  id: true,
  branchId: true,
  stylistId: true,
  customerId: true,
  customerName: true,
  customerMobile: true,
  paymentMode: true,
  subtotal: true,
  discountAmount: true,
  tipAmount: true,
  totalAmount: true,
  startedAt: true,
  createdAt: true,
  closedAt: true,
  isEdited: true,
  services: { select: { serviceName: true, price: true } },
  products: { select: { price: true, paymentMode: true } },
} as const;

const n = (v: unknown) => Number(v ?? 0);

export interface Finance {
  /** Customers served: completed bills that include at least one service. */
  customers: number;
  /** Walk-in bills with products only (no services) and the revenue they brought in. */
  productOnlySales: number;
  productOnlyRevenue: number;
  /** Everything customers paid except tips (services + products, after discount). */
  revenue: number;
  serviceRevenue: number;
  productSalesCash: number;
  productSalesGpay: number;
  productSales: number;
  tips: number;
  cashCollected: number;
  gpayCollected: number;
  expensesCash: number;
  expensesGpay: number;
  expenses: number;
  advances: number;
  commissionPaid: number;
  tipWithdrawals: number;
  /** revenue + tips − expenses − advances − commission paid − tip withdrawals */
  netInHand: number;
}

export const emptyFinance = (): Finance => ({
  customers: 0,
  productOnlySales: 0,
  productOnlyRevenue: 0,
  revenue: 0,
  serviceRevenue: 0,
  productSalesCash: 0,
  productSalesGpay: 0,
  productSales: 0,
  tips: 0,
  cashCollected: 0,
  gpayCollected: 0,
  expensesCash: 0,
  expensesGpay: 0,
  expenses: 0,
  advances: 0,
  commissionPaid: 0,
  tipWithdrawals: 0,
  netInHand: 0,
});

export function aggregateFinance(
  sessions: FinSession[],
  transactions: FinTransaction[],
  payouts: FinPayout[],
): Finance {
  const f = emptyFinance();
  for (const s of sessions) {
    const subtotal = n(s.subtotal);
    const products = s.products.reduce((a, p) => a + n(p.price), 0);
    const revenue = n(s.totalAmount) - n(s.tipAmount);
    // A bill-level discount is shared between services and products in proportion to their value, so
    // neither line can go negative (e.g. a discounted products-only sale has no "service revenue").
    const keep = subtotal > 0 ? 1 - Math.min(1, n(s.discountAmount) / subtotal) : 1;
    if (s.services.length > 0) f.customers += 1;
    else {
      f.productOnlySales += 1;
      f.productOnlyRevenue += revenue;
    }
    f.revenue += revenue;
    f.serviceRevenue += (subtotal - products) * keep;
    f.tips += n(s.tipAmount);
    for (const p of s.products) {
      if (p.paymentMode === PaymentMode.GPAY) f.productSalesGpay += n(p.price) * keep;
      else f.productSalesCash += n(p.price) * keep;
    }
    if (s.paymentMode === PaymentMode.GPAY) f.gpayCollected += n(s.totalAmount);
    else f.cashCollected += n(s.totalAmount);
  }
  f.productSalesCash = round2(f.productSalesCash);
  f.productSalesGpay = round2(f.productSalesGpay);
  f.productSales = round2(f.productSalesCash + f.productSalesGpay);
  // Service revenue is whatever is left of revenue after products, so the two always add up to the paisa.
  f.serviceRevenue = Math.max(0, round2(round2(f.revenue) - f.productSales));
  for (const t of transactions) {
    if (t.type === 'EMPLOYEE_ADVANCE') f.advances += n(t.amount);
    else if (t.paymentMode === PaymentMode.GPAY) f.expensesGpay += n(t.amount);
    else f.expensesCash += n(t.amount);
  }
  f.expenses = f.expensesCash + f.expensesGpay;
  for (const p of payouts) {
    if (p.kind === 'TIP_WITHDRAWAL') f.tipWithdrawals += n(p.amount);
    else f.commissionPaid += n(p.amount);
  }
  f.netInHand =
    f.revenue + f.tips - f.expenses - f.advances - f.commissionPaid - f.tipWithdrawals;
  for (const k of Object.keys(f) as (keyof Finance)[]) f[k] = round2(f[k]);
  return f;
}

export const formatMinutes = (mins: number): string => {
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};
