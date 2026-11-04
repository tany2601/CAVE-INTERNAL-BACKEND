import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service.js';
import { DEFAULT_GST } from '../../common/gst.js';

const reqUser = { branchId: 'b1', role: 'MANAGER' };
const menu = [
  { id: 'p-hc', price: 300, service: { name: 'Haircut' } },
  { id: 'p-wash', price: 100, service: { name: 'Hair Wash' } },
];

describe('GST on a closed bill', () => {
  let prisma: any;
  let tx: any;
  let service: SessionsService;
  let counter: number;
  let gstConfig: any;
  const claimed = () => tx.session.updateMany.mock.calls.at(-1)[0].data;
  const invoiceWritten = () => tx.session.update.mock.calls.map((c: any) => c[0].data.invoiceNumber).filter(Boolean);

  beforeEach(() => {
    counter = 0;
    gstConfig = { ...DEFAULT_GST };
    tx = {
      session: {
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: 's1', services: [], products: [] }),
      },
      customer: { update: vi.fn() },
      invoiceCounter: { upsert: vi.fn(async () => ({ last: ++counter })) },
      sessionService: { deleteMany: vi.fn(), createMany: vi.fn() },
      sessionProduct: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    prisma = {
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'B', isActive: true }) },
      session: { findUnique: vi.fn() },
      branchServicePricing: { findMany: vi.fn(async ({ where }: any) => menu.filter((m) => where.id.in.includes(m.id))) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    service = new SessionsService(prisma, undefined, { get: async () => gstConfig } as any);
  });

  const open = () =>
    prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.ACTIVE, isLoyaltyCounted: false, customerId: null, customer: null });
  const dto = (extra: any = {}) => ({ paymentMode: 'CASH', ...extra }) as any;
  const ids = (...x: string[]) => x.map((servicePricingId) => ({ servicePricingId }));

  it('services: 5% added on top. A ₹300 haircut is ₹315 (taxable 300, CGST 7.50, SGST 7.50)', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-hc') }));
    expect(claimed()).toMatchObject({
      subtotal: 300,
      gstin: '29AAOCC1889N1ZO',
      gstServicesRate: 5,
      gstServicesInclusive: false,
      gstServicesTaxable: 300,
      gstServicesCgst: 7.5,
      gstServicesSgst: 7.5,
      gstProductsTaxable: 0,
      totalAmount: 315,
    });
  });

  it('products: 18% inside the price. A ₹599 product costs ₹599; the tax is taken out of it', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ productSales: [{ productName: 'Clay', price: 599 }] }));
    expect(claimed()).toMatchObject({
      gstProductsRate: 18,
      gstProductsInclusive: true,
      gstProductsTaxable: 507.62,
      gstProductsCgst: 45.69,
      gstProductsSgst: 45.69,
      totalAmount: 599,
    });
  });

  it('tax is worked on the discounted amounts, and the tip carries none', async () => {
    open();
    await service.closeSession(
      reqUser,
      's1',
      dto({
        services: ids('p-hc', 'p-hc', 'p-hc', 'p-wash'), // 1000
        productSales: [{ productName: 'Clay', price: 599 }],
        serviceDiscount: { type: 'PERCENTAGE', value: 10 }, // 900 after
        productDiscount: { type: 'FIXED', value: 50 }, // 549 after
        tipAmount: 40,
      }),
    );
    expect(claimed()).toMatchObject({
      gstServicesTaxable: 900,
      gstServicesCgst: 22.5,
      gstServicesSgst: 22.5,
      gstProductsTaxable: 465.26,
      gstProductsCgst: 41.87,
      gstProductsSgst: 41.87,
      totalAmount: 945 + 549 + 40,
    });
  });

  it('gives the bill the next invoice number of the financial year, inside the same transaction', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-hc') }));
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-hc') }));
    const [first, second] = invoiceWritten();
    expect(first).toMatch(/^CV\/\d\d-\d\d\/000001$/);
    expect(second).toMatch(/^CV\/\d\d-\d\d\/000002$/);
    expect(first.length).toBeLessThanOrEqual(16);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('with GST switched off: no tax, no invoice number, total as before', async () => {
    gstConfig = { ...DEFAULT_GST, enabled: false };
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-hc') }));
    expect(claimed()).toMatchObject({ gstin: null, gstServicesCgst: 0, gstProductsCgst: 0, totalAmount: 300 });
    expect(tx.invoiceCounter.upsert).not.toHaveBeenCalled();
  });

  it('editing an issued invoice keeps its own rates, even if the settings changed since', async () => {
    gstConfig = { ...DEFAULT_GST, services: { rate: 18, inclusive: true } }; // changed after the bill was issued
    prisma.session.findUnique.mockResolvedValue({
      id: 's1', branchId: 'b1', status: SessionStatus.COMPLETED, isFreeVisit: false,
      invoiceNumber: 'CV/26-27/000007', gstin: '29AAOCC1889N1ZO',
      gstServicesRate: 5, gstServicesInclusive: false, gstProductsRate: 18, gstProductsInclusive: true,
    });
    await service.editSession(reqUser, 's1', dto({ services: ids('p-hc', 'p-hc') }));
    const data = tx.session.update.mock.calls.at(-1)[0].data;
    expect(data).toMatchObject({ gstServicesRate: 5, gstServicesTaxable: 600, gstServicesCgst: 15, gstServicesSgst: 15, totalAmount: 630, isEdited: true });
    expect(data.invoiceNumber).toBeUndefined(); // the number never changes
  });

  it('editing a bill that was closed before GST adds no GST to it', async () => {
    prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.COMPLETED, isFreeVisit: false, invoiceNumber: null });
    await service.editSession(reqUser, 's1', dto({ services: ids('p-hc') }));
    const data = tx.session.update.mock.calls.at(-1)[0].data;
    expect(data.totalAmount).toBe(300);
    expect(data.gstServicesCgst).toBeUndefined();
  });

  it('refuses a bill when the total on the screen is not the total the server works out', async () => {
    open();
    // the screen was showing ₹300 (no GST) while the server now adds 5%
    await expect(service.closeSession(reqUser, 's1', dto({ services: ids('p-hc'), expectedTotal: 300 }))).rejects.toThrow(ConflictException);
    expect(tx.session.updateMany).not.toHaveBeenCalled();
    expect(tx.invoiceCounter.upsert).not.toHaveBeenCalled();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-hc'), expectedTotal: 315 }));
    expect(claimed().totalAmount).toBe(315);
  });
});
