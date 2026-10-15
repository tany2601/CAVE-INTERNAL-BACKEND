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
          services: [{ serviceName: 'Haircut', price: 300 }],
          products: [{ price: 100, paymentMode: PaymentMode.GPAY }],
        }),
        session({
          subtotal: 150,
          totalAmount: 150,
          paymentMode: PaymentMode.CASH,
          services: [{ serviceName: 'Beard', price: 150 }],
        }),
      ],
      [],
      [],
    );
    expect(f.customers).toBe(2);
    expect(f.revenue).toBe(510); // 360 + 150, tips excluded
    // The 40 discount is shared 90% / 10% between services (300) and the product (100) it was given on.
    expect(f.serviceRevenue).toBe(420); // 300 × 0.9 + 150
    expect(f.productSales).toBe(90); // 100 × 0.9
    expect(f.productSalesGpay).toBe(90);
    expect(f.serviceRevenue + f.productSales).toBe(f.revenue);
    expect(f.tips).toBe(50);
    expect(f.gpayCollected).toBe(410);
    expect(f.cashCollected).toBe(150);
  });

  it('computes net in hand after expenses, advances, payouts and withdrawals', () => {
    const f = aggregateFinance(
      [session({ subtotal: 1000, tipAmount: 100, totalAmount: 1100, services: [{ serviceName: 'Colour', price: 1000 }] })],
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

  it('keeps product-only sales out of the customer count and never reports negative service revenue', () => {
    const f = aggregateFinance(
      [
        // 599 of products, 10% off (59.90), paid in cash: a walk-in who bought a product only.
        session({
          subtotal: 599,
          discountAmount: 59.9,
          totalAmount: 539.1,
          products: [{ price: 599, paymentMode: PaymentMode.CASH }],
        }),
        session({ subtotal: 200, totalAmount: 200, services: [{ serviceName: 'Haircut', price: 200 }] }),
      ],
      [],
      [],
    );
    expect(f.customers).toBe(1);
    expect(f.productOnlySales).toBe(1);
    expect(f.productOnlyRevenue).toBe(539.1);
    expect(f.revenue).toBe(739.1);
    expect(f.serviceRevenue).toBe(200);
    expect(f.productSales).toBe(539.1);
    expect(f.cashCollected).toBe(739.1);
  });

  it('always splits revenue exactly into services + products, whatever the discount', () => {
    const cases: [number, number, number][] = [
      [333.33, 66.67, 40],
      [1, 0.01, 0.5],
      [999.99, 0.01, 99.99],
      [250, 250, 100],
    ];
    for (const [services, products, discount] of cases) {
      const subtotal = services + products;
      const total = Math.round((subtotal - discount) * 100) / 100;
      const f = aggregateFinance(
        [
          session({
            subtotal,
            discountAmount: discount,
            totalAmount: total,
            services: [{ serviceName: 'S', price: services }],
            products: [{ price: products, paymentMode: PaymentMode.CASH }],
          }),
        ],
        [],
        [],
      );
      expect(Math.round((f.serviceRevenue + f.productSales) * 100)).toBe(Math.round(f.revenue * 100));
      expect(f.serviceRevenue).toBeGreaterThanOrEqual(0);
    }
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

  it('splits revenue exactly when the bill recorded the product discount apart from the service discount', () => {
    const bill = {
      id: 'x', branchId: 'b', stylistId: null, customerId: null, customerName: 'A', customerMobile: null, paymentMode: 'CASH',
      subtotal: 1500, discountAmount: 50, productDiscountAmount: 50, serviceDiscountAmount: 0, tipAmount: 0, totalAmount: 1450,
      startedAt: null, createdAt: new Date(), closedAt: new Date(), isEdited: false,
      services: [{ serviceName: 'Haircut', price: 1000 }],
      products: [{ price: 500, paymentMode: 'CASH' }],
    } as any;
    const f = aggregateFinance([bill], [], []);
    expect(f.revenue).toBe(1450);
    expect(f.productSales).toBe(450); // the whole ₹50 came off the products
    expect(f.serviceRevenue).toBe(1000);
    // the same bill without the split is shared in proportion (the older bills)
    const old = aggregateFinance([{ ...bill, productDiscountAmount: 0, serviceDiscountAmount: 0 }], [], []);
    expect(old.productSales).toBeCloseTo(483.33, 2);
    expect(old.revenue).toBe(1450);
  });
});
