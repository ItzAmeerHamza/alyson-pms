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
const { overlapSeconds, screenshotOwnedRangeMs } = require('./screenshot-owned-interval');
const { mergeIntervalsSeconds } = require('./today-time-log-stats');

const LOW_ACTIVITY_PERCENT = 10;
// Same floor Pulse uses. The agent records idle after 60s so the raw periods
// exist, but a pause under five minutes is not non-effective time.
const MIN_IDLE_REPORT_SECONDS = 5 * 60;
// Same streak Pulse uses: three consecutive quiet minutes at 1/min capture.
const SUSTAINED_LOW_MINUTES = 3;

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
  const capMs = Math.max(10_000, Math.floor(Number(intervalSeconds) || 60) * 1000);
  const minRunSeconds = SUSTAINED_LOW_MINUTES * 60;
  const insideIdle = (ms) =>
    idleIntervals.some((iv) => ms >= iv.startMs && ms < iv.endMs);

  const flags = [];
  for (const shot of screenshots || []) {
    const capturedAt = shot.captured_at || shot.capturedAt;
    const ms = capturedAt ? new Date(capturedAt).getTime() : NaN;
    if (Number.isFinite(ms) && !(ms >= dayStartMs && ms < dayEndMs)) continue;
    const pct = Number(shot.activity_percent);
    const isLow =
      Number.isFinite(pct) &&
      pct < LOW_ACTIVITY_PERCENT &&
      !(Number.isFinite(ms) && insideIdle(ms));
    flags.push({ ms: Number.isFinite(ms) ? ms : 0, isLow, ownedSeconds: 0 });
  }
  flags.sort((a, b) => a.ms - b.ms);

  for (let i = 0; i < flags.length; i += 1) {
    const prev = i > 0 ? flags[i - 1].ms : null;
    const next = i + 1 < flags.length ? flags[i + 1].ms : null;
    const owned = screenshotOwnedRangeMs(prev, flags[i].ms, next, capMs);
    let remaining = (owned.endMs - owned.startMs) / 1000;
    for (const cut of idleIntervals) remaining -= overlapSeconds(owned, cut);
    flags[i].ownedSeconds = Math.max(0, Math.round(remaining));
  }

  let low = 0;
  let i = 0;
  while (i < flags.length) {
    if (!flags[i].isLow) {
      i += 1;
      continue;
    }
    let j = i;
    let runSeconds = 0;
    while (j < flags.length && flags[j].isLow) {
      runSeconds += flags[j].ownedSeconds;
      j += 1;
    }
    if (runSeconds >= minRunSeconds) low += runSeconds;
    i = j;
  }
  return low;
}

/** Idle periods as intervals, clipped to the work day. Sub-5-minute pauses are ignored. */
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
    if ((endMs - startMs) / 1000 < MIN_IDLE_REPORT_SECONDS) continue;
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

  // Display-only overlay. The caller already owns totalSeconds (the clock).
  // This function never writes sessions, idle, or the offline queue.
  const { isLikelyOffline } = require('./backend-time-logs');
  if (isLikelyOffline()) {
    return {
      ...computeEffectiveSeconds(totalSeconds, 0, 0),
      idleSeconds: 0,
      lowActivitySeconds: 0,
      intervalSeconds,
      computed: false,
      source: 'offline',
    };
  }

  // Prefer the same numbers Pulse already computed for the web. The agent used
  // to work these out itself and the two drifted: it counted isolated low
  // screenshots and treated any pause over a minute as idle, so the same day
  // read 24m non-effective on the web and 1h16m on the desktop.
  try {
    const { isBackendRdsEnabled, getEffectiveStats } = require('./backend-rds-reads');
    const { getWorkTimezone } = require('./work-timezone');
    if (isBackendRdsEnabled(config)) {
      const remote = await getEffectiveStats(
        userId,
        { start: dayStartIso, end: dayEndIso, tz: getWorkTimezone() },
        config,
      );
      idleSeconds = remote.idleSeconds;
      lowActivitySeconds = remote.lowActivitySeconds;
      const eff = computeEffectiveSeconds(totalSeconds, lowActivitySeconds, idleSeconds);
      return {
        ...eff,
        idleSeconds,
        lowActivitySeconds,
        intervalSeconds,
        computed: true,
        source: 'pulse',
      };
    }
  } catch (err) {
    const msg = String(err?.message || err);
    const networkFail = /timeout|network|offline|ECONN|ENOTFOUND|fetch|AbortError/i.test(msg);
    console.warn('⚠️ [TODAY-EFFECTIVE] Shared Pulse stats unavailable, using local fallback:', msg);
    // A network miss must not pile on idle/screenshot fetches — those hang the
    // same clock IPC. Hold the last painted split (computed: false).
    if (networkFail) {
      return {
        ...computeEffectiveSeconds(totalSeconds, 0, 0),
        idleSeconds: 0,
        lowActivitySeconds: 0,
        intervalSeconds,
        computed: false,
        source: 'offline',
      };
    }
  }

  // Offline / older-backend fallback. Same floors as Pulse so a network drop
  // does not suddenly inflate non-effective.
  let idleIntervals = [];
  try {
    const { isBackendRdsEnabled, listIdleLogs } = require('./backend-rds-reads');
    if (isBackendRdsEnabled(config)) {
      try {
        const idleLogs = await listIdleLogs(
          userId,
          { start: dayStartIso, end: dayEndIso, limit: 2000 },
          config,
        );
        idleIntervals = idleIntervalsFromLogs(idleLogs, dayStartMs, dayEndMs);
        idleSeconds = mergeIntervalsSeconds(idleIntervals);
        idleMeasured = true;
      } catch (idleErr) {
        console.warn('⚠️ [TODAY-EFFECTIVE] Idle interval fetch failed:', idleErr?.message || idleErr);
      }
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
    source: 'local',
  };
}

module.exports = {
  computeTodayEffectiveStats,
  sumIdleSecondsFromLogs,
  sumLowActivitySecondsFromScreenshots,
  LOW_ACTIVITY_PERCENT,
  resolveScreenshotIntervalMinutes,
};
