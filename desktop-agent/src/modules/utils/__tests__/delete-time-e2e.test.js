/**
 * End-to-end replay of screenshot deletes against the real main-process code:
 * the get-today-time-stats handler (lifted verbatim from main.js), the tray
 * clock, TrackingManager's Start base and Stop snapshot, and the delete path.
 * Only the server is fake. After every step the time on screen must equal
 * Pulse: today's sessions − every deducted_seconds of sessions started today.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-time-e2e-'));
process.env.ALYSON_PAYROLL_APP_DATA_DIR = TMP;
process.env.APPDATA = TMP;

const server = { rows: [], staleRows: null, fail: false, gate: null };
const clone = (rows) => rows.map((r) => ({ ...r }));

jest.mock('../backend-time-logs', () => ({
  isBackendTimeLogsEnabled: () => true,
  isLikelyOffline: () => false,
  getTodayTimeLogsPayload: jest.fn(async () => {
    if (server.fail) throw new Error('network down');
    // The server answers with the rows it had when the request arrived.
    const snapshot = (server.staleRows || server.rows).map((r) => ({ ...r }));
    if (server.gate) await server.gate;
    const rows = snapshot;
    server.staleRows = null;
    return { timeLogs: clone(rows), adjustmentSeconds: 0, leaveCreditSeconds: 0 };
  }),
  getActiveTimeLog: jest.fn(async () => server.rows.find((r) => r.status === 'active') || null),
  updateTimeLog: jest.fn(),
  closeOpenUrlLogs: jest.fn(),
  closeOpenAppLogs: jest.fn(),
}));
jest.mock('../today-effective-stats', () => ({
  computeTodayEffectiveStats: async ({ totalSeconds }) => ({
    effectiveSeconds: totalSeconds,
    nonEffectiveSeconds: 0,
    idleSeconds: 0,
    lowActivitySeconds: 0,
    computed: false,
  }),
}));
jest.mock(
  'electron',
  () => ({
    app: { getPath: () => require('os').tmpdir() },
    net: { isOnline: () => true },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  }),
  { virtual: true },
);

const SRC = path.resolve(__dirname, '../../..');
const TrayManager = require('../../ui/tray-manager');
const TrackingManager = require('../../core/tracking-manager');
const timeDeductions = require('../time-deductions');
const { workDateKey, startOfWorkDay } = require('../work-timezone');

/** The get-today-time-stats block of main.js, run as-is with a fake ipcMain. */
function loadStatsHandler() {
  const src = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
  const from = src.indexOf("  // Today's time_logs aggregate");
  const to = src.indexOf('  // Monthly work report');
  if (from < 0 || to < from) throw new Error('stats handler block not found in main.js');
  const handlers = {};
  const ipcMain = {
    handle: (name, fn) => { handlers[name] = fn; },
    removeHandler: () => {},
  };
  const req = (p) => require(p.startsWith('.') ? path.join(SRC, p) : p);
  // eslint-disable-next-line no-new-func
  new Function('ipcMain', 'config', 'require', src.slice(from, to))(ipcMain, { user_id: '4217' }, req);
  mainHandlers = handlers;
  return () => handlers['get-today-time-stats']();
}

const T0 = Date.parse('2026-10-16T16:00:00.000Z'); // 09:00 Pacific
let now = T0;
/** Advance the clock; the tray ticks every second while tracking. */
const advance = (seconds) => {
  now += seconds * 1000;
  jest.setSystemTime(now);
  if (global.isTracking) tick();
};
const iso = (ms) => new Date(ms).toISOString();

const GLOBAL_KEYS = Object.keys(global);
let getStats;
let mainHandlers = {};
let tray;
let tm;
let seq;
const log = [];

function pulseTotal(rows = server.rows) {
  const dayStart = startOfWorkDay(new Date(now)).getTime();
  let total = 0;
  for (const r of rows) {
    const s = Date.parse(r.start_time);
    if (s < dayStart) continue;
    const e = r.end_time ? Date.parse(r.end_time) : now;
    total += Math.floor((e - s) / 1000) - (r.deducted_seconds || 0);
  }
  return Math.max(0, total);
}

function makeTray() {
  const t = Object.create(TrayManager.prototype);
  t.tray = { isDestroyed: () => false, setTitle: () => {}, setToolTip: () => {}, getTitle: () => '' };
  t._cumulativeBaseSeconds = 0;
  t._trackingStartTime = null;
  t.isTracking = false;
  t._maybeRolloverLocalDay = () => {};
  t.startTrayTimer = () => {};
  t.stopTrayTimer = () => {};
  t.updateMenu = () => {};
  t.showNotification = () => {};
  return t;
}

const trayClock = () => TrayManager.prototype._resolveLiveClock.call(tray).cumulative;

/** What one real tray tick records (tray-manager.js startTrayTimer). */
function tick() {
  const cumulative = trayClock();
  tray._lastCumulativeSeconds = cumulative;
  global._trayTodayHighWaterSeconds = cumulative;
  global._trayTodayHighWaterDate = require('../today-time-log-stats').localDateKey();
}

/** What the window shows right now. */
const screen = { stopped: null };
function shown() {
  return global.isTracking ? trayClock() : screen.stopped;
}

async function read() {
  const r = await getStats();
  // main's push is sent before the read's reply, so the window sees it first.
  windowGetsPush();
  if (!global.isTracking) screen.stopped = r.totalTime;
  // Main's own figure (Today cards, last-good) must equal Pulse as well.
  // While a Stop's close is in flight, Pulse is what the laptop recorded.
  const want = pendingClose ? pulseTotal(rowsAsRecorded()) : pulseTotal();
  if (Math.abs(r.totalTime - want) > 1) {
    log.push(`main's read ${r.totalTime}s, Pulse ${want}s`);
    expect({ step: 'main read', diff: r.totalTime - want }).toEqual({ step: 'main read', diff: 0 });
  }
  return r;
}

/** Server rows as the laptop recorded them: an in-flight close ends at its last alive mark. */
function rowsAsRecorded() {
  return server.rows.map((x) =>
    !x.end_time && x.last_alive_at && !(global.isTracking && x.id === global.currentTimeLogId)
      ? { ...x, end_time: x.last_alive_at }
      : x,
  );
}

/** Like expectMatchesPulse, but against what the laptop recorded (server may lag). */
function expectMatchesPulseLocal(label) {
  expectMatchesPulse(label, pulseTotal(rowsAsRecorded()));
}

function expectMatchesPulse(label, want = pulseTotal()) {
  const got = shown();
  log.push(`${label}: shown ${got}s, Pulse ${want}s`);
  if (Math.abs(got - want) > 1) process.stdout.write(`MISMATCH ${expect.getState().currentTestName} | ${log.join(" ; ")}\n`);
  // ±1s: the tray and the server round to whole seconds independently.
  expect({ step: label, diff: Math.abs(got - want) <= 1 ? 0 : got - want }).toEqual({ step: label, diff: 0 });
}

async function start({ windowNumber = screen.stopped } = {}) {
  // start-timer carries the window's number as todayFloorSeconds (ipc-event-map.js).
  if (windowNumber > 0) global._rendererTodayFloorSeconds = windowNumber;
  const id = `log-${++seq}`;
  server.rows.push({ id, start_time: iso(now), end_time: null, status: 'active', deducted_seconds: 0, last_alive_at: iso(now) });
  tm.currentTimeLogId = id;
  tm.sessionStartTime = iso(now);
  tm.isTracking = true;
  global.isTracking = true;
  global.currentTimeLogId = id;
  global.sessionStartTime = iso(now);
  const base = TrackingManager.prototype._resolveStartClosedBaseSeconds.call(tm, false);
  lastStartBase = base; // what the menu bar opens on, before the refresh
  TrayManager.prototype.updateState.call(tray, true, false, {
    startTime: iso(now),
    completedTodayBeforeSessionSeconds: base,
    replaceCumulativeBase: true,
  });
  // Background base refresh that Start schedules (forward-only).
  const { computeTodayTimeLogSeconds } = require('../today-time-log-stats');
  const agg = await computeTodayTimeLogSeconds('4217', id, true);
  const nextBase = TrackingManager.prototype._resolveTodayBaseSeconds.call(tm, agg.completedClosedSeconds);
  if (nextBase > 0) tray._cumulativeBaseSeconds = Math.max(tray._cumulativeBaseSeconds, nextBase);
  return id;
}

async function stop({ serverLags = false } = {}) {
  global.isStopping = true;
  global._lastStopEndAtMs = now;
  global._lastExplicitStopEndIso = iso(now);
  TrackingManager.prototype._captureStopTodayTotalSnapshot.call(tm);
  const row = server.rows.find((r) => r.id === tm.currentTimeLogId);
  if (serverLags) {
    // Close still in flight: the server has the row open, alive to now.
    row.last_alive_at = iso(now);
    pendingClose = () => { row.end_time = row.last_alive_at; row.status = 'completed'; };
  } else {
    row.end_time = iso(now);
    row.status = 'completed';
  }
  const frozen = Math.max(0, Math.floor(Number(global._lastTodayTotalAtStop) || 0));
  tm.isTracking = false;
  tm.currentTimeLogId = null;
  global.isTracking = false;
  global.currentTimeLogId = null;
  TrayManager.prototype.updateState.call(tray, false, false, {});
  global.isStopping = false;
  // Renderer paints main's frozen Stop total and hands it back (tracking-stopped).
  if (frozen > 0) {
    screen.stopped = frozen;
    await mainHandlers['set-frozen-total-at-stop']?.({}, frozen);
  }
}
let pendingClose = null;
let lastStartBase = null;
function serverCatchesUp() {
  if (pendingClose) pendingClose();
  pendingClose = null;
}

/** Delete from this app: server deducts, then main applies it locally. */
function deleteHere(row, seconds) {
  row.deducted_seconds = (row.deducted_seconds || 0) + seconds;
  const applied = timeDeductions.applyAuthorizedDeduction({ seconds, timeLogId: row.id, timeLogStartTime: row.start_time });
  // confirmDeleteScreenshot lowers the window only when main applied it.
  if (applied.applied > 0 && !global.isTracking) screen.stopped = Math.max(0, screen.stopped - seconds);
}

/** Delete in Pulse / another device: only the server knows. */
function deleteElsewhere(row, seconds) {
  row.deducted_seconds = (row.deducted_seconds || 0) + seconds;
}

/** Renderer handler for the main → window 'today-deduction-applied' push. */
function windowGetsPush() {
  const sent = global.mainWindow.webContents.send.mock.calls.filter((c) => c[0] === 'today-deduction-applied');
  for (const [, data] of sent) {
    if (!global.isTracking) screen.stopped = Math.max(0, screen.stopped - data.seconds);
  }
  global.mainWindow.webContents.send.mockClear();
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  now = T0;
  jest.setSystemTime(now);
  for (const k of Object.keys(global)) if (!GLOBAL_KEYS.includes(k)) delete global[k];
  for (const f of fs.readdirSync(TMP)) fs.rmSync(path.join(TMP, f), { recursive: true, force: true });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  server.rows = [];
  server.staleRows = null;
  server.fail = false;
  seq = 0;
  log.length = 0;
  screen.stopped = 0;
  tray = makeTray();
  tm = Object.create(TrackingManager.prototype);
  tm._offlineQueueWriteGen = 0;
  global.trayManager = tray;
  global.trackingManager = tm;
  global.currentUserId = '4217';
  global.mainWindow = { isDestroyed: () => false, webContents: { send: jest.fn() } };
  getStats = loadStatsHandler();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

// settled: the server has every second, so main trusts it outright.
// sync lag: reads never count as settled, so every forward-only floor is live.
describe.each([['settled reads', false], ['sync lag', true]])('screenshot deletes (%s) — shown time equals Pulse at every step', (_name, lagging) => {
  beforeEach(() => {
    if (lagging) global._postOfflineSyncGraceUntil = Number.MAX_SAFE_INTEGER;
  });

  test('delete in the running session, then Stop / Start / Stop', async () => {
    const a = await start();
    advance(1800); await read(); expectMatchesPulse('tracking 30m');
    deleteHere(server.rows[0], 600); expectMatchesPulse('deleted 10m live');
    advance(60); await read(); expectMatchesPulse('read after delete');
    advance(60); await stop(); expectMatchesPulse('Stop (frozen)');
    await read(); expectMatchesPulse('stopped read');
    advance(300); await read(); expectMatchesPulse('stopped 5m later');
    await start(); expectMatchesPulse('Start again');
    advance(600); await read(); expectMatchesPulse('tracking 10m');
    await stop(); expectMatchesPulse('Stop 2 (frozen)');
    await read(); expectMatchesPulse('stopped read 2');
    expect(a).toBe('log-1');
  });

  test('delete from an earlier session today, while stopped, then Start', async () => {
    await start(); advance(3600); await read(); await stop(); await read();
    deleteHere(server.rows[0], 900); expectMatchesPulse('deleted 15m from closed');
    await read(); expectMatchesPulse('read after delete');
    await start(); expectMatchesPulse('Start');
    advance(120); await read(); expectMatchesPulse('tracking 2m');
    await stop(); await read(); expectMatchesPulse('Stop');
  });

  test('delete from an earlier session today while tracking a new one', async () => {
    await start(); advance(3600); await read(); await stop(); await read();
    await start(); advance(600); await read();
    deleteHere(server.rows[0], 300); expectMatchesPulse('deleted 5m from closed');
    advance(30); await read(); expectMatchesPulse('read');
    await stop(); expectMatchesPulse('Stop (frozen)');
    await read(); expectMatchesPulse('stopped read');
    await start(); expectMatchesPulse('Start');
  });

  test('read that predates the delete does not bring the time back', async () => {
    await start(); advance(1800); await read();
    const before = clone(server.rows);
    deleteHere(server.rows[0], 600);
    server.staleRows = before; // server answers with pre-delete rows once
    advance(5); await read(); expectMatchesPulse('stale read while tracking');
    await stop(); server.staleRows = clone(before).map((r) => ({ ...r, end_time: iso(now), status: 'completed' }));
    await read(); expectMatchesPulse('stale read while stopped');
    await read(); expectMatchesPulse('fresh read');
  });

  test('delete in Pulse while tracking', async () => {
    await start(); advance(3600); await read(); await stop(); await read();
    await start(); advance(600); await read();
    deleteElsewhere(server.rows[0], 420);
    advance(30); await read(); expectMatchesPulse('read sees Pulse delete');
    await stop(); expectMatchesPulse('Stop (frozen)');
    await read(); expectMatchesPulse('stopped read');
  });

  test('delete in Pulse on the running session', async () => {
    await start(); advance(1800); await read();
    deleteElsewhere(server.rows[0], 300);
    advance(30); await read(); expectMatchesPulse('read sees live delete');
    await stop(); expectMatchesPulse('Stop (frozen)');
    await read(); expectMatchesPulse('stopped read');
  });

  test('delete in Pulse while stopped', async () => {
    await start(); advance(3600); await read(); await stop(); await read();
    deleteElsewhere(server.rows[0], 480);
    await read(); expectMatchesPulse('read sees Pulse delete');
    await start(); expectMatchesPulse('Start');
    advance(60); await read(); expectMatchesPulse('tracking');
  });

  test('delete from yesterday does not change today', async () => {
    const yStart = T0 - 24 * 3600_000;
    server.rows.push({ id: 'y-1', start_time: iso(yStart), end_time: iso(yStart + 3600_000), status: 'completed', deducted_seconds: 0 });
    await start(); advance(1800); await read();
    deleteHere(server.rows[0], 600); expectMatchesPulse('deleted yesterday while tracking');
    await stop(); await read(); expectMatchesPulse('stopped');
    deleteHere(server.rows[0], 300); expectMatchesPulse('deleted yesterday while stopped');
    await read(); expectMatchesPulse('stopped read');
  });

  test('delete larger than the running session so far', async () => {
    await start(); advance(3600); await read(); await stop(); await read();
    await start(); advance(120); await read();
    deleteHere(server.rows[1], 600); expectMatchesPulse('deleted 10m from 2m session');
    advance(30); await read(); expectMatchesPulse('read');
    await stop(); expectMatchesPulse('Stop (frozen)');
    await read(); expectMatchesPulse('stopped read');
  });

  test('server never records the delete: time comes back after 5 minutes', async () => {
    await start(); advance(1800); await read(); await stop(); await read();
    // The app applies a delete the server then lost.
    timeDeductions.applyAuthorizedDeduction({ seconds: 600, timeLogId: 'log-1', timeLogStartTime: server.rows[0].start_time });
    screen.stopped -= 600;
    advance(360); await read(); expectMatchesPulse('6m later, server still has full time');
  });

  test('network down after a delete: the delete stays applied', async () => {
    await start(); advance(1800); await read();
    deleteHere(server.rows[0], 600);
    server.fail = true;
    advance(30); await read(); expectMatchesPulse('failed read while tracking');
    server.fail = false;
    await read(); expectMatchesPulse('recovered');
  });

  test('window still holds the pre-delete number when Start is clicked', async () => {
    await start(); advance(3600); await read(); await stop(); await read();
    const before = screen.stopped;
    deleteHere(server.rows[0], 600); await read();
    await start({ windowNumber: before }); expectMatchesPulse('Start');
    advance(60); await read(); expectMatchesPulse('tracking');
  });

  test('first launch: no read yet, window number seeds Start', async () => {
    server.rows.push({ id: 'early', start_time: iso(T0 - 7200_000), end_time: iso(T0 - 3600_000), status: 'completed', deducted_seconds: 0 });
    screen.stopped = 3600;
    await start(); expectMatchesPulse('Start from window number');
    advance(60); await read(); expectMatchesPulse('tracking');
  });

  test('small deletes in Pulse (under a minute) on the running session', async () => {
    await start(); advance(1800); await read();
    deleteElsewhere(server.rows[0], 45);
    advance(30); await read(); expectMatchesPulse('read sees 45s live delete');
    await stop(); expectMatchesPulse('Stop (frozen)');
    await read(); expectMatchesPulse('stopped read');
    await start(); expectMatchesPulse('Start');
  });

  test('small delete larger than a 20s-old session', async () => {
    await start(); advance(3600); await read(); await stop(); await read();
    await start(); advance(20); await read();
    deleteHere(server.rows[1], 50); expectMatchesPulse('deleted 50s from 20s session');
    advance(5); await read(); expectMatchesPulse('read');
    await stop(); expectMatchesPulse('Stop (frozen)');
    await read(); expectMatchesPulse('stopped read');
  });

  test('Stop then Start 2s later, before the server has the close (16 Oct 13:09)', async () => {
    await start(); advance(600); await read(); await stop(); await read();
    await start(); advance(31); await read();
    await stop({ serverLags: true }); expectMatchesPulseLocal('Stop (frozen)');
    await read(); expectMatchesPulseLocal('stopped read before server has the close');
    advance(1); serverCatchesUp();
    await start(); expectMatchesPulseLocal('Start 2s after Stop');
    advance(2); await read(); expectMatchesPulseLocal('tracking');
  });

  test('a read in flight across Stop does not lose the Stop total (16 Oct 14:00)', async () => {
    await start(); advance(600); await read(); await stop(); await read();
    await start(); advance(300);
    let release;
    server.gate = new Promise((r) => { release = r; });
    const inFlight = getStats(); // began while tracking
    await new Promise((r) => setImmediate(r));
    await stop(); expectMatchesPulse('Stop (frozen)');
    server.gate = null;
    release();
    await inFlight; // lands after the Stop with the pre-Stop closed total
    advance(1);
    const before = pulseTotal();
    await start();
    expect({ step: 'menu bar opens on', base: lastStartBase }).toEqual({ step: 'menu bar opens on', base: before });
    expectMatchesPulse('quick Start after the late read');
    advance(2); await read(); expectMatchesPulse('tracking');
  });

  test('several deletes across sessions, many Start/Stop cycles', async () => {
    await start(); advance(1200); await read(); deleteHere(server.rows[0], 120); expectMatchesPulse('c1 del');
    advance(600); await stop(); expectMatchesPulse('c1 stop'); await read(); expectMatchesPulse('c1 read');
    for (let i = 2; i <= 5; i++) {
      advance(120);
      await start(); expectMatchesPulse(`c${i} start`);
      advance(900); await read(); expectMatchesPulse(`c${i} read`);
      deleteHere(server.rows[i - 1], 60); expectMatchesPulse(`c${i} del live`);
      deleteHere(server.rows[0], 30); expectMatchesPulse(`c${i} del closed`);
      if (i % 2) { deleteElsewhere(server.rows[i - 2], 45); advance(10); await read(); expectMatchesPulse(`c${i} Pulse del`); }
      advance(300); await stop(); expectMatchesPulse(`c${i} stop`);
      await read(); expectMatchesPulse(`c${i} stopped read`);
    }
  });
});
