'use strict';

/**
 * OS login-item / auto-start at device boot.
 *
 * Default: ENABLED (open at login).
 * Preference is persisted under Application Support so users can opt out,
 * and so we never silently re-disable after they turn it on.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PREF_FILENAME = 'auto-launch.json';
/** Default when no preference file exists — product ships with auto-start ON. */
const DEFAULT_ENABLED = true;

function prefDir() {
  // Same durable folder on both OS families (Mac + Windows).
  if (process.platform === 'win32') {
    const appData =
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Alyson Work Time');
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Alyson Work Time',
    );
  }
  return path.join(os.homedir(), '.config', 'Alyson Work Time');
}

function prefPath() {
  return path.join(prefDir(), PREF_FILENAME);
}

function readPreference() {
  try {
    const p = prefPath();
    if (!fs.existsSync(p)) {
      return { enabled: DEFAULT_ENABLED, source: 'default' };
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (typeof raw?.enabled === 'boolean') {
      return { enabled: raw.enabled, source: 'file', updatedAt: raw.updatedAt || null };
    }
  } catch (err) {
    console.warn('⚠️ [AUTO-LAUNCH] Failed to read preference:', err?.message || err);
  }
  return { enabled: DEFAULT_ENABLED, source: 'fallback' };
}

function writePreference(enabled) {
  const dir = prefDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload = {
    enabled: !!enabled,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(prefPath(), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

/**
 * Apply Electron login-item settings to match preference.
 * Only registers the OS login item for packaged builds (dev would register Electron).
 */
function applyLoginItemSettings(enabled, { forceDev = false } = {}) {
  let app;
  try {
    ({ app } = require('electron'));
  } catch {
    return { success: false, reason: 'no_electron' };
  }
  if (!app || typeof app.setLoginItemSettings !== 'function') {
    return { success: false, reason: 'unsupported' };
  }

  const want = !!enabled;
  const isPackaged = !!app.isPackaged;

  if (!isPackaged && !forceDev) {
    console.log(
      `ℹ️ [AUTO-LAUNCH] Preference=${want} (dev mode — OS login item not registered; applies in packaged builds)`,
    );
    return { success: true, applied: false, enabled: want, packaged: false };
  }

  try {
    // Electron login items work on both macOS (Launch Agents) and Windows
    // (HKCU\\...\\Run). Pass execPath explicitly so NSIS-installed Windows
    // builds register the real Alyson PM.exe, not a stale path.
    const settings = {
      openAtLogin: want,
      openAsHidden: true,
      path: process.execPath,
      args: [],
    };
    // Windows: stable Run-key name matching productName.
    if (process.platform === 'win32') {
      settings.name = 'Alyson PM';
    }
    app.setLoginItemSettings(settings);

    // Verify on platforms that support getLoginItemSettings.
    let verified = null;
    try {
      if (typeof app.getLoginItemSettings === 'function') {
        const current = app.getLoginItemSettings({
          path: process.execPath,
          args: [],
        });
        verified = !!current?.openAtLogin;
      }
    } catch (_) {
      verified = null;
    }

    console.log(
      want
        ? `✅ [AUTO-LAUNCH] Enabled on ${process.platform} — Alyson PM will start at login` +
            (verified === false ? ' (warning: OS reports openAtLogin=false)' : '')
        : `✅ [AUTO-LAUNCH] Disabled on ${process.platform} — will not start at login`,
    );
    return {
      success: true,
      applied: true,
      enabled: want,
      packaged: isPackaged,
      platform: process.platform,
      verified,
    };
  } catch (err) {
    console.warn('⚠️ [AUTO-LAUNCH] setLoginItemSettings failed:', err?.message || err);
    return { success: false, reason: err?.message || String(err), enabled: want };
  }
}

/** Read preference (default ON), persist if missing, apply OS login item. */
function initAutoLaunch() {
  const pref = readPreference();
  // Persist default on first run so the file exists and UI can toggle it.
  if (pref.source === 'default' || pref.source === 'fallback') {
    try {
      writePreference(pref.enabled);
    } catch (err) {
      console.warn('⚠️ [AUTO-LAUNCH] Could not persist default preference:', err?.message || err);
    }
  }
  const result = applyLoginItemSettings(pref.enabled);
  global.autoLaunchEnabled = pref.enabled;
  return { ...pref, ...result };
}

function getAutoLaunchEnabled() {
  if (typeof global.autoLaunchEnabled === 'boolean') {
    return global.autoLaunchEnabled;
  }
  return readPreference().enabled;
}

function setAutoLaunchEnabled(enabled) {
  const want = !!enabled;
  global.autoLaunchEnabled = want;
  try {
    writePreference(want);
  } catch (err) {
    console.warn('⚠️ [AUTO-LAUNCH] Persist failed:', err?.message || err);
  }
  const apply = applyLoginItemSettings(want);
  return { success: true, enabled: want, ...apply };
}

module.exports = {
  DEFAULT_ENABLED,
  readPreference,
  writePreference,
  applyLoginItemSettings,
  initAutoLaunch,
  getAutoLaunchEnabled,
  setAutoLaunchEnabled,
};
