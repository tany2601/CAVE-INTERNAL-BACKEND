import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMode, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  BranchScopeQueryDto,
  CustomersReportQueryDto,
  MonthlyReportQueryDto,
  ReportRangeQueryDto,
  SessionsReportQueryDto,
} from './dto/report-queries.dto.js';
import { RevenueSummaryQueryDto } from './dto/revenue-summary-query.dto.js';
import {
  aggregateFinance,
  FinPayout,
  FinSession,
  FinTransaction,
  formatMinutes,
  SESSION_FIN_SELECT,
} from './finance.js';
import { computeCommission, round2 } from '../../common/commission.util.js';
import {
  dayDate,
  dayKey,
  minutesBetween,
  monthRange,
  periodRange,
  addDaysToKey,
  ReportPeriod,
} from '../../common/time.util.js';

const n = (v: unknown) => Number(v ?? 0);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── shared loaders ────────────────────────────────────────────────

  private rangeWhere(field: string, start: Date | null, end: Date | null) {
    if (!start && !end) return {};
    return { [field]: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } };
  }

  private loadSessions(start: Date | null, end: Date | null, branchId?: string) {
    return this.prisma.session.findMany({
      where: {
        status: SessionStatus.COMPLETED,
        ...(branchId ? { branchId } : {}),
        ...this.rangeWhere('closedAt', start, end),
      },
      select: SESSION_FIN_SELECT,
      orderBy: { closedAt: 'desc' },
    }) as unknown as Promise<FinSession[]>;
  }

  private loadTransactions(start: Date | null, end: Date | null, branchId?: string) {
    return this.prisma.branchTransaction.findMany({
      where: { ...(branchId ? { branchId } : {}), ...this.rangeWhere('createdAt', start, end) },
      select: { branchId: true, type: true, amount: true, paymentMode: true, createdAt: true, employeeId: true },
    }) as unknown as Promise<(FinTransaction & { employeeId: string | null })[]>;
  }

  private loadPayouts(start: Date | null, end: Date | null, branchId?: string) {
    return this.prisma.staffPayout.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(start || end
          ? {
              forDate: {
                ...(start ? { gte: dayDate(dayKey(start)) } : {}),
                ...(end ? { lt: dayDate(dayKey(end)) } : {}),
              },
            }
          : {}),
      },
      select: { branchId: true, userId: true, kind: true, amount: true, paymentMode: true, forDate: true },
    }) as unknown as Promise<(FinPayout & { userId: string })[]>;
  }

  private location(b: { address: string | null; city: string | null; state: string | null }) {
    return [b.address, b.city, b.state].filter(Boolean).join(', ') || 'No address added';
  }

  private rangeOf(query: { period: ReportPeriod; from?: string; to?: string }) {
    return periodRange(query.period, new Date(), { from: query.from, to: query.to });
  }

  // ── Overview ──────────────────────────────────────────────────────

  async getOverview(query: ReportRangeQueryDto) {
    const { start, end } = this.rangeOf(query);
    const monthStart = periodRange('THIS_MONTH').start as Date;
    const weekStart = periodRange('THIS_WEEK').start as Date;

    const [branches, sessions, monthSessions, weekSessions, transactions, payouts, active, staff, salaryPayments] =
      await Promise.all([
        this.prisma.branch.findMany({
          where: { isActive: true, ...(query.branchId ? { id: query.branchId } : {}) },
          orderBy: { createdAt: 'asc' },
        }),
        this.loadSessions(start, end, query.branchId),
        this.loadSessions(monthStart, null, query.branchId),
        this.loadSessions(weekStart, null, query.branchId),
        this.loadTransactions(monthStart, null, query.branchId),
        this.loadPayouts(start, end, query.branchId),
        this.prisma.session.groupBy({
          by: ['branchId'],
          where: { status: SessionStatus.ACTIVE, ...(query.branchId ? { branchId: query.branchId } : {}) },
          _count: { _all: true },
        }),
        this.prisma.user.findMany({
          where: {
            isActive: true,
            role: { name: { in: ['STYLIST', 'MANAGER'] } },
            ...(query.branchId ? { branchId: query.branchId } : {}),
          },
          select: { monthlySalary: true },
        }),
        this.prisma.salaryPayment.findMany({
          where: {
            createdAt: { gte: monthStart },
            ...(query.branchId ? { branchId: query.branchId } : {}),
          },
          select: { amount: true },
        }),
      ]);

    const total = aggregateFinance(sessions, [], payouts);
    const activeByBranch = new Map(active.map((a) => [a.branchId, a._count._all]));
    const salaryBill = staff.reduce((a, s) => a + n(s.monthlySalary), 0);
    const advances = transactions
      .filter((t) => t.type === 'EMPLOYEE_ADVANCE')
      .reduce((a, t) => a + n(t.amount), 0);
    const salaryPaid = salaryPayments.reduce((a, p) => a + n(p.amount), 0);
    const nowKey = dayKey();

    // Current week Monday → Sunday, revenue per day.
    const weekKeys = Array.from({ length: 7 }, (_, i) => addDaysToKey(dayKey(weekStart), i));
    const weekly = weekKeys.map((key, i) => ({
      day: WEEKDAYS[i],
      date: key,
      value: round2(
        weekSessions
          .filter((s) => s.closedAt && dayKey(s.closedAt) === key)
          .reduce((a, s) => a + n(s.totalAmount) - n(s.tipAmount), 0),
      ),
    }));

    const serviceCounts = new Map<string, number>();
    for (const s of sessions)
      for (const svc of s.services)
        serviceCounts.set(svc.serviceName, (serviceCounts.get(svc.serviceName) ?? 0) + 1);

    return {
      period: query.period,
      totals: {
        revenue: total.revenue,
        customers: total.customers,
        avgTicket: total.customers ? Math.round(total.revenue / total.customers) : 0,
        activeNow: [...activeByBranch.values()].reduce((a, b) => a + b, 0),
      },
      payroll: {
        month: `${MONTH_NAMES[Number(nowKey.slice(5, 7)) - 1]} ${nowKey.slice(0, 4)}`,
        salaryBill: round2(salaryBill),
        advances: round2(advances),
        salaryPaid: round2(salaryPaid),
        netPayable: round2(salaryBill - advances - salaryPaid),
      },
      branches: branches.map((b) => {
        const mine = sessions.filter((s) => s.branchId === b.id);
        const monthRevenue = monthSessions
          .filter((s) => s.branchId === b.id)
          .reduce((a, s) => a + n(s.totalAmount) - n(s.tipAmount), 0);
        return {
          id: b.id,
          name: b.name,
          location: this.location(b),
          revenue: round2(mine.reduce((a, s) => a + n(s.totalAmount) - n(s.tipAmount), 0)),
          customers: mine.length,
          active: activeByBranch.get(b.id) ?? 0,
          target: b.monthlyTarget,
          monthRevenue: round2(monthRevenue),
        };
      }),
      weekly,
      topServices: [...serviceCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
    };
  }

  // ── Branch detail ─────────────────────────────────────────────────

  async getBranchSummary(branchId: string, query: ReportRangeQueryDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found.');
    const { start, end } = this.rangeOf(query);
    const monthStart = periodRange('THIS_MONTH').start as Date;

    const [sessions, transactions, payouts, active, monthSessions] = await Promise.all([
      this.loadSessions(start, end, branchId),
      this.loadTransactions(start, end, branchId),
      this.loadPayouts(start, end, branchId),
      this.prisma.session.count({ where: { branchId, status: SessionStatus.ACTIVE } }),
      this.loadSessions(monthStart, null, branchId),
    ]);

    const monthRevenue = monthSessions.reduce((a, s) => a + n(s.totalAmount) - n(s.tipAmount), 0);
    return {
      branch: {
        id: branch.id,
        name: branch.name,
        location: this.location(branch),
        monthlyTarget: branch.monthlyTarget,
        imageUrl: branch.imageUrl,
        phone: branch.phone,
      },
      period: query.period,
      activeNow: active,
      monthRevenue: round2(monthRevenue),
      targetPercent: branch.monthlyTarget
        ? Math.round((monthRevenue / branch.monthlyTarget) * 100)
        : 0,
      finance: aggregateFinance(sessions, transactions, payouts),
    };
  }

  // ── Session stream ────────────────────────────────────────────────

  async getSessions(query: SessionsReportQueryDto) {
    const { start, end } = this.rangeOf(query);
    const sessions = await this.loadSessions(start, end, query.branchId);
    const branches = await this.prisma.branch.findMany({ select: { id: true, name: true } });
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    const staff = await this.prisma.user.findMany({ select: { id: true, name: true } });
    const staffName = new Map(staff.map((u) => [u.id, u.name]));

    const byBranch = new Map<string, number>();
    let cash = 0;
    let gpay = 0;
    let amount = 0;
    for (const s of sessions) {
      byBranch.set(s.branchId, (byBranch.get(s.branchId) ?? 0) + 1);
      amount += n(s.totalAmount);
      if (s.paymentMode === PaymentMode.GPAY) gpay += n(s.totalAmount);
      else cash += n(s.totalAmount);
    }

    const page = query.page;
    const slice = sessions.slice((page - 1) * query.limit, page * query.limit);
    return {
      period: query.period,
      total: sessions.length,
      page,
      limit: query.limit,
      totals: {
        count: sessions.length,
        amount: round2(amount),
        cash: round2(cash),
        gpay: round2(gpay),
      },
      byBranch: [...branchName.entries()]
        .filter(([id]) => !query.branchId || id === query.branchId)
        .map(([id, name]) => ({ branchId: id, name, customers: byBranch.get(id) ?? 0 })),
      data: slice.map((s) => ({
        id: s.id,
        closedAt: s.closedAt,
        customer: s.customerName,
        phone: s.customerMobile ?? '',
        branchId: s.branchId,
        branch: branchName.get(s.branchId) ?? '',
        stylist: s.stylistId ? (staffName.get(s.stylistId) ?? '—') : '—',
        services: [
          ...s.services.map((x) => x.serviceName),
          ...(s.products.length ? [`${s.products.length} product${s.products.length > 1 ? 's' : ''}`] : []),
        ].join(', '),
        amount: round2(n(s.totalAmount)),
        mode: s.paymentMode === PaymentMode.GPAY ? 'GPay' : 'Cash',
        tip: n(s.tipAmount),
        durationMin: minutesBetween(s.startedAt ?? s.createdAt, s.closedAt),
        status: s.isEdited ? 'Edited' : 'Original',
      })),
    };
  }

  // ── Customers & retention ─────────────────────────────────────────

  private async customerProfiles(branchId?: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.COMPLETED,
        customerId: { not: null },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        customerId: true,
        branchId: true,
        closedAt: true,
        totalAmount: true,
        services: { select: { serviceName: true } },
      },
      orderBy: { closedAt: 'asc' },
    });
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: [...new Set(sessions.map((s) => s.customerId as string))] } },
    });
    const branches = await this.prisma.branch.findMany({ select: { id: true, name: true } });
    const branchName = new Map(branches.map((b) => [b.id, b.name]));

    const profiles = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        visits: number;
        totalSpent: number;
        lastVisit: Date | null;
        firstVisit: Date | null;
        lastBranchId: string;
        services: Map<string, number>;
      }
    >();
    for (const c of customers)
      profiles.set(c.id, {
        id: c.id,
        name: c.name,
        phone: c.phone,
        visits: 0,
        totalSpent: 0,
        lastVisit: null,
        firstVisit: null,
        lastBranchId: '',
        services: new Map(),
      });
    for (const s of sessions) {
      const p = profiles.get(s.customerId as string);
      if (!p) continue;
      p.visits += 1;
      p.totalSpent += n(s.totalAmount);
      p.firstVisit = p.firstVisit ?? s.closedAt;
      p.lastVisit = s.closedAt;
      p.lastBranchId = s.branchId;
      for (const svc of s.services) p.services.set(svc.serviceName, (p.services.get(svc.serviceName) ?? 0) + 1);
    }
    return { profiles: [...profiles.values()], branchName };
  }

  async getCustomers(query: CustomersReportQueryDto) {
    const { profiles, branchName } = await this.customerProfiles(query.branchId);
    const stats = {
      totalProfiles: profiles.length,
      returning: profiles.filter((p) => p.visits > 1).length,
      avgLifetimeValue: profiles.length
        ? Math.round(profiles.reduce((a, p) => a + p.totalSpent, 0) / profiles.length)
        : 0,
      spendBands: [
        { label: '₹10k+', count: profiles.filter((p) => p.totalSpent >= 10000).length },
        { label: '₹5k–₹10k', count: profiles.filter((p) => p.totalSpent >= 5000 && p.totalSpent < 10000).length },
        { label: '₹1k–₹5k', count: profiles.filter((p) => p.totalSpent >= 1000 && p.totalSpent < 5000).length },
        { label: 'Below ₹1k', count: profiles.filter((p) => p.totalSpent < 1000).length },
      ],
    };

    const term = (query.search ?? '').trim().toLowerCase();
    const filtered = profiles.filter(
      (p) => !term || `${p.name} ${p.phone}`.toLowerCase().includes(term),
    );
    filtered.sort((a, b) =>
      query.sort === 'VISITS'
        ? b.visits - a.visits
        : query.sort === 'RECENT'
          ? (b.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0)
          : b.totalSpent - a.totalSpent,
    );

    return {
      stats,
      total: filtered.length,
      page: query.page,
      limit: query.limit,
      data: filtered.slice((query.page - 1) * query.limit, query.page * query.limit).map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        visits: p.visits,
        totalSpent: round2(p.totalSpent),
        favouriteService:
          [...p.services.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
        lastVisit: p.lastVisit,
        branch: branchName.get(p.lastBranchId) ?? '',
      })),
    };
  }

  async getRetention(query: BranchScopeQueryDto) {
    const { profiles, branchName } = await this.customerProfiles(query.branchId);
    const total = profiles.length;
    const returning = profiles.filter((p) => p.visits > 1).length;
    const window = (days: number, label: string) => {
      const since = Date.now() - days * 86_400_000;
      const active = profiles.filter((p) => (p.lastVisit?.getTime() ?? 0) >= since);
      const fresh = active.filter((p) => (p.firstVisit?.getTime() ?? 0) >= since).length;
      const back = active.length - fresh;
      return {
        label,
        rate: active.length ? Math.round((back / active.length) * 100) : 0,
        newCustomers: fresh,
        returning: back,
      };
    };
    return {
      totalCustomers: total,
      returning,
      retentionRate: total ? Math.round((returning / total) * 100) : 0,
      periods: [window(7, 'Last 7 days'), window(30, 'Last 30 days'), window(90, 'Last 90 days')],
      leaderboard: [...profiles]
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 50)
        .map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
          lastBranch: branchName.get(p.lastBranchId) ?? '',
          visits: p.visits,
        })),
    };
  }

  // ── Employees (payroll) & commission ──────────────────────────────

  private async staffPerformance(query: ReportRangeQueryDto) {
    const { start, end } = this.rangeOf(query);
    const monthStart = periodRange('THIS_MONTH').start as Date;
    const [staff, sessions, monthSessions, transactions, salaryPayments, payouts] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          isActive: true,
          role: { name: { in: ['STYLIST', 'MANAGER'] } },
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
        include: {
          branch: { select: { id: true, name: true } },
          role: { select: { name: true } },
          commissionSlabs: true,
        },
        orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
      }),
      this.loadSessions(start, end, query.branchId),
      this.loadSessions(monthStart, null, query.branchId),
      this.loadTransactions(start, end, query.branchId),
      this.prisma.salaryPayment.findMany({
        where: {
          ...(query.branchId ? { branchId: query.branchId } : {}),
          ...this.rangeWhere('createdAt', start, end),
        },
        select: { userId: true, amount: true },
      }),
      this.loadPayouts(start, end, query.branchId),
    ]);
    return { staff, sessions, monthSessions, transactions, salaryPayments, payouts };
  }

  async getEmployees(query: ReportRangeQueryDto) {
    const { staff, sessions, monthSessions, transactions, salaryPayments, payouts } =
      await this.staffPerformance(query);

    return {
      period: query.period,
      data: staff.map((u) => {
        const mine = sessions.filter((s) => s.stylistId === u.id);
        const revenue = mine.reduce((a, s) => a + n(s.totalAmount) - n(s.tipAmount), 0);
        const minutes = mine.reduce(
          (a, s) => a + minutesBetween(s.startedAt ?? s.createdAt, s.closedAt),
          0,
        );
        const mtd = monthSessions
          .filter((s) => s.stylistId === u.id)
          .reduce((a, s) => a + n(s.totalAmount) - n(s.tipAmount), 0);
        const advance = transactions
          .filter((t) => t.type === 'EMPLOYEE_ADVANCE' && t.employeeId === u.id)
          .reduce((a, t) => a + n(t.amount), 0);
        const paid = salaryPayments
          .filter((p) => p.userId === u.id)
          .reduce((a, p) => a + n(p.amount), 0);
        const salary = n(u.monthlySalary);
        const commission = computeCommission(u, revenue, mtd);
        const commissionPaid = payouts
          .filter((p) => p.userId === u.id && p.kind === 'COMMISSION')
          .reduce((a, p) => a + n(p.amount), 0);
        return {
          id: u.id,
          name: u.name,
          branchId: u.branchId,
          branch: u.branch?.name ?? '',
          role: u.role.name,
          photoUrl: u.photoUrl,
          daily: n(u.dailyRevenueTarget),
          salary,
          advance: round2(advance),
          paid: round2(paid),
          net: round2(salary - advance - paid),
          revenue: round2(revenue),
          customers: mine.length,
          ticket: mine.length ? Math.round(revenue / mine.length) : 0,
          minutesWorked: minutes,
          time: formatMinutes(minutes),
          commission: round2(commission),
          commissionPaid: round2(commissionPaid),
        };
      }),
    };
  }

  async getCommission(query: ReportRangeQueryDto) {
    const { data } = await this.getEmployees(query);
    const rows = data.map((e) => ({
      userId: e.id,
      name: e.name,
      branch: e.branch,
      customers: e.customers,
      revenue: e.revenue,
      payout: e.commission,
      paid: e.commissionPaid,
      pending: round2(Math.max(0, e.commission - e.commissionPaid)),
      status: e.commissionPaid > 0 && e.commissionPaid >= e.commission ? 'Paid' : 'Pending',
    }));
    const revenue = rows.reduce((a, r) => a + r.revenue, 0);
    const payout = rows.reduce((a, r) => a + r.payout, 0);
    return {
      period: query.period,
      totals: {
        pending: round2(rows.reduce((a, r) => a + r.pending, 0)),
        payout: round2(payout),
        revenue: round2(revenue),
        averageRate: revenue ? Math.round((payout / revenue) * 100) : 0,
      },
      data: rows,
    };
  }

  // ── Monthly tracker ───────────────────────────────────────────────

  async getMonthly(query: MonthlyReportQueryDto) {
    const today = dayKey();
    const year = query.year ?? Number(today.slice(0, 4));
    const month = query.month ?? Number(today.slice(5, 7));
    const { start, end, startKey, nextKey } = monthRange(year, month);

    const [branches, sessions, transactions, payouts] = await Promise.all([
      this.prisma.branch.findMany({
        where: { ...(query.branchId ? { id: query.branchId } : {}) },
        orderBy: { createdAt: 'asc' },
      }),
      this.loadSessions(start, end, query.branchId),
      this.loadTransactions(start, end, query.branchId),
      this.loadPayouts(start, end, query.branchId),
    ]);

    const row = (b: { id: string; name: string }, f: ReturnType<typeof aggregateFinance>) => ({
      id: b.id,
      name: b.name,
      serviceRevenue: f.serviceRevenue,
      products: f.productSales,
      cash: f.cashCollected,
      gpay: f.gpayCollected,
      commission: f.commissionPaid,
      expenses: f.expenses,
      advances: f.advances,
      tipWithdrawals: f.tipWithdrawals,
      net: f.netInHand,
    });

    const branchRows = branches.map((b) =>
      row(
        b,
        aggregateFinance(
          sessions.filter((s) => s.branchId === b.id),
          transactions.filter((t) => t.branchId === b.id),
          payouts.filter((p) => p.branchId === b.id),
        ),
      ),
    );
    const totalFinance = aggregateFinance(sessions, transactions, payouts);

    const daysInMonth = Math.round((Date.parse(`${nextKey}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) / 86_400_000);
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const key = addDaysToKey(startKey, i);
      const inDay = (d: Date | null) => !!d && dayKey(d) === key;
      const daySessions = sessions.filter((s) => inDay(s.closedAt));
      const dayTx = transactions.filter((t) => inDay(t.createdAt));
      const dayPayouts = payouts.filter((p) => dayKey(p.forDate) === key || p.forDate.toISOString().slice(0, 10) === key);
      const perBranch = branches
        .map((b) => {
          const f = aggregateFinance(
            daySessions.filter((s) => s.branchId === b.id),
            dayTx.filter((t) => t.branchId === b.id),
            dayPayouts.filter((p) => p.branchId === b.id),
          );
          return {
            branchId: b.id,
            name: b.name,
            revenue: f.revenue,
            customers: f.customers,
            cash: f.cashCollected,
            gpay: f.gpayCollected,
            products: f.productSales,
            expenses: f.expenses + f.advances,
            commission: f.commissionPaid,
            netInHand: f.netInHand,
          };
        })
        .filter((b) => b.customers > 0 || b.expenses > 0 || b.commission > 0);
      return {
        date: key,
        day: i + 1,
        revenue: round2(daySessions.reduce((a, s) => a + n(s.totalAmount) - n(s.tipAmount), 0)),
        branches: perBranch,
      };
    });

    return {
      year,
      month,
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      firstWeekday: new Date(`${startKey}T00:00:00Z`).getUTCDay(), // 0 = Sunday
      today,
      branches: branchRows,
      total: row({ id: 'total', name: 'Total' }, totalFinance),
      days,
    };
  }

  /** Completed-session revenue ("money in"), split by payment mode and branch. */
  async getRevenueSummary(query: RevenueSummaryQueryDto) {
    const period = query.period || 'THIS_MONTH';
    const { start: since, end: until } = periodRange(period as ReportPeriod, new Date(), {
      from: query.from,
      to: query.to,
    });

    const grouped = await this.prisma.session.groupBy({
      by: ['branchId', 'paymentMode'],
      where: {
        status: SessionStatus.COMPLETED,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(since || until
          ? { closedAt: { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) } }
          : {}),
      },
      _sum: { totalAmount: true, tipAmount: true },
      _count: { _all: true },
    });

    const branches = await this.prisma.branch.findMany({
      where: { id: { in: [...new Set(grouped.map((g) => g.branchId))] } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(branches.map((b) => [b.id, b.name]));

    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const byBranch = new Map<
      string,
      { branchId: string; name: string; collected: number; sessions: number }
    >();
    let cash = 0;
    let gpay = 0;
    let tips = 0;
    let sessions = 0;

    for (const g of grouped) {
      const collected = Number(g._sum.totalAmount ?? 0);
      tips += Number(g._sum.tipAmount ?? 0);
      sessions += g._count._all;
      if (g.paymentMode === PaymentMode.GPAY) gpay += collected;
      else cash += collected;
      const row = byBranch.get(g.branchId) ?? {
        branchId: g.branchId,
        name: nameOf.get(g.branchId) ?? 'Unknown',
        collected: 0,
        sessions: 0,
      };
      row.collected += collected;
      row.sessions += g._count._all;
      byBranch.set(g.branchId, row);
    }

    return {
      period,
      branchId: query.branchId ?? null,
      sessions,
      collected: round2(cash + gpay), // everything customers paid, tips included
      tips: round2(tips),
      revenue: round2(cash + gpay - tips), // service + product revenue
      cashCollected: round2(cash),
      gpayCollected: round2(gpay),
      byBranch: [...byBranch.values()].map((b) => ({
        ...b,
        collected: round2(b.collected),
      })),
    };
  }
}
