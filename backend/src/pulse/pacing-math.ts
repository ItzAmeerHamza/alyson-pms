/**
 * Alyson HR–compatible Weekly + Monthly pacing math for Alyson Pulse.
 * Weekly projection ≠ monthly projection — do not mix.
 */

export const WEEKLY_HOURS_TARGET = 35;
export const PACING_TARGET_HOURS_PER_WORKDAY = 7;
/** Leave credit in pacing (full weekday). Distinct from Team Time leave adjustment (7h). */
export const PACING_LEAVE_HOURS_PER_DAY = 8;
export const HALF_DAY_LEAVE_DAYS = 0.5;

export type PacingStatus =
  | 'target_met'
  | 'on_track'
  | 'behind'
  | 'at_risk'
  | 'critical';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isWeekdayDateKey(dateKey: string): boolean {
  const [y, m, d] = String(dateKey)
    .slice(0, 10)
    .split('-')
    .map((n) => parseInt(n, 10));
  if (!y || !m || !d) return false;
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export function addCalendarDays(dateKey: string, delta: number): string {
  const [y, m, d] = String(dateKey)
    .slice(0, 10)
    .split('-')
    .map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Monday of the ISO-style calendar week containing dateKey. */
export function mondayKey(dateKey: string): string {
  const [y, m, d] = String(dateKey)
    .slice(0, 10)
    .split('-')
    .map((n) => parseInt(n, 10));
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0=Sun
  const fromMon = (dow + 6) % 7;
  return addCalendarDays(dateKey, -fromMon);
}

export function eachDateKeyInclusive(startKey: string, endKey: string): string[] {
  const start = String(startKey).slice(0, 10);
  const end = String(endKey).slice(0, 10);
  if (end < start) return [];
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return out;
}

export function weekdayKeysInclusive(startKey: string, endKey: string): string[] {
  return eachDateKeyInclusive(startKey, endKey).filter(isWeekdayDateKey);
}

export function lastDayOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map((n) => parseInt(n, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthKey}-${String(last).padStart(2, '0')}`;
}

export function resolvePacingStatus(input: {
  hoursWorked: number;
  projectedPace: number;
  hoursRemaining: number;
  remainingWorkDays: number;
  targetHours: number;
}): PacingStatus {
  const { hoursWorked, projectedPace, hoursRemaining, remainingWorkDays, targetHours } = input;
  if (hoursWorked >= targetHours) return 'target_met';
  if (projectedPace >= targetHours) return 'on_track';
  if (remainingWorkDays <= 0 && hoursRemaining > 0) return 'critical';
  if (projectedPace < targetHours * 0.65 || (remainingWorkDays <= 1 && hoursRemaining > 8)) {
    return 'critical';
  }
  if (projectedPace < targetHours * 0.85) return 'at_risk';
  if (projectedPace < targetHours - 0.5) return 'behind';
  return 'on_track';
}

export function leaveHoursFromFraction(dayFraction: number): number {
  const f = Math.max(0, Math.min(1, Number(dayFraction) || 0));
  return round2(f * PACING_LEAVE_HOURS_PER_DAY);
}

/**
 * Weekly projection (HR):
 * sample = Mon..min(Thu, rollup) weekdays
 * projected = sum(sample) + mean(sample)
 */
export function projectWeeklyPace(dailyHoursSample: number[]): {
  avgDailyPace: number;
  projectedPace: number;
} {
  if (!dailyHoursSample.length) {
    return { avgDailyPace: 0, projectedPace: 0 };
  }
  const sum = dailyHoursSample.reduce((a, b) => a + b, 0);
  const avg = sum / dailyHoursSample.length;
  return {
    avgDailyPace: round2(avg),
    projectedPace: round2(sum + avg),
  };
}

/**
 * Monthly / custom-period projection (HR):
 * projected = worked + avg × remainingWorkDays  (or worked if remaining=0)
 */
export function projectMonthlyPace(input: {
  hoursWorked: number;
  dailyHoursSample: number[];
  remainingWorkDays: number;
}): {
  avgDailyPace: number;
  projectedPace: number;
} {
  const { hoursWorked, dailyHoursSample, remainingWorkDays } = input;
  if (!dailyHoursSample.length) {
    return {
      avgDailyPace: 0,
      projectedPace: round2(hoursWorked),
    };
  }
  const avg = dailyHoursSample.reduce((a, b) => a + b, 0) / dailyHoursSample.length;
  const projected =
    remainingWorkDays > 0 ? hoursWorked + avg * remainingWorkDays : hoursWorked;
  return {
    avgDailyPace: round2(avg),
    projectedPace: round2(projected),
  };
}

export function buildPacingDerived(input: {
  hoursWorked: number;
  projectedPace: number;
  targetHours: number;
  remainingWorkDays: number;
}) {
  const { hoursWorked, projectedPace, targetHours, remainingWorkDays } = input;
  const hoursRemaining =
    hoursWorked < targetHours ? round2(Math.max(0, targetHours - hoursWorked)) : 0;
  const hoursOver =
    hoursWorked >= targetHours ? round2(Math.max(0, hoursWorked - targetHours)) : 0;
  const requiredHoursPerDay =
    remainingWorkDays > 0
      ? round2(hoursRemaining / remainingWorkDays)
      : round2(hoursRemaining);
  const paceDelta = round2(projectedPace - targetHours);
  const status = resolvePacingStatus({
    hoursWorked,
    projectedPace,
    hoursRemaining,
    remainingWorkDays,
    targetHours,
  });
  return {
    hoursRemaining,
    hoursOver,
    requiredHoursPerDay,
    paceDelta,
    status,
  };
}

/** Filter weekdays to on/after started_on. */
export function employmentWeekdays(
  weekdays: string[],
  startedOn: string | null | undefined,
): string[] {
  const start = startedOn ? String(startedOn).slice(0, 10) : null;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return weekdays;
  return weekdays.filter((d) => d >= start);
}

export function weeklySampleKeys(weekMonday: string, rollupDay: string): string[] {
  const thu = addCalendarDays(weekMonday, 3);
  const sampleEnd = rollupDay < thu ? rollupDay : thu;
  if (sampleEnd < weekMonday) return [];
  return weekdayKeysInclusive(weekMonday, sampleEnd);
}

export type PacingRowInput = {
  hoursWorkedLogged: number;
  leaveHoursCredit: number;
  /** Manual / non-leave adjustments (optional). */
  otherAdjustmentHours?: number;
  targetHours: number;
  dailyHoursSample: number[];
  remainingWorkDays: number;
  mode: 'weekly' | 'monthly';
};

export function computePacingRowMetrics(input: PacingRowInput) {
  const other = Number(input.otherAdjustmentHours) || 0;
  const hoursWorkedLogged = round2(input.hoursWorkedLogged);
  const leaveHoursCredit = round2(input.leaveHoursCredit);
  const hoursWorked = round2(hoursWorkedLogged + leaveHoursCredit + other);

  const projected =
    input.mode === 'weekly'
      ? projectWeeklyPace(input.dailyHoursSample)
      : projectMonthlyPace({
          hoursWorked,
          dailyHoursSample: input.dailyHoursSample,
          remainingWorkDays: input.remainingWorkDays,
        });

  const derived = buildPacingDerived({
    hoursWorked,
    projectedPace: projected.projectedPace,
    targetHours: input.targetHours,
    remainingWorkDays: input.remainingWorkDays,
  });

  return {
    hoursWorkedLogged,
    leaveHoursCredit,
    otherAdjustmentHours: round2(other),
    hoursWorked,
    targetHours: round2(input.targetHours),
    avgDailyPace: projected.avgDailyPace,
    projectedPace: projected.projectedPace,
    ...derived,
  };
}
