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
const { LOGIN_ARG } = require('./user-preferences');
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
    // Windows: tag login launches so the app can honor "Open window at login".
    // macOS reports login launches itself (wasOpenedAtLogin).
    const args = process.platform === 'win32' ? [LOGIN_ARG] : [];
    const settings = {
      openAtLogin: want,
      openAsHidden: true,
      path: exePath,
      args,
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
          args,
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
 * NEVER rename the live bundle while Tavilo is running — that tears the
 * executable path out from under the process (crash + auto-relaunch loop) and
 * was paired with killall Dock, which un-minimizes every app window.
 * Rename only after quit (detached script) or via the in-place updater.
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
  scheduleMacBundleRenameAfterQuit(bundlePath, dest);
  return bundlePath;
}

/**
 * After the process exits, rename Alyson PM.app → Tavilo Time.app on the same
 * volume (permissions stay). Do not reopen the app — login item / user will.
 */
function scheduleMacBundleRenameAfterQuit(fromPath, toPath) {
  if (global.__taviloBundleRenameScheduled) return;
  global.__taviloBundleRenameScheduled = true;
  let appRef;
  try {
    ({ app: appRef } = require('electron'));
  } catch {
    return;
  }
  if (!appRef || typeof appRef.once !== 'function') return;

  appRef.once('will-quit', () => {
    try {
      const os = require('os');
      const { spawn } = require('child_process');
      const scriptPath = path.join(os.tmpdir(), `tavilo-rename-bundle-${Date.now()}.sh`);
      const script = `#!/bin/bash
sleep 2
FROM="${String(fromPath).replace(/"/g, '\\"')}"
TO="${String(toPath).replace(/"/g, '\\"')}"
if [ -d "$FROM" ] && [ ! -e "$TO" ]; then
  mv "$FROM" "$TO"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$TO" 2>/dev/null || true
fi
rm -f "$0"
`;
      fs.writeFileSync(scriptPath, script, { mode: 0o755 });
      const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' });
      child.unref();
      console.log('✅ [AUTO-LAUNCH] Scheduled post-quit rename to Tavilo Time.app');
    } catch (err) {
      console.warn('⚠️ [AUTO-LAUNCH] Could not schedule post-quit rename:', err?.message || err);
    }
  });
}

/**
 * An in-place rename can leave a second "Alyson PM.app" if a later update
 * still targets the old path. Drop that leftover only when this process is
 * the Tavilo Time.app copy, so we never delete the app that is running.
 */
function removeLegacyMacDuplicate(bundlePath) {
  if (!bundlePath || path.basename(bundlePath) !== `${DOCK_DISPLAY_NAME}.app`) return;
  const legacy = path.join(path.dirname(bundlePath), 'Alyson PM.app');
  if (!fs.existsSync(legacy)) return;
  try {
    const { execFile } = require('child_process');
    execFile(LSREGISTER, ['-u', legacy], { timeout: 15000 }, () => {});
  } catch { /* unregister is best-effort */ }
  try {
    fs.rmSync(legacy, { recursive: true, force: true });
    console.log('✅ [AUTO-LAUNCH] Removed leftover Alyson PM.app');
  } catch (err) {
    console.warn('⚠️ [AUTO-LAUNCH] Could not remove leftover Alyson PM.app:', err?.message || err);
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
  // New builds: "Tavilo Time". Pre-rebrand: "Alyson PM". Prefer the new name.
  const candidates = [DOCK_DISPLAY_NAME, 'Alyson PM', 'alyson-pm-desktop-agent'];
  for (const name of candidates) {
    const exe = path.join(bundlePath, 'Contents', 'MacOS', name);
    if (fs.existsSync(exe)) return exe;
  }
  try {
    const dir = path.join(bundlePath, 'Contents', 'MacOS');
    if (!fs.existsSync(dir)) return null;
    const first = fs.readdirSync(dir).find((n) => !n.startsWith('.'));
    return first ? path.join(dir, first) : null;
  } catch {
    return null;
  }
}

/**
 * Ask Launch Services to reread the bundle and refresh the Dock tile icon.
 * Do NOT killall Dock — that un-minimizes every window on the Mac and looks
 * like "Tavilo crashed and opened all my apps".
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
    const { setMacDockIcon } = require('./resolve-app-icon');
    const resourcesPath = path.join(bundlePath, 'Contents', 'Resources');
    setMacDockIcon(app, nativeImage, { resourcesPath, preferIcns: true });
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
      recordDockDisplayMarker(bundlePath);
    });
  } catch (err) {
    console.warn('⚠️ [AUTO-LAUNCH] Could not refresh app display name:', err?.message || err);
  }
}

/** @deprecated Kept for tests/callers — never kills Dock. */
function restartDockOnce(bundlePath) {
  recordDockDisplayMarker(bundlePath);
}

function recordDockDisplayMarker(bundlePath) {
  const markerPath = path.join(prefDir(), 'dock-display.json');
  let appVersion = '';
  try {
    const { app } = require('electron');
    appVersion = typeof app?.getVersion === 'function' ? app.getVersion() : '';
  } catch {
    appVersion = '';
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
        dockKill: false,
      }),
    );
  } catch (writeErr) {
    console.warn('⚠️ [AUTO-LAUNCH] Could not record Dock display marker:', writeErr?.message || writeErr);
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
      removeLegacyMacDuplicate(bundlePath);
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
  renameMacBundleForDock,
  restartDockOnce,
  initAutoLaunch,
  getAutoLaunchEnabled,
  setAutoLaunchEnabled,
};
