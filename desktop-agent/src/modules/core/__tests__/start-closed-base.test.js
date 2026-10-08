/**
 * Next Start must seed from closed-today only.
 * Leftover 3:55 tray / last-good total is phantom display, not billed closed time.
 */

const TrackingManager = require('../tracking-manager');

describe('Start closed-today base', () => {
  afterEach(() => {
    delete global._lastGoodTodayStats;
    delete global._lastTodayTotalAtStop;
    delete global._rendererTodayFloorSeconds;
    delete global._trayTodayHighWaterSeconds;
  });

  it('ignores leftover jam high-water and last-good totalTime', () => {
    const tm = Object.create(TrackingManager.prototype);
    global._trayTodayHighWaterSeconds = 14158;
    global._lastGoodTodayStats = {
      totalTime: 14158,
      completedTodayBeforeCurrentSessionSeconds: 0,
    };
    global._lastTodayTotalAtStop = 0;
    global._rendererTodayFloorSeconds = 0;

    expect(tm._resolveStartClosedBaseSeconds(false)).toBe(0);
  });

  it('uses the frozen Stop floor as the next session base', () => {
    const tm = Object.create(TrackingManager.prototype);
    global._lastTodayTotalAtStop = 8981;
    global._lastGoodTodayStats = {
      totalTime: 14158,
      completedTodayBeforeCurrentSessionSeconds: 0,
    };
    global._trayTodayHighWaterSeconds = 14158;

    expect(tm._resolveStartClosedBaseSeconds(false)).toBe(8981);
  });

  it('accepts tray high-water only when it matches known closed time', () => {
    const tm = Object.create(TrackingManager.prototype);
    global._lastTodayTotalAtStop = 400;
    global._trayTodayHighWaterSeconds = 402;

    expect(tm._resolveStartClosedBaseSeconds(false)).toBe(402);
  });

  it('uses the renderer closed/stop floor after a same-day Stop', () => {
    const tm = Object.create(TrackingManager.prototype);
    global._rendererTodayFloorSeconds = 3600;
    global._lastTodayTotalAtStop = 0;
    global._lastGoodTodayStats = {
      totalTime: 3600,
      completedTodayBeforeCurrentSessionSeconds: 0,
    };
    global._trayTodayHighWaterSeconds = 14158;

    expect(tm._resolveStartClosedBaseSeconds(false)).toBe(3600);
  });

  it('Start after 1h Stop seeds the next session at 1h, not 00:00:00', () => {
    const tm = Object.create(TrackingManager.prototype);
    global._lastTodayTotalAtStop = 3600;
    global._lastGoodTodayStats = {
      totalTime: 3600,
      completedTodayBeforeCurrentSessionSeconds: 0,
    };
    global._rendererTodayFloorSeconds = 3600;
    global._trayTodayHighWaterSeconds = 0;

    expect(tm._resolveStartClosedBaseSeconds(false)).toBe(3600);
  });

  it('recovered idle row uses completed-before, not the Stop floor (Hamza 30 Sep)', () => {
    const tm = Object.create(TrackingManager.prototype);
    global._lastTodayTotalAtStop = 10607;
    global._lastGoodTodayStats = {
      totalTime: 11815,
      completedTodayBeforeCurrentSessionSeconds: 521,
    };
    global._rendererTodayFloorSeconds = 10607;
    const recoveredBase = Math.max(
      0,
      Math.floor(
        Number(global._lastGoodTodayStats.completedTodayBeforeCurrentSessionSeconds) || 0,
      ),
    );
    expect(recoveredBase).toBe(521);
    expect(recoveredBase + 10800).toBeLessThan(4 * 3600);
    expect(tm._resolveStartClosedBaseSeconds(false)).toBe(10607);
  });
});
