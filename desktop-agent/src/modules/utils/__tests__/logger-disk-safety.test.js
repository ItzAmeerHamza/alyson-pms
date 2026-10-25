'use strict';

/**
 * Disk/CPU safety for the log file sink:
 *  - a broken console (closed terminal → EIO) must not throw or loop
 *  - each day's file stops growing at MAX_DAILY_BYTES
 *  - files older than LOG_RETENTION_DAYS are deleted
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tavilo-logs-'));
const logDir = path.join(tmp, 'Alyson Work Time', 'logs');

let logger;
let realWarn;

beforeAll(() => {
  process.env.APPDATA = tmp; // logger resolves its folder from APPDATA first
  fs.mkdirSync(logDir, { recursive: true });
  realWarn = console.warn;
  logger = require('../logger');
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const sink = () => logger.logFile._sink;
const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

test('broken console stream (EIO) is swallowed, not thrown', () => {
  // Simulate the terminal going away: the underlying write throws EIO.
  const err = Object.assign(new Error('write EIO'), { code: 'EIO' });
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => { throw err; });
  const spyErr = jest.spyOn(process.stderr, 'write').mockImplementation(() => { throw err; });
  try {
    expect(() => console.log('hello')).not.toThrow();
    expect(() => console.error('boom')).not.toThrow();
    expect(() => console.warn('again')).not.toThrow();
  } finally {
    spy.mockRestore();
    spyErr.mockRestore();
  }
  expect(logger.isBrokenStreamError(err)).toBe(true);
  expect(logger.isBrokenStreamError(new Error('other'))).toBe(false);
});

test('stops writing routine lines once the daily cap is reached', () => {
  const s = sink();
  s.rollDay();
  s.sizes.log = logger.MAX_DAILY_BYTES - 10;
  s.buffer = [];
  s.capNoted.log = false;

  s.append('x'.repeat(100));
  expect(s.buffer).toHaveLength(1);
  expect(s.buffer[0]).toMatch(/Daily log size limit reached/);

  s.append('y'.repeat(100)); // still skipped, note not repeated
  expect(s.buffer).toHaveLength(1);

  s.append('important error', true); // errors get extra room
  expect(s.buffer).toHaveLength(2);
  s.buffer = [];
});

test('deletes log files older than the retention window, keeps recent ones', () => {
  const old = day(-(logger.LOG_RETENTION_DAYS + 3));
  const recent = day(-1);
  for (const name of [`${old}.log`, `${old}.jsonl`, `${recent}.log`, 'notes.txt']) {
    fs.writeFileSync(path.join(logDir, name), 'x');
  }
  logger.logFile.pruneOldLogs();
  const left = fs.readdirSync(logDir);
  expect(left).not.toContain(`${old}.log`);
  expect(left).not.toContain(`${old}.jsonl`);
  expect(left).toContain(`${recent}.log`);
  expect(left).toContain('notes.txt');
});

afterAll(() => { console.warn = realWarn; });
