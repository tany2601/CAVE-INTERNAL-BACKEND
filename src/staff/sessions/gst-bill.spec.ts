import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service.js';
import { DEFAULT_GST } from '../../common/gst.js';

const reqUser = { branchId: 'b1', role: 'MANAGER' };
const menu = [
  { id: 'p-hc', price: 300, serviceId: 'svc-hc', service: { name: 'Haircut' } },
  { id: 'p-wash', price: 100, serviceId: 'svc-wash', service: { name: 'Hair Wash' } },
  { id: 'p-nogst', price: 150, serviceId: 'svc-nogst', service: { name: 'Haircut + Hair Wash & Style' } },
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
    // a haircut's price includes GST; a hair wash has it added on top
    gstConfig = { ...DEFAULT_GST, serviceModes: { 'svc-hc': 'INCLUDED_IN_PRICE', 'svc-nogst': 'NO_GST' } };
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
    service = new SessionsService(prisma, undefined, { get: async () => gstConfig, getForBranch: async () => gstConfig } as any);
  });

  const open = () =>
    prisma.session.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1', status: SessionStatus.ACTIVE, isLoyaltyCounted: false, customerId: null, customer: null });
  const dto = (extra: any = {}) => ({ paymentMode: 'CASH', ...extra }) as any;
  const ids = (...x: string[]) => x.map((servicePricingId) => ({ servicePricingId }));

  it('a haircut (price includes GST): the customer pays ₹300, GST is taken out of it', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-hc') }));
    expect(claimed()).toMatchObject({
      subtotal: 300,
      gstin: '29AAOCC1889N1ZO',
      gstServicesRate: 5,
      gstServicesInclusive: true,
      gstServicesTaxable: 285.72,
      gstServicesCgst: 7.14,
      gstServicesSgst: 7.14,
      gstInclusiveServices: ['svc-hc'],
      gstExemptServices: ['svc-nogst'],
      gstServicesExempt: 0,
      totalAmount: 300,
    });
  });

  it('a hair wash (GST added on top): ₹100 + 2.50 + 2.50 = ₹105', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-wash') }));
    expect(claimed()).toMatchObject({ gstServicesInclusive: false, gstServicesTaxable: 100, gstServicesCgst: 2.5, gstServicesSgst: 2.5, totalAmount: 105 });
  });

  it('products have GST added on top: ₹599 + 9% + 9% = ₹706.82', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ productSales: [{ productName: 'Clay', price: 599 }] }));
    expect(claimed()).toMatchObject({
      gstProductsRate: 18,
      gstProductsInclusive: false,
      gstProductsTaxable: 599,
      gstProductsCgst: 53.91,
      gstProductsSgst: 53.91,
      totalAmount: 706.82,
    });
  });

  it('a custom service has GST added on top (the default for services not on the list)', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ customServices: [{ name: 'Special', price: 200 }] }));
    expect(claimed()).toMatchObject({ gstServicesTaxable: 200, gstServicesCgst: 5, totalAmount: 210 });
  });

  it('tax is worked on the discounted amounts, the discount is shared between the two kinds, and the tip carries none', async () => {
    open();
    await service.closeSession(
      reqUser,
      's1',
      dto({
        services: ids('p-hc', 'p-hc', 'p-hc', 'p-wash'), // 900 with GST inside + 100 with GST on top
        productSales: [{ productName: 'Clay', price: 599 }],
        serviceDiscount: { type: 'PERCENTAGE', value: 10 }, // 100: 90 off the haircuts, 10 off the wash
        productDiscount: { type: 'FIXED', value: 50 }, // 549 after
        tipAmount: 40,
      }),
    );
    expect(claimed()).toMatchObject({
      gstServicesTaxable: 861.42, // 771.42 (haircuts) + 90 (wash)
      gstServicesCgst: 21.54,
      gstServicesSgst: 21.54,
      gstProductsTaxable: 549,
      gstProductsCgst: 49.41,
      gstProductsSgst: 49.41,
      totalAmount: 1592.32, // 904.50 services + 647.82 products + 40 tip
    });
  });

  it('a service set to No GST: ₹150 charged as it is, not in the taxable value, next to a taxed service', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-nogst', 'p-wash') }));
    expect(claimed()).toMatchObject({
      subtotal: 250,
      gstServicesTaxable: 100, // the hair wash only
      gstServicesCgst: 2.5,
      gstServicesSgst: 2.5,
      gstServicesExempt: 150,
      gstExemptServices: ['svc-nogst'],
      totalAmount: 255, // 150 (no GST) + 100 + 5 GST
    });
  });

  it('only No GST services: no tax at all, and the bill is still a numbered invoice', async () => {
    open();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-nogst') }));
    expect(claimed()).toMatchObject({ gstServicesTaxable: 0, gstServicesCgst: 0, gstServicesSgst: 0, gstServicesExempt: 150, totalAmount: 150 });
  });

  it('a discount is shared with the No GST services too, and the tip and products add on', async () => {
    open();
    await service.closeSession(
      reqUser,
      's1',
      dto({
        services: ids('p-nogst', 'p-wash'), // 150 no GST + 100 on top
        productSales: [{ productName: 'Clay', price: 100 }],
        serviceDiscount: { type: 'PERCENTAGE', value: 10 }, // 25 off: 15 and 10
        tipAmount: 20,
      }),
    );
    expect(claimed()).toMatchObject({
      gstServicesExempt: 135,
      gstServicesTaxable: 90,
      gstServicesCgst: 2.25,
      gstServicesSgst: 2.25,
      gstProductsTaxable: 100,
      gstProductsCgst: 9,
      gstProductsSgst: 9,
      totalAmount: 367.5, // 135 no GST + 94.50 (90 + 4.50 GST) + 118 (100 + 18 GST) + 20 tip
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
    gstConfig = { ...DEFAULT_GST, services: { rate: 18, inclusive: true }, serviceModes: { 'svc-hc': 'INCLUDED_IN_PRICE' } }; // changed after the bill was issued
    prisma.session.findUnique.mockResolvedValue({
      id: 's1', branchId: 'b1', status: SessionStatus.COMPLETED, isFreeVisit: false,
      invoiceNumber: 'CV/26-27/000007', gstin: '29AAOCC1889N1ZO',
      gstServicesRate: 5, gstServicesInclusive: false, gstProductsRate: 18, gstProductsInclusive: false,
      gstInclusiveServices: [], // when it was issued, haircuts had GST added on top
      gstExemptServices: [],
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
    // the screen was showing ₹100 (no GST) while the server adds 5% to a hair wash
    await expect(service.closeSession(reqUser, 's1', dto({ services: ids('p-wash'), expectedTotal: 100 }))).rejects.toThrow(ConflictException);
    expect(tx.session.updateMany).not.toHaveBeenCalled();
    expect(tx.invoiceCounter.upsert).not.toHaveBeenCalled();
    await service.closeSession(reqUser, 's1', dto({ services: ids('p-wash'), expectedTotal: 105 }));
    expect(claimed().totalAmount).toBe(105);
  });
});
