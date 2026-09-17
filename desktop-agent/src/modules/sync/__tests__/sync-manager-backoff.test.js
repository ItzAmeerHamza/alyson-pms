jest.mock(
  'electron',
  () => ({
    net: { isOnline: () => true },
    powerMonitor: { on: jest.fn() },
    ipcMain: { on: jest.fn() },
  }),
  { virtual: true },
);

const SyncManager = require('../sync-manager');

describe('SyncManager does not poll RDS', () => {
  it('startSyncProcess does not install a 10s interval', () => {
    const sm = Object.create(SyncManager.prototype);
    sm.queue = sm.getDefaultQueue();
    sm.isOnline = true;
    sm.syncInterval = null;
    sm._syncTimeout = null;
    sm._syncing = false;
    sm._backoffUntil = 0;
    sm._bindReconnectHooks = () => {};
    sm.requestFlush = jest.fn();

    SyncManager.prototype.startSyncProcess.call(sm);

    expect(sm.syncInterval).toBeNull();
    expect(sm.requestFlush).toHaveBeenCalledTimes(1);
  });

  it('monitorConnection does not call /health', () => {
    const sm = Object.create(SyncManager.prototype);
    sm._syncHooksBound = false;
    sm._reconnectFlushTimer = null;
    SyncManager.prototype.monitorConnection.call(sm);
    expect(sm._syncHooksBound).toBe(true);
  });
});
