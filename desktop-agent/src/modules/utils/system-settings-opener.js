'use strict';

/**
 * Opens OS privacy / permission UI for the current platform.
 * - macOS: Security & Privacy anchors (still honored by System Settings on Ventura+).
 * - Windows: ms-settings URIs (see Microsoft "Launch the Windows Settings app").
 * - Linux: tries GNOME Control Center panels; falls back silently if unavailable.
 */

const MAC_URLS = {
  screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  inputMonitoring: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
  privacy: 'x-apple.systempreferences:com.apple.preference.security',
};

/** @see https://learn.microsoft.com/en-us/windows/uwp/launch-app/launch-settings-app */
const WIN_URLS = {
  screenRecording: 'ms-settings:privacy-graphicscapture',
  accessibility: 'ms-settings:easeofaccess',
  automation: 'ms-settings:privacy',
  inputMonitoring: 'ms-settings:privacy',
  privacy: 'ms-settings:privacy',
};

function normalizePane(pane) {
  if (pane == null || pane === '') return 'screenRecording';
  const k = String(pane).replace(/-/g, '').toLowerCase();
  const map = {
    screenrecording: 'screenRecording',
    screencapture: 'screenRecording',
    screen: 'screenRecording',
    accessibility: 'accessibility',
    inputmonitoring: 'inputMonitoring',
    listenevent: 'inputMonitoring',
    automation: 'automation',
    appleevents: 'automation',
    sysevents: 'automation',
    privacy: 'privacy',
  };
  return map[k] || 'screenRecording';
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<boolean>}
 */
function spawnDetachedOk(cmd, args) {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        try {
          child.unref();
        } catch (_) {}
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/** @param {ReturnType<typeof normalizePane>} normalizedPane */
async function openLinuxPrivacySettings(normalizedPane) {
  /** Preference panels vary by distro; try common GNOME paths first */
  const sequences = {
    accessibility: [
      ['gnome-control-center', ['universal-access']],
      ['unity-control-center', ['universal-access']],
    ],
    screenRecording: [
      ['gnome-control-center', ['privacy']],
      ['gnome-control-center', ['sharing']],
    ],
    automation: [
      ['gnome-control-center', ['applications']],
      ['gnome-control-center', ['privacy']],
    ],
    inputMonitoring: [['gnome-control-center', ['privacy']]],
    privacy: [['gnome-control-center', ['privacy']]],
  };

  const seq = [...(sequences[normalizedPane] || sequences.privacy), ['systemsettings5', []]];

  for (const [cmd, args] of seq) {
    if (await spawnDetachedOk(cmd, args)) {
      return { success: true, pane: normalizedPane, url: `${cmd} ${args.join(' ')}` };
    }
  }

  console.warn(
    '[system-settings-opener] Could not open Linux settings UI (install gnome-control-center or open Privacy manually).'
  );
  return { success: false, pane: normalizedPane, url: 'linux-settings-unavailable' };
}

/**
 * @param {import('electron').shell} shell
 * @param {{ pane?: string }} [options]
 */
async function openSystemPrivacySettings(shell, options = {}) {
  const pane = normalizePane(options.pane);

  if (process.platform === 'darwin') {
    const url = MAC_URLS[pane] || MAC_URLS.screenRecording;
    await shell.openExternal(url);
    return { success: true, pane, url };
  }

  if (process.platform === 'win32') {
    const url = WIN_URLS[pane] || WIN_URLS.privacy;
    await shell.openExternal(url);
    return { success: true, pane, url };
  }

  if (process.platform === 'linux') {
    return openLinuxPrivacySettings(pane);
  }

  return { success: false, pane, error: 'unsupported-platform' };
}

module.exports = {
  normalizePane,
  openSystemPrivacySettings,
  MAC_URLS,
  WIN_URLS,
};
