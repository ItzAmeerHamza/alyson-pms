const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  OfflineScreenshotQueue,
  MAX_FLUSH_PER_TICK,
} = require('../offline-screenshot-queue');

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'offline-screen-'));
}

function jpegish() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 1, 2, 3, 4]);
}

function makeQ(overrides = {}) {
  const rootDir = overrides.rootDir || makeDir();
  const q = new OfflineScreenshotQueue({
    rootDir,
    now: overrides.now || (() => Date.now()),
    isOnline: overrides.isOnline || (() => true),
    upload: overrides.upload || (async () => ({ id: 'ok' })),
  });
  return { q, rootDir };
}

afterEach(() => {
  // timeouts from _armTimer
});

describe('offline screenshot file queue', () => {
  it('writes the JPEG and a small meta row, not a 10s interval', () => {
    const { q, rootDir } = makeQ();
    const id = 'shot-1';
    q.enqueuePrepared({
      id,
      buffer: jpegish(),
      ext: 'jpg',
      meta: { userId: 1196, capturedAt: '2026-09-16T10:00:00.000Z' },
    });

    expect(q.pendingCount()).toBe(1);
    expect(fs.existsSync(path.join(rootDir, 'files', `${id}.jpg`))).toBe(true);
    const meta = JSON.parse(fs.readFileSync(path.join(rootDir, 'meta.json'), 'utf8'));
    expect(meta.items[0].id).toBe(id);
    expect(JSON.stringify(meta).includes('ffd8')).toBe(false);
    expect(q._timeout).toBeFalsy();
  });

  it('keeps the file after a failed upload and arms one backoff timeout', async () => {
    const { q, rootDir } = makeQ({
      upload: async () => ({ error: 'Internal server error' }),
    });
    const id = 'shot-fail';
    q.enqueuePrepared({ id, buffer: jpegish(), ext: 'jpg', meta: { userId: 1 } });

    await q.flushDue();

    expect(fs.existsSync(path.join(rootDir, 'files', `${id}.jpg`))).toBe(true);
    expect(q.pendingCount()).toBe(1);
    expect(q.list()[0].retryCount).toBe(1);
    expect(Number(q.list()[0].nextRetryAt)).toBeGreaterThan(Date.now());
    expect(q._timeout).toBeTruthy();
    clearTimeout(q._timeout);
  });

  it('deletes the file after a successful upload', async () => {
    const { q, rootDir } = makeQ({
      upload: async () => ({ id: 'remote-1', s3_key: 'k' }),
    });
    const id = 'shot-ok';
    q.enqueuePrepared({ id, buffer: jpegish(), ext: 'jpg', meta: { userId: 1 } });

    const result = await q.flushDue();

    expect(result.uploaded).toBe(1);
    expect(q.pendingCount()).toBe(0);
    expect(fs.existsSync(path.join(rootDir, 'files', `${id}.jpg`))).toBe(false);
    if (q._timeout) clearTimeout(q._timeout);
  });

  it('does not open HTTP while every shot is in backoff', async () => {
    const upload = jest.fn(async () => ({ id: 'x' }));
    const now = Date.now();
    const { q } = makeQ({ upload, now: () => now });
    q.enqueuePrepared({ id: 'backed-off', buffer: jpegish(), ext: 'jpg', meta: { userId: 1 } });
    const items = q.list();
    items[0].nextRetryAt = now + 60_000;
    q._writeMeta(items);

    await q.flushDue();

    expect(upload).not.toHaveBeenCalled();
    expect(q.pendingCount()).toBe(1);
    if (q._timeout) clearTimeout(q._timeout);
  });

  it('uploads at most a few shots per tick so reconnect does not stampede', async () => {
    const upload = jest.fn(async () => ({ id: 'ok' }));
    const { q } = makeQ({ upload });
    for (let i = 0; i < MAX_FLUSH_PER_TICK + 4; i += 1) {
      q.enqueuePrepared({
        id: `burst-${i}`,
        buffer: jpegish(),
        ext: 'jpg',
        meta: { userId: 1 },
      });
    }

    const result = await q.flushDue();

    expect(upload).toHaveBeenCalledTimes(MAX_FLUSH_PER_TICK);
    expect(result.uploaded).toBe(MAX_FLUSH_PER_TICK);
    expect(q.pendingCount()).toBe(4);
    expect(q._timeout).toBeTruthy();
    clearTimeout(q._timeout);
  });

  it('spaces the next drain tick at 15s after a partial flush', async () => {
    const { q } = makeQ({
      upload: async () => ({ id: 'ok' }),
    });
    for (let i = 0; i < MAX_FLUSH_PER_TICK + 1; i += 1) {
      q.enqueuePrepared({
        id: `pace-${i}`,
        buffer: jpegish(),
        ext: 'jpg',
        meta: { userId: 1 },
      });
    }
    const armed = [];
    const original = q._armTimer.bind(q);
    q._armTimer = (opts) => {
      armed.push(opts);
      return original(opts);
    };

    await q.flushDue();

    expect(armed.some((opts) => opts && opts.afterPartialFlush)).toBe(true);
    if (q._timeout) clearTimeout(q._timeout);
  });

  it('rehydrates from disk after a restart (timeout is gone, files remain)', () => {
    const rootDir = makeDir();
    const first = new OfflineScreenshotQueue({ rootDir, isOnline: () => true });
    first.enqueuePrepared({
      id: 'restart-shot',
      buffer: jpegish(),
      ext: 'jpg',
      meta: { userId: 1216, capturedAt: '2026-09-16T12:00:00.000Z' },
    });
    first.shutdown();

    const second = new OfflineScreenshotQueue({ rootDir, isOnline: () => true });
    expect(second.pendingCount()).toBe(1);
    expect(second.list()[0].id).toBe('restart-shot');
    expect(fs.existsSync(second.filePathFor(second.list()[0]))).toBe(true);
  });

  it('backs off the whole queue after one failed PUT (no hop-to-next-file loop)', async () => {
    const upload = jest.fn(async () => ({ error: 'Internal server error' }));
    const { q } = makeQ({ upload });
    q.enqueuePrepared({ id: 'a', buffer: jpegish(), ext: 'jpg', meta: { userId: 1 } });
    q.enqueuePrepared({ id: 'b', buffer: jpegish(), ext: 'jpg', meta: { userId: 1 } });
    q.enqueuePrepared({ id: 'c', buffer: jpegish(), ext: 'jpg', meta: { userId: 1 } });

    await q.flushDue();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(q.pendingCount()).toBe(3);
    const when = q.list().map((item) => Number(item.nextRetryAt));
    expect(when.every((at) => at > Date.now())).toBe(true);
    if (q._timeout) clearTimeout(q._timeout);
  });

  it('does not reset backoff when ignoreBackoff fires again within 60s', async () => {
    const now = Date.now();
    const upload = jest.fn(async () => ({ error: 'fetch failed' }));
    const { q } = makeQ({ upload, now: () => now });
    q.enqueuePrepared({ id: 'flaky', buffer: jpegish(), ext: 'jpg', meta: { userId: 1 } });
    await q.flushDue();
    expect(upload).toHaveBeenCalledTimes(1);
    const backedOffUntil = Number(q.list()[0].nextRetryAt);
    expect(backedOffUntil).toBeGreaterThan(now);

    q._lastIgnoreAt = now;
    q.requestFlush({ ignoreBackoff: true });
    await Promise.resolve();
    expect(Number(q.list()[0].nextRetryAt)).toBe(backedOffUntil);
    expect(upload).toHaveBeenCalledTimes(1);
    if (q._timeout) clearTimeout(q._timeout);
  });

  it('does not POST while net is offline', async () => {
    const upload = jest.fn(async () => ({ id: 'x' }));
    const { q } = makeQ({ upload, isOnline: () => false });
    q.enqueuePrepared({ id: 'offline', buffer: jpegish(), ext: 'jpg', meta: { userId: 1 } });

    const result = await q.flushDue();

    expect(result.disconnected).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(q.pendingCount()).toBe(1);
    if (q._timeout) clearTimeout(q._timeout);
  });
});
