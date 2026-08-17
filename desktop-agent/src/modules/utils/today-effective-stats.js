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
/**
 * @param {Array<{startMs:number,endMs:number}>} idleIntervals — periods already
 *   counted as idle. A low-activity screenshot inside one of these is the SAME
 *   non-effective time, not additional non-effective time.
 */
function sumLowActivitySecondsFromScreenshots(
  screenshots,
  intervalSeconds,
  dayStartMs,
  dayEndMs,
  idleIntervals = [],
) {
  const lowSecondsPerShot = Math.max(10, Math.floor(Number(intervalSeconds) || 60));
  const insideIdle = (ms) =>
    idleIntervals.some((iv) => ms >= iv.startMs && ms < iv.endMs);

  let low = 0;
  for (const shot of screenshots || []) {
    const pct = Number(shot.activity_percent);
    if (!Number.isFinite(pct) || pct >= LOW_ACTIVITY_PERCENT) continue;
    const capturedAt = shot.captured_at || shot.capturedAt;
    if (capturedAt) {
      const ms = new Date(capturedAt).getTime();
      if (!(ms >= dayStartMs && ms < dayEndMs)) continue;
      // Idle minutes produce zero-activity screenshots by definition. Counting
      // both made non_effective = idle + low_activity exceed the total, so the
      // min() capped it and an entire day read as non-effective.
      if (insideIdle(ms)) continue;
    }
    low += lowSecondsPerShot;
  }
  return low;
}

/** Idle periods as intervals, clipped to the work day. */
function idleIntervalsFromLogs(idleLogs, dayStartMs, dayEndMs) {
  const out = [];
  for (const log of idleLogs || []) {
    const startMs = new Date(log.idle_start || log.start_time).getTime();
    if (!Number.isFinite(startMs)) continue;
    const rawEnd = log.idle_end || log.end_time;
    const endMs = rawEnd
      ? new Date(rawEnd).getTime()
      : startMs + Math.max(0, Number(log.duration_seconds) || 0) * 1000;
    if (!Number.isFinite(endMs) || endMs <= startMs) continue;
    const lo = Math.max(startMs, dayStartMs);
    const hi = Math.min(endMs, dayEndMs);
    if (hi > lo) out.push({ startMs: lo, endMs: hi });
  }
  return out;
}

/**
 * @param {{ userId: string|number, totalSeconds: number, config?: object }} opts
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
      computed: false,
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
  // Both inputs come off the network. A failed fetch is NOT "zero idle" — read
  // that way it makes non-effective collapse to 0 and reports the whole day as
  // effective, which is the inflation this was trying to avoid. Track whether we
  // actually measured, so callers can keep the last known figure instead.
  let idleMeasured = false;
  let lowActivityMeasured = false;
  const intervalSeconds = resolveScreenshotIntervalSeconds(config);

  // Idle intervals, not just a total. The interval boundaries are what let the
  // low-activity count below skip screenshots that fall inside idle time.
  let idleIntervals = [];
  try {
    const { isBackendRdsEnabled, getTimeLogsInRange, listIdleLogs } = require('./backend-rds-reads');
    if (isBackendRdsEnabled(config)) {
      try {
        const idleLogs = await listIdleLogs(
          userId,
          { start: dayStartIso, end: dayEndIso, limit: 2000 },
          config,
        );
        idleIntervals = idleIntervalsFromLogs(idleLogs, dayStartMs, dayEndMs);
      } catch (idleErr) {
        console.warn('⚠️ [TODAY-EFFECTIVE] Idle interval fetch failed:', idleErr?.message || idleErr);
      }

      const logs = await getTimeLogsInRange(
        userId,
        { start: dayStartIso, end: dayEndIso },
        config,
      );
      idleSeconds = sumIdleSecondsFromLogs(logs, dayStartMs, dayEndMs);
      idleMeasured = true;
    } else {
      console.warn('⚠️ [TODAY-EFFECTIVE] RDS reads disabled — idle unknown, not zero');
    }
  } catch (err) {
    console.warn('⚠️ [TODAY-EFFECTIVE] Idle fetch failed:', err?.message || err);
  }

  try {
    // Prefer screenshots already loaded by the caller (monthly report) so Today
    // and Month never diverge from different fetch/limit results.
    let screenshots = Array.isArray(opts.screenshots) ? opts.screenshots : null;
    if (screenshots) {
      lowActivityMeasured = true;
    } else {
      const { fetchScreenshotsFromBackend, usesBackendScreenshots } = require('./backend-screenshots');
      const { isBackendRdsEnabled } = require('./backend-rds-reads');
      screenshots = [];
      if (usesBackendScreenshots(config) || isBackendRdsEnabled(config)) {
        screenshots = await fetchScreenshotsFromBackend(userId, config, {
          startIso: dayStartIso,
          endIso: dayEndIso,
          limit: 500,
        }) || [];
        lowActivityMeasured = true;
      }
    }
    lowActivitySeconds = sumLowActivitySecondsFromScreenshots(
      screenshots,
      intervalSeconds,
      dayStartMs,
      dayEndMs,
      idleIntervals,
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
    // False when either input could not be read (offline). Callers must hold the
    // previous figure rather than paint 0 non-effective / 100% effective.
    computed: idleMeasured && lowActivityMeasured,
  };
}

module.exports = {
  computeTodayEffectiveStats,
  sumIdleSecondsFromLogs,
  sumLowActivitySecondsFromScreenshots,
  LOW_ACTIVITY_PERCENT,
  resolveScreenshotIntervalMinutes,
};
