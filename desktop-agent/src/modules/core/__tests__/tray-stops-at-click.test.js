/**
 * The menu bar shows Stopped the moment Stop is clicked, not when the
 * wind-down finishes. 16 Oct: the idle monitor saved a 4-minute idle period
 * during Stop, the wind-down took 4.25s, and the menu bar sat frozen on the
 * last total the whole time (the session itself ended at the click).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), 'alyson-tray-stops-at-click');
process.env.ALYSON_PAYROLL_APP_DATA_DIR = TMP;

jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  isLikelyOffline: jest.fn(() => false),
  updateTimeLog: jest.fn(async (id, updates) => ({ success: true, id, end_time: updates.end_time })),
  closeOpenUrlLogs: jest.fn(),
  closeOpenAppLogs: jest.fn(),
}));

jest.mock(
  'electron',
  () => ({
    app: { getPath: () => require('path').join(require('os').tmpdir(), 'alyson-tray-stops-at-click') },
    net: { isOnline: () => true },
  }),
  { virtual: true },
);

const gsm = require('../graceful-shutdown-manager');
const TrackingManager = require('../tracking-manager');

const SESSION_ID = '2bfeb5fd-1b14-40a3-b5ba-18aff31dbefc';
const START = new Date(Date.now() - 4 * 60 * 1000).toISOString();

const flush = () => new Promise((r) => setImmediate(r));

function makeTm() {
  const tm = Object.create(TrackingManager.prototype);
  tm.config = { user_id: 1195 };
  tm.queue = [];
  tm.isTracking = true;
  tm.currentTimeLogId = SESSION_ID;
  tm.sessionStartTime = START;
  tm.getOfflineQueue = () => tm.queue.slice();
  tm._persistOfflineQueueOrThrow = (next) => {
    tm.queue = next.slice();
  };
  tm._appendTimeLedger = () => {};
  tm.startOfflineSync = jest.fn();
  tm._readSessionCheckpoint = () => null;
  return tm;
}

describe('Stop: the menu bar stops at the click', () => {
  let releaseIdleSave;
  let tray;

  beforeEach(() => {
    fs.mkdirSync(path.join(TMP, 'pending_sessions'), { recursive: true });
    global.isTracking = true;
    global.currentTimeLogId = SESSION_ID;
    global.currentUserId = 1195;
    global.sessionStartTime = START;
    global._stopEndTimeOverride = null;
    global._stopAuthorizedIdleCut = false;
    global._idlePromptTimeCutSeconds = 0;
    global.isQuitting = false;
    global.mainWindow = null;
    const tm = makeTm();
    tm._queueOfflineTimeLogUpdate = TrackingManager.prototype._queueOfflineTimeLogUpdate;
    global.trackingManager = tm;
    tray = {
      isTracking: true,
      _cumulativeBaseSeconds: 3519,
      _lastCumulativeSeconds: 3770,
      updateState: jest.fn(function updateState(isTracking) { this.isTracking = isTracking; }),
    };
    global.trayManager = tray;
    // The idle period save that held the 16 Oct Stop for 4.25s.
    global.enhancedIdleMonitor = {
      stopIdleMonitoring: () => new Promise((resolve) => { releaseIdleSave = resolve; }),
    };
  });

  afterEach(() => {
    if (releaseIdleSave) releaseIdleSave();
    delete global.enhancedIdleMonitor;
    delete global.trayManager;
  });

  test('tray is Stopped while the wind-down is still running', async () => {
    let finished = false;
    const stop = gsm.gracefulStop('manual').then((r) => {
      finished = true;
      return r;
    });
    for (let i = 0; i < 20; i++) await flush();

    expect(finished).toBe(false); // still waiting on the idle save
    expect(tray.updateState).toHaveBeenCalledWith(false, false, expect.any(Object));
    expect(tray.isTracking).toBe(false);

    releaseIdleSave();
    const result = await stop;
    expect(result.success).toBe(true);
  });

  test('the session still ends at the click, not when the wind-down finishes', async () => {
    const clickMs = Date.now();
    const stop = gsm.gracefulStop('manual');
    for (let i = 0; i < 20; i++) await flush();
    await new Promise((r) => setTimeout(r, 300)); // wind-down drags on
    releaseIdleSave();
    await stop;

    const backend = require('../../utils/backend-time-logs');
    const call = backend.updateTimeLog.mock.calls.find(([id, u]) => id === SESSION_ID && u?.end_time);
    expect(call).toBeDefined();
    const endMs = new Date(call[1].end_time).getTime();
    expect(endMs).toBeGreaterThanOrEqual(clickMs);
    expect(endMs - clickMs).toBeLessThan(100);
  });

  test('an online Stop does not say it will sync when back online', async () => {
    // Online, but the server write is still in flight when Stop returns
    // (16 Oct 12:37: Stop returned in 33ms, the close landed ~1s later).
    const backend = require('../../utils/backend-time-logs');
    backend.updateTimeLog.mockImplementationOnce(
      (id, updates) => new Promise((r) => setTimeout(() => r({ success: true, id, end_time: updates.end_time }), 300)),
    );
    global.enhancedIdleMonitor = { stopIdleMonitoring: async () => {} };
    const stop = gsm.gracefulStop('manual');
    for (let i = 0; i < 20; i++) await flush();
    releaseIdleSave();
    const result = await stop;
    expect(result.synced).toBe(true);
    expect(result.message).toBeUndefined();
  });

  test('an offline Stop does say it', async () => {
    const backend = require('../../utils/backend-time-logs');
    backend.isLikelyOffline.mockReturnValue(true);
    backend.updateTimeLog.mockImplementationOnce(() => Promise.reject(new Error('fetch failed')));
    const stop = gsm.gracefulStop('manual');
    for (let i = 0; i < 20; i++) await flush();
    releaseIdleSave();
    const result = await stop;
    backend.isLikelyOffline.mockReturnValue(false);
    expect(result.synced).toBe(false);
    expect(result.message).toMatch(/back online/);
  });
});
