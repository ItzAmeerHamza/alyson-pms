/**
 * Load workspace policy from RDS (time_doctor.workspace_settings) via backend.
 * Random screenshot cadence is screenshot_count_per_window / screenshot_window_minutes
 * from Pulse Workspace Settings. screenshot_interval_minutes is report math only.
 * Company work-day timezone (IANA) is applied after login so "today" matches
 * Time Doctor Company Time Zone (not the employee's personal timezone).
 */

const { isBackendTimeLogsEnabled, callDesktopAction } = require('./backend-time-logs');
const { normalizeTenantUserId } = require('./tenant-user-id');

const {
  normalizeRandomScreenshotSchedule,
} = require('./random-screenshot-schedule');

const REFRESH_MS = 10 * 60 * 1000;
let refreshTimer = null;
let lastAppliedMinutes = null;
let lastAppliedSchedule = null;
let lastAppliedTimezone = null;

async function fetchWorkspaceSettings(userId, config = global.config) {
  if (!isBackendTimeLogsEnabled(config)) {
    return null;
  }
  const normalized = normalizeTenantUserId(userId || global.currentUserId || config?.user_id);
  if (!normalized) {
    return null;
  }
  const result = await callDesktopAction(
    'get_workspace_settings',
    { user_id: normalized, workspace_id: config?.organization_id || global.currentOrganizationId },
    config,
    { timeoutMs: 4000 },
  );
  return result?.settings || null;
}

function applyScreenshotIntervalMinutes(minutes, options = {}) {
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) {
    return { applied: false, changed: false, minutes: null };
  }

  const seconds = Math.max(60, Math.round(mins * 60));
  const prevSeconds = global.config?.screenshot_interval_seconds;

  const targets = [
    global.config,
    global.configManager?.config,
    global.enhancedScreenshotManager?.config,
  ].filter(Boolean);

  for (const cfg of targets) {
    cfg.screenshot_interval_minutes = mins;
    cfg.screenshot_interval_seconds = seconds;
    cfg.screenshot_interval_from_database = true;
  }

  if (global.configManager?.appSettings) {
    global.configManager.appSettings.screenshot_interval_seconds = seconds;
    global.configManager.appSettings.screenshot_interval_minutes = mins;
  }
  if (global.appSettings) {
    global.appSettings.screenshot_interval_seconds = seconds;
    global.appSettings.screenshot_interval_minutes = mins;
  }

  const changed = prevSeconds !== seconds;
  lastAppliedMinutes = mins;

  console.log(
    `📸 [WORKSPACE-SETTINGS] Screenshot interval from database: ${mins} min (${seconds}s)`,
  );

  if (changed && options.restartCapture && global.isTracking && global.enhancedScreenshotManager) {
    try {
      global.enhancedScreenshotManager.stopScreenshotCapture();
      global.enhancedScreenshotManager.startScreenshotCapture();
      global.enhancedScreenshotManager.startScreenshotTimerUpdates?.();
      console.log('📸 [WORKSPACE-SETTINGS] Restarted screenshot scheduler with new interval');
    } catch (err) {
      console.warn('⚠️ [WORKSPACE-SETTINGS] Failed to restart screenshot scheduler:', err?.message || err);
    }
  }

  return { applied: true, changed, minutes: mins, seconds };
}

function applyRandomScreenshotSchedule(settings, options = {}) {
  const schedule = normalizeRandomScreenshotSchedule(settings || {});
  const targets = [
    global.config,
    global.configManager?.config,
    global.enhancedScreenshotManager?.config,
  ].filter(Boolean);

  for (const cfg of targets) {
    cfg.screenshot_count_per_window = schedule.count;
    cfg.screenshot_window_minutes = schedule.windowMinutes;
  }
  if (global.configManager?.appSettings) {
    global.configManager.appSettings.screenshot_count_per_window = schedule.count;
    global.configManager.appSettings.screenshot_window_minutes = schedule.windowMinutes;
  }
  if (global.appSettings) {
    global.appSettings.screenshot_count_per_window = schedule.count;
    global.appSettings.screenshot_window_minutes = schedule.windowMinutes;
  }

  const managerChanged =
    global.enhancedScreenshotManager?.applyWorkspaceSchedule?.(schedule) === true;
  const prev = lastAppliedSchedule;
  const changed =
    managerChanged ||
    !prev ||
    prev.count !== schedule.count ||
    prev.windowMinutes !== schedule.windowMinutes;
  lastAppliedSchedule = {
    count: schedule.count,
    windowMinutes: schedule.windowMinutes,
  };

  console.log(
    `📸 [WORKSPACE-SETTINGS] Random screenshots: ${schedule.count} every ${schedule.windowMinutes} min`,
  );

  if (changed && options.restartCapture && global.isTracking && global.enhancedScreenshotManager) {
    try {
      global.enhancedScreenshotManager.stopScreenshotCapture();
      global.enhancedScreenshotManager.startScreenshotCapture();
      global.enhancedScreenshotManager.startScreenshotTimerUpdates?.();
      console.log('📸 [WORKSPACE-SETTINGS] Restarted screenshot scheduler with new random window');
    } catch (err) {
      console.warn('⚠️ [WORKSPACE-SETTINGS] Failed to restart screenshot scheduler:', err?.message || err);
    }
  }

  return { applied: true, changed, ...schedule };
}

function broadcastWorkTimezone(tz = lastAppliedTimezone) {
  const { getWorkTimezone, isValidIanaTimezone } = require('./work-timezone');
  const resolved = isValidIanaTimezone(tz) ? String(tz).trim() : getWorkTimezone();
  if (!resolved) return;
  try {
    const { BrowserWindow } = require('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      if (win && !win.isDestroyed()) {
        let workDay = null;
        try {
          workDay = require('./work-timezone').getWorkDayContext(new Date(), resolved);
        } catch (_) { /* ignore */ }
        win.webContents.send('work-timezone-updated', {
          timezone: resolved,
          todayKey: workDay?.todayKey,
          workDay,
        });
      }
    }
  } catch (err) {
    console.warn('⚠️ [WORKSPACE-SETTINGS] Failed to notify renderer of timezone:', err?.message || err);
  }
}

/** Re-push company TZ whenever a BrowserWindow finishes loading (renderer starts at Pacific). */
function installWorkTimezoneWindowHooks() {
  if (global._workTimezoneWindowHooksInstalled) return;
  global._workTimezoneWindowHooksInstalled = true;
  try {
    const { app, BrowserWindow } = require('electron');
    const push = () => {
      const tz = lastAppliedTimezone || require('./work-timezone').getWorkTimezone();
      if (tz) broadcastWorkTimezone(tz);
    };
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win || win.isDestroyed()) return;
      win.webContents.on('did-finish-load', push);
    });
    app.on('browser-window-created', (_e, win) => {
      if (!win || win.isDestroyed()) return;
      win.webContents.on('did-finish-load', push);
    });
  } catch (err) {
    console.warn('⚠️ [WORKSPACE-SETTINGS] TZ window hooks failed:', err?.message || err);
  }
}

/**
 * Apply workspace IANA timezone for work-day midnight / "today" clamp.
 * Returns { applied, changed, timezone }.
 */
function applyWorkTimezone(timezone) {
  const { setWorkTimezone, getWorkTimezone, isValidIanaTimezone } = require('./work-timezone');
  if (!isValidIanaTimezone(timezone)) {
    return { applied: false, changed: false, timezone: getWorkTimezone() };
  }
  const tz = String(timezone).trim();
  const prev = getWorkTimezone();
  const targets = [
    global.config,
    global.configManager?.config,
  ].filter(Boolean);
  for (const cfg of targets) {
    cfg.work_timezone = tz;
    cfg.WORK_TIMEZONE = tz;
  }
  setWorkTimezone(tz);
  const changed = prev !== tz;
  lastAppliedTimezone = tz;
  console.log(
    `🌎 [TIMEZONE] Work-day boundaries: ${tz}${changed && prev ? ` (was ${prev})` : ''}`,
  );
  // Always broadcast — renderer has a separate module copy that defaults to Pacific.
  // Login often applies TZ before the tracker window exists; late windows must still sync.
  installWorkTimezoneWindowHooks();
  broadcastWorkTimezone(tz);
  return { applied: true, changed, timezone: tz };
}

async function refreshWorkspaceSettings(config = global.config, options = {}) {
  try {
    const settings = await fetchWorkspaceSettings(null, config);
    if (!settings) {
      return { ok: false, reason: 'no_settings' };
    }
    const minutes = settings.screenshot_interval_minutes;
    const intervalResult = applyScreenshotIntervalMinutes(minutes, {
      restartCapture: false,
    });
    const scheduleResult = applyRandomScreenshotSchedule(settings, {
      restartCapture: options.restartCapture !== false,
    });
    const tzResult = applyWorkTimezone(settings.timezone);
    return { ok: true, settings, ...intervalResult, schedule: scheduleResult, timezone: tzResult };
  } catch (err) {
    console.warn('⚠️ [WORKSPACE-SETTINGS] Refresh failed:', err?.message || err);
    return { ok: false, reason: err?.message || String(err) };
  }
}

function startWorkspaceSettingsRefresh(config = global.config) {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (!isBackendTimeLogsEnabled(config)) {
    return;
  }
  refreshTimer = setInterval(() => {
    refreshWorkspaceSettings(config, { restartCapture: true }).catch(() => {});
  }, REFRESH_MS);
}

function stopWorkspaceSettingsRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

module.exports = {
  fetchWorkspaceSettings,
  applyScreenshotIntervalMinutes,
  applyRandomScreenshotSchedule,
  applyWorkTimezone,
  broadcastWorkTimezone,
  installWorkTimezoneWindowHooks,
  getLastAppliedTimezone: () => lastAppliedTimezone,
  refreshWorkspaceSettings,
  startWorkspaceSettingsRefresh,
  stopWorkspaceSettingsRefresh,
  getLastAppliedScreenshotIntervalMinutes: () => lastAppliedMinutes,
  getLastAppliedScreenshotSchedule: () => lastAppliedSchedule,
};
