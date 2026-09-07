/**
 * Idle time and low-activity screenshots describe the SAME non-effective time.
 *
 * non_effective = min(total, low_activity + idle), and an idle minute produces a
 * zero-activity screenshot by definition — so adding both counted it twice. Once
 * idle_seconds started being populated, the sum exceeded the day's total, the
 * min() capped it, and an employee's entire day read as non-effective.
 */

jest.mock('../backend-rds-reads', () => ({
  isBackendRdsEnabled: jest.fn(() => true),
  getEffectiveStats: jest.fn(),
  listIdleLogs: jest.fn(),
}));

jest.mock('../backend-time-logs', () => ({
  isLikelyOffline: jest.fn(() => false),
}));

const rds = require('../backend-rds-reads');
const { isLikelyOffline } = require('../backend-time-logs');
const {
  computeTodayEffectiveStats,
  sumLowActivitySecondsFromScreenshots,
} = require('../today-effective-stats');

const T = (iso) => new Date(iso).getTime();
const DAY_START = T('2026-08-17T05:00:00.000Z');
const DAY_END = T('2026-08-18T05:00:00.000Z');
const INTERVAL = 60;

const shot = (iso, activityPercent) => ({
  captured_at: iso,
  activity_percent: activityPercent,
});

describe('low-activity counting excludes idle periods', () => {
  it('does not count a zero-activity screenshot taken during idle', () => {
    const idle = [{ startMs: T('2026-08-17T10:00:00Z'), endMs: T('2026-08-17T10:05:00Z') }];
    const screenshots = [
      shot('2026-08-17T10:01:00Z', 0),
      shot('2026-08-17T10:02:00Z', 0),
      shot('2026-08-17T10:03:00Z', 0),
    ];

    const low = sumLowActivitySecondsFromScreenshots(
      screenshots, INTERVAL, DAY_START, DAY_END, idle,
    );

    // All three fall inside the idle window — already counted as idle.
    expect(low).toBe(0);
  });

  it('still counts a sustained low-activity streak outside any idle period', () => {
    const idle = [{ startMs: T('2026-08-17T10:00:00Z'), endMs: T('2026-08-17T10:05:00Z') }];
    const screenshots = [
      shot('2026-08-17T10:01:00Z', 0),   // inside idle — skipped
      shot('2026-08-17T11:00:00Z', 2),   // awake but barely active
      shot('2026-08-17T11:01:00Z', 5),
      shot('2026-08-17T11:02:00Z', 4),
    ];

    const low = sumLowActivitySecondsFromScreenshots(
      screenshots, INTERVAL, DAY_START, DAY_END, idle,
    );

    expect(low).toBe(3 * INTERVAL);
  });

  it('ignores an isolated low-activity screenshot the way the web does', () => {
    const screenshots = [
      shot('2026-08-17T11:00:00Z', 2),
      shot('2026-08-17T11:01:00Z', 80),
      shot('2026-08-17T11:02:00Z', 3),
    ];

    expect(
      sumLowActivitySecondsFromScreenshots(screenshots, INTERVAL, DAY_START, DAY_END, []),
    ).toBe(0);
  });

  it('does not count dual-screen Word shots during a live meeting as low-activity', () => {
    const screenshots = [
      {
        captured_at: '2026-08-17T11:00:00Z',
        activity_percent: 2,
        app_name: 'Brave Browser',
        window_title: 'Cintara - Microphone recording - Brave - Work',
      },
      {
        captured_at: '2026-08-17T11:01:00Z',
        activity_percent: 1,
        app_name: 'Microsoft Word',
        window_title: 'Notes.docx',
      },
      {
        captured_at: '2026-08-17T11:02:00Z',
        activity_percent: 3,
        app_name: 'Finder',
        window_title: 'No Window',
        vision_summary: 'Presenting, annotating in Google Meet',
      },
    ];

    expect(
      sumLowActivitySecondsFromScreenshots(screenshots, INTERVAL, DAY_START, DAY_END, []),
    ).toBe(0);
  });

  it('does not turn a 90-second random dip into a 5-minute low block', () => {
    const screenshots = [
      shot('2026-08-17T11:00:00Z', 80),
      shot('2026-08-17T11:01:30Z', 2),
      shot('2026-08-17T11:03:00Z', 80),
    ];

    expect(
      sumLowActivitySecondsFromScreenshots(screenshots, 5 * 60, DAY_START, DAY_END, []),
    ).toBe(0);
  });

  it('never counts an active screenshot', () => {
    const screenshots = [
      shot('2026-08-17T11:00:00Z', 40),
      shot('2026-08-17T11:01:00Z', 95),
    ];

    expect(
      sumLowActivitySecondsFromScreenshots(screenshots, INTERVAL, DAY_START, DAY_END, []),
    ).toBe(0);
  });

  it('reproduces the reported case: a full day no longer reads as non-effective', () => {
    // 31 idle periods averaging ~3 minutes, each producing zero-activity shots.
    const idle = [];
    const screenshots = [];
    let t = T('2026-08-17T09:00:00Z');
    for (let i = 0; i < 31; i += 1) {
      const start = t;
      const end = start + 3 * 60 * 1000;
      idle.push({ startMs: start, endMs: end });
      for (let m = 0; m < 3; m += 1) {
        screenshots.push(shot(new Date(start + m * 60 * 1000).toISOString(), 0));
      }
      t = end + 10 * 60 * 1000; // ten active minutes between idle stretches
    }

    const idleSeconds = idle.reduce((acc, iv) => acc + (iv.endMs - iv.startMs) / 1000, 0);
    const low = sumLowActivitySecondsFromScreenshots(
      screenshots, INTERVAL, DAY_START, DAY_END, idle,
    );

    const totalSeconds = 8 * 3600;
    const nonEffective = Math.min(totalSeconds, low + idleSeconds);

    // Previously low would have equalled idleSeconds, doubling it.
    expect(low).toBe(0);
    expect(nonEffective).toBe(idleSeconds);
    expect(nonEffective).toBeLessThan(totalSeconds);
  });

  // Numbers taken from the affected user's 2026-08-17 log: 12,933s tracked,
  // 31 idle periods totalling 8,404s, and 80 screenshots under 10% activity of
  // which 67 fall inside an idle window. Unfixed, 8,404 + 80x60 = 13,204 exceeds
  // the 12,933s tracked, the min() caps it, and the day reads 100% non-effective.
  it('reproduces the exact production day that read as fully non-effective', () => {
    const totalSeconds = 12933;
    const idleSeconds = 8404;

    // 31 idle windows holding 67 of the low-activity shots; 13 sit outside.
    const idle = [];
    const screenshots = [];
    let t = T('2026-08-17T06:00:00Z');
    let placed = 0;
    for (let i = 0; i < 31; i += 1) {
      const start = t;
      const end = start + 5 * 60 * 1000;
      idle.push({ startMs: start, endMs: end });
      for (let m = 0; m < 3 && placed < 67; m += 1, placed += 1) {
        screenshots.push(shot(new Date(start + m * 60 * 1000).toISOString(), 0));
      }
      t = end + 6 * 60 * 1000;
    }
    expect(placed).toBe(67);

    for (let i = 0; i < 13; i += 1) {
      screenshots.push(shot(new Date(t + i * 60 * 1000).toISOString(), 3));
    }

    const low = sumLowActivitySecondsFromScreenshots(
      screenshots, INTERVAL, DAY_START, DAY_END, idle,
    );

    const before = Math.min(totalSeconds, 80 * INTERVAL + idleSeconds);
    expect(before).toBe(totalSeconds);          // whole day non-effective
    expect(totalSeconds - before).toBe(0);      // zero effective — the bug

    const after = Math.min(totalSeconds, low + idleSeconds);
    expect(low).toBe(13 * INTERVAL);            // only the 13 awake-but-idle shots
    expect(after).toBe(9184);
    expect(totalSeconds - after).toBe(3749);    // ~1h02m effective, correctly
  });
});

describe('computeTodayEffectiveStats prefers Pulse numbers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rds.isBackendRdsEnabled.mockReturnValue(true);
    isLikelyOffline.mockReturnValue(false);
  });

  it('uses the shared Pulse split so desktop matches the web', async () => {
    rds.getEffectiveStats.mockResolvedValue({
      idleSeconds: 24 * 60,
      lowActivitySeconds: 0,
    });

    const totalSeconds = 4 * 3600 + 24 * 60;
    const result = await computeTodayEffectiveStats({
      userId: 1224,
      totalSeconds,
      config: {},
    });

    expect(result.source).toBe('pulse');
    expect(result.totalSeconds).toBe(totalSeconds);
    expect(result.nonEffectiveSeconds).toBe(24 * 60);
    expect(result.effectiveSeconds).toBe(4 * 3600);
    expect(result.effectiveSeconds + result.nonEffectiveSeconds).toBe(totalSeconds);
    expect(rds.listIdleLogs).not.toHaveBeenCalled();
  });

  it('falls back locally when Pulse rejects a non-network error', async () => {
    rds.getEffectiveStats.mockRejectedValue(new Error('not deployed'));
    rds.listIdleLogs.mockResolvedValue([]);

    const result = await computeTodayEffectiveStats({
      userId: 1224,
      totalSeconds: 3600,
      screenshots: [],
      config: {},
    });

    expect(result.source).toBe('local');
    expect(result.totalSeconds).toBe(3600);
    expect(result.computed).toBe(true);
  });

  it('does not call Pulse or idle reads while offline', async () => {
    isLikelyOffline.mockReturnValue(true);

    const result = await computeTodayEffectiveStats({
      userId: 1224,
      totalSeconds: 5400,
      config: {},
    });

    expect(result.source).toBe('offline');
    expect(result.computed).toBe(false);
    expect(result.totalSeconds).toBe(5400);
    expect(rds.getEffectiveStats).not.toHaveBeenCalled();
    expect(rds.listIdleLogs).not.toHaveBeenCalled();
  });

  it('does not pile on idle fetches after a Pulse timeout', async () => {
    rds.getEffectiveStats.mockRejectedValue(new Error('Backend sync timeout after 4000ms (get_effective_stats)'));

    const result = await computeTodayEffectiveStats({
      userId: 1224,
      totalSeconds: 5400,
      config: {},
    });

    expect(result.source).toBe('offline');
    expect(result.computed).toBe(false);
    expect(result.totalSeconds).toBe(5400);
    expect(rds.listIdleLogs).not.toHaveBeenCalled();
  });
});
