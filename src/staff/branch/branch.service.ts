import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import {
  PaymentMode,
  PayoutKind,
  SessionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WhatsappSettings } from '../../whatsapp/whatsapp.settings.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { CreateStaffExpenseDto, UpdateStaffExpenseDto } from './dto/create-staff-expense.dto.js';
import {
  CloseDayDto,
  CreatePayoutDto,
  SetOpeningBalanceDto,
} from './dto/staff-ops.dto.js';
import { computeCommission, round2 } from '../../common/commission.util.js';
import { sortMenu } from '../../common/menu-order.js';
import { toSetting } from '../../admin/discounts/discount-settings.js';
import { isFreeVisitNext } from '../../common/loyalty.js';
import {
  dayDate,
  dayKey,
  addDaysToKey,
  dayStart,
  minutesBetween,
  periodRange,
  ReportPeriod,
} from '../../common/time.util.js';

const LOYALTY_TARGET = 6;
// Daily revenue target used for a stylist who has none set (override with DEFAULT_DAILY_TARGET).
const DEFAULT_DAILY_TARGET = Number(process.env.DEFAULT_DAILY_TARGET) || 9000;

const SESSION_INCLUDE = {
  branch: { select: { id: true, name: true, code: true } },
  stylist: { select: { id: true, name: true } },
  customer: true,
  services: true,
  products: true,
} as const;

/** The later of two instants; work time only counts from the start of the period being reported. */
const later = (a: Date | null, b: Date): Date | null => (a && a > b ? a : a ? b : null);

@Injectable()
export class BranchOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    @Optional() private readonly whatsappSettings?: WhatsappSettings,
  ) {}

  private async resolveBranch(reqUser: any) {
    const branchId = reqUser?.branchId;
    if (!reqUser || !branchId) {
      throw new UnauthorizedException(
        'Branch context could not be identified from authentication token.',
      );
    }
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch || !branch.isActive) {
      throw new BadRequestException('Branch is inactive or not found.');
    }
    return branch;
  }

  /** Active menu (branch pricing) available for billing. */
  async getMenu(reqUser: any) {
    const branch = await this.resolveBranch(reqUser);
    const pricing = await this.prisma.branchServicePricing.findMany({
      where: { branchId: branch.id, isActive: true, service: { isActive: true } },
      include: { service: true },
    });
    return {
      // Hair, Beard, Skin, Combo, then the rest; steady when a service is edited (see common/menu-order.ts)
      data: sortMenu(pricing).map((p) => ({
        id: p.id, // servicePricingId, what /close expects
        serviceId: p.serviceId,
        name: p.service.name,
        category: p.service.category ?? null,
        price: Number(p.price),
      })),
    };
  }

  /** Active retail products offered at checkout. */
  async getProducts() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      data: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        imageUrl: p.imageUrl ?? null,
        category: p.category ?? null,
      })),
    };
  }

  /**
   * Service counts per stylist over the last 30 days, used only for the "specialty" label. The label
   * changes slowly while dashboards refresh every few seconds, so it is cached for ten minutes per branch
   * instead of re-reading a month of service lines on every refresh.
   */
  private readonly specialtyCache = new Map<string, { at: number; counts: Map<string, Map<string, number>> }>();
  private async specialtyFor(branchId: string, since: Date) {
    const hit = this.specialtyCache.get(branchId);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.counts;
    const rows = await this.prisma.sessionService.findMany({
      where: {
        session: {
          branchId,
          status: SessionStatus.COMPLETED,
          closedAt: { gte: since },
          stylistId: { not: null },
        },
      },
      select: { serviceName: true, session: { select: { stylistId: true } } },
    });
    const counts = new Map<string, Map<string, number>>();
    for (const h of rows) {
      const sid = h.session.stylistId as string;
      const m = counts.get(sid) ?? new Map<string, number>();
      m.set(h.serviceName, (m.get(h.serviceName) ?? 0) + 1);
      counts.set(sid, m);
    }
    this.specialtyCache.set(branchId, { at: Date.now(), counts });
    return counts;
  }

  /**
   * Per-stylist stats for [start, now): sessions, revenue, tips, commission and
   * the services performed. Revenue excludes tips.
   */
  private async buildStylistStats(branchId: string, start: Date) {
    // One batch of independent queries instead of a chain of awaits.
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = periodRange('THIS_MONTH').start as Date;
    const [staff, completed, history, mtdRows, activeRows, tipPayouts] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          branchId,
          isActive: true,
          role: { name: { in: ['STYLIST', 'MANAGER'] } },
        },
        include: { commissionSlabs: { orderBy: { slabOrder: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.session.findMany({
        where: {
          branchId,
          status: SessionStatus.COMPLETED,
          closedAt: { gte: start },
          stylistId: { not: null },
        },
        select: {
          stylistId: true,
          totalAmount: true,
          tipAmount: true,
          paymentMode: true,
          startedAt: true,
          closedAt: true,
          services: { select: { serviceName: true } },
        },
      }),
      // Specialty = most-billed services per stylist over the last 30 days (cached, see specialtyFor).
      this.specialtyFor(branchId, monthAgo),
      // Month-to-date revenue drives MONTHLY_TARGET slab selection.
      this.prisma.session.groupBy({
        by: ['stylistId'],
        where: {
          branchId,
          status: SessionStatus.COMPLETED,
          closedAt: { gte: monthStart },
          stylistId: { not: null },
        },
        _sum: { totalAmount: true, tipAmount: true },
      }),
      // Sessions in the chair right now: counted, and their elapsed time adds to work time.
      this.prisma.session.findMany({
        where: { branchId, status: SessionStatus.ACTIVE, stylistId: { not: null } },
        select: { stylistId: true, startedAt: true, createdAt: true },
      }),
      // Tips already handed over to staff in this period.
      this.prisma.staffPayout.groupBy({
        by: ['userId'],
        where: { branchId, kind: PayoutKind.TIP_WITHDRAWAL, createdAt: { gte: start } },
        _sum: { amount: true },
      }),
    ]);
    const activeCounts = new Map<string, number>();
    const activeMinutes = new Map<string, number>();
    for (const r of activeRows) {
      const sid = r.stylistId as string;
      activeCounts.set(sid, (activeCounts.get(sid) ?? 0) + 1);
      activeMinutes.set(
        sid,
        (activeMinutes.get(sid) ?? 0) + minutesBetween(later(r.startedAt ?? r.createdAt, start), new Date()),
      );
    }
    const tipsPaid = new Map(tipPayouts.map((r) => [r.userId, Number(r._sum.amount ?? 0)]));

    const specialtyCounts = history;
    const mtd = new Map(
      mtdRows.map((r) => [
        r.stylistId as string,
        Number(r._sum.totalAmount ?? 0) - Number(r._sum.tipAmount ?? 0),
      ]),
    );

    return staff.map((u) => {
      const mine = completed.filter((s) => s.stylistId === u.id);
      const tips = mine.reduce((a, s) => a + Number(s.tipAmount), 0);
      const revenue = mine.reduce(
        (a, s) => a + Number(s.totalAmount) - Number(s.tipAmount),
        0,
      );
      // Cash vs GPay split. A bill has one payment mode, and its tip follows it.
      const split = { cashRevenue: 0, gpayRevenue: 0, cashTips: 0, gpayTips: 0 };
      let doneMinutes = 0;
      for (const s of mine) {
        const tip = Number(s.tipAmount);
        const rev = Number(s.totalAmount) - tip;
        if (s.paymentMode === 'GPAY') {
          split.gpayRevenue += rev;
          split.gpayTips += tip;
        } else {
          split.cashRevenue += rev;
          split.cashTips += tip;
        }
        doneMinutes += minutesBetween(later(s.startedAt, start), s.closedAt);
      }
      const paid = tipsPaid.get(u.id) ?? 0;
      const serviceCounts = new Map<string, number>();
      for (const s of mine)
        for (const svc of s.services)
          serviceCounts.set(svc.serviceName, (serviceCounts.get(svc.serviceName) ?? 0) + 1);

      const top = [...(specialtyCounts.get(u.id) ?? new Map()).entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name]) => name);

      return {
        id: u.id,
        name: u.name,
        specialty: top.join(' · '),
        available: true,
        activeSessions: activeCounts.get(u.id) ?? 0,
        completedToday: mine.length,
        revenueToday: round2(revenue),
        commission: round2(computeCommission(u, revenue, mtd.get(u.id) ?? 0)),
        tips: round2(tips),
        cashRevenue: round2(split.cashRevenue),
        gpayRevenue: round2(split.gpayRevenue),
        cashTips: round2(split.cashTips),
        gpayTips: round2(split.gpayTips),
        tipsWithdrawn: round2(paid),
        tipsAvailable: round2(Math.max(0, tips - paid)),
        workMinutes: doneMinutes + (activeMinutes.get(u.id) ?? 0),
        avgSessionMinutes: mine.length ? Math.round(doneMinutes / mine.length) : 0,
        // A target of 0 (or none set) falls back to the default so progress bars stay valid.
        dailyTarget: Number(u.dailyRevenueTarget ?? 0) || DEFAULT_DAILY_TARGET,
        services: [...serviceCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count })),
      };
    });
  }

  /** Stylist performance for a rolling period (Today / This week / This month). */
  async getStats(reqUser: any, period: Exclude<ReportPeriod, 'ALL_TIME'>) {
    const branch = await this.resolveBranch(reqUser);
    const start = periodRange(period).start as Date;
    const stylists = await this.buildStylistStats(branch.id, start);
    return { period, stylists };
  }

  private formatDay(row: any) {
    return {
      date: row ? dayKey(new Date(row.date)) : dayKey(),
      openingSet: !!row?.openingSetAt,
      openingCash: row ? Number(row.openingCash) : 0,
      openingGpay: row ? Number(row.openingGpay) : 0,
      closed: !!row?.closedAt,
      expectedCash: row?.expectedCash != null ? Number(row.expectedCash) : null,
      expectedGpay: row?.expectedGpay != null ? Number(row.expectedGpay) : null,
      closingCash: row?.closingCash != null ? Number(row.closingCash) : null,
      closingGpay: row?.closingGpay != null ? Number(row.closingGpay) : null,
      closedAt: row?.closedAt ?? null,
    };
  }

  /** Everything the tablet dashboards need for "today" in a single call. */
  async getToday(reqUser: any) {
    const isManager = reqUser.role === 'MANAGER';
    const key = dayKey();
    const since = dayStart(key);
    const branchId = reqUser?.branchId;
    if (!branchId) await this.resolveBranch(reqUser); // throws the "no branch context" error

    // Everything runs in one parallel batch (including the branch lookup): each database round trip
    // is ~100 ms away, so a chain of awaits here is what made sign-in feel slow.
    const [branch, active, closed, expenses, payouts, dayRow, stats, discountRow] = await Promise.all([
      this.resolveBranch(reqUser),
      this.prisma.session.findMany({
        relationLoadStrategy: 'join',
        where: { branchId, status: SessionStatus.ACTIVE },
        include: SESSION_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.session.findMany({
        relationLoadStrategy: 'join',
        where: {
          branchId,
          status: SessionStatus.COMPLETED,
          closedAt: { gte: since },
        },
        include: SESSION_INCLUDE,
        orderBy: { closedAt: 'desc' },
      }),
      isManager
        ? this.prisma.branchTransaction.findMany({
            where: { branchId: branchId, createdAt: { gte: since } },
            include: { createdBy: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      isManager
        ? this.prisma.staffPayout.findMany({
            where: { branchId: branchId, forDate: dayDate(key) },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.dailyBalance.findUnique({
        where: { branchId_date: { branchId: branchId, date: dayDate(key) } },
      }),
      this.buildStylistStats(branchId, since),
      // The discount the admin set for this branch (Admin → Discounts)
      this.prisma.branchDiscount?.findUnique({ where: { branchId } }) ?? null,
    ]);

    const paidBy = new Map<string, number>();
    for (const p of payouts)
      if (p.kind === PayoutKind.COMMISSION)
        paidBy.set(p.userId, (paidBy.get(p.userId) ?? 0) + Number(p.amount));

    return {
      branch: { id: branch.id, name: branch.name, code: branch.code },
      stylists: stats.map((s) => ({
        ...s,
        // Settled only when what was paid covers what has been earned so far (more can accrue after a payout).
        commissionPaid: s.commission > 0 && (paidBy.get(s.id) ?? 0) + 0.005 >= s.commission,
        commissionPaidAmount: round2(paidBy.get(s.id) ?? 0),
      })),
      activeSessions: active.map((s) => this.sessionsService.formatSessionOutput(s)),
      closedSessions: closed.map((s) => this.sessionsService.formatSessionOutput(s)),
      expenses: expenses.map((t: any) => ({
        id: t.id,
        type: t.type,
        description: t.description,
        amount: Number(t.amount),
        paymentMode: t.paymentMode,
        employeeId: t.employeeId ?? null,
        addedBy: t.createdBy?.name ?? 'Manager',
        createdAt: t.createdAt,
      })),
      payouts: payouts.map((p) => ({
        id: p.id,
        userId: p.userId,
        kind: p.kind,
        amount: Number(p.amount),
        paymentMode: p.paymentMode,
        createdAt: p.createdAt,
      })),
      day: this.formatDay(dayRow),
      // How bills reach customers, so the staff app knows whether to offer a WhatsApp button.
      whatsapp: (await this.whatsappSettings?.getDelivery()) ?? { mode: 'off', billFormat: 'text' },
      // The billing screen starts with this discount when the admin has switched it on.
      discount: toSetting(discountRow),
    };
  }

  /** Loyalty progress for the customer-facing loyalty screen. */
  async lookupCustomer(phone: string) {
    const digits = phone.replace(/\D/g, '');
    const normalized =
      digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;
    const customer = await this.prisma.customer.findUnique({
      where: { phone: normalized },
    });
    if (!customer) {
      return {
        found: false,
        visitCount: 0,
        loyaltyTarget: LOYALTY_TARGET,
        rewardReady: false,
      };
    }
    // Visits 1–5 are paid and the 6th has a free haircut, so the reward is "ready" after the 5th.
    const count = customer.qualifyingCompletedSessionsCount;
    const rewardReady = isFreeVisitNext(count);
    return {
      found: true,
      name: customer.name,
      visitCount: count % LOYALTY_TARGET,
      loyaltyTarget: LOYALTY_TARGET,
      rewardReady,
    };
  }

  async createExpense(reqUser: any, dto: CreateStaffExpenseDto) {
    const branch = await this.resolveBranch(reqUser);

    if (dto.type === TransactionType.EMPLOYEE_ADVANCE) {
      if (!dto.employeeId) {
        throw new BadRequestException(
          'employeeId is required for EMPLOYEE_ADVANCE.',
        );
      }
      const employee = await this.prisma.user.findUnique({
        where: { id: dto.employeeId },
      });
      if (!employee || !employee.isActive || employee.branchId !== branch.id) {
        throw new BadRequestException(
          'Employee is invalid, inactive, or does not belong to your branch.',
        );
      }
    } else if (dto.employeeId) {
      throw new BadRequestException(
        'employeeId is only allowed for EMPLOYEE_ADVANCE.',
      );
    }

    // Branch PIN tokens identify a credential, not a person, so attribute the
    // entry to the branch's active manager account.
    const author = await this.prisma.user.findFirst({
      where: { branchId: branch.id, isActive: true, role: { name: 'MANAGER' } },
      orderBy: { createdAt: 'asc' },
    });
    if (!author) {
      throw new BadRequestException(
        'This branch has no active manager account to attribute the expense to.',
      );
    }

    const tx = await this.prisma.branchTransaction.create({
      data: {
        branchId: branch.id,
        type: dto.type,
        description: dto.description,
        amount: dto.amount,
        paymentMode: dto.paymentMode as PaymentMode,
        employeeId: dto.employeeId ?? null,
        createdById: author.id,
      },
    });

    return {
      id: tx.id,
      type: tx.type,
      description: tx.description,
      amount: Number(tx.amount),
      paymentMode: tx.paymentMode,
      employeeId: tx.employeeId ?? null,
      addedBy: author.name,
      createdAt: tx.createdAt,
    };
  }

  /** Correct a wrong entry. Only this branch's expenses from today, and only while today's books are open. */
  async updateExpense(reqUser: any, id: string, dto: UpdateStaffExpenseDto) {
    const branch = await this.resolveBranch(reqUser);
    const tx = await this.prisma.branchTransaction.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } } },
    });
    if (
      !tx ||
      tx.branchId !== branch.id ||
      (tx.type !== TransactionType.GENERAL_EXPENSE && tx.type !== TransactionType.EMPLOYEE_ADVANCE)
    ) {
      throw new NotFoundException('Expense not found.');
    }
    const key = dayKey();
    if (tx.createdAt < dayStart(key)) {
      throw new ConflictException("Only today's expenses can be edited.");
    }
    const books = await this.prisma.dailyBalance.findUnique({
      where: { branchId_date: { branchId: branch.id, date: dayDate(key) } },
    });
    if (books?.closedAt) {
      throw new ConflictException("Today's books are already closed.");
    }
    const data: { description?: string; amount?: number; paymentMode?: PaymentMode } = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.paymentMode !== undefined) data.paymentMode = dto.paymentMode as PaymentMode;
    const updated = await this.prisma.branchTransaction.update({ where: { id }, data });
    return {
      id: updated.id,
      type: updated.type,
      description: updated.description,
      amount: Number(updated.amount),
      paymentMode: updated.paymentMode,
      employeeId: updated.employeeId ?? null,
      addedBy: tx.createdBy.name,
      createdAt: updated.createdAt,
    };
  }

  // ── Opening / closing balances ─────────────────────────────────────

  /** The day a books request is about: today, or an earlier day (up to 60 days back) for catching up. */
  private booksDate(requested?: string): string {
    const today = dayKey();
    if (!requested) return today;
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
      !Number.isNaN(Date.parse(`${requested}T00:00:00Z`)) &&
      dayKey(dayStart(requested)) === requested;
    if (!valid) throw new BadRequestException('That is not a valid date.');
    if (requested > today) throw new BadRequestException("You can't record books for a future day.");
    if (requested < addDaysToKey(today, -60)) {
      throw new BadRequestException('Books can only be recorded for the last 60 days.');
    }
    return requested;
  }

  async setOpeningBalance(reqUser: any, dto: SetOpeningBalanceDto) {
    const branch = await this.resolveBranch(reqUser);
    const date = dayDate(this.booksDate(dto.date));
    const existing = await this.prisma.dailyBalance.findUnique({
      where: { branchId_date: { branchId: branch.id, date } },
    });
    if (existing?.closedAt) {
      throw new ConflictException("Today's books are already closed.");
    }
    const row = await this.prisma.dailyBalance.upsert({
      where: { branchId_date: { branchId: branch.id, date } },
      create: {
        branchId: branch.id,
        date,
        openingCash: dto.cash,
        openingGpay: dto.gpay,
        openingSetAt: new Date(),
      },
      update: {
        openingCash: dto.cash,
        openingGpay: dto.gpay,
        openingSetAt: new Date(),
      },
    });
    return this.formatDay(row);
  }

  /** Cash / GPay the branch should be holding right now, per the ledger. */
  private async expectedBalances(branchId: string, key: string, opening: { cash: number; gpay: number }) {
    const since = dayStart(key);
    const until = dayStart(addDaysToKey(key, 1)); // the books for a day cover that IST day only
    const [sessions, expenses, payouts] = await Promise.all([
      this.prisma.session.groupBy({
        by: ['paymentMode'],
        where: { branchId, status: SessionStatus.COMPLETED, closedAt: { gte: since, lt: until } },
        _sum: { totalAmount: true },
      }),
      this.prisma.branchTransaction.groupBy({
        by: ['paymentMode'],
        where: { branchId, createdAt: { gte: since, lt: until } },
        _sum: { amount: true },
      }),
      this.prisma.staffPayout.groupBy({
        by: ['paymentMode'],
        where: { branchId, forDate: dayDate(key) },
        _sum: { amount: true },
      }),
    ]);
    const pick = (rows: any[], mode: PaymentMode, field: string) =>
      Number(rows.find((r) => r.paymentMode === mode)?._sum?.[field] ?? 0);
    const calc = (mode: PaymentMode, open: number) =>
      round2(
        open +
          pick(sessions, mode, 'totalAmount') -
          pick(expenses, mode, 'amount') -
          pick(payouts, mode, 'amount'),
      );
    return {
      expectedCash: calc(PaymentMode.CASH, opening.cash),
      expectedGpay: calc(PaymentMode.GPAY, opening.gpay),
      flow: {
        salesCash: round2(pick(sessions, PaymentMode.CASH, 'totalAmount')),
        salesGpay: round2(pick(sessions, PaymentMode.GPAY, 'totalAmount')),
        expensesCash: round2(pick(expenses, PaymentMode.CASH, 'amount')),
        expensesGpay: round2(pick(expenses, PaymentMode.GPAY, 'amount')),
        payoutsCash: round2(pick(payouts, PaymentMode.CASH, 'amount')),
        payoutsGpay: round2(pick(payouts, PaymentMode.GPAY, 'amount')),
      },
    };
  }

  async closeDay(reqUser: any, dto: CloseDayDto) {
    const branch = await this.resolveBranch(reqUser);
    const key = this.booksDate(dto.date);
    const date = dayDate(key);
    const existing = await this.prisma.dailyBalance.findUnique({
      where: { branchId_date: { branchId: branch.id, date } },
    });
    if (existing?.closedAt) {
      throw new ConflictException("Today's books are already closed.");
    }
    const { expectedCash, expectedGpay } = await this.expectedBalances(branch.id, key, {
      cash: Number(existing?.openingCash ?? 0),
      gpay: Number(existing?.openingGpay ?? 0),
    });
    const expected = { expectedCash, expectedGpay };
    const row = await this.prisma.dailyBalance.upsert({
      where: { branchId_date: { branchId: branch.id, date } },
      create: {
        branchId: branch.id,
        date,
        ...expected,
        closingCash: dto.actualCash,
        closingGpay: dto.actualGpay,
        closedAt: new Date(),
      },
      update: {
        ...expected,
        closingCash: dto.actualCash,
        closingGpay: dto.actualGpay,
        closedAt: new Date(),
      },
    });
    return this.formatDay(row);
  }

  /** One day's books: opening / closing state plus what the ledger says the till should hold. */
  async getDay(reqUser: any, date?: string) {
    const branch = await this.resolveBranch(reqUser);
    const key = this.booksDate(date);
    const row = await this.prisma.dailyBalance.findUnique({
      where: { branchId_date: { branchId: branch.id, date: dayDate(key) } },
    });
    const ledger = await this.expectedBalances(branch.id, key, {
      cash: Number(row?.openingCash ?? 0),
      gpay: Number(row?.openingGpay ?? 0),
    });
    return {
      ...this.formatDay(row ?? null),
      date: key,
      // Once closed, the figures stored at closing are the record; before that, the live ledger.
      expectedCash: row?.closedAt ? Number(row.expectedCash ?? ledger.expectedCash) : ledger.expectedCash,
      expectedGpay: row?.closedAt ? Number(row.expectedGpay ?? ledger.expectedGpay) : ledger.expectedGpay,
      flow: ledger.flow,
    };
  }

  /**
   * Recent days (up to a week back, today excluded) that had business but whose opening or closing
   * was never recorded, so a forgotten entry can be added the next day.
   */
  async getPendingDays(reqUser: any) {
    const branch = await this.resolveBranch(reqUser);
    const today = dayKey();
    const from = addDaysToKey(today, -7);
    const [sessions, transactions, payouts, rows] = await Promise.all([
      this.prisma.session.findMany({
        where: { branchId: branch.id, status: SessionStatus.COMPLETED, closedAt: { gte: dayStart(from), lt: dayStart(today) } },
        select: { closedAt: true },
      }),
      this.prisma.branchTransaction.findMany({
        where: { branchId: branch.id, createdAt: { gte: dayStart(from), lt: dayStart(today) } },
        select: { createdAt: true },
      }),
      this.prisma.staffPayout.findMany({
        where: { branchId: branch.id, forDate: { gte: dayDate(from), lt: dayDate(today) } },
        select: { forDate: true },
      }),
      this.prisma.dailyBalance.findMany({
        where: { branchId: branch.id, date: { gte: dayDate(from), lt: dayDate(today) } },
      }),
    ]);
    const busy = new Set<string>();
    for (const s of sessions) if (s.closedAt) busy.add(dayKey(s.closedAt));
    for (const t of transactions) busy.add(dayKey(t.createdAt));
    for (const p of payouts) busy.add(p.forDate.toISOString().slice(0, 10));
    const byDate = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
    const data = [...busy]
      .sort()
      .reverse()
      .map((date) => {
        const row = byDate.get(date);
        return { date, openingMissing: !row?.openingSetAt, closingMissing: !row?.closedAt };
      })
      .filter((d) => d.openingMissing || d.closingMissing);
    return { data };
  }

  // ── Commission payout ledger ───────────────────────────────────────

  async createPayout(reqUser: any, dto: CreatePayoutDto) {
    const branch = await this.resolveBranch(reqUser);
    const kind = dto.kind ?? PayoutKind.COMMISSION;
    const key = dayKey();

    const staff = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!staff || !staff.isActive || staff.branchId !== branch.id) {
      throw new BadRequestException(
        'Staff member is invalid, inactive, or does not belong to your branch.',
      );
    }

    let amount = dto.amount;
    if (kind === PayoutKind.COMMISSION) {
      // Commission keeps accruing after a payout (more customers, more revenue), so pay only what is
      // still owed: earned so far minus what was already handed over today.
      const [stats, paidRows] = await Promise.all([
        this.buildStylistStats(branch.id, dayStart(key)),
        this.prisma.staffPayout.aggregate({
          where: { branchId: branch.id, userId: staff.id, kind, forDate: dayDate(key) },
          _sum: { amount: true },
        }),
      ]);
      const earned = stats.find((s) => s.id === staff.id)?.commission ?? 0;
      const owed = round2(earned - Number(paidRows._sum.amount ?? 0));
      if (owed <= 0) {
        throw new ConflictException("This stylist's commission is already settled today.");
      }
      if (amount === undefined) amount = owed;
      if (amount > owed + 0.001) {
        throw new BadRequestException(`Only ₹${owed} of commission is still owed to this stylist.`);
      }
    }
    if (kind === PayoutKind.TIP_WITHDRAWAL) {
      const stats = await this.buildStylistStats(branch.id, dayStart(key));
      const available = stats.find((st) => st.id === staff.id)?.tipsAvailable ?? 0;
      if (amount === undefined) amount = available;
      if (amount > available + 0.001) {
        throw new BadRequestException(
          `Only ₹${available} of tips is available to withdraw for this stylist.`,
        );
      }
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException(
        kind === PayoutKind.TIP_WITHDRAWAL
          ? 'There are no tips to withdraw for this stylist.'
          : 'There is nothing to pay out for this stylist.',
      );
    }

    const payout = await this.prisma.staffPayout.create({
      data: {
        branchId: branch.id,
        userId: staff.id,
        kind,
        amount,
        paymentMode: dto.paymentMode,
        forDate: dayDate(key),
        note: dto.note ?? null,
      },
    });
    return {
      id: payout.id,
      userId: payout.userId,
      kind: payout.kind,
      amount: Number(payout.amount),
      paymentMode: payout.paymentMode,
      createdAt: payout.createdAt,
    };
  }

  // ── Daily checklist ────────────────────────────────────────────────

  async getChecklist(reqUser: any) {
    const branch = await this.resolveBranch(reqUser);
    const [tasks, done] = await Promise.all([
      this.prisma.checklistTask.findMany({
        where: {
          isActive: true,
          OR: [{ branchId: null }, { branchId: branch.id }],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.checklistCompletion.findMany({
        where: { branchId: branch.id, date: dayDate(dayKey()) },
        select: { taskId: true },
      }),
    ]);
    const doneIds = new Set(done.map((d) => d.taskId));
    return {
      data: tasks.map((t) => ({
        id: t.id,
        task: t.task,
        description: t.description ?? '',
        done: doneIds.has(t.id),
      })),
    };
  }

  async setChecklistItem(reqUser: any, taskId: string, done: boolean) {
    const branch = await this.resolveBranch(reqUser);
    const task = await this.prisma.checklistTask.findUnique({ where: { id: taskId } });
    if (!task || !task.isActive || (task.branchId && task.branchId !== branch.id)) {
      throw new NotFoundException('Checklist task not found.');
    }
    const where = {
      taskId_branchId_date: {
        taskId,
        branchId: branch.id,
        date: dayDate(dayKey()),
      },
    };
    if (done) {
      await this.prisma.checklistCompletion.upsert({
        where,
        create: { taskId, branchId: branch.id, date: dayDate(dayKey()) },
        update: {},
      });
    } else {
      await this.prisma.checklistCompletion.deleteMany({
        where: { taskId, branchId: branch.id, date: dayDate(dayKey()) },
      });
    }
    return this.getChecklist(reqUser);
  }
}
