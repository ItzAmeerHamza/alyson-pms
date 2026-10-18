/**
 * Wake race: the OS froze the agent and the suspend event, if any, arrives
 * after wake. Until a Stop lands, the 60s checkpoint, the 1s tray tick and the
 * durable sleep arm all see now − Start spanning the nap. None may bill it —
 * and none may cut real work (an App Nap stall is not sleep).
 *
 * Once every second of today is on the server, a stopped clock must equal it
 * (= Pulse) instead of a Stop floor held for the rest of the day.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = path.join(os.tmpdir(), 'alyson-wake-race-guards');
process.env.ALYSON_PAYROLL_APP_DATA_DIR = TMP;

jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  isLikelyOffline: jest.fn(() => true),
  updateTimeLog: jest.fn(() => new Promise(() => {})),
  closeOpenUrlLogs: jest.fn(),
  closeOpenAppLogs: jest.fn(),
}));

jest.mock(
  'electron',
  () => ({
    app: { getPath: () => require('path').join(require('os').tmpdir(), 'alyson-wake-race-guards') },
    net: { isOnline: () => false },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  }),
  { virtual: true },
);

const sleepClock = require('../../utils/sleep-aware-elapsed');
const { isSettledTodayRead } = require('../../utils/today-time-log-stats');
const { scheduleSettledReconcile, cancelSettledReconcile } = require('../../utils/settled-reconcile');
const TrackingManager = require('../tracking-manager');
const TrayManager = require('../../ui/tray-manager');

const {
  isSleepTickGap,
  noteAwakeTick,
  resetAwakeClock,
  latestAwakeProofMs,
  resolveStoppedClockSeconds,
  resolveStopHintSeconds,
} = sleepClock;

const SESSION_ID = 'a4f0c2d1-0000-4000-8000-000000000001';
const START = '2026-10-14T09:00:00.000Z';
const LAST_CP = '2026-10-14T11:28:05.000Z'; // last 60s checkpoint before the freeze
const LAST_TICK = '2026-10-14T11:28:51.900Z'; // last 1s tray tick before the freeze
const WAKE = '2026-10-14T11:59:53.913Z';
const NAP_MS = 31 * 60 * 1000;

const ms = (iso) => new Date(iso).getTime();

const GLOBALS = [
  '_stopEndTimeOverride',
  '_sleepSafeStopEndIso',
  '_stopAuthorizedIdleCut',
  '_lidLastProofIso',
  '_lastAwakeTickMs',
  '_lastAwakeTickMonoMs',
  '_lastSleepWindow',
  '_lastWakeAtMs',
  '_startAfterSleep',
  '_sleepSplitInProgress',
  '_lastSleepSplitAt',
  '_lidDownArmed',
  '_resumeTrackingAfterWake',
  '_postOfflineSyncGraceUntil',
  '_todayStatsInFlight',
  '_trayTodayHighWaterSeconds',
  '_trayTodayHighWaterDate',
  'currentTimeLogId',
  'currentUserId',
  'trackingManager',
  'mainWindow',
  'isTracking',
  'isStopping',
  'sessionStartTime',
  'userExplicitlyStopped',
];

function clearGlobals() {
  for (const key of GLOBALS) delete global[key];
}

const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
function setPlatform(value) {
  Object.defineProperty(process, 'platform', { ...realPlatform, value });
}
function restorePlatform() {
  Object.defineProperty(process, 'platform', realPlatform);
}

function makeTm({ checkpointAt = LAST_CP, checkpointId = SESSION_ID } = {}) {
  const tm = Object.create(TrackingManager.prototype);
  tm.config = { user_id: 1223 };
  tm.queue = [];
  tm.isTracking = true;
  tm.currentTimeLogId = SESSION_ID;
  tm.sessionStartTime = START;
  tm.currentProjectId = null;
  tm.currentSession = { start_time: START };
  tm.getOfflineQueue = () => tm.queue.slice();
  tm._persistOfflineQueueOrThrow = (next) => {
    tm.queue = next.slice();
  };
  tm._appendTimeLedger = () => {};
  tm.startOfflineSync = jest.fn();
  tm._stopTimeLogCheckpoint = () => {};
  tm._storeSessionCheckpoint = jest.fn();
  tm._storePendingSessionClose = jest.fn();
  tm._readSessionCheckpoint = () =>
    checkpointAt ? { timeLogId: checkpointId, startTime: START, checkpointAt } : null;
  return tm;
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  restorePlatform();
  cancelSettledReconcile();
  clearGlobals();
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
});

describe('isSleepTickGap', () => {
  const t0 = ms(LAST_TICK);

  it('Windows: a wall-clock jump past the gap is sleep', () => {
    expect(isSleepTickGap({ prevWallMs: t0, wallMs: t0 + NAP_MS, platform: 'win32' })).toBe(true);
    expect(isSleepTickGap({ prevWallMs: t0, wallMs: t0 + 59 * 1000, platform: 'win32' })).toBe(false);
  });

  it('macOS: monotonic time stopped while the wall clock moved — sleep', () => {
    expect(
      isSleepTickGap({ prevWallMs: t0, wallMs: t0 + NAP_MS, prevMonoMs: 5000, monoMs: 6000, platform: 'darwin' }),
    ).toBe(true);
  });

  it('macOS: App Nap delayed the timer but the machine was awake — not sleep', () => {
    expect(
      isSleepTickGap({
        prevWallMs: t0,
        wallMs: t0 + 150 * 1000,
        prevMonoMs: 5000,
        monoMs: 5000 + 150 * 1000,
        platform: 'darwin',
      }),
    ).toBe(false);
  });

  it('allows for the timer cadence (60s checkpoint)', () => {
    const args = { prevWallMs: t0, intervalMs: 60 * 1000, platform: 'win32' };
    expect(isSleepTickGap({ ...args, wallMs: t0 + 100 * 1000 })).toBe(false);
    expect(isSleepTickGap({ ...args, wallMs: t0 + 130 * 1000 })).toBe(true);
  });

  it('first tick is never a gap', () => {
    expect(isSleepTickGap({ prevWallMs: 0, wallMs: t0, platform: 'win32' })).toBe(false);
  });
});

describe('awake clock', () => {
  it('records the nap window and returns the last pre-nap tick', () => {
    const g = {};
    const t0 = ms(LAST_TICK);
    noteAwakeTick({ g, wallMs: t0 - 1000, monoMs: 1000, platform: 'darwin' });
    expect(noteAwakeTick({ g, wallMs: t0, monoMs: 2000, platform: 'darwin' }).slept).toBe(false);

    const woke = noteAwakeTick({ g, wallMs: t0 + NAP_MS, monoMs: 2500, platform: 'darwin' });

    expect(woke).toEqual({ slept: true, lastAwakeMs: t0 });
    expect(g._lastSleepWindow).toEqual({ fromMs: t0, toMs: t0 + NAP_MS });
    expect(g._lastAwakeTickMs).toBe(t0 + NAP_MS);
  });

  it('a reset (new session) is not a gap', () => {
    const g = {};
    noteAwakeTick({ g, wallMs: 1000, monoMs: 1, platform: 'win32' });
    resetAwakeClock(g);
    expect(noteAwakeTick({ g, wallMs: 1000 + NAP_MS, monoMs: 2, platform: 'win32' }).slept).toBe(false);
  });
});

describe('latestAwakeProofMs', () => {
  const nowMs = ms(WAKE);

  it('takes the latest in-session mark (1s tick beats the 60s checkpoint)', () => {
    expect(latestAwakeProofMs({ candidates: [LAST_CP, ms(LAST_TICK)], sessionStart: START, nowMs })).toBe(
      ms(LAST_TICK),
    );
  });

  it('ignores a lid proof left from a nap before this Start', () => {
    expect(
      latestAwakeProofMs({ candidates: ['2026-10-14T08:30:00.000Z'], sessionStart: START, nowMs }),
    ).toBeNaN();
  });

  it('just woke: the nap start is the end, later ticks are wake time', () => {
    expect(
      latestAwakeProofMs({
        candidates: [ms(WAKE) + 4000, LAST_CP],
        sessionStart: START,
        sleepWindow: { fromMs: ms(LAST_TICK), toMs: ms(WAKE) },
        nowMs: ms(WAKE) + 5000,
      }),
    ).toBe(ms(LAST_TICK));
  });

  it('an old nap the session outlived does not erase the hours since', () => {
    const later = ms(WAKE) - 1000;
    expect(
      latestAwakeProofMs({
        candidates: [later],
        sessionStart: START,
        sleepWindow: { fromMs: ms('2026-10-14T10:00:00.000Z'), toMs: ms('2026-10-14T10:30:00.000Z') },
        nowMs,
      }),
    ).toBe(later);
  });
});

describe('durable sleep arm when suspend is delivered at wake', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    fs.mkdirSync(path.join(TMP, 'pending_sessions'), { recursive: true });
    clearGlobals();
    global.currentTimeLogId = SESSION_ID;
    global.currentUserId = 1223;
  });

  it('closes at the last awake tick — not wake, not the older checkpoint', () => {
    jest.setSystemTime(new Date(WAKE));
    global._lastAwakeTickMs = ms(LAST_TICK);
    const tm = makeTm();

    const end = tm.armDurableSleepStop('system_sleep');

    expect(end).toBe(LAST_TICK);
    expect(global._sleepSafeStopEndIso).toBe(LAST_TICK);
    // The checkpoint-only proof dropped 46.9s of real work before the lid closed.
    expect(ms(LAST_TICK) - ms(LAST_CP)).toBe(46900);
  });

  it('a stale lid proof from an earlier nap no longer closes this session at zero length', () => {
    jest.setSystemTime(new Date(WAKE));
    global._lidLastProofIso = '2026-10-14T08:30:00.000Z';
    const tm = makeTm();

    const end = tm.armDurableSleepStop('system_sleep');

    expect(end).toBe(LAST_CP);
    expect(ms(end)).toBeGreaterThan(ms(START));
  });

  it('prompt suspend (before the freeze) still ends at now', () => {
    const now = ms(LAST_TICK) + 500;
    jest.setSystemTime(new Date(now));
    global._lastAwakeTickMs = ms(LAST_TICK);
    const tm = makeTm();

    expect(tm.armDurableSleepStop('system_sleep')).toBe(new Date(now).toISOString());
  });

  it('after the tray caught the nap, a later tick never stretches the end', () => {
    jest.setSystemTime(new Date(ms(WAKE) + 5000));
    global._lastSleepWindow = { fromMs: ms(LAST_TICK), toMs: ms(WAKE) };
    global._lastAwakeTickMs = ms(WAKE) + 4000;
    const tm = makeTm();

    expect(tm.armDurableSleepStop('system_sleep')).toBe(LAST_TICK);
  });

  it("ignores another session's checkpoint", () => {
    jest.setSystemTime(new Date(WAKE));
    global._lastAwakeTickMs = ms('2026-10-14T08:59:00.000Z');
    const tm = makeTm({ checkpointAt: '2026-10-14T11:50:00.000Z', checkpointId: 'other-session' });

    expect(tm.armDurableSleepStop('system_sleep')).toBe(WAKE);
  });
});

describe('60s checkpoint firing late at wake', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    clearGlobals();
    global.currentTimeLogId = SESSION_ID;
  });

  function armedTm({ prevRunIso, prevMono, mono }) {
    const tm = makeTm();
    tm.noteMachineSlept = jest.fn(async () => ({ split: true }));
    tm._checkpointIntervalMs = 60 * 1000;
    tm._lastCheckpointRunMs = ms(prevRunIso);
    tm._lastCheckpointRunMono = prevMono;
    jest.spyOn(sleepClock, 'monotonicMs').mockReturnValue(mono);
    return tm;
  }

  it('does not stamp the nap as alive; closes at the last pre-nap tick', async () => {
    jest.setSystemTime(new Date(WAKE));
    global._lastAwakeTickMs = ms(LAST_TICK);
    const tm = armedTm({ prevRunIso: LAST_CP, prevMono: 1000, mono: 1000 + 47 * 1000 });

    await tm._checkpointCurrentTimeLog();

    expect(tm._storeSessionCheckpoint).not.toHaveBeenCalled();
    expect(tm.noteMachineSlept).toHaveBeenCalledWith(ms(LAST_TICK));
  });

  it('falls back to the previous checkpoint when no tick survived', async () => {
    jest.setSystemTime(new Date(WAKE));
    const tm = armedTm({ prevRunIso: LAST_CP, prevMono: 1000, mono: 1000 + 47 * 1000 });

    await tm._checkpointCurrentTimeLog();

    expect(tm.noteMachineSlept).toHaveBeenCalledWith(ms(LAST_CP));
  });

  it('on time: stamps as before', async () => {
    jest.setSystemTime(new Date(ms(LAST_CP) + 60 * 1000));
    const tm = armedTm({ prevRunIso: LAST_CP, prevMono: 1000, mono: 61 * 1000 });

    await tm._checkpointCurrentTimeLog();

    expect(tm._storeSessionCheckpoint).toHaveBeenCalledTimes(1);
    expect(tm.noteMachineSlept).not.toHaveBeenCalled();
  });

  it('macOS App Nap delay (awake): stamps, never stops real work', async () => {
    setPlatform('darwin');
    jest.setSystemTime(new Date(ms(LAST_CP) + 150 * 1000));
    const tm = armedTm({ prevRunIso: LAST_CP, prevMono: 1000, mono: 1000 + 150 * 1000 });

    await tm._checkpointCurrentTimeLog();

    expect(tm._storeSessionCheckpoint).toHaveBeenCalledTimes(1);
    expect(tm.noteMachineSlept).not.toHaveBeenCalled();
  });
});

describe('tray clock at wake', () => {
  const BASE = 3600;
  let elapsed;
  let tray;

  function makeTray() {
    const t = Object.create(TrayManager.prototype);
    t.tray = { isDestroyed: () => false, setTitle: () => {}, getTitle: () => '', setToolTip: () => {} };
    t._timerInterval = null;
    t._currentProjectName = 'Data Engineering';
    t._cumulativeBaseSeconds = BASE;
    t._trackingStartTime = new Date(START);
    t._maybeRolloverLocalDay = () => {};
    t._installWindowShowHooks = () => {};
    t._setTrackingIcon = () => {};
    t._setStoppedIcon = () => {};
    t._pushRendererTick = jest.fn();
    t._getSessionElapsedSeconds = () => elapsed.value;
    return t;
  }

  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      elapsed.value += 1;
      jest.advanceTimersByTime(1000);
    }
  };

  const freeze = () => {
    jest.setSystemTime(Date.now() + NAP_MS);
    elapsed.value += NAP_MS / 1000;
  };

  beforeEach(() => {
    setPlatform('win32');
    jest.useFakeTimers();
    jest.setSystemTime(new Date(ms(LAST_TICK) - 10 * 1000));
    clearGlobals();
    global.isTracking = true;
    global.currentTimeLogId = SESSION_ID;
    global.trackingManager = { noteMachineSlept: jest.fn(() => Promise.resolve({ split: true })) };
    elapsed = { value: 600 };
    tray = makeTray();
  });

  afterEach(() => {
    tray.stopTrayTimer();
  });

  it('never paints the nap or raises the high-water from it', () => {
    tray.startTrayTimer();
    tick(10);
    const before = global._trayTodayHighWaterSeconds;
    const lastAwake = Date.now();
    const paints = tray._pushRendererTick.mock.calls.length;

    freeze();
    tick(5);

    expect(global._trayTodayHighWaterSeconds).toBe(before);
    expect(tray._pushRendererTick.mock.calls.length).toBe(paints);
    expect(global.trackingManager.noteMachineSlept).toHaveBeenCalledTimes(1);
    expect(global.trackingManager.noteMachineSlept).toHaveBeenCalledWith(lastAwake);
  });

  it('a resume-handler restart in the same session keeps holding', () => {
    tray.startTrayTimer();
    tick(10);
    const before = global._trayTodayHighWaterSeconds;

    freeze();
    tray.startTrayTimer();
    tick(3);

    expect(global._trayTodayHighWaterSeconds).toBe(before);
    expect(global.trackingManager.noteMachineSlept).toHaveBeenCalledTimes(1);
  });

  it('the next session paints normally', () => {
    tray.startTrayTimer();
    tick(10);
    freeze();
    tick(1);
    tray.stopTrayTimer();

    global.currentTimeLogId = 'next-session';
    tray._trackingStartTime = new Date(Date.now());
    elapsed.value = 0;
    const paints = tray._pushRendererTick.mock.calls.length;
    tray.startTrayTimer();
    tick(3);

    expect(tray._pushRendererTick.mock.calls.length).toBeGreaterThan(paints);
  });

  it('ordinary ticks still advance', () => {
    tray.startTrayTimer();
    tick(10);
    const before = global._trayTodayHighWaterSeconds;
    tick(5);

    expect(global._trayTodayHighWaterSeconds).toBe(before + 5);
    expect(global.trackingManager.noteMachineSlept).not.toHaveBeenCalled();
  });
});

describe('stopped clock vs server (tray = Pulse)', () => {
  const clean = {
    timeLogsCount: 4,
    offlinePendingCount: 0,
    pendingCloseCount: 0,
    queueGenAtStart: 7,
    queueGenAtEnd: 7,
    graceUntilMs: 0,
    nowMs: 1_000_000,
  };

  it('a clean read after sync is settled', () => {
    expect(isSettledTodayRead(clean)).toBe(true);
  });

  it.each([
    ['backend fetch failed', { backendFetchFailed: true }],
    ['stop still running', { stopInProgress: true }],
    ['no rows from the server', { timeLogsCount: 0 }],
    ['offline rows not yet sent', { offlinePendingCount: 1 }],
    ['a close not yet on the server', { pendingCloseCount: 1 }],
    ['queue changed during the read', { queueGenAtEnd: 8 }],
    ['inside the post-sync grace', { graceUntilMs: 1_000_500 }],
  ])('not settled: %s', (_label, patch) => {
    expect(isSettledTodayRead({ ...clean, ...patch })).toBe(false);
  });

  it('unsettled: the Stop total holds above a lagging server (offline work kept)', () => {
    expect(resolveStoppedClockSeconds({ dbSeconds: 30000, stopFloorSeconds: 32000, capSeconds: 40000 })).toBe(32000);
  });

  it('settled: the server total wins, even below a phantom Stop floor', () => {
    expect(
      resolveStoppedClockSeconds({ dbSeconds: 32400, stopFloorSeconds: 39720, settled: true, capSeconds: 50000 }),
    ).toBe(32400);
  });

  it('never above the plausible cap', () => {
    expect(resolveStoppedClockSeconds({ dbSeconds: 90000, settled: true, capSeconds: 50000 })).toBe(50000);
  });

  it('sleep-stop hint is main\'s last-awake total, not a nap the renderer painted', () => {
    expect(resolveStopHintSeconds({ reason: 'system_sleep', frozenSeconds: 5859, liveHighSeconds: 7721 })).toBe(5859);
    expect(resolveStopHintSeconds({ reason: 'button', frozenSeconds: 5859, liveHighSeconds: 5861 })).toBe(5861);
    expect(resolveStopHintSeconds({ reason: 'manual', frozenSeconds: 15548, liveHighSeconds: 16028 })).toBe(15548);
    expect(
      resolveStopHintSeconds({ reason: 'idle_timeout', frozenSeconds: 0, liveHighSeconds: 5000, cutSeconds: 600 }),
    ).toBe(4400);
  });
});

describe('settled reconcile', () => {
  let g;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(WAKE));
    g = {
      mainWindow: { isDestroyed: () => false, webContents: { send: jest.fn() } },
    };
  });

  it('re-reads once the post-sync grace has passed', () => {
    g._postOfflineSyncGraceUntil = Date.now() + 90 * 1000;
    scheduleSettledReconcile({ g });

    jest.advanceTimersByTime(30 * 1000);
    expect(g.mainWindow.webContents.send).not.toHaveBeenCalled();

    jest.advanceTimersByTime(61 * 1000);
    expect(g.mainWindow.webContents.send).toHaveBeenCalledTimes(1);
    expect(g.mainWindow.webContents.send).toHaveBeenCalledWith('today-stats-settle', {
      reason: 'settled-reconcile',
    });
  });

  it('debounces bursts into one read', () => {
    scheduleSettledReconcile({ g });
    scheduleSettledReconcile({ g });
    jest.advanceTimersByTime(5000);

    expect(g.mainWindow.webContents.send).toHaveBeenCalledTimes(1);
  });

  it('skips while tracking (the live clock owns the display)', () => {
    g.isTracking = true;
    scheduleSettledReconcile({ g });
    jest.advanceTimersByTime(5000);

    expect(g.mainWindow.webContents.send).not.toHaveBeenCalled();
  });

  it('waits out a grace extended by a second sync', () => {
    scheduleSettledReconcile({ g });
    g._postOfflineSyncGraceUntil = Date.now() + 10 * 1000;
    jest.advanceTimersByTime(4000);
    expect(g.mainWindow.webContents.send).not.toHaveBeenCalled();

    jest.advanceTimersByTime(10 * 1000);
    expect(g.mainWindow.webContents.send).toHaveBeenCalledTimes(1);
  });
});
