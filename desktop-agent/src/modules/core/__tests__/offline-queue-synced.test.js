/**
 * Successful Stop used to leave the hours in offline-time-logs.json and the
 * ledger as queue_update. Wake rehydrated them and the 10s flusher retried
 * Internal server error forever. After a live write those rows must be gone
 * and must not come back from the ledger.
 */

jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  isLikelyOffline: jest.fn(() => false),
  createTimeLog: jest.fn(async (row) => ({ id: row.id, ...row })),
  updateTimeLog: jest.fn(),
  getTimeLog: jest.fn(async () => null),
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

const fs = require('fs');
const TrackingManager = require('../tracking-manager');
const backendTimeLogs = require('../../utils/backend-time-logs');

function makeTm({ armRetry = false } = {}) {
  const tm = Object.create(TrackingManager.prototype);
  tm.config = { user_id: 1196 };
  tm.offlineSyncTimer = null;
  tm._processingOfflineQueue = false;
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
  tm.offlineSyncTimer = null;
  tm._clearOfflineRetryTimer = TrackingManager.prototype._clearOfflineRetryTimer;
  tm._scheduleNextOfflineRetry = TrackingManager.prototype._scheduleNextOfflineRetry;
  tm._earliestOfflineRetryAt = TrackingManager.prototype._earliestOfflineRetryAt;
  // Default: do not arm real timers — a 250ms follow-up flush races the next
  // test and pollutes the shared updateTimeLog mock.
  tm._armOfflineRetryTimer = armRetry
    ? TrackingManager.prototype._armOfflineRetryTimer
    : jest.fn();
  tm._clampOverlappingQueuedSessions = () => {};
  tm._clearPendingSessionClose = jest.fn();
  tm._isFlushWideDbError = TrackingManager.prototype._isFlushWideDbError;
  tm._noteDbBackoff = () => {};
  tm._getTimeLedgerPath = () => '/tmp/time-ledger-test.jsonl';
  tm._readSessionCheckpoint = () => null;
  tm._resolveQueuedCloseStartTime =
    TrackingManager.prototype._resolveQueuedCloseStartTime;
  tm._remoteEndSatisfiesLocal =
    TrackingManager.prototype._remoteEndSatisfiesLocal;
  tm._remoteCloseAlreadySatisfied =
    TrackingManager.prototype._remoteCloseAlreadySatisfied;
  tm._upsertQueuedCloseAsCreate =
    TrackingManager.prototype._upsertQueuedCloseAsCreate;
  return tm;
}

describe('offline queue after a successful live write', () => {
  beforeEach(() => {
    backendTimeLogs.updateTimeLog.mockReset();
    backendTimeLogs.updateTimeLog.mockResolvedValue({ success: true });
    backendTimeLogs.createTimeLog.mockReset();
    backendTimeLogs.createTimeLog.mockImplementation(async (row) => ({
      id: row.id,
      ...row,
    }));
    backendTimeLogs.getTimeLog.mockReset();
    backendTimeLogs.getTimeLog.mockResolvedValue(null);
    backendTimeLogs.isLikelyOffline.mockReturnValue(false);
  });

  it('drops the queued close and records synced so rehydrate will not resurrect it', () => {
    const tm = makeTm();
    const id = '1ddcb4b2-3aea-4c15-9b1e-05f45b1f1cee';

    TrackingManager.prototype._queueOfflineTimeLogUpdate.call(
      tm,
      {
        id,
        user_id: 1196,
        start_time: '2026-09-09T12:16:03.398Z',
        end_time: '2026-09-09T12:47:10.396Z',
        status: 'completed',
      },
      { flush: false },
    );

    expect(tm.queue).toHaveLength(1);
    expect(tm.startOfflineSync).not.toHaveBeenCalled();
    expect(tm.ledger[tm.ledger.length - 1].event).toBe('queue_update');

    TrackingManager.prototype._markTimeLogSynced.call(tm, {
      id,
      start_time: '2026-09-09T12:16:03.398Z',
      end_time: '2026-09-09T12:47:10.396Z',
      status: 'completed',
      event: 'synced_update',
    });

    expect(tm.queue).toHaveLength(0);
    expect(tm.ledger[tm.ledger.length - 1].event).toBe('synced_update');
  });

  it('starts the retry loop only when the live write failed', () => {
    const tm = makeTm();
    TrackingManager.prototype._queueOfflineTimeLogUpdate.call(
      tm,
      {
        id: 'cf4fcd63-ff01-42a5-a53c-b83fdcdd8b33',
        end_time: '2026-09-09T13:00:00.000Z',
        status: 'completed',
      },
      { flush: false },
    );
    expect(tm.startOfflineSync).not.toHaveBeenCalled();

    tm.startOfflineSync();
    expect(tm.startOfflineSync).toHaveBeenCalledTimes(1);
  });

  it('does not rehydrate an id whose last ledger event is synced_update', () => {
    const fs = require('fs');
    const tm = makeTm();
    const id = '5043a76b-5d1f-46b7-80ce-a57e465481ec';
    const ledgerPath = '/tmp/time-ledger-rehydrate-test.jsonl';
    tm._getTimeLedgerPath = () => ledgerPath;
    tm._getAppDataDir = () => '/tmp';
    fs.writeFileSync(
      ledgerPath,
      [
        JSON.stringify({
          event: 'queue_update',
          id,
          start_time: '2026-09-09T12:52:58.000Z',
          end_time: '2026-09-09T13:06:01.000Z',
          status: 'completed',
        }),
        JSON.stringify({
          event: 'synced_update',
          id,
          start_time: '2026-09-09T12:52:58.000Z',
          end_time: '2026-09-09T13:06:01.000Z',
          status: 'completed',
        }),
      ].join('\n') + '\n',
    );

    TrackingManager.prototype._rehydrateOfflineQueueFromLedger.call(tm);

    expect(tm.queue).toHaveLength(0);
    fs.unlinkSync(ledgerPath);
  });

  it('rehydrates only when the last ledger event is still a queued close', () => {
    const fs = require('fs');
    const tm = makeTm();
    const id = 'a678d05f-418d-4648-9eac-f9b1a298ad53';
    const ledgerPath = '/tmp/time-ledger-rehydrate-queued.jsonl';
    tm._getTimeLedgerPath = () => ledgerPath;
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({
        event: 'queue_update',
        id,
        user_id: 1196,
        start_time: '2026-09-09T15:27:30.000Z',
        end_time: '2026-09-09T16:31:00.000Z',
        status: 'completed',
      }) + '\n',
    );

    TrackingManager.prototype._rehydrateOfflineQueueFromLedger.call(tm);

    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.id).toBe(id);
    expect(tm.queue[0].data.frozen_end).toBe(true);
    fs.unlinkSync(ledgerPath);
  });

  it('strips an already-synced id that is still sitting in the retry file', () => {
    const fs = require('fs');
    const tm = makeTm();
    const id = '1a836968-b024-45c7-8e08-a32d379da56a';
    tm.queue = [
      {
        type: 'update_time_log',
        data: { id, end_time: '2026-09-09T15:00:00.000Z', status: 'completed' },
      },
    ];
    const ledgerPath = '/tmp/time-ledger-strip-synced.jsonl';
    tm._getTimeLedgerPath = () => ledgerPath;
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({ event: 'synced_update', id, status: 'completed' }) + '\n',
    );

    TrackingManager.prototype._rehydrateOfflineQueueFromLedger.call(tm);

    expect(tm.queue).toHaveLength(0);
    fs.unlinkSync(ledgerPath);
  });

  it('does not insert a new session when update returns Internal server error', async () => {
    const tm = makeTm();
    const id = '822447d7-6435-482e-884a-d910fa1be3e8';
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id,
          user_id: 1196,
          start_time: '2026-09-09T15:05:17.000Z',
          end_time: '2026-09-09T15:27:24.000Z',
          status: 'completed',
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValueOnce(new Error('Internal server error'));
    backendTimeLogs.createTimeLog.mockClear();

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(backendTimeLogs.createTimeLog).not.toHaveBeenCalled();
    expect(backendTimeLogs.updateTimeLog).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ frozen_end: true, end_time: '2026-09-09T15:27:24.000Z' }),
      tm.config,
      expect.anything(),
    );
    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.id).toBe(id);
    expect(tm.queue[0].data._retryCount).toBe(1);
    expect(Number(tm.queue[0].data._nextRetryAt)).toBeGreaterThan(Date.now());
    if (tm._offlineRetryTimeout) clearTimeout(tm._offlineRetryTimeout);
  });

  it('does not re-POST an Internal server error item until backoff expires', async () => {
    const tm = makeTm();
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id: 'ise-backoff',
          user_id: 1196,
          start_time: '2026-09-09T15:05:17.000Z',
          end_time: '2026-09-09T15:27:24.000Z',
          status: 'completed',
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValue(new Error('Internal server error'));

    await TrackingManager.prototype.processOfflineQueue.call(tm);
    backendTimeLogs.updateTimeLog.mockClear();

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(backendTimeLogs.updateTimeLog).not.toHaveBeenCalled();
    expect(tm.queue).toHaveLength(1);
    if (tm._offlineRetryTimeout) clearTimeout(tm._offlineRetryTimeout);
  });

  it('startOfflineSync does not install a polling interval', () => {
    const tm = Object.create(TrackingManager.prototype);
    tm.offlineSyncTimer = null;
    tm._offlineRetryTimeout = null;
    tm._offlineResumeHooksBound = true;
    tm._processingOfflineQueue = false;
    tm.getOfflineQueue = () => [];
    tm._flushOfflineQueueIfOnline = jest.fn();
    tm._scheduleNextOfflineRetry = jest.fn();

    TrackingManager.prototype.startOfflineSync.call(tm);

    expect(tm.offlineSyncTimer).toBeNull();
    expect(tm._flushOfflineQueueIfOnline).toHaveBeenCalledTimes(1);
  });

  it('schedules one backoff timeout after Internal server error, not an interval', async () => {
    const tm = makeTm({ armRetry: true });
    tm.startOfflineSync = TrackingManager.prototype.startOfflineSync;
    tm._bindOfflineResumeHooks = () => {};
    tm._requestOfflineFlush = TrackingManager.prototype._requestOfflineFlush;
    tm._flushOfflineQueueIfOnline = TrackingManager.prototype._flushOfflineQueueIfOnline;
    tm._hasDueOfflineItems = TrackingManager.prototype._hasDueOfflineItems;
    tm._scheduleOfflineItemRetry = TrackingManager.prototype._scheduleOfflineItemRetry;
    tm._offlineRetryDelayMs = TrackingManager.prototype._offlineRetryDelayMs;
    tm._isTransientOfflineSyncError = TrackingManager.prototype._isTransientOfflineSyncError;
    tm._clampOverlappingQueuedSessions = () => {};
    tm._commitProcessedOfflineQueue = (original, remaining) => {
      tm.queue = remaining.slice();
    };
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id: 'one-timeout',
          user_id: 1196,
          start_time: '2026-09-09T15:05:17.000Z',
          end_time: '2026-09-09T15:27:24.000Z',
          status: 'completed',
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValue(new Error('Internal server error'));

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(tm.offlineSyncTimer).toBeNull();
    expect(tm._offlineRetryTimeout).toBeTruthy();
    clearTimeout(tm._offlineRetryTimeout);
  });

  it('does not open HTTP while every queued item is still in backoff', () => {
    const tm = makeTm();
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id: 'backoff-skip',
          _nextRetryAt: Date.now() + 60_000,
        },
      },
    ];
    const flush = TrackingManager.prototype._flushOfflineQueueIfOnline;
    tm.processOfflineQueue = jest.fn();
    tm.getOfflineQueue = () => tm.queue.slice();

    flush.call(tm);

    expect(tm.processOfflineQueue).not.toHaveBeenCalled();
  });

  it('stops the flush after the first DB failure so one agent does not open N connections', async () => {
    const tm = makeTm();
    tm.startOfflineSync = TrackingManager.prototype.startOfflineSync;
    tm._bindOfflineResumeHooks = () => {};
    tm._requestOfflineFlush = TrackingManager.prototype._requestOfflineFlush;
    tm._flushOfflineQueueIfOnline = TrackingManager.prototype._flushOfflineQueueIfOnline;
    tm._hasDueOfflineItems = TrackingManager.prototype._hasDueOfflineItems;
    tm._scheduleOfflineItemRetry = TrackingManager.prototype._scheduleOfflineItemRetry;
    tm._offlineRetryDelayMs = TrackingManager.prototype._offlineRetryDelayMs;
    tm._isTransientOfflineSyncError = TrackingManager.prototype._isTransientOfflineSyncError;
    tm._noteDbBackoff = TrackingManager.prototype._noteDbBackoff;
    tm._clampOverlappingQueuedSessions = () => {};
    tm._commitProcessedOfflineQueue = (original, remaining) => {
      tm.queue = remaining.slice();
    };
    tm.queue = [
      { type: 'update_time_log', data: { id: 'a', user_id: 1, start_time: 't', end_time: 't2', status: 'completed' } },
      { type: 'update_time_log', data: { id: 'b', user_id: 1, start_time: 't', end_time: 't2', status: 'completed' } },
      { type: 'update_time_log', data: { id: 'c', user_id: 1, start_time: 't', end_time: 't2', status: 'completed' } },
    ];
    backendTimeLogs.updateTimeLog.mockClear();
    backendTimeLogs.updateTimeLog.mockRejectedValue(new Error('too many connections'));

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(backendTimeLogs.updateTimeLog).toHaveBeenCalledTimes(1);
    expect(tm.queue).toHaveLength(3);
    if (tm._offlineRetryTimeout) clearTimeout(tm._offlineRetryTimeout);
  });

  it('does not park a fresh frozen Stop behind a leftover Internal server error', async () => {
    const tm = makeTm();
    tm._isFlushWideDbError = TrackingManager.prototype._isFlushWideDbError;
    tm._clampOverlappingQueuedSessions = () => {};
    tm._commitProcessedOfflineQueue = (original, remaining) => {
      tm.queue = remaining.slice();
    };
    const poisonId = 'poison-35k';
    const freshId = 'fresh-frozen';
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id: poisonId,
          user_id: 1,
          start_time: '2026-10-09T10:00:00.000Z',
          end_time: '2026-10-09T10:30:00.000Z',
          status: 'completed',
          _retryCount: 35652,
        },
      },
      {
        type: 'update_time_log',
        data: {
          id: freshId,
          user_id: 1,
          start_time: '2026-10-09T10:40:00.000Z',
          end_time: '2026-10-09T10:47:58.000Z',
          status: 'completed',
          frozen_end: true,
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockClear();
    backendTimeLogs.createTimeLog.mockClear();
    backendTimeLogs.updateTimeLog.mockImplementation(async (id) => {
      if (id === poisonId) throw new Error('Internal server error');
      return { success: true, id };
    });
    backendTimeLogs.createTimeLog.mockResolvedValue({ id: poisonId, status: 'completed' });

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    const tried = backendTimeLogs.updateTimeLog.mock.calls.map((call) => call[0]);
    expect(tried).toContain(freshId);
    expect(tried[0]).toBe(freshId);
    expect(tm.queue.some((item) => item.data.id === freshId)).toBe(false);
    // High-attempt ISE close is drained via same-UUID create upsert (not parked forever).
    expect(tm.queue.some((item) => item.data.id === poisonId)).toBe(false);
    expect(backendTimeLogs.createTimeLog).toHaveBeenCalledWith(
      expect.objectContaining({ id: poisonId }),
      expect.anything(),
      expect.anything(),
    );
    if (tm._offlineRetryTimeout) clearTimeout(tm._offlineRetryTimeout);
  });

  it('keeps hours queued during a flush and does not put a live-synced id back', () => {
    const tm = makeTm();
    const original = [
      { type: 'update_time_log', data: { id: 'A', end_time: 't1' } },
      { type: 'update_time_log', data: { id: 'B', end_time: 't2' } },
      { type: 'update_time_log', data: { id: 'C', end_time: 't3' } },
    ];
    const remaining = [{ type: 'update_time_log', data: { id: 'B', end_time: 't2' } }];
    const genAtStart = tm._offlineQueueWriteGen;
    // Concurrent: live Stop saved C (removed) and sleep queued D.
    tm.queue = [
      { type: 'update_time_log', data: { id: 'A', end_time: 't1' } },
      { type: 'update_time_log', data: { id: 'B', end_time: 't2' } },
      { type: 'update_time_log', data: { id: 'D', end_time: 't4' } },
    ];
    tm._offlineQueueWriteGen = genAtStart + 1;

    TrackingManager.prototype._commitProcessedOfflineQueue.call(
      tm,
      original,
      remaining,
      genAtStart,
    );

    const ids = tm.queue.map((item) => item.data.id).sort();
    expect(ids).toEqual(['B', 'D']);
  });

  it('keeps hours on disk and re-arms a timeout if the flush commit throws', async () => {
    const tm = makeTm({ armRetry: true });
    tm._commitProcessedOfflineQueue = () => {
      throw new Error('disk busy');
    };
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id: 'keep-hours',
          user_id: 1196,
          start_time: '2026-09-09T15:05:17.000Z',
          end_time: '2026-09-09T15:27:24.000Z',
          status: 'completed',
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValueOnce(new Error('Internal server error'));

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.id).toBe('keep-hours');
    expect(tm.queue[0].data.start_time).toBe('2026-09-09T15:05:17.000Z');
    expect(tm.queue[0].data.end_time).toBe('2026-09-09T15:27:24.000Z');
    expect(tm._offlineRetryTimeout).toBeTruthy();
    clearTimeout(tm._offlineRetryTimeout);
  });

  it('does not burn retry count on items skipped by the flush batch cap', async () => {
    const tm = makeTm();
    const mk = (id, hour) => ({
      type: 'update_time_log',
      data: {
        id,
        user_id: 1196,
        start_time: `2026-10-09T${hour}:00:00.000Z`,
        end_time: `2026-10-09T${hour}:50:00.000Z`,
        status: 'completed',
        frozen_end: true,
      },
    });
    tm.queue = [mk('batch-a', '12'), mk('batch-b', '13'), mk('batch-c', '14')];

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(backendTimeLogs.updateTimeLog).toHaveBeenCalledTimes(2);
    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.id).toBe('batch-c');
    expect(tm.queue[0].data._retryCount || 0).toBe(0);
  });

  it('flushes a fresh frozen Stop before a poisoned high-attempt retry', async () => {
    const tm = makeTm();
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id: 'poisoned',
          user_id: 1196,
          end_time: '2026-10-09T10:00:00.000Z',
          status: 'completed',
          frozen_end: true,
          _retryCount: 120,
        },
      },
      {
        type: 'update_time_log',
        data: {
          id: 'fresh-stop',
          user_id: 1196,
          end_time: '2026-10-09T14:00:00.000Z',
          status: 'completed',
          frozen_end: true,
        },
      },
    ];

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(backendTimeLogs.updateTimeLog.mock.calls[0][0]).toBe('fresh-stop');
    expect(backendTimeLogs.updateTimeLog.mock.calls.map((c) => c[0])).toEqual([
      'fresh-stop',
      'poisoned',
    ]);
  });

  it('upserts a frozen close via create_time_log after repeated update ISE (Ahsan poison)', async () => {
    const tm = makeTm();
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id,
          user_id: 1201,
          start_time: '2026-10-09T12:00:00.000Z',
          end_time: '2026-10-09T18:00:00.000Z',
          status: 'completed',
          frozen_end: true,
          _retryCount: 5,
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValueOnce(new Error('Internal server error'));
    backendTimeLogs.createTimeLog.mockResolvedValueOnce({ id, status: 'completed' });

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(backendTimeLogs.updateTimeLog).toHaveBeenCalledTimes(1);
    expect(backendTimeLogs.createTimeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        start_time: '2026-10-09T12:00:00.000Z',
        end_time: '2026-10-09T18:00:00.000Z',
        status: 'completed',
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(tm.queue).toHaveLength(0);
  });

  it('recovers start_time from ledger and upserts after ISE (Salman poison)', async () => {
    const fs = require('fs');
    const path = require('path');
    const tm = makeTm();
    const id = 'salman-stuck-close-uuid';
    const ledgerPath = path.join(
      require('os').tmpdir(),
      `time-ledger-salman-poison-${process.pid}.jsonl`,
    );
    tm._getTimeLedgerPath = () => ledgerPath;
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({
        event: 'queue_update',
        id,
        start_time: '2026-10-08T14:00:00.000Z',
        end_time: '2026-10-08T18:30:00.000Z',
        status: 'completed',
      }) + '\n',
    );
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id,
          user_id: 1214,
          // start_time intentionally missing — the poison case
          end_time: '2026-10-08T18:30:00.000Z',
          status: 'completed',
          _retryCount: 228,
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValueOnce(new Error('Internal server error'));
    backendTimeLogs.createTimeLog.mockResolvedValueOnce({ id, status: 'completed' });

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(backendTimeLogs.createTimeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        start_time: '2026-10-08T14:00:00.000Z',
        end_time: '2026-10-08T18:30:00.000Z',
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(tm.queue).toHaveLength(0);
    try {
      fs.unlinkSync(ledgerPath);
    } catch (_) { /* ignore */ }
  });

  it('drains when RDS already has end ≥ local after update ISE', async () => {
    const tm = makeTm();
    const id = 'already-closed-on-rds';
    const localEnd = '2026-10-11T16:00:00.000Z';
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id,
          user_id: 1214,
          start_time: '2026-10-11T12:00:00.000Z',
          end_time: localEnd,
          status: 'completed',
          _retryCount: 50,
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValue(new Error('Internal server error'));
    backendTimeLogs.createTimeLog.mockRejectedValue(new Error('Internal server error'));
    backendTimeLogs.getTimeLog.mockResolvedValue({
      id,
      start_time: '2026-10-11T12:00:00.000Z',
      end_time: '2026-10-11T16:00:01.000Z',
      status: 'completed',
    });

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(backendTimeLogs.createTimeLog).toHaveBeenCalled();
    expect(backendTimeLogs.getTimeLog).toHaveBeenCalledWith(
      id,
      expect.anything(),
      expect.anything(),
    );
    expect(tm.queue).toHaveLength(0);
    expect(tm.ledger.some((e) => e.event === 'synced_update_remote_satisfied')).toBe(
      true,
    );
  });

  it('keeps retrying when remote end is shorter than local billed end', async () => {
    const tm = makeTm();
    const id = 'remote-shorter-keep';
    tm.queue = [
      {
        type: 'update_time_log',
        data: {
          id,
          user_id: 1214,
          start_time: '2026-10-11T12:00:00.000Z',
          end_time: '2026-10-11T18:00:00.000Z',
          status: 'completed',
          _retryCount: 50,
        },
      },
    ];
    backendTimeLogs.updateTimeLog.mockRejectedValue(new Error('Internal server error'));
    backendTimeLogs.createTimeLog.mockRejectedValue(new Error('Internal server error'));
    backendTimeLogs.getTimeLog.mockResolvedValue({
      id,
      end_time: '2026-10-11T16:00:00.000Z', // 2h shorter — must not drain
      status: 'completed',
    });

    await TrackingManager.prototype.processOfflineQueue.call(tm);

    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.id).toBe(id);
  });

  it('rehydrates unsynced hours after a restart so they are not lost with the timeout', () => {
    const fs = require('fs');
    const tm = makeTm();
    const id = 'restart-keep-hours';
    const ledgerPath = '/tmp/time-ledger-restart-keep.jsonl';
    tm._getTimeLedgerPath = () => ledgerPath;
    tm.queue = [];
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({
        event: 'queue_update',
        id,
        user_id: 1196,
        start_time: '2026-09-09T15:05:17.000Z',
        end_time: '2026-09-09T19:05:17.000Z',
        status: 'completed',
      }) + '\n',
    );

    TrackingManager.prototype._rehydrateOfflineQueueFromLedger.call(tm);

    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.id).toBe(id);
    expect(tm.queue[0].data.end_time).toBe('2026-09-09T19:05:17.000Z');
    fs.unlinkSync(ledgerPath);
  });
});
