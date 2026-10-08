/**
 * Stop is local. Network failure must not keep the clock running, and a
 * restore must write the frozen end_time (never recover that row).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), 'alyson-stop-offline-immediate');

jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  isLikelyOffline: jest.fn(() => true),
  updateTimeLog: jest.fn(() => new Promise(() => {})),
  closeOpenUrlLogs: jest.fn(),
  closeOpenAppLogs: jest.fn(),
}));

jest.mock(
  'electron',
  () => ({
    app: { getPath: () => require('path').join(require('os').tmpdir(), 'alyson-stop-offline-immediate') },
    net: { isOnline: () => false },
  }),
  { virtual: true },
);

const backendTimeLogs = require('../../utils/backend-time-logs');
const gsm = require('../graceful-shutdown-manager');
const TrackingManager = require('../tracking-manager');
const { shouldDropRecoveredSession } = require('../../utils/session-recovery');

function makeTm() {
  const tm = Object.create(TrackingManager.prototype);
  tm.config = { user_id: 1195 };
  tm.queue = [];
  tm.ledger = [];
  tm._offlineQueueWriteGen = 0;
  tm.getOfflineQueue = () => tm.queue.slice();
  tm._persistOfflineQueueOrThrow = (next) => {
    tm.queue = Array.isArray(next) ? next.slice() : [];
    tm._offlineQueueWriteGen += 1;
  };
  tm._appendTimeLedger = (entry) => {
    tm.ledger.push(entry);
  };
  tm.startOfflineSync = jest.fn();
  tm._offlineRetryTimeout = null;
  tm._clearOfflineRetryTimer = () => {};
  tm._scheduleNextOfflineRetry = () => {};
  return tm;
}

describe('Stop works immediately when the network is down', () => {
  const SESSION_ID = '1f610840-157e-4417-999e-1a410a6c2bba';
  const END = new Date(Date.now() - 30 * 1000).toISOString();
  const START = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    fs.mkdirSync(path.join(TMP, 'pending_sessions'), { recursive: true });
    global.currentTimeLogId = SESSION_ID;
    global.currentUserId = 1195;
    global._stopEndTimeOverride = END;
    global._stopAuthorizedIdleCut = false;
    global._idlePromptTimeCutSeconds = 0;
    global.isQuitting = false;
    gsm._capturedTimeLogId = SESSION_ID;
    gsm._capturedSessionMeta = {
      start_time: START,
      user_id: 1195,
      project_id: null,
      device_id: 'test-device',
    };
    const tm = makeTm();
    tm._queueOfflineTimeLogUpdate = TrackingManager.prototype._queueOfflineTimeLogUpdate;
    global.trackingManager = tm;
  });

  afterEach(() => {
    try {
      fs.rmSync(TMP, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
    delete global.currentTimeLogId;
    delete global.currentUserId;
    delete global._stopEndTimeOverride;
    delete global._stopAuthorizedIdleCut;
    delete global._idlePromptTimeCutSeconds;
    delete global.isQuitting;
    delete global.trackingManager;
  });

  it('returns as soon as the frozen end is on disk, even if the API never answers', async () => {
    const started = Date.now();
    const ok = await gsm._updateDatabase('idle_timeout');
    const elapsed = Date.now() - started;

    expect(ok).toBe(true);
    expect(elapsed).toBeLessThan(250);
    const pending = JSON.parse(
      fs.readFileSync(path.join(TMP, 'pending_sessions', `${SESSION_ID}.json`), 'utf8'),
    );
    expect(pending.endTime).toBe(END);
    expect(global.trackingManager.queue).toHaveLength(1);
    expect(global.trackingManager.queue[0].data.end_time).toBe(END);
    expect(global.trackingManager.queue[0].data.last_alive_at).toBe(END);
  });

  it('hydrates the pending close so restore writes that same frozen end', () => {
    fs.writeFileSync(
      path.join(TMP, 'pending_sessions', `${SESSION_ID}.json`),
      JSON.stringify({
        timeLogId: SESSION_ID,
        endTime: END,
        startTime: START,
        userId: 1195,
      }),
    );
    const tm = global.trackingManager;
    tm.hydratePendingClosesIntoOfflineQueue = TrackingManager.prototype.hydratePendingClosesIntoOfflineQueue;
    tm._queuedCloseEndTime = TrackingManager.prototype._queuedCloseEndTime;

    const count = tm.hydratePendingClosesIntoOfflineQueue({ flush: false });
    expect(count).toBe(1);
    expect(tm.queue[0].data.id).toBe(SESSION_ID);
    expect(tm.queue[0].data.end_time).toBe(END);
    expect(tm._queuedCloseEndTime(SESSION_ID)).toBe(END);
    expect(
      shouldDropRecoveredSession({
        recoveredId: SESSION_ID,
        explicitStop: false,
      }),
    ).toBe(true);
  });

  it('flushes the frozen close before a leftover ISE retry', async () => {
    backendTimeLogs.isLikelyOffline.mockReturnValue(false);
    backendTimeLogs.updateTimeLog.mockReset();
    backendTimeLogs.updateTimeLog.mockResolvedValue({ success: true });
    const leftover = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const tm = global.trackingManager;
    tm._processingOfflineQueue = false;
    tm._clampOverlappingQueuedSessions = () => {};
    tm._isTransientOfflineSyncError = () => false;
    tm._scheduleOfflineItemRetry = () => {};
    tm._commitProcessedOfflineQueue = TrackingManager.prototype._commitProcessedOfflineQueue;
    tm._armOfflineRetryTimer = () => {};
    tm._clearPendingSessionClose = jest.fn();
    tm.queue = [
      {
        type: 'update_time_log',
        data: { id: leftover, start_time: START, status: 'active' },
      },
      {
        type: 'update_time_log',
        data: { id: SESSION_ID, start_time: START, end_time: END, status: 'completed' },
      },
    ];

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(backendTimeLogs.updateTimeLog.mock.calls[0][0]).toBe(SESSION_ID);
    expect(backendTimeLogs.updateTimeLog.mock.calls[0][1].end_time).toBe(END);
  });

  it('keeps the earlier frozen end when a later retry tries to add time', () => {
    const tm = global.trackingManager;
    tm._saferQueuedClosePayload = TrackingManager.prototype._saferQueuedClosePayload;
    const later = new Date(new Date(END).getTime() + 2 * 60 * 60 * 1000).toISOString();
    tm._queueOfflineTimeLogUpdate({
      id: SESSION_ID,
      start_time: START,
      end_time: END,
      status: 'completed',
      frozen_end: true,
    }, { flush: false });
    tm._queueOfflineTimeLogUpdate({
      id: SESSION_ID,
      start_time: START,
      end_time: later,
      status: 'completed',
    }, { flush: false });

    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.end_time).toBe(END);
    expect(tm.queue[0].data.frozen_end).toBe(true);
  });
});
