/**
 * Sleep must never bill the nap: an end-to-end replay against the real backend.
 *
 * Desktop side is the production code: TrackingManager (Start, 30s checkpoint,
 * sleep-gap detection), GracefulShutdownManager (Stop), EventHandlerManager
 * (suspend / resume / display-sleep / display-wake) and session-recovery
 * (wake reconcile). Every server call goes over HTTP to the real
 * ForceSyncController and the real stale-session Lambda, running on a
 * throwaway Postgres whose now() follows this test's clock.
 *
 * Needs the simulation backend (see SIM_BACKEND_URL); skipped without it.
 *
 * After each scenario: what Pulse bills for the day (end, else last_alive_at,
 * minus deductions) must equal the time the laptop was actually awake and
 * tracking. "Leak" = Pulse > awake; "lost" = Pulse < awake.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { EventEmitter } = require('events');

const SIM = process.env.SIM_BACKEND_URL || '';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sleep-leak-e2e-'));
process.env.ALYSON_PAYROLL_APP_DATA_DIR = TMP;
process.env.APPDATA = TMP;

const powerMonitor = new EventEmitter();
jest.mock(
  'electron',
  () => ({
    app: { getPath: () => require('os').tmpdir(), getVersion: () => '9.9.9-sim', isPackaged: false },
    net: { isOnline: () => true },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    BrowserWindow: { getAllWindows: () => [] },
    Notification: class { show() {} static isSupported() { return false; } },
  }),
  { virtual: true },
);

const USER = 4217;
const T0 = Date.parse('2026-10-16T15:00:00.000Z'); // 08:00 Pacific
const requests = [];
let offline = false;
// The OS froze the process before these packets left; they go out at wake.
let frozen = false;
const heldWhileFrozen = [];

/** fetch over node:http so jest's fake timers never stall the socket. */
function simFetch(url, init = {}) {
  if (frozen && !String(url).includes('/sim/')) {
    return new Promise((resolve, reject) => heldWhileFrozen.push(() => simFetch(url, init).then(resolve, reject)));
  }
  if (offline && !String(url).includes('/sim/')) {
    return Promise.reject(new Error('getaddrinfo ENOTFOUND (simulated offline)'));
  }
  const target = new URL(url);
  const body = init.body || '';
  const sentAt = new Date(Date.now()).toISOString();
  try {
    requests.push({ at: sentAt, ...JSON.parse(body) });
  } catch (_) { /* not JSON */ }
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: target.hostname,
        port: target.port,
        path: target.pathname,
        method: init.method || 'POST',
        headers: { 'content-type': 'application/json', 'x-sim-now': sentAt },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: async () => JSON.parse(raw || '{}'),
            text: async () => raw,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

function simCall(route, payload = {}) {
  return simFetch(`${SIM}${route}`, { body: JSON.stringify(payload) }).then((r) => r.json());
}
const sql = (text, params = []) => simCall('/sim/sql', { sql: text, params }).then((r) => r.rows);

const describeSim = SIM ? describe : describe.skip;
jest.setTimeout(10 * 60_000);

describeSim('laptop sleep never bills the nap (real backend)', () => {
  let TrackingManager;
  let EventHandlerManager;
  let gsm;
  let tm;
  let events;
  let awake; // [{fromMs, toMs}] intervals the laptop was awake AND tracking
  let trackingSince;

  const now = () => Date.now();
  const iso = (ms) => new Date(ms).toISOString();

  /** Laptop awake: every timer fires on time, the event loop runs. */
  async function work(seconds) {
    for (let s = 1; s <= seconds; s++) {
      jest.advanceTimersByTime(1000);
      // The checkpoint and its HTTP calls run every 30s; let them land.
      if (s % 10 === 0) await settle(3);
    }
    await settle();
  }

  /** Let in-flight HTTP and promise chains finish (real I/O, fake clock). */
  async function settle(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
      await new Promise((r) => setImmediate(r));
      await realDelay(4);
    }
  }

  function realDelay(ms) {
    return new Promise((r) => jest.requireActual('timers').setTimeout(r, ms));
  }

  function markAwakeEnd() {
    if (trackingSince != null) {
      awake.push({ fromMs: trackingSince, toMs: now() });
      trackingSince = null;
    }
  }

  async function start() {
    const r = await tm.startTracking(null);
    if (!r || r.success === false) throw new Error(`Start failed: ${JSON.stringify(r)}`);
    trackingSince = now();
    await settle();
    return tm.currentTimeLogId;
  }

  async function stopButton() {
    markAwakeEnd();
    await global.stopTracking('manual');
    await settle();
  }

  /**
   * The OS freezes the process. `deliver`: 'before' (suspend event fires as
   * the lid closes), 'after' (fires at wake, Om 14 Oct), 'never', or
   * 'display-only' (Windows lid: display-sleep, no suspend).
   */
  async function sleep(minutes, { deliver = 'before', wakeEvent = 'resume', freezeMidStop = false, onWake } = {}) {
    markAwakeEnd();
    const nap = { fromMs: now() };
    if (freezeMidStop) frozen = true;
    if (deliver === 'before') { powerMonitor.emit('suspend'); if (!freezeMidStop) await settle(); }
    if (deliver === 'display-only') { powerMonitor.emit('display-sleep'); if (!freezeMidStop) await settle(); }
    frozen = true;
    // Frozen: wall clock moves, monotonic clock and timers do not.
    jest.setSystemTime(now() + minutes * 60_000);
    nap.toMs = now();
    naps.push(nap);
    frozen = false;
    if (onWake) await onWake();
    for (const send of heldWhileFrozen.splice(0)) send();
    if (deliver === 'after') { powerMonitor.emit('suspend'); await settle(); }
    if (wakeEvent === 'resume') powerMonitor.emit('resume');
    if (wakeEvent === 'display-wake') powerMonitor.emit('display-wake');
    await settle();
    // Timers that came due during the nap fire once at wake.
    await work(2);
    await settle();
    if (tm.isTracking && trackingSince == null) trackingSince = now();
  }
  let naps = [];

  async function staleSweep() {
    return simCall('/sim/lambda');
  }

  async function rows() {
    return sql(
      `SELECT id, start_time, end_time, last_alive_at, status, deducted_seconds
       FROM time_doctor.time_logs WHERE user_id = $1 ORDER BY start_time`,
      [USER],
    );
  }

  /** Pulse: end_time, else last_alive_at, else now; merged; minus deductions. */
  async function pulseSeconds() {
    const { sessionEndMs } = { sessionEndMs: (l) => new Date(l.end_time ?? l.last_alive_at ?? Date.now()).getTime() };
    const list = await rows();
    const ivs = list
      .map((l) => ({ s: Date.parse(l.start_time), e: sessionEndMs(l) }))
      .filter((i) => i.e > i.s)
      .sort((a, b) => a.s - b.s);
    let total = 0;
    let cur = null;
    for (const i of ivs) {
      if (!cur || i.s > cur.e) { if (cur) total += cur.e - cur.s; cur = { ...i }; } else cur.e = Math.max(cur.e, i.e);
    }
    if (cur) total += cur.e - cur.s;
    const ded = list.reduce((a, l) => a + (l.deducted_seconds || 0), 0);
    return Math.round(total / 1000) - ded;
  }

  function awakeSeconds() {
    const open = trackingSince != null ? [{ fromMs: trackingSince, toMs: now() }] : [];
    return Math.round([...awake, ...open].reduce((a, i) => a + (i.toMs - i.fromMs), 0) / 1000);
  }

  /** Writes after a nap that claim the laptop was alive during it. */
  function liveClaimsInside(nap) {
    return requests.filter((r) => {
      const d = r.data || {};
      const u = d.updates || d.log || d;
      const claims = [u.last_alive_at, u.client_last_seen_at, d.seen_at, u.end_time].filter(Boolean).map(Date.parse);
      return claims.some((c) => c > nap.fromMs + 35_000 && c < nap.toMs);
    });
  }

  async function report(label) {
    const pulse = await pulseSeconds();
    const real = awakeSeconds();
    const list = await rows();
    const t = (v) => (v ? new Date(v).toISOString().slice(11, 19) : '—');
    process.stdout.write(
      `\n[${label}] Pulse ${pulse}s | awake+tracking ${real}s | ${pulse - real > 0 ? 'LEAK' : pulse - real < 0 ? 'LOST' : 'exact'} ${pulse - real}s\n` +
        list.map((r) => `   ${r.id.slice(0, 8)} ${t(r.start_time)}→${t(r.end_time)} alive ${t(r.last_alive_at)} ${r.status}`).join('\n') +
        '\n',
    );
    return { label, pulse, awake: real, leak: pulse - real, rows: list };
  }

  const warnings = [];
  beforeAll(async () => {
    for (const m of ['log', 'info', 'debug', 'time', 'timeEnd']) jest.spyOn(console, m).mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation((...a) => warnings.push(a.join(' ')));
    jest.spyOn(console, 'error').mockImplementation((...a) => warnings.push(a.join(' ')));
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'], now: T0 });
  });
  const BASE_GLOBALS = new Set(Object.keys(global));

  beforeEach(async () => {
    await sql(`DELETE FROM time_doctor.time_log_events WHERE user_id = $1`, [USER]);
    await sql(`DELETE FROM time_doctor.session_heartbeats WHERE user_id = $1`, [USER]);
    await sql(`DELETE FROM time_doctor.time_logs WHERE user_id = $1`, [USER]);
    requests.length = 0;
    offline = false;
    frozen = false;
    heldWhileFrozen.length = 0;
    naps = [];
    awake = [];
    trackingSince = null;
    powerMonitor.removeAllListeners();
    for (const f of fs.readdirSync(TMP)) fs.rmSync(path.join(TMP, f), { recursive: true, force: true });
    jest.setSystemTime(T0);
    // A fresh app per scenario: no globals or module state from the last one.
    jest.clearAllTimers();
    for (const k of Object.keys(global)) if (!BASE_GLOBALS.has(k)) delete global[k];
    jest.resetModules();
    global.fetch = simFetch;
    global.config = { user_id: USER, backend_api_url: SIM, backend_api_key: 'sim-key' };
    TrackingManager = require('../tracking-manager');
    EventHandlerManager = require('../../utils/event-handler-manager');
    gsm = require('../graceful-shutdown-manager');

    global.currentUserId = USER;
    global.isTracking = false;
    global.currentTimeLogId = null;
    tm = new TrackingManager(global.config);
    global.trackingManager = tm;
    global.trayManager = makeTray();
    global.mainWindow = null;
    global.stopTracking = makeGlobalStop();
    global.startTracking = (projectId) => tm.startTracking(projectId);
    // Signed-in user, as resume restores it (needed for the short-suspend restart).
    global.loadDesktopAgentSession = async () => ({ id: USER, email: 'sim@tavilo.test' });
    events = new EventHandlerManager({
      global,
      powerMonitor,
      console: { log() {}, warn() {}, error() {} },
    });
    events.setupPowerMonitoring();
  });

  afterAll(() => {
    jest.useRealTimers();
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  /** Real TrayManager clock (1s tick, sleep-gap hold); only drawing is stubbed. */
  function makeTray() {
    const TrayManager = require('../../ui/tray-manager');
    const t = Object.create(TrayManager.prototype);
    t.tray = { isDestroyed: () => false, setTitle() {}, setToolTip() {}, getTitle: () => '', setImage() {}, setContextMenu() {} };
    t._cumulativeBaseSeconds = 0;
    t.isTracking = false;
    for (const m of ['updateMenu', 'showNotification', '_installWindowShowHooks', '_setTrackingIcon', '_setStoppedIcon',
      '_pushRendererTick', 'showAutoStopNotification', '_scheduleNextWorkDayRollover']) t[m] = () => {};
    return t;
  }

  /** main.js global.stopTracking, lifted verbatim. */
  function makeGlobalStop() {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../main.js'), 'utf8');
    const from = src.indexOf('  global.stopTracking = async function stopTracking(');
    const to = src.indexOf("  console.log('✅ Critical functions defined at startup: startTracking, stopTracking');");
    const SRC = path.resolve(__dirname, '../../..');
    const req = (p) => require(p.startsWith('.') ? path.join(SRC, p) : p);
    // eslint-disable-next-line no-new-func
    new Function('require', src.slice(from, to))(req);
    return global.stopTracking;
  }

  /** Leak never; lost at most one checkpoint window (30s) per nap. */
  async function expectNoLeak(label, { lostPerNap = 35 } = {}) {
    const r = await report(label);
    const claims = naps.flatMap((n) => liveClaimsInside(n));
    if (claims.length) process.stdout.write(`   writes claiming the nap was awake: ${JSON.stringify(claims).slice(0, 600)}\n`);
    expect({ label, leak: Math.max(0, r.leak) }).toEqual({ label, leak: 0 });
    expect(r.leak).toBeGreaterThanOrEqual(-lostPerNap * Math.max(1, naps.length));
    expect(claims).toEqual([]);
    return r;
  }

  /** While the laptop is still asleep, Pulse must not be counting the nap. */
  const pulseWhileAsleep = (label) => async () => {
    const pulse = await pulseSeconds();
    const real = awakeSeconds();
    process.stdout.write(`   [${label}] while asleep: Pulse ${pulse}s, awake ${real}s\n`);
    expect({ label, asleepLeak: Math.max(0, pulse - real - 35) }).toEqual({ label, asleepLeak: 0 });
  };

  test('smoke: Start, work 5m, Stop', async () => {
    await start();
    await work(300);
    await stopButton();
    await expectNoLeak('smoke');
  });

  test('Mac lid close: suspend delivered, Stop finishes, 45m nap, then Start', async () => {
    await start(); await work(1200);
    await sleep(45, { deliver: 'before', onWake: pulseWhileAsleep('mac lid') });
    expect(tm.isTracking).toBe(false);
    await work(60); await start(); await work(600); await stopButton();
    await expectNoLeak('mac lid close');
  });

  test('OS freezes mid-Stop: Stop requests leave only at wake', async () => {
    await start(); await work(1200);
    await sleep(45, { deliver: 'before', freezeMidStop: true, onWake: pulseWhileAsleep('frozen mid-stop') });
    await work(60); await start(); await work(600); await stopButton();
    await expectNoLeak('frozen mid-Stop');
  });

  test('suspend never delivered, resume delivered at wake', async () => {
    await start(); await work(1200);
    await sleep(45, { deliver: 'never', onWake: pulseWhileAsleep('no suspend') });
    await work(60);
    expect(tm.isTracking).toBe(false);
    await start(); await work(600); await stopButton();
    await expectNoLeak('no suspend event');
  });

  test('no power events at all: only the timers notice', async () => {
    await start(); await work(1200);
    await sleep(45, { deliver: 'never', wakeEvent: 'none', onWake: pulseWhileAsleep('no events') });
    await work(60);
    expect(tm.isTracking).toBe(false);
    await start(); await work(600); await stopButton();
    await expectNoLeak('no power events');
  });

  test('Windows: suspend delivered late, at wake', async () => {
    await start(); await work(1200);
    await sleep(31, { deliver: 'after', onWake: pulseWhileAsleep('late suspend') });
    await work(60); await start(); await work(600); await stopButton();
    await expectNoLeak('suspend at wake');
  });

  test('Windows lid: display-sleep only, then display-wake', async () => {
    await start(); await work(1200);
    await sleep(40, { deliver: 'display-only', wakeEvent: 'display-wake', onWake: pulseWhileAsleep('display only') });
    await work(60); await start(); await work(600); await stopButton();
    await expectNoLeak('display-sleep only');
  });

  test('offline when the lid closes, back online after wake', async () => {
    await start(); await work(1200);
    offline = true;
    await sleep(45, { deliver: 'before', onWake: pulseWhileAsleep('offline') });
    await work(120);
    offline = false;
    await tm.processOfflineQueue?.(); await settle(); await work(60);
    await start(); await work(600); await stopButton();
    await expectNoLeak('offline at lid close');
  });

  test('never wakes (battery dies): sweep closes it, Start next morning', async () => {
    await start(); await work(1800);
    await sleep(10 * 60, {
      deliver: 'never',
      wakeEvent: 'none',
      onWake: async () => {
        await pulseWhileAsleep('dead laptop')();
        const sweep = await staleSweep();
        process.stdout.write(`   sweep: ${JSON.stringify(sweep).slice(0, 300)}\n`);
        await pulseWhileAsleep('after sweep')();
      },
    });
    await work(60);
    await start(); await work(600); await stopButton();
    await expectNoLeak('never woke + sweep');
  });

  test('very short suspend (4s blip) resumes tracking', async () => {
    await start(); await work(1200);
    await sleep(4 / 60, { deliver: 'before' });
    await work(5);
    expect(tm.isTracking).toBe(true); // restarted from wake
    await work(600); await stopButton();
    await expectNoLeak('4s blip', { lostPerNap: 40 });
  });

  test('four naps in one day, mixed delivery', async () => {
    await start(); await work(900);
    await sleep(31, { deliver: 'after' }); await work(30); await start(); await work(900);
    await sleep(54, { deliver: 'before', freezeMidStop: true }); await work(30); await start(); await work(900);
    await sleep(10, { deliver: 'never' }); await work(30); if (!tm.isTracking) await start(); await work(900);
    await sleep(27, { deliver: 'never', wakeEvent: 'none' }); await work(30); if (!tm.isTracking) await start(); await work(900);
    await stopButton();
    await expectNoLeak('four naps');
  });

  test('wakes, then sleeps again within a minute', async () => {
    await start(); await work(1200);
    await sleep(30, { deliver: 'never' });
    await work(20);
    await sleep(30, { deliver: 'never', wakeEvent: 'none' });
    await work(60); if (!tm.isTracking) await start(); await work(300); await stopButton();
    await expectNoLeak('sleep, wake, sleep');
  });
});
