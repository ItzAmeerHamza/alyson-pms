/**
 * Start / Stop / app-close / lid-close — recorded time must not inflate or shrink.
 *
 * Painted clock (tray/UI) and billed seconds (merged time_logs) must stay equal
 * to the legitimate Start→Stop spans. Sleep, leftovers, and quit must not add
 * or drop hours.
 */

const {
  setWorkTimezone,
  getWorkTimezone,
  startOfWorkDay,
  workDateKey,
  elapsedSecondsSinceWorkMidnight,
} = require('../work-timezone');
const { mergeIntervalsSeconds } = require('../today-time-log-stats');
const {
  sleepSafeEndIso,
  elapsedSecondsExcludingSleep,
  closedBaseAfterSleep,
  isPhantomStoppedTotal,
} = require('../sleep-aware-elapsed');
const EventHandlerManager = require('../event-handler-manager');

jest.mock('../session-recovery', () => ({
  closeOpenSessionsAfterExplicitStop: jest.fn(async () => ({ closed: 0 })),
  reconcileAfterWake: jest.fn(async () => ({ ok: true })),
}));

const TrackingManager = require('../../core/tracking-manager');

const previousTz = getWorkTimezone();

function ms(iso) {
  return new Date(iso).getTime();
}

function spanSeconds(startIso, endIso) {
  return Math.max(0, Math.floor((ms(endIso) - ms(startIso)) / 1000));
}

/** Pulse / desktop billed total: merge overlapping closed intervals. */
function billedSeconds(rows, dayRef = new Date(rows[0]?.start_time || Date.now())) {
  const { endOfWorkDayExclusive } = require('../work-timezone');
  const dayStart = startOfWorkDay(dayRef).getTime();
  const endExclusive = endOfWorkDayExclusive(dayRef).getTime();
  const intervals = [];
  for (const row of rows) {
    if (!row.start_time || !row.end_time) continue;
    const startMs = Math.max(ms(row.start_time), dayStart);
    const endMs = Math.min(ms(row.end_time), endExclusive);
    if (endMs > startMs) intervals.push({ startMs, endMs });
  }
  return mergeIntervalsSeconds(intervals);
}

function paintedToday({ closedDbSeconds, sessionStart, nowMs, lastWakeMs = 0 }) {
  const closed = closedBaseAfterSleep(closedDbSeconds);
  const live = sessionStart
    ? elapsedSecondsExcludingSleep(sessionStart, nowMs, lastWakeMs)
    : 0;
  return closed + live;
}

describe('recorded time across Start / Stop / close', () => {
  beforeAll(() => setWorkTimezone('America/Chicago'));
  afterAll(() => setWorkTimezone(previousTz));

  describe('Start then Stop — clock equals billed, no extra seconds', () => {
    it('one session: painted = end − start', () => {
      const start = '2026-08-25T14:00:00.000Z'; // 09:00 CDT
      const end = '2026-08-25T14:15:00.000Z'; // 09:15 CDT
      const billed = billedSeconds([{ start_time: start, end_time: end }]);
      const painted = paintedToday({
        closedDbSeconds: billed,
        sessionStart: null,
        nowMs: ms(end),
      });
      expect(billed).toBe(15 * 60);
      expect(painted).toBe(15 * 60);
    });

    it('stop then start then stop: totals add, they do not max or overlap', () => {
      const rows = [
        { start_time: '2026-08-25T14:00:00.000Z', end_time: '2026-08-25T15:00:00.000Z' },
        { start_time: '2026-08-25T15:10:00.000Z', end_time: '2026-08-25T15:40:00.000Z' },
      ];
      expect(billedSeconds(rows)).toBe(90 * 60);
      expect(spanSeconds(rows[0].start_time, rows[0].end_time)).toBe(3600);
      expect(spanSeconds(rows[1].start_time, rows[1].end_time)).toBe(1800);
    });

    it('a 30s click inside a longer session does not add 30s (merge, not sum)', () => {
      const rows = [
        { start_time: '2026-08-24T17:31:55.000Z', end_time: '2026-08-24T20:00:00.000Z' },
        { start_time: '2026-08-24T18:45:00.000Z', end_time: '2026-08-24T18:45:30.000Z' },
      ];
      const rawSum =
        spanSeconds(rows[0].start_time, rows[0].end_time) +
        spanSeconds(rows[1].start_time, rows[1].end_time);
      const billed = billedSeconds(rows, new Date(rows[0].start_time));
      expect(rawSum).toBe(spanSeconds(rows[0].start_time, rows[0].end_time) + 30);
      expect(billed).toBe(spanSeconds(rows[0].start_time, rows[0].end_time));
    });
  });

  describe('Stop leftover must not inflate the next Start', () => {
    it('tray high-water 8h55 must snap to DB 7h22, not become the next base', () => {
      const dbClosed = 26548; // 7h 22m — Garima Aug 24
      const leftoverPaint = 32124; // 8h 55m leftover
      expect(isPhantomStoppedTotal(leftoverPaint, dbClosed, true)).toBe(true);
      expect(closedBaseAfterSleep(dbClosed)).toBe(dbClosed);
      expect(closedBaseAfterSleep(dbClosed) + 0).toBeLessThan(leftoverPaint);
    });

    it('Start after Stop uses DB closed base + new live elapsed only', () => {
      const dbClosed = 4 * 3600;
      const start = '2026-08-25T16:00:00.000Z';
      const now = ms(start) + 4 * 60 * 1000;
      const painted = paintedToday({
        closedDbSeconds: dbClosed,
        sessionStart: start,
        nowMs: now,
      });
      expect(painted).toBe(4 * 3600 + 4 * 60);
    });

    it('overnight leftover 3h vs empty DB is discarded (Month blink / Start seed)', () => {
      expect(isPhantomStoppedTotal(3 * 3600 + 120, 0, true)).toBe(true);
      expect(paintedToday({ closedDbSeconds: 0, sessionStart: null, nowMs: Date.now() })).toBe(0);
    });
  });

  describe('App quit / close', () => {
    it('quit while tracking closes at last proof, not a later crash NOW', () => {
      const start = '2026-08-25T14:00:00.000Z';
      const lastProof = '2026-08-25T16:00:00.000Z';
      const quitMuchLater = '2026-08-25T22:00:00.000Z';
      const end = sleepSafeEndIso({
        lastCheckpointAt: lastProof,
        checkpointTimeLogId: 'row-1',
        timeLogId: 'row-1',
        nowIso: quitMuchLater,
      });
      expect(end).toBe(new Date(lastProof).toISOString());
      expect(billedSeconds([{ start_time: start, end_time: end }])).toBe(2 * 3600);
    });

    it('quit a few seconds after last checkpoint still uses NOW (live close)', () => {
      const lastProof = '2026-08-25T16:00:00.000Z';
      const quit = '2026-08-25T16:00:08.000Z';
      expect(
        sleepSafeEndIso({
          lastCheckpointAt: lastProof,
          checkpointTimeLogId: 'row-1',
          timeLogId: 'row-1',
          nowIso: quit,
        }),
      ).toBe(quit);
    });

    it('quit while already Stopped adds no row and paints DB only', () => {
      const rows = [
        { start_time: '2026-08-25T14:00:00.000Z', end_time: '2026-08-25T15:00:00.000Z' },
      ];
      expect(billedSeconds(rows)).toBe(3600);
      expect(
        paintedToday({
          closedDbSeconds: 3600,
          sessionStart: null,
          nowMs: ms('2026-08-25T20:00:00.000Z'),
        }),
      ).toBe(3600);
    });

    it('reopen same Chicago day restores closed total, not wall-clock since midnight', () => {
      const rows = [
        { start_time: '2026-08-25T14:00:00.000Z', end_time: '2026-08-25T16:30:00.000Z' },
      ];
      const reopen = ms('2026-08-25T20:00:00.000Z'); // 15:00 CDT
      const sinceMidnight = elapsedSecondsSinceWorkMidnight(
        startOfWorkDay(new Date(reopen)).toISOString(),
        reopen,
      );
      const billed = billedSeconds(rows, new Date(reopen));
      expect(billed).toBe(2.5 * 3600);
      expect(sinceMidnight).toBeGreaterThan(billed);
      expect(
        paintedToday({ closedDbSeconds: billed, sessionStart: null, nowMs: reopen }),
      ).toBe(billed);
    });
  });

  describe('Lid close / sleep', () => {
    const start = '2026-08-24T17:31:55.890Z';
    const lastAlive = '2026-08-24T18:24:54.783Z';
    const wake = '2026-08-24T19:24:54.136Z';

    it('lid-down hour is not billed', () => {
      const end = sleepSafeEndIso({
        lastCheckpointAt: lastAlive,
        checkpointTimeLogId: 's3',
        timeLogId: 's3',
        nowIso: wake,
      });
      const billed = spanSeconds(start, end);
      const wall = spanSeconds(start, wake);
      expect(billed).toBeLessThan(wall);
      expect(wall - billed).toBeGreaterThan(50 * 60);
    });

    it('wake Start does not add leftover + new session (8:21 bug)', () => {
      const priorClosed = 17718; // 4:55
      const wakeMs = ms(wake);
      const after = wakeMs + (1 * 3600 + 53 * 60) * 1000;
      const painted = paintedToday({
        closedDbSeconds: priorClosed,
        sessionStart: start,
        nowMs: after,
        lastWakeMs: wakeMs,
      });
      const inflated = priorClosed + Math.floor((after - ms(start)) / 1000);
      expect(painted).toBe(priorClosed + (1 * 3600 + 53 * 60));
      expect(inflated).toBeGreaterThan(painted);
    });

    it('lid close while Stopped still halts leftover processes and does not auto-resume', () => {
      const halt = jest.fn();
      const stopTracking = jest.fn();
      const mgr = new EventHandlerManager({
        global: {
          isTracking: false,
          currentTimeLogId: null,
          trackingManager: { haltBackgroundProcesses: halt },
          trayManager: { onSystemSleep: jest.fn() },
          stopTracking,
        },
        console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        antiCheatDetector: { stopMonitoring: jest.fn() },
      });
      global._resumeTrackingAfterWake = { projectId: 99 };
      mgr.handleLidCloseOrSleep('display-sleep');
      expect(halt).toHaveBeenCalled();
      expect(stopTracking).not.toHaveBeenCalled();
      expect(global._resumeTrackingAfterWake).toBeNull();
    });
  });

  describe('Chicago midnight reset', () => {
    it('clock elapsed on the new day starts at 0, not leftover from yesterday', () => {
      const justAfter = ms('2026-08-26T05:00:30.000Z'); // 00:00:30 CDT
      const yesterdayStart = '2026-08-25T14:00:00.000Z';
      const todayElapsed = elapsedSecondsSinceWorkMidnight(yesterdayStart, justAfter);
      expect(todayElapsed).toBe(30);
      expect(workDateKey(new Date(justAfter), 'America/Chicago')).toBe('2026-08-26');
    });

    it('yesterday closed rows do not move onto today after rollover', () => {
      const yesterday = [
        { start_time: '2026-08-25T14:00:00.000Z', end_time: '2026-08-25T22:00:00.000Z' },
      ];
      const todayRef = new Date('2026-08-26T14:00:00.000Z');
      expect(billedSeconds(yesterday, todayRef)).toBe(0);
      expect(billedSeconds(yesterday, new Date(yesterday[0].start_time))).toBe(8 * 3600);
    });
  });

  describe('Start must not open a second live session', () => {
    it('concurrent Starts share one create', async () => {
      const tm = Object.create(TrackingManager.prototype);
      tm._startInFlight = null;
      let created = 0;
      tm._startTrackingInner = async () => {
        created += 1;
        await new Promise((r) => setTimeout(r, 15));
        return { success: true, timeLogId: `log-${created}` };
      };
      const results = await Promise.all([tm.startTracking(), tm.startTracking()]);
      expect(created).toBe(1);
      expect(results[0].timeLogId).toBe(results[1].timeLogId);
    });

    it('Start stamp never backdates into the session Stop just closed', () => {
      const tm = Object.create(TrackingManager.prototype);
      const now = Date.now();
      const click = now - 5000;
      global._lastStopEndAtMs = now - 2000;
      expect(tm._resolveStartStampMs(click)).toBe(now - 2000);
      delete global._lastStopEndAtMs;
    });

    it('offline overlap clamp never double-bills and keeps the outer tail', () => {
      const tm = Object.create(TrackingManager.prototype);
      const queue = [
        {
          type: 'create_time_log',
          data: {
            id: 'a',
            start_time: '2026-08-25T14:00:00.000Z',
            end_time: '2026-08-25T17:00:00.000Z',
            status: 'completed',
          },
        },
        {
          type: 'create_time_log',
          data: {
            id: 'b',
            start_time: '2026-08-25T15:00:00.000Z',
            end_time: '2026-08-25T16:00:00.000Z',
            status: 'completed',
          },
        },
      ];
      tm._clampOverlappingQueuedSessions(queue);
      const rows = queue.map((q) => q.data);
      const billed = billedSeconds(rows, new Date(rows[0].start_time));
      expect(billed).toBe(3 * 3600);
      for (let i = 0; i < rows.length - 1; i += 1) {
        expect(new Date(rows[i].end_time).getTime()).toBeLessThanOrEqual(
          new Date(rows[i + 1].start_time).getTime(),
        );
      }
    });
  });
});
