/**
 * An unanswered idle prompt stops with an authorized 10-minute cut. Offline,
 * today's stats fall back to last-good and the Stop floor — both must already
 * hold the cut total, or the 10 minutes come back on screen until the next
 * successful read.
 *
 * 16 Oct replay: Start 12:38:36 on 7675s closed, offline, idle prompt timed out
 * at 12:50:38 → end 12:40:38, total 7797s. The window showed 8397s for 7 min.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-cut-offline-'));
process.env.ALYSON_PAYROLL_APP_DATA_DIR = TMP;
process.env.APPDATA = TMP;

jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  isLikelyOffline: jest.fn(() => true),
  updateTimeLog: jest.fn(() => Promise.reject(new Error('fetch failed'))),
  closeOpenUrlLogs: jest.fn(),
  closeOpenAppLogs: jest.fn(),
}));
jest.mock(
  'electron',
  () => ({
    app: { getPath: () => require('os').tmpdir() },
    net: { isOnline: () => false },
  }),
  { virtual: true },
);

const gsm = require('../graceful-shutdown-manager');
const { holdLastGoodOnFailedFetch, readPersistedLastGood } = require('../../utils/today-time-log-stats');

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('idle-prompt cut while offline', () => {
  let sent;

  beforeEach(() => {
    sent = [];
    global.mainWindow = {
      isDestroyed: () => false,
      webContents: { send: (channel, data) => sent.push({ channel, data }) },
    };
    global._idlePromptTimeCutSeconds = 600;
    global._stopEndTimeOverride = '2026-10-16T12:40:38.673Z';
    global._lastTodayTotalAtStop = 8397; // Stop snapshot, measured to the click
    global._lastGoodTodayStats = {
      workDate: '2026-10-16',
      totalTime: 8397,
      completedTodayBeforeCurrentSessionSeconds: 7675,
      deductedSeconds: 998,
      liveDeductedSeconds: 0,
    };
  });

  afterEach(() => {
    delete global.mainWindow;
    delete global._lastGoodTodayStats;
    delete global._lastTodayTotalAtStop;
  });

  test('window is told the cut total', () => {
    gsm._notifyRenderer('idle_timeout');
    const stopped = sent.find((s) => s.channel === 'tracking-stopped');
    expect(stopped.data.frozenTotalSeconds).toBe(7797);
  });

  test('Stop floor and last-good hold the cut total, on disk too', () => {
    gsm._notifyRenderer('idle_timeout');
    expect(global._lastTodayTotalAtStop).toBe(7797);
    expect(global._lastGoodTodayStats.totalTime).toBe(7797);
    expect(global._lastGoodTodayStats.completedTodayBeforeCurrentSessionSeconds).toBe(7675);
    expect(readPersistedLastGood()?.totalTime).toBe(7797);
  });

  test('an offline stats read after the cut shows 7797s, not 8397s', () => {
    gsm._notifyRenderer('idle_timeout');
    const offlineAgg = {
      completedClosedSeconds: 7675, // queue has the close, the server does not
      ongoingCurrentSessionSeconds: 0,
      totalTime: 7675,
      backendFetchFailed: true,
    };
    const held = holdLastGoodOnFailedFetch(offlineAgg, global._lastGoodTodayStats, { isTracking: false });
    expect(held.totalTime).toBe(7797);
  });

  test('a normal Stop leaves last-good alone', () => {
    gsm._notifyRenderer('manual');
    expect(global._lastGoodTodayStats.totalTime).toBe(8397);
    expect(global._lastTodayTotalAtStop).toBe(8397);
  });
});
