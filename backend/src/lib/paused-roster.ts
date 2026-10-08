import { normalizeWorkTimezone, workDateKey, workDayBoundsMs } from './work-timezone';

export function addCalendarDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Monday (YYYY-MM-DD) of the ISO week containing dateKey. */
export function mondayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const fromMon = (dow + 6) % 7;
  return addCalendarDays(dateKey, -fromMon);
}

/** Sunday (YYYY-MM-DD) of the ISO week containing dateKey. */
export function sundayKey(dateKey: string): string {
  return addCalendarDays(mondayKey(dateKey), 6);
}

/** Calendar month (YYYY-MM) that owns this Mon–Fri week (most weekdays; ties → later month). */
export function weekHomeMonth(monday: string): string {
  const counts = new Map<string, number>();
  for (let i = 0; i < 5; i++) {
    const mk = addCalendarDays(monday, i).slice(0, 7);
    counts.set(mk, (counts.get(mk) || 0) + 1);
  }
  let best = monday.slice(0, 7);
  let bestN = -1;
  for (const [mk, n] of counts) {
    if (n > bestN || (n === bestN && mk > best)) {
      best = mk;
      bestN = n;
    }
  }
  return best;
}

/**
 * Mondays of Mon–Fri work weeks that belong to YYYY-MM.
 * A week belongs to the month with more weekdays, so Aug 31–Sep 4 is
 * September week 1 (35h), not August week 5 (175h).
 */
export function mondaysOverlappingMonth(monthKey: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return [];
  const [y, m] = monthKey.split('-').map((n) => parseInt(n, 10));
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const mondays: string[] = [];
  let cursor = mondayKey(first);
  while (cursor <= last) {
    if (weekHomeMonth(cursor) === monthKey) mondays.push(cursor);
    cursor = addCalendarDays(cursor, 7);
  }
  return mondays;
}

/**
 * Resolve the Mon–Fri checkpoint for monthly pacing.
 * An explicit Monday (including a spillover start like Aug 31 for September)
 * is kept even when it is not in `mondays` — callers must not overwrite it
 * with mondays[weekIndex - 1].
 */
export function resolveMonthWeekCheckpoint(opts: {
  mondays: string[];
  weekIndex?: number;
  weekStart?: string | null;
  todayKey: string;
}): {
  weekIndex: number;
  checkpointMonday: string;
  periodStart: string;
} {
  const mondays = (opts.mondays || []).filter(Boolean);
  const rawStart = String(opts.weekStart || '').trim();
  const explicit = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? mondayKey(rawStart) : '';
  let weekIndex = Number(opts.weekIndex);

  let checkpointMonday: string;
  if (explicit) {
    checkpointMonday = explicit;
    const idx = mondays.indexOf(explicit);
    if (idx >= 0) {
      weekIndex = idx + 1;
    } else if (!Number.isFinite(weekIndex) || weekIndex < 1) {
      weekIndex = 1;
    } else {
      weekIndex = Math.max(1, Math.round(weekIndex));
    }
  } else {
    if (!Number.isFinite(weekIndex) || weekIndex < 1) {
      weekIndex = mondays.filter((m) => m <= opts.todayKey).length || 1;
    }
    weekIndex = Math.min(
      Math.max(1, Math.round(weekIndex)),
      Math.max(1, mondays.length),
    );
    checkpointMonday = mondays[weekIndex - 1] || '';
  }

  const firstMonday = mondays[0] || checkpointMonday;
  const periodStart =
    firstMonday && checkpointMonday && firstMonday <= checkpointMonday
      ? firstMonday
      : checkpointMonday || firstMonday;

  return { weekIndex, checkpointMonday, periodStart };
}

/**
 * Inclusive calendar day for an exclusive timestamptz bound.
 * `2026-09-07T07:00:00.000Z` (Mon 00:00 PT) → `2026-09-06`.
 */
export function inclusiveWorkDateKeyFromRangeEnd(
  end: string | Date,
  tz?: string,
): string {
  const zone = normalizeWorkTimezone(tz);
  const endDate = end instanceof Date ? end : new Date(end);
  const key = workDateKey(endDate, zone);
  if (endDate.getTime() <= workDayBoundsMs(key, zone).startMs) {
    return addCalendarDays(key, -1);
  }
  return key;
}

/**
 * A paused employee appears on a report iff that report's inclusive end
 * is still in or before the Sunday of the week they were removed.
 * Week 1 removal → visible on week 1 (even when viewed later), hidden on week 2+.
 */
export function includePausedInReport(
  pausedAt: string | Date | null | undefined,
  reportEndKey: string,
  tz?: string,
): boolean {
  if (!pausedAt) return true;
  const zone = normalizeWorkTimezone(tz);
  const pauseKey = workDateKey(
    pausedAt instanceof Date ? pausedAt : new Date(pausedAt),
    zone,
  );
  return reportEndKey <= sundayKey(pauseKey);
}

/**
 * SQL fragment matching `includePausedInReport`.
 * Pushes inclusive `reportEndKey` then timezone onto `params`.
 */
export function sqlPausedVisibleThrough(
  params: unknown[],
  reportEndKey: string,
  tz: string,
  alias = 'ext',
): string {
  const endIdx = params.length + 1;
  params.push(reportEndKey);
  const tzIdx = params.length + 1;
  params.push(normalizeWorkTimezone(tz));
  return `(${alias}.paused_at IS NULL OR $${endIdx}::date <= (date_trunc('week', timezone($${tzIdx}, ${alias}.paused_at))::date + 6))`;
}
