/**
 * Lid-close / sleep must stop the clock at the last awake moment.
 *
 * Om 14 Oct (12df1b86): Windows delivered suspend at wake, 31m after the lid
 * closed. The Stop snapshot measured to wake-time now (7721s instead of
 * 5859s), the next Start kept it via Math.max, and four naps put 2h02m on the
 * tray (11.0h vs Pulse 9.0h). The global Stop also replaced the sleep-safe
 * end with now, so an online close would have billed the nap.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), 'alyson-sleep-stop-billing');
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
    app: { getPath: () => require('path').join(require('os').tmpdir(), 'alyson-sleep-stop-billing') },
    net: { isOnline: () => false },
  }),
  { virtual: true },
);

const gsm = require('../graceful-shutdown-manager');
const TrackingManager = require('../tracking-manager');
const {
  STOP_END_MAX_AGE_MS,
  hasSleepSafeStopEnd,
  resetStopEndOverride,
  resolveStopEndMs,
} = require('../../utils/sleep-aware-elapsed');
const { elapsedSecondsSinceLocalMidnight } = require('../../utils/today-time-log-stats');
const { setWorkTimezone, getWorkTimezone } = require('../../utils/work-timezone');

const SESSION_ID = '12df1b86-5763-4616-b10d-23f9b9c77286';
const START = '2026-10-14T09:53:57.456Z';
const PROOF = '2026-10-14T11:28:52.431Z';
const WAKE = '2026-10-14T11:59:53.913Z';
const BASE = 165;

const ms = (iso) => new Date(iso).getTime();
const iso = (value) => new Date(value).toISOString();
const span = (a, b) => Math.floor((ms(b) - ms(a)) / 1000);

const GLOBALS = [
  '_stopEndTimeOverride',
  '_sleepSafeStopEndIso',
  '_stopAuthorizedIdleCut',
  '_idlePromptTimeCutSeconds',
  '_lidLastProofIso',
  '_lastWakeAtMs',
  '_lastTodayTotalAtStop',
  '_rendererTodayFloorSeconds',
  '_lastGoodTodayStats',
  '_sleepSplitInProgress',
  '_lastSleepSplitAt',
  '_lidDownArmed',
  '_startAfterSleep',
  'currentTimeLogId',
  'currentUserId',
  'trackingManager',
  'trayManager',
  'mainWindow',
  'isTracking',
  'isQuitting',
  'sessionStartTime',
];

function setNow(value) {
  jest.setSystemTime(new Date(value));
}

function makeTm({ timeLogId = SESSION_ID, start = START, proof = PROOF } = {}) {
  const tm = Object.create(TrackingManager.prototype);
  tm.config = { user_id: 1223 };
  tm.queue = [];
  tm.isTracking = true;
  tm.currentTimeLogId = timeLogId;
  tm.sessionStartTime = start;
  tm.currentProjectId = null;
  tm.currentSession = { start_time: start };
  tm.getOfflineQueue = () => tm.queue.slice();
  tm._persistOfflineQueueOrThrow = (next) => {
    tm.queue = next.slice();
  };
  tm._appendTimeLedger = () => {};
  tm.startOfflineSync = jest.fn();
  tm._stopTimeLogCheckpoint = () => {};
  tm._storeSessionCheckpoint = () => {};
  tm._storePendingSessionClose = () => {};
  tm._readSessionCheckpoint = () => ({ timeLogId, startTime: start, checkpointAt: proof });
  return tm;
}

/** The lid-close order on Windows: arm, capture, then global stopTracking. */
function sleepStopAtWake(tm) {
  tm.armDurableSleepStop('system_sleep');
  gsm.captureStopMoment();
  // main.js global.stopTracking (non idle-cut branch)
  resetStopEndOverride();
  gsm.captureStopMoment();
  return global._lastTodayTotalAtStop;
}

describe('sleep stop bills the last awake moment, not wake-time now', () => {
  const previousTz = getWorkTimezone();

  beforeAll(() => setWorkTimezone('America/Chicago'));
  afterAll(() => setWorkTimezone(previousTz));

  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
      ],
    });
    setNow(WAKE);
    fs.mkdirSync(path.join(TMP, 'pending_sessions'), { recursive: true });
    for (const key of GLOBALS) delete global[key];
    global.currentTimeLogId = SESSION_ID;
    global.currentUserId = 1223;
    global.trayManager = { _cumulativeBaseSeconds: BASE };
    global._lidLastProofIso = PROOF;
    global.trackingManager = makeTm();
  });

  afterEach(() => {
    jest.useRealTimers();
    for (const key of GLOBALS) delete global[key];
    try {
      fs.rmSync(TMP, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  });

  describe('resolveStopEndMs', () => {
    const nowMs = ms(WAKE);

    it('keeps a fresh Stop moment', () => {
      const click = nowMs - 2000;
      expect(resolveStopEndMs({ frozenEnd: click, sessionStart: START, nowMs })).toBe(click);
    });

    it('drops an old capture unless it is a sleep mark', () => {
      expect(resolveStopEndMs({ frozenEnd: PROOF, sessionStart: START, nowMs })).toBe(nowMs);
      expect(
        resolveStopEndMs({ frozenEnd: PROOF, sessionStart: START, nowMs, sleepSafe: true }),
      ).toBe(ms(PROOF));
      expect(nowMs - ms(PROOF)).toBeGreaterThan(STOP_END_MAX_AGE_MS);
    });

    it('never uses a mark from before this session or from the future', () => {
      const earlier = ms(START) - 60 * 1000;
      expect(
        resolveStopEndMs({ frozenEnd: earlier, sessionStart: START, nowMs, sleepSafe: true }),
      ).toBe(nowMs);
      expect(
        resolveStopEndMs({ frozenEnd: nowMs + 1000, sessionStart: START, nowMs, sleepSafe: true }),
      ).toBe(nowMs);
    });

    it('a sleep mark only counts while it is still the pending override', () => {
      global._sleepSafeStopEndIso = PROOF;
      global._stopEndTimeOverride = PROOF;
      expect(hasSleepSafeStopEnd()).toBe(true);
      global._stopEndTimeOverride = iso(nowMs);
      expect(hasSleepSafeStopEnd()).toBe(false);
      global._stopEndTimeOverride = null;
      expect(hasSleepSafeStopEnd()).toBe(false);
    });

    it('a wake after the measured end does not shrink the span', () => {
      global._lastWakeAtMs = ms(WAKE);
      expect(elapsedSecondsSinceLocalMidnight(START, ms(PROOF))).toBe(span(START, PROOF));
      expect(elapsedSecondsSinceLocalMidnight(START, ms(WAKE))).toBe(0);
    });
  });

  describe('Om 14 Oct replay (suspend delivered 31m late)', () => {
    it('Stop snapshot is 5859s (shown clock), not 7721s', () => {
      const total = sleepStopAtWake(global.trackingManager);
      expect(global._stopEndTimeOverride).toBe(PROOF);
      expect(total).toBe(BASE + span(START, PROOF));
      expect(total).toBe(5859);
    });

    it('old path for contrast: without the sleep mark it measured the nap', () => {
      global.trackingManager.armDurableSleepStop('system_sleep');
      delete global._sleepSafeStopEndIso;
      gsm.captureStopMoment();
      expect(global._lastTodayTotalAtStop).toBe(7721);
    });

    it('next Start keeps 5859s as the closed base after sleep', () => {
      const tm = global.trackingManager;
      const total = sleepStopAtWake(tm);
      global._rendererTodayFloorSeconds = total;
      global._lastGoodTodayStats = { completedTodayBeforeCurrentSessionSeconds: BASE };
      expect(tm._resolveStartClosedBaseSeconds(true)).toBe(5859);
    });

    it('DB close and pending close use 11:28:52, not the wake time', async () => {
      const tm = global.trackingManager;
      tm._queueOfflineTimeLogUpdate = TrackingManager.prototype._queueOfflineTimeLogUpdate;
      tm._saferQueuedClosePayload = TrackingManager.prototype._saferQueuedClosePayload;
      gsm._capturedTimeLogId = SESSION_ID;
      gsm._capturedSessionMeta = { start_time: START, user_id: 1223, project_id: null };

      sleepStopAtWake(tm);
      const ok = await gsm._updateDatabase('system_sleep');

      expect(ok).toBe(true);
      const pending = JSON.parse(
        fs.readFileSync(path.join(TMP, 'pending_sessions', `${SESSION_ID}.json`), 'utf8'),
      );
      expect(pending.endTime).toBe(PROOF);
      expect(tm.queue).toHaveLength(1);
      expect(tm.queue[0].data.end_time).toBe(PROOF);
      expect(tm.queue[0].data.frozen_end).toBe(true);
      expect(global._lastExplicitStopEndIso).toBe(PROOF);
      expect(global._stopEndTimeOverride).toBeNull();
    });

    it('a stale override (no sleep mark) still bills now — existing guard kept', async () => {
      const tm = global.trackingManager;
      tm._queueOfflineTimeLogUpdate = TrackingManager.prototype._queueOfflineTimeLogUpdate;
      tm._saferQueuedClosePayload = TrackingManager.prototype._saferQueuedClosePayload;
      gsm._capturedTimeLogId = SESSION_ID;
      gsm._capturedSessionMeta = { start_time: START, user_id: 1223, project_id: null };
      global._stopEndTimeOverride = PROOF;

      await gsm._updateDatabase('manual');

      expect(tm.queue[0].data.end_time).toBe(iso(ms(WAKE)));
    });

    it('a leftover override from an earlier session does not displace the proof', () => {
      global._stopEndTimeOverride = iso(ms(START) - 3600 * 1000);
      expect(global.trackingManager.armDurableSleepStop('system_sleep')).toBe(PROOF);
      expect(global._stopEndTimeOverride).toBe(PROOF);
      expect(hasSleepSafeStopEnd()).toBe(true);
    });

    it('a Stop click just before the lid closed still wins', () => {
      const click = iso(ms(PROOF) - 5000);
      global._stopEndTimeOverride = click;
      global.trackingManager.armDurableSleepStop('system_sleep');
      expect(global._stopEndTimeOverride).toBe(click);
      expect(hasSleepSafeStopEnd()).toBe(true);
    });
  });

  describe('four naps in one day (31, 54, 10, 27 minutes)', () => {
    const NAPS_MIN = [31, 54, 10, 27];
    const AWAKE_MIN = 40;

    function buildDay() {
      const sessions = [{ start: START, proof: PROOF, wake: WAKE }];
      for (let i = 1; i < NAPS_MIN.length; i += 1) {
        const start = iso(ms(sessions[i - 1].wake) + 20 * 1000);
        const proof = iso(ms(start) + AWAKE_MIN * 60 * 1000);
        const wake = iso(ms(proof) + NAPS_MIN[i] * 60 * 1000);
        sessions.push({ start, proof, wake });
      }
      return sessions;
    }

    function runDay({ sleepSafe }) {
      let base = BASE;
      let billed = BASE;
      for (const [i, s] of buildDay().entries()) {
        setNow(s.wake);
        const id = `00000000-0000-4000-8000-00000000000${i}`;
        const tm = makeTm({ timeLogId: id, start: s.start, proof: s.proof });
        global.trackingManager = tm;
        global.currentTimeLogId = id;
        global.trayManager = { _cumulativeBaseSeconds: base };
        global._lidLastProofIso = s.proof;
        global._stopEndTimeOverride = null;

        tm.armDurableSleepStop('system_sleep');
        if (!sleepSafe) delete global._sleepSafeStopEndIso;
        resetStopEndOverride();
        gsm.captureStopMoment();
        const snapshot = global._lastTodayTotalAtStop;
        billed += span(s.start, s.proof);

        global._stopEndTimeOverride = null;
        global._rendererTodayFloorSeconds = snapshot;
        global._lastGoodTodayStats = { completedTodayBeforeCurrentSessionSeconds: billed };
        base = tm._resolveStartClosedBaseSeconds(true);
      }
      return { tray: base, billed };
    }

    it('tray equals billed awake time', () => {
      const { tray, billed } = runDay({ sleepSafe: true });
      expect(tray).toBe(billed);
    });

    it('old path for contrast: wall-clock stops added the naps (~2h02m)', () => {
      const { tray, billed } = runDay({ sleepSafe: false });
      const extraMin = (tray - billed) / 60;
      const napMin = (ms(WAKE) - ms(PROOF)) / 60000 + NAPS_MIN.slice(1).reduce((a, b) => a + b, 0);
      expect(extraMin).toBeCloseTo(napMin, 0);
      expect(napMin).toBeGreaterThan(121);
    });
  });

  describe('idle-monitor freeze path (noteMachineSlept)', () => {
    it('measures to the last awake moment even though wake was set first', async () => {
      const tm = global.trackingManager;
      tm.stopTracking = jest.fn(async () => {
        gsm.captureStopMoment();
        return { success: true };
      });
      global._lastWakeAtMs = ms(WAKE);
      global.isTracking = true;

      const result = await tm.noteMachineSlept(ms(PROOF));

      expect(result).toEqual({ split: true });
      expect(global._stopEndTimeOverride).toBe(PROOF);
      expect(hasSleepSafeStopEnd()).toBe(true);
      expect(global._lastTodayTotalAtStop).toBe(BASE + span(START, PROOF));
    });
  });

  describe('non-sleep stops unchanged', () => {
    it('button Stop measures to the click', () => {
      const click = iso(ms(WAKE) - 1500);
      global._stopEndTimeOverride = click;
      gsm.captureStopMoment();
      expect(global._lastTodayTotalAtStop).toBe(BASE + span(START, click));
    });

    it('idle-alert cut is subtracted once, in the renderer notification', () => {
      const cut = 600;
      global._stopAuthorizedIdleCut = true;
      global._idlePromptTimeCutSeconds = cut;
      global._stopEndTimeOverride = iso(ms(WAKE) - cut * 1000);
      const send = jest.fn();
      global.mainWindow = { isDestroyed: () => false, webContents: { send } };

      gsm.captureStopMoment();
      expect(global._lastTodayTotalAtStop).toBe(BASE + span(START, WAKE));

      gsm._notifyRenderer('idle_timeout');
      const payload = send.mock.calls.find(([channel]) => channel === 'tracking-stopped')[1];
      expect(payload.frozenTotalSeconds).toBe(BASE + span(START, WAKE) - cut);
    });
  });
});
