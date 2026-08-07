const WORK_TIMEZONE = process.env.WORK_TIMEZONE || 'America/Los_Angeles';

function getWorkTzParts(date = new Date(), tz = WORK_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, parseInt(p.value, 10)]),
  ) as Record<string, number>;
  return parts;
}

function getWorkTimezoneOffsetMs(date: Date, tz = WORK_TIMEZONE): number {
  const parts = getWorkTzParts(date, tz);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function workTimezoneDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  tz = WORK_TIMEZONE,
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = getWorkTimezoneOffsetMs(new Date(utcGuess), tz);
  let result = utcGuess - offset1;
  const offset2 = getWorkTimezoneOffsetMs(new Date(result), tz);
  if (offset2 !== offset1) {
    result = utcGuess - offset2;
  }
  return result;
}

/** YYYY-MM-DD in the work timezone (Pacific by default). */
export function workDateKey(date: Date | string | number = new Date(), tz = WORK_TIMEZONE): string {
  const d = date instanceof Date ? date : new Date(date);
  const p = getWorkTzParts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** UTC ms bounds for a Pacific calendar day (end exclusive). */
export function workDayBoundsMs(
  dateKey: string,
  tz = WORK_TIMEZONE,
): { startMs: number; endMs: number } {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  const startMs = workTimezoneDateTimeToUtc(y, m, d, 0, 0, 0, tz);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const endMs = workTimezoneDateTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
    tz,
  );
  return { startMs, endMs };
}

export function startOfWorkDayIso(date = new Date(), tz = WORK_TIMEZONE): string {
  const p = getWorkTzParts(date, tz);
  return new Date(workTimezoneDateTimeToUtc(p.year, p.month, p.day, 0, 0, 0, tz)).toISOString();
}

export function endOfWorkDayExclusiveIso(date = new Date(), tz = WORK_TIMEZONE): string {
  const key = workDateKey(date, tz);
  return new Date(workDayBoundsMs(key, tz).endMs).toISOString();
}

/** Inclusive Pacific date-key range → UTC ISO query window [start, endExclusive). */
export function workDateRangeToUtcIso(
  startKey: string,
  endKeyInclusive: string,
  tz = WORK_TIMEZONE,
): { startIso: string; endExclusiveIso: string } {
  const startIso = new Date(workDayBoundsMs(startKey, tz).startMs).toISOString();
  const endExclusiveIso = new Date(workDayBoundsMs(endKeyInclusive, tz).endMs).toISOString();
  return { startIso, endExclusiveIso };
}

/** List Pacific YYYY-MM-DD keys from start through end inclusive. */
export function eachWorkDateKey(startKey: string, endKeyInclusive: string): string[] {
  const days: string[] = [];
  let { startMs } = workDayBoundsMs(startKey);
  const { endMs: lastEnd } = workDayBoundsMs(endKeyInclusive);
  while (startMs < lastEnd) {
    days.push(workDateKey(new Date(startMs)));
    startMs = workDayBoundsMs(workDateKey(new Date(startMs))).endMs;
  }
  return days;
}

export function getWorkTimezone(): string {
  return WORK_TIMEZONE;
}

/** Postgres expression: calendar date in work TZ for a timestamptz column. */
export function sqlWorkDate(columnSql: string, tz = WORK_TIMEZONE): string {
  const safeTz = tz.replace(/'/g, "''");
  return `(${columnSql} AT TIME ZONE '${safeTz}')::date`;
}
