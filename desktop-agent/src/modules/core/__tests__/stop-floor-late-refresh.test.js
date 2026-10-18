/**
 * Start schedules a background base refresh. On a short session it can land
 * after the Stop, with a server total that predates the Stop's close. It must
 * not drop the Stop floor, or the next Start opens on the older total.
 *
 * 16 Oct 13:09: Stop 8446s, server still 8415s, Start 1.6s later → menu bar
 * opened at 02:20:16 (8416s), 30s short, until a later read corrected it.
 */

jest.mock(
  'electron',
  () => ({ app: { getPath: () => require('os').tmpdir() }, net: { isOnline: () => true } }),
  { virtual: true },
);

const TrackingManager = require('../tracking-manager');
const { localDateKey } = require('../../utils/today-time-log-stats');

const KEYS = [
  '_lastTodayTotalAtStop',
  '_rendererFrozenTotalAtStop',
  '_frozenTotalDate',
  '_lastGoodTodayStats',
  '_rendererTodayFloorSeconds',
  '_trayTodayHighWaterSeconds',
];

describe('Stop floor vs a late base refresh', () => {
  let tm;

  beforeEach(() => {
    for (const k of KEYS) delete global[k];
    jest.spyOn(console, 'log').mockImplementation(() => {});
    tm = Object.create(TrackingManager.prototype);
    global._frozenTotalDate = localDateKey();
    global._lastTodayTotalAtStop = 8446; // Stop snapshot
    global._lastGoodTodayStats = { completedTodayBeforeCurrentSessionSeconds: 8415 }; // read before the close
  });

  afterEach(() => jest.restoreAllMocks());

  test('a refresh that predates the close keeps the Stop floor', () => {
    tm._resolveTodayBaseSeconds(8415);
    expect(global._lastTodayTotalAtStop).toBe(8446);
    expect(TrackingManager.prototype._resolveStartClosedBaseSeconds.call(tm, false)).toBe(8446);
  });

  test('once the server has caught up, the floor is no longer needed', () => {
    tm._resolveTodayBaseSeconds(8446);
    expect(global._lastTodayTotalAtStop).toBeNull();
  });

  test('a server ahead of the floor (another device) also clears it', () => {
    tm._resolveTodayBaseSeconds(9000);
    expect(global._lastTodayTotalAtStop).toBeNull();
  });
});

describe('Start includes leave/admin adjustments (16 Oct 18:09)', () => {
  let tm;

  beforeEach(() => {
    for (const k of KEYS) delete global[k];
    jest.spyOn(console, 'log').mockImplementation(() => {});
    tm = Object.create(TrackingManager.prototype);
    // 11500s of sessions + a 3h30m admin adjustment = 24100s today.
    global._lastGoodTodayStats = {
      completedTodayBeforeCurrentSessionSeconds: 11500,
      adjustmentSeconds: 12600,
      totalTime: 24100,
    };
  });

  afterEach(() => jest.restoreAllMocks());

  test('menu bar opens on sessions + adjustment', () => {
    expect(TrackingManager.prototype._resolveStartClosedBaseSeconds.call(tm, false)).toBe(24100);
  });

  test('also after sleep', () => {
    expect(TrackingManager.prototype._resolveStartClosedBaseSeconds.call(tm, true)).toBe(24100);
  });

  test('a negative adjustment lowers it, never below zero', () => {
    global._lastGoodTodayStats.adjustmentSeconds = -600;
    expect(TrackingManager.prototype._resolveStartClosedBaseSeconds.call(tm, false)).toBe(10900);
    global._lastGoodTodayStats.adjustmentSeconds = -20000;
    expect(TrackingManager.prototype._resolveStartClosedBaseSeconds.call(tm, false)).toBe(0);
  });
});
