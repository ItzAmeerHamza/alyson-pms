/**
 * Desktop-app lifecycle: lid close/open, 10-day stay-open, offline resync,
 * and Start/Stop with no lost or invented time.
 *
 * These exercise the same modules the Electron app uses. A live 10-day or
 * multi-hour offline run is not possible in CI; time is simulated.
 */

jest.mock('../backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  isLikelyOffline: jest.fn(() => true),
  createTimeLog: jest.fn(async (row) => ({ id: row.id, ...row })),
  updateTimeLog: jest.fn(async (id, updates) => ({ id, ...updates })),
}));

jest.mock('../session-recovery', () => ({
  closeOpenSessionsAfterExplicitStop: jest.fn(async () => ({ closed: 0 })),
  reconcileAfterWake: jest.fn(async () => ({ ok: true })),
  markUserExplicitlyStopped: jest.fn(),
  clearUserExplicitlyStopped: jest.fn(),
}));

jest.mock('electron', () => ({
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  net: { isOnline: () => true },
}));

const {
  setWorkTimezone,
  getWorkTimezone,
  startOfWorkDay,
  endOfWorkDayExclusive,
  workDateKey,
  secondsWithinWorkDay,
} = require('../work-timezone');
const { mergeIntervalsSeconds } = require('../today-time-log-stats');
const {
  sleepSafeEndIso,
  elapsedSecondsExcludingSleep,
  closedBaseAfterSleep,
} = require('../sleep-aware-elapsed');
const EventHandlerManager = require('../event-handler-manager');
const TrackingManager = require('../../core/tracking-manager');
const TrayManager = require('../../ui/tray-manager');
const backendTimeLogs = require('../backend-time-logs');

const previousTz = getWorkTimezone();

function billedOnDay(rows, dayRef) {
  const dayStart = startOfWorkDay(dayRef).getTime();
  const dayEnd = endOfWorkDayExclusive(dayRef).getTime();
  const intervals = [];
  for (const row of rows) {
    if (!row.start_time || !row.end_time) continue;
    const startMs = Math.max(new Date(row.start_time).getTime(), dayStart);
    const endMs = Math.min(new Date(row.end_time).getTime(), dayEnd);
    if (endMs > startMs) intervals.push({ startMs, endMs });
  }
  return mergeIntervalsSeconds(intervals);
}

/** Health-check midnight split: close at day end, new row from midnight. */
function splitAtChicagoMidnight(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const rows = [];
  let cursor = start;
  while (workDateKey(cursor) !== workDateKey(end) && cursor < end) {
    const boundary = endOfWorkDayExclusive(cursor);
    rows.push({
      start_time: cursor.toISOString(),
      end_time: boundary.toISOString(),
    });
    cursor = boundary;
  }
  rows.push({ start_time: cursor.toISOString(), end_time: end.toISOString() });
  return rows;
}

describe('desktop app lifecycle', () => {
  beforeAll(() => setWorkTimezone('America/Chicago'));
  afterAll(() => setWorkTimezone(previousTz));

  describe('lid close / lid open', () => {
    const start = '2026-08-24T17:31:55.890Z';
    const lastAlive = '2026-08-24T18:24:54.783Z';
    const wake = '2026-08-24T19:24:54.136Z';

    it('lid close while tracking: stop at last proof, halt leftover, no auto-resume', () => {
      const halt = jest.fn();
      const stopTracking = jest.fn();
      const mgr = new EventHandlerManager({
        global: {
          isTracking: true,
          currentTimeLogId: 'live-row',
          trackingManager: {
            isTracking: true,
            currentTimeLogId: 'live-row',
            haltBackgroundProcesses: halt,
            armDurableSleepStop: jest.fn(),
            _readSessionCheckpoint: () => ({
              checkpointAt: lastAlive,
              timeLogId: 'live-row',
            }),
          },
          trayManager: { onSystemSleep: jest.fn() },
          stopTracking,
        },
        console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        antiCheatDetector: { stopMonitoring: jest.fn() },
      });
      global._resumeTrackingAfterWake = { projectId: 1 };

      mgr.handleLidCloseOrSleep('display-sleep');

      expect(stopTracking).toHaveBeenCalledWith('system_sleep');
      expect(halt).toHaveBeenCalled();
      expect(global._resumeTrackingAfterWake).toBeNull();
      expect(
        sleepSafeEndIso({
          lastCheckpointAt: lastAlive,
          checkpointTimeLogId: 'live-row',
          timeLogId: 'live-row',
          nowIso: wake,
        }),
      ).toBe(new Date(lastAlive).toISOString());
    });

    it('lid open: nap is not billed; next Start is time since wake only', () => {
      const end = sleepSafeEndIso({
        lastCheckpointAt: lastAlive,
        checkpointTimeLogId: 's3',
        timeLogId: 's3',
        nowIso: wake,
      });
      const billedBeforeWake = Math.floor(
        (new Date(end).getTime() - new Date(start).getTime()) / 1000,
      );
      const wall = Math.floor((new Date(wake).getTime() - new Date(start).getTime()) / 1000);
      expect(wall - billedBeforeWake).toBeGreaterThan(50 * 60);

      const afterStart = new Date(wake).getTime() + 4 * 60 * 1000;
      const live = elapsedSecondsExcludingSleep(start, afterStart, new Date(wake).getTime());
      expect(live).toBe(4 * 60);
      expect(closedBaseAfterSleep(billedBeforeWake) + live).toBe(billedBeforeWake + 4 * 60);
    });

    it('lid close while already Stopped does not invent time', () => {
      const halt = jest.fn();
      const stopTracking = jest.fn();
      const mgr = new EventHandlerManager({
        global: {
          isTracking: false,
          trackingManager: { haltBackgroundProcesses: halt },
          trayManager: { onSystemSleep: jest.fn() },
          stopTracking,
        },
        console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        antiCheatDetector: { stopMonitoring: jest.fn() },
      });
      mgr.handleLidCloseOrSleep('suspend');
      expect(halt).toHaveBeenCalled();
      expect(stopTracking).not.toHaveBeenCalled();
    });
  });

  describe('app stays open 10 days — each Chicago day keeps its own hours', () => {
    it('Start/Stop each day, process never quit: day N clock is only day N', () => {
      const rows = [];
      for (let day = 1; day <= 10; day += 1) {
        const ymd = `2026-08-${String(day).padStart(2, '0')}`;
        // 09:00–17:00 CDT = 14:00–22:00Z in August (CDT)
        rows.push({
          start_time: `${ymd}T14:00:00.000Z`,
          end_time: `${ymd}T22:00:00.000Z`,
        });
      }

      for (let day = 1; day <= 10; day += 1) {
        const ref = new Date(`2026-08-${String(day).padStart(2, '0')}T18:00:00.000Z`);
        expect(billedOnDay(rows, ref)).toBe(8 * 3600);
      }

      const day10 = new Date('2026-08-10T18:00:00.000Z');
      const day1 = new Date('2026-08-01T18:00:00.000Z');
      expect(billedOnDay(rows, day10)).not.toBe(billedOnDay(rows, day1) * 10);
      expect(billedOnDay(rows, new Date('2026-08-11T18:00:00.000Z'))).toBe(0);
    });

    it('tracking left running 10 days splits each Chicago day and never piles into today', () => {
      const rows = splitAtChicagoMidnight(
        '2026-08-01T14:00:00.000Z', // 09:00 CDT Aug 1
        '2026-08-10T22:00:00.000Z', // 17:00 CDT Aug 10
      );
      expect(rows).toHaveLength(10);
      expect(billedOnDay(rows, new Date('2026-08-01T18:00:00.000Z'))).toBe(15 * 3600);
      for (let day = 2; day <= 9; day += 1) {
        const ref = new Date(`2026-08-${String(day).padStart(2, '0')}T18:00:00.000Z`);
        expect(billedOnDay(rows, ref)).toBe(24 * 3600);
      }
      expect(billedOnDay(rows, new Date('2026-08-10T18:00:00.000Z'))).toBe(17 * 3600);
      expect(billedOnDay(rows, new Date('2026-08-11T18:00:00.000Z'))).toBe(0);
    });

    it('overnight track from 22:00 CDT to 02:00 CDT: 2h yesterday + 2h today', () => {
      const start = '2026-08-02T03:00:00.000Z'; // 22:00 CDT Aug 1
      const end = '2026-08-02T07:00:00.000Z'; // 02:00 CDT Aug 2
      const rows = splitAtChicagoMidnight(start, end);
      expect(rows.length).toBe(2);
      expect(workDateKey(new Date(rows[0].start_time))).toBe('2026-08-01');
      expect(workDateKey(new Date(rows[1].start_time))).toBe('2026-08-02');
      expect(billedOnDay(rows, new Date(start))).toBe(2 * 3600);
      expect(billedOnDay(rows, new Date(end))).toBe(2 * 3600);
    });

    it('tray rollover after 10 midnights zeros today without moving yesterday', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-01T14:00:00.000Z'));
      const tray = Object.create(TrayManager.prototype);
      tray.tray = { isDestroyed: () => true };
      tray.isTracking = false;
      tray._localDayKey = '2026-08-01';
      tray._cumulativeBaseSeconds = 8 * 3600;
      tray._lastCumulativeSeconds = 8 * 3600;
      tray._readPersistedWorkDayKey = () => tray._localDayKey;
      tray._persistWorkDayKey = (k) => {
        tray._localDayKey = k;
      };
      tray._broadcastWorkDaySync = jest.fn();
      tray._scheduleNextWorkDayRollover = jest.fn();
      global._trayTodayHighWaterSeconds = 8 * 3600;

      const yesterdayRows = [
        { start_time: '2026-08-01T14:00:00.000Z', end_time: '2026-08-01T22:00:00.000Z' },
      ];

      for (let day = 2; day <= 10; day += 1) {
        jest.setSystemTime(
          new Date(`2026-08-${String(day).padStart(2, '0')}T05:30:00.000Z`),
        );
        expect(tray.ensureWorkDayRollover()).toBe(true);
        expect(tray._cumulativeBaseSeconds).toBe(0);
        expect(global._trayTodayHighWaterSeconds).toBe(0);
        expect(tray._localDayKey).toBe(`2026-08-${String(day).padStart(2, '0')}`);
        expect(billedOnDay(yesterdayRows, new Date('2026-08-01T18:00:00.000Z'))).toBe(8 * 3600);
        expect(
          billedOnDay(
            yesterdayRows,
            new Date(`2026-08-${String(day).padStart(2, '0')}T18:00:00.000Z`),
          ),
        ).toBe(0);
      }

      jest.useRealTimers();
    });
  });

  describe('offline for hours then reconnect', () => {
    it('flushes every queued hour after connection returns — no dropped time', async () => {
      const synced = [];
      backendTimeLogs.isLikelyOffline.mockReturnValue(false);
      backendTimeLogs.createTimeLog.mockImplementation(async (row) => {
        synced.push(row);
        return { id: row.id, ...row };
      });

      const queuedAt = '2026-08-25T08:00:00.000Z';
      const queue = [];
      for (let h = 0; h < 8; h += 1) {
        const start = new Date(Date.parse(queuedAt) + h * 3600 * 1000).toISOString();
        const end = new Date(Date.parse(queuedAt) + (h + 1) * 3600 * 1000).toISOString();
        queue.push({
          type: 'create_time_log',
          data: {
            id: `offline-${h}`,
            user_id: 1224,
            start_time: start,
            end_time: end,
            status: 'completed',
            _queued_at: queuedAt,
            _retryCount: 0,
          },
        });
      }

      const tm = Object.create(TrackingManager.prototype);
      tm.config = { user_id: 1224, organization_id: 1 };
      tm._processingOfflineQueue = false;
      tm.getOfflineQueue = () => queue;
      tm._persistOfflineQueueOrThrow = (remaining) => {
        queue.length = 0;
        queue.push(...remaining);
      };
      tm._appendTimeLedger = jest.fn();
      tm.startOfflineSync = jest.fn();
      tm.offlineSyncTimer = null;
      tm.currentTimeLogId = null;
      tm.mainWindow = null;

      await tm.processOfflineQueue();

      expect(synced).toHaveLength(8);
      expect(queue).toHaveLength(0);
      const total = synced.reduce(
        (acc, r) => acc + (Date.parse(r.end_time) - Date.parse(r.start_time)),
        0,
      );
      expect(total).toBe(8 * 3600 * 1000);
    });

    it('keeps the queue when still offline so hours are not discarded', async () => {
      backendTimeLogs.isBackendTimeLogsEnabled.mockReturnValue(false);
      const queue = [
        {
          type: 'create_time_log',
          data: {
            id: 'still-offline',
            start_time: '2026-08-25T08:00:00.000Z',
            end_time: '2026-08-25T16:00:00.000Z',
            status: 'completed',
            _queued_at: '2026-08-25T08:00:00.000Z',
          },
        },
      ];
      const tm = Object.create(TrackingManager.prototype);
      tm.config = { user_id: 1224 };
      tm._processingOfflineQueue = false;
      tm.getOfflineQueue = () => queue;
      tm._persistOfflineQueueOrThrow = (remaining) => {
        queue.length = 0;
        queue.push(...remaining);
      };
      tm._appendTimeLedger = jest.fn();
      tm.startOfflineSync = jest.fn();
      tm.offlineSyncTimer = null;
      tm.currentTimeLogId = null;
      tm.mainWindow = null;

      await tm.processOfflineQueue();

      expect(queue).toHaveLength(1);
      expect(queue[0].data.id).toBe('still-offline');
      backendTimeLogs.isBackendTimeLogsEnabled.mockReturnValue(true);
    });
  });

  describe('Start / Stop does not lose time', () => {
    it('three start/stop blocks on the same day add exactly', () => {
      const rows = [
        { start_time: '2026-08-25T14:00:00.000Z', end_time: '2026-08-25T15:00:00.000Z' },
        { start_time: '2026-08-25T15:05:00.000Z', end_time: '2026-08-25T15:20:00.000Z' },
        { start_time: '2026-08-25T16:00:00.000Z', end_time: '2026-08-25T18:00:00.000Z' },
      ];
      expect(billedOnDay(rows, new Date(rows[0].start_time))).toBe((60 + 15 + 120) * 60);
    });

    it('Start stamp never backdates into the session Stop just closed', () => {
      const tm = Object.create(TrackingManager.prototype);
      const now = Date.now();
      global._lastStopEndAtMs = now - 2000;
      expect(tm._resolveStartStampMs(now - 5000)).toBe(now - 2000);
      delete global._lastStopEndAtMs;
    });

    it('a live session clipped to the work day does not steal yesterday', () => {
      const start = Date.parse('2026-08-02T03:00:00.000Z'); // 22:00 CDT Aug 1
      const now = Date.parse('2026-08-02T07:00:00.000Z'); // 02:00 CDT Aug 2
      const today = secondsWithinWorkDay(start, now, new Date(now));
      expect(today).toBe(2 * 3600);
    });
  });
});
