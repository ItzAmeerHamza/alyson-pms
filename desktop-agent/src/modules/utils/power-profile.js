/**
 * Power profile for non-payroll work.
 *
 * HARD CONSTRAINTS (do not violate from callers):
 * - Never shorten/close time_logs here.
 * - Never change idle-cut / authorized stop policy.
 * - Screenshot capture cadence is random N-in-M (default 2 / 10 min),
 *   not a 1/min clock. Do not reintroduce a fixed 60s capture loop.
 *
 * Safe levers: AppleScript poll cadence, anti-cheat, IPC chatter,
 * and skipping capture work while idle/locked (sessions stay open).
 *
 * Default cadence (team battery profile — Sep 2026):
 *   URL + app detect while active: 2 min (was 60–90s)
 *   While idle/locked: 3 min
 *   URL cache on stable tab: 10 min (url-result-cache.js)
 *   App-detect result cache: 60s (platform-manager)
 *
 * Functionality preserved:
 *   - time_logs / offline sync unchanged
 *   - screenshots still 2 per 10 min
 *   - URL/app rows may appear up to ~2 min after a switch (still closed correctly on stop)
 *
 * Override any value via POWER_* env vars without rebuilding.
 */

function envMs(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isScreenLocked() {
  return !!global.isScreenLocked;
}

function isUserIdle() {
  try {
    if (global.enhancedIdleMonitor?.isIdle) return true;
    const status = global.enhancedIdleMonitor?.getIdleStatus?.();
    if (status?.isIdle) return true;
  } catch (_) { /* ignore */ }
  return false;
}

function isTrackingActive() {
  const tm = global.trackingManager;
  return !!(global.isTracking && (tm?.currentTimeLogId != null || global.currentTimeLogId));
}

/**
 * URL poll delay (Mac AppleScript / Windows title+CDP). Tab/URL rows still
 * open and close on change; 2 min active is enough now that screenshots are 2/10 min.
 */
function getUrlPollDelayMs() {
  if (!isTrackingActive()) return envMs('POWER_URL_POLL_INACTIVE_MS', 120000);
  if (isScreenLocked()) return envMs('POWER_URL_POLL_LOCKED_MS', 180000);
  if (isUserIdle()) return envMs('POWER_URL_POLL_IDLE_MS', 180000);
  return envMs('POWER_URL_POLL_ACTIVE_MS', 120000);
}

/**
 * Delay before the first URL poll after start, so URL AppleScript rarely stacks
 * with app-detect AppleScript on the same tick.
 */
function getUrlPollStaggerMs() {
  return envMs('POWER_URL_POLL_STAGGER_MS', 60000);
}

/**
 * App detection interval. Callers should skip the tick entirely when
 * `shouldSkipAppDetection()` is true.
 */
function getAppDetectIntervalMs() {
  if (isScreenLocked()) return envMs('POWER_APP_DETECT_LOCKED_MS', 180000);
  if (isUserIdle()) return envMs('POWER_APP_DETECT_IDLE_MS', 180000);
  return envMs('POWER_APP_DETECT_ACTIVE_MS', 120000);
}

/** Reuse last native app-detect result when the foreground app is unchanged. */
function getAppDetectCacheMs() {
  return envMs('APP_DETECT_CACHE_MS', 60000);
}

/** last_alive_at floor. Crash still loses at most this window, not hours. */
function getSessionCheckpointMs() {
  return envMs('POWER_SESSION_CHECKPOINT_MS', 60000);
}

function shouldSkipAppDetection() {
  return isScreenLocked() || !!global.isShuttingDown || !!global.isStopping;
}

function shouldSkipUrlCapture() {
  return isScreenLocked() || !isTrackingActive();
}

const ANTI_CHEAT = {
  patternMs: envMs('POWER_ANTI_CHEAT_PATTERN_MS', 120000),
  deepMs: envMs('POWER_ANTI_CHEAT_DEEP_MS', 300000),
  processMs: envMs('POWER_ANTI_CHEAT_PROCESS_MS', 15 * 60 * 1000),
  usbMs: envMs('POWER_ANTI_CHEAT_USB_MS', 20 * 60 * 1000),
};

const IPC = {
  consolidatedMs: envMs('POWER_IPC_CONSOLIDATED_MS', 90000),
  activitySyncMs: envMs('POWER_ACTIVITY_SYNC_MS', 90000),
  screenshotTimerUiMs: envMs('POWER_SCREENSHOT_TIMER_UI_MS', 90000),
  liveActivityMs: envMs('POWER_LIVE_ACTIVITY_MS', 90000),
  systemHealthMs: envMs('POWER_SYSTEM_HEALTH_MS', 180000),
};

/** Derived report math only (2 shots / 10 min). Capture uses random-screenshot-schedule. */
const SCREENSHOT_INTERVAL_MS = envMs('POWER_SCREENSHOT_INTERVAL_MS', 5 * 60 * 1000);

module.exports = {
  isScreenLocked,
  isUserIdle,
  isTrackingActive,
  getUrlPollDelayMs,
  getUrlPollStaggerMs,
  getAppDetectIntervalMs,
  getAppDetectCacheMs,
  getSessionCheckpointMs,
  shouldSkipAppDetection,
  shouldSkipUrlCapture,
  ANTI_CHEAT,
  IPC,
  SCREENSHOT_INTERVAL_MS,
};
