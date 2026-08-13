import { describe, expect, it } from 'vitest';
import {
  isWeekdayDateKey,
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
});
