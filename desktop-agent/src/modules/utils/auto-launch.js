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
function applyLoginItemSettings(enabled, { forceDev = false, exePath: exePathOverride = null } = {}) {
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
    // (HKCU\\...\\Run). Pass execPath so the login item points at Tavilo Time.exe.
    const exePath = exePathOverride || process.execPath;
    const settings = {
      openAtLogin: want,
      openAsHidden: true,
      path: exePath,
      args: [],
    };
    if (process.platform === 'win32') {
      settings.name = 'Tavilo Time';
    }
    app.setLoginItemSettings(settings);

    // Verify on platforms that support getLoginItemSettings.
    let verified = null;
    try {
      if (typeof app.getLoginItemSettings === 'function') {
        const current = app.getLoginItemSettings({
          path: exePath,
          args: [],
        });
        verified = !!current?.openAtLogin;
      }
    } catch (_) {
      verified = null;
    }

    console.log(
      want
        ? `✅ [AUTO-LAUNCH] Enabled on ${process.platform} — Tavilo Time will start at login` +
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

const DOCK_DISPLAY_NAME = 'Tavilo Time';
const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

/**
 * Dock and Finder show the .app folder name, not CFBundleDisplayName.
 * Rename Alyson PM.app → Tavilo Time.app on the same volume (same inode,
 * same bundle id, same signature) so Screen Recording and Accessibility stay.
 * Returns the bundle path to use after the rename.
 */
function renameMacBundleForDock(bundlePath) {
  if (!bundlePath) return bundlePath;
  const desiredName = `${DOCK_DISPLAY_NAME}.app`;
  if (path.basename(bundlePath) === desiredName) return bundlePath;
  const dest = path.join(path.dirname(bundlePath), desiredName);
  if (fs.existsSync(dest)) {
    console.warn('⚠️ [AUTO-LAUNCH] Leaving app path unchanged; already exists:', dest);
    return bundlePath;
  }
  try {
    fs.renameSync(bundlePath, dest);
    console.log('✅ [AUTO-LAUNCH] Renamed app for the Dock:', dest);
    return dest;
  } catch (err) {
    console.warn('⚠️ [AUTO-LAUNCH] Could not rename app for the Dock:', err?.message || err);
    return bundlePath;
  }
}

function macBundlePathFromExe(exePath) {
  if (!exePath) return null;
  const marker = '/Contents/MacOS/';
  const idx = exePath.indexOf(marker);
  return idx === -1 ? null : exePath.slice(0, idx);
}

function resolveMacExePath() {
  if (process.platform !== 'darwin') return process.execPath;
  const bundle = macBundlePathFromExe(process.execPath);
  const direct = macExecutableInBundle(bundle);
  if (direct) return direct;
  if (!bundle) return process.execPath;
  return (
    macExecutableInBundle(path.join(path.dirname(bundle), `${DOCK_DISPLAY_NAME}.app`)) ||
    process.execPath
  );
}

function macExecutableInBundle(bundlePath) {
  if (!bundlePath) return null;
  const exe = path.join(bundlePath, 'Contents', 'MacOS', DOCK_DISPLAY_NAME);
  return fs.existsSync(exe) ? exe : null;
}

/**
 * Ask Launch Services to reread the bundle, point the running Dock tile at
 * the new icon, and restart the Dock once so the cached Alyson name and
 * logo are dropped.
 */
function refreshMacDisplayName(bundlePath) {
  if (process.platform !== 'darwin' || !bundlePath) return;
  let app;
  try {
    ({ app } = require('electron'));
  } catch {
    return;
  }
  if (!app?.isPackaged) return;

  try {
    const { nativeImage } = require('electron');
    const iconPath = path.join(bundlePath, 'Contents', 'Resources', 'icon.icns');
    if (fs.existsSync(iconPath) && app.dock && typeof app.dock.setIcon === 'function') {
      const image = nativeImage.createFromPath(iconPath);
      if (image && !image.isEmpty()) app.dock.setIcon(image);
    }
  } catch (err) {
    console.warn('⚠️ [AUTO-LAUNCH] Could not set Dock icon:', err?.message || err);
  }

  try {
    const { execFile } = require('child_process');
    execFile(LSREGISTER, ['-f', bundlePath], { timeout: 15000 }, (err) => {
      if (err) {
        console.warn('⚠️ [AUTO-LAUNCH] Could not refresh app display name:', err.message);
        return;
      }
      console.log('✅ [AUTO-LAUNCH] Refreshed installed app display name to Tavilo Time');
      restartDockOnce(bundlePath);
    });
  } catch (err) {
    console.warn('⚠️ [AUTO-LAUNCH] Could not refresh app display name:', err?.message || err);
  }
}

function restartDockOnce(bundlePath) {
  const markerPath = path.join(prefDir(), 'dock-display.json');
  let appVersion = '';
  try {
    const { app } = require('electron');
    appVersion = typeof app?.getVersion === 'function' ? app.getVersion() : '';
  } catch {
    appVersion = '';
  }
  try {
    const raw = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (raw && raw.bundlePath === bundlePath && raw.version === appVersion) return;
  } catch {
    // No marker yet — refresh once for this version.
  }
  const { execFile } = require('child_process');
  execFile('killall', ['Dock'], { timeout: 10000 }, (err) => {
    if (err) {
      console.warn('⚠️ [AUTO-LAUNCH] Could not refresh Dock:', err.message);
      return;
    }
    try {
      const dir = prefDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        markerPath,
        JSON.stringify({
          bundlePath,
          version: appVersion,
          displayName: DOCK_DISPLAY_NAME,
          refreshedAt: new Date().toISOString(),
        }),
      );
    } catch (writeErr) {
      console.warn('⚠️ [AUTO-LAUNCH] Could not record Dock refresh:', writeErr?.message || writeErr);
    }
    console.log('✅ [AUTO-LAUNCH] Restarted Dock so it shows Tavilo Time');
  });
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
  let exePath = null;
  if (process.platform === 'darwin') {
    let app;
    try {
      ({ app } = require('electron'));
    } catch {
      app = null;
    }
    if (app?.isPackaged && typeof app.getPath === 'function') {
      let bundlePath = null;
      try {
        bundlePath = macBundlePathFromExe(app.getPath('exe'));
      } catch {
        bundlePath = null;
      }
      bundlePath = renameMacBundleForDock(bundlePath);
      exePath = macExecutableInBundle(bundlePath);
      refreshMacDisplayName(bundlePath);
    }
  }
  const result = applyLoginItemSettings(pref.enabled, exePath ? { exePath } : {});
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
  const apply = applyLoginItemSettings(want, { exePath: resolveMacExePath() });
  return { success: true, enabled: want, ...apply };
}

module.exports = {
  DEFAULT_ENABLED,
  readPreference,
  writePreference,
  applyLoginItemSettings,
  refreshMacDisplayName,
  initAutoLaunch,
  getAutoLaunchEnabled,
  setAutoLaunchEnabled,
};
