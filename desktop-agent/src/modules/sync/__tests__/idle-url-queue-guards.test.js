jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  insertAppLogsBatch: jest.fn(),
  insertUrlLogsBatch: jest.fn(),
  getLastAllAppLogsClosedAt: jest.fn(() => 0),
  isLikelyOffline: jest.fn(() => false),
}));
jest.mock('../../utils/idle-log-write', () => ({
  flushIdleLogQueue: jest.fn(),
}));

const backend = require('../../utils/backend-time-logs');
const { flushIdleLogQueue } = require('../../utils/idle-log-write');
const EnhancedSyncManager = require('../enhanced-sync-manager');

describe('15 s idle/url queue drains', () => {
  let manager;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    backend.isLikelyOffline.mockReturnValue(false);
    global.offlineQueue = { idleLogs: [{ id: 'a' }], urlLogs: [] };
    manager = new EnhancedSyncManager({});
  });
  afterEach(() => {
    delete global.offlineQueue;
    jest.restoreAllMocks();
  });

  it('never runs two idle drains at once', async () => {
    let release;
    flushIdleLogQueue.mockImplementation(() => new Promise((r) => { release = r; }));
    const first = manager.processIdleQueue();
    await manager.processIdleQueue();
    expect(flushIdleLogQueue).toHaveBeenCalledTimes(1);
    release({ flushed: 1, requeued: 0 });
    await first;
  });

  it('skips the idle drain while offline', async () => {
    backend.isLikelyOffline.mockReturnValue(true);
    await manager.processIdleQueue();
    expect(flushIdleLogQueue).not.toHaveBeenCalled();
    expect(global.offlineQueue.idleLogs).toHaveLength(1);
  });

  it('backs off after a requeue and resets on success', async () => {
    flushIdleLogQueue.mockResolvedValueOnce({ flushed: 0, requeued: 1 });
    await manager.processIdleQueue();
    expect(manager.idleLogRetry.failures).toBe(1);
    expect(manager.idleLogRetry.nextAttemptAt).toBeGreaterThan(Date.now());

    await manager.processIdleQueue(); // still in backoff
    expect(flushIdleLogQueue).toHaveBeenCalledTimes(1);

    manager.idleLogRetry.nextAttemptAt = 0;
    flushIdleLogQueue.mockResolvedValueOnce({ flushed: 1, requeued: 0 });
    await manager.processIdleQueue();
    expect(flushIdleLogQueue).toHaveBeenCalledTimes(2);
    expect(manager.idleLogRetry.failures).toBe(0);
    expect(manager.idleLogRetry.nextAttemptAt).toBe(0);
  });

  it('never runs two URL drains at once', async () => {
    let release;
    manager._insertUrlBatch = jest.fn(() => new Promise((r) => { release = r; }));
    global.offlineQueue.urlLogs = [{ url: 'a' }];
    const first = manager.processUrlQueue();
    await manager.processUrlQueue();
    expect(manager._insertUrlBatch).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(global.offlineQueue.urlLogs).toHaveLength(0);
  });

  it('keeps every unsent URL row while offline (nothing is dropped)', async () => {
    backend.isLikelyOffline.mockReturnValue(true);
    global.offlineQueue.urlLogs = Array.from({ length: 2100 }, (_, i) => ({ i }));
    await manager.processUrlQueue();
    expect(global.offlineQueue.urlLogs).toHaveLength(2100);
    expect(global.offlineQueue.urlLogs[0].i).toBe(0);
  });
});
