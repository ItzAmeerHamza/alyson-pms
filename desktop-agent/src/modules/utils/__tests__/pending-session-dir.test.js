/**
 * 1.0.248 wrote pending closes to Electron userData. Hydrate read
 * Alyson Work Time. A frozen Stop sat on disk and never replayed.
 */
jest.unmock('fs');

const fs = require('fs');
const os = require('os');
const path = require('path');

const PAYROLL = fs.mkdtempSync(path.join(os.tmpdir(), 'alyson-pending-payroll-'));
const USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'alyson-pending-userdata-'));
const USERDATA_PENDING = path.join(USERDATA, 'pending_sessions');

process.env.ALYSON_PAYROLL_APP_DATA_DIR = PAYROLL;
process.env.ALYSON_LEGACY_USERDATA_PENDING_DIR = USERDATA_PENDING;
process.env.ALYSON_TEST_ELECTRON_USER_DATA = USERDATA;

jest.mock(
  'electron',
  () => ({
    app: { getPath: () => process.env.ALYSON_TEST_ELECTRON_USER_DATA },
    net: { isOnline: () => true },
  }),
  { virtual: true },
);

const {
  writePendingSessionClose,
  clearPendingSessionClose,
  listPendingSessionCloses,
  readPendingSessionEndTime,
  pendingSessionsReadDirs,
} = require('../session-recovery');

describe('pending session dirs', () => {
  const ID = 'e05767df-98b3-421d-879f-b159f00216ce';
  const END = '2026-10-09T13:40:13.000Z';

  beforeEach(() => {
    process.env.ALYSON_PAYROLL_APP_DATA_DIR = PAYROLL;
    process.env.ALYSON_LEGACY_USERDATA_PENDING_DIR = USERDATA_PENDING;
    process.env.ALYSON_TEST_ELECTRON_USER_DATA = USERDATA;
    fs.rmSync(path.join(PAYROLL, 'pending_sessions'), { recursive: true, force: true });
    fs.rmSync(USERDATA_PENDING, { recursive: true, force: true });
    fs.mkdirSync(path.join(PAYROLL, 'pending_sessions'), { recursive: true });
    fs.mkdirSync(USERDATA_PENDING, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(PAYROLL, { recursive: true, force: true });
    fs.rmSync(USERDATA, { recursive: true, force: true });
    delete process.env.ALYSON_LEGACY_USERDATA_PENDING_DIR;
  });

  it('writes new closes to the payroll dir, not Electron userData', () => {
    expect(writePendingSessionClose({ timeLogId: ID, endTime: END, userId: 1194 })).toBe(true);
    expect(fs.existsSync(path.join(PAYROLL, 'pending_sessions', `${ID}.json`))).toBe(true);
    expect(fs.existsSync(path.join(USERDATA_PENDING, `${ID}.json`))).toBe(false);
  });

  it('hydrates a leftover 248 close that only exists under userData', () => {
    fs.writeFileSync(
      path.join(USERDATA_PENDING, `${ID}.json`),
      JSON.stringify({ timeLogId: ID, endTime: END, userId: 1194 }),
    );
    const listed = listPendingSessionCloses();
    expect(listed).toHaveLength(1);
    expect(listed[0].timeLogId).toBe(ID);
    expect(listed[0].endTime).toBe(END);
    expect(readPendingSessionEndTime(ID)).toBe(END);
    expect(pendingSessionsReadDirs()).toEqual(
      expect.arrayContaining([path.resolve(USERDATA_PENDING)]),
    );
  });

  it('clears the frozen end from both folders after a successful sync', () => {
    writePendingSessionClose({ timeLogId: ID, endTime: END, userId: 1194 });
    fs.writeFileSync(
      path.join(USERDATA_PENDING, `${ID}.json`),
      JSON.stringify({ timeLogId: ID, endTime: END, userId: 1194 }),
    );
    clearPendingSessionClose(ID);
    expect(listPendingSessionCloses()).toHaveLength(0);
    expect(fs.existsSync(path.join(PAYROLL, 'pending_sessions', `${ID}.json`))).toBe(false);
    expect(fs.existsSync(path.join(USERDATA_PENDING, `${ID}.json`))).toBe(false);
  });
});
