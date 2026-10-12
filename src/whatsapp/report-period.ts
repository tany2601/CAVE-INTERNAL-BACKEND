export type ReportKind = 'daily' | 'weekly' | 'monthly';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tue, 6 Oct 2026" / "28 Sep – 4 Oct 2026" / "September 2026" for IST day keys. */
export function periodLabel(kind: ReportKind | 'test', from: string, to: string): string {
  const parts = (key: string) => {
    const d = new Date(`${key}T00:00:00Z`);
    return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), weekday: d.getUTCDay() };
  };
  const f = parts(from);
  const t = parts(to);
  if (kind === 'monthly') return `${MONTHS_LONG[f.month]} ${f.year}`;
  if (from === to) return `${WEEKDAYS[f.weekday]}, ${f.day} ${MONTHS[f.month]} ${f.year}`;
  return `${f.day} ${MONTHS[f.month]} – ${t.day} ${MONTHS[t.month]} ${t.year}`;
}
