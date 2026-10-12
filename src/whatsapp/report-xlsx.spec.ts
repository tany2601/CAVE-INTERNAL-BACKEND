import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { PaymentMode } from '@prisma/client';
import { buildReportModel, ReportInput, ReportSession } from './report-model.js';
import { renderReportXlsx, reportFileName } from './report-xlsx.js';
import { reportRange } from './report-export.js';
import { aggregateFinance } from '../admin/reports/finance.js';

const ExcelJS = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');

// 6 Oct 2026, IST afternoon = 09:30–10:30 UTC
const at = (day: string, hh: number, mm = 0) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);

const sess = (o: Partial<ReportSession> & { id: string }): ReportSession => ({
  branchId: 'b1',
  stylistId: 'u1',
  customerId: 'c1',
  customerName: 'Ravi Kumar',
  customerMobile: '9876543210',
  paymentMode: PaymentMode.CASH,
  subtotal: 0,
  discountType: 'NONE',
  discountAmount: 0,
  tipAmount: 0,
  totalAmount: 0,
  startedAt: null,
  createdAt: at('2026-10-06', 9),
  closedAt: at('2026-10-06', 10),
  isEdited: false,
  isFreeVisit: false,
  services: [],
  products: [],
  customer: { createdAt: at('2026-09-01', 5), qualifyingCompletedSessionsCount: 3 },
  stylist: { name: 'Arjun' },
  ...o,
});

const input = (): ReportInput => ({
  from: '2026-10-05',
  to: '2026-10-06',
  generatedAt: at('2026-10-06', 16),
  branches: [
    { id: 'b1', name: 'CAVE Karkala' },
    { id: 'b2', name: 'CAVE Udupi' },
  ],
  sessions: [
    // 300 + 150 services, 249.5 product, 10% off, 50 tip
    sess({
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      subtotal: 699.5,
      discountType: 'PERCENTAGE',
      discountAmount: 69.95,
      tipAmount: 50,
      totalAmount: 679.55,
      services: [
        { serviceName: 'Haircut', price: 300 },
        { serviceName: 'Beard Trim', price: 150 },
      ],
      products: [{ productName: 'Hair Wax', price: 249.5, paymentMode: PaymentMode.GPAY }],
      paymentMode: PaymentMode.GPAY,
    }),
    // the customer's free visit: haircut is 0
    sess({
      id: 'aaaaaaaa-0000-0000-0000-000000000002',
      branchId: 'b2',
      customerId: 'c2',
      customerName: 'Meena',
      customerMobile: '+919000000001',
      closedAt: at('2026-10-05', 11),
      subtotal: 100,
      totalAmount: 100,
      isFreeVisit: true,
      services: [
        { serviceName: 'Haircut', price: 0 },
        { serviceName: 'Beard Trim', price: 100 },
      ],
      customer: { createdAt: at('2026-10-05', 4), qualifyingCompletedSessionsCount: 6 },
    }),
    // product-only walk-in
    sess({
      id: 'aaaaaaaa-0000-0000-0000-000000000003',
      customerId: null,
      customerName: 'Product sale',
      customerMobile: null,
      stylistId: null,
      stylist: null,
      customer: null,
      subtotal: 120,
      totalAmount: 120,
      products: [{ productName: 'Comb', price: 120, paymentMode: PaymentMode.CASH }],
    }),
  ],
  transactions: [
    { branchId: 'b1', type: 'GENERAL_EXPENSE', amount: 200.25, paymentMode: PaymentMode.CASH, createdAt: at('2026-10-06', 8), description: 'Towels', employee: null, createdBy: { name: 'Manager' } },
    { branchId: 'b2', type: 'EMPLOYEE_ADVANCE', amount: 500, paymentMode: PaymentMode.CASH, createdAt: at('2026-10-05', 8), description: 'Advance', employee: { name: 'Arjun' }, createdBy: { name: 'Manager' } },
  ],
  payouts: [
    { userId: 'u1', branchId: 'b1', kind: 'COMMISSION', amount: 100, paymentMode: PaymentMode.CASH, forDate: new Date('2026-10-06T00:00:00Z'), note: null, user: { name: 'Arjun' } },
    { userId: 'u1', branchId: 'b1', kind: 'TIP_WITHDRAWAL', amount: 20, paymentMode: PaymentMode.CASH, forDate: new Date('2026-10-06T00:00:00Z'), note: 'tips', user: { name: 'Arjun' } },
  ],
  stylists: [{ id: 'u1', name: 'Arjun', branchId: 'b1', commissionModel: 'FLAT_PERCENTAGE' as any, flatCommissionPercentage: 10, commissionSlabs: [] }],
  monthRevenue: new Map([['u1', 2000]]),
});

describe('report model', () => {
  const m = buildReportModel(input());

  it('summary matches the finance rules used everywhere else, to the paisa', () => {
    const i = input();
    const f = aggregateFinance(i.sessions, i.transactions, i.payouts);
    expect(m.summary).toMatchObject({ revenue: f.revenue, tips: f.tips, netInHand: f.netInHand, customers: 2, productOnlySales: 1, bills: 3 });
    // 679.55-50 + 100 + 120
    expect(m.summary.revenue).toBe(849.55);
    expect(m.summary.netInHand).toBe(Math.round((849.55 + 50 - 200.25 - 500 - 100 - 20) * 100) / 100);
  });

  it('branches add up to the summary', () => {
    const add = (k: 'revenue' | 'tips' | 'expenses' | 'advances' | 'netInHand' | 'customers' | 'bills') => Math.round(m.branches.reduce((a, b) => a + b[k], 0) * 100) / 100;
    for (const k of ['revenue', 'tips', 'expenses', 'advances', 'netInHand', 'customers', 'bills'] as const) expect(add(k)).toBe(m.summary[k]);
    expect(m.branches.map((b) => [b.name, b.bills])).toEqual([['CAVE Karkala', 2], ['CAVE Udupi', 1]]);
  });

  it('days add up to the summary and cover every day of the period', () => {
    expect(m.days.map((d) => d.day)).toEqual(['2026-10-05', '2026-10-06']);
    expect(Math.round(m.days.reduce((a, d) => a + d.revenue, 0) * 100) / 100).toBe(m.summary.revenue);
    expect(Math.round(m.days.reduce((a, d) => a + d.net, 0) * 100) / 100).toBe(m.summary.netInHand);
  });

  it('counts services, products, free haircuts and the most taken service', () => {
    // Haircut and Beard Trim were both taken twice; the higher value comes first
    expect(m.services[0]).toMatchObject({ name: 'Haircut', times: 2 });
    expect(m.services.find((s) => s.name === 'Haircut')).toMatchObject({ times: 2, free: 1, value: 300 });
    expect(m.products.map((p) => [p.name, p.qty, p.value])).toEqual([['Hair Wax', 1, 249.5], ['Comb', 1, 120]]);
    expect(m.summary.freeHaircuts).toBe(1);
  });

  it('lists every bill and customer with the right details', () => {
    expect(m.bills).toHaveLength(3);
    expect(Math.round(m.bills.reduce((a, b) => a + b.total, 0) * 100) / 100).toBe(899.55); // revenue + tips
    expect(m.bills.find((b) => b.no === '000002')?.services).toContain('Haircut (FREE)');
    expect(m.customers.map((c) => c.name)).toEqual(['Ravi Kumar', 'Meena']);
    expect(m.customers[1]).toMatchObject({ phone: '9000000001', isNew: true, untilFree: 5 - (6 % 6) });
    expect(m.customers[0]).toMatchObject({ isNew: false, visits: 1, untilFree: 2 });
    expect(m.summary).toMatchObject({ trackedCustomers: 2, newCustomers: 1, returningCustomers: 1, untrackedBills: 1 });
  });

  it('works out stylist commission and what was already paid', () => {
    expect(m.stylists).toHaveLength(1);
    expect(m.stylists[0]).toMatchObject({ name: 'Arjun', customers: 2, revenue: 729.55, tips: 50, commissionPaid: 100 });
    expect(m.stylists[0].commission).toBeCloseTo(72.955, 1); // 10% flat
  });

  it('rejects bad periods', () => {
    expect(reportRange('2026-10-06', undefined)).toEqual({ from: '2026-10-06', to: '2026-10-06' });
    expect(() => reportRange('2026-13-45', '2026-13-46')).toThrow();
    expect(() => reportRange('2026-10-06', '2026-10-01')).toThrow();
    expect(() => reportRange('2024-01-01', '2026-10-01')).toThrow();
    expect(reportFileName('2026-10-06', '2026-10-06')).toBe('CAVE-report-2026-10-06.xlsx');
  });
});

describe('report workbook', () => {
  it('is a real .xlsx with every sheet and the same figures as the model', async () => {
    const m = buildReportModel(input());
    const buf = await renderReportXlsx(m);
    expect(buf.subarray(0, 2).toString()).toBe('PK'); // zip container
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Branches', 'Daily', 'Services', 'Products', 'Stylists', 'Customers', 'Bills', 'Expenses', 'Payouts']);

    const sum = wb.getWorksheet('Summary')!;
    const cells = new Map<string, unknown>();
    sum.eachRow((r) => cells.set(String(r.getCell(1).value).trim(), r.getCell(2).value));
    expect(cells.get('Revenue (services + products, after discount)')).toBe(849.55);
    expect(cells.get('Tips')).toBe(50);
    expect(cells.get('Net in hand (revenue + tips − everything paid out)')).toBe(m.summary.netInHand);
    expect(cells.get('Most taken service')).toBe('Haircut (2×)');

    const bills = wb.getWorksheet('Bills')!;
    expect(bills.rowCount).toBe(1 + 3 + 1); // header + bills + total
    const totalRow = bills.getRow(bills.rowCount);
    expect(totalRow.getCell(1).value).toBe('TOTAL');
    expect(totalRow.getCell(12).value).toBe(899.55);
    expect(wb.getWorksheet('Branches')!.getRow(4).getCell(4).value).toBe(849.55);
  });

  it('still produces a tidy file when nothing happened', async () => {
    const empty = buildReportModel({ ...input(), sessions: [], transactions: [], payouts: [], stylists: [] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await renderReportXlsx(empty)) as unknown as ArrayBuffer);
    expect(wb.getWorksheet('Bills')!.getRow(2).getCell(1).value).toBe('Nothing in this period.');
    expect(empty.summary.revenue).toBe(0);
  });
});
