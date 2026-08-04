/**
 * Today's effective / non-effective seconds for desktop UI.
 * Same formula as monthly report / Pulse payroll:
 *   non_effective = min(total, low_activity + idle)
 *   effective     = total - non_effective
 */

const {
  computeEffectiveSeconds,
  resolveScreenshotIntervalSeconds,
  resolveScreenshotIntervalMinutes,
} = require('./effective-time');
const { normalizeTenantUserId } = require('./tenant-user-id');

const LOW_ACTIVITY_PERCENT = 10;

function sumIdleSecondsFromLogs(timeLogs, dayStartMs, dayEndMs) {
  let idle = 0;
  for (const log of timeLogs || []) {
    const logIdle = Math.max(0, Math.floor(Number(log.idle_seconds) || 0));
    if (!logIdle || !log.start_time) continue;

    const startMs = new Date(log.start_time).getTime();
    const endMs = log.end_time ? new Date(log.end_time).getTime() : Date.now();
    const overlapStart = Math.max(startMs, dayStartMs);
    const overlapEnd = Math.min(endMs, dayEndMs);
    const overlapSec = Math.max(0, Math.floor((overlapEnd - overlapStart) / 1000));
    const sessionSec = Math.max(1, Math.floor((endMs - startMs) / 1000));
    if (overlapSec <= 0) continue;
    // Pro-rate idle when a session spans midnight.
    idle += Math.floor((logIdle * overlapSec) / sessionSec);
  }
  return idle;
}

/**
 * @param {object[]} screenshots
 * @param {number} intervalSeconds — exact capture interval in seconds
 * @param {number} dayStartMs
 * @param {number} dayEndMs
 */
function sumLowActivitySecondsFromScreenshots(screenshots, intervalSeconds, dayStartMs, dayEndMs) {
  const lowSecondsPerShot = Math.max(10, Math.floor(Number(intervalSeconds) || 60));
  let low = 0;
  for (const shot of screenshots || []) {
    const pct = Number(shot.activity_percent);
    if (!Number.isFinite(pct) || pct >= LOW_ACTIVITY_PERCENT) continue;
    const capturedAt = shot.captured_at || shot.capturedAt;
    if (capturedAt) {
      const ms = new Date(capturedAt).getTime();
      if (!(ms >= dayStartMs && ms < dayEndMs)) continue;
    }
    low += lowSecondsPerShot;
  }
  return low;
}

/**
 * @param {{ userId: string|number, totalSeconds: number, config?: object, supabase?: object }} opts
 */
async function computeTodayEffectiveStats(opts = {}) {
  const config = opts.config || global.config;
  const userId = normalizeTenantUserId(opts.userId);
  const totalSeconds = Math.max(0, Math.floor(Number(opts.totalSeconds) || 0));
  if (!userId) {
    return {
      ...computeEffectiveSeconds(totalSeconds, 0, 0),
      idleSeconds: 0,
      lowActivitySeconds: 0,
    };
  }

  const {
    startOfWorkDay,
    endOfWorkDayExclusive,
  } = require('./work-timezone');
  const dayStart = startOfWorkDay();
  const dayEnd = endOfWorkDayExclusive();
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();
  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();

  let idleSeconds = 0;
  let lowActivitySeconds = 0;
  const intervalSeconds = resolveScreenshotIntervalSeconds(config);

  try {
    const { isBackendRdsEnabled, getTimeLogsInRange } = require('./backend-rds-reads');
    if (isBackendRdsEnabled(config)) {
      const logs = await getTimeLogsInRange(
        userId,
        { start: dayStartIso, end: dayEndIso },
        config,
      );
      idleSeconds = sumIdleSecondsFromLogs(logs, dayStartMs, dayEndMs);
    } else if (opts.supabase) {
      const { data } = await opts.supabase
        .from('time_logs')
        .select('id, start_time, end_time, idle_seconds')
        .eq('user_id', userId)
        .gte('start_time', dayStartIso)
        .lt('start_time', dayEndIso);
      idleSeconds = sumIdleSecondsFromLogs(data || [], dayStartMs, dayEndMs);
    }
  } catch (err) {
    console.warn('⚠️ [TODAY-EFFECTIVE] Idle fetch failed:', err?.message || err);
  }

  try {
    // Prefer screenshots already loaded by the caller (monthly report) so Today
    // and Month never diverge from different fetch/limit results.
    let screenshots = Array.isArray(opts.screenshots) ? opts.screenshots : null;
    if (!screenshots) {
      const { fetchScreenshotsFromBackend, usesBackendScreenshots } = require('./backend-screenshots');
      const { isBackendRdsEnabled } = require('./backend-rds-reads');
      screenshots = [];
      if (usesBackendScreenshots(config) || isBackendRdsEnabled(config)) {
        screenshots = await fetchScreenshotsFromBackend(userId, config, {
          startIso: dayStartIso,
          endIso: dayEndIso,
          limit: 500,
        }) || [];
      } else if (opts.supabase) {
        const { data } = await opts.supabase
          .from('screenshots')
          .select('captured_at, activity_percent')
          .eq('user_id', userId)
          .gte('captured_at', dayStartIso)
          .lt('captured_at', dayEndIso)
          .limit(500);
        screenshots = data || [];
      }
    }
    lowActivitySeconds = sumLowActivitySecondsFromScreenshots(
      screenshots,
      intervalSeconds,
      dayStartMs,
      dayEndMs,
    );
  } catch (err) {
    console.warn('⚠️ [TODAY-EFFECTIVE] Low-activity fetch failed:', err?.message || err);
  }

  const eff = computeEffectiveSeconds(totalSeconds, lowActivitySeconds, idleSeconds);
  return {
    ...eff,
    idleSeconds,
    lowActivitySeconds,
    intervalSeconds,
  };
}

module.exports = {
  computeTodayEffectiveStats,
  sumIdleSecondsFromLogs,
  sumLowActivitySecondsFromScreenshots,
  LOW_ACTIVITY_PERCENT,
  resolveScreenshotIntervalMinutes,
};
