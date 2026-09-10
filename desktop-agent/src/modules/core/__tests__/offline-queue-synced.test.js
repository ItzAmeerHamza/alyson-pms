/**
 * Successful Stop used to leave the hours in offline-time-logs.json and the
 * ledger as queue_update. Wake rehydrated them and the 10s flusher retried
 * Internal server error forever. After a live write those rows must be gone
 * and must not come back from the ledger.
 */

jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  createTimeLog: jest.fn(async (row) => ({ id: row.id, ...row })),
  updateTimeLog: jest.fn(),
}));

jest.mock('../../utils/device-id', () => ({
  getDeviceId: () => 'test-device',
}));

jest.mock('electron', () => ({
  net: { isOnline: () => true },
  app: { getPath: () => '/tmp' },
}));

const fs = require('fs');
const TrackingManager = require('../tracking-manager');
const backendTimeLogs = require('../../utils/backend-time-logs');

function makeTm() {
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
  tm._getTimeLedgerPath = () => '/tmp/time-ledger-test.jsonl';
  tm._readSessionCheckpoint = () => null;
  return tm;
}

describe('offline queue after a successful live write', () => {
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
    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.id).toBe(id);
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
});
