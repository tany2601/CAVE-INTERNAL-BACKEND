// Branches operate in India; Asia/Kolkata has no DST (UTC+05:30).
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type ReportPeriod = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL_TIME' | 'CUSTOM';

/** Calendar day (YYYY-MM-DD) in IST for an instant. */
export const dayKey = (date: Date = new Date()): string =>
  new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** The UTC instant at which an IST calendar day starts. */
export const dayStart = (key: string): Date =>
  new Date(Date.parse(`${key}T00:00:00Z`) - IST_OFFSET_MS);

/** Value for a `@db.Date` column (stored as the plain calendar day). */
export const dayDate = (key: string): Date => new Date(`${key}T00:00:00Z`);

const addDays = (key: string, days: number): string =>
  new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

export { addDays as addDaysToKey };

/** [start, end) instants for a period; both null for ALL_TIME (end null = open ended). */
export function periodRange(
  period: ReportPeriod,
  now: Date = new Date(),
  custom?: { from?: string; to?: string },
): { start: Date | null; end: Date | null } {
  if (period === 'ALL_TIME') return { start: null, end: null };
  if (period === 'CUSTOM') {
    // Inclusive calendar days (IST). A missing bound leaves that side open.
    const from = custom?.from;
    const to = custom?.to ?? custom?.from;
    return {
      start: from ? dayStart(from) : null,
      end: to ? dayStart(addDays(to, 1)) : null,
    };
  }
  const today = dayKey(now);
  let startKey = today;
  if (period === 'THIS_WEEK') {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    startKey = addDays(today, -((dow + 6) % 7));
  } else if (period === 'THIS_MONTH') {
    startKey = `${today.slice(0, 7)}-01`;
  }
  return { start: dayStart(startKey), end: null };
}

/** [start, end) instants for a calendar month (month is 1-12). */
export function monthRange(year: number, month: number) {
  const startKey = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start: dayStart(startKey), end: dayStart(next), startKey, nextKey: next };
}

/** Whole minutes between two instants (never negative). */
export const minutesBetween = (a: Date | null | undefined, b: Date | null | undefined) =>
  a && b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000)) : 0;
