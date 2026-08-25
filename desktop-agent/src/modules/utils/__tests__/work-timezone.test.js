/**
 * Company work-day timezone must match Time Doctor Company Time Zone.
 * For Central (America/Chicago), Pakistan (UTC+5) sees day reset at 10:00 local.
 * Hardcoded Pacific must not clamp real Central-day tracked totals.
 */

const {
  setWorkTimezone,
  getWorkTimezone,
  startOfWorkDay,
  workDateKey,
  shouldAcceptWorkDayKey,
  isValidIanaTimezone,
} = require('../work-timezone');

describe('work-timezone company / Time Doctor sync', () => {
  const previousTz = getWorkTimezone();

  afterEach(() => {
    setWorkTimezone(previousTz);
  });

  it('defaults to America/Chicago when no workspace TZ is set', () => {
    const { resolveWorkTimezone } = require('../work-timezone');
    const prev = process.env.WORK_TIMEZONE;
    delete process.env.WORK_TIMEZONE;
    try {
      expect(resolveWorkTimezone({})).toBe('America/Chicago');
      expect(resolveWorkTimezone(null)).toBe('America/Chicago');
    } finally {
      if (prev === undefined) delete process.env.WORK_TIMEZONE;
      else process.env.WORK_TIMEZONE = prev;
    }
  });

  it('never accepts a work-day key that rolls backward', () => {
    expect(shouldAcceptWorkDayKey('2026-08-25', '2026-08-24')).toBe(false);
    expect(shouldAcceptWorkDayKey('2026-08-24', '2026-08-25')).toBe(true);
    expect(shouldAcceptWorkDayKey('2026-08-25', '2026-08-25')).toBe(true);
    expect(shouldAcceptWorkDayKey(null, '2026-08-25')).toBe(true);
  });

  it('accepts America/Chicago as a valid IANA timezone', () => {
    expect(isValidIanaTimezone('America/Chicago')).toBe(true);
    expect(isValidIanaTimezone('Not/AZone')).toBe(false);
  });

  it('Central midnight is 10:00 Asia/Karachi (Time Doctor day reset)', () => {
    setWorkTimezone('America/Chicago');

    // Central midnight 2026-08-11 CDT (UTC-5) = 2026-08-11 05:00 UTC = 10:00 PKT
    const centralMidnight = startOfWorkDay(
      new Date('2026-08-11T12:00:00.000Z'),
      'America/Chicago',
    );
    const pkParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(centralMidnight);
    const get = (type) => pkParts.find((p) => p.type === type)?.value;
    expect(`${get('hour')}:${get('minute')}`).toBe('10:00');
  });

  it('uses Central midnight for work-day cap (not Pacific)', () => {
    setWorkTimezone('America/Chicago');
    expect(getWorkTimezone()).toBe('America/Chicago');

    // 2026-08-11 20:00 PKT = 15:00 UTC = 10:00 CDT → 10h into Central day
    const now = new Date('2026-08-11T15:00:00.000Z');
    const centralCap =
      Math.floor((now.getTime() - startOfWorkDay(now, 'America/Chicago').getTime()) / 1000) + 120;
    const pacificCap =
      Math.floor((now.getTime() - startOfWorkDay(now, 'America/Los_Angeles').getTime()) / 1000) + 120;

    // ~10h Central vs ~8h Pacific — Pacific clamp is tighter and can hide real hours.
    expect(centralCap).toBeGreaterThan(9 * 3600);
    expect(centralCap).toBeLessThan(11 * 3600 + 180);
    expect(pacificCap).toBeLessThan(centralCap);

    // 9.5h tracked since Central midnight fits Central cap, exceeds Pacific cap.
    const trackedSeconds = Math.round(9.5 * 3600);
    expect(trackedSeconds).toBeLessThanOrEqual(centralCap);
    expect(trackedSeconds).toBeGreaterThan(pacificCap);
  });

  it('workDateKey follows company timezone (Central), not personal Karachi', () => {
    // Just after Central midnight: still "previous" calendar date in LA,
    // new Central day, and mid-morning in Karachi.
    const justAfterCentralMidnight = new Date('2026-08-11T05:30:00.000Z'); // 00:30 CDT
    expect(workDateKey(justAfterCentralMidnight, 'America/Chicago')).toBe('2026-08-11');
    expect(workDateKey(justAfterCentralMidnight, 'America/Los_Angeles')).toBe('2026-08-10');
    expect(workDateKey(justAfterCentralMidnight, 'Asia/Karachi')).toBe('2026-08-11');
  });

  it('round-the-clock: 2AM Central start only counts after company midnight on next day', () => {
    const { elapsedSecondsSinceWorkMidnight, getWorkDayContext } = require('../work-timezone');
    setWorkTimezone('America/Chicago');

    // Started 02:00 CDT Aug 11, still tracking at 00:30 CDT Aug 12
    const sessionStart = '2026-08-11T07:00:00.000Z'; // 02:00 CDT
    const afterMidnight = Date.parse('2026-08-12T05:30:00.000Z'); // 00:30 CDT Aug 12
    const elapsedToday = elapsedSecondsSinceWorkMidnight(sessionStart, afterMidnight);
    expect(elapsedToday).toBe(30 * 60); // only 30m into new company day

    const ctx = getWorkDayContext(new Date(afterMidnight), 'America/Chicago');
    expect(ctx.todayKey).toBe('2026-08-12');
    expect(ctx.secondsElapsedInDay).toBe(30 * 60);
  });

  it('does not invent Pacific wall-clock when company TZ is Central', () => {
    const { elapsedSecondsSinceWorkMidnight, startOfWorkDay } = require('../work-timezone');
    setWorkTimezone('America/Chicago');
    const now = Date.parse('2026-08-12T05:00:30.000Z'); // Central midnight + 30s
    const realStart = '2026-08-11T22:17:00.000Z'; // ~6.7h before
    const chicagoElapsed = elapsedSecondsSinceWorkMidnight(realStart, now);
    expect(chicagoElapsed).toBe(30);

    const pacificDayStart = startOfWorkDay(new Date(now), 'America/Los_Angeles').getTime();
    const pacificInvented = Math.floor((now - pacificDayStart) / 1000);
    expect(pacificInvented).toBeGreaterThan(20 * 3600);
    expect(chicagoElapsed).toBeLessThan(60);
  });
});
