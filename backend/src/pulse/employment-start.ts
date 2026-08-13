/**
 * Prorate Email Reporting expected hours from the employee start date.
 * Weekdays before started_on are not expected (no low-hours penalty).
 */

export function normalizeStartedOn(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Weekdays in dayKeys that are on/after started_on (null start = all days). */
export function employmentWeekdayKeys(
  dayKeys: string[],
  startedOn: string | null | undefined,
): string[] {
  const start = normalizeStartedOn(startedOn);
  if (!start) return dayKeys;
  return dayKeys.filter((d) => d >= start);
}

/**
 * Expected hours for a reporting window.
 * - If started after the window ends → null (exclude from report)
 * - Else hoursPerDay × employment weekdays in the window
 */
export function expectedHoursForEmployment(params: {
  dayKeys: string[];
  startedOn?: string | null;
  hoursPerDay: number;
  periodEnd: string;
}): { expectedHours: number; employmentDays: string[]; exclude: boolean } {
  const start = normalizeStartedOn(params.startedOn);
  if (start && start > params.periodEnd) {
    return { expectedHours: 0, employmentDays: [], exclude: true };
  }
  const employmentDays = employmentWeekdayKeys(params.dayKeys, start);
  const expectedHours =
    Math.round(employmentDays.length * params.hoursPerDay * 10) / 10;
  return { expectedHours, employmentDays, exclude: false };
}
