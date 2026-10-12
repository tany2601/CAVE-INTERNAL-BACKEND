import { ReportModel } from '../whatsapp/report-model.js';
import { niceName, plural, sayMoney, sayPercent, showMoney } from './speak.js';
import { pick, Rng } from './phrases.js';

export interface Insight {
  tone: 'good' | 'warn' | 'info';
  /** Shown on screen. */
  text: string;
  /** Said aloud (money and percentages in spoken form). */
  say: string;
  /** Higher is shown first. */
  weight: number;
}

export interface InsightInput {
  cur: ReportModel;
  /** The stretch before it, for "up / down" comparisons; null when there is nothing to compare. */
  prev: ReportModel | null;
  /** How the earlier stretch is described: "yesterday", "last month"… */
  vs: string;
  /** Whole-business view (so branches can be compared) or a single branch. */
  allBranches: boolean;
  days: number;
  /** Regulars (3+ visits) not seen for 45+ days. */
  winBack: number;
}

const pct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** The few things worth telling the owner, best first. Pure: same numbers in, same words out. */
export function buildInsights(i: InsightInput, rng: Rng = Math.random): Insight[] {
  const { cur, prev } = i;
  const s = cur.summary;
  const out: Insight[] = [];
  const push = (tone: Insight['tone'], weight: number, text: string, say = text) => out.push({ tone, weight, text, say });

  if (s.bills === 0) {
    push('info', 100, 'No bills in this period yet.', 'There are no bills in this period yet.');
    return out;
  }

  // 1. Revenue against the stretch before
  if (prev && prev.summary.revenue > 0) {
    const d = pct(s.revenue, prev.summary.revenue)!;
    if (d >= 5) push('good', 95, `Revenue is up ${Math.round(d)}% on ${i.vs} (${showMoney(prev.summary.revenue)} → ${showMoney(s.revenue)}).`, pick(rng, [`Revenue is up ${sayPercent(d)} on ${i.vs}. Nice work, team!`, `Revenue has climbed ${sayPercent(d)} compared to ${i.vs}. Somebody's been busy.`, `Revenue is up ${sayPercent(d)} on ${i.vs}. The chairs are earning their keep.`]));
    else if (d <= -5) push('warn', 96, `Revenue is down ${Math.round(-d)}% on ${i.vs} (${showMoney(prev.summary.revenue)} → ${showMoney(s.revenue)}).`, pick(rng, [`Revenue is down ${sayPercent(d)} compared to ${i.vs}. Not the end of the world, but let's watch it.`, `Revenue slipped ${sayPercent(d)} against ${i.vs}. Nothing a good week can't fix.`]));
    else push('info', 60, `Revenue is steady against ${i.vs}.`, pick(rng, [`Revenue is steady compared to ${i.vs}. Solid and calm, just how accountants like it.`, `Revenue is holding steady against ${i.vs}.`]));
  } else if (prev) {
    push('info', 40, `Nothing to compare with ${i.vs}, so this is your starting point.`, `There's nothing to compare with ${i.vs} yet, so this is the starting line.`);
  }

  // 2. Footfall and bill size
  if (prev && prev.summary.customers > 0) {
    const c = pct(s.customers, prev.summary.customers)!;
    const a = prev.summary.avgBill > 0 ? pct(s.avgBill, prev.summary.avgBill)! : 0;
    if (c <= -10) push('warn', 90, `Fewer customers: ${s.customers} against ${prev.summary.customers} ${i.vs}.`, `You served fewer customers, ${s.customers} against ${prev.summary.customers} ${i.vs}. The chairs were a bit lonely.`);
    else if (c >= 10) push('good', 80, `More customers: ${s.customers} against ${prev.summary.customers} ${i.vs}.`, `More customers came in, ${s.customers} against ${prev.summary.customers} ${i.vs}. The queue is working.`);
    if (a <= -8) push('warn', 70, `The average bill dropped ${Math.round(-a)}% to ${showMoney(s.avgBill)}.`, `The average bill dropped ${sayPercent(a)} to ${sayMoney(s.avgBill)}. Time for a little upselling?`);
    else if (a >= 8) push('good', 65, `The average bill grew ${Math.round(a)}% to ${showMoney(s.avgBill)}.`, `The average bill grew ${sayPercent(a)} to ${sayMoney(s.avgBill)}. Customers are treating themselves.`);
  }

  // 3. Branches: who leads, who is behind, who is sliding
  if (i.allBranches) {
    const active = cur.branches.filter((b) => b.revenue > 0 || b.bills > 0);
    if (active.length >= 2) {
      const ranked = [...active].sort((a, b) => b.revenue - a.revenue);
      const top = ranked[0];
      const low = ranked[ranked.length - 1];
      const share = s.revenue > 0 ? Math.round((top.revenue / s.revenue) * 100) : 0;
      const nm = niceName;
      push('good', 78, `${nm(top.name)} leads with ${showMoney(top.revenue)} (${share}% of revenue).`, pick(rng, [`${nm(top.name)} leads the pack with ${sayMoney(top.revenue)}, ${sayPercent(share)} of your revenue.`, `${nm(top.name)} is out in front with ${sayMoney(top.revenue)}. Show-off.`]));
      if (low.revenue < top.revenue * 0.5) {
        push('warn', 88, `${nm(low.name)} is behind at ${showMoney(low.revenue)}, less than half of ${nm(top.name)}.`, `${nm(low.name)} is lagging at ${sayMoney(low.revenue)}, under half of ${nm(top.name)}. Maybe it needs a pep talk.`);
      }
    }
    if (prev) {
      for (const b of cur.branches) {
        const before = prev.branches.find((p) => p.name === b.name);
        if (!before || before.revenue < 1000) continue;
        const d = pct(b.revenue, before.revenue)!;
        if (d <= -20) push('warn', 92, `${niceName(b.name)} slid ${Math.round(-d)}% on ${i.vs}.`, `${niceName(b.name)} slid ${sayPercent(d)} compared to ${i.vs}. Worth a call to the manager.`);
        else if (d >= 25) push('good', 75, `${niceName(b.name)} grew ${Math.round(d)}% on ${i.vs}.`, `${niceName(b.name)} grew ${sayPercent(d)} on ${i.vs}. Take a bow.`);
      }
    }
  }

  // 4. What sells
  const top = cur.services[0];
  if (top && cur.services.length > 1) {
    push('info', 50, `${top.name} is the most taken service (${top.times} times, ${Math.round(top.share)}% of services).`, pick(rng, [`${top.name} is the star of the menu, taken ${plural(top.times, 'time')}.`, `${top.name} is your crowd favourite, ${plural(top.times, 'time')}.`]));
  }
  const withProduct = cur.bills.filter((b) => b.products).length;
  const attach = s.bills ? (withProduct / s.bills) * 100 : 0;
  if (s.bills >= 8) {
    if (attach < 12) push('warn', 68, `Only ${Math.round(attach)}% of bills include a product. Suggesting one at checkout is easy extra revenue.`, `Only ${sayPercent(attach)} of bills include a product. That's easy money sitting on the shelf, just ask at checkout.`);
    else if (attach >= 30) push('good', 55, `${Math.round(attach)}% of bills include a product. Good upselling.`, `${sayPercent(attach)} of bills include a product. Great upselling, the shelf is happy.`);
  }

  // 5. Money leaking out
  const gross = s.revenue + s.discounts;
  if (gross > 0 && (s.discounts / gross) * 100 >= 8) {
    push('warn', 72, `Discounts took ${Math.round((s.discounts / gross) * 100)}% of billing (${showMoney(s.discounts)}).`, `Discounts took ${sayPercent((s.discounts / gross) * 100)} of billing, about ${sayMoney(s.discounts)}. That's a lot of generosity.`);
  }
  const spend = s.expenses + s.advances;
  if (s.revenue > 0 && (spend / s.revenue) * 100 >= 35) {
    push('warn', 74, `Expenses and advances are ${Math.round((spend / s.revenue) * 100)}% of revenue (${showMoney(spend)}).`, `Expenses and advances are ${sayPercent((spend / s.revenue) * 100)} of revenue, about ${sayMoney(spend)}. Keep an eye on the wallet.`);
  }

  // 6. When and who
  if (i.days >= 7 && cur.days.length >= 7) {
    const busy = [...cur.days].sort((a, b) => b.revenue - a.revenue)[0];
    const quiet = [...cur.days].filter((d) => d.day <= cur.to).sort((a, b) => a.revenue - b.revenue)[0];
    const weekday = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
    const byWeekday = new Map<string, { total: number; n: number }>();
    for (const d of cur.days) {
      const w = weekday(d.day);
      const cur2 = byWeekday.get(w) ?? { total: 0, n: 0 };
      byWeekday.set(w, { total: cur2.total + d.revenue, n: cur2.n + 1 });
    }
    const avgs = [...byWeekday.entries()].map(([w, v]) => ({ w, avg: v.total / v.n })).sort((a, b) => b.avg - a.avg);
    if (avgs.length >= 5 && avgs[0].avg > 0) {
      push('info', 52, `${avgs[0].w}s are your best day (about ${showMoney(avgs[0].avg)}), ${avgs[avgs.length - 1].w}s the quietest.`, `${avgs[0].w}s are your best day, and ${avgs[avgs.length - 1].w}s are the quietest. Plan your offers around that.`);
    }
    void busy;
    void quiet;
  }
  const hours = new Map<number, number>();
  for (const b of cur.bills) hours.set(b.closedAt.getUTCHours(), (hours.get(b.closedAt.getUTCHours()) ?? 0) + 1);
  if (s.bills >= 10) {
    const [h, n] = [...hours.entries()].sort((a, b) => b[1] - a[1])[0];
    const label = `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
    push('info', 45, `Busiest hour is around ${label} (${n} bills).`, `Your busiest hour is around ${label}. That's when the chairs are full.`);
  }
  if (cur.stylists.length >= 3) {
    const avg = sum(cur.stylists.map((x) => x.customers)) / cur.stylists.length;
    const lead = cur.stylists[0];
    push('good', 58, `${lead.name} is the top stylist with ${showMoney(lead.revenue)} from ${plural(lead.customers, 'customer')}.`, `${lead.name} is your top stylist with ${sayMoney(lead.revenue)}. Scissors of steel.`);
    const slow = [...cur.stylists].reverse().find((x) => avg >= 4 && x.customers < avg * 0.5);
    if (slow) push('warn', 66, `${slow.name} served only ${plural(slow.customers, 'customer')} against an average of ${Math.round(avg)}. Check their schedule.`, `${slow.name} served only ${plural(slow.customers, 'customer')}, well under the average of ${Math.round(avg)}. Maybe check the schedule.`);
  }

  // 7. Loyalty and repeat business
  if (s.trackedCustomers >= 5) {
    const repeat = (s.returningCustomers / s.trackedCustomers) * 100;
    if (repeat < 30) push('warn', 76, `Only ${Math.round(repeat)}% of customers are returning ones. Bringing people back is the biggest gap.`, `Only ${sayPercent(repeat)} of customers are returning ones. Getting people to come back is your biggest gap.`);
    else if (repeat >= 60) push('good', 62, `${Math.round(repeat)}% of customers are returning. Loyalty is working.`, `${sayPercent(repeat)} of customers are returning. They like you, it's official.`);
  }
  if (i.winBack > 0) {
    push('warn', 64, `${plural(i.winBack, 'regular customer')} (3+ visits) haven't been back in over 45 days. A WhatsApp offer could win them back.`, `${plural(i.winBack, 'regular customer')} haven't been back in over 45 days. A little nudge on WhatsApp could bring them home.`);
  }
  if (s.freeHaircuts > 0) push('info', 42, `${plural(s.freeHaircuts, 'free haircut')} given as loyalty rewards. Generous!`, `${plural(s.freeHaircuts, 'free haircut')} given as loyalty rewards.`);
  if (s.tips > 0 && s.revenue > 0) push('info', 30, `Tips are ${Math.round((s.tips / s.revenue) * 100)}% of revenue (${showMoney(s.tips)}).`, `Tips came to ${sayMoney(s.tips)}.`);

  return out.sort((a, b) => b.weight - a.weight);
}
