import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GstSettings } from './gst-settings.service.js';

describe('GST per branch', () => {
  let prisma: any;
  let rows: any[];
  let modeRows: any[];
  let service: GstSettings;
  const business = { enabled: true, gstin: '29AAOCC1889N1ZO', legalName: '', services: { rate: 5, inclusive: false }, products: { rate: 18, inclusive: false }, serviceModes: { hc: 'INCLUDED_IN_PRICE' }, servicesCode: '', productsCode: '' };

  beforeEach(() => {
    rows = [];
    modeRows = [];
    prisma = {
      appSetting: { findUnique: vi.fn().mockResolvedValue({ value: business }) },
      service: { findMany: vi.fn().mockResolvedValue([{ id: 'hc', name: 'Haircut' }, { id: 'beard', name: 'Beard' }, { id: 'spa', name: 'Spa' }]) },
      branch: { findMany: vi.fn().mockResolvedValue([{ id: 'b1', name: 'CAVE One', isActive: true }, { id: 'b2', name: 'CAVE Two', isActive: true }]) },
      branchServiceGst: {
        findMany: vi.fn(async (args?: any) => modeRows.filter((r) => !args?.where || r.branchId === args.where.branchId)),
        deleteMany: vi.fn(async ({ where }: any) => {
          modeRows = modeRows.filter((r) => r.branchId !== where.branchId);
        }),
        createMany: vi.fn(async ({ data }: any) => {
          modeRows.push(...data);
        }),
      },
      $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
      branchGst: {
        findUnique: vi.fn(async ({ where }: any) => rows.find((r) => r.branchId === where.branchId) ?? null),
        findMany: vi.fn(async () => rows),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const at = rows.findIndex((r) => r.branchId === where.branchId);
          if (at >= 0) rows[at] = { ...rows[at], ...update };
          else rows.push({ ...create });
        }),
        deleteMany: vi.fn(async ({ where }: any) => {
          rows = rows.filter((r) => r.branchId !== where.branchId);
        }),
      },
    };
    service = new GstSettings(prisma);
  });

  it('a new branch follows the business defaults: 5% on services, 18% on products, switched on', async () => {
    const cfg = await service.getForBranch('b1');
    expect(cfg).toMatchObject({ enabled: true, services: { rate: 5 }, products: { rate: 18, inclusive: false }, serviceModes: { hc: 'INCLUDED_IN_PRICE' } });
    const list = await service.listBranches();
    expect(list[0]).toMatchObject({ branchId: 'b1', customised: false, enabled: true, servicesRate: 5, productsRate: 18 });
  });

  it("one branch can switch GST off, change rates and choose its own services, without touching the others", async () => {
    await service.saveBranch('b2', { enabled: false, servicesRate: 12, productsRate: 28, productsInclusive: true, serviceModes: { beard: 'INCLUDED_IN_PRICE', spa: 'NO_GST', ghost: 'NO_GST' } });
    const b2 = await service.getForBranch('b2');
    expect(b2.enabled).toBe(false);
    expect(b2).toMatchObject({ services: { rate: 12 }, products: { rate: 28, inclusive: true }, serviceModes: { beard: 'INCLUDED_IN_PRICE', spa: 'NO_GST' } });
    expect(b2.gstin).toBe('29AAOCC1889N1ZO'); // the business details are shared
    const b1 = await service.getForBranch('b1');
    expect(b1).toMatchObject({ enabled: true, services: { rate: 5 } });
    expect((await service.listBranches()).find((b) => b.branchId === 'b2')).toMatchObject({ customised: true, enabled: false });
  });

  it('the business master switch overrides a branch that is switched on', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: { ...business, enabled: false } });
    await service.saveBranch('b1', { enabled: true, servicesRate: 5, productsRate: 18, productsInclusive: false, serviceModes: {} });
    expect((await service.getForBranch('b1')).enabled).toBe(false);
  });

  it('can be put back on the defaults', async () => {
    await service.saveBranch('b1', { enabled: false, servicesRate: 12, productsRate: 28, productsInclusive: true, serviceModes: {} });
    await service.resetBranch('b1');
    expect(await service.getForBranch('b1')).toMatchObject({ enabled: true, services: { rate: 5 } });
  });
});
