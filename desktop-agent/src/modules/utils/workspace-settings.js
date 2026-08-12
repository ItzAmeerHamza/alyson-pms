/**
 * Load workspace policy from RDS (time_doctor.workspace_settings) via backend.
 * Screenshot interval is controlled by settings.screenshot_interval_minutes — change in DB only.
 * Company work-day timezone (IANA) is applied after login so "today" matches
 * Time Doctor Company Time Zone (not the employee's personal timezone).
 */

const { isBackendTimeLogsEnabled, callDesktopAction } = require('./backend-time-logs');
const { normalizeTenantUserId } = require('./tenant-user-id');

const REFRESH_MS = 10 * 60 * 1000;
let refreshTimer = null;
let lastAppliedMinutes = null;
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

function broadcastWorkTimezone(tz) {
  try {
    const { BrowserWindow } = require('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('work-timezone-updated', { timezone: tz });
      }
    }
  } catch (err) {
    console.warn('⚠️ [WORKSPACE-SETTINGS] Failed to notify renderer of timezone:', err?.message || err);
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
  if (changed) {
    broadcastWorkTimezone(tz);
  }
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
      restartCapture: options.restartCapture !== false,
    });
    const tzResult = applyWorkTimezone(settings.timezone);
    return { ok: true, settings, ...intervalResult, timezone: tzResult };
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
  applyWorkTimezone,
  refreshWorkspaceSettings,
  startWorkspaceSettingsRefresh,
  stopWorkspaceSettingsRefresh,
  getLastAppliedScreenshotIntervalMinutes: () => lastAppliedMinutes,
  getLastAppliedTimezone: () => lastAppliedTimezone,
};
