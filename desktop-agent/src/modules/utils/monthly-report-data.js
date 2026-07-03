/**
 * Build monthly work report payload for the Time Tracker "This Month at a Glance" section.
 * Registered early from main.js so the renderer can invoke before DataStatsManager finishes init.
 */

const { isBackendRdsEnabled, getTimeLogsInRange } = require('./backend-rds-reads');
const { fetchScreenshotsFromBackend } = require('./backend-screenshots');
const { listUserProjects } = require('./backend-time-logs');
const { normalizeTenantUserId } = require('./tenant-user-id');

function usesRdsBackend(config) {
  try {
    return isBackendRdsEnabled(config);
  } catch {
    return false;
  }
}

async function fetchTimeLogs(userId, opts, config, supabaseService) {
  if (usesRdsBackend(config)) {
    try {
      const data = await getTimeLogsInRange(
        userId,
        { start: opts.start, end: opts.end },
        config,
      );
      return { data, error: null };
    } catch (err) {
      return { data: [], error: { message: err?.message || String(err) } };
    }
  }
  if (!supabaseService) {
    return { data: [], error: { message: 'Database service not available' } };
  }
  const { data, error } = await supabaseService
    .from('time_logs')
    .select('id, start_time, end_time, project_id, status, projects(name)')
    .eq('user_id', userId)
    .gte('start_time', opts.start)
    .lt('start_time', opts.end)
    .order('start_time', { ascending: false });
  return { data, error };
}

/**
 * @param {{ global: object, config: object, supabaseService?: object }} deps
 */
async function buildMonthlyReportData({ global, config, supabaseService }) {
  const useRds = usesRdsBackend(config);
  if (!useRds && !supabaseService) {
    return { error: 'Database service not available' };
  }

  const rawUserId = global.currentUserId || config?.user_id || config?.userId;
  const userId = normalizeTenantUserId(rawUserId);
  if (!userId) return { error: 'User not authenticated' };

  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthStartIso = startOfMonth.toISOString();
  const monthEndExclusive = new Date(
    endOfMonth.getFullYear(),
    endOfMonth.getMonth(),
    endOfMonth.getDate() + 1,
  ).toISOString();
  const daysInMonth = endOfMonth.getDate();

  let timeLogs = [];
  let screenshots = [];
  const projectNameById = {};

  if (useRds) {
    const { data, error } = await fetchTimeLogs(userId, {
      start: monthStartIso,
      end: monthEndExclusive,
    }, config, supabaseService);
    if (error) return { error: error.message };
    timeLogs = data || [];

    try {
      screenshots = await fetchScreenshotsFromBackend(userId, config, {
        startIso: monthStartIso,
        endIso: monthEndExclusive,
        limit: 500,
      }) || [];
    } catch (screenshotErr) {
      console.warn('⚠️ [MONTHLY-REPORT] Screenshots fetch failed:', screenshotErr.message);
    }

    try {
      const projects = await listUserProjects(userId, config);
      for (const p of projects || []) {
        const id = p.project_id || p.projects?.id;
        const name = p.name || p.projects?.name;
        if (id) projectNameById[id] = name || 'Unknown Project';
      }
    } catch (projectErr) {
      console.warn('⚠️ [MONTHLY-REPORT] Projects fetch failed:', projectErr.message);
    }
  } else {
    const [timeLogsResult, screenshotsResult] = await Promise.all([
      supabaseService
        .from('time_logs')
        .select('id, start_time, end_time, project_id, status, projects(name)')
        .eq('user_id', userId)
        .gte('start_time', monthStartIso)
        .lt('start_time', monthEndExclusive)
        .order('start_time', { ascending: false }),
      supabaseService
        .from('screenshots')
        .select('activity_percent')
        .eq('user_id', userId)
        .gte('captured_at', monthStartIso)
        .lt('captured_at', monthEndExclusive),
    ]);

    if (timeLogsResult.error) return { error: timeLogsResult.error.message };
    timeLogs = timeLogsResult.data || [];
    screenshots = screenshotsResult.data || [];
  }

  const isTracking = !!(global.isTracking || global.trackingManager?.isTracking);
  const currentTimeLogId = isTracking ? global.trackingManager?.currentTimeLogId : null;

  const mStartMs = startOfMonth.getTime();
  const mEndMs = new Date(monthEndExclusive).getTime();
  const clamp = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

  const localDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const dailyBreakdown = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(today.getFullYear(), today.getMonth(), d);
    dailyBreakdown.push({
      date: localDateStr(dt),
      dayName: dt.toLocaleDateString('en-US', { weekday: 'short' }),
      totalSeconds: 0,
      sessions: 0,
    });
  }

  const projectMap = {};
  const sessions = [];

  timeLogs.forEach((log) => {
    if (!log.start_time) return;
    const startMs = new Date(log.start_time).getTime();

    let endMs;
    if (log.end_time) {
      endMs = new Date(log.end_time).getTime();
    } else if (isTracking && log.id === currentTimeLogId) {
      endMs = Date.now();
    } else {
      return;
    }

    if (endMs <= mStartMs || startMs >= mEndMs) return;

    const clampedSeconds = Math.floor(clamp(startMs, endMs, mStartMs, mEndMs) / 1000);
    const projectName =
      log.projects?.name || projectNameById[log.project_id] || 'No Project';
    const projectId = log.project_id || 'none';

    for (let d = 0; d < daysInMonth; d++) {
      const dayStartMs = new Date(today.getFullYear(), today.getMonth(), d + 1).getTime();
      const dayEndMs = new Date(today.getFullYear(), today.getMonth(), d + 2).getTime();
      const sec = Math.floor(clamp(startMs, endMs, dayStartMs, dayEndMs) / 1000);
      if (sec > 0) {
        dailyBreakdown[d].totalSeconds += sec;
      }
    }

    if (!projectMap[projectId]) {
      projectMap[projectId] = { projectId, projectName, totalSeconds: 0, sessionCount: 0 };
    }
    projectMap[projectId].totalSeconds += clampedSeconds;
    projectMap[projectId].sessionCount += 1;

    sessions.push({
      id: log.id,
      projectName,
      startTime: log.start_time,
      endTime: log.end_time,
      durationSeconds: clampedSeconds,
      status: log.end_time ? 'completed' : 'active',
    });
  });

  const projectBreakdown = Object.values(projectMap)
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  const totalSeconds = dailyBreakdown.reduce((sum, d) => sum + d.totalSeconds, 0);

  const weeklyBreakdown = [];
  const tempWeekStart = new Date(startOfMonth);
  tempWeekStart.setDate(tempWeekStart.getDate() - tempWeekStart.getDay());
  while (tempWeekStart <= endOfMonth) {
    const wStart = new Date(tempWeekStart);
    const wEnd = new Date(
      tempWeekStart.getFullYear(),
      tempWeekStart.getMonth(),
      tempWeekStart.getDate() + 6,
    );
    const wStartStr = localDateStr(wStart);
    const wEndStr = localDateStr(wEnd);
    let weekTotal = 0;
    dailyBreakdown.forEach((day) => {
      if (day.date >= wStartStr && day.date <= wEndStr) {
        weekTotal += day.totalSeconds;
      }
    });
    weeklyBreakdown.push({
      weekStart: wStartStr,
      weekEnd: wEndStr,
      totalTime: weekTotal,
    });
    tempWeekStart.setDate(tempWeekStart.getDate() + 7);
  }

  let avgActivityPercent = 0;
  if (screenshots.length > 0) {
    const sum = screenshots.reduce((acc, s) => acc + (s.activity_percent || 0), 0);
    avgActivityPercent = Math.round(sum / screenshots.length);
  }

  const activeDays = dailyBreakdown.filter((d) => d.totalSeconds > 0).length;

  return {
    sessions: sessions
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 15),
    projectBreakdown,
    dailyBreakdown,
    weeklyBreakdown,
    totalSeconds,
    avgActivityPercent,
    totalSessions: sessions.length,
    activeDays,
    screenshotCount: screenshots.length,
    monthLabel: startOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

module.exports = { buildMonthlyReportData };
