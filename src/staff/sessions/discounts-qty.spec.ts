import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service.js';

const reqUser = { branchId: 'b1', role: 'MANAGER' };
const menu = [
  { id: 'p-hc', price: 150, service: { name: 'Haircut' } },
  { id: 'p-beard', price: 100, service: { name: 'Beard Trim' } },
];

describe('quantities and separate discounts on a bill', () => {
  let prisma: any;
  let tx: any;
  let service: SessionsService;
  const saved = () => (tx.session.updateMany.mock.calls.at(-1) ?? tx.session.update.mock.calls.at(-1))[0].data;
  const lines = () => tx.sessionService.createMany.mock.calls.at(-1)[0].data as { serviceName: string; price: number }[];

  beforeEach(() => {
    tx = {
      session: {
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: 's1', services: [], products: [] }),
      },
      customer: { update: vi.fn().mockResolvedValue({ qualifyingCompletedSessionsCount: 1 }) },
      sessionService: { deleteMany: vi.fn(), createMany: vi.fn() },
      sessionProduct: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'B', isActive: true }) },
      session: { findUnique: vi.fn() },
      branchServicePricing: { findMany: vi.fn(async ({ where }: any) => menu.filter((m) => where.id.in.includes(m.id))) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    service = new SessionsService(prisma);
  });

  const open = (over: any = {}) =>
    prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.ACTIVE, isLoyaltyCounted: false, customerId: null, customer: null, ...over });
  const dto = (extra: any = {}) => ({ paymentMode: 'CASH', ...extra }) as any;
  const ids = (...x: string[]) => x.map((servicePricingId) => ({ servicePricingId }));

  it('bills three haircuts for a customer who pays for two friends too, and adds them up', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-hc', 'p-hc', 'p-hc', 'p-beard') }));
    expect(lines().map((l) => l.price)).toEqual([150, 150, 150, 100]);
    expect(saved()).toMatchObject({ subtotal: 550, totalAmount: 550 });
  });

  it('on a free visit only one of several haircuts is free', async () => {
    open({ customerId: 'c1', customer: { id: 'c1', qualifyingCompletedSessionsCount: 5 } });
    tx.customer.update.mockResolvedValue({ qualifyingCompletedSessionsCount: 6 });
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-hc', 'p-hc', 'p-hc') }));
    expect(lines().map((l) => l.price)).toEqual([0, 150, 150]);
    expect(saved().subtotal).toBe(300);
  });

  it('applies a services discount and a products discount separately and keeps both on the bill', async () => {
    open();
    await service.closeSession(
      reqUser,
      's1',
      dto({
        services: ids('p-hc', 'p-hc', 'p-beard'), // 400
        productSales: [{ productName: 'Wax', price: 500 }],
        serviceDiscount: { type: 'PERCENTAGE', value: 10 }, // 40
        productDiscount: { type: 'FIXED', value: 50 }, // 50
        tipAmount: 20,
      }),
    );
    expect(saved()).toMatchObject({
      subtotal: 900,
      discountAmount: 90,
      serviceDiscountType: 'PERCENTAGE',
      serviceDiscountValue: 10,
      serviceDiscountAmount: 40,
      productDiscountType: 'FIXED',
      productDiscountValue: 50,
      productDiscountAmount: 50,
      totalAmount: 830, // 900 - 90 + 20 tip
    });
  });

  it('refuses a product discount bigger than the products, and one on a bill with no products', async () => {
    open();
    await expect(service.closeSession(reqUser, 's1', dto({ services: ids('p-hc'), productSales: [{ productName: 'Wax', price: 100 }], productDiscount: { type: 'FIXED', value: 150 } }))).rejects.toThrow(/products total/);
    await expect(service.closeSession(reqUser, 's1', dto({ services: ids('p-hc'), productDiscount: { type: 'FIXED', value: 10 } }))).rejects.toThrow(BadRequestException);
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });

  it('still takes the older single discount, split in proportion', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-hc'), productSales: [{ productName: 'Wax', price: 50 }], discountType: 'PERCENTAGE', discountValue: 10 }));
    const d = saved();
    expect(d).toMatchObject({ subtotal: 200, discountAmount: 20, discountType: 'PERCENTAGE', discountValue: 10, totalAmount: 180 });
    expect(Math.round((d.serviceDiscountAmount + d.productDiscountAmount) * 100)).toBe(2000);
  });

  it('a manager edit can change quantities and the two discounts', async () => {
    prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.COMPLETED, isFreeVisit: false });
    await service.editSession(
      reqUser,
      's1',
      dto({ services: ids('p-hc', 'p-hc'), serviceDiscount: { type: 'FIXED', value: 30 }, productDiscount: { type: 'PERCENTAGE', value: 0 } }),
    );
    expect(lines().map((l) => l.price)).toEqual([150, 150]);
    expect(saved()).toMatchObject({ subtotal: 300, discountAmount: 30, serviceDiscountAmount: 30, productDiscountAmount: 0, totalAmount: 270, isEdited: true });
  });
});
