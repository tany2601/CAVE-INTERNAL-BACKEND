import { describe, it, expect } from 'vitest';
import { PaymentMode } from '@prisma/client';
import { aggregateFinance, formatMinutes, FinSession } from './finance.js';

const session = (over: Partial<FinSession>): FinSession => ({
  id: 's',
  branchId: 'b1',
  stylistId: 'u1',
  customerId: null,
  customerName: 'X',
  customerMobile: null,
  paymentMode: PaymentMode.CASH,
  subtotal: 0,
  discountAmount: 0,
  tipAmount: 0,
  totalAmount: 0,
  startedAt: null,
  createdAt: new Date(),
  closedAt: new Date(),
  isEdited: false,
  services: [],
  products: [],
  ...over,
});

describe('aggregateFinance', () => {
  it('separates service revenue, products, tips and payment modes', () => {
    const f = aggregateFinance(
      [
        // 300 service + 100 product - 40 discount + 50 tip, paid by GPay
        session({
          subtotal: 400,
          discountAmount: 40,
          tipAmount: 50,
          totalAmount: 410,
          paymentMode: PaymentMode.GPAY,
          products: [{ price: 100, paymentMode: PaymentMode.GPAY }],
        }),
        session({ subtotal: 150, totalAmount: 150, paymentMode: PaymentMode.CASH }),
      ],
      [],
      [],
    );
    expect(f.customers).toBe(2);
    expect(f.revenue).toBe(510); // 360 + 150, tips excluded
    expect(f.serviceRevenue).toBe(410); // 400-100-40 + 150
    expect(f.productSales).toBe(100);
    expect(f.productSalesGpay).toBe(100);
    expect(f.tips).toBe(50);
    expect(f.gpayCollected).toBe(410);
    expect(f.cashCollected).toBe(150);
  });

  it('computes net in hand after expenses, advances, payouts and withdrawals', () => {
    const f = aggregateFinance(
      [session({ subtotal: 1000, tipAmount: 100, totalAmount: 1100 })],
      [
        { branchId: 'b1', type: 'GENERAL_EXPENSE', amount: 200, paymentMode: PaymentMode.CASH, createdAt: new Date() },
        { branchId: 'b1', type: 'GENERAL_EXPENSE', amount: 50, paymentMode: PaymentMode.GPAY, createdAt: new Date() },
        { branchId: 'b1', type: 'EMPLOYEE_ADVANCE', amount: 100, paymentMode: PaymentMode.CASH, createdAt: new Date() },
      ],
      [
        { branchId: 'b1', kind: 'COMMISSION', amount: 150, paymentMode: PaymentMode.CASH, forDate: new Date() },
        { branchId: 'b1', kind: 'TIP_WITHDRAWAL', amount: 100, paymentMode: PaymentMode.CASH, forDate: new Date() },
      ],
    );
    expect(f.expensesCash).toBe(200);
    expect(f.expensesGpay).toBe(50);
    expect(f.advances).toBe(100);
    expect(f.commissionPaid).toBe(150);
    expect(f.tipWithdrawals).toBe(100);
    // 1000 revenue + 100 tips - 250 expenses - 100 advances - 150 commission - 100 withdrawals
    expect(f.netInHand).toBe(500);
  });

  it('is all zeros for an empty period', () => {
    expect(aggregateFinance([], [], []).netInHand).toBe(0);
  });
});

describe('formatMinutes', () => {
  it('formats hours and minutes, with a dash for none', () => {
    expect(formatMinutes(0)).toBe('—');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(308)).toBe('5h 8m');
  });
});
