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
 * Default fallback: America/Los_Angeles (company Pacific).
 * A saved workspace timezone still wins. Override: WORK_TIMEZONE env
 * or config.work_timezone / WORK_TIMEZONE.
 */

const DEFAULT_WORK_TIMEZONE = 'America/Los_Angeles';

// Validation builds an Intl formatter (slow); it was rebuilt on every
// stats / work-day IPC. Zones don't change validity, so remember the answer.
const _tzValidity = new Map();

function isValidIanaTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  const key = tz.trim();
  const known = _tzValidity.get(key);
  if (known !== undefined) return known;
  let ok;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: key }).format(new Date());
    ok = true;
  } catch {
    ok = false;
  }
  if (_tzValidity.size < 100) _tzValidity.set(key, ok);
  return ok;
}

/** Cached Intl formatter per (time zone + options) — toLocale*String builds a new one per call. */
const _fmtCache = new Map();
function cachedFormatter(tz, options) {
  const key = `${tz}|${JSON.stringify(options)}`;
  let fmt = _fmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...options });
    if (_fmtCache.size < 200) _fmtCache.set(key, fmt);
  }
  return fmt;
}

function resolveWorkTimezone(config = global?.config) {
  const candidate =
    config?.work_timezone ||
    config?.WORK_TIMEZONE ||
    process.env.WORK_TIMEZONE ||
    DEFAULT_WORK_TIMEZONE;
  return isValidIanaTimezone(candidate) ? String(candidate).trim() : DEFAULT_WORK_TIMEZONE;
}

let _tz = DEFAULT_WORK_TIMEZONE;

function setWorkTimezone(tz) {
  _tz = isValidIanaTimezone(tz) ? String(tz).trim() : DEFAULT_WORK_TIMEZONE;
  return _tz;
}

function getWorkTimezone() {
  return _tz;
}

function initWorkTimezone(config = global?.config) {
  setWorkTimezone(resolveWorkTimezone(config));
  return _tz;
}

// Building an Intl.DateTimeFormat is slow (~0.1ms). The monthly report calls
// this thousands of times per refresh, which froze the main thread for seconds.
const _tzFormatters = new Map();

function getTzFormatter(tz) {
  let dtf = _tzFormatters.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    _tzFormatters.set(tz, dtf);
  }
  return dtf;
}

function getWorkTzParts(date = new Date(), tz = _tz) {
  const parts = {};
  for (const p of getTzFormatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
  }
  return parts;
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

/** YYYY-MM-DD compares correctly as strings. Never roll the work day backward. */
function shouldAcceptWorkDayKey(currentKey, incomingKey) {
  if (!incomingKey || typeof incomingKey !== 'string') return false;
  if (!currentKey || typeof currentKey !== 'string') return true;
  return incomingKey >= currentKey;
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

/** Screenshot clock in the company zone, e.g. "08:54:54". */
function formatWorkClock(value, tz = _tz) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const zone = isValidIanaTimezone(tz) ? String(tz).trim() : _tz;
  return cachedFormatter(zone, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/** Wall-clock time in work TZ, e.g. "17:46" (24h) or "5:46 PM". */
function formatWorkTime(value, { hour12 = false } = {}, tz = _tz) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return cachedFormatter(tz, {
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  }).format(date);
}

/** Short date in work TZ, e.g. "Jul 16". */
function formatWorkDateShort(value, tz = _tz) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return cachedFormatter(tz, {
    month: 'short',
    day: 'numeric',
  }).format(date);
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
  shouldAcceptWorkDayKey,
  workDateKey,
  startOfWorkDay,
  endOfWorkDayExclusive,
  secondsWithinWorkDay,
  elapsedSecondsSinceWorkMidnight,
  formatWorkTimezoneLabel,
  formatWorkClock,
  formatWorkTime,
  formatWorkDateShort,
  nextWorkDayMidnight,
  workDayBoundsForYmd,
  workMonthBounds,
  getWorkDayContext,
};
