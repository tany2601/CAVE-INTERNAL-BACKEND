import { BadRequestException, Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDaysToKey, dayKey, dayStart } from '../common/time.util.js';
import { buildReportModel, ReportModel, ReportPayout, ReportSession, ReportTransaction } from './report-model.js';
import { renderReportXlsx, reportFileName } from './report-xlsx.js';

export const MAX_REPORT_DAYS = 366;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Checks a from/to pair (inclusive IST days) and returns it; defaults to today. */
export function reportRange(from?: string, to?: string, now: Date = new Date()): { from: string; to: string } {
  const f = from || to || dayKey(now);
  const t = to || f;
  if (!DAY.test(f) || !DAY.test(t) || Number.isNaN(Date.parse(`${f}T00:00:00Z`)) || Number.isNaN(Date.parse(`${t}T00:00:00Z`))) {
    throw new BadRequestException('Dates must look like 2026-10-06.');
  }
  if (t < f) throw new BadRequestException('The end date is before the start date.');
  if ((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86_400_000 >= MAX_REPORT_DAYS) {
    throw new BadRequestException(`Pick a period of at most ${MAX_REPORT_DAYS} days.`);
  }
  return { from: f, to: t };
}

/** Loads everything a report covers and turns it into the Excel file. */
@Injectable()
export class ReportExport {
  constructor(private readonly prisma: PrismaService) {}

  async model(from: string, to: string): Promise<ReportModel> {
    const start = dayStart(from);
    const end = dayStart(addDaysToKey(to, 1));
    const monthStart = dayStart(`${to.slice(0, 8)}01`);

    const [branches, sessions, transactions, payouts, monthSessions] = await Promise.all([
      this.prisma.branch.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true, isActive: true } }),
      this.prisma.session.findMany({
        where: { status: SessionStatus.COMPLETED, closedAt: { gte: start, lt: end } },
        orderBy: { closedAt: 'asc' },
        select: {
          id: true,
          branchId: true,
          stylistId: true,
          customerId: true,
          customerName: true,
          customerMobile: true,
          paymentMode: true,
          subtotal: true,
          discountType: true,
          discountAmount: true,
          tipAmount: true,
          totalAmount: true,
          startedAt: true,
          createdAt: true,
          closedAt: true,
          isEdited: true,
          isFreeVisit: true,
          services: { select: { serviceName: true, price: true, isCustom: true } },
          products: { select: { productName: true, price: true, paymentMode: true } },
          customer: { select: { createdAt: true, qualifyingCompletedSessionsCount: true } },
          stylist: { select: { name: true } },
        },
      }) as unknown as Promise<ReportSession[]>,
      this.prisma.branchTransaction.findMany({
        where: { createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: 'asc' },
        select: {
          branchId: true,
          type: true,
          amount: true,
          paymentMode: true,
          createdAt: true,
          description: true,
          employee: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      }) as unknown as Promise<ReportTransaction[]>,
      this.prisma.staffPayout.findMany({
        where: { forDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
        orderBy: { forDate: 'asc' },
        select: {
          userId: true,
          branchId: true,
          kind: true,
          amount: true,
          paymentMode: true,
          forDate: true,
          note: true,
          user: { select: { name: true } },
        },
      }) as unknown as Promise<ReportPayout[]>,
      this.prisma.session.findMany({
        where: { status: SessionStatus.COMPLETED, closedAt: { gte: monthStart, lt: end }, stylistId: { not: null } },
        select: { stylistId: true, totalAmount: true, tipAmount: true },
      }),
    ]);

    const stylistIds = [...new Set([...sessions.map((s) => s.stylistId), ...payouts.map((p) => p.userId)].filter((x): x is string => !!x))];
    const stylists = stylistIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: stylistIds } },
          select: {
            id: true,
            name: true,
            branchId: true,
            commissionModel: true,
            flatCommissionPercentage: true,
            commissionSlabs: { select: { minRevenue: true, commissionPercentage: true, slabOrder: true } },
          },
        })
      : [];

    const monthRevenue = new Map<string, number>();
    for (const s of monthSessions) {
      if (!s.stylistId) continue;
      monthRevenue.set(s.stylistId, (monthRevenue.get(s.stylistId) ?? 0) + Number(s.totalAmount) - Number(s.tipAmount));
    }

    // Branches that are switched off still show if they had activity in the period.
    const active = new Set([...sessions.map((s) => s.branchId), ...transactions.map((t) => t.branchId), ...payouts.map((p) => p.branchId)]);
    return buildReportModel({
      from,
      to,
      generatedAt: new Date(),
      branches: branches.filter((b) => b.isActive || active.has(b.id)).map((b) => ({ id: b.id, name: b.name })),
      sessions,
      transactions,
      payouts,
      stylists,
      monthRevenue,
    });
  }

  /** The Excel report for [from, to] and the model it was built from. */
  async generate(from: string, to: string): Promise<{ file: Buffer; fileName: string; model: ReportModel }> {
    const model = await this.model(from, to);
    return { file: await renderReportXlsx(model), fileName: reportFileName(from, to), model };
  }
}
