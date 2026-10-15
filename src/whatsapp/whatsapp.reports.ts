import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SessionStatus, WhatsappKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { aggregateFinance, FinPayout, FinSession, FinTransaction, SESSION_FIN_SELECT } from '../admin/reports/finance.js';
import { addDaysToKey, dayDate, dayKey, dayStart, IST_OFFSET_MS } from '../common/time.util.js';
import { WhatsappClient } from './whatsapp.client.js';
import { ReportExport } from './report-export.js';
import { XLSX_MIME } from './report-xlsx.js';
import type { TemplateHeader } from './whatsapp.client.js';
import { WhatsappOutbox } from './whatsapp.outbox.js';
import { cleanTimes, ReportSettings, ReportTimes, toMinutes, WhatsappSettings } from './whatsapp.settings.js';
import { buildReportParams, Digest } from './whatsapp.format.js';
import { reportRange } from './report-export.js';

import { periodLabel, ReportKind } from './report-period.js';

export { periodLabel };
export type { ReportKind };

export interface DueReport {
  kind: ReportKind;
  /** Stable id of this report, e.g. "daily:2026-10-06". */
  key: string;
  label: string;
  from: string;
  to: string;
}

/**
 * Which reports are due at `now` (IST), at the times set in Admin → Settings (standard: daily from 9:30 PM,
 * weekly Monday from 9:00 AM, monthly the 1st from 9:00 AM):
 *  · daily: from the daily time, for today
 *  · weekly: on the chosen weekday, for the 7 days before it (Monday gives the week that just ended, Mon–Sun);
 *    the next day catches up if the server was down
 *  · monthly: on the chosen day, for the calendar month that just ended; the next day catches up if missed
 * Whether one was already sent is decided by the outbox's dedupe keys, so calling this often is harmless.
 */
export function dueReports(
  now: Date,
  on: Pick<ReportSettings, 'daily' | 'weekly' | 'monthly'> & { times?: Partial<ReportTimes> },
): DueReport[] {
  const t = cleanTimes(on.times);
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const dow = ist.getUTCDay(); // 0 = Sunday
  const dom = ist.getUTCDate();
  const today = dayKey(now);
  const due: DueReport[] = [];

  if (on.daily && minutes >= toMinutes(t.dailyTime)) {
    due.push({ kind: 'daily', key: `daily:${today}`, label: 'Daily', from: today, to: today });
  }
  if (on.weekly && ((dow === t.weeklyDay && minutes >= toMinutes(t.weeklyTime)) || dow === (t.weeklyDay + 1) % 7)) {
    const scheduled = dow === t.weeklyDay ? today : addDaysToKey(today, -1);
    const to = addDaysToKey(scheduled, -1);
    const from = addDaysToKey(to, -6);
    due.push({ kind: 'weekly', key: `weekly:${from}`, label: 'Weekly', from, to });
  }
  if (on.monthly && ((dom === t.monthlyDay && minutes >= toMinutes(t.monthlyTime)) || dom === t.monthlyDay + 1)) {
    const firstOfThisMonth = `${today.slice(0, 8)}01`;
    const to = addDaysToKey(firstOfThisMonth, -1);
    const from = `${to.slice(0, 8)}01`;
    due.push({ kind: 'monthly', key: `monthly:${from}`, label: 'Monthly', from, to });
  }
  return due;
}

@Injectable()
export class WhatsappReports implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WhatsApp');
  private timer?: NodeJS.Timeout;
  private ticking = false;
  /** Report keys already queued by this process, so a minute-by-minute check stays cheap. */
  private readonly queued = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WhatsappClient,
    private readonly outbox: WhatsappOutbox,
    private readonly settings: WhatsappSettings,
    private readonly exporter: ReportExport,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Queues any report that has become due. */
  async tick(now: Date = new Date()): Promise<number> {
    if (this.ticking || !this.client.isConfigured()) return 0;
    this.ticking = true;
    let queued = 0;
    try {
      // Reports go out through the Business API, so they need the automatic mode.
      if ((await this.settings.getDelivery()).mode !== 'api') return 0;
      const s = await this.settings.get();
      if (s.phones.length === 0) return 0;
      for (const due of dueReports(now, s)) {
        if (this.queued.has(due.key)) continue;
        queued += await this.queue(due.key, due.kind, due.label, due.from, due.to, s.phones, WhatsappKind.REPORT, s.excel);
        this.queued.add(due.key);
      }
    } catch (e) {
      this.logger.error(`Report check failed: ${(e as Error).message}`);
    } finally {
      this.ticking = false;
    }
    return queued;
  }

  /**
   * Sends a report to the saved numbers right away, to check the setup works. Defaults to today so far;
   * `from`/`to` pick any other period (inclusive IST days).
   */
  async sendTest(from?: string, to?: string): Promise<number> {
    const s = await this.settings.get();
    const range = reportRange(from, to);
    return this.queue(`test:${Date.now()}`, 'daily', 'Test', range.from, range.to, s.phones, WhatsappKind.TEST, s.excel);
  }

  private async queue(
    key: string,
    kind: ReportKind,
    label: string,
    from: string,
    to: string,
    phones: string[],
    messageKind: WhatsappKind = WhatsappKind.REPORT,
    excel = false,
  ): Promise<number> {
    // Already queued (for example before a restart): don't build and upload the file again.
    if (messageKind === WhatsappKind.REPORT) {
      const have = await this.prisma.whatsappMessage.count({ where: { dedupeKey: { startsWith: `report:${key}:` } } });
      if (have >= phones.length) return 0;
    }
    const digest = await this.buildDigest(kind, label, from, to);
    const params = buildReportParams(digest);
    // The full Excel report goes with the message; if it can't be made or uploaded, the text report still goes out.
    let header: TemplateHeader | undefined;
    if (excel) {
      try {
        const { file, fileName } = await this.exporter.generate(from, to);
        header = { id: await this.client.uploadMedia(file, XLSX_MIME, fileName), kind: 'document', filename: fileName };
      } catch (e) {
        this.logger.warn(`Excel report failed, sending the text report instead: ${(e as Error).message}`);
      }
    }
    let n = 0;
    for (const phone of phones) {
      const ok = await this.outbox.enqueue({
        kind: messageKind,
        dedupeKey: `report:${key}:${phone}`,
        to: phone,
        template: header ? this.client.templates.reportFile : this.client.templates.report,
        params,
        header,
      });
      if (ok) n += 1;
    }
    return n;
  }

  /** Totals for the whole business and per branch over [from, to] (inclusive IST days). */
  async buildDigest(kind: ReportKind, label: string, from: string, to: string): Promise<Digest> {
    const start = dayStart(from);
    const end = dayStart(addDaysToKey(to, 1));
    const [branches, sessions, transactions, payouts] = await Promise.all([
      this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
      this.prisma.session.findMany({
        where: { status: SessionStatus.COMPLETED, closedAt: { gte: start, lt: end } },
        select: SESSION_FIN_SELECT,
      }) as unknown as Promise<FinSession[]>,
      this.prisma.branchTransaction.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { branchId: true, type: true, amount: true, paymentMode: true, createdAt: true },
      }) as unknown as Promise<FinTransaction[]>,
      this.prisma.staffPayout.findMany({
        where: { forDate: { gte: dayDate(from), lte: dayDate(to) } },
        select: { branchId: true, kind: true, amount: true, paymentMode: true, forDate: true },
      }) as unknown as Promise<FinPayout[]>,
    ]);

    const total = aggregateFinance(sessions, transactions, payouts);
    return {
      label,
      period: periodLabel(label === 'Test' ? 'daily' : kind, from, to),
      revenue: total.revenue,
      customers: total.customers,
      tips: total.tips,
      expenses: Math.round((total.expenses + total.advances) * 100) / 100,
      payouts: Math.round((total.commissionPaid + total.tipWithdrawals) * 100) / 100,
      netInHand: total.netInHand,
      branches: branches.map((b) => {
        const f = aggregateFinance(
          sessions.filter((s) => s.branchId === b.id),
          transactions.filter((t) => t.branchId === b.id),
          payouts.filter((p) => p.branchId === b.id),
        );
        return { name: b.name, revenue: f.revenue, customers: f.customers };
      }),
    };
  }
}
