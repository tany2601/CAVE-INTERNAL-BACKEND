import { dayKey } from '../common/time.util.js';
import { Period, readPeriod } from './period.js';

export interface BranchRef {
  id: string;
  name: string;
}

/** What the assistant remembers between messages (the app sends it back each time). */
export interface AssistantContext {
  /** 'all' for the whole business, a branch id, or unset while it still needs asking. */
  branch?: string;
  period?: { from: string; to: string; name: string | null };
  /** What it asked last, so a bare "Karkala" or "this week" is understood as the answer. */
  awaiting?: 'branch' | 'period' | 'dates';
  intent?: 'report' | 'insights' | 'download';
}

export type Intent = 'greet' | 'report' | 'insights' | 'download' | 'unknown';

export interface Understood {
  intent: Intent;
  /** 'all', a branch id, or undefined when the message named none. */
  branch?: string;
  period?: Period;
  /** The admin asked for custom dates but gave none yet. */
  wantsDates: boolean;
}

const ALL = /\b(all|every|overall|combined|whole|entire|total|business|everything|everywhere|all branches)\b/;
const normalise = (name: string) => name.toLowerCase().replace(/^cave\s+/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Which branch a message names: 'all', a branch id, or undefined. Longest name wins. */
export function readBranch(text: string, branches: BranchRef[]): string | undefined {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `;
  let best: { id: string; len: number } | undefined;
  for (const b of branches) {
    const n = normalise(b.name);
    if (!n) continue;
    const words = n.split(' ').filter((w) => w.length >= 4);
    const hit = t.includes(` ${n} `) ? n.length : words.some((w) => t.includes(` ${w} `)) ? Math.max(...words.map((w) => (t.includes(` ${w} `) ? w.length : 0))) : 0;
    if (hit && (!best || hit > best.len)) best = { id: b.id, len: hit };
  }
  if (best) return best.id;
  if (ALL.test(t)) return 'all';
  return undefined;
}

const GREET = /^\s*(hi|hii+|hello|hey|hola|namaste|namaskar|yo|good\s+(morning|afternoon|evening|night)|help|what can you do|who are you|thanks?|thank you|ok(ay)?|cool|great|nice|bye)\b/i;
const DOWNLOAD = /\b(excel|xls|xlsx|spreadsheet|sheet|download|export|file)\b/i;
const INSIGHTS = /\b(insights?|lack(ing)?|weak(ness|est)?|behind|struggl\w*|growing|growth|grow|how('s| is| are)?\s+(the\s+)?(business|we|it|things)|how.*doing|analy[sz]e|analysis|trend\w*|improve\w*|suggest\w*|advice|what should|problem|issues?|opportunit\w*|performing|performance)\b/i;
const REPORT = /\b(report|revenue|sales|income|collection|collections|numbers|earn\w*|how much|customers?|tips?|expenses?|summary|status|net|profit|figures)\b/i;
const CUSTOM = /\bcustom\b|\bpick (a )?date|\bdate range\b|\bspecific dates?\b|\bbetween dates\b/i;

export function understand(text: string, branches: BranchRef[], ctx: AssistantContext = {}, today: string = dayKey()): Understood {
  const period = readPeriod(text, today) ?? undefined;
  const branch = readBranch(text, branches);
  const wantsDates = CUSTOM.test(text) && !period;
  const hasSlot = !!period || branch !== undefined;

  let intent: Intent = 'unknown';
  if (DOWNLOAD.test(text)) intent = 'download';
  else if (INSIGHTS.test(text)) intent = 'insights';
  else if (REPORT.test(text)) intent = 'report';
  else if (GREET.test(text) && !hasSlot) intent = 'greet';
  else if (hasSlot || wantsDates || ctx.awaiting) intent = ctx.intent ?? 'report';
  return { intent, branch, period, wantsDates };
}
