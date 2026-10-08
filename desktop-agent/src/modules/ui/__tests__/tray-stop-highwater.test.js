/**
 * The tray is torn down in Phase 3 of stopTracking, ~2s after the click, so it
 * keeps ticking through the whole stop round-trip. Every tick raised
 * global._trayTodayHighWaterSeconds, and startTracking seeds the next session's
 * base from the max of that high-water and the (correctly frozen) stop
 * snapshot — so the wind-down was billed, once per stop/start cycle, and never
 * rewound because the base is forward-only.
 *
 * Numbers here are from the 2026-08-16 offline session: snapshot 8981s at the
 * click, base 8983s on the next Start.
 */

jest.mock(
  'electron',
  () => ({ nativeImage: { createFromPath: () => ({ isEmpty: () => true }) } }),
  { virtual: true },
);

const TrayManager = require('../tray-manager');

const STOP_ROUND_TRIP_TICKS = 2;

function trayAt(baseSeconds, elapsedRef) {
  const tray = Object.create(TrayManager.prototype);
  tray.tray = {
    isDestroyed: () => false,
    setTitle: () => {},
    getTitle: () => '',
    setToolTip: () => {},
  };
  tray._timerInterval = null;
  tray._lastTrayTitle = null;
  tray._lastTrayTooltip = null;
  tray._currentProjectName = 'Data Engineering';
  tray._cumulativeBaseSeconds = baseSeconds;
  tray._trackingStartTime = new Date();
  tray._maybeRolloverLocalDay = () => {};
  tray._installWindowShowHooks = () => {};
  tray._setTrackingIcon = () => {};
  tray._setStoppedIcon = () => {};
  tray._pushRendererTick = () => {};
  tray._getSessionElapsedSeconds = () => elapsedRef.value;
  return tray;
}

describe('tray high-water must freeze at the Stop click', () => {
  let elapsed;
  let tray;

  beforeEach(() => {
    jest.useFakeTimers();
    global.isStopping = false;
    global.isTracking = true;
    global.currentTimeLogId = 'live-session';
    global.userExplicitlyStopped = false;
    global._trayTodayHighWaterSeconds = 0;
    elapsed = { value: 0 };
    tray = trayAt(8954, elapsed);
  });

  afterEach(() => {
    tray.stopTrayTimer();
    jest.useRealTimers();
    delete global.isStopping;
    delete global.isTracking;
    delete global.currentTimeLogId;
    delete global.userExplicitlyStopped;
    delete global.trackingManager;
    delete global._trayTodayHighWaterSeconds;
    delete global._lastExplicitStopEndIso;
    delete global._stopEndTimeOverride;
    delete global._lastStopEndAtMs;
    delete global._lastWakeAtMs;
  });

  const tickSeconds = (n) => {
    for (let i = 0; i < n; i++) {
      elapsed.value += 1;
      jest.advanceTimersByTime(1000);
    }
  };

  it('does not count the stop round-trip into the next session base', () => {
    tray.startTrayTimer();
    tickSeconds(27);
    expect(global._trayTodayHighWaterSeconds).toBe(8981);

    global.isStopping = true;
    tickSeconds(STOP_ROUND_TRIP_TICKS);

    expect(global._trayTodayHighWaterSeconds).toBe(8981);
  });

  it('still advances normally while tracking', () => {
    tray.startTrayTimer();
    tickSeconds(27);

    expect(global._trayTodayHighWaterSeconds).toBe(8981);
  });

  it('resumes advancing once the stop has finished', () => {
    tray.startTrayTimer();
    tickSeconds(27);
    global.isStopping = true;
    tickSeconds(STOP_ROUND_TRIP_TICKS);

    global.isStopping = false;
    tickSeconds(1);

    expect(global._trayTodayHighWaterSeconds).toBe(8984);
  });

  it('stops the orphan menu-bar clock when the session is gone', () => {
    tray.startTrayTimer();
    tickSeconds(2);
    expect(tray._timerInterval).not.toBeNull();

    global.isTracking = false;
    global.currentTimeLogId = null;
    tickSeconds(1);

    expect(tray._timerInterval).toBeNull();
  });

  it('heals a false Stop so the menu bar and app stay on the same clock', () => {
    global.isTracking = false;
    global.currentTimeLogId = 'live-session';
    tray.startTrayTimer();
    expect(global.isTracking).toBe(true);
    expect(tray._timerInterval).not.toBeNull();
  });

  it('new Start replaces leftover jam base instead of stacking it', () => {
    const leftover = Object.create(TrayManager.prototype);
    leftover.isTracking = false;
    leftover.isPaused = false;
    leftover._cumulativeBaseSeconds = 14158;
    leftover._maybeRolloverLocalDay = () => {};
    leftover.startTrayTimer = jest.fn();
    leftover.stopTrayTimer = jest.fn();
    leftover.updateMenu = jest.fn();
    leftover.showNotification = jest.fn();

    leftover.updateState(true, false, {
      startTime: new Date(),
      completedTodayBeforeSessionSeconds: 400,
      replaceCumulativeBase: true,
    });

    expect(leftover._cumulativeBaseSeconds).toBe(400);
    expect(leftover.startTrayTimer).toHaveBeenCalled();
  });

  it('restarts the tray timer on a new Start even if isTracking was leftover true', () => {
    const leftover = Object.create(TrayManager.prototype);
    leftover.isTracking = true;
    leftover.isPaused = false;
    leftover._timerInterval = null;
    leftover._cumulativeBaseSeconds = 14158;
    leftover._maybeRolloverLocalDay = () => {};
    leftover.startTrayTimer = jest.fn();
    leftover.stopTrayTimer = jest.fn();
    leftover.updateMenu = jest.fn();
    leftover.showNotification = jest.fn();

    leftover.updateState(true, false, {
      startTime: new Date(),
      completedTodayBeforeSessionSeconds: 400,
      replaceCumulativeBase: true,
    });

    expect(leftover._cumulativeBaseSeconds).toBe(400);
    expect(leftover.startTrayTimer).toHaveBeenCalled();
  });

  it('does not paint idle Stop floor plus recovered live (Hamza 30 Sep)', () => {
    const start = new Date('2026-09-30T08:48:00.000Z');
    const idleEnd = '2026-09-30T11:36:00.000Z';
    const now = new Date('2026-09-30T11:56:00.000Z').getTime();
    const recovered = Object.create(TrayManager.prototype);
    recovered._cumulativeBaseSeconds = 10607;
    recovered._trackingStartTime = start;
    global._lastExplicitStopEndIso = idleEnd;

    const live = recovered._resolveLiveClock(now);
    expect(live.cumulative).toBeLessThan(4 * 3600);
    expect(live.cumulative).not.toBe(10607 + live.elapsed);
    expect(10607 + live.elapsed).toBeGreaterThan(5 * 3600);
  });
});
