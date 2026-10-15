import { PaymentMode } from '@prisma/client';
import { computeCommission, round2 } from '../common/commission.util.js';
import { addDaysToKey, dayKey, IST_OFFSET_MS } from '../common/time.util.js';
import { groupLines, withQty } from './whatsapp.format.js';
import { aggregateFinance, Finance, FinPayout, FinSession, FinTransaction } from '../admin/reports/finance.js';

const n = (v: unknown) => Number(v ?? 0);

/** What the report needs to know about one billed session (see ReportExport for how it is loaded). */
export interface ReportSession extends FinSession {
  discountType: string;
  isFreeVisit: boolean;
  services: { serviceName: string; price: unknown; isCustom?: boolean }[];
  products: { productName: string; price: unknown; paymentMode: PaymentMode }[];
  customer: { createdAt: Date; qualifyingCompletedSessionsCount: number } | null;
  stylist: { name: string } | null;
}

export interface ReportTransaction extends FinTransaction {
  description: string;
  employee: { name: string } | null;
  createdBy: { name: string } | null;
}

export interface ReportPayout extends FinPayout {
  userId: string;
  note: string | null;
  user: { name: string };
}

export interface ReportStylist {
  id: string;
  name: string;
  branchId: string | null;
  commissionModel: Parameters<typeof computeCommission>[0]['commissionModel'];
  flatCommissionPercentage: unknown;
  commissionSlabs: { minRevenue: unknown; commissionPercentage: unknown; slabOrder: number }[];
}

export interface ReportInput {
  from: string;
  to: string;
  generatedAt: Date;
  branches: { id: string; name: string }[];
  sessions: ReportSession[];
  transactions: ReportTransaction[];
  payouts: ReportPayout[];
  stylists: ReportStylist[];
  /** Each stylist's revenue from the 1st of the month of `to` up to the end of the period (for commission slabs). */
  monthRevenue: Map<string, number>;
}

export interface BranchRow extends Finance {
  name: string;
  bills: number;
  discounts: number;
  avgBill: number;
}

export interface ReportModel {
  from: string;
  to: string;
  generatedAt: Date;
  summary: Finance & {
    bills: number;
    discounts: number;
    avgBill: number;
    freeHaircuts: number;
    trackedCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    untrackedBills: number;
    mostTakenService: string;
    topBranch: string;
  };
  branches: BranchRow[];
  days: { day: string; bills: number; customers: number; revenue: number; tips: number; expenses: number; net: number }[];
  services: { name: string; times: number; value: number; free: number; share: number }[];
  products: { name: string; qty: number; value: number }[];
  stylists: {
    name: string;
    branch: string;
    customers: number;
    revenue: number;
    avgTicket: number;
    tips: number;
    commission: number;
    commissionPaid: number;
  }[];
  customers: {
    name: string;
    phone: string;
    branches: string;
    visits: number;
    spent: number;
    tips: number;
    favourite: string;
    lifetimeVisits: number;
    isNew: boolean;
    lastVisit: Date;
    untilFree: number;
  }[];
  bills: {
    no: string;
    closedAt: Date;
    branch: string;
    customer: string;
    phone: string;
    stylist: string;
    services: string;
    products: string;
    subtotal: number;
    discount: number;
    tip: number;
    total: number;
    mode: string;
    freeVisit: boolean;
    edited: boolean;
  }[];
  expenses: { at: Date; branch: string; type: string; description: string; employee: string; amount: number; mode: string; by: string }[];
  payouts: { forDate: string; branch: string; staff: string; kind: string; amount: number; mode: string; note: string }[];
}

/** An IST wall-clock time stored as if it were UTC, so a spreadsheet shows the time people saw on the till. */
export const istWallClock = (d: Date): Date => new Date(d.getTime() + IST_OFFSET_MS);

const tenDigits = (p?: string | null) => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
};

const bill = (id: string) => id.replace(/-/g, '').slice(-6).toUpperCase();

/** Every day from `from` to `to` (IST), inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDaysToKey(d, 1)) out.push(d);
  return out;
}

export function buildReportModel(input: ReportInput): ReportModel {
  const { sessions, transactions, payouts } = input;
  const branchName = new Map(input.branches.map((b) => [b.id, b.name]));
  const nameOf = (id: string) => branchName.get(id) ?? 'Branch';
  const money = (v: unknown) => round2(n(v));

  const total = aggregateFinance(sessions, transactions, payouts);
  const discounts = round2(sessions.reduce((a, s) => a + n(s.discountAmount), 0));

  // Branches
  const branches: BranchRow[] = input.branches.map((b) => {
    const ss = sessions.filter((s) => s.branchId === b.id);
    const f = aggregateFinance(
      ss,
      transactions.filter((t) => t.branchId === b.id),
      payouts.filter((p) => p.branchId === b.id),
    );
    return {
      ...f,
      name: b.name,
      bills: ss.length,
      discounts: round2(ss.reduce((a, s) => a + n(s.discountAmount), 0)),
      avgBill: ss.length ? round2(f.revenue / ss.length) : 0,
    };
  });

  // Day by day
  const sessionsByDay = new Map<string, ReportSession[]>();
  for (const s of sessions) {
    const k = dayKey(s.closedAt ?? s.createdAt);
    sessionsByDay.set(k, [...(sessionsByDay.get(k) ?? []), s]);
  }
  const txByDay = new Map<string, ReportTransaction[]>();
  for (const t of transactions) txByDay.set(dayKey(t.createdAt), [...(txByDay.get(dayKey(t.createdAt)) ?? []), t]);
  const payoutsByDay = new Map<string, ReportPayout[]>();
  for (const p of payouts) {
    const k = p.forDate.toISOString().slice(0, 10);
    payoutsByDay.set(k, [...(payoutsByDay.get(k) ?? []), p]);
  }
  const days = daysBetween(input.from, input.to).map((day) => {
    const ss = sessionsByDay.get(day) ?? [];
    const f = aggregateFinance(ss, txByDay.get(day) ?? [], payoutsByDay.get(day) ?? []);
    return {
      day,
      bills: ss.length,
      customers: f.customers,
      revenue: f.revenue,
      tips: f.tips,
      expenses: round2(f.expenses + f.advances),
      net: f.netInHand,
    };
  });

  // Services and products. A bill-level discount isn't split across lines here, so these are the
  // listed prices; the Summary and Branches sheets are the after-discount figures.
  const svc = new Map<string, { times: number; value: number; free: number }>();
  const prod = new Map<string, { qty: number; value: number }>();
  for (const s of sessions) {
    for (const l of s.services) {
      const cur = svc.get(l.serviceName) ?? { times: 0, value: 0, free: 0 };
      cur.times += 1;
      cur.value += n(l.price);
      if (n(l.price) === 0) cur.free += 1;
      svc.set(l.serviceName, cur);
    }
    for (const p of s.products) {
      const cur = prod.get(p.productName) ?? { qty: 0, value: 0 };
      cur.qty += 1;
      cur.value += n(p.price);
      prod.set(p.productName, cur);
    }
  }
  const serviceCount = [...svc.values()].reduce((a, v) => a + v.times, 0);
  const services = [...svc.entries()]
    .map(([name, v]) => ({
      name,
      times: v.times,
      value: round2(v.value),
      free: v.free,
      share: serviceCount ? round2((v.times / serviceCount) * 100) : 0,
    }))
    .sort((a, b) => b.times - a.times || b.value - a.value || a.name.localeCompare(b.name));
  const products = [...prod.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, value: round2(v.value) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  // Stylists
  const stylists = input.stylists
    .map((u) => {
      const mine = sessions.filter((s) => s.stylistId === u.id);
      const revenue = mine.reduce((a, s) => a + n(s.totalAmount) - n(s.tipAmount), 0);
      const customers = mine.filter((s) => s.services.length > 0).length;
      return {
        name: u.name,
        branch: u.branchId ? nameOf(u.branchId) : '',
        customers,
        revenue: round2(revenue),
        avgTicket: customers ? round2(revenue / customers) : 0,
        tips: round2(mine.reduce((a, s) => a + n(s.tipAmount), 0)),
        commission: round2(computeCommission(u, revenue, input.monthRevenue.get(u.id) ?? revenue)),
        commissionPaid: round2(
          payouts.filter((p) => p.kind === 'COMMISSION' && p.userId === u.id).reduce((a, p) => a + n(p.amount), 0),
        ),
      };
    })
    .filter((r) => r.customers > 0 || r.revenue > 0 || r.commissionPaid > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // Customers (only people we track by phone; walk-ins without a number are counted in the summary)
  const byCustomer = new Map<string, ReportSession[]>();
  let untrackedBills = 0;
  for (const s of sessions) {
    if (!s.customerId) {
      untrackedBills += 1;
      continue;
    }
    byCustomer.set(s.customerId, [...(byCustomer.get(s.customerId) ?? []), s]);
  }
  const startKey = input.from;
  const customers = [...byCustomer.values()]
    .map((ss) => {
      const last = ss.reduce((a, s) => ((s.closedAt ?? s.createdAt) > (a.closedAt ?? a.createdAt) ? s : a));
      const counts = new Map<string, number>();
      for (const s of ss) for (const l of s.services) counts.set(l.serviceName, (counts.get(l.serviceName) ?? 0) + 1);
      const favourite = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
      const lifetime = last.customer?.qualifyingCompletedSessionsCount ?? ss.length;
      return {
        name: last.customerName,
        phone: tenDigits(last.customerMobile),
        branches: [...new Set(ss.map((s) => nameOf(s.branchId)))].join(', '),
        visits: ss.length,
        spent: round2(ss.reduce((a, s) => a + n(s.totalAmount) - n(s.tipAmount), 0)),
        tips: round2(ss.reduce((a, s) => a + n(s.tipAmount), 0)),
        favourite,
        lifetimeVisits: lifetime,
        isNew: !!last.customer && dayKey(last.customer.createdAt) >= startKey,
        lastVisit: istWallClock(last.closedAt ?? last.createdAt),
        // Paid visits still to go before the free haircut (visits 1–5 paid, the 6th free); 0 = the next one is free.
        untilFree: 5 - (lifetime % 6),
      };
    })
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));

  const bills = [...sessions]
    .sort((a, b) => +(a.closedAt ?? a.createdAt) - +(b.closedAt ?? b.createdAt))
    .map((s) => ({
      no: bill(s.id),
      closedAt: istWallClock(s.closedAt ?? s.createdAt),
      branch: nameOf(s.branchId),
      customer: s.customerName,
      phone: tenDigits(s.customerMobile),
      stylist: s.stylist?.name ?? '',
      services: groupLines(s.services.map((l) => ({ name: l.serviceName, price: n(l.price) })))
        .map((l) => (l.price === 0 ? `${withQty(l.name, l.qty)} (FREE)` : withQty(l.name, l.qty)))
        .join(', '),
      products: groupLines(s.products.map((p) => ({ name: p.productName, price: n(p.price) })))
        .map((p) => withQty(p.name, p.qty))
        .join(', '),
      subtotal: money(s.subtotal),
      discount: money(s.discountAmount),
      tip: money(s.tipAmount),
      total: money(s.totalAmount),
      mode: s.paymentMode === PaymentMode.GPAY ? 'GPay' : 'Cash',
      freeVisit: s.isFreeVisit,
      edited: s.isEdited,
    }));

  const expenses = [...transactions]
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .map((t) => ({
      at: istWallClock(t.createdAt),
      branch: nameOf(t.branchId),
      type: t.type === 'EMPLOYEE_ADVANCE' ? 'Advance' : 'Expense',
      description: t.description,
      employee: t.employee?.name ?? '',
      amount: money(t.amount),
      mode: t.paymentMode === PaymentMode.GPAY ? 'GPay' : 'Cash',
      by: t.createdBy?.name ?? '',
    }));

  const payoutRows = [...payouts]
    .sort((a, b) => +a.forDate - +b.forDate)
    .map((p) => ({
      forDate: p.forDate.toISOString().slice(0, 10),
      branch: nameOf(p.branchId),
      staff: p.user.name,
      kind: p.kind === 'TIP_WITHDRAWAL' ? 'Tip withdrawal' : 'Commission',
      amount: money(p.amount),
      mode: p.paymentMode === PaymentMode.GPAY ? 'GPay' : 'Cash',
      note: p.note ?? '',
    }));

  const top = [...branches].sort((a, b) => b.revenue - a.revenue)[0];
  return {
    from: input.from,
    to: input.to,
    generatedAt: input.generatedAt,
    summary: {
      ...total,
      bills: sessions.length,
      discounts,
      avgBill: sessions.length ? round2(total.revenue / sessions.length) : 0,
      freeHaircuts: sessions.reduce((a, s) => a + s.services.filter((l) => n(l.price) === 0).length, 0),
      trackedCustomers: customers.length,
      newCustomers: customers.filter((c) => c.isNew).length,
      returningCustomers: customers.filter((c) => !c.isNew).length,
      untrackedBills,
      mostTakenService: services[0] ? `${services[0].name} (${services[0].times}×)` : '—',
      topBranch: top && top.revenue > 0 ? top.name : '—',
    },
    branches,
    days,
    services,
    products,
    stylists,
    customers,
    bills,
    expenses,
    payouts: payoutRows,
  };
}
