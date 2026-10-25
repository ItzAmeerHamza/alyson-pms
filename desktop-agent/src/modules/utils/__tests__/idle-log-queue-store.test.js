const fs = require('fs');
const os = require('os');
const path = require('path');

describe('unsent idle logs survive a quit', () => {
  let dir;
  let file;
  let store;
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-queue-'));
    file = path.join(dir, 'idle-log-queue.json');
    store = require('../idle-log-queue-store');
    store._setFilePathForTests(file);
    global.offlineQueue = { idleLogs: [] };
  });
  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
    delete global.offlineQueue;
  });

  const idle = (start, seconds) => ({
    user_id: '1224',
    idle_start: start,
    idle_end: new Date(Date.parse(start) + seconds * 1000).toISOString(),
    duration_seconds: seconds,
  });

  it('saves only after the queue changes, bundled, and restores on the next run', async () => {
    const { enqueueIdleLogOnce } = require('../idle-log-period-key');
    enqueueIdleLogOnce(global.offlineQueue, idle('2026-10-22T11:39:00.000Z', 480));
    enqueueIdleLogOnce(global.offlineQueue, idle('2026-10-22T15:05:00.000Z', 300));
    expect(fs.existsSync(file)).toBe(false); // nothing written yet: bundled
    jest.advanceTimersByTime(store.SAVE_DELAY_MS);
    await jest.runOnlyPendingTimersAsync();
    await new Promise((r) => jest.requireActual('timers').setImmediate(r));
    await store.saveAsync(); // ensure the async write completed
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(2);

    // Next run: fresh process, empty memory queue.
    jest.resetModules();
    const store2 = require('../idle-log-queue-store');
    store2._setFilePathForTests(file);
    const fresh = { idleLogs: [] };
    expect(store2.ensureRestored(fresh)).toBe(2);
    expect(store2.ensureRestored(fresh)).toBe(0); // only once per run
    expect(fresh.idleLogs).toHaveLength(2);
  });

  it('no write when nothing changed (no CPU or disk work in normal use)', async () => {
    store.ensureRestored(global.offlineQueue);
    const spy = jest.spyOn(fs.promises, 'writeFile');
    await store.saveAsync();
    expect(spy).not.toHaveBeenCalled();
    expect(store.saveNowSync()).toBe(false);
    spy.mockRestore();
  });

  it('quit writes what is pending synchronously', () => {
    const { enqueueIdleLogOnce } = require('../idle-log-period-key');
    enqueueIdleLogOnce(global.offlineQueue, idle('2026-10-22T11:39:00.000Z', 480));
    expect(store.saveNowSync()).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(1);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('a sent idle log drops out of the saved copy', async () => {
    const { enqueueIdleLogOnce } = require('../idle-log-period-key');
    const { flushIdleLogQueue } = require('../idle-log-write');
    enqueueIdleLogOnce(global.offlineQueue, idle('2026-10-22T11:39:00.000Z', 480));
    store.saveNowSync();
    await flushIdleLogQueue(global.offlineQueue, {}, async () => ({ status: 'saved' }));
    expect(store.saveNowSync()).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([]);
  });

  it('a corrupt file is ignored, not fatal', () => {
    fs.writeFileSync(file, '{not json');
    expect(store.ensureRestored(global.offlineQueue)).toBe(0);
  });
});
