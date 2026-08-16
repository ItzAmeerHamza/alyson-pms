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

jest.mock('electron', () => ({ nativeImage: { createFromPath: () => ({ isEmpty: () => true }) } }));

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
    global._trayTodayHighWaterSeconds = 0;
    elapsed = { value: 0 };
    tray = trayAt(8954, elapsed);
  });

  afterEach(() => {
    tray.stopTrayTimer();
    jest.useRealTimers();
    delete global.isStopping;
    delete global._trayTodayHighWaterSeconds;
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
});
