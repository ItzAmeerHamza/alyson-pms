import { describe, expect, it } from 'vitest';
import {
  employmentWeekdayKeys,
  expectedHoursForEmployment,
  normalizeStartedOn,
} from './employment-start';

describe('employment-start', () => {
  it('normalizeStartedOn', () => {
    expect(normalizeStartedOn('2026-08-05')).toBe('2026-08-05');
    expect(normalizeStartedOn('2026-08-05T12:00:00Z')).toBe('2026-08-05');
    expect(normalizeStartedOn(null)).toBe(null);
  });

  it('drops weekdays before start', () => {
    const days = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
    expect(employmentWeekdayKeys(days, '2026-08-05')).toEqual([
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
  });

  it('prorates expected hours for mid-month start', () => {
    const dayKeys = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
    const r = expectedHoursForEmployment({
      dayKeys,
      startedOn: '2026-08-05',
      hoursPerDay: 7,
      periodEnd: '2026-08-07',
    });
    expect(r.exclude).toBe(false);
    expect(r.expectedHours).toBe(21);
  });

  it('excludes employees who start after the period', () => {
    const r = expectedHoursForEmployment({
      dayKeys: ['2026-08-03', '2026-08-04'],
      startedOn: '2026-08-10',
      hoursPerDay: 7,
      periodEnd: '2026-08-07',
    });
    expect(r.exclude).toBe(true);
  });
});
