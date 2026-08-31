const {
  WINDOW_MS,
  SHOTS_PER_WINDOW,
  MIN_GAP_MS,
  generateRandomScreenshotOffsets,
  normalizeRandomScreenshotSchedule,
} = require('../random-screenshot-schedule');

describe('generateRandomScreenshotOffsets', () => {
  it('defaults to 2 shots in a 10-minute window', () => {
    expect(WINDOW_MS).toBe(10 * 60 * 1000);
    expect(SHOTS_PER_WINDOW).toBe(2);
  });

  it('returns two offsets inside the window with the minimum gap', () => {
    for (let i = 0; i < 40; i++) {
      const offsets = generateRandomScreenshotOffsets(WINDOW_MS, 2, MIN_GAP_MS);
      expect(offsets).toHaveLength(2);
      expect(offsets[0]).toBeGreaterThanOrEqual(0);
      expect(offsets[1]).toBeLessThan(WINDOW_MS);
      expect(offsets[1] - offsets[0]).toBeGreaterThanOrEqual(MIN_GAP_MS);
    }
  });

  it('does not pin the first shot after a fixed quiet period', () => {
    const samples = Array.from({ length: 30 }, () =>
      generateRandomScreenshotOffsets(WINDOW_MS, 2, MIN_GAP_MS)[0],
    );
    expect(Math.min(...samples)).toBeLessThan(MIN_GAP_MS);
    expect(Math.max(...samples)).toBeGreaterThan(2 * 60 * 1000);
  });

  it('varies across calls so the next time is not a fixed clock', () => {
    const firsts = new Set(
      Array.from({ length: 16 }, () =>
        generateRandomScreenshotOffsets(WINDOW_MS, 2, MIN_GAP_MS).join(','),
      ),
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('can schedule 3 shots in a 20-minute window', () => {
    const windowMs = 20 * 60 * 1000;
    const offsets = generateRandomScreenshotOffsets(windowMs, 3, MIN_GAP_MS);
    expect(offsets).toHaveLength(3);
    expect(offsets[0]).toBeGreaterThanOrEqual(0);
    expect(offsets[2]).toBeLessThan(windowMs);
    expect(offsets[1] - offsets[0]).toBeGreaterThanOrEqual(MIN_GAP_MS);
    expect(offsets[2] - offsets[1]).toBeGreaterThanOrEqual(MIN_GAP_MS);
  });
});

describe('normalizeRandomScreenshotSchedule', () => {
  it('defaults to 2 shots every 10 minutes', () => {
    expect(normalizeRandomScreenshotSchedule({})).toEqual({
      windowMinutes: 10,
      count: 2,
      windowMs: 10 * 60 * 1000,
      intervalMinutes: 5,
    });
  });

  it('accepts a custom 3-every-20 schedule', () => {
    expect(
      normalizeRandomScreenshotSchedule({
        screenshot_count_per_window: 3,
        screenshot_window_minutes: 20,
      }),
    ).toMatchObject({
      count: 3,
      windowMinutes: 20,
      intervalMinutes: 7,
    });
  });

  it('clamps impossible values', () => {
    const high = normalizeRandomScreenshotSchedule({
      screenshot_count_per_window: 99,
      screenshot_window_minutes: 1,
    });
    expect(high.count).toBe(8);
    expect(high.windowMinutes).toBe(5);
  });
});
