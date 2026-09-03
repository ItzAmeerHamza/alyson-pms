const {
  applyAdjustmentSeconds,
  holdLastGoodOnFailedFetch,
  shouldKeepCachedTodayStats,
} = require('../today-time-log-stats');

describe('applyAdjustmentSeconds — Pulse leave / admin credits', () => {
  it('adds a 7h leave credit to a day with no sessions', () => {
    const applied = applyAdjustmentSeconds(0, 0, 7 * 3600);
    expect(applied.trackedSessionSeconds).toBe(0);
    expect(applied.adjustmentSeconds).toBe(7 * 3600);
    expect(applied.totalTime).toBe(7 * 3600);
  });

  it('tops up to 7h when they work less than the holiday credit', () => {
    const applied = applyAdjustmentSeconds(2 * 3600, 0, 7 * 3600);
    expect(applied.totalTime).toBe(7 * 3600);
    expect(applied.adjustmentSeconds).toBe(5 * 3600);
  });

  it('keeps extra hours when they work past the 7h holiday floor', () => {
    const applied = applyAdjustmentSeconds(9 * 3600, 0, 7 * 3600);
    expect(applied.totalTime).toBe(9 * 3600);
    expect(applied.adjustmentSeconds).toBe(0);
  });

  it('never goes below zero when admin removes time', () => {
    const applied = applyAdjustmentSeconds(1800, -3600);
    expect(applied.totalTime).toBe(0);
  });
});

describe('holdLastGoodOnFailedFetch — failed BE must not rewind the clock', () => {
  it('Garima 25 Aug 17:47: live-only 431s keeps last-good 3.49h and adds live', () => {
    const held = holdLastGoodOnFailedFetch(
      {
        completedClosedSeconds: 0,
        ongoingCurrentSessionSeconds: 431,
        totalTime: 431,
        timeLogsCount: 1,
      },
      {
        totalTime: 12564,
        completedTodayBeforeCurrentSessionSeconds: 12157,
      },
      { isTracking: true },
    );

    expect(held.backendFetchFailed).toBe(true);
    expect(held.completedClosedSeconds).toBe(12157);
    expect(held.ongoingCurrentSessionSeconds).toBe(431);
    expect(held.totalTime).toBe(12588);
    expect(held.floorHeld).toBe(true);
    expect(held.totalTime).toBeGreaterThanOrEqual(12564);
  });

  it('never returns below last-good even when live is 0', () => {
    const held = holdLastGoodOnFailedFetch(
      { completedClosedSeconds: 0, ongoingCurrentSessionSeconds: 0, totalTime: 0 },
      { totalTime: 8192, completedTodayBeforeCurrentSessionSeconds: 8192 },
      { isTracking: false },
    );

    expect(held.totalTime).toBe(8192);
    expect(held.completedClosedSeconds).toBe(8192);
    expect(held.backendFetchFailed).toBe(true);
  });

  it('without last-good, keeps the failed aggregate and flags the miss', () => {
    const held = holdLastGoodOnFailedFetch(
      { completedClosedSeconds: 0, ongoingCurrentSessionSeconds: 431, totalTime: 431 },
      null,
      { isTracking: true },
    );

    expect(held.totalTime).toBe(431);
    expect(held.backendFetchFailed).toBe(true);
    expect(held.floorHeld).toBeUndefined();
  });
});

describe('shouldKeepCachedTodayStats — midnight reset must not paint leftover', () => {
  const yesterday = {
    totalTime: 2680,
    workDate: '2026-08-23',
    date: '2026-08-23',
  };
  const newDayZero = {
    totalTime: 0,
    completedTodayBeforeCurrentSessionSeconds: 0,
    workDate: '2026-08-24',
    date: '2026-08-24',
    workDay: { todayKey: '2026-08-24' },
  };

  it('Thirumalai Aug 24: stopped + Chicago midnight 0 drops leftover 0.74h', () => {
    const decision = shouldKeepCachedTodayStats(yesterday, newDayZero, {
      trackingLive: false,
      rendererDayKey: '2026-08-24',
    });
    expect(decision.keep).toBe(false);
    expect(decision.reason).toBe('new-work-day');
  });

  it('stopped + successful empty day is 0 even without a date on the cache', () => {
    const decision = shouldKeepCachedTodayStats(
      { totalTime: 7504 },
      { totalTime: 0 },
      { trackingLive: false },
    );
    expect(decision.keep).toBe(false);
    expect(decision.reason).toBe('stopped-empty-day');
  });

  it('same-day failed fetch still holds last-good (clock must not rewind)', () => {
    const decision = shouldKeepCachedTodayStats(
      { totalTime: 12564, workDate: '2026-08-25' },
      { totalTime: 431, backendFetchFailed: true, stale: true, workDate: '2026-08-25' },
      { trackingLive: true, rendererDayKey: '2026-08-25' },
    );
    expect(decision.keep).toBe(true);
    expect(decision.reason).toBe('backend-miss');
    expect(decision.value.totalTime).toBe(12564);
  });

  it('same-day tracking wipe-to-zero still holds', () => {
    const decision = shouldKeepCachedTodayStats(
      { totalTime: 2680, workDate: '2026-08-24' },
      { totalTime: 0, workDate: '2026-08-24' },
      { trackingLive: true, rendererDayKey: '2026-08-24' },
    );
    expect(decision.keep).toBe(true);
    expect(decision.reason).toBe('wipe-to-zero');
  });
});
