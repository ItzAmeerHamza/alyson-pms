/**
 * Idle time and low-activity screenshots describe the SAME non-effective time.
 *
 * non_effective = min(total, low_activity + idle), and an idle minute produces a
 * zero-activity screenshot by definition — so adding both counted it twice. Once
 * idle_seconds started being populated, the sum exceeded the day's total, the
 * min() capped it, and an employee's entire day read as non-effective.
 */

const {
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

  it('still counts low activity outside any idle period', () => {
    const idle = [{ startMs: T('2026-08-17T10:00:00Z'), endMs: T('2026-08-17T10:05:00Z') }];
    const screenshots = [
      shot('2026-08-17T10:01:00Z', 0),   // inside idle — skipped
      shot('2026-08-17T11:00:00Z', 2),   // awake but barely active — counted
      shot('2026-08-17T11:01:00Z', 5),   // counted
    ];

    const low = sumLowActivitySecondsFromScreenshots(
      screenshots, INTERVAL, DAY_START, DAY_END, idle,
    );

    expect(low).toBe(2 * INTERVAL);
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
