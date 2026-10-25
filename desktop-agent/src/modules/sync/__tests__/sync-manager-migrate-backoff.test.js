jest.mock(
  'electron',
  () => ({ net: { isOnline: () => true }, powerMonitor: { on: jest.fn() }, ipcMain: { on: jest.fn() } }),
  { virtual: true },
);
jest.mock('../../utils/offline-screenshot-queue', () => ({
  getOfflineScreenshotQueue: () => ({
    enqueuePrepared: () => { throw new Error('disk full'); },
    requestFlush: jest.fn(),
  }),
}));

const SyncManager = require('../sync-manager');

function makeSm() {
  const sm = Object.create(SyncManager.prototype);
  sm.queue = sm.getDefaultQueue();
  sm.isOnline = true;
  sm._syncTimeout = null;
  sm._syncing = false;
  sm._backoffUntil = 0;
  sm.saveQueue = jest.fn(async () => {});
  return sm;
}

describe('SyncManager flush loop safety', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('backs off when screenshot migration fails instead of re-arming at ~0.5 s', async () => {
    const sm = makeSm();
    sm.queue.screenshots = [{ id: 's1', imageBuffer: Buffer.from('x').toString('base64') }];
    await sm.syncScreenshots();
    expect(sm._backoffUntil).toBeGreaterThan(Date.now() + 5000);
    expect(sm.queue.screenshots).toHaveLength(1);
  });

  it('does not re-arm a flush for unknown queue keys', async () => {
    const sm = makeSm();
    sm.queue.legacyStuff = [1, 2, 3];
    sm.requestFlush = jest.fn();
    await sm.syncQueue();
    expect(sm.requestFlush).not.toHaveBeenCalled();
  });

  it('times out a hung backend call instead of holding _syncing for minutes', async () => {
    jest.useFakeTimers();
    const sm = makeSm();
    sm.internalApiKey = 'k';
    sm.desktopSyncApiUrl = 'https://example.invalid/sync';
    global.fetch = jest.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    }));
    const p = sm._callEdgeFunction('x', {});
    jest.advanceTimersByTime(12000);
    await expect(p).rejects.toThrow(/timeout/);
    jest.useRealTimers();
  });
});
