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
const { MEETING_ACTIVITY_FLOOR_PERCENT } = require('../../lib/meeting-context');

const LOW_ACTIVITY_PERCENT = 10;
// Same floor Pulse uses. The agent records idle after 60s so the raw periods
// exist, but a pause under five minutes is not non-effective time.
const MIN_IDLE_REPORT_SECONDS = 5 * 60;
// Same streak Pulse uses: three consecutive quiet minutes at 1/min capture.
const SUSTAINED_LOW_MINUTES = 3;
/** Join meeting-titled shots the same way Pulse does so dual-screen Word/Finder
 * captures during a call are not billed as low-activity / non-effective. */
const MEETING_INTERVAL_JOIN_MS = 10 * 60 * 1000;

function isMeetingScreenshotRow(shot = {}) {
  const titleHay = `${shot.app_name || ''} ${shot.window_title || ''}`.toLowerCase();
  const ocrHay = `${shot.vision_summary || ''} ${shot.description || ''} ${shot.ocr_excerpt || ''}`.toLowerCase();
  const uiOcr = /you are presenting|presenting, annotating|leave call|in this call|microphone recording/.test(
    ocrHay,
  );
  if (/you (have )?left|left the (meeting|call)|meeting ended|ask to join|join now|waiting room/.test(`${titleHay} ${ocrHay}`)) {
    if (!uiOcr) return false;
  }
  if (/gmail|google calendar|\bcalendar\b|outlook|inbox -/.test(titleHay) && !/\bmeet\s+-/.test(titleHay)) {
    return uiOcr;
  }
  if (
    /google meet|meet\.google\.com|\bmeet\s+-|zoom meeting|zoom\.us|microphone recording/.test(titleHay)
  ) {
    return true;
  }
  if (
    /microsoft teams|teams\.microsoft\.com|\bskype\b/.test(titleHay) &&
    /meetup-join|webinar|\bmeeting\b|\bcall\b/.test(titleHay)
  ) {
    return true;
  }
  return /meet\.google\.com\/[a-z0-9-]+|you are presenting|presenting, annotating|in a google meet|in this call|leave call|microphone recording/.test(
    ocrHay,
  );
}

function mergeMeetingShotIntervals(timesMs, coverageMs, joinMs = MEETING_INTERVAL_JOIN_MS) {
  const cover = Math.max(10_000, Math.floor(Number(coverageMs) || 60_000));
  const join = Math.max(0, Math.floor(Number(joinMs) || 0));
  const times = timesMs.filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b);
  if (!times.length) return [];
  const out = [];
  let start = times[0];
  let end = times[0] + cover;
  for (let i = 1; i < times.length; i += 1) {
    const nextStart = times[i];
    const nextEnd = times[i] + cover;
    if (nextStart <= end + join) {
      end = Math.max(end, nextEnd);
    } else {
      out.push({ startMs: start, endMs: end });
      start = nextStart;
      end = nextEnd;
    }
  }
  out.push({ startMs: start, endMs: end });
  return out.map((iv) => ({ startMs: iv.startMs, endMs: iv.endMs + join }));
}

function meetingIntervalsFromScreenshots(screenshots, intervalSeconds, { participatingOnly = false } = {}) {
  const times = [];
  for (const shot of screenshots || []) {
    if (!isMeetingScreenshotRow(shot)) continue;
    if (participatingOnly) {
      const raw = shot.activity_percent;
      const pct = raw == null || raw === '' ? MEETING_ACTIVITY_FLOOR_PERCENT : Number(raw);
      if (!(pct >= MEETING_ACTIVITY_FLOOR_PERCENT)) continue;
    }
    const capturedAt = shot.captured_at || shot.capturedAt;
    const ms = capturedAt ? new Date(capturedAt).getTime() : NaN;
    if (Number.isFinite(ms)) times.push(ms);
  }
  return mergeMeetingShotIntervals(times, Math.max(10, Number(intervalSeconds) || 60) * 1000);
}

function subtractIntervals(source, cuts) {
  let pieces = [source];
  for (const cut of cuts || []) {
    const next = [];
    for (const piece of pieces) {
      if (cut.endMs <= piece.startMs || cut.startMs >= piece.endMs) {
        next.push(piece);
        continue;
      }
      if (piece.startMs < cut.startMs) next.push({ startMs: piece.startMs, endMs: cut.startMs });
      if (piece.endMs > cut.endMs) next.push({ startMs: cut.endMs, endMs: piece.endMs });
    }
    pieces = next.filter((p) => p.endMs > p.startMs);
  }
  return pieces;
}

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

/** Closed session end times by time_log id. */
function sessionEndsById(timeLogs) {
  const ends = new Map();
  for (const log of timeLogs || []) {
    if (!log?.id || !log.end_time) continue;
    const endMs = new Date(log.end_time).getTime();
    if (Number.isFinite(endMs)) ends.set(String(log.id), endMs);
  }
  return ends;
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
 * @param {Map<string, number>} [sessionEnds] — shots taken after their session's
 *   end (the minutes an unanswered still-working alert cuts) are not tracked time.
 */
function sumLowActivitySecondsFromScreenshots(
  screenshots,
  intervalSeconds,
  dayStartMs,
  dayEndMs,
  idleIntervals = [],
  sessionEnds = new Map(),
) {
  const capMs = Math.max(10_000, Math.floor(Number(intervalSeconds) || 60) * 1000);
  const minRunSeconds = SUSTAINED_LOW_MINUTES * 60;
  const meetingIntervals = meetingIntervalsFromScreenshots(screenshots, intervalSeconds);
  const insideIdle = (ms) =>
    idleIntervals.some((iv) => ms >= iv.startMs && ms < iv.endMs);
  const insideMeeting = (ms) =>
    meetingIntervals.some((iv) => ms >= iv.startMs && ms < iv.endMs);

  const flags = [];
  for (const shot of screenshots || []) {
    const capturedAt = shot.captured_at || shot.capturedAt;
    const ms = capturedAt ? new Date(capturedAt).getTime() : NaN;
    if (Number.isFinite(ms) && !(ms >= dayStartMs && ms < dayEndMs)) continue;
    const pct = shot.activity_percent == null || shot.activity_percent === '' ? NaN : Number(shot.activity_percent);
    const inMeeting =
      isMeetingScreenshotRow(shot) || (Number.isFinite(ms) && insideMeeting(ms));
    const sessionEndMs = shot.time_log_id ? sessionEnds.get(String(shot.time_log_id)) : undefined;
    const afterSession = sessionEndMs !== undefined && ms > sessionEndMs;
    const isLow =
      Number.isFinite(pct) &&
      pct < LOW_ACTIVITY_PERCENT &&
      !inMeeting &&
      !afterSession &&
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

/**
 * Idle periods as intervals, clipped to the work day. Same order as Pulse:
 * remove live-call time first, then drop what is left under five minutes.
 */
/**
 * Tracked-session windows for today: every time log (an open one runs to its
 * last proof of life, or now), plus the live session even if it has not
 * synced yet. Idle outside these windows is not tracked time.
 */
function sessionWindowsFromTimeLogs(timeLogs, nowMs = Date.now()) {
  const out = [];
  for (const log of timeLogs || []) {
    const startMs = new Date(log?.start_time).getTime();
    const endRaw = log?.end_time || log?.last_alive_at || null;
    const endMs = endRaw ? new Date(endRaw).getTime() : nowMs;
    if (Number.isFinite(startMs) && endMs > startMs) out.push({ startMs, endMs });
  }
  try {
    const live = global.isTracking
      ? global.sessionStartTime || global.trackingManager?.sessionStartTime
      : null;
    const liveMs = live ? new Date(live).getTime() : NaN;
    if (Number.isFinite(liveMs) && nowMs > liveMs) out.push({ startMs: liveMs, endMs: nowMs });
  } catch (_) { /* no live session */ }
  return out;
}

function clipToWindows(source, windows) {
  const out = [];
  for (const w of windows) {
    const startMs = Math.max(source.startMs, w.startMs);
    const endMs = Math.min(source.endMs, w.endMs);
    if (endMs > startMs) out.push({ startMs, endMs });
  }
  // Merge overlaps so a stretch covered by two windows is not counted twice.
  out.sort((a, b) => a.startMs - b.startMs);
  const merged = [];
  for (const iv of out) {
    const last = merged[merged.length - 1];
    if (last && iv.startMs <= last.endMs) last.endMs = Math.max(last.endMs, iv.endMs);
    else merged.push({ ...iv });
  }
  return merged;
}

/**
 * @param {Array<{startMs:number,endMs:number}>|null} [sessionWindows] — when
 *   given, only idle inside these tracked sessions counts (an idle period that
 *   ran on after the lid closed and tracking stopped is not non-effective time).
 */
function idleIntervalsFromLogs(idleLogs, dayStartMs, dayEndMs, meetingIntervals = [], sessionWindows = null) {
  const out = [];
  for (const log of idleLogs || []) {
    const startMs = new Date(log.idle_start || log.start_time).getTime();
    if (!Number.isFinite(startMs)) continue;
    const rawEnd = log.idle_end || log.end_time;
    const endMs = rawEnd
      ? new Date(rawEnd).getTime()
      : startMs + Math.max(0, Number(log.duration_seconds) || 0) * 1000;
    if (!Number.isFinite(endMs) || endMs <= startMs) continue;
    const tracked = Array.isArray(sessionWindows)
      ? clipToWindows({ startMs, endMs }, sessionWindows)
      : [{ startMs, endMs }];
    for (const piece of tracked.flatMap((iv) => subtractIntervals(iv, meetingIntervals))) {
      if ((piece.endMs - piece.startMs) / 1000 < MIN_IDLE_REPORT_SECONDS) continue;
      const lo = Math.max(piece.startMs, dayStartMs);
      const hi = Math.min(piece.endMs, dayEndMs);
      if (hi > lo) out.push({ startMs: lo, endMs: hi });
    }
  }
  return out;
}

/**
 * @param {{ userId: string|number, totalSeconds: number, config?: object, screenshots?: object[], timeLogs?: object[] }} opts
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
  // Prefer screenshots already loaded by the caller (monthly report) so Today
  // and Month never diverge from different fetch/limit results.
  let screenshots = Array.isArray(opts.screenshots) ? opts.screenshots : null;
  if (screenshots) {
    lowActivityMeasured = true;
  } else {
    screenshots = [];
    try {
      const { fetchScreenshotsFromBackend, usesBackendScreenshots } = require('./backend-screenshots');
      const { isBackendRdsEnabled } = require('./backend-rds-reads');
      if (usesBackendScreenshots(config) || isBackendRdsEnabled(config)) {
        screenshots = await fetchScreenshotsFromBackend(userId, config, {
          startIso: dayStartIso,
          endIso: dayEndIso,
          limit: 500,
        }) || [];
        lowActivityMeasured = true;
      }
    } catch (err) {
      console.warn('⚠️ [TODAY-EFFECTIVE] Screenshot fetch failed:', err?.message || err);
    }
  }
  const callIntervals = meetingIntervalsFromScreenshots(screenshots, intervalSeconds, {
    participatingOnly: true,
  });

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
        idleIntervals = idleIntervalsFromLogs(
          idleLogs,
          dayStartMs,
          dayEndMs,
          callIntervals,
          Array.isArray(opts.timeLogs) ? sessionWindowsFromTimeLogs(opts.timeLogs) : null,
        );
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
    lowActivitySeconds = sumLowActivitySecondsFromScreenshots(
      screenshots,
      intervalSeconds,
      dayStartMs,
      dayEndMs,
      idleIntervals,
      sessionEndsById(opts.timeLogs),
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
  idleIntervalsFromLogs,
  sessionWindowsFromTimeLogs,
  meetingIntervalsFromScreenshots,
  isMeetingScreenshotRow,
  LOW_ACTIVITY_PERCENT,
  resolveScreenshotIntervalMinutes,
};
