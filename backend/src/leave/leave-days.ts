import { eachWorkDateKey, normalizeWorkTimezone } from '../lib/work-timezone';
import {
  canonicalCountry,
  countriesMatch,
  countryFromOffice,
} from './holiday-country';

export const LEAVE_TYPES = ['annual', 'sick', 'personal', 'unpaid', 'other', 'holiday'] as const;
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

const MONTH_NUM: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function ymd(year: number, month: number, day: number): string | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day, 12));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

/** Parse a leave/holiday date to YYYY-MM-DD (ISO, “4th September, 2026”, “Sep 4 2026”). */
export function parseLeaveDateKey(
  value: unknown,
  opts?: { yearHint?: number },
): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || '').trim();
  if (!raw) return null;

  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const monthFirst = raw.match(
    new RegExp(
      `\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})\\b`,
      'i',
    ),
  );
  if (monthFirst) {
    const month = MONTH_NUM[monthFirst[1].toLowerCase()];
    return ymd(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }

  const dayFirst = raw.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\s*,?\\s*(\\d{4})\\b`,
      'i',
    ),
  );
  if (dayFirst) {
    const month = MONTH_NUM[dayFirst[2].toLowerCase()];
    return ymd(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }

  const yearHint = opts?.yearHint;
  if (yearHint && yearHint >= 2000 && yearHint <= 2100) {
    const dayFirstNoYear = raw.match(
      new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\b`, 'i'),
    );
    if (dayFirstNoYear) {
      const month = MONTH_NUM[dayFirstNoYear[2].toLowerCase()];
      return ymd(yearHint, month, Number(dayFirstNoYear[1]));
    }
    const monthFirstNoYear = raw.match(
      new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'),
    );
    if (monthFirstNoYear) {
      const month = MONTH_NUM[monthFirstNoYear[1].toLowerCase()];
      return ymd(yearHint, month, Number(monthFirstNoYear[2]));
    }
  }

  return null;
}

/** All YYYY-MM-DD keys found in people-ops copy (holiday notices often use “4th September, 2026”). */
export function extractLeaveDateKeysFromText(
  text: unknown,
  opts?: { yearHint?: number },
): string[] {
  const blob = String(text || '');
  if (!blob.trim()) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (key: string | null) => {
    if (key && !seen.has(key)) {
      seen.add(key);
      found.push(key);
    }
  };

  for (const m of blob.matchAll(/(\d{4}-\d{2}-\d{2})/g)) {
    push(parseLeaveDateKey(m[1]));
  }
  const dayFirstRe = new RegExp(
    `(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_RE})\\s*,?\\s*\\d{4})`,
    'gi',
  );
  for (const m of blob.matchAll(dayFirstRe)) {
    push(parseLeaveDateKey(m[1], opts));
  }
  const monthFirstRe = new RegExp(
    `((?:${MONTH_RE})\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*,?\\s*\\d{4})`,
    'gi',
  );
  for (const m of blob.matchAll(monthFirstRe)) {
    push(parseLeaveDateKey(m[1], opts));
  }
  if (!found.length && opts?.yearHint) {
    push(parseLeaveDateKey(blob, opts));
  }
  return found;
}

/** Office-closed / public-holiday copy, including notices sent a few days ahead. */
export function textLooksLikeOfficeHoliday(text: unknown): boolean {
  const blob = String(text || '');
  return (
    /office\s+(will\s+(remain|be)\s+)?closed/i.test(blob) ||
    /will\s+(remain|be)\s+closed/i.test(blob) ||
    /public\s+holiday|national\s+holiday/i.test(blob) ||
    /(?:pune|lahore|karachi|mumbai|delhi|india|pakistan).{0,80}closed/i.test(blob) ||
    /closed\s+for\s+[a-z]/i.test(blob)
  );
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

export function matchesTeamLeave(input: {
  employeeCountry?: unknown;
  employeeLocation?: unknown;
  employeeTeam?: unknown;
  leaveCountry?: unknown;
  leaveLocation?: unknown;
  leaveTeam?: unknown;
}): boolean {
  const leaveCountry = canonicalCountry(input.leaveCountry);
  if (leaveCountry) {
    const empCountry =
      canonicalCountry(input.employeeCountry) || countryFromOffice(input.employeeLocation);
    return countriesMatch(empCountry, leaveCountry);
  }
  return matchesTeamLocation(
    input.employeeLocation,
    input.employeeTeam,
    input.leaveLocation,
    input.leaveTeam,
  );
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
