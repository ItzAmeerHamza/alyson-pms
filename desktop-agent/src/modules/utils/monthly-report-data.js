/**
 * Build monthly work report payload for the Time Tracker "This Month at a Glance" section.
 * Registered early from main.js so the renderer can invoke before DataStatsManager finishes init.
 */

const { isBackendRdsEnabled, getTimeLogsInRange } = require('./backend-rds-reads');
const { fetchScreenshotsFromBackend } = require('./backend-screenshots');
const { listUserProjects } = require('./backend-time-logs');
const { normalizeTenantUserId } = require('./tenant-user-id');
const {
  computeEffectiveSeconds,
  resolveScreenshotIntervalSeconds,
} = require('./effective-time');

function usesRdsBackend(config) {
  try {
    return isBackendRdsEnabled(config);
  } catch {
    return false;
  }
}

async function fetchTimeLogs(userId, opts, config) {
  if (!usesRdsBackend(config)) {
    return { data: [], error: { message: 'Database service not available' } };
  }
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

/**
 * @param {{ global: object, config: object, monthOffset?: number }} deps
 */
async function buildMonthlyReportData({ global, config, monthOffset = 0 }) {
  if (!usesRdsBackend(config)) {
    return { error: 'Database service not available' };
  }

  const {
    initWorkTimezone,
    workMonthBounds,
    workDayBoundsForYmd,
    getWorkTimezone,
    workDateKey,
  } = require('./work-timezone');
  // Prefer workspace timezone already on config (set after login). Avoid
  // resetting to Pacific when config.work_timezone is still unset.
  if (config?.work_timezone || config?.WORK_TIMEZONE || process.env.WORK_TIMEZONE) {
    initWorkTimezone(config);
  }

  const rawUserId = global.currentUserId || config?.user_id || config?.userId;
  const userId = normalizeTenantUserId(rawUserId);
  if (!userId) return { error: 'User not authenticated' };

  const parsedOffset = Number(monthOffset);
  const offset = Number.isFinite(parsedOffset) ? Math.min(0, Math.max(-24, Math.trunc(parsedOffset))) : 0;
  const today = new Date();
  const currentMonth = workMonthBounds(today);
  let targetYear = currentMonth.year;
  let targetMonth = currentMonth.month + offset;
  while (targetMonth < 1) {
    targetMonth += 12;
    targetYear -= 1;
  }
  while (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }
  const monthRefDate = new Date(Date.UTC(targetYear, targetMonth - 1, 15, 12, 0, 0));
  const {
    year: workYear,
    month: workMonth,
    startMs: mStartMs,
    endExclusiveMs: mEndMs,
    daysInMonth,
  } = workMonthBounds(monthRefDate);
  const monthStartIso = new Date(mStartMs).toISOString();
  const monthEndExclusive = new Date(mEndMs).toISOString();
  const workTz = getWorkTimezone();

  let timeLogs = [];
  let screenshots = [];
  const projectNameById = {};

  {
    const { data, error } = await fetchTimeLogs(userId, {
      start: monthStartIso,
      end: monthEndExclusive,
    }, config);
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
  }

  const isTracking = !!(global.isTracking || global.trackingManager?.isTracking);
  const currentTimeLogId = isTracking ? global.trackingManager?.currentTimeLogId : null;

  const mEndExclusiveMs = mEndMs;
  const clamp = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

  const dailyBreakdown = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${workYear}-${String(workMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const { startMs: dayStartMs } = workDayBoundsForYmd(workYear, workMonth, d);
    dailyBreakdown.push({
      date: dateKey,
      dayName: new Date(dayStartMs).toLocaleDateString('en-US', { timeZone: workTz, weekday: 'short' }),
      totalSeconds: 0,
      idleSeconds: 0,
      lowSeconds: 0,
      sessions: 0,
    });
  }

  const projectMap = {};
  const sessions = [];
  // Per-day intervals so overlapping sessions are not double-counted
  // (same merge rule as the big "Tracked Time Today" clock).
  const dayIntervals = Array.from({ length: daysInMonth }, () => []);

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

    if (endMs <= mStartMs || startMs >= mEndExclusiveMs) return;

    const clampedSeconds = Math.floor(clamp(startMs, endMs, mStartMs, mEndExclusiveMs) / 1000);
    const projectName =
      log.projects?.name || projectNameById[log.project_id] || 'No Project';
    const projectId = log.project_id || 'none';
    const logIdle = Math.max(0, Math.floor(Number(log.idle_seconds) || 0));

    for (let d = 1; d <= daysInMonth; d++) {
      const { startMs: dayStartMs, endMs: dayEndMs } = workDayBoundsForYmd(workYear, workMonth, d);
      const sliceStart = Math.max(startMs, dayStartMs);
      const sliceEnd = Math.min(endMs, dayEndMs);
      if (sliceEnd > sliceStart) {
        dayIntervals[d - 1].push({ startMs: sliceStart, endMs: sliceEnd });
        // Approximate idle share for the day from session idle_seconds.
        const sec = Math.floor((sliceEnd - sliceStart) / 1000);
        if (clampedSeconds > 0 && logIdle > 0 && sec > 0) {
          dailyBreakdown[d - 1].idleSeconds =
            (dailyBreakdown[d - 1].idleSeconds || 0) +
            Math.floor((logIdle * sec) / clampedSeconds);
        }
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

  const { mergeIntervalsSeconds, computeTodayTimeLogSeconds } = require('./today-time-log-stats');
  for (let i = 0; i < daysInMonth; i++) {
    dailyBreakdown[i].totalSeconds = mergeIntervalsSeconds(dayIntervals[i]);
  }

  const projectBreakdown = Object.values(projectMap)
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  let avgActivityPercent = 0;
  if (screenshots.length > 0) {
    const sum = screenshots.reduce((acc, s) => acc + (s.activity_percent || 0), 0);
    avgActivityPercent = Math.round(sum / screenshots.length);
  }

  // Low activity: same interval seconds as Today cards (never minute-rounded).
  const intervalSeconds = resolveScreenshotIntervalSeconds(config || global.config);
  const lowSecondsPerShot = intervalSeconds;
  for (const shot of screenshots) {
    const pct = Number(shot.activity_percent);
    if (!Number.isFinite(pct) || pct >= 10) continue;
    const capturedAt = shot.captured_at || shot.capturedAt;
    if (!capturedAt) continue;
    const shotMs = new Date(capturedAt).getTime();
    for (let d = 1; d <= daysInMonth; d++) {
      const { startMs: dayStartMs, endMs: dayEndMs } = workDayBoundsForYmd(workYear, workMonth, d);
      if (shotMs >= dayStartMs && shotMs < dayEndMs) {
        dailyBreakdown[d - 1].lowSeconds =
          (dailyBreakdown[d - 1].lowSeconds || 0) + lowSecondsPerShot;
        break;
      }
    }
  }

  // TODAY must use the identical helper as the big tracker clock.
  const todayKey = workDateKey(today);
  const todayIdx = dailyBreakdown.findIndex((d) => d.date === todayKey);
  try {
    if (todayIdx >= 0) {
      // Align chart "today" to the same helper as the big clock, then take the
      // MAX so we never paint Month below what the employee already sees (or vice versa).
      const todayAgg = await computeTodayTimeLogSeconds(
        userId,
        currentTimeLogId,
        isTracking,
      );
      const fromTodayHelper = Math.max(
        0,
        Math.floor(
          Number(
            isTracking
              ? todayAgg.totalTime
              : todayAgg.completedClosedSeconds,
          ) || 0,
        ),
      );
      // Never lower today's bar vs the merged day total already computed.
      const todayTotal = Math.max(
        fromTodayHelper,
        Math.floor(Number(dailyBreakdown[todayIdx].totalSeconds) || 0),
      );
      dailyBreakdown[todayIdx].totalSeconds = todayTotal;

      const { computeTodayEffectiveStats } = require('./today-effective-stats');
      const todayEff = await computeTodayEffectiveStats({
        userId,
        totalSeconds: todayTotal,
        config: config || global.config,
        screenshots, // same rows Month already fetched — no second divergent query
      });
      dailyBreakdown[todayIdx].idleSeconds = todayEff.idleSeconds || 0;
      dailyBreakdown[todayIdx].lowSeconds = todayEff.lowActivitySeconds || 0;
      dailyBreakdown[todayIdx].nonEffectiveSeconds = todayEff.nonEffectiveSeconds || 0;
      dailyBreakdown[todayIdx].effectiveSeconds = todayEff.effectiveSeconds || 0;
    }
  } catch (todayAlignErr) {
    console.warn(
      '⚠️ [MONTHLY-REPORT] Could not align today with tracker clock:',
      todayAlignErr?.message || todayAlignErr,
    );
  }

  // Recompute month total after today/merge alignment.
  const totalSeconds = dailyBreakdown.reduce((sum, d) => sum + d.totalSeconds, 0);

  const weeklyBreakdown = [];
  if (dailyBreakdown.length > 0) {
    let weekStart = dailyBreakdown[0].date;
    let weekTotal = 0;
    dailyBreakdown.forEach((day, idx) => {
      weekTotal += day.totalSeconds;
      const isSunday = day.dayName === 'Sun';
      const isLast = idx === dailyBreakdown.length - 1;
      if (isSunday || isLast) {
        weeklyBreakdown.push({
          weekStart,
          weekEnd: day.date,
          totalTime: weekTotal,
        });
        if (!isLast) {
          weekStart = dailyBreakdown[idx + 1].date;
          weekTotal = 0;
        }
      }
    });
  }

  let idleSecondsTotal = 0;
  let lowSecondsTotal = 0;
  let nonEffectiveSeconds = 0;
  let effectiveSeconds = 0;
  for (const day of dailyBreakdown) {
    const dayEff = computeEffectiveSeconds(
      day.totalSeconds,
      day.lowSeconds || 0,
      day.idleSeconds || 0,
    );
    day.nonEffectiveSeconds = dayEff.nonEffectiveSeconds;
    day.effectiveSeconds = dayEff.effectiveSeconds;
    idleSecondsTotal += day.idleSeconds || 0;
    lowSecondsTotal += day.lowSeconds || 0;
    nonEffectiveSeconds += day.nonEffectiveSeconds || 0;
    effectiveSeconds += day.effectiveSeconds || 0;
  }

  // Re-assert identity: effective + non-effective === total (per day and month).
  effectiveSeconds = Math.max(0, totalSeconds - nonEffectiveSeconds);

  const activeDays = dailyBreakdown.filter((d) => d.totalSeconds > 0).length;

  return {
    sessions: sessions
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 15),
    projectBreakdown,
    dailyBreakdown,
    weeklyBreakdown,
    totalSeconds,
    nonEffectiveSeconds,
    effectiveSeconds,
    idleSeconds: idleSecondsTotal,
    lowActivitySeconds: lowSecondsTotal,
    screenshotIntervalSeconds: intervalSeconds,
    screenshotIntervalMinutes: Math.max(1, Math.round(intervalSeconds / 60) || 1),
    todayDate: todayKey,
    avgActivityPercent,
    totalSessions: sessions.length,
    activeDays,
    screenshotCount: screenshots.length,
    monthLabel: new Date(mStartMs).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: workTz,
    }),
  };
}

module.exports = { buildMonthlyReportData };
