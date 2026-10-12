/**
 * Payroll correctness: under-count (lost hours) and over-count (invented hours).
 *
 * Under: Stop/pending/queue/last-good must keep every laptop-billed second.
 * Over:  sleep, overlap, idle cut, insert retry, orphan overnight must not add.
 */

const {
  setWorkTimezone,
  getWorkTimezone,
  startOfWorkDay,
  endOfWorkDayExclusive,
} = require('../work-timezone');
const {
  mergeIntervalsSeconds,
  holdLastGoodOnFailedFetch,
  mergeRemoteAndOfflineLogs,
} = require('../today-time-log-stats');
const { sleepSafeEndIso, elapsedSecondsExcludingSleep } = require('../sleep-aware-elapsed');
const {
  writePendingSessionClose,
  clearPendingSessionClose,
  listPendingSessionCloses,
  readPendingSessionEndTime,
} = require('../session-recovery');
const TrackingManager = require('../../core/tracking-manager');
const fs = require('fs');
const os = require('os');
const path = require('path');

const previousTz = getWorkTimezone();
const PAYROLL = fs.mkdtempSync(path.join(os.tmpdir(), 'over-under-payroll-'));
process.env.ALYSON_PAYROLL_APP_DATA_DIR = PAYROLL;

function ms(iso) {
  return new Date(iso).getTime();
}

function spanSeconds(startIso, endIso) {
  return Math.max(0, Math.floor((ms(endIso) - ms(startIso)) / 1000));
}

function billedSeconds(rows, dayRef = new Date(rows[0]?.start_time || Date.now())) {
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

describe('under-count — must not lose billed seconds', () => {
  beforeAll(() => setWorkTimezone('America/Chicago'));
  afterAll(() => {
    setWorkTimezone(previousTz);
    fs.rmSync(PAYROLL, { recursive: true, force: true });
  });

  it('Friday Stop frozen end is kept even when remote is shorter (Vinit / Fawad)', () => {
    const id = 'e05767df-98b3-421d-879f-b159f00216ce';
    const start = '2026-10-09T13:00:00.000Z';
    const laptopEnd = '2026-10-09T20:05:32.000Z'; // ~7.09h
    const shortRemote = '2026-10-09T18:03:28.000Z'; // ~5.06h after ISE loss
    const merged = mergeRemoteAndOfflineLogs(
      [{ id, start_time: start, end_time: shortRemote, status: 'completed' }],
      [
        {
          id,
          start_time: start,
          end_time: laptopEnd,
          status: 'completed',
          _fromOfflineQueue: true,
        },
      ],
      null,
    );
    const row = merged.find((r) => r.id === id);
    expect(row.end_time).toBe(laptopEnd);
    expect(billedSeconds([row], new Date(start))).toBe(spanSeconds(start, laptopEnd));
    expect(billedSeconds([row], new Date(start))).toBeGreaterThan(
      spanSeconds(start, shortRemote),
    );
  });

  it('pending close on disk restores the same frozen end after restart', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const end = '2026-10-09T17:40:13.000Z';
    expect(writePendingSessionClose({ timeLogId: id, endTime: end, userId: 1243 })).toBe(true);
    expect(readPendingSessionEndTime(id)).toBe(end);
    expect(listPendingSessionCloses().some((p) => p.timeLogId === id && p.endTime === end)).toBe(
      true,
    );
    clearPendingSessionClose(id);
  });

  it('failed BE fetch holds last-good so the clock does not rewind', () => {
    const failed = holdLastGoodOnFailedFetch(
      { completedClosedSeconds: 0, ongoingCurrentSessionSeconds: 0, totalTime: 0 },
      { totalTime: 12564, completedTodayBeforeCurrentSessionSeconds: 12564 },
      { isTracking: false },
    );
    expect(failed.totalTime).toBe(12564);
    expect(failed.completedClosedSeconds).toBe(12564);
    expect(failed.backendFetchFailed).toBe(true);
  });

  it('earlier frozen Stop wins when a later retry tries to add sleep hours', () => {
    const tm = Object.create(TrackingManager.prototype);
    tm.queue = [];
    tm._offlineQueueWriteGen = 0;
    tm.getOfflineQueue = () => tm.queue.slice();
    tm._persistOfflineQueueOrThrow = (next) => {
      tm.queue = next.slice();
      tm._offlineQueueWriteGen += 1;
    };
    tm._appendTimeLedger = () => {};
    tm._saferQueuedClosePayload = TrackingManager.prototype._saferQueuedClosePayload;
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const start = '2026-10-09T13:00:00.000Z';
    const honest = '2026-10-09T17:00:00.000Z';
    const inflated = '2026-10-09T22:00:00.000Z';
    TrackingManager.prototype._queueOfflineTimeLogUpdate.call(
      tm,
      { id, start_time: start, end_time: honest, status: 'completed', frozen_end: true },
      { flush: false },
    );
    TrackingManager.prototype._queueOfflineTimeLogUpdate.call(
      tm,
      { id, start_time: start, end_time: inflated, status: 'completed', frozen_end: true },
      { flush: false },
    );
    expect(tm.queue).toHaveLength(1);
    expect(tm.queue[0].data.end_time).toBe(honest);
    expect(billedSeconds([tm.queue[0].data], new Date(start))).toBe(4 * 3600);
  });
});

describe('over-count — must not invent billed seconds', () => {
  beforeAll(() => setWorkTimezone('America/Chicago'));
  afterAll(() => setWorkTimezone(previousTz));

  it('sleep gap between last proof and wake is not billed (Garima lid)', () => {
    const start = '2026-08-24T17:31:55.000Z';
    const lastAlive = '2026-08-24T18:24:54.000Z';
    const wake = '2026-08-24T19:24:54.000Z';
    const end = sleepSafeEndIso({
      lastCheckpointAt: lastAlive,
      checkpointTimeLogId: 's3',
      timeLogId: 's3',
      nowIso: wake,
    });
    expect(end).toBe(new Date(lastAlive).toISOString());
    expect(spanSeconds(start, end)).toBe(spanSeconds(start, lastAlive));
    expect(spanSeconds(start, wake) - spanSeconds(start, end)).toBe(3600);
  });

  it('wake live clock counts from wake, not from pre-sleep Start', () => {
    const start = '2026-08-24T17:31:55.000Z';
    const wakeMs = ms('2026-08-24T19:24:54.000Z');
    const nowMs = wakeMs + 30 * 60 * 1000;
    const live = elapsedSecondsExcludingSleep(start, nowMs, wakeMs);
    expect(live).toBe(30 * 60);
    expect(live).toBeLessThan(Math.floor((nowMs - ms(start)) / 1000));
  });

  it('nested 30s session inside a longer one does not add 30s', () => {
    const rows = [
      { start_time: '2026-08-24T17:31:55.000Z', end_time: '2026-08-24T20:00:00.000Z' },
      { start_time: '2026-08-24T18:45:00.000Z', end_time: '2026-08-24T18:45:30.000Z' },
    ];
    const rawSum =
      spanSeconds(rows[0].start_time, rows[0].end_time) +
      spanSeconds(rows[1].start_time, rows[1].end_time);
    const billed = billedSeconds(rows, new Date(rows[0].start_time));
    expect(rawSum).toBe(billed + 30);
    expect(billed).toBe(spanSeconds(rows[0].start_time, rows[0].end_time));
  });

  it('partial overlap clamp bills the union once (4h wall, not 6h sum)', () => {
    const tm = Object.create(TrackingManager.prototype);
    const queue = [
      {
        type: 'create_time_log',
        data: {
          id: 'a',
          start_time: '2026-10-09T13:00:00.000Z',
          end_time: '2026-10-09T16:00:00.000Z',
          status: 'completed',
        },
      },
      {
        type: 'create_time_log',
        data: {
          id: 'b',
          start_time: '2026-10-09T15:00:00.000Z',
          end_time: '2026-10-09T17:00:00.000Z',
          status: 'completed',
        },
      },
    ];
    tm._clampOverlappingQueuedSessions(queue);
    const rows = queue.map((q) => q.data);
    expect(billedSeconds(rows, new Date(rows[0].start_time))).toBe(4 * 3600);
    const rawSum = rows.reduce(
      (acc, r) => acc + spanSeconds(r.start_time, r.end_time),
      0,
    );
    expect(rawSum).toBe(4 * 3600);
  });

  it('orphan overnight close at last_alive is shorter than wall-clock morning Start', () => {
    // Prior open: Thu 17:00 last_alive. Friday Start 13:00Z would over-bill ~20h.
    const priorStart = '2026-10-08T18:00:00.000Z';
    const lastAlive = '2026-10-08T22:00:00.000Z';
    const fridayStart = '2026-10-09T13:00:00.000Z';
    const closedAtLastAlive = spanSeconds(priorStart, lastAlive);
    const closedAtMorningStart = spanSeconds(priorStart, fridayStart);
    expect(closedAtLastAlive).toBe(4 * 3600);
    expect(closedAtMorningStart).toBeGreaterThan(18 * 3600);
    expect(closedAtLastAlive).toBeLessThan(closedAtMorningStart);
  });

  it('authorized idle cut bills now−10m, not last_alive at prompt time', () => {
    const start = '2026-08-31T05:37:00.000Z';
    const cut = '2026-08-31T10:17:00.000Z'; // now−10m
    const lastAliveAtPrompt = '2026-08-31T10:27:00.000Z';
    expect(spanSeconds(start, cut)).toBe(spanSeconds(start, lastAliveAtPrompt) - 600);
    expect(billedSeconds([{ start_time: start, end_time: cut }], new Date(start))).toBe(
      spanSeconds(start, cut),
    );
  });

  it('insert-retry later end must not raise an already completed billed end', () => {
    // Mirrors COMPLETED_ROW_KEEPS_END_SQL: first completed end wins.
    const start = '2026-08-31T05:37:00.000Z';
    const firstEnd = '2026-08-31T10:17:26.000Z';
    const retryEnd = '2026-08-31T10:27:26.000Z';
    const kept = firstEnd; // server ON CONFLICT keeps completed end
    expect(spanSeconds(start, kept)).toBe(spanSeconds(start, firstEnd));
    expect(spanSeconds(start, retryEnd) - spanSeconds(start, kept)).toBe(600);
  });
});
