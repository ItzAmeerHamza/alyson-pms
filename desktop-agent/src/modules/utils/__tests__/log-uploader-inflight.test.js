const fs = require('fs');
const os = require('os');
const path = require('path');

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-uploader-'));
jest.mock('../logger', () => ({
  createFeatureLogger: () => ({ info: jest.fn(), warn: jest.fn() }),
  logFile: {
    flush: jest.fn(),
    jsonlPathFor: (d) => require('path').join(mockDir, `${d}.jsonl`),
    pathFor: (d) => require('path').join(mockDir, `${d}.log`),
  },
}));
jest.mock('../device-id', () => ({ getDeviceId: () => 'dev-1' }));
jest.mock('../backend-time-logs', () => ({
  isBackendTimeLogsEnabled: () => true,
  getLogUploadUrl: jest.fn(async () => ({ upload_url: 'https://s3.example/put', s3_key: 'k' })),
}));

const { uploadLogFile, uploadTodayLogOnShutdown } = require('../log-uploader');

const today = () => new Date().toISOString().slice(0, 10);

// Uploads read the file asynchronously; wait for the PUT instead of a fixed
// delay so the test is not flaky on a busy machine.
async function waitFor(cond, timeoutMs = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('log uploader in-flight guard', () => {
  let puts;
  let release;
  beforeEach(() => {
    global.currentUserId = 'u1';
    puts = [];
    global.fetch = jest.fn((url, opts) => {
      puts.push(opts.body);
      expect(opts.signal).toBeDefined();
      return new Promise((r) => { release = () => r({ ok: true, status: 200 }); });
    });
  });
  afterAll(() => {
    fs.rmSync(mockDir, { recursive: true, force: true });
    delete global.currentUserId;
  });

  it('skips an overlapping periodic upload and queues the shutdown one behind it', async () => {
    const file = path.join(mockDir, `${today()}.jsonl`);
    fs.writeFileSync(file, '{"a":1}\n');
    const first = uploadLogFile(today(), { force: false });
    await waitFor(() => puts.length === 1);

    await expect(uploadLogFile(today(), { force: false })).resolves.toBe(false);
    expect(puts).toHaveLength(1);

    fs.appendFileSync(file, '{"b":2}\n');
    const shutdown = uploadTodayLogOnShutdown();
    await new Promise((r) => setTimeout(r, 20));
    expect(puts).toHaveLength(1); // waits for the in-flight one
    release();
    await expect(first).resolves.toBe(true);
    await waitFor(() => puts.length === 2);
    expect(puts[1]).toBe('{"a":1}\n{"b":2}\n'); // same bytes as the file
    release();
    await expect(shutdown).resolves.toBe(true);
  });
});
