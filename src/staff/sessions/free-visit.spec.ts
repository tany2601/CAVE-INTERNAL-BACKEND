import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service.js';
import { freeHaircutIndex, isFreeVisitNext, isHaircutName } from '../../common/loyalty.js';

const reqUser = { branchId: 'b1', role: 'MANAGER' };
const menu = [
  { id: 'p-hc', price: 150, service: { name: 'Haircut + Hair Wash & Style' } },
  { id: 'p-hc2', price: 100, service: { name: 'Haircut' } },
  { id: 'p-beard', price: 100, service: { name: 'Beard Trim & Shape' } },
  { id: 'p-combo', price: 700, service: { name: 'The Basic (Haircut + Hair Wash & Style + Beard Trim + Head Massage)' } },
];

describe('free-haircut visit (every 6th)', () => {
  it('knows which visit is free and which line is the haircut', () => {
    expect([0, 1, 4, 5, 6, 10, 11].map(isFreeVisitNext)).toEqual([false, false, false, true, false, false, true]);
    expect(isHaircutName('Haircut')).toBe(true);
    expect(isHaircutName('Haircut + Hair Wash & Style')).toBe(true);
    expect(isHaircutName('The Basic (Haircut + Beard Trim)')).toBe(false);
    expect(isHaircutName('Beard Trim')).toBe(false);
    expect(freeHaircutIndex([{ name: 'Beard', price: 100 }, { name: 'Haircut + Wash', price: 150 }, { name: 'Haircut', price: 100 }])).toBe(2);
    expect(freeHaircutIndex([{ name: 'Haircut', price: 100 }, { name: 'Haircut', price: 100 }])).toBe(0);
    expect(freeHaircutIndex([{ name: 'Beard', price: 100 }])).toBe(-1);
  });

  let prisma: any;
  let tx: any;
  let service: SessionsService;
  const created = () => tx.sessionService.createMany.mock.calls.at(-1)[0].data as { serviceName: string; price: number }[];
  // Closing writes through updateMany (claiming the session); editing through update.
  const saved = () => (tx.session.updateMany.mock.calls.at(-1) ?? tx.session.update.mock.calls.at(-1))[0].data;

  beforeEach(() => {
    tx = {
      session: {
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: 's1', services: [], products: [] }),
      },
      // the visit count after this bill is counted: filled in by each test
      customer: { findUnique: vi.fn(), update: vi.fn() },
      sessionService: { deleteMany: vi.fn(), createMany: vi.fn() },
      sessionProduct: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'B', isActive: true }) },
      session: { findUnique: vi.fn() },
      branchServicePricing: {
        findMany: vi.fn(async ({ where }: any) => menu.filter((m) => where.id.in.includes(m.id))),
      },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    service = new SessionsService(prisma);
  });

  const active = (count: number) => {
    // the database reports the count after this bill's +1
    tx.customer.update.mockResolvedValue({ qualifyingCompletedSessionsCount: count + 1 });
    return activeSession(count);
  };
  const activeSession = (count: number) => ({
    id: 's1',
    branchId: 'b1',
    status: SessionStatus.ACTIVE,
    isLoyaltyCounted: false,
    customerId: 'c1',
    customer: { id: 'c1', qualifyingCompletedSessionsCount: count },
    customerMobile: '9876543210',
  });
  const dto = (ids: string[], extra: any = {}) => ({
    services: ids.map((servicePricingId) => ({ servicePricingId })),
    paymentMode: 'CASH',
    ...extra,
  });

  it('closes the 6th visit with the haircut at 0 and the rest charged', async () => {
    prisma.session.findUnique.mockResolvedValue(active(5));
    await service.closeSession(reqUser, 's1', dto(['p-hc', 'p-beard'], { tipAmount: 20 }) as any);
    expect(created()).toEqual(expect.arrayContaining([expect.objectContaining({ serviceName: 'Haircut + Hair Wash & Style', price: 0 }), expect.objectContaining({ serviceName: 'Beard Trim & Shape', price: 100 })]));
    expect(saved()).toMatchObject({ isFreeVisit: true, subtotal: 100, totalAmount: 120 });
  });

  it('charges everything on a paid visit', async () => {
    prisma.session.findUnique.mockResolvedValue(active(2));
    await service.closeSession(reqUser, 's1', dto(['p-hc', 'p-beard']) as any);
    expect(created().map((c) => c.price)).toEqual([150, 100]);
    expect(saved()).toMatchObject({ isFreeVisit: false, subtotal: 250, totalAmount: 250 });
  });

  it('never makes a combo package free, and a walk-in is never on a free visit', async () => {
    prisma.session.findUnique.mockResolvedValue(active(5));
    await service.closeSession(reqUser, 's1', dto(['p-combo']) as any);
    expect(created()[0].price).toBe(700);
    prisma.session.findUnique.mockResolvedValue({ ...active(5), customerId: null, customer: null });
    await service.closeSession(reqUser, 's1', dto(['p-hc']) as any);
    expect(saved()).toMatchObject({ isFreeVisit: false, subtotal: 150 });
  });

  it('frees the cheapest haircut only', async () => {
    prisma.session.findUnique.mockResolvedValue(active(5));
    await service.closeSession(reqUser, 's1', dto(['p-hc', 'p-hc2']) as any);
    expect(created().map((c) => c.price)).toEqual([150, 0]);
    expect(saved().subtotal).toBe(150);
  });

  it('a manager edit that adds the haircut later makes it 0 on a free visit', async () => {
    // Billed with a beard trim only, on the customer's free visit
    prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.COMPLETED, isFreeVisit: true });
    await service.editSession(reqUser, 's1', dto(['p-beard', 'p-hc'], { discountType: 'PERCENTAGE', discountValue: 10, tipAmount: 30 }) as any);
    expect(created().map((c) => c.price)).toEqual([100, 0]);
    // 100 - 10% = 90, + 30 tip
    expect(saved()).toMatchObject({ subtotal: 100, discountAmount: 10, totalAmount: 120, isEdited: true });
  });

  it('a manager edit on a paid visit charges the haircut', async () => {
    prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.COMPLETED, isFreeVisit: false });
    await service.editSession(reqUser, 's1', dto(['p-beard', 'p-hc']) as any);
    expect(created().map((c) => c.price)).toEqual([100, 150]);
    expect(saved()).toMatchObject({ subtotal: 250, totalAmount: 250 });
  });

  it('totals always add up: lines, products, discount and tip, to the paisa', async () => {
    prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.COMPLETED, isFreeVisit: true });
    const body = dto(['p-hc', 'p-beard'], {
      customServices: [{ name: 'Face wax', price: 99.99 }],
      productSales: [{ productName: 'Wax', price: 249.5 }, { productName: 'Comb', price: 33.33 }],
      discountType: 'PERCENTAGE',
      discountValue: 12.5,
      tipAmount: 17.17,
    });
    await service.editSession(reqUser, 's1', body as any);
    const lines = created().reduce((a, c) => a + c.price, 0); // 0 + 100 + 99.99
    const products = tx.sessionProduct.createMany.mock.calls.at(-1)[0].data.reduce((a: number, p: any) => a + p.price, 0);
    const s = saved();
    expect(Math.round((lines + products) * 100)).toBe(Math.round(s.subtotal * 100));
    expect(Math.round(s.discountAmount * 100)).toBe(Math.round(s.subtotal * 0.125 * 100));
    expect(Math.round((s.subtotal - s.discountAmount + s.tipAmount) * 100)).toBe(Math.round(s.totalAmount * 100));
  });
});
