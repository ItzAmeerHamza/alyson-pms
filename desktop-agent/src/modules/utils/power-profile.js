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
 * URL AppleScript poll delay. Active browsing stays responsive enough for
 * session switches; idle/locked back off hard.
 */
function getUrlPollDelayMs() {
  if (!isTrackingActive()) return envMs('POWER_URL_POLL_INACTIVE_MS', 15000);
  if (isScreenLocked()) return envMs('POWER_URL_POLL_LOCKED_MS', 60000);
  if (isUserIdle()) return envMs('POWER_URL_POLL_IDLE_MS', 30000);
  return envMs('POWER_URL_POLL_ACTIVE_MS', 10000);
}

/**
 * App detection interval. Callers should skip the tick entirely when
 * `shouldSkipAppDetection()` is true.
 */
function getAppDetectIntervalMs() {
  if (isScreenLocked()) return envMs('POWER_APP_DETECT_LOCKED_MS', 60000);
  if (isUserIdle()) return envMs('POWER_APP_DETECT_IDLE_MS', 30000);
  return envMs('POWER_APP_DETECT_ACTIVE_MS', 15000);
}

function shouldSkipAppDetection() {
  return isScreenLocked() || !!global.isShuttingDown || !!global.isStopping;
}

function shouldSkipUrlCapture() {
  return isScreenLocked() || !isTrackingActive();
}

const ANTI_CHEAT = {
  patternMs: envMs('POWER_ANTI_CHEAT_PATTERN_MS', 60000),
  deepMs: envMs('POWER_ANTI_CHEAT_DEEP_MS', 180000),
  processMs: envMs('POWER_ANTI_CHEAT_PROCESS_MS', 10 * 60 * 1000),
  usbMs: envMs('POWER_ANTI_CHEAT_USB_MS', 15 * 60 * 1000),
};

const IPC = {
  consolidatedMs: envMs('POWER_IPC_CONSOLIDATED_MS', 15000),
  activitySyncMs: envMs('POWER_ACTIVITY_SYNC_MS', 30000),
  screenshotTimerUiMs: envMs('POWER_SCREENSHOT_TIMER_UI_MS', 15000),
};

/** Fixed screenshot cadence — product requirement: 1/min while unlocked + tracking. */
const SCREENSHOT_INTERVAL_MS = envMs('POWER_SCREENSHOT_INTERVAL_MS', 60 * 1000);

module.exports = {
  isScreenLocked,
  isUserIdle,
  isTrackingActive,
  getUrlPollDelayMs,
  getAppDetectIntervalMs,
  shouldSkipAppDetection,
  shouldSkipUrlCapture,
  ANTI_CHEAT,
  IPC,
  SCREENSHOT_INTERVAL_MS,
};
