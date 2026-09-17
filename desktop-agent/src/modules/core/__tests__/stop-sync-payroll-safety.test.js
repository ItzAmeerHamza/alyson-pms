/**
 * Guardrails for the Stop / retry-queue edits:
 *   - tracking must not stop by itself
 *   - hours must not disappear when the API fails
 *   - a saved session must not be replayed as extra time
 */

jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  createTimeLog: jest.fn(async (row) => ({ id: row.id, ...row })),
  updateTimeLog: jest.fn(async (id, updates) => ({ id, ...updates })),
}));

jest.mock('../../utils/device-id', () => ({
  getDeviceId: () => 'test-device',
}));

jest.mock('../../utils/offline-screenshot-queue', () => ({
  getOfflineScreenshotQueue: () => ({
    start: jest.fn(),
    requestFlush: jest.fn(),
  }),
}));

jest.mock(
  'electron',
  () => ({
    net: { isOnline: () => true },
    app: { getPath: () => '/tmp' },
  }),
  { virtual: true },
);

const TrackingManager = require('../tracking-manager');
const backendTimeLogs = require('../../utils/backend-time-logs');
const { mergeIntervalsSeconds } = require('../../utils/today-time-log-stats');

const SESSION_ID = '1ddcb4b2-3aea-4c15-9b1e-05f45b1f1cee';
const FOUR_HOURS = 4 * 3600;

let START;
let END;

function billedSeconds(rows) {
  const intervals = [];
  for (const row of rows) {
    if (!row.start_time || !row.end_time) continue;
    const startMs = new Date(row.start_time).getTime();
    const endMs = new Date(row.end_time).getTime();
    if (endMs > startMs) intervals.push({ startMs, endMs });
  }
  return mergeIntervalsSeconds(intervals);
}

function makeTm() {
  const tm = Object.create(TrackingManager.prototype);
  tm.config = { user_id: 1196 };
  tm.offlineSyncTimer = null;
  tm._processingOfflineQueue = false;
  tm._offlineQueueWriteGen = 0;
  tm.queue = [];
  tm.ledger = [];
  tm.isTracking = true;
  tm.currentTimeLogId = SESSION_ID;
  tm.sessionStartTime = START;
  tm.currentSession = { id: SESSION_ID, start_time: START, _offline: false };
  tm.currentProjectId = null;
  tm.stopTracking = jest.fn();
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
  tm._clearOfflineRetryTimer = TrackingManager.prototype._clearOfflineRetryTimer;
  tm._scheduleNextOfflineRetry = TrackingManager.prototype._scheduleNextOfflineRetry;
  tm._earliestOfflineRetryAt = TrackingManager.prototype._earliestOfflineRetryAt;
  tm._armOfflineRetryTimer = TrackingManager.prototype._armOfflineRetryTimer;
  tm._storePendingSessionClose = jest.fn();
  tm._clearPendingSessionClose = jest.fn();
  tm._clearSessionCheckpoint = jest.fn();
  tm._readSessionCheckpoint = () => ({
    startTime: START,
    timeLogId: SESSION_ID,
    checkpointAt: END,
  });
  return tm;
}

describe('online Stop — no secret stop, no lost hours, no phantom hours', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const endMs = Date.now();
    END = new Date(endMs).toISOString();
    START = new Date(endMs - FOUR_HOURS * 1000).toISOString();
    backendTimeLogs.isBackendTimeLogsEnabled.mockReturnValue(true);
    backendTimeLogs.updateTimeLog.mockResolvedValue({ success: true });
    backendTimeLogs.createTimeLog.mockImplementation(async (row) => ({ id: row.id, ...row }));
    global._stopEndTimeOverride = END;
    global._stopAuthorizedIdleCut = false;
    global._idlePromptTimeCutSeconds = 0;
    global.currentSession = { start_time: START, _offline: false };
    global.enhancedIdleMonitor = { getSessionIdleSeconds: () => 0 };
  });

  afterEach(() => {
    global._stopEndTimeOverride = null;
    global.currentSession = undefined;
    global.enhancedIdleMonitor = undefined;
  });

  it('successful online Stop saves the session once and does not start retry or stop tracking', async () => {
    const tm = makeTm();

    const result = await tm._endCurrentTimeLogBackground(SESSION_ID);

    expect(result.success).toBe(true);
    expect(result.offline).not.toBe(true);
    expect(backendTimeLogs.updateTimeLog).toHaveBeenCalledTimes(1);
    expect(backendTimeLogs.updateTimeLog.mock.calls[0][0]).toBe(SESSION_ID);
    expect(backendTimeLogs.updateTimeLog.mock.calls[0][1].end_time).toBe(END);
    expect(backendTimeLogs.createTimeLog).not.toHaveBeenCalled();
    expect(tm.queue).toHaveLength(0);
    expect(tm.ledger.filter((e) => e.event === 'synced_update')).toHaveLength(1);
    expect(tm.startOfflineSync).not.toHaveBeenCalled();
    expect(tm.stopTracking).not.toHaveBeenCalled();
    expect(tm.isTracking).toBe(true);
    expect(billedSeconds([{ start_time: START, end_time: END }])).toBe(FOUR_HOURS);
  });

  it('failed online Stop keeps the exact hours on disk for retry (no drop, no second session)', async () => {
    const tm = makeTm();
    backendTimeLogs.updateTimeLog.mockRejectedValueOnce(new Error('Backend sync timeout after 8000ms'));

    const result = await tm._endCurrentTimeLogBackground(SESSION_ID);

    expect(result.success).toBe(true);
    expect(result.offline).toBe(true);
    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.id).toBe(SESSION_ID);
    expect(tm.queue[0].data.start_time).toBe(START);
    expect(tm.queue[0].data.end_time).toBe(END);
    expect(backendTimeLogs.createTimeLog).not.toHaveBeenCalled();
    expect(tm.startOfflineSync).toHaveBeenCalled();
    expect(tm.stopTracking).not.toHaveBeenCalled();
    expect(billedSeconds([tm.queue[0].data])).toBe(FOUR_HOURS);
  });

  it('retry flush while tracking does not stop the session or invent a new id', async () => {
    const tm = makeTm();
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id: SESSION_ID,
          user_id: 1196,
          start_time: START,
          end_time: END,
          status: 'completed',
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockResolvedValue({ success: true });

    await tm.processOfflineQueue();

    expect(tm.stopTracking).not.toHaveBeenCalled();
    expect(tm.isTracking).toBe(true);
    expect(backendTimeLogs.createTimeLog).not.toHaveBeenCalled();
    expect(tm.queue).toHaveLength(0);
    if (tm._offlineRetryTimeout) clearTimeout(tm._offlineRetryTimeout);
  });

  it('a missing row upserts the same UUID — billed time is one 4h span, not two', async () => {
    const tm = makeTm();
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id: SESSION_ID,
          user_id: 1196,
          start_time: START,
          end_time: END,
          status: 'completed',
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValueOnce(
      new Error(`update_time_log no rows for ${SESSION_ID}`),
    );

    await tm.processOfflineQueue();

    expect(backendTimeLogs.createTimeLog).toHaveBeenCalledTimes(1);
    expect(backendTimeLogs.createTimeLog.mock.calls[0][0].id).toBe(SESSION_ID);
    expect(tm.queue).toHaveLength(0);
    const saved = backendTimeLogs.createTimeLog.mock.calls[0][0];
    expect(billedSeconds([saved, saved])).toBe(FOUR_HOURS);
    if (tm._offlineRetryTimeout) clearTimeout(tm._offlineRetryTimeout);
  });

  it('Internal server error does not create a second overlapping session', async () => {
    const tm = makeTm();
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id: SESSION_ID,
          user_id: 1196,
          start_time: START,
          end_time: END,
          status: 'completed',
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValueOnce(new Error('Internal server error'));

    await tm.processOfflineQueue();

    expect(backendTimeLogs.createTimeLog).not.toHaveBeenCalled();
    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.id).toBe(SESSION_ID);
    expect(billedSeconds([tm.queue[0].data])).toBe(FOUR_HOURS);
    if (tm._offlineRetryTimeout) clearTimeout(tm._offlineRetryTimeout);
  });

  it('replaying a synced close does not add a second billed interval', () => {
    const tm = makeTm();
    tm.queue = [
      {
        type: 'update_time_log',
        data: { id: SESSION_ID, start_time: START, end_time: END, status: 'completed' },
      },
    ];
    tm.ledger.push({ event: 'synced_update', id: SESSION_ID, start_time: START, end_time: END });
    const fs = require('fs');
    const ledgerPath = '/tmp/payroll-safety-synced.jsonl';
    tm._getTimeLedgerPath = () => ledgerPath;
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({
        event: 'synced_update',
        id: SESSION_ID,
        start_time: START,
        end_time: END,
      }) + '\n',
    );

    tm._rehydrateOfflineQueueFromLedger();

    expect(tm.queue).toHaveLength(0);
    const serverRows = [{ id: SESSION_ID, start_time: START, end_time: END }];
    expect(billedSeconds(serverRows)).toBe(FOUR_HOURS);
    fs.unlinkSync(ledgerPath);
  });

  it('flush merge keeps a session queued during Stop and does not resurrect a live-synced id', () => {
    const tm = makeTm();
    const liveSynced = SESSION_ID;
    const stillRetrying = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const queuedDuringFlush = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const original = [
      { type: 'update_time_log', data: { id: liveSynced, start_time: START, end_time: END } },
      { type: 'update_time_log', data: { id: stillRetrying, start_time: START, end_time: END } },
    ];
    const remaining = [
      { type: 'update_time_log', data: { id: stillRetrying, start_time: START, end_time: END } },
    ];
    const genAtStart = tm._offlineQueueWriteGen;
    tm.queue = [
      { type: 'update_time_log', data: { id: stillRetrying, start_time: START, end_time: END } },
      {
        type: 'update_time_log',
        data: {
          id: queuedDuringFlush,
          start_time: START,
          end_time: new Date(new Date(END).getTime() + 1800 * 1000).toISOString(),
        },
      },
    ];
    tm._offlineQueueWriteGen = genAtStart + 1;

    tm._commitProcessedOfflineQueue(original, remaining, genAtStart);

    const ids = tm.queue.map((item) => item.data.id).sort();
    expect(ids).toEqual([stillRetrying, queuedDuringFlush].sort());
    expect(ids).not.toContain(liveSynced);
    expect(billedSeconds(tm.queue.map((item) => item.data))).toBe(FOUR_HOURS + 1800);
  });
});
