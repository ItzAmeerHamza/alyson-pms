/**
 * This Month at a Glance must equal Pulse: each day is its merged sessions
 * minus every screenshot delete on sessions that STARTED that work day.
 *
 * 16 Oct: the month builder never subtracted deducted_seconds, so today's row
 * read 3778s against Pulse's 3559s (one 219s delete). The window then pushed
 * that row onto the big clock as a floor — the clock jumped up on every
 * Stop / Start / refresh and snapped back.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'monthly-report-deductions-'));
process.env.ALYSON_PAYROLL_APP_DATA_DIR = TMP;
process.env.APPDATA = TMP;

const rows = [];

jest.mock('../backend-rds-reads', () => ({
  isBackendRdsEnabled: () => true,
  getTimeLogsInRange: jest.fn(async () => rows.map((r) => ({ ...r }))),
  getTimeAdjustmentsInRange: jest.fn(async () => ({})),
  getEffectiveStats: jest.fn(async () => ({ daily: {} })),
}));
jest.mock('../backend-screenshots', () => ({ fetchScreenshotsFromBackend: jest.fn(async () => []) }));
jest.mock('../backend-time-logs', () => ({
  isBackendTimeLogsEnabled: () => true,
  isLikelyOffline: () => false,
  listUserProjects: jest.fn(async () => []),
  getTodayTimeLogsPayload: jest.fn(async () => ({
    timeLogs: rows.map((r) => ({ ...r })),
    adjustmentSeconds: 0,
    leaveCreditSeconds: 0,
    otherAdjustmentSeconds: 0,
  })),
  getActiveTimeLog: jest.fn(async () => null),
}));
jest.mock('../today-effective-stats', () => ({
  computeTodayEffectiveStats: jest.fn(async ({ totalSeconds }) => ({
    effectiveSeconds: totalSeconds,
    nonEffectiveSeconds: 0,
    idleSeconds: 0,
    lowActivitySeconds: 0,
    computed: false,
  })),
}));

const { buildMonthlyReportData } = require('../monthly-report-data');
const { setWorkTimezone, getWorkTimezone } = require('../work-timezone');

const row = (id, startIso, endIso, deducted = 0) => ({
  id,
  start_time: startIso,
  end_time: endIso,
  status: 'completed',
  project_id: null,
  idle_seconds: 0,
  deducted_seconds: deducted,
});

const day = (report, date) => report.dailyBreakdown.find((d) => d.date === date)?.totalSeconds;

describe('monthly report subtracts screenshot deletes like Pulse', () => {
  const previousTz = getWorkTimezone();

  beforeAll(() => setWorkTimezone('America/Los_Angeles'));
  afterAll(() => {
    setWorkTimezone(previousTz);
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-10-16T19:00:00.000Z')); // noon Pacific
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    rows.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const build = () =>
    buildMonthlyReportData({
      global: { currentUserId: 1195, isTracking: false, trackingManager: null },
      config: { user_id: 1195 },
    });

  test('today: 16 Oct replay — one 219s delete, row equals Pulse', async () => {
    // Two closed sessions today, 3778s of sessions; one screenshot delete.
    rows.push(row('a', '2026-10-16T15:00:00.000Z', '2026-10-16T15:40:00.000Z', 219)); // 2400s
    rows.push(row('b', '2026-10-16T16:00:00.000Z', '2026-10-16T16:22:58.000Z')); // 1378s
    const report = await build();
    expect(day(report, '2026-10-16')).toBe(3778 - 219);
  });

  test('past days subtract their own deletes', async () => {
    rows.push(row('y', '2026-10-15T16:00:00.000Z', '2026-10-15T18:00:00.000Z', 600)); // 7200s
    const report = await build();
    expect(day(report, '2026-10-15')).toBe(7200 - 600);
  });

  test('a delete counts on the day the session started, even past midnight', async () => {
    // 23:00 → 01:00 Pacific across 14/15 Oct; 300s deleted.
    rows.push(row('x', '2026-10-15T06:00:00.000Z', '2026-10-15T08:00:00.000Z', 300));
    const report = await build();
    expect(day(report, '2026-10-14')).toBe(3600 - 300);
    expect(day(report, '2026-10-15')).toBe(3600);
  });

  test('month total is the sum of the deducted days', async () => {
    rows.push(row('y', '2026-10-15T16:00:00.000Z', '2026-10-15T18:00:00.000Z', 600));
    rows.push(row('a', '2026-10-16T15:00:00.000Z', '2026-10-16T15:40:00.000Z', 219));
    const report = await build();
    expect(report.totalSeconds).toBe(7200 - 600 + 2400 - 219);
  });

  test('a day never goes below zero', async () => {
    rows.push(row('z', '2026-10-13T16:00:00.000Z', '2026-10-13T16:01:00.000Z', 300));
    const report = await build();
    expect(day(report, '2026-10-13')).toBe(0);
  });
});
