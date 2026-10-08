import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAVE_CREDIT_HOURS_PER_DAY,
  extractLeaveDateKeysFromText,
  isWeekdayDateKey,
  leaveCreditSecondsPerDay,
  leaveDaysInclusive,
  leaveWeekdayKeys,
  matchesTeamLeave,
  matchesTeamLocation,
  parseLeaveDateKey,
  TEAM_LEAVE_ALL_TEAMS,
  textLooksLikeOfficeHoliday,
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

  it('matches country-wide holidays and keeps location team leave', () => {
    expect(
      matchesTeamLeave({
        employeeCountry: 'India',
        leaveCountry: 'India',
      }),
    ).toBe(true);
    expect(
      matchesTeamLeave({
        employeeCountry: 'india',
        leaveCountry: 'India',
      }),
    ).toBe(true);
    expect(
      matchesTeamLeave({
        employeeLocation: 'Pune',
        leaveCountry: 'India',
      }),
    ).toBe(true);
    expect(
      matchesTeamLeave({
        employeeLocation: 'Lahore',
        leaveCountry: 'India',
      }),
    ).toBe(false);
    expect(
      matchesTeamLeave({
        employeeCountry: 'Pakistan',
        leaveCountry: 'India',
      }),
    ).toBe(false);
    expect(
      matchesTeamLeave({
        employeeCountry: '',
        leaveCountry: 'India',
      }),
    ).toBe(false);
    expect(
      matchesTeamLeave({
        employeeLocation: 'Lahore',
        employeeTeam: 'Checkout',
        leaveLocation: 'Lahore',
        leaveTeam: 'Checkout',
      }),
    ).toBe(true);
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

  it('parses holiday notice dates sent 3–4 days ahead', () => {
    expect(parseLeaveDateKey('4th September ,2026')).toBe('2026-09-04');
    expect(parseLeaveDateKey('September 4, 2026')).toBe('2026-09-04');
    expect(parseLeaveDateKey('2026-09-04')).toBe('2026-09-04');
    expect(
      extractLeaveDateKeysFromText(
        'Pune Office Closed for Janmashtami - 4th September ,2026',
      ),
    ).toEqual(['2026-09-04']);
    expect(textLooksLikeOfficeHoliday('Pune Office Closed for Janmashtami')).toBe(true);
    expect(textLooksLikeOfficeHoliday('I will be on personal leave tomorrow')).toBe(false);
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
