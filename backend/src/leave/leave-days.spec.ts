import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAVE_CREDIT_HOURS_PER_DAY,
  isWeekdayDateKey,
  leaveCreditSecondsPerDay,
  leaveDaysInclusive,
  leaveWeekdayKeys,
  matchesTeamLocation,
  TEAM_LEAVE_ALL_TEAMS,
} from './leave-days';

describe('leave-days', () => {
  it('counts weekdays Mon–Fri only', () => {
    // 2026-08-10 Mon … 2026-08-14 Fri
    expect(leaveDaysInclusive('2026-08-10', '2026-08-14')).toBe(5);
    // includes weekend
    expect(leaveDaysInclusive('2026-08-08', '2026-08-09')).toBe(0);
    expect(leaveDaysInclusive('2026-08-07', '2026-08-10')).toBe(2); // Fri+Mon
  });

  it('isWeekdayDateKey', () => {
    expect(isWeekdayDateKey('2026-08-10')).toBe(true);
    expect(isWeekdayDateKey('2026-08-09')).toBe(false);
  });

  it('leaveWeekdayKeys expands inclusive', () => {
    expect(leaveWeekdayKeys('2026-08-10', '2026-08-12')).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ]);
  });

  it('matchesTeamLocation', () => {
    expect(matchesTeamLocation('Lahore', 'Checkout', 'Lahore', 'Checkout')).toBe(true);
    expect(matchesTeamLocation('Lahore', 'Checkout', 'Lahore', TEAM_LEAVE_ALL_TEAMS)).toBe(
      true,
    );
    expect(matchesTeamLocation('Lahore', 'Checkout', 'Karachi', 'Checkout')).toBe(false);
  });

  it('returns no days for inverted or invalid ranges', () => {
    expect(leaveDaysInclusive('2026-08-14', '2026-08-10')).toBe(0);
    expect(leaveWeekdayKeys('not-a-date', '2026-08-10')).toEqual([]);
  });

  it('credits 7h per weekday by default (Team Time leave adjustment)', () => {
    expect(DEFAULT_LEAVE_CREDIT_HOURS_PER_DAY).toBe(7);
    expect(leaveCreditSecondsPerDay()).toBe(7 * 3600);
    expect(leaveCreditSecondsPerDay(7)).toBe(25200);
  });

  it('uses a custom hours-per-day credit and rejects non-positive values', () => {
    expect(leaveCreditSecondsPerDay(8)).toBe(8 * 3600);
    expect(leaveCreditSecondsPerDay(0)).toBe(7 * 3600);
    expect(leaveCreditSecondsPerDay(-3)).toBe(7 * 3600);
  });
});
