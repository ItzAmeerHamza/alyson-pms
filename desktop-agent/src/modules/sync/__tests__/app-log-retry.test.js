jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  insertAppLogsBatch: jest.fn(),
  insertUrlLogsBatch: jest.fn(),
  getLastAllAppLogsClosedAt: jest.fn(() => 0),
}));

const backend = require('../../utils/backend-time-logs');
const EnhancedSyncManager = require('../enhanced-sync-manager');

const T0 = Date.parse('2026-10-13T15:42:01.000Z');
const appLog = (name, offsetSec) => ({
  user_id: '1195',
  app_name: name,
  window_title: name,
  timestamp: new Date(T0 + offsetSec * 1000).toISOString(),
});
const sentNames = () => backend.insertAppLogsBatch.mock.calls.map(([rows]) => rows.map((r) => r.app_name));

describe('app log upload retry', () => {
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.isScreenLocked = false;
    backend.getLastAllAppLogsClosedAt.mockReturnValue(0);
    manager = new EnhancedSyncManager({});
  });

  afterEach(() => {
    for (const timer of manager.flushTimers.values()) clearTimeout(timer);
    manager.flushTimers.clear();
    jest.restoreAllMocks();
  });

  const retryNow = () => {
    manager.appLogRetry.nextAttemptAt = 0;
    return manager.flushBatchQueue('appLogs');
  };

  it('retries a failed app switch before newer ones, in order', async () => {
    backend.insertAppLogsBatch.mockRejectedValueOnce(new Error('Backend sync timeout after 12000ms (insert_app_logs)'));
    manager.batchQueues.appLogs.push(appLog('Slack', 0));
    await manager.flushBatchQueue('appLogs');

    manager.batchQueues.appLogs.push(appLog('Chrome', 100));
    backend.insertAppLogsBatch.mockResolvedValue({ success: true });
    await retryNow();

    expect(sentNames()).toEqual([['Slack'], ['Slack', 'Chrome']]);
    expect(manager.batchQueues.appLogs).toHaveLength(0);
    expect(manager.appLogRetry.failures).toBe(0);
  });

  it('sends at most 8 rows per request because the backend ignores the rest', async () => {
    backend.insertAppLogsBatch.mockResolvedValue({ success: true });
    manager.batchQueues.appLogs.push(...Array.from({ length: 20 }, (_, i) => appLog(`App${i}`, i)));

    await manager.flushBatchQueue('appLogs');

    expect(backend.insertAppLogsBatch.mock.calls.map(([rows]) => rows.length)).toEqual([8, 8, 4]);
    expect(sentNames().flat()).toEqual(Array.from({ length: 20 }, (_, i) => `App${i}`));
  });

  it('keeps only the unsent rows when a later request fails', async () => {
    backend.insertAppLogsBatch
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue({ success: true });
    manager.batchQueues.appLogs.push(...Array.from({ length: 20 }, (_, i) => appLog(`App${i}`, i)));

    await manager.flushBatchQueue('appLogs');
    expect(manager.batchQueues.appLogs.map((r) => r.app_name)).toEqual(
      Array.from({ length: 12 }, (_, i) => `App${i + 8}`),
    );

    await retryNow();
    expect(sentNames().slice(2).flat()).toEqual(Array.from({ length: 12 }, (_, i) => `App${i + 8}`));
  });

  it('waits for the backoff instead of retrying on every app switch', async () => {
    backend.insertAppLogsBatch.mockRejectedValueOnce(new Error('fetch failed'));
    manager.batchQueues.appLogs.push(appLog('Slack', 0));
    await manager.flushBatchQueue('appLogs');

    manager.batchQueues.appLogs.push(appLog('Chrome', 5));
    await manager.flushBatchQueue('appLogs');

    expect(backend.insertAppLogsBatch).toHaveBeenCalledTimes(1);
    expect(manager.appLogRetry.nextAttemptAt).toBeGreaterThan(Date.now());
    expect(manager.flushTimers.has('appLogs')).toBe(true);
  });

  it('does not send newer rows while an earlier request is still in flight', async () => {
    let release;
    backend.insertAppLogsBatch.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    manager.batchQueues.appLogs.push(appLog('Slack', 0));
    const first = manager.flushBatchQueue('appLogs');

    manager.batchQueues.appLogs.push(appLog('Chrome', 5));
    await manager.flushBatchQueue('appLogs');
    expect(backend.insertAppLogsBatch).toHaveBeenCalledTimes(1);

    release({ success: true });
    await first;
    expect(manager.flushTimers.has('appLogs')).toBe(true);
  });

  it('skips rows stamped before the last Stop so they do not reopen apps', async () => {
    backend.getLastAllAppLogsClosedAt.mockReturnValue(T0 + 60_000);
    backend.insertAppLogsBatch.mockResolvedValue({ success: true });
    manager.batchQueues.appLogs.push(appLog('BeforeStop', 30), appLog('AfterStart', 90));

    await manager.flushBatchQueue('appLogs');

    expect(sentNames()).toEqual([['AfterStart']]);
  });

  it('caps the retry queue by dropping the oldest rows', async () => {
    backend.insertAppLogsBatch.mockRejectedValue(new Error('fetch failed'));
    manager.batchQueues.appLogs.push(...Array.from({ length: 505 }, (_, i) => appLog(`App${i}`, i)));

    await manager.flushBatchQueue('appLogs');

    expect(manager.batchQueues.appLogs).toHaveLength(500);
    expect(manager.batchQueues.appLogs[0].app_name).toBe('App5');
  });
});
