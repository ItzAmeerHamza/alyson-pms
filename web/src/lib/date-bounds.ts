import { endOfDay, parseISO, startOfDay } from 'date-fns';

/** Interpret yyyy-MM-dd as a local calendar day (not UTC midnight). */
export function dayBoundsFromDateString(dateStr: string): { start: Date; end: Date } {
  const day = parseISO(dateStr);
  return { start: startOfDay(day), end: endOfDay(day) };
}

export function isCapturedOnLocalDate(capturedAt: string, dateStr: string): boolean {
  const { start, end } = dayBoundsFromDateString(dateStr);
  const t = new Date(capturedAt).getTime();
  return t >= start.getTime() && t <= end.getTime();
}
