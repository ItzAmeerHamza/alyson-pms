/**
 * Aggregate time_logs for the work calendar day (Pacific Time by default).
 * Used by get-today-time-stats IPC and tracking start (cumulative "worked today" UI).
 */

const {
  initWorkTimezone,
  workDateKey,
  startOfWorkDay,
  endOfWorkDayExclusive,
  secondsWithinWorkDay,
  elapsedSecondsSinceWorkMidnight,
} = require('./work-timezone');

// Initialize from config when module loads in main process.
try {
  initWorkTimezone(global?.config);
} catch {
  /* renderer/tests may load without global.config */
}

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
  return elapsedSecondsSinceWorkMidnight(sessionStart, nowMs);
}

function secondsWithinLocalDay(startMs, endMs, dayRef = new Date()) {
  return secondsWithinWorkDay(startMs, endMs, dayRef);
}

async function includeCrossMidnightActiveLog(supabase, userId, currentTimeLogId, timeLogs, isTracking) {
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

  if (supabase) {
    const { data, error } = await supabase
      .from('time_logs')
      .select('id, start_time, end_time, status')
      .eq('id', currentTimeLogId)
      .maybeSingle();
    if (!error && data && data.status === 'active') {
      return [...list, data];
    }
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

function aggregateTimeLogRows(timeLogs, currentTimeLogId, isTracking = false) {
  let ongoingCurrentSessionSeconds = 0;
  const now = Date.now();
  const dayRef = new Date();
  const closedIntervals = [];
  let liveStartMs = null;

  for (const log of timeLogs || []) {
    if (!log.start_time) continue;

    const start = new Date(log.start_time).getTime();
    const isActiveRow = log.status === 'active';
    const countsActiveAsLive =
      isActiveRow && (!isTracking || !currentTimeLogId || log.id === currentTimeLogId);
    const isCurrentLive =
      countsActiveAsLive ||
      (isTracking && currentTimeLogId && log.id === currentTimeLogId);

    if (isCurrentLive) {
      // One live session only — keep earliest start if duplicates appear.
      if (liveStartMs == null || start < liveStartMs) liveStartMs = start;
    } else if (log.end_time) {
      const end = new Date(log.end_time).getTime();
      const sec = secondsWithinWorkDay(start, end, dayRef);
      if (sec > 0) {
        const dayStart = startOfWorkDay(dayRef).getTime();
        const dayEnd = endOfWorkDayExclusive(dayRef).getTime();
        closedIntervals.push({
          startMs: Math.max(start, dayStart),
          endMs: Math.min(end, dayEnd),
        });
      }
    } else if (isActiveRow) {
      // Orphan active row (not current): count through now like the API does.
      const sec = secondsWithinWorkDay(start, now, dayRef);
      if (sec > 0) {
        const dayStart = startOfWorkDay(dayRef).getTime();
        const dayEnd = endOfWorkDayExclusive(dayRef).getTime();
        closedIntervals.push({
          startMs: Math.max(start, dayStart),
          endMs: Math.min(now, dayEnd),
        });
      }
    }
  }

  if (liveStartMs != null) {
    ongoingCurrentSessionSeconds = secondsWithinWorkDay(liveStartMs, now, dayRef);
  }

  const completedClosedSeconds = mergeIntervalsSeconds(closedIntervals);
  const totalTime = completedClosedSeconds + ongoingCurrentSessionSeconds;
  const timeLogsCount = (timeLogs || []).length;
  return { completedClosedSeconds, ongoingCurrentSessionSeconds, totalTime, timeLogsCount };
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

    return rows.filter((r) => r.start_time);
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
    if (!existing.end_time && log.end_time) {
      byId.set(id, { ...existing, end_time: log.end_time, status: 'completed' });
    }
  }
  // Current live session: ensure present
  if (currentTimeLogId && !byId.has(String(currentTimeLogId))) {
    const offlineLive = (offlineLogs || []).find((l) => String(l.id) === String(currentTimeLogId));
    if (offlineLive) byId.set(String(currentTimeLogId), offlineLive);
  }
  return [...byId.values()];
}

function finalizeTodayAggregate(timeLogs, currentTimeLogId, isTracking, offlineCount = 0) {
  const overlapping = logsOverlappingLocalDay(timeLogs);
  const agg = aggregateTimeLogRows(overlapping, currentTimeLogId, isTracking);
  return {
    ...agg,
    offlinePendingCount: offlineCount,
    fromOfflineMerge: offlineCount > 0,
  };
}

async function computeTodayTimeLogSeconds(supabase, userId, currentTimeLogId, isTracking = false) {
  if (!userId) {
    return {
      completedClosedSeconds: 0,
      ongoingCurrentSessionSeconds: 0,
      totalTime: 0,
      timeLogsCount: 0,
      offlinePendingCount: 0,
    };
  }

  const startOfDay = startOfWorkDay();
  const endOfDay = endOfWorkDayExclusive();
  const lookbackStart = new Date(startOfDay.getTime() - 36 * 60 * 60 * 1000);
  const offlineLogs = loadOfflineQueuedTimeLogRows(userId, currentTimeLogId);
  const offlineCount = offlineLogs.length;

  try {
    const { isBackendTimeLogsEnabled, getTodayTimeLogs } = require('./backend-time-logs');
    if (isBackendTimeLogsEnabled()) {
      let timeLogs = [];
      try {
        timeLogs = await getTodayTimeLogs(userId);
      } catch (fetchErr) {
        console.warn(
          '⚠️ [TODAY-TIME-LOG-STATS] Backend fetch failed — using offline queue:',
          fetchErr?.message || fetchErr,
        );
        return finalizeTodayAggregate(offlineLogs, currentTimeLogId, isTracking, offlineCount);
      }
      const overlapping = logsOverlappingLocalDay(timeLogs);
      const withActive = await includeCrossMidnightActiveLog(
        supabase,
        userId,
        currentTimeLogId,
        overlapping,
        isTracking,
      );
      const merged = mergeRemoteAndOfflineLogs(withActive, offlineLogs, currentTimeLogId);
      return finalizeTodayAggregate(merged, currentTimeLogId, isTracking, offlineCount);
    }
  } catch (err) {
    console.warn('⚠️ [TODAY-TIME-LOG-STATS] Backend path failed, trying Supabase:', err.message);
  }

  if (!supabase) {
    // Offline-only: still show queued + live local time (never wipe the clock).
    if (offlineCount > 0 || (isTracking && currentTimeLogId)) {
      return finalizeTodayAggregate(offlineLogs, currentTimeLogId, isTracking, offlineCount);
    }
    const err = new Error('No database backend available for today time stats');
    err.code = 'TODAY_STATS_UNAVAILABLE';
    throw err;
  }

  const { data: timeLogs, error } = await supabase
    .from('time_logs')
    .select('id, start_time, end_time, status')
    .eq('user_id', userId)
    .gte('start_time', lookbackStart.toISOString())
    .lt('start_time', endOfDay.toISOString())
    .order('start_time', { ascending: false });

  if (error) {
    console.warn('⚠️ [TODAY-TIME-LOG-STATS] Query failed — using offline queue:', error.message);
    if (offlineCount > 0 || (isTracking && currentTimeLogId)) {
      return finalizeTodayAggregate(offlineLogs, currentTimeLogId, isTracking, offlineCount);
    }
    const err = new Error(error.message || 'Today time stats query failed');
    err.code = 'TODAY_STATS_QUERY_FAILED';
    throw err;
  }

  const overlapping = logsOverlappingLocalDay(timeLogs);
  const withActive = await includeCrossMidnightActiveLog(
    supabase,
    userId,
    currentTimeLogId,
    overlapping,
    isTracking,
  );
  const merged = mergeRemoteAndOfflineLogs(withActive, offlineLogs, currentTimeLogId);
  return finalizeTodayAggregate(merged, currentTimeLogId, isTracking, offlineCount);
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
};
