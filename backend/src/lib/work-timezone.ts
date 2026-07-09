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
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
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

export function startOfWorkDayIso(date = new Date(), tz = WORK_TIMEZONE): string {
  const p = getWorkTzParts(date, tz);
  return new Date(workTimezoneDateTimeToUtc(p.year, p.month, p.day, 0, 0, 0, tz)).toISOString();
}

export function endOfWorkDayExclusiveIso(date = new Date(), tz = WORK_TIMEZONE): string {
  const p = getWorkTzParts(date, tz);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return new Date(
    workTimezoneDateTimeToUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      0,
      0,
      0,
      tz,
    ),
  ).toISOString();
}

export function getWorkTimezone(): string {
  return WORK_TIMEZONE;
}
