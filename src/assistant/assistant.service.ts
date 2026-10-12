import { Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { dayKey } from '../common/time.util.js';
import { ReportExport } from '../whatsapp/report-export.js';
import { ReportModel } from '../whatsapp/report-model.js';
import { AssistantContext, BranchRef, understand } from './intent.js';
import { buildInsights, Insight } from './insights.js';
import { makePeriod, Period, previousPeriod, readPeriod } from './period.js';
import { niceName, plural, sayMoney, showMoney } from './speak.js';
import { OPENERS, pick, Rng } from './phrases.js';

export const ASSISTANT_NAME = 'Baron';

export interface ReplyCard {
  title: string;
  stats: { label: string; value: string }[];
  insights: { tone: Insight['tone']; text: string }[];
}

export interface AssistantReply {
  /** The short line shown in the chat bubble. */
  text: string;
  /** What is read aloud: the same answer, worded for the ear. */
  speech: string;
  card?: ReplyCard;
  chips: string[];
  action?: { type: 'download'; label: string; from: string; to: string; branchId: string | null };
  context: AssistantContext;
}

const PERIOD_CHIPS = ['Today', 'Yesterday', 'This week', 'Last week', 'This month', 'Last month', 'Custom dates'];
const START_CHIPS = ["Today's report", 'This week', 'This month', 'Insights', 'Download Excel'];
const AFTER_CHIPS = ['Insights', 'Download Excel', 'Another branch', 'Another period'];
const MAX_DAYS = 366;

const nm = niceName;

/**
 * The admin's business assistant. It answers from the same numbers as the reports and the Excel file
 * (nothing is guessed or invented), asks for whatever it is missing, and points out what is growing and
 * what is lacking. The conversation state lives in the app and is sent back with every message.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ReportExport,
  ) {}

  private async branches(): Promise<BranchRef[]> {
    return this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
  }

  /** Context from the app is not trusted: keep only what is valid. */
  private clean(ctx: AssistantContext | undefined, branches: BranchRef[]): AssistantContext {
    const out: AssistantContext = {};
    if (ctx?.branch === 'all' || branches.some((b) => b.id === ctx?.branch)) out.branch = ctx!.branch;
    const p = ctx?.period;
    if (p && /^\d{4}-\d{2}-\d{2}$/.test(p.from) && /^\d{4}-\d{2}-\d{2}$/.test(p.to) && p.from <= p.to) {
      const days = (Date.parse(`${p.to}T00:00:00Z`) - Date.parse(`${p.from}T00:00:00Z`)) / 86_400_000;
      if (days < MAX_DAYS) out.period = { from: p.from, to: p.to, name: typeof p.name === 'string' ? p.name.slice(0, 30) : null };
    }
    if (ctx?.awaiting === 'branch' || ctx?.awaiting === 'period' || ctx?.awaiting === 'dates') out.awaiting = ctx.awaiting;
    if (ctx?.intent === 'report' || ctx?.intent === 'insights' || ctx?.intent === 'download') out.intent = ctx.intent;
    return out;
  }

  private periodOf(ctx: AssistantContext): Period | undefined {
    return ctx.period ? makePeriod(ctx.period.from, ctx.period.to, ctx.period.name) : undefined;
  }

  private scopeName(branch: string, branches: BranchRef[]): string {
    return branch === 'all' ? 'All branches' : nm(branches.find((b) => b.id === branch)?.name ?? 'Branch');
  }

  async chat(message: string, input?: AssistantContext, now: Date = new Date(), rng: Rng = Math.random): Promise<AssistantReply> {
    const branches = await this.branches();
    const today = dayKey(now);
    const ctx = this.clean(input, branches);
    const text = message.trim();
    const lower = text.toLowerCase();

    // Quick changes of mind: keep the other answer, ask for the one being changed.
    if (/\b(another|different|change|switch|other)\b.*\bbranch(es)?\b/.test(lower)) {
      return this.askBranch(branches, { ...ctx, branch: undefined, awaiting: 'branch', intent: ctx.intent ?? 'report' });
    }
    if (/\b(another|different|change|switch|other)\b.*\b(period|dates?|time|day|week|month)\b/.test(lower)) {
      return this.askPeriod({ ...ctx, period: undefined, awaiting: 'period', intent: ctx.intent ?? 'report' });
    }

    const u = understand(text, branches, ctx, today);

    // The admin was asked for dates: read them, or ask again.
    if (ctx.awaiting === 'dates' && !u.period) {
      const maybe = readPeriod(text, today);
      if (!maybe) {
        return {
          text: 'I couldn’t read those dates. Try “1 Oct to 10 Oct” or “5/10/2026”.',
          speech: 'Sorry, I couldn’t catch those dates. Try something like, one October to ten October.',
          chips: ['This month', 'Last month'],
          context: { ...ctx, awaiting: 'dates' },
        };
      }
      u.period = maybe;
    }

    if (u.intent === 'greet') return this.greeting(ctx, rng);
    if (u.intent === 'unknown') return this.help(ctx, rng);

    const intent = u.intent;
    // A bare "report" starts a fresh question; "insights" and follow-ups reuse what was just discussed.
    const fresh = intent === 'report' && !u.branch && !u.period && !ctx.awaiting;
    let branch = u.branch ?? (fresh ? undefined : ctx.branch);
    let period = u.period ?? (fresh ? undefined : this.periodOf(ctx));

    if (intent === 'insights') {
      // Quick answer by default: the whole business, this month.
      if (!branch && ctx.awaiting !== 'branch') branch = 'all';
      if (!period && !u.wantsDates && ctx.awaiting !== 'period') period = readPeriod('this month', today)!;
    }

    if (!branch) return this.askBranch(branches, { ...ctx, period: period && { from: period.from, to: period.to, name: period.name }, awaiting: 'branch', intent });
    if (u.wantsDates && !u.period) {
      return this.askDates({ ...ctx, branch, awaiting: 'dates', intent });
    }
    if (!period) return this.askPeriod({ ...ctx, branch, awaiting: 'period', intent });
    if (period.to > today) period = makePeriod(period.from, today < period.from ? period.from : today, period.name);

    const next: AssistantContext = { branch, period: { from: period.from, to: period.to, name: period.name }, intent };
    const scope = this.scopeName(branch, branches);

    if (intent === 'download') {
      return {
        text: `Here’s the Excel for ${scope}, ${period.label}.`,
        speech: `Sure, here's the Excel sheet for ${scope}, ${period.say}. Tap the button to download it.`,
        chips: ['Insights', 'Another branch', 'Another period'],
        action: { type: 'download', label: 'Download Excel', from: period.from, to: period.to, branchId: branch === 'all' ? null : branch },
        context: next,
      };
    }
    return this.answer(intent, scope, branch, period, next, rng);
  }

  private async answer(intent: 'report' | 'insights', scope: string, branch: string, period: Period, next: AssistantContext, rng: Rng): Promise<AssistantReply> {
    const branchId = branch === 'all' ? undefined : branch;
    const prevRange = previousPeriod(period);
    const [cur, prev, winBack] = await Promise.all([
      this.exporter.model(period.from, period.to, branchId),
      this.exporter.model(prevRange.from, prevRange.to, branchId),
      this.winBack(branchId),
    ]);
    const days = Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000) + 1;
    const insights = buildInsights({ cur, prev, vs: prevRange.word, allBranches: branch === 'all', days, winBack }, rng);
    return this.compose(intent, scope, period, cur, insights, next, rng);
  }

  /** Regulars (3+ completed visits) who haven't been back for 45+ days but did visit in the last year. */
  private async winBack(branchId?: string): Promise<number> {
    const now = Date.now();
    const rows = await this.prisma.session.groupBy({
      by: ['customerId'],
      where: { status: SessionStatus.COMPLETED, customerId: { not: null }, ...(branchId ? { branchId } : {}) },
      having: {
        id: { _count: { gte: 3 } },
        closedAt: { _max: { lt: new Date(now - 45 * 86_400_000), gte: new Date(now - 365 * 86_400_000) } },
      },
      _count: { _all: true },
    });
    return rows.length;
  }

  private compose(intent: 'report' | 'insights', scope: string, period: Period, m: ReportModel, insights: Insight[], next: AssistantContext, rng: Rng): AssistantReply {
    const s = m.summary;
    const title = `${scope} · ${period.label}`;
    if (s.bills === 0) {
      return {
        text: `No bills for ${scope} ${period.name ?? 'in that period'} yet.`,
        speech: pick(rng, [`There are no bills for ${scope} ${period.say} yet. Quiet, quiet.`, `Nothing billed for ${scope} ${period.say} yet.`]),
        card: { title, stats: [], insights: [] },
        chips: ['Another branch', 'Another period'],
        context: next,
      };
    }
    const shown = insights.slice(0, intent === 'insights' ? 6 : 3);
    const lead = shown[0];
    const opener = pick(rng, OPENERS[lead?.tone ?? 'info']);
    const stats = [
      { label: 'Revenue', value: showMoney(s.revenue) },
      { label: 'Customers', value: String(s.customers) },
      { label: 'Tips', value: showMoney(s.tips) },
      { label: 'Expenses', value: showMoney(s.expenses + s.advances) },
      { label: 'Net in hand', value: showMoney(s.netInHand) },
      { label: 'Avg bill', value: showMoney(s.avgBill) },
    ];
    // The spoken answer is worded for the ear, and varies in length and phrasing so it never sounds canned.
    const rev = sayMoney(s.revenue);
    const cust = plural(s.customers, 'customer');
    const net = sayMoney(s.netInHand);
    const numbers = pick(rng, [
      `${scope} ${period.say}: revenue is ${rev} from ${cust}. Tips ${sayMoney(s.tips)}, and net in hand is ${net}.`,
      `${scope}, ${period.say}. ${cust}, ${rev} in revenue, and ${net} in hand.`,
      `${rev} from ${cust} at ${scope} ${period.say}. Net in hand, ${net}.`,
    ]);
    const spokenInsights = shown.slice(0, intent === 'insights' ? 4 : 2).map((x) => x.say);
    const joiners = ['Next up, ', 'Another one: ', 'And one more thing: '];
    const speech = [opener, numbers, ...spokenInsights.map((t, i) => (i === 0 ? t : `${pick(rng, joiners)}${t}`))].join(' ');
    return {
      text: intent === 'insights' ? `${opener} Here’s how ${scope.toLowerCase() === 'all branches' ? 'the business is' : scope + ' is'} doing.` : `${opener} ${scope}, ${period.name ?? 'for that period'}.`,
      speech,
      card: { title, stats, insights: shown.map((x) => ({ tone: x.tone, text: x.text })) },
      chips: intent === 'insights' ? ['Download Excel', 'Another branch', 'Another period'] : AFTER_CHIPS,
      context: next,
    };
  }

  private askBranch(branches: BranchRef[], ctx: AssistantContext): AssistantReply {
    return {
      text: 'Which branch?',
      speech: 'Sure. Which branch would you like?',
      chips: ['All branches', ...branches.map((b) => nm(b.name))],
      context: ctx,
    };
  }

  private askPeriod(ctx: AssistantContext): AssistantReply {
    return {
      text: 'Daily, weekly or monthly?',
      speech: 'Got it. Daily, weekly, or monthly?',
      chips: PERIOD_CHIPS,
      context: ctx,
    };
  }

  private askDates(ctx: AssistantContext): AssistantReply {
    return {
      text: 'Pick the dates, or type them like “1 Oct to 10 Oct”.',
      speech: 'Okay. Pick the dates, or just tell me, like one October to ten October.',
      chips: [],
      context: ctx,
    };
  }

  private greeting(ctx: AssistantContext, rng: Rng): AssistantReply {
    const line = pick(rng, [
      'Hi! Baron here. Want a report, insights, or an Excel sheet?',
      'Hey! What shall we look at?',
      `Hello! I'm ${ASSISTANT_NAME}. Reports, insights or Excel, your pick.`,
    ]);
    return { text: line, speech: line, chips: START_CHIPS, context: { ...ctx, awaiting: undefined } };
  }

  private help(ctx: AssistantContext, rng: Rng): AssistantReply {
    const speech = pick(rng, [
      "Hmm, I didn't quite get that. I can do reports, insights and Excel sheets. Try one of these.",
      'That one is above my pay grade. I do reports, insights and Excel sheets. Pick one of these.',
    ]);
    return {
      text: 'I can give a report for any branch (daily, weekly, monthly or custom dates), tell you where the business is growing or lacking, and make an Excel sheet. Try one of these.',
      speech,
      chips: START_CHIPS,
      context: { ...ctx, awaiting: undefined },
    };
  }
}
