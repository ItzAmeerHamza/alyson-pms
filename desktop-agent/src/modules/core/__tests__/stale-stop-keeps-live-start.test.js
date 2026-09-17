/**
 * A leftover Stop must never kill a newer Start.
 * Aditya: Start recorded 2–3s, then leftover cleanup set isTracking=false.
 */

jest.mock(
  'electron',
  () => ({
    net: { isOnline: () => true },
    app: { getPath: () => '/tmp' },
  }),
  { virtual: true },
);

const TrackingManager = require('../tracking-manager');

function makeTm() {
  const tm = Object.create(TrackingManager.prototype);
  tm._sessionGeneration = 1;
  tm.isTracking = true;
  tm._localSessionArmed = true;
  tm.currentTimeLogId = 'live-session';
  tm.wrappers = null;
  tm.consolidationFixes = null;
  tm._stopMonitoringSystems = jest.fn(async () => {});
  return tm;
}

describe('leftover Stop cleanup vs live Start', () => {
  afterEach(() => {
    delete global.isTracking;
    delete global.isStopping;
    delete global.urlCaptureManager;
    delete global.stopInputDetection;
    delete global.consolidatedSystemsInitialized;
  });

  it('does not force isTracking off after a newer Start armed', async () => {
    const tm = makeTm();
    global.isTracking = true;
    global.isStopping = true;
    global.urlCaptureManager = { stop: jest.fn() };

    await tm._runBackgroundCleanup('manual', null, { generationAtEntry: 0 });

    expect(global.isTracking).toBe(true);
    expect(tm.isTracking).toBe(true);
    expect(global.urlCaptureManager.stop).not.toHaveBeenCalled();
    expect(tm._stopMonitoringSystems).not.toHaveBeenCalled();
  });

  it('still clears isTracking when no newer Start exists', async () => {
    const tm = makeTm();
    tm._sessionGeneration = 1;
    tm.isTracking = false;
    tm._localSessionArmed = false;
    tm.currentTimeLogId = null;
    global.isTracking = false;
    global.isStopping = true;

    await tm._runBackgroundCleanup('manual', null, { generationAtEntry: 1 });

    expect(global.isTracking).toBe(false);
    expect(global.isStopping).toBe(false);
  });
});
