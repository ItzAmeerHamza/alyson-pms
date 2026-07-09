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

function aggregateTimeLogRows(timeLogs, currentTimeLogId, isTracking = false) {
  let completedClosedSeconds = 0;
  let ongoingCurrentSessionSeconds = 0;
  const now = Date.now();
  const dayRef = new Date();

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
      ongoingCurrentSessionSeconds += secondsWithinWorkDay(start, now, dayRef);
    } else if (log.end_time) {
      const end = new Date(log.end_time).getTime();
      completedClosedSeconds += secondsWithinWorkDay(start, end, dayRef);
    }
  }

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

async function computeTodayTimeLogSeconds(supabase, userId, currentTimeLogId, isTracking = false) {
  if (!userId) {
    return { completedClosedSeconds: 0, ongoingCurrentSessionSeconds: 0, totalTime: 0, timeLogsCount: 0 };
  }

  const startOfDay = startOfWorkDay();
  const endOfDay = endOfWorkDayExclusive();
  const lookbackStart = new Date(startOfDay.getTime() - 36 * 60 * 60 * 1000);

  try {
    const { isBackendTimeLogsEnabled, getTodayTimeLogs } = require('./backend-time-logs');
    if (isBackendTimeLogsEnabled()) {
      const timeLogs = await getTodayTimeLogs(userId);
      const overlapping = logsOverlappingLocalDay(timeLogs);
      const withActive = await includeCrossMidnightActiveLog(
        supabase,
        userId,
        currentTimeLogId,
        overlapping,
        isTracking,
      );
      return aggregateTimeLogRows(withActive, currentTimeLogId, isTracking);
    }
  } catch (err) {
    console.warn('⚠️ [TODAY-TIME-LOG-STATS] Backend query failed:', err.message);
    const { normalizeTenantUserId } = require('./tenant-user-id');
    if (normalizeTenantUserId(userId)) {
      return { completedClosedSeconds: 0, ongoingCurrentSessionSeconds: 0, totalTime: 0, timeLogsCount: 0 };
    }
  }

  if (!supabase) {
    return { completedClosedSeconds: 0, ongoingCurrentSessionSeconds: 0, totalTime: 0, timeLogsCount: 0 };
  }

  const { data: timeLogs, error } = await supabase
    .from('time_logs')
    .select('id, start_time, end_time, status')
    .eq('user_id', userId)
    .gte('start_time', lookbackStart.toISOString())
    .lt('start_time', endOfDay.toISOString())
    .order('start_time', { ascending: false });

  if (error) {
    console.warn('⚠️ [TODAY-TIME-LOG-STATS] Query failed:', error.message);
    return { completedClosedSeconds: 0, ongoingCurrentSessionSeconds: 0, totalTime: 0, timeLogsCount: 0 };
  }

  const overlapping = logsOverlappingLocalDay(timeLogs);
  const withActive = await includeCrossMidnightActiveLog(
    supabase,
    userId,
    currentTimeLogId,
    overlapping,
    isTracking,
  );
  return aggregateTimeLogRows(withActive, currentTimeLogId, isTracking);
}

module.exports = {
  computeTodayTimeLogSeconds,
  startOfLocalDay,
  endOfLocalDayExclusive,
  localDateKey,
  elapsedSecondsSinceLocalMidnight,
  secondsWithinLocalDay,
  logsOverlappingLocalDay,
};
