import { describe, it, expect } from 'vitest';
import { dayDate, dayKey, dayStart, monthRange, periodRange } from './time.util.js';

describe('time.util (IST business days)', () => {
  it('rolls the business day over at IST midnight, not UTC midnight', () => {
    // 2026-10-04 19:00 UTC is already 00:30 on the 5th in IST.
    expect(dayKey(new Date('2026-10-04T19:00:00Z'))).toBe('2026-10-05');
    expect(dayKey(new Date('2026-10-04T18:29:00Z'))).toBe('2026-10-04');
  });

  it('dayStart is the UTC instant of IST midnight', () => {
    expect(dayStart('2026-10-05').toISOString()).toBe('2026-10-04T18:30:00.000Z');
  });

  it('dayDate is the plain calendar day for @db.Date columns', () => {
    expect(dayDate('2026-10-05').toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  it('week starts on Monday and month on the 1st', () => {
    const sunday = new Date('2026-10-04T08:00:00Z'); // Sunday in IST too
    expect(periodRange('THIS_WEEK', sunday).start?.toISOString()).toBe(
      dayStart('2026-09-28').toISOString(),
    );
    expect(periodRange('THIS_MONTH', sunday).start?.toISOString()).toBe(
      dayStart('2026-10-01').toISOString(),
    );
    expect(periodRange('TODAY', sunday).start?.toISOString()).toBe(
      dayStart('2026-10-04').toISOString(),
    );
  });

  it('ALL_TIME has no bounds', () => {
    expect(periodRange('ALL_TIME')).toEqual({ start: null, end: null });
  });

  it('monthRange handles December rollover', () => {
    const r = monthRange(2026, 12);
    expect(r.startKey).toBe('2026-12-01');
    expect(r.nextKey).toBe('2027-01-01');
  });
});
