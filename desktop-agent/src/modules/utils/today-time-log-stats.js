/**
 * Aggregate time_logs for the work calendar day (Pacific Time by default).
 * Used by get-today-time-stats IPC and tracking start (cumulative "worked today" UI).
 */

const {
  workDateKey,
  startOfWorkDay,
  endOfWorkDayExclusive,
  secondsWithinWorkDay,
  elapsedSecondsSinceWorkMidnight,
} = require('./work-timezone');

// Prefer timezone already applied after login (workspace settings).
// Only fall back to config/env default when still at module-load default.

/** @deprecated Use workDateKey — kept for callers. "Local" = configured work timezone. */
function localDateKey(d = new Date()) {
  return workDateKey(d);
}

function startOfLocalDay(d = new Date()) {
  return startOfWorkDay(d);
}

function endOfLocalDayExclusive(d = new Date()) {
  return endOfWorkDayExclusive(d);
}

function elapsedSecondsSinceLocalMidnight(sessionStart, nowMs = Date.now()) {
  const { effectiveSessionStart } = require('./sleep-aware-elapsed');
  const wake = Number(typeof global !== 'undefined' ? global._lastWakeAtMs : 0) || 0;
  // A wake after the end being measured ends a later nap, not this span.
  return elapsedSecondsSinceWorkMidnight(
    effectiveSessionStart(sessionStart, wake <= nowMs ? wake : 0),
    nowMs,
  );
}

function secondsWithinLocalDay(startMs, endMs, dayRef = new Date()) {
  return secondsWithinWorkDay(startMs, endMs, dayRef);
}

async function includeCrossMidnightActiveLog(userId, currentTimeLogId, timeLogs, isTracking) {
  if (!isTracking || !currentTimeLogId) return timeLogs || [];
  const list = [...(timeLogs || [])];
  if (list.some((log) => log.id === currentTimeLogId)) return list;

  try {
    const { isBackendTimeLogsEnabled, getActiveTimeLog } = require('./backend-time-logs');
    if (isBackendTimeLogsEnabled()) {
      const active = await getActiveTimeLog(userId);
      if (active && active.id === currentTimeLogId && active.status === 'active') {
        return [...list, active];
      }
    }
  } catch (err) {
    console.warn('⚠️ [TODAY-TIME-LOG-STATS] Active log lookup failed:', err.message);
  }

  return list;
}

/** Merge overlapping [start,end) intervals — matches web/Pulse (no double-count). */
function mergeIntervalsSeconds(intervals) {
  if (!intervals.length) return 0;
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, cur.endMs);
    } else {
      merged.push({ ...cur });
    }
  }
  let seconds = 0;
  for (const i of merged) {
    seconds += Math.max(0, Math.floor((i.endMs - i.startMs) / 1000));
  }
  return seconds;
}

/** Row carries a server/queue proof-of-life field (null = never stamped). */
function hasAliveProofField(log) {
  return Object.prototype.hasOwnProperty.call(log, 'last_alive_at');
}

function aggregateTimeLogRows(timeLogs, currentTimeLogId, isTracking = false) {
  let ongoingCurrentSessionSeconds = 0;
  const now = Date.now();
  const dayRef = new Date();
  const dayStart = startOfWorkDay(dayRef).getTime();
  const dayEnd = endOfWorkDayExclusive(dayRef).getTime();
  const otherIntervals = [];
  let liveStartMs = null;
  let liveDeductedSeconds = 0;
  let closedDeductedSeconds = 0;
  let reportsDeductions = false;

  for (const log of timeLogs || []) {
    if (!log.start_time) continue;

    const start = new Date(log.start_time).getTime();
    const isActiveRow = log.status === 'active';
    // Stopped + open row with a proof-of-life field is an orphan (Pulse ends it
    // at last_alive_at). Legacy rows without the field keep the old live read.
    const countsActiveAsLive =
      isActiveRow &&
      (isTracking ? !currentTimeLogId || log.id === currentTimeLogId : !hasAliveProofField(log));
    const isCurrentLive =
      countsActiveAsLive ||
      (isTracking && currentTimeLogId && log.id === currentTimeLogId);

    // Screenshot deletes come off the session-start work day (Pulse rule).
    if (Object.prototype.hasOwnProperty.call(log, 'deducted_seconds')) reportsDeductions = true;
    const deducted = Math.max(0, Math.floor(Number(log.deducted_seconds) || 0));
    if (deducted > 0 && start >= dayStart && start < dayEnd) {
      if (isCurrentLive) liveDeductedSeconds += deducted;
      else closedDeductedSeconds += deducted;
    }

    if (isCurrentLive) {
      // One live session only — keep earliest start if duplicates appear.
      if (liveStartMs == null || start < liveStartMs) liveStartMs = start;
      continue;
    }
    // Open rows that are not the live session end at last proof-of-life, never
    // "now" (that read wall-clock-since-midnight after a crash). No proof → 0.
    const endRaw = log.end_time || (isActiveRow ? log.last_alive_at : null);
    if (!endRaw) continue;
    const end = new Date(endRaw).getTime();
    if (secondsWithinWorkDay(start, end, dayRef) > 0) {
      otherIntervals.push({
        startMs: Math.max(start, dayStart),
        endMs: Math.min(end, dayEnd),
      });
    }
  }

  let completedClosedSeconds;
  if (liveStartMs != null) {
    ongoingCurrentSessionSeconds = secondsWithinWorkDay(liveStartMs, now, dayRef);
    // Union with the live session: whatever overlaps it is already counted
    // there (second device, or a temp-id copy of this same session).
    const liveFrom = Math.max(liveStartMs, dayStart);
    completedClosedSeconds = mergeIntervalsSeconds(
      otherIntervals
        .map((i) => ({ startMs: i.startMs, endMs: Math.min(i.endMs, liveFrom) }))
        .filter((i) => i.endMs > i.startMs),
    );
  } else {
    completedClosedSeconds = mergeIntervalsSeconds(otherIntervals);
  }

  completedClosedSeconds = Math.max(0, completedClosedSeconds - closedDeductedSeconds);
  // Pulse takes every deduction off the day total, so a live session's
  // deduction larger than the session so far still comes off the total.
  // Clamping it at the session dropped the clock by the excess at Stop.
  const liveDeductionExcessSeconds = Math.max(0, liveDeductedSeconds - ongoingCurrentSessionSeconds);
  ongoingCurrentSessionSeconds = Math.max(0, ongoingCurrentSessionSeconds - liveDeductedSeconds);
  const totalTime = Math.max(
    0,
    completedClosedSeconds + ongoingCurrentSessionSeconds - liveDeductionExcessSeconds,
  );
  const timeLogsCount = (timeLogs || []).length;
  return {
    completedClosedSeconds,
    ongoingCurrentSessionSeconds,
    totalTime,
    timeLogsCount,
    deductedSeconds: closedDeductedSeconds + liveDeductedSeconds,
    liveDeductedSeconds,
    liveDeductionExcessSeconds,
    reportsDeductions,
  };
}

function logsOverlappingLocalDay(timeLogs, dayRef = new Date()) {
  const dayStartMs = startOfWorkDay(dayRef).getTime();
  const dayEndMs = endOfWorkDayExclusive(dayRef).getTime();
  const now = Date.now();
  return (timeLogs || []).filter((log) => {
    if (!log?.start_time) return false;
    const start = new Date(log.start_time).getTime();
    const end = log.end_time ? new Date(log.end_time).getTime() : now;
    return start < dayEndMs && end > dayStartMs;
  });
}

/** Same app-data dir as TrackingManager offline time-log queue. */
function getOfflineTimeLogsPath() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const userDataDir =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  return path.join(userDataDir, 'Alyson Work Time', 'offline-time-logs.json');
}

/**
 * Convert offline queue items into time_log-shaped rows for today's clock.
 * Ensures unsynced offline hours still appear on the timer until portal sync.
 */
function loadOfflineQueuedTimeLogRows(userId, currentTimeLogId = null) {
  try {
    const fs = require('fs');
    const queuePath = getOfflineTimeLogsPath();
    if (!fs.existsSync(queuePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    if (!Array.isArray(parsed) || !parsed.length) return [];

    const uid = String(userId || '');
    const toIso = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString();
      const s = String(v);
      return s || null;
    };

    // Index creates so update_time_log rows missing start_time can still count.
    const createById = new Map();
    for (const item of parsed) {
      if (item?.type === 'create_time_log' && item.data?.id) {
        createById.set(String(item.data.id), item.data);
      }
    }

    const rows = [];
    for (const item of parsed) {
      if (!item || !item.data) continue;
      const data = item.data;
      if (uid && data.user_id != null && String(data.user_id) !== uid) continue;

      if (item.type === 'create_time_log') {
        rows.push({
          id: data.id,
          start_time: toIso(data.start_time),
          end_time: toIso(data.end_time),
          status: data.status || (data.end_time ? 'completed' : 'active'),
          ...(data._checkpoint_at ? { last_alive_at: toIso(data._checkpoint_at) } : {}),
          _fromOfflineQueue: true,
        });
      } else if (item.type === 'update_time_log') {
        // Completed stop queued while offline — count as a closed interval.
        if (data.end_time || data.status === 'completed') {
          const paired = createById.get(String(data.id));
          const start_time = toIso(data.start_time) || toIso(paired?.start_time);
          rows.push({
            id: data.id,
            start_time,
            end_time: toIso(data.end_time) || toIso(paired?.end_time),
            status: 'completed',
            _fromOfflineQueue: true,
          });
        }
      }
    }

    // Prefer tracking-manager live view for the current temp session (has start_time).
    if (currentTimeLogId && String(currentTimeLogId).startsWith('temp-')) {
      const hasCurrent = rows.some((r) => r.id === currentTimeLogId);
      if (!hasCurrent) {
        try {
          const tm = global.trackingManager;
          const start =
            tm?.sessionStartTime ||
            global.sessionStartTime ||
            null;
          if (start) {
            rows.push({
              id: currentTimeLogId,
              start_time: start instanceof Date ? start.toISOString() : String(start),
              end_time: null,
              status: 'active',
              _fromOfflineQueue: true,
            });
          }
        } catch (_) { /* ignore */ }
      }
    }

    // Keep end-only updates so merge can attach the queued Stop onto the
    // remote row by id. Dropping them is how a restart snapped Mohita's
    // clock to the server total that never received those closes.
    return rows.filter((r) => r.start_time || (r.id && r.end_time));
  } catch (err) {
    console.warn('⚠️ [TODAY-TIME-LOG-STATS] Offline queue read failed:', err?.message || err);
    return [];
  }
}

function mergeRemoteAndOfflineLogs(remoteLogs, offlineLogs, currentTimeLogId) {
  const byId = new Map();
  for (const log of remoteLogs || []) {
    if (log?.id) byId.set(String(log.id), log);
  }
  for (const log of offlineLogs || []) {
    if (!log?.id) continue;
    const id = String(log.id);
    // Offline completed create wins over missing remote; don't replace a richer remote row
    // unless remote has no end and offline does (stop synced to queue only).
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, log);
      continue;
    }
    if (log.end_time) {
      const existingEnd = existing.end_time ? new Date(existing.end_time).getTime() : 0;
      const offlineEnd = new Date(log.end_time).getTime();
      if (!existing.end_time || (Number.isFinite(offlineEnd) && offlineEnd > existingEnd)) {
        byId.set(id, {
          ...existing,
          start_time: existing.start_time || log.start_time,
          end_time: log.end_time,
          status: 'completed',
        });
      }
    }
  }
  // Current live session: ensure present
  if (currentTimeLogId && !byId.has(String(currentTimeLogId))) {
    const offlineLive = (offlineLogs || []).find((l) => String(l.id) === String(currentTimeLogId));
    if (offlineLive) byId.set(String(currentTimeLogId), offlineLive);
  }
  return [...byId.values()];
}

/**
 * When remote fetch fails mid-session, still count the live session from local
 * tracking-manager state so a 10–15 min outage never zeros ongoing time.
 */
function ensureLiveSessionRow(timeLogs, currentTimeLogId, isTracking) {
  const list = Array.isArray(timeLogs) ? [...timeLogs] : [];
  if (!isTracking || !currentTimeLogId) return list;
  if (list.some((l) => String(l?.id) === String(currentTimeLogId))) return list;

  try {
    const tm = global.trackingManager;
    const start =
      tm?.sessionStartTime ||
      global.sessionStartTime ||
      tm?.currentSession?.start_time ||
      global.currentSession?.start_time ||
      null;
    if (!start) return list;
    list.push({
      id: currentTimeLogId,
      start_time: start instanceof Date ? start.toISOString() : String(start),
      end_time: null,
      status: 'active',
      _fromLocalSession: true,
    });
  } catch (_) {
    /* ignore */
  }
  return list;
}

/**
 * Pulse day total: holiday/leave is a floor, not a stack.
 * Work 2h + 7h holiday → 7h. Work 9h + 7h holiday → 9h (keep the extra).
 * Third arg is leave credit; second is other (admin) adjustments only.
 */
function applyAdjustmentSeconds(sessionSeconds, adjustmentSeconds, leaveCreditSeconds = 0) {
  const session = Math.max(0, Math.floor(Number(sessionSeconds) || 0));
  const other = Math.trunc(Number(adjustmentSeconds) || 0);
  const leave = Math.max(0, Math.trunc(Number(leaveCreditSeconds) || 0));
  const leaveApplied = Math.max(0, leave - session);
  const applied = other + leaveApplied;
  return {
    trackedSessionSeconds: session,
    adjustmentSeconds: applied,
    leaveCreditSeconds: leave,
    otherAdjustmentSeconds: other,
    totalTime: Math.max(0, session + applied),
  };
}

/**
 * A session longer than today has lasted is yesterday's leftover.
 * Do not replace it with "seconds since midnight" — that painted 1h 37m
 * before Start (Hamza, 14 Oct: 25884s clamped to 5877s).
 *
 * @returns {{ totalSeconds: number, closedSeconds: number, dropped: boolean }}
 */
function dropImpossibleSessionSeconds({
  totalSeconds = 0,
  closedSeconds = 0,
  sessionTrackedSeconds = null,
  capSeconds = null,
  isTracking = false,
  liveElapsedSeconds = 0,
  otherSeconds = 0,
  leaveSeconds = 0,
} = {}) {
  let closed = Math.max(0, Math.floor(Number(closedSeconds) || 0));
  let total = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const cap = capSeconds == null ? null : Math.floor(Number(capSeconds));
  if (cap == null || !Number.isFinite(cap)) {
    return { totalSeconds: total, closedSeconds: closed, dropped: false };
  }
  const sessionTracked = Math.max(
    0,
    Math.floor(
      Number(sessionTrackedSeconds != null ? sessionTrackedSeconds : total) || 0,
    ),
  );
  let dropped = false;
  if (closed > cap) {
    closed = 0;
    dropped = true;
  }
  if (sessionTracked > cap) {
    const live = isTracking ? Math.max(0, Math.floor(Number(liveElapsedSeconds) || 0)) : 0;
    const honest = Math.min(cap, closed + live);
    total = applyAdjustmentSeconds(honest, otherSeconds, leaveSeconds).totalTime;
    dropped = true;
  }
  return { totalSeconds: total, closedSeconds: closed, dropped };
}

/**
 * Every second of today is already on the server: the read succeeded, nothing
 * is queued or pending on disk, and the queue did not change while the read
 * was in flight. Then the server total (what Pulse shows) is the only correct
 * clock — local Stop floors exist to cover time the server does not have yet,
 * and past that point they can only hold phantom time (Om 14 Oct: 11h vs 9h).
 */
function isSettledTodayRead({
  backendFetchFailed = false,
  timeLogsCount = 0,
  offlinePendingCount = 0,
  pendingCloseCount = 0,
  queueGenAtStart = null,
  queueGenAtEnd = null,
  graceUntilMs = 0,
  stopInProgress = false,
  nowMs = Date.now(),
} = {}) {
  if (backendFetchFailed || stopInProgress) return false;
  // An empty read is never proof — it may be a failed lookup that returned [].
  if (!(Number(timeLogsCount) > 0)) return false;
  if (Number(offlinePendingCount) > 0 || Number(pendingCloseCount) > 0) return false;
  if (queueGenAtStart == null || queueGenAtStart !== queueGenAtEnd) return false;
  return nowMs >= (Number(graceUntilMs) || 0);
}

function finalizeTodayAggregate(timeLogs, currentTimeLogId, isTracking, offlineCount = 0) {
  const withLive = ensureLiveSessionRow(timeLogs, currentTimeLogId, isTracking);
  const overlapping = logsOverlappingLocalDay(withLive);
  const agg = aggregateTimeLogRows(overlapping, currentTimeLogId, isTracking);
  return {
    ...agg,
    offlinePendingCount: offlineCount,
    fromOfflineMerge: offlineCount > 0,
  };
}

/**
 * Remote today-stats miss must keep the last painted closed total and add
 * the current live session. Never return a lower total than last-good.
 * Garima 25 Aug 17:47: fetch failed → 431s live-only, clock sawed 3.49h → 0.12h.
 */
function statsWorkDayKey(stats) {
  if (!stats || typeof stats !== 'object') return null;
  const key =
    (stats.workDay && stats.workDay.todayKey) ||
    stats.workDate ||
    stats.date ||
    null;
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

/**
 * Renderer today-stats cache.
 * Same-day failed/stale fetch must not rewind the clock.
 * A new work day at 0 is real — leftover yesterday is phantom (Thirumalai
 * Aug 24 10:00 PKT: 2,800 "ignoring wipe-to-zero" after Chicago midnight).
 */
function shouldKeepCachedTodayStats(prev, incoming, { trackingLive = false, rendererDayKey = null } = {}) {
  if (!prev || prev.error) return { keep: false };
  const incomingTotal = Math.max(0, Math.floor(Number(incoming?.totalTime) || 0));
  const prevTotal = Math.max(0, Math.floor(Number(prev.totalTime) || 0));
  const prevDay = statsWorkDayKey(prev);
  const incomingDay = statsWorkDayKey(incoming);
  const rendererDay =
    typeof rendererDayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rendererDayKey)
      ? rendererDayKey
      : null;
  const newWorkDay =
    (prevDay && incomingDay && incomingDay > prevDay) ||
    (prevDay && rendererDay && rendererDay > prevDay);

  if (newWorkDay) {
    return { keep: false, reason: 'new-work-day' };
  }
  if (incoming?.error && prevTotal > 0) {
    return { keep: true, reason: 'error', value: prev };
  }
  if (
    (incoming?.backendFetchFailed === true || incoming?.stale === true) &&
    prevTotal > incomingTotal
  ) {
    return { keep: true, reason: 'backend-miss', value: prev };
  }
  // Same-day empty response while tracking (legacy wipe without a fail flag).
  // Stopped + 0 is an empty / new day — never glue leftover hours back on.
  if (prevTotal > 60 && incomingTotal < 30 && !incoming?.offlinePendingCount && !incoming?.error) {
    if (!trackingLive) {
      return { keep: false, reason: 'stopped-empty-day' };
    }
    return { keep: true, reason: 'wipe-to-zero', value: prev };
  }
  if (
    trackingLive &&
    prevTotal > 60 &&
    incomingTotal + 15 < prevTotal &&
    !incoming?.floorHeld
  ) {
    return {
      keep: true,
      reason: 'sync-drop',
      value: {
        ...prev,
        ongoingCurrentSessionSeconds:
          incoming?.ongoingCurrentSessionSeconds ?? prev.ongoingCurrentSessionSeconds,
        offlinePendingCount: incoming?.offlinePendingCount ?? prev.offlinePendingCount,
      },
    };
  }
  return { keep: false };
}

function holdLastGoodOnFailedFetch(agg, lastGood, { isTracking = false } = {}) {
  const live = isTracking
    ? Math.max(0, Math.floor(Number(agg?.ongoingCurrentSessionSeconds) || 0))
    : 0;
  const failedClosed = Math.max(0, Math.floor(Number(agg?.completedClosedSeconds) || 0));
  const failedTotal = Math.max(0, Math.floor(Number(agg?.totalTime) || 0));
  const base = agg && typeof agg === 'object' ? agg : {};

  if (!lastGood || typeof lastGood !== 'object') {
    return {
      ...base,
      completedClosedSeconds: failedClosed,
      ongoingCurrentSessionSeconds: live,
      totalTime: Math.max(failedTotal, failedClosed + live),
      backendFetchFailed: true,
    };
  }

  const lastClosed = Math.max(
    0,
    Math.floor(
      Number(
        lastGood.completedTodayBeforeCurrentSessionSeconds ?? lastGood.completedClosedSeconds,
      ) || 0,
    ),
  );
  const lastTotal = Math.max(0, Math.floor(Number(lastGood.totalTime) || 0));
  const closed = Math.max(failedClosed, lastClosed);
  const total = Math.max(lastTotal, closed + live, failedTotal);
  return {
    ...base,
    completedClosedSeconds: closed,
    ongoingCurrentSessionSeconds: live,
    totalTime: total,
    adjustmentSeconds: Math.trunc(
      Number(lastGood.adjustmentSeconds ?? base.adjustmentSeconds) || 0,
    ),
    leaveCreditSeconds: Math.max(
      0,
      Math.trunc(Number(lastGood.leaveCreditSeconds ?? base.leaveCreditSeconds) || 0),
    ),
    otherAdjustmentSeconds: Math.trunc(
      Number(lastGood.otherAdjustmentSeconds ?? base.otherAdjustmentSeconds) || 0,
    ),
    backendFetchFailed: true,
    floorHeld: total > failedTotal || closed > failedClosed,
  };
}

async function computeTodayTimeLogSeconds(userId, currentTimeLogId, isTracking = false) {
  if (!userId) {
    return {
      completedClosedSeconds: 0,
      ongoingCurrentSessionSeconds: 0,
      totalTime: 0,
      timeLogsCount: 0,
      offlinePendingCount: 0,
    };
  }

  const offlineLogs = loadOfflineQueuedTimeLogRows(userId, currentTimeLogId);
  const offlineCount = offlineLogs.length;

  try {
    const { isBackendTimeLogsEnabled } = require('./backend-time-logs');
    if (isBackendTimeLogsEnabled()) {
      let timeLogs = [];
      let adjustmentSeconds = 0;
      let leaveCreditSeconds = 0;
      try {
        const { getTodayTimeLogsPayload } = require('./backend-time-logs');
        const payload = await getTodayTimeLogsPayload(userId);
        timeLogs = payload.timeLogs;
        adjustmentSeconds = payload.otherAdjustmentSeconds ?? payload.adjustmentSeconds;
        leaveCreditSeconds = payload.leaveCreditSeconds || 0;
      } catch (fetchErr) {
        console.warn(
          '⚠️ [TODAY-TIME-LOG-STATS] Backend fetch failed — using offline queue + local session:',
          fetchErr?.message || fetchErr,
        );
        // Keep recording from local Start + any queued rows; sync failure must not
        // wipe ongoing time while the employee is still tracking.
        return {
          ...finalizeTodayAggregate(offlineLogs, currentTimeLogId, isTracking, offlineCount),
          backendFetchFailed: true,
        };
      }
      const overlapping = logsOverlappingLocalDay(timeLogs);
      const withActive = await includeCrossMidnightActiveLog(
        userId,
        currentTimeLogId,
        overlapping,
        isTracking,
      );
      const merged = mergeRemoteAndOfflineLogs(withActive, offlineLogs, currentTimeLogId);
      return {
        ...finalizeTodayAggregate(merged, currentTimeLogId, isTracking, offlineCount),
        adjustmentSeconds,
        leaveCreditSeconds,
        otherAdjustmentSeconds: adjustmentSeconds,
        timeLogs: merged,
      };
    }
  } catch (err) {
    console.warn('⚠️ [TODAY-TIME-LOG-STATS] Backend path failed:', err.message);
    if (offlineCount > 0 || (isTracking && currentTimeLogId)) {
      return {
        ...finalizeTodayAggregate(offlineLogs, currentTimeLogId, isTracking, offlineCount),
        backendFetchFailed: true,
      };
    }
  }

  // RDS is the only remote source; without it, show queued + live local time
  // rather than wiping a clock the employee is still running against.
  if (offlineCount > 0 || (isTracking && currentTimeLogId)) {
    return finalizeTodayAggregate(offlineLogs, currentTimeLogId, isTracking, offlineCount);
  }
  const err = new Error('No database backend available for today time stats');
  err.code = 'TODAY_STATS_UNAVAILABLE';
  throw err;
}

function lastGoodTodayStatsPath() {
  const path = require('path');
  const { getPayrollAppDataDir } = require('./payroll-app-data-dir');
  return path.join(getPayrollAppDataDir(), 'last-good-today-stats.json');
}

function readPersistedLastGood() {
  try {
    const fs = require('fs');
    const filePath = lastGoodTodayStatsPath();
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const total = Math.max(0, Math.floor(Number(parsed.totalTime) || 0));
    if (!parsed.workDate || total <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedLastGood(payload) {
  try {
    const fs = require('fs');
    const total = Math.max(0, Math.floor(Number(payload?.totalTime) || 0));
    if (!payload?.workDate || total <= 0) return;
    const filePath = lastGoodTodayStatsPath();
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        workDate: payload.workDate,
        totalTime: total,
        completedTodayBeforeCurrentSessionSeconds: Math.max(
          0,
          Math.floor(Number(payload.completedTodayBeforeCurrentSessionSeconds) || 0),
        ),
        adjustmentSeconds: Math.trunc(Number(payload.adjustmentSeconds) || 0),
        leaveCreditSeconds: Math.max(0, Math.trunc(Number(payload.leaveCreditSeconds) || 0)),
        otherAdjustmentSeconds: Math.trunc(Number(payload.otherAdjustmentSeconds) || 0),
        deductedSeconds: Math.max(0, Math.floor(Number(payload.deductedSeconds) || 0)),
        liveDeductedSeconds: Math.max(0, Math.floor(Number(payload.liveDeductedSeconds) || 0)),
      }),
      'utf8',
    );
    fs.renameSync(tmp, filePath);
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  computeTodayTimeLogSeconds,
  startOfLocalDay,
  endOfLocalDayExclusive,
  localDateKey,
  elapsedSecondsSinceLocalMidnight,
  secondsWithinLocalDay,
  logsOverlappingLocalDay,
  loadOfflineQueuedTimeLogRows,
  mergeRemoteAndOfflineLogs,
  mergeIntervalsSeconds,
  aggregateTimeLogRows,
  applyAdjustmentSeconds,
  dropImpossibleSessionSeconds,
  isSettledTodayRead,
  holdLastGoodOnFailedFetch,
  statsWorkDayKey,
  shouldKeepCachedTodayStats,
  readPersistedLastGood,
  writePersistedLastGood,
};
