import { eachWorkDateKey, normalizeWorkTimezone } from '../lib/work-timezone';

export const LEAVE_TYPES = ['annual', 'sick', 'personal', 'unpaid', 'other'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const TEAM_LEAVE_ALL_TEAMS = '__all_teams__';

/** Default pacing credit per leave weekday (matches Pulse low-hours hoursPerDay). */
export const DEFAULT_LEAVE_CREDIT_HOURS_PER_DAY = 7;

export function isLeaveType(value: unknown): value is LeaveType {
  return typeof value === 'string' && (LEAVE_TYPES as readonly string[]).includes(value);
}

/** Civil YYYY-MM-DD weekday (Mon–Fri) via UTC noon — date key is the work calendar day. */
export function isWeekdayDateKey(dateKey: string): boolean {
  const [y, m, d] = String(dateKey)
    .slice(0, 10)
    .split('-')
    .map((n) => parseInt(n, 10));
  if (!y || !m || !d) return false;
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

/** Inclusive weekday YYYY-MM-DD keys between start and end (company work calendar). */
export function leaveWeekdayKeys(
  startDate: string,
  endDate: string,
  _workTz?: string,
): string[] {
  const start = String(startDate).slice(0, 10);
  const end = String(endDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return [];
  }
  if (end < start) return [];
  // eachWorkDateKey walks civil days; TZ only affects DST boundary ms, keys stay calendar dates.
  const tz = normalizeWorkTimezone(_workTz);
  return eachWorkDateKey(start, end, tz).filter(isWeekdayDateKey);
}

export function leaveDaysInclusive(startDate: string, endDate: string, workTz?: string): number {
  return leaveWeekdayKeys(startDate, endDate, workTz).length;
}

export function leaveCreditSecondsPerDay(hoursPerDay?: number): number {
  const h =
    typeof hoursPerDay === 'number' && Number.isFinite(hoursPerDay) && hoursPerDay > 0
      ? hoursPerDay
      : DEFAULT_LEAVE_CREDIT_HOURS_PER_DAY;
  return Math.round(h * 3600);
}

export function normLeaveFacet(value: unknown, fallback: string): string {
  const v = String(value || '').trim();
  return v || fallback;
}

export function isAllTeamsLeave(team: unknown): boolean {
  return team === TEAM_LEAVE_ALL_TEAMS;
}

export function matchesTeamLocation(
  employeeLocation: unknown,
  employeeTeam: unknown,
  leaveLocation: unknown,
  leaveTeam: unknown,
): boolean {
  const locMatch =
    normLeaveFacet(employeeLocation, 'Unknown') ===
    normLeaveFacet(leaveLocation, 'Unknown');
  if (!locMatch) return false;
  if (isAllTeamsLeave(leaveTeam)) return true;
  return (
    normLeaveFacet(employeeTeam, 'Unassigned') ===
    normLeaveFacet(leaveTeam, 'Unassigned')
  );
}
