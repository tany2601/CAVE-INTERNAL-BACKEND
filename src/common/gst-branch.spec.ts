import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GstSettings } from './gst-settings.service.js';

describe('GST per branch', () => {
  let prisma: any;
  let rows: any[];
  let service: GstSettings;
  const business = { enabled: true, gstin: '29AAOCC1889N1ZO', legalName: '', services: { rate: 5, inclusive: false }, products: { rate: 18, inclusive: false }, inclusiveServiceIds: ['hc'], servicesCode: '', productsCode: '' };

  beforeEach(() => {
    rows = [];
    prisma = {
      appSetting: { findUnique: vi.fn().mockResolvedValue({ value: business }) },
      service: { findMany: vi.fn().mockResolvedValue([]) },
      branch: { findMany: vi.fn().mockResolvedValue([{ id: 'b1', name: 'CAVE One', isActive: true }, { id: 'b2', name: 'CAVE Two', isActive: true }]) },
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
    expect(cfg).toMatchObject({ enabled: true, services: { rate: 5 }, products: { rate: 18, inclusive: false }, inclusiveServiceIds: ['hc'] });
    const list = await service.listBranches();
    expect(list[0]).toMatchObject({ branchId: 'b1', customised: false, enabled: true, servicesRate: 5, productsRate: 18 });
  });

  it("one branch can switch GST off, change rates and choose its own services, without touching the others", async () => {
    await service.saveBranch('b2', { enabled: false, servicesRate: 12, productsRate: 28, productsInclusive: true, inclusiveServiceIds: ['beard', 'beard', 'spa'] });
    const b2 = await service.getForBranch('b2');
    expect(b2.enabled).toBe(false);
    expect(b2).toMatchObject({ services: { rate: 12 }, products: { rate: 28, inclusive: true }, inclusiveServiceIds: ['beard', 'spa'] });
    expect(b2.gstin).toBe('29AAOCC1889N1ZO'); // the business details are shared
    const b1 = await service.getForBranch('b1');
    expect(b1).toMatchObject({ enabled: true, services: { rate: 5 } });
    expect((await service.listBranches()).find((b) => b.branchId === 'b2')).toMatchObject({ customised: true, enabled: false });
  });

  it('the business master switch overrides a branch that is switched on', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: { ...business, enabled: false } });
    await service.saveBranch('b1', { enabled: true, servicesRate: 5, productsRate: 18, productsInclusive: false, inclusiveServiceIds: [] });
    expect((await service.getForBranch('b1')).enabled).toBe(false);
  });

  it('can be put back on the defaults', async () => {
    await service.saveBranch('b1', { enabled: false, servicesRate: 12, productsRate: 28, productsInclusive: true, inclusiveServiceIds: [] });
    await service.resetBranch('b1');
    expect(await service.getForBranch('b1')).toMatchObject({ enabled: true, services: { rate: 5 } });
  });
});
