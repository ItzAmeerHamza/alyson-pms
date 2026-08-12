/**
 * Company work-day boundaries (Time Doctor "Company Time Zone").
 *
 * PLATFORM RULES:
 * 1. Main process owns the timezone after workspace settings load.
 * 2. Renderer has a separate module copy — it MUST sync via IPC
 *    (get-work-day-context / work-timezone-updated / stats.workDay).
 * 3. Employee personal TZ (Karachi, etc.) never defines "today".
 * 4. Overnight / odd-hour shifts are normal: clamp session elapsed to
 *    company midnight; do not invent wall-clock-since-wrong-midnight.
 *
 * Default fallback: America/Los_Angeles until company TZ is applied.
 * Override: WORK_TIMEZONE env or config.work_timezone / WORK_TIMEZONE.
 */

function isValidIanaTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function resolveWorkTimezone(config = global?.config) {
  const candidate =
    config?.work_timezone ||
    config?.WORK_TIMEZONE ||
    process.env.WORK_TIMEZONE ||
    'America/Los_Angeles';
  return isValidIanaTimezone(candidate) ? String(candidate).trim() : 'America/Los_Angeles';
}

let _tz = 'America/Los_Angeles';

function setWorkTimezone(tz) {
  _tz = isValidIanaTimezone(tz) ? String(tz).trim() : 'America/Los_Angeles';
  return _tz;
}

function getWorkTimezone() {
  return _tz;
}

function initWorkTimezone(config = global?.config) {
  setWorkTimezone(resolveWorkTimezone(config));
  return _tz;
}

function getWorkTzParts(date = new Date(), tz = _tz) {
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
  return Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, parseInt(p.value, 10)]),
  );
}

function getWorkTimezoneOffsetMs(date, tz = _tz) {
  const parts = getWorkTzParts(date, tz);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function workTimezoneDateTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0, tz = _tz) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = getWorkTimezoneOffsetMs(new Date(utcGuess), tz);
  let result = utcGuess - offset1;
  const offset2 = getWorkTimezoneOffsetMs(new Date(result), tz);
  if (offset2 !== offset1) {
    result = utcGuess - offset2;
  }
  return result;
}

function addCalendarDaysYmd(year, month, day, deltaDays) {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** YYYY-MM-DD in the work timezone (not UTC, not machine local). */
function workDateKey(date = new Date(), tz = _tz) {
  const p = getWorkTzParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function startOfWorkDay(date = new Date(), tz = _tz) {
  const p = getWorkTzParts(date, tz);
  return new Date(workTimezoneDateTimeToUtc(p.year, p.month, p.day, 0, 0, 0, tz));
}

function endOfWorkDayExclusive(date = new Date(), tz = _tz) {
  const p = getWorkTzParts(date, tz);
  const next = addCalendarDaysYmd(p.year, p.month, p.day, 1);
  return new Date(workTimezoneDateTimeToUtc(next.year, next.month, next.day, 0, 0, 0, tz));
}

function secondsWithinWorkDay(startMs, endMs, dayRef = new Date(), tz = _tz) {
  const dayStartMs = startOfWorkDay(dayRef, tz).getTime();
  const dayEndMs = endOfWorkDayExclusive(dayRef, tz).getTime();
  const effectiveStart = Math.max(startMs, dayStartMs);
  const effectiveEnd = Math.min(endMs, dayEndMs);
  if (effectiveEnd <= effectiveStart) return 0;
  return Math.max(0, Math.floor((effectiveEnd - effectiveStart) / 1000));
}

function elapsedSecondsSinceWorkMidnight(sessionStart, nowMs = Date.now(), tz = _tz) {
  if (!sessionStart) return 0;
  const startMs = new Date(sessionStart).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const dayStartMs = startOfWorkDay(new Date(nowMs), tz).getTime();
  const effectiveStart = Math.max(startMs, dayStartMs);
  return Math.max(0, Math.floor((nowMs - effectiveStart) / 1000));
}

function formatWorkTimezoneLabel(tz = _tz) {
  if (tz === 'America/Chicago') return 'Central Time';
  if (tz === 'America/Los_Angeles') return 'Pacific Time';
  return tz.replace(/_/g, ' ');
}

/** Wall-clock time in work TZ, e.g. "17:46" (24h) or "5:46 PM". */
function formatWorkTime(value, { hour12 = false } = {}, tz = _tz) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  });
}

/** Short date in work TZ, e.g. "Jul 16". */
function formatWorkDateShort(value, tz = _tz) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  });
}

function nextWorkDayMidnight(date = new Date(), tz = _tz) {
  return endOfWorkDayExclusive(date, tz);
}

function workDayBoundsForYmd(year, month, day, tz = _tz) {
  const startMs = workTimezoneDateTimeToUtc(year, month, day, 0, 0, 0, tz);
  const next = addCalendarDaysYmd(year, month, day, 1);
  const endMs = workTimezoneDateTimeToUtc(next.year, next.month, next.day, 0, 0, 0, tz);
  return { startMs, endMs };
}

function workMonthBounds(date = new Date(), tz = _tz) {
  const p = getWorkTzParts(date, tz);
  const startMs = workTimezoneDateTimeToUtc(p.year, p.month, 1, 0, 0, 0, tz);
  const nextMonth = p.month === 12
    ? { year: p.year + 1, month: 1 }
    : { year: p.year, month: p.month + 1 };
  const endExclusiveMs = workTimezoneDateTimeToUtc(nextMonth.year, nextMonth.month, 1, 0, 0, 0, tz);
  const daysInMonth = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  return { year: p.year, month: p.month, startMs, endExclusiveMs, daysInMonth };
}

/**
 * Authoritative work-day snapshot for IPC / renderer sync.
 * Main should attach this to stats and tray day events.
 */
function getWorkDayContext(date = new Date(), tz = _tz) {
  const timezone = isValidIanaTimezone(tz) ? String(tz).trim() : getWorkTimezone();
  const now = date instanceof Date ? date : new Date(date);
  const nowMs = now.getTime();
  const dayStartMs = startOfWorkDay(now, timezone).getTime();
  const nextMidnightMs = nextWorkDayMidnight(now, timezone).getTime();
  return {
    timezone,
    todayKey: workDateKey(now, timezone),
    dayStartMs,
    nextMidnightMs,
    secondsElapsedInDay: Math.max(0, Math.floor((nowMs - dayStartMs) / 1000)),
    label: formatWorkTimezoneLabel(timezone),
  };
}

module.exports = {
  resolveWorkTimezone,
  initWorkTimezone,
  setWorkTimezone,
  getWorkTimezone,
  isValidIanaTimezone,
  getWorkTzParts,
  workDateKey,
  startOfWorkDay,
  endOfWorkDayExclusive,
  secondsWithinWorkDay,
  elapsedSecondsSinceWorkMidnight,
  formatWorkTimezoneLabel,
  formatWorkTime,
  formatWorkDateShort,
  nextWorkDayMidnight,
  workDayBoundsForYmd,
  workMonthBounds,
  getWorkDayContext,
};
