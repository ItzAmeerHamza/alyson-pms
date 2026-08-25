/**
 * Power profile for non-payroll work.
 *
 * HARD CONSTRAINTS (do not violate from callers):
 * - Never shorten/close time_logs here.
 * - Never change idle-cut / authorized stop policy.
 * - Screenshots stay ~1/min while actively tracking and unlocked.
 *
 * Safe levers: AppleScript poll cadence, anti-cheat, IPC chatter,
 * and skipping capture work while idle/locked (sessions stay open).
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
 * URL AppleScript poll delay. Tab/URL rows still open and close on change;
 * 30s active is enough for Pulse and does not spawn osascript every few seconds.
 */
function getUrlPollDelayMs() {
  if (!isTrackingActive()) return envMs('POWER_URL_POLL_INACTIVE_MS', 60000);
  if (isScreenLocked()) return envMs('POWER_URL_POLL_LOCKED_MS', 90000);
  if (isUserIdle()) return envMs('POWER_URL_POLL_IDLE_MS', 60000);
  return envMs('POWER_URL_POLL_ACTIVE_MS', 30000);
}

/**
 * App detection interval. Callers should skip the tick entirely when
 * `shouldSkipAppDetection()` is true.
 */
function getAppDetectIntervalMs() {
  if (isScreenLocked()) return envMs('POWER_APP_DETECT_LOCKED_MS', 90000);
  if (isUserIdle()) return envMs('POWER_APP_DETECT_IDLE_MS', 90000);
  return envMs('POWER_APP_DETECT_ACTIVE_MS', 45000);
}

/** last_alive_at floor. Crash still loses at most this window, not hours. */
function getSessionCheckpointMs() {
  return envMs('POWER_SESSION_CHECKPOINT_MS', 30000);
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
  consolidatedMs: envMs('POWER_IPC_CONSOLIDATED_MS', 30000),
  activitySyncMs: envMs('POWER_ACTIVITY_SYNC_MS', 60000),
  screenshotTimerUiMs: envMs('POWER_SCREENSHOT_TIMER_UI_MS', 30000),
};

/** Fixed screenshot cadence — product requirement: 1/min while unlocked + tracking. */
const SCREENSHOT_INTERVAL_MS = envMs('POWER_SCREENSHOT_INTERVAL_MS', 60 * 1000);

module.exports = {
  isScreenLocked,
  isUserIdle,
  isTrackingActive,
  getUrlPollDelayMs,
  getAppDetectIntervalMs,
  getSessionCheckpointMs,
  shouldSkipAppDetection,
  shouldSkipUrlCapture,
  ANTI_CHEAT,
  IPC,
  SCREENSHOT_INTERVAL_MS,
};
