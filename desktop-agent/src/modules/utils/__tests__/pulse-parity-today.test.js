/**
 * The desktop clock must equal Pulse (pulse.service dailyHoursFromLogs):
 * union of sessions clipped to the work day, open rows end at last_alive_at,
 * and time_logs.deducted_seconds (screenshot deletes) comes off the
 * session-start day. The desktop ignored deductions (toast said "10m deducted",
 * clock kept them) and counted a stopped orphan through now.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = path.join(os.tmpdir(), 'alyson-pulse-parity-today');
process.env.ALYSON_PAYROLL_APP_DATA_DIR = TMP;

afterAll(() => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
});

jest.mock(
  'electron',
  () => ({ nativeImage: { createFromPath: () => ({ isEmpty: () => true }) } }),
  { virtual: true },
);

const { aggregateTimeLogRows } = require('../today-time-log-stats');
const {
  liveDeductionSeconds,
  noteLiveDeductionFromServer,
  applyAuthorizedDeduction,
  applyKnownDeductionsToRead,
  floorUnderCurrentDeductions,
  isTodaysTimeLog,
  noteServerLogDeductions,
  applyServerClosedDeduction,
  reconcileForwardBase,
} = require('../time-deductions');
const { setWorkTimezone, getWorkTimezone } = require('../work-timezone');
const TrayManager = require('../../ui/tray-manager');

const NOW = '2026-10-14T17:00:00.000Z'; // noon Chicago
const H = 3600;

const row = (id, start, end, extra = {}) => ({
  id,
  start_time: start,
  end_time: end,
  status: end ? 'completed' : 'active',
  ...extra,
});

describe('today aggregate = Pulse', () => {
  const previousTz = getWorkTimezone();
  beforeAll(() => setWorkTimezone('America/Chicago'));
  afterAll(() => setWorkTimezone(previousTz));

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
  });
  afterEach(() => jest.useRealTimers());

  const morning = row('s1', '2026-10-14T13:00:00.000Z', '2026-10-14T15:00:00.000Z'); // 2h

  it('screenshot delete on a closed session comes off the closed total', () => {
    const agg = aggregateTimeLogRows([{ ...morning, deducted_seconds: 600 }], null, false);

    expect(agg.completedClosedSeconds).toBe(2 * H - 600);
    expect(agg.totalTime).toBe(2 * H - 600);
    expect(agg.reportsDeductions).toBe(true);
  });

  it('screenshot delete on the live session comes off the live part, not the closed base', () => {
    const live = row('s2', '2026-10-14T16:00:00.000Z', null, { last_alive_at: NOW, deducted_seconds: 300 });
    const agg = aggregateTimeLogRows([morning, live], 's2', true);

    expect(agg.completedClosedSeconds).toBe(2 * H);
    expect(agg.ongoingCurrentSessionSeconds).toBe(H - 300);
    expect(agg.liveDeductedSeconds).toBe(300);
    expect(agg.totalTime).toBe(3 * H - 300);
  });

  it('a deduction belongs to the session-start day (yesterday\'s row does not cut today)', () => {
    const overnight = row('s0', '2026-10-14T03:00:00.000Z', '2026-10-14T06:00:00.000Z', {
      deducted_seconds: 900,
    }); // starts 22:00 Chicago yesterday
    const agg = aggregateTimeLogRows([overnight], null, false);

    expect(agg.totalTime).toBe(H); // 05:00Z–06:00Z after Chicago midnight
  });

  it('stopped: an orphan open row ends at last_alive_at, never now', () => {
    const orphan = row('s3', '2026-10-14T15:30:00.000Z', null, {
      last_alive_at: '2026-10-14T16:00:00.000Z',
    });
    const agg = aggregateTimeLogRows([morning, orphan], null, false);

    expect(agg.totalTime).toBe(2 * H + 30 * 60);
  });

  it('stopped: an orphan never stamped alive contributes nothing', () => {
    const orphan = row('s3', '2026-10-14T15:30:00.000Z', null, { last_alive_at: null });
    expect(aggregateTimeLogRows([orphan], null, false).totalTime).toBe(0);
  });

  it('tracking: another device\'s open row counts to its last_alive_at (was 0 — missed time)', () => {
    const other = row('dev2', '2026-10-14T14:00:00.000Z', null, {
      last_alive_at: '2026-10-14T15:30:00.000Z',
    });
    const live = row('s4', '2026-10-14T16:00:00.000Z', null, { last_alive_at: NOW });
    const agg = aggregateTimeLogRows([morning, other, live], 's4', true);

    // union 13:00–15:30 = 2.5h closed, + 1h live
    expect(agg.completedClosedSeconds).toBe(2.5 * H);
    expect(agg.totalTime).toBe(3.5 * H);
  });

  it('a copy of the live session (temp id) is not counted twice', () => {
    const live = row('real-id', '2026-10-14T16:00:00.000Z', null, { last_alive_at: NOW });
    const tempCopy = row('temp-123', '2026-10-14T16:00:00.000Z', null, {
      last_alive_at: '2026-10-14T16:59:00.000Z',
    });
    const agg = aggregateTimeLogRows([live, tempCopy], 'real-id', true);

    expect(agg.totalTime).toBe(H);
  });

  it('legacy rows (old backend, no last_alive_at field) keep the old read', () => {
    const open = row('s5', '2026-10-14T16:00:00.000Z', null);
    expect(aggregateTimeLogRows([open], null, false).totalTime).toBe(H);
    expect(aggregateTimeLogRows([open], 'other-live', true).ongoingCurrentSessionSeconds).toBe(0);
  });
});

describe('screenshot delete moves the clock now (forward-only floors)', () => {
  let g;
  beforeEach(() => {
    g = {
      _backendReportsDeductions: true,
      isTracking: true,
      currentTimeLogId: 'live',
      trackingManager: { isTracking: true, currentTimeLogId: 'live' },
      trayManager: { _cumulativeBaseSeconds: 2 * H },
      _trayTodayHighWaterSeconds: 3 * H,
      _lastTodayTotalAtStop: null,
      _lastGoodTodayStats: {
        workDate: '2026-10-14',
        totalTime: 3 * H,
        completedTodayBeforeCurrentSessionSeconds: 2 * H,
      },
    };
  });

  it('live session: held by id, closed base untouched', () => {
    const res = applyAuthorizedDeduction({ seconds: 600, timeLogId: 'live', g });

    expect(res).toEqual({ applied: 600, onLive: true });
    expect(liveDeductionSeconds('live', g)).toBe(600);
    expect(g.trayManager._cumulativeBaseSeconds).toBe(2 * H);
    expect(g._trayTodayHighWaterSeconds).toBe(3 * H - 600);
    expect(g._lastGoodTodayStats.totalTime).toBe(3 * H - 600);
    expect(g._lastGoodTodayStats.completedTodayBeforeCurrentSessionSeconds).toBe(2 * H);
  });

  it('closed session while tracking: lowers the tray base', () => {
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'morning', g });

    expect(g.trayManager._cumulativeBaseSeconds).toBe(2 * H - 600);
    expect(liveDeductionSeconds('live', g)).toBe(0);
    expect(g._lastGoodTodayStats.completedTodayBeforeCurrentSessionSeconds).toBe(2 * H - 600);
    expect(g._authorizedClosedDropSeconds).toBe(600);
  });

  it('stopped: lowers the Stop floors the next Start seeds from', () => {
    g.isTracking = false;
    g.trackingManager.isTracking = false;
    g._lastTodayTotalAtStop = 3 * H;
    g._rendererFrozenTotalAtStop = 3 * H;
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'live', g });

    expect(g._lastTodayTotalAtStop).toBe(3 * H - 600);
    expect(g._rendererFrozenTotalAtStop).toBe(3 * H - 600);
    expect(g.trayManager._cumulativeBaseSeconds).toBe(2 * H);
  });

  it('old backend (no deductions in reads): leave the clock alone so it cannot see-saw', () => {
    g._backendReportsDeductions = false;
    expect(applyAuthorizedDeduction({ seconds: 600, timeLogId: 'live', g }).applied).toBe(0);
    expect(g._trayTodayHighWaterSeconds).toBe(3 * H);
  });

  it('a read that predates the delete cannot undo it; a later read never adds twice', () => {
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'live', g });
    noteLiveDeductionFromServer('live', 0, g);
    expect(liveDeductionSeconds('live', g)).toBe(600);
    noteLiveDeductionFromServer('live', 600, g);
    expect(liveDeductionSeconds('live', g)).toBe(600);
  });

  it('the next session does not inherit the previous session\'s deduction', () => {
    noteLiveDeductionFromServer('live', 600, g);
    expect(liveDeductionSeconds('next', g)).toBe(0);
  });

  it('several deletes drop the tray total and leave the timer running', () => {
    const interval = setInterval(() => {}, 60 * 1000);
    const tray = g.trayManager;
    tray._timerInterval = interval;
    tray._trackingStartTime = new Date(Date.now() - 100 * 1000);
    tray._resolveLiveClock = TrayManager.prototype._resolveLiveClock;
    tray._formatElapsed = TrayManager.prototype._formatElapsed;
    tray.paintLiveTotal = TrayManager.prototype.paintLiveTotal;
    tray._pushRendererTick = () => {};
    tray.tray = { isDestroyed: () => false, setTitle() {}, setToolTip() {} };

    applyAuthorizedDeduction({ seconds: 240, timeLogId: 'morning', g });
    applyAuthorizedDeduction({ seconds: 180, timeLogId: 'morning', g });
    const after = tray._resolveLiveClock();

    expect(tray._timerInterval).toBe(interval);
    expect(after.elapsed).toBeGreaterThanOrEqual(99);
    expect(after.base).toBe(2 * H - 420);
    expect(after.cumulative).toBe(after.base + after.elapsed);
    clearInterval(interval);
  });
});

describe('tray live clock subtracts the live deduction', () => {
  afterEach(() => {
    delete global._liveSessionDeduction;
    delete global.currentTimeLogId;
  });

  it('base + elapsed − deducted', () => {
    const tray = Object.create(TrayManager.prototype);
    tray._cumulativeBaseSeconds = 2 * H;
    tray._trackingStartTime = new Date(Date.now() - H * 1000);
    global.currentTimeLogId = 'live';
    global._liveSessionDeduction = { id: 'live', seconds: 600 };

    const live = tray._resolveLiveClock();

    expect(live.cumulative).toBeGreaterThanOrEqual(3 * H - 600);
    expect(live.cumulative).toBeLessThanOrEqual(3 * H - 600 + 1);
  });
});

describe('a stats read is brought up to every delete this device made', () => {
  let g;
  beforeEach(() => {
    g = {
      _backendReportsDeductions: true,
      isTracking: true,
      currentTimeLogId: 'live',
      trackingManager: { isTracking: true, currentTimeLogId: 'live' },
      trayManager: { _cumulativeBaseSeconds: 2 * H },
    };
  });
  const read = (r, extra = {}) =>
    applyKnownDeductionsToRead({ isTracking: true, liveId: 'live', g, ...r, ...extra });

  it('a read from before a closed-session delete comes back without those seconds', () => {
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'morning', g });
    expect(read({ totalTime: 3 * H, closedSeconds: 2 * H, deductedSeconds: 0 })).toEqual({
      totalTime: 3 * H - 600,
      closedSeconds: 2 * H - 600,
      deductedSeconds: 600,
      liveDeductedSeconds: 0,
    });
  });

  it('a read from before a live-session delete keeps the closed total', () => {
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'live', g });
    expect(read({ totalTime: 3 * H, closedSeconds: 2 * H, deductedSeconds: 0 })).toEqual({
      totalTime: 3 * H - 600,
      closedSeconds: 2 * H,
      deductedSeconds: 600,
      liveDeductedSeconds: 600,
    });
  });

  it('a read that already has the delete is left alone (never twice)', () => {
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'morning', g });
    const r = { totalTime: 3 * H - 600, closedSeconds: 2 * H - 600, deductedSeconds: 600 };
    expect(read(r).totalTime).toBe(3 * H - 600);
    expect(read(r).totalTime).toBe(3 * H - 600);
  });

  it('a few seconds of tracking still count (no jump heuristic)', () => {
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'morning', g });
    expect(read({ totalTime: 3 * H + 30, closedSeconds: 2 * H, deductedSeconds: 0 }).totalTime).toBe(
      3 * H + 30 - 600,
    );
  });

  it('after the trust window the server\'s deducted_seconds is the truth again', () => {
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'morning', g });
    const later = read(
      { totalTime: 3 * H, closedSeconds: 2 * H, deductedSeconds: 0 },
      { now: Date.now() + 6 * 60_000 },
    );
    expect(later.totalTime).toBe(3 * H);
    expect(read({ totalTime: 3 * H, closedSeconds: 2 * H, deductedSeconds: 0 }).totalTime).toBe(3 * H);
  });

  it('the delete is recorded with last-good, so its floor is not lowered twice', () => {
    g._lastGoodTodayStats = { workDate: 'x', totalTime: 3 * H, deductedSeconds: 0 };
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'live', g });
    expect(g._lastGoodTodayStats).toMatchObject({
      totalTime: 3 * H - 600,
      deductedSeconds: 600,
      liveDeductedSeconds: 600,
    });
    expect(floorUnderCurrentDeductions(3 * H - 600, 600, 600)).toBe(3 * H - 600);
  });
});

describe('Stop after deleting a live-session screenshot (log 16 Oct 01:03)', () => {
  // Live: closed-before 15450s (240s deducted there), the live session had a
  // 240s delete. After Stop the read is 15348s with all 480s in closed. The
  // old closed floor 15450 held the deleted time on screen for a few seconds.
  it('the closed floor is restated under the deduction the Stop moved into it', () => {
    const lastClosed = floorUnderCurrentDeductions(15450, 480 - 240, 480 - 0);
    expect(lastClosed).toBe(15210);
    expect(lastClosed).toBeLessThanOrEqual(15348);
  });

  it('a total floor saved under the same deductions is unchanged', () => {
    expect(floorUnderCurrentDeductions(15348, 480, 480)).toBe(15348);
  });
});

describe('a live deduction larger than the session so far (Pulse parity)', () => {
  const previousTz = getWorkTimezone();
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date(NOW) });
    setWorkTimezone('America/Chicago');
  });
  afterAll(() => {
    jest.useRealTimers();
    setWorkTimezone(previousTz);
  });

  it('comes off the day total, so Stop does not drop the clock', () => {
    const rows = [
      row('morning', '2026-10-14T13:00:00.000Z', '2026-10-14T15:00:00.000Z'),
      row('live', '2026-10-14T16:58:00.000Z', null, { deducted_seconds: 240 }),
    ];
    const live = aggregateTimeLogRows(rows, 'live', true);
    expect(live.ongoingCurrentSessionSeconds).toBe(0);
    expect(live.totalTime).toBe(2 * H + 120 - 240);

    const stopped = aggregateTimeLogRows(
      [rows[0], { ...row('live', '2026-10-14T16:58:00.000Z', NOW), deducted_seconds: 240 }],
      null,
      false,
    );
    expect(stopped.totalTime).toBe(live.totalTime);
  });
});

describe('screenshot delete does not freeze the closed base', () => {
  it('a pre-delete read cannot put the deducted seconds back', () => {
    const stale = reconcileForwardBase(2 * H - 600, 2 * H, 600);
    expect(stale).toEqual({ base: 2 * H - 600, pending: 600 });
  });

  it('a read that includes the deduction moves the base down, then the clock can tick', () => {
    const applied = reconcileForwardBase(2 * H, 2 * H - 600, 600);
    expect(applied).toEqual({ base: 2 * H - 600, pending: 0 });
    const nextSecond = reconcileForwardBase(applied.base, applied.base, applied.pending);
    expect(nextSecond.base).toBe(2 * H - 600);
  });

  it('an unrelated higher total still moves forward', () => {
    expect(reconcileForwardBase(2 * H, 3 * H, 600)).toEqual({ base: 3 * H, pending: 600 });
  });
});

describe('no phantom and no missing time from deletes (work day, other sources)', () => {
  const previousTz = getWorkTimezone();
  let g;
  beforeAll(() => setWorkTimezone('America/Chicago'));
  afterAll(() => setWorkTimezone(previousTz));
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    g = {
      _backendReportsDeductions: true,
      isTracking: true,
      currentTimeLogId: 'live',
      trackingManager: { isTracking: true, currentTimeLogId: 'live' },
      trayManager: { _cumulativeBaseSeconds: 2 * H },
      _trayTodayHighWaterSeconds: 3 * H,
      _lastTodayTotalAtStop: 3 * H,
    };
  });
  afterEach(() => jest.useRealTimers());

  const morning = row('morning', '2026-10-14T13:00:00.000Z', '2026-10-14T15:00:00.000Z', {
    deducted_seconds: 0,
  });
  const live = row('live', '2026-10-14T16:00:00.000Z', null, { deducted_seconds: 0 });
  const yesterday = row('yesterday', '2026-10-13T20:00:00.000Z', '2026-10-13T22:00:00.000Z', {
    deducted_seconds: 0,
  });

  it('a delete on a session that started yesterday leaves today alone (Pulse charges yesterday)', () => {
    const res = applyAuthorizedDeduction({
      seconds: 600,
      timeLogId: 'yesterday',
      timeLogStartTime: yesterday.start_time,
      g,
    });
    expect(res).toEqual({ applied: 0, otherDay: true });
    expect(g.trayManager._cumulativeBaseSeconds).toBe(2 * H);
    expect(g._trayTodayHighWaterSeconds).toBe(3 * H);
  });

  it('without a start time, a session today\'s reads never showed is another day', () => {
    expect(isTodaysTimeLog({ timeLogId: 'yesterday', g })).toBeNull();
    noteServerLogDeductions([morning, live, yesterday], { liveId: 'live', isTracking: true, g });
    expect(isTodaysTimeLog({ timeLogId: 'morning', g })).toBe(true);
    expect(isTodaysTimeLog({ timeLogId: 'yesterday', g })).toBe(false);
    expect(applyAuthorizedDeduction({ seconds: 600, timeLogId: 'yesterday', g }).applied).toBe(0);
  });

  it('the first read of the day only learns values — no growth', () => {
    const first = noteServerLogDeductions(
      [{ ...morning, deducted_seconds: 900 }, live],
      { liveId: 'live', isTracking: true, g },
    );
    expect(first.closedGrowth).toBe(0);
  });

  it('a delete made in Pulse on a closed session is growth this device lowers by', () => {
    noteServerLogDeductions([morning, live], { liveId: 'live', isTracking: true, g });
    const next = noteServerLogDeductions(
      [{ ...morning, deducted_seconds: 600 }, live],
      { liveId: 'live', isTracking: true, g },
    );
    expect(next.closedGrowth).toBe(600);
    applyServerClosedDeduction(next.closedGrowth, g);
    expect(g.trayManager._cumulativeBaseSeconds).toBe(2 * H - 600);
    expect(g._trayTodayHighWaterSeconds).toBe(3 * H - 600);
    expect(g._lastTodayTotalAtStop).toBe(3 * H - 600);
  });

  it('a live-session delete made elsewhere is not closed growth (it comes off elapsed)', () => {
    noteServerLogDeductions([morning, live], { liveId: 'live', isTracking: true, g });
    const next = noteServerLogDeductions(
      [morning, { ...live, deducted_seconds: 300 }],
      { liveId: 'live', isTracking: true, g },
    );
    expect(next.closedGrowth).toBe(0);
  });

  it('this device\'s own delete is never counted again when the server shows it', () => {
    noteServerLogDeductions([morning, live], { liveId: 'live', isTracking: true, g });
    applyAuthorizedDeduction({ seconds: 600, timeLogId: 'morning', g });
    const stale = noteServerLogDeductions([morning, live], { liveId: 'live', isTracking: true, g });
    expect(stale.closedGrowth).toBe(0);
    const caughtUp = noteServerLogDeductions(
      [{ ...morning, deducted_seconds: 600 }, live],
      { liveId: 'live', isTracking: true, g },
    );
    expect(caughtUp.closedGrowth).toBe(0);
  });

  it('after Stop, the old live session\'s deduction is not counted as new', () => {
    noteServerLogDeductions([morning, { ...live, deducted_seconds: 300 }], {
      liveId: 'live',
      isTracking: true,
      g,
    });
    const afterStop = noteServerLogDeductions(
      [morning, { ...live, end_time: NOW, status: 'completed', deducted_seconds: 300 }],
      { isTracking: false, g },
    );
    expect(afterStop.closedGrowth).toBe(0);
  });

  it('rows without deducted_seconds (offline queue) never count as growth later', () => {
    const offline = { id: 'q1', start_time: '2026-10-14T14:00:00.000Z', end_time: NOW };
    noteServerLogDeductions([offline], { g });
    const synced = noteServerLogDeductions([{ ...offline, deducted_seconds: 0 }], { g });
    expect(synced.closedGrowth).toBe(0);
  });
});
