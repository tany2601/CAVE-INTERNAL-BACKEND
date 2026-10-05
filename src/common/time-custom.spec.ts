import { describe, it, expect } from 'vitest';
import { dayStart, periodRange } from './time.util.js';

describe('periodRange CUSTOM', () => {
  it('covers whole IST days, inclusive of the last day', () => {
    const { start, end } = periodRange('CUSTOM', new Date(), { from: '2026-10-01', to: '2026-10-03' });
    expect(start?.toISOString()).toBe(dayStart('2026-10-01').toISOString());
    expect(end?.toISOString()).toBe(dayStart('2026-10-04').toISOString());
  });

  it('a single day when only "from" is given', () => {
    const { start, end } = periodRange('CUSTOM', new Date(), { from: '2026-10-05' });
    expect(end!.getTime() - start!.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('is open ended with no dates', () => {
    expect(periodRange('CUSTOM')).toEqual({ start: null, end: null });
  });
});
