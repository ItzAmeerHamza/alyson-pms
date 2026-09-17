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

  it('does not use leftover renderer high-water as the closed Start base', () => {
    const tm = Object.create(TrackingManager.prototype);
    global._rendererTodayFloorSeconds = 14158;
    global._lastTodayTotalAtStop = 0;
    global._lastGoodTodayStats = {
      totalTime: 14158,
      completedTodayBeforeCurrentSessionSeconds: 0,
    };
    global._trayTodayHighWaterSeconds = 14158;

    expect(tm._resolveStartClosedBaseSeconds(false)).toBe(0);
  });
});
