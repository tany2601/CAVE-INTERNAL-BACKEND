import { createRequire } from 'node:module';
import type { Workbook, Worksheet, Cell } from 'exceljs';
import { ReportModel } from './report-model.js';
import { periodLabel } from './report-period.js';

// exceljs is a CommonJS package; load it the way Node ESM allows.
const ExcelJS = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');

const INR = '"₹"#,##0.00';
const DATE = 'dd mmm yyyy';
const DATETIME = 'dd mmm yyyy, hh:mm AM/PM';
const INK = 'FF0B0B10';
const GREY = 'FFF2F3F7';

interface Col {
  header: string;
  key: string;
  width: number;
  fmt?: string;
  align?: 'left' | 'right' | 'center';
}

/** A table sheet: styled header row, frozen, filterable, optional bold totals row. */
function table<T extends Record<string, unknown>>(
  wb: Workbook,
  name: string,
  cols: Col[],
  rows: T[],
  opts: { totals?: Partial<Record<string, number | string>>; empty?: string } = {},
): Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell: Cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });
  for (const r of rows) ws.addRow(r);
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.fmt) col.numFmt = c.fmt;
    if (c.align) col.alignment = { horizontal: c.align, vertical: 'top' };
  });
  head.eachCell((cell: Cell, i: number) => {
    cell.alignment = { vertical: 'middle', horizontal: cols[i - 1]?.align ?? 'left', wrapText: true };
  });
  if (rows.length === 0) {
    ws.addRow({ [cols[0].key]: opts.empty ?? 'Nothing in this period.' }).font = { italic: true, color: { argb: 'FF8A8A96' } };
  } else if (opts.totals) {
    const t = ws.addRow({ [cols[0].key]: 'TOTAL', ...opts.totals });
    t.font = { bold: true };
    t.eachCell({ includeEmpty: true }, (cell: Cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
      cell.border = { top: { style: 'thin', color: { argb: 'FF8A8A96' } } };
    });
  }
  if (rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + rows.length, column: cols.length } };
  return ws;
}

const sum = <T,>(rows: T[], pick: (r: T) => number) => Math.round(rows.reduce((a, r) => a + pick(r), 0) * 100) / 100;

/** The report as an Excel workbook: a summary first, then one sheet per question the owner would ask. */
export async function renderReportXlsx(m: ReportModel): Promise<Buffer> {
  const wb: Workbook = new ExcelJS.Workbook();
  wb.creator = 'CAVE Saloon';
  wb.created = m.generatedAt;
  const period = periodLabel(m.from === m.to ? 'daily' : 'weekly', m.from, m.to);
  const s = m.summary;

  // ── Summary ───────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 38 }, { width: 22 }, { width: 4 }, { width: 44 }];
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = "CAVE Men's Salon · Business report";
  ws.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  ws.getRow(1).height = 34;
  ws.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  ws.getCell('A2').value = 'Period';
  ws.getCell('B2').value = period;
  ws.getCell('A3').value = 'Created';
  ws.getCell('B3').value = new Date(m.generatedAt.getTime() + 5.5 * 3600_000);
  ws.getCell('B3').numFmt = DATETIME;
  ws.getCell('A4').value = 'All amounts in rupees (₹). Times are Indian time.';
  ws.getCell('A4').font = { italic: true, color: { argb: 'FF8A8A96' } };
  ws.getCell('B2').alignment = { horizontal: 'right' };
  ws.getCell('B3').alignment = { horizontal: 'right' };

  let row = 6;
  const block = (title: string, lines: [string, number | string, string?][]) => {
    const h = ws.getCell(`A${row}`);
    h.value = title.toUpperCase();
    h.font = { bold: true, size: 10, color: { argb: 'FF5B5B66' } };
    ws.getCell(`A${row}`).border = { bottom: { style: 'thin', color: { argb: 'FFCFCFD8' } } };
    ws.getCell(`B${row}`).border = { bottom: { style: 'thin', color: { argb: 'FFCFCFD8' } } };
    row += 1;
    for (const [label, value, fmt] of lines) {
      ws.getCell(`A${row}`).value = label;
      const c = ws.getCell(`B${row}`);
      c.value = value;
      if (typeof value === 'number') c.numFmt = fmt ?? INR;
      c.alignment = { horizontal: 'right' };
      row += 1;
    }
    row += 1;
  };
  const count = '#,##0';
  block('Money in', [
    ['Revenue (services + products, after discount)', s.revenue],
    ['   Services', s.serviceRevenue],
    ['   Products', s.productSales],
    ['Tips', s.tips],
    ['Discounts given', s.discounts],
    ['Collected in cash', s.cashCollected],
    ['Collected by GPay', s.gpayCollected],
  ]);
  block('Money out', [
    ['Expenses', s.expenses],
    ['Employee advances', s.advances],
    ['Commission paid to staff', s.commissionPaid],
    ['Tips handed to staff', s.tipWithdrawals],
  ]);
  block('Result', [['Net in hand (revenue + tips − everything paid out)', s.netInHand]]);
  block('Customers and visits', [
    ['Customers served', s.customers, count],
    ['Bills', s.bills, count],
    ['Average bill (before tip)', s.avgBill],
    ['Product-only sales (bills)', s.productOnlySales, count],
    ['Product-only revenue', s.productOnlyRevenue],
    ['Customers with a number: new', s.newCustomers, count],
    ['Customers with a number: returning', s.returningCustomers, count],
    ['Bills with no customer number', s.untrackedBills, count],
    ['Free haircuts given (6th visit)', s.freeHaircuts, count],
  ]);
  block('Highlights', [
    ['Most taken service', s.mostTakenService],
    ['Top branch by revenue', s.topBranch],
  ]);
  ws.getCell(`A${row}`).value =
    'Sheets: Branches · Daily · Services · Products · Stylists · Customers · Bills (every bill) · Expenses · Payouts';
  ws.getCell(`A${row}`).font = { italic: true, color: { argb: 'FF8A8A96' } };

  // ── Branches ──────────────────────────────────────────────────────────────
  const b = m.branches;
  table(
    wb,
    'Branches',
    [
      { header: 'Branch', key: 'name', width: 24 },
      { header: 'Customers', key: 'customers', width: 11, fmt: count, align: 'right' },
      { header: 'Bills', key: 'bills', width: 8, fmt: count, align: 'right' },
      { header: 'Revenue', key: 'revenue', width: 14, fmt: INR, align: 'right' },
      { header: 'Services', key: 'serviceRevenue', width: 14, fmt: INR, align: 'right' },
      { header: 'Products', key: 'productSales', width: 14, fmt: INR, align: 'right' },
      { header: 'Discounts', key: 'discounts', width: 13, fmt: INR, align: 'right' },
      { header: 'Tips', key: 'tips', width: 12, fmt: INR, align: 'right' },
      { header: 'Avg bill', key: 'avgBill', width: 12, fmt: INR, align: 'right' },
      { header: 'Cash', key: 'cashCollected', width: 14, fmt: INR, align: 'right' },
      { header: 'GPay', key: 'gpayCollected', width: 14, fmt: INR, align: 'right' },
      { header: 'Expenses', key: 'expenses', width: 13, fmt: INR, align: 'right' },
      { header: 'Advances', key: 'advances', width: 13, fmt: INR, align: 'right' },
      { header: 'Commission paid', key: 'commissionPaid', width: 15, fmt: INR, align: 'right' },
      { header: 'Tips handed out', key: 'tipWithdrawals', width: 15, fmt: INR, align: 'right' },
      { header: 'Net in hand', key: 'netInHand', width: 14, fmt: INR, align: 'right' },
    ],
    b as unknown as Record<string, unknown>[],
    {
      totals: {
        customers: sum(b, (r) => r.customers),
        bills: sum(b, (r) => r.bills),
        revenue: sum(b, (r) => r.revenue),
        serviceRevenue: sum(b, (r) => r.serviceRevenue),
        productSales: sum(b, (r) => r.productSales),
        discounts: sum(b, (r) => r.discounts),
        tips: sum(b, (r) => r.tips),
        avgBill: s.avgBill,
        cashCollected: sum(b, (r) => r.cashCollected),
        gpayCollected: sum(b, (r) => r.gpayCollected),
        expenses: sum(b, (r) => r.expenses),
        advances: sum(b, (r) => r.advances),
        commissionPaid: sum(b, (r) => r.commissionPaid),
        tipWithdrawals: sum(b, (r) => r.tipWithdrawals),
        netInHand: sum(b, (r) => r.netInHand),
      },
    },
  );

  // ── Daily ─────────────────────────────────────────────────────────────────
  table(
    wb,
    'Daily',
    [
      { header: 'Date', key: 'date', width: 16, fmt: DATE, align: 'left' },
      { header: 'Customers', key: 'customers', width: 11, fmt: count, align: 'right' },
      { header: 'Bills', key: 'bills', width: 8, fmt: count, align: 'right' },
      { header: 'Revenue', key: 'revenue', width: 14, fmt: INR, align: 'right' },
      { header: 'Tips', key: 'tips', width: 12, fmt: INR, align: 'right' },
      { header: 'Expenses + advances', key: 'expenses', width: 19, fmt: INR, align: 'right' },
      { header: 'Net in hand', key: 'net', width: 14, fmt: INR, align: 'right' },
    ],
    m.days.map((d) => ({ ...d, date: new Date(`${d.day}T00:00:00Z`) })),
    {
      totals: {
        customers: sum(m.days, (r) => r.customers),
        bills: sum(m.days, (r) => r.bills),
        revenue: sum(m.days, (r) => r.revenue),
        tips: sum(m.days, (r) => r.tips),
        expenses: sum(m.days, (r) => r.expenses),
        net: sum(m.days, (r) => r.net),
      },
    },
  );

  // ── Services / Products ───────────────────────────────────────────────────
  table(
    wb,
    'Services',
    [
      { header: 'Service', key: 'name', width: 46 },
      { header: 'Times taken', key: 'times', width: 13, fmt: count, align: 'right' },
      { header: 'Share of services', key: 'share', width: 17, fmt: '0.0"%"', align: 'right' },
      { header: 'Listed value', key: 'value', width: 14, fmt: INR, align: 'right' },
      { header: 'Given free', key: 'free', width: 11, fmt: count, align: 'right' },
    ],
    m.services,
    { totals: { times: sum(m.services, (r) => r.times), value: sum(m.services, (r) => r.value), free: sum(m.services, (r) => r.free) } },
  );
  table(
    wb,
    'Products',
    [
      { header: 'Product', key: 'name', width: 40 },
      { header: 'Units sold', key: 'qty', width: 12, fmt: count, align: 'right' },
      { header: 'Listed value', key: 'value', width: 14, fmt: INR, align: 'right' },
    ],
    m.products,
    { totals: { qty: sum(m.products, (r) => r.qty), value: sum(m.products, (r) => r.value) }, empty: 'No products sold in this period.' },
  );

  // ── Stylists ──────────────────────────────────────────────────────────────
  table(
    wb,
    'Stylists',
    [
      { header: 'Stylist', key: 'name', width: 24 },
      { header: 'Branch', key: 'branch', width: 22 },
      { header: 'Customers', key: 'customers', width: 11, fmt: count, align: 'right' },
      { header: 'Revenue', key: 'revenue', width: 14, fmt: INR, align: 'right' },
      { header: 'Avg ticket', key: 'avgTicket', width: 13, fmt: INR, align: 'right' },
      { header: 'Tips', key: 'tips', width: 12, fmt: INR, align: 'right' },
      { header: 'Commission earned', key: 'commission', width: 18, fmt: INR, align: 'right' },
      { header: 'Commission paid', key: 'commissionPaid', width: 16, fmt: INR, align: 'right' },
    ],
    m.stylists,
    {
      totals: {
        customers: sum(m.stylists, (r) => r.customers),
        revenue: sum(m.stylists, (r) => r.revenue),
        tips: sum(m.stylists, (r) => r.tips),
        commission: sum(m.stylists, (r) => r.commission),
        commissionPaid: sum(m.stylists, (r) => r.commissionPaid),
      },
    },
  );

  // ── Customers ─────────────────────────────────────────────────────────────
  table(
    wb,
    'Customers',
    [
      { header: 'Customer', key: 'name', width: 26 },
      { header: 'Phone', key: 'phone', width: 14 },
      { header: 'Branch(es)', key: 'branches', width: 22 },
      { header: 'New / returning', key: 'kind', width: 15 },
      { header: 'Visits in period', key: 'visits', width: 15, fmt: count, align: 'right' },
      { header: 'Spent (before tip)', key: 'spent', width: 18, fmt: INR, align: 'right' },
      { header: 'Tips', key: 'tips', width: 11, fmt: INR, align: 'right' },
      { header: 'Favourite service', key: 'favourite', width: 34 },
      { header: 'Visits so far (all time)', key: 'lifetimeVisits', width: 22, fmt: count, align: 'right' },
      { header: 'Paid visits to a free haircut', key: 'untilFree', width: 28, fmt: count, align: 'right' },
      { header: 'Last visit', key: 'lastVisit', width: 20, fmt: DATETIME, align: 'left' },
    ],
    m.customers.map((c) => ({ ...c, kind: c.isNew ? 'New' : 'Returning' })),
    { totals: { visits: sum(m.customers, (r) => r.visits), spent: sum(m.customers, (r) => r.spent), tips: sum(m.customers, (r) => r.tips) } },
  );

  // ── Bills ─────────────────────────────────────────────────────────────────
  table(
    wb,
    'Bills',
    [
      { header: 'Bill no.', key: 'no', width: 10 },
      { header: 'Closed at', key: 'closedAt', width: 22, fmt: DATETIME, align: 'left' },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Customer', key: 'customer', width: 24 },
      { header: 'Phone', key: 'phone', width: 14 },
      { header: 'Stylist', key: 'stylist', width: 18 },
      { header: 'Services', key: 'services', width: 50 },
      { header: 'Products', key: 'products', width: 28 },
      { header: 'Subtotal', key: 'subtotal', width: 13, fmt: INR, align: 'right' },
      { header: 'Discount', key: 'discount', width: 12, fmt: INR, align: 'right' },
      { header: 'Tip', key: 'tip', width: 11, fmt: INR, align: 'right' },
      { header: 'Total paid', key: 'total', width: 14, fmt: INR, align: 'right' },
      { header: 'Paid by', key: 'mode', width: 9 },
      { header: 'Free visit', key: 'free', width: 10 },
      { header: 'Edited', key: 'edited', width: 8 },
    ],
    m.bills.map((x) => ({ ...x, free: x.freeVisit ? 'Yes' : '', edited: x.edited ? 'Yes' : '' })),
    {
      totals: {
        subtotal: sum(m.bills, (r) => r.subtotal),
        discount: sum(m.bills, (r) => r.discount),
        tip: sum(m.bills, (r) => r.tip),
        total: sum(m.bills, (r) => r.total),
      },
    },
  ).eachRow((r) => (r.alignment = { vertical: 'top', wrapText: true }));

  // ── Expenses / Payouts ────────────────────────────────────────────────────
  table(
    wb,
    'Expenses',
    [
      { header: 'When', key: 'at', width: 22, fmt: DATETIME, align: 'left' },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Type', key: 'type', width: 11 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Employee', key: 'employee', width: 20 },
      { header: 'Amount', key: 'amount', width: 13, fmt: INR, align: 'right' },
      { header: 'Paid by', key: 'mode', width: 9 },
      { header: 'Added by', key: 'by', width: 20 },
    ],
    m.expenses,
    { totals: { amount: sum(m.expenses, (r) => r.amount) }, empty: 'No expenses or advances in this period.' },
  );
  table(
    wb,
    'Payouts',
    [
      { header: 'For day', key: 'forDate', width: 14 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Staff', key: 'staff', width: 24 },
      { header: 'Kind', key: 'kind', width: 16 },
      { header: 'Amount', key: 'amount', width: 13, fmt: INR, align: 'right' },
      { header: 'Paid by', key: 'mode', width: 9 },
      { header: 'Note', key: 'note', width: 34 },
    ],
    m.payouts,
    { totals: { amount: sum(m.payouts, (r) => r.amount) }, empty: 'No commission or tip payouts in this period.' },
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** File name shown in WhatsApp, e.g. "CAVE-report-2026-10-06.xlsx" or "CAVE-report-2026-09-28-to-2026-10-04.xlsx". */
export const reportFileName = (from: string, to: string) =>
  from === to ? `CAVE-report-${from}.xlsx` : `CAVE-report-${from}-to-${to}.xlsx`;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
