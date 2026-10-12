import { addDaysToKey, dayKey } from '../common/time.util.js';

/** A stretch of Indian-time days, inclusive, plus how to say it. */
export interface Period {
  from: string;
  to: string;
  /** "today", "this week", "last month"… or null for dates the admin typed. */
  name: string | null;
  /** Shown on screen: "This week · 5 Oct – 11 Oct 2026". */
  label: string;
  /** Said out loud: "this week", "between 1 October and 10 October". */
  say: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parts = (key: string) => {
  const d = new Date(`${key}T00:00:00Z`);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
};
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const validKey = (y: number, m: number, d: number) => m >= 0 && m < 12 && d >= 1 && d <= daysInMonth(y, m);

const short = (k: string) => `${parts(k).d} ${SHORT[parts(k).m]}`;
const long = (k: string) => `${parts(k).d} ${MONTH_NAMES[parts(k).m]}`;

/** "6 Oct 2026" / "5 – 11 Oct 2026" / "28 Sep – 4 Oct 2026" */
export function rangeText(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (from === to) return `${a.d} ${SHORT[a.m]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${b.d} ${SHORT[b.m]} ${b.y}`;
  return `${short(from)}${a.y === b.y ? '' : ` ${a.y}`} – ${short(to)} ${b.y}`;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function makePeriod(from: string, to: string, name: string | null): Period {
  const range = rangeText(from, to);
  return {
    from,
    to,
    name,
    label: name ? `${cap(name)} · ${range}` : range,
    say: name ?? (from === to ? `on ${long(from)}` : `from ${long(from)} to ${long(to)}`),
  };
}

const monday = (k: string) => addDaysToKey(k, -((parts(k).dow + 6) % 7));

/** Dates typed in the message: ISO, 5/10(/2026), "5 oct", "5th October 2026", "oct 5". At most two, in order. */
export function parseDates(text: string, today: string): string[] {
  const t = text.toLowerCase();
  const year = parts(today).y;
  const found: { at: number; key: string }[] = [];
  const add = (at: number, y: number, m: number, d: number) => {
    if (validKey(y, m, d)) found.push({ at, key: key(y, m, d) });
  };
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) add(m.index!, +m[1], +m[2] - 1, +m[3]);
  for (const m of t.matchAll(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/g)) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year;
    add(m.index!, y, +m[2] - 1, +m[1]);
  }
  const mon = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${mon}\\b(?:,?\\s*(\\d{4}))?`, 'g'))) {
    add(m.index!, m[3] ? +m[3] : year, MONTHS.indexOf(m[2].slice(0, 3)), +m[1]);
  }
  for (const m of t.matchAll(new RegExp(`\\b${mon}\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`, 'g'))) {
    add(m.index!, m[3] ? +m[3] : year, MONTHS.indexOf(m[1].slice(0, 3)), +m[2]);
  }
  const unique = [...new Map(found.sort((x, y) => x.at - y.at).map((f) => [f.key, f])).values()];
  return unique.slice(0, 2).map((f) => f.key);
}

/** Works out the period a message talks about, or null when it names none. `today` is an IST day key. */
export function readPeriod(text: string, today: string = dayKey()): Period | null {
  const t = ` ${text.toLowerCase()} `;
  const { y, m, dow } = parts(today);

  // Dates typed out win over words like "this month".
  const dates = parseDates(text, today);
  if (dates.length > 0) {
    const [a, b] = dates.length === 2 ? dates : [dates[0], dates[0]];
    const [from, to] = a <= b ? [a, b] : [b, a];
    return makePeriod(from, to, null);
  }

  if (/\byesterday\b/.test(t)) return makePeriod(addDaysToKey(today, -1), addDaysToKey(today, -1), 'yesterday');
  if (/\b(last|previous|past) (\d{1,3}) days?\b/.test(t)) {
    const n = Math.min(366, Math.max(1, +(t.match(/\b(?:last|previous|past) (\d{1,3}) days?\b/)![1])));
    return makePeriod(addDaysToKey(today, -(n - 1)), today, `last ${n} days`);
  }
  if (/\b(last|previous|past) week\b/.test(t)) {
    const thisMonday = monday(today);
    return makePeriod(addDaysToKey(thisMonday, -7), addDaysToKey(thisMonday, -1), 'last week');
  }
  if (/\b(last|previous) month\b/.test(t)) {
    const py = m === 0 ? y - 1 : y;
    const pm = m === 0 ? 11 : m - 1;
    return makePeriod(key(py, pm, 1), key(py, pm, daysInMonth(py, pm)), 'last month');
  }
  if (/\b(this|current) week\b|\bweekly\b|\bthe week\b/.test(t)) return makePeriod(monday(today), today, 'this week');
  if (/\b(this|current) month\b|\bmonthly\b|\bthe month\b|\bmonth\b/.test(t)) return makePeriod(key(y, m, 1), today, 'this month');
  if (/\btoday\b|\btonight\b|\bdaily\b|\bso far\b|\bthe day\b/.test(t)) return makePeriod(today, today, 'today');

  // A month by name: "September", "for oct"
  // ("may" is also an ordinary word, so it only counts as the month in "in may", "for may"…)
  const named =
    t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/) ??
    t.match(/\b(?:in|for|of|during|month of)\s+(may)\b/);
  if (named && !/\d/.test(t.replace(/\bq\d\b/g, ''))) {
    const mi = MONTHS.indexOf(named[1].slice(0, 3));
    const yy = mi > m ? y - 1 : y;
    const last = mi === m && yy === y ? today : key(yy, mi, daysInMonth(yy, mi));
    return makePeriod(key(yy, mi, 1), last, null);
  }
  void dow;
  return null;
}

/**
 * The stretch just before `p`, the same length, to compare against. A month so far is compared with the
 * same number of days of the month before, so "1–12 Oct" is judged against "1–12 Sep".
 */
export function previousPeriod(p: Period): { from: string; to: string; word: string } {
  const a = parts(p.from);
  const b = parts(p.to);
  const days = Math.round((Date.parse(`${p.to}T00:00:00Z`) - Date.parse(`${p.from}T00:00:00Z`)) / 86_400_000) + 1;
  if (a.d === 1 && a.y === b.y && a.m === b.m) {
    const py = a.m === 0 ? a.y - 1 : a.y;
    const pm = a.m === 0 ? 11 : a.m - 1;
    return { from: key(py, pm, 1), to: key(py, pm, Math.min(b.d, daysInMonth(py, pm))), word: 'last month' };
  }
  const to = addDaysToKey(p.from, -1);
  const from = addDaysToKey(p.from, -days);
  const word = days === 1 ? (p.name === 'today' ? 'yesterday' : 'the day before') : p.name === 'this week' || p.name === 'last week' ? 'the week before' : `the ${days} days before`;
  return { from, to, word };
}
