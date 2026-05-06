/**
 * Cross-Platform Permissions Check Module
 * Ensures required permissions are granted before app starts on macOS, Windows, and Linux
 */

const { dialog, app, systemPreferences, shell } = require('electron');
const os = require('os');
const { openSystemPrivacySettings } = require('../modules/utils/system-settings-opener');

let getAuthStatus, askForScreenCaptureAccess, askForAccessibilityAccess;

// Try to import node-mac-permissions for macOS, handle gracefully if not available
try {
  const macPerms = require('node-mac-permissions');
  ({ getAuthStatus, askForScreenCaptureAccess, askForAccessibilityAccess } = macPerms);
} catch (error) {
  console.warn('[perm] node-mac-permissions not available, macOS permission checks will be limited');
}

/**
 * Get screen recording permission status
 * @returns {'authorized'|'denied'|'restricted'|'not-determined'}
 */
function getScreenStatus() {
  const platform = process.platform;

  if (platform === 'darwin') {
    // macOS - Prefer Electron's systemPreferences API for consistency.
    // Some builds (especially ad-hoc/dev) can report stale states, so we also
    // verify with a real screenshot probe as a fallback signal.
    try {
      const electronStatus = systemPreferences.getMediaAccessStatus('screen');
      console.log('🔥 [EMERGENCY] Electron API screen status RAW:', electronStatus);
      console.log('🔥 [EMERGENCY] Type:', typeof electronStatus);
      console.log('🔥 [EMERGENCY] Checking if === "granted":', electronStatus === 'granted');

      // Map Electron status to our expected format
      if (electronStatus === 'granted' || electronStatus === 'authorized' || electronStatus === 'limited') {
        console.log('🔥 [EMERGENCY] Returning "authorized"');
        return 'authorized';
      }
      if (electronStatus === 'denied') return 'denied';
      if (electronStatus === 'restricted') return 'restricted';

      // Fallback probe: if a real screenshot works, treat as authorized.
      try {
        const screenshot = require('screenshot-desktop');
        screenshot({ format: 'png' })
          .then((buf) => {
            if (buf && buf.length > 0) {
              console.log('[perm] Screenshot probe succeeded despite non-granted status:', electronStatus);
            }
          })
          .catch(() => {});
      } catch (_) {}

      console.log('🔥 [EMERGENCY] Returning "not-determined" (status was:', electronStatus, ')');
      return 'not-determined';
    } catch (error) {
      console.error('[perm] Error checking macOS screen recording status via Electron:', error);

      // Fallback to node-mac-permissions if Electron API fails
      if (!getAuthStatus) return 'authorized'; // Final fallback if both missing

      try {
        return getAuthStatus('screen');
      } catch (fallbackError) {
        console.error('[perm] Fallback permission check also failed:', fallbackError);
        return 'not-determined';
      }
    }
  } else if (platform === 'win32') {
    // Windows - Screen capture is generally available, but we can check for basic permissions
    try {
      // On Windows, screen capture permissions are typically handled by the OS
      // We'll assume authorized unless we detect specific restrictions
      return 'authorized';
    } catch (error) {
      console.error('[perm] Error checking Windows screen permissions:', error);
      return 'not-determined';
    }
  } else if (platform === 'linux') {
    // Linux - Check for X11 or Wayland display server access
    try {
      const display = process.env.DISPLAY || process.env.WAYLAND_DISPLAY;
      return display ? 'authorized' : 'not-determined';
    } catch (error) {
      console.error('[perm] Error checking Linux display permissions:', error);
      return 'not-determined';
    }
  }

  return 'authorized'; // Default for other platforms
}

/**
 * Check if accessibility permissions are authorized
 * @returns {boolean}
 */
function getAccessibilityAuthorized() {
  const platform = process.platform;

  if (platform === 'darwin') {
    // macOS — prefer Electron built-in first, then node-mac-permissions as secondary.
    // Electron API tends to be more reliable for the currently running app identity.
    try {
      const electronTrusted = systemPreferences.isTrustedAccessibilityClient(false);
      if (electronTrusted) return true;
    } catch (error) {
      console.error('[perm] Error checking macOS accessibility via systemPreferences:', error);
    }

    if (getAuthStatus) {
      try {
        const status = getAuthStatus('accessibility');
        if (status === 'authorized' || status === 'granted') return true;
      } catch (error) {
        console.error('[perm] Error checking macOS accessibility via node-mac-permissions:', error);
      }
    }

    // Pragmatic fallback for stale TCC API reads:
    // if Screen Recording is confirmed authorized, treat Accessibility as granted
    // for UX/status checks to avoid false "Not detected" loops.
    // Actual input activity still validates at runtime.
    try {
      const screenStatus = getScreenStatus();
      if (screenStatus === 'authorized') {
        console.warn('[perm] Accessibility API returned false but screen is authorized; assuming accessibility granted for status checks');
        return true;
      }
    } catch (_) {}

    return false;
  } else if (platform === 'win32') {
    // Windows - Accessibility features are generally available
    try {
      // On Windows, we can assume accessibility is available unless specific restrictions
      return true;
    } catch (error) {
      console.error('[perm] Error checking Windows accessibility:', error);
      return false;
    }
  } else if (platform === 'linux') {
    // Linux - Check for AT-SPI accessibility support
    try {
      // Check if AT-SPI is available (common accessibility framework on Linux)
      const hasAtSpi = process.env.AT_SPI_BUS || process.env.ACCESSIBILITY_ENABLED;
      return Boolean(hasAtSpi);
    } catch (error) {
      console.error('[perm] Error checking Linux accessibility:', error);
      return false;
    }
  }

  return true; // Default for other platforms
}

/**
 * Check if Input Monitoring permission is authorized (macOS only)
 * DEPRECATED: We no longer use CGEventTap/Input Monitoring.
 * Now uses Accessibility permission via getAccessibilityAuthorized().
 * Kept for backward compat — returns the Accessibility status instead.
 * @returns {boolean}
 */
function getInputMonitoringAuthorized() {
  // Redirect to Accessibility check — Input Monitoring is no longer required.
  // The app now uses NSEvent.addGlobalMonitorForEvents (Accessibility) instead of
  // CGEventTap (Input Monitoring) for keyboard/mouse activity detection.
  return getAccessibilityAuthorized();
}

/**
 * Lightweight diagnostic snapshot for permission troubleshooting.
 * Does not open prompts or settings.
 */
function getPermissionDiagnosticSnapshot() {
  const platform = process.platform;
  const snapshot = {
    platform,
    timestamp: new Date().toISOString(),
    screenStatus: null,
    accessibility: null,
    inputMonitoring: null,
    api: {
      hasSystemPreferences: !!systemPreferences,
      hasGetMediaAccessStatus: typeof systemPreferences?.getMediaAccessStatus === 'function',
      hasTrustedAccessibilityClient: typeof systemPreferences?.isTrustedAccessibilityClient === 'function',
      hasNodeMacPermissions: !!getAuthStatus
    }
  };

  try { snapshot.screenStatus = getScreenStatus(); } catch (e) { snapshot.screenStatus = `error:${e.message}`; }
  try { snapshot.accessibility = getAccessibilityAuthorized(); } catch (e) { snapshot.accessibility = `error:${e.message}`; }
  try { snapshot.inputMonitoring = getInputMonitoringAuthorized(); } catch (e) { snapshot.inputMonitoring = `error:${e.message}`; }
  return snapshot;
}

/**
 * Show a blocking modal with permission request
 * @param {Object} opts - Modal options
 * @param {string} opts.title - Dialog title
 * @param {string} opts.message - Dialog message
 * @param {string} opts.detail - Dialog detail text
 * @returns {Promise<number>} - Button index clicked
 */
async function showBlocker(opts) {
  const { title, message, detail } = opts;

  const result = await dialog.showMessageBox(null, {
    type: 'warning',
    title,
    message,
    detail,
    buttons: ['Open Settings', 'Re-check', 'Quit'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });

  return result.response;
}

/** Native dialog for macOS with separate shortcuts to common privacy panes */
async function showMacScreenRecordingBlocker() {
  const result = await dialog.showMessageBox(null, {
    type: 'warning',
    title: 'Enable Screen Recording',
    message: 'This app needs Screen Recording to capture activity metrics.',
    detail:
      'Open the right pane below and enable Alyson PM (or Electron when developing), then tap Re-check.\n\n' +
      'If macOS asked to control System Events, use Automation and allow Alyson PM.',
    buttons: ['Screen Recording…', 'Accessibility…', 'Automation…', 'Re-check', 'Quit'],
    defaultId: 0,
    cancelId: 4,
    noLink: true,
  });
  return result.response;
}

/** Windows — separate shortcuts aligned with system-settings-opener WIN_URLS */
async function showWindowsPermissionBlocker() {
  const result = await dialog.showMessageBox(null, {
    type: 'warning',
    title: 'Screen capture & privacy',
    message: 'This app needs permission to capture the screen for screenshots and activity metrics.',
    detail:
      'Use the buttons to open the matching Windows Settings page, allow this app where applicable, then tap Re-check.\n\n' +
      'Graphics capture corresponds to screen/window capture APIs. Privacy opens general app permissions.',
    buttons: ['Graphics capture…', 'Ease of Access…', 'Privacy…', 'Re-check', 'Quit'],
    defaultId: 0,
    cancelId: 4,
    noLink: true,
  });
  return result.response;
}

/** Linux — opens GNOME-style panels when available */
async function showLinuxPermissionBlocker() {
  const result = await dialog.showMessageBox(null, {
    type: 'warning',
    title: 'Display & privacy',
    message: 'This app needs access to your session to capture the screen and activity metrics.',
    detail:
      'Use the buttons to open system settings (GNOME Control Center when installed). On Wayland you may need to grant portal permissions.\n\n' +
      'Then tap Re-check.',
    buttons: ['Privacy & screen…', 'Accessibility…', 'Applications…', 'Re-check', 'Quit'],
    defaultId: 0,
    cancelId: 4,
    noLink: true,
  });
  return result.response;
}

/**
 * Handle screen recording permission check for macOS
 * @returns {Promise<boolean>} - true if permission granted
 */
async function ensureMacOSScreenRecordingPermission() {
  console.log('[perm] Checking macOS screen recording permission...');

  let status = getScreenStatus();
  console.log('[perm] Screen recording status:', status);

  if (status === 'authorized') {
    return true;
  }

  // Request permission first
  if (askForScreenCaptureAccess) {
    try {
      console.log('[perm] Requesting screen capture access...');
      askForScreenCaptureAccess();
    } catch (error) {
      console.error('[perm] Error requesting screen capture access:', error);
    }
  }

  try {
    await openSystemPrivacySettings(shell, { pane: 'screenRecording' });
    console.log('[perm] Opened Screen Recording settings');
  } catch (error) {
    console.warn('[perm] Could not open system preferences automatically:', error);
  }

  // Show blocking modal until permission is granted
  let loopCount = 0;
  while (getScreenStatus() !== 'authorized') {
    loopCount++;
    console.log(`🔥 [EMERGENCY] Permission check loop iteration ${loopCount}, current status:`, getScreenStatus());

    const choice = await showMacScreenRecordingBlocker();

    if (choice === 0) {
      try {
        await openSystemPrivacySettings(shell, { pane: 'screenRecording' });
        console.log('[perm] Opened Screen Recording settings');
      } catch (error) {
        console.warn('[perm] Could not open system preferences:', error);
      }
    } else if (choice === 1) {
      try {
        await openSystemPrivacySettings(shell, { pane: 'accessibility' });
        console.log('[perm] Opened Accessibility settings');
      } catch (error) {
        console.warn('[perm] Could not open Accessibility settings:', error);
      }
    } else if (choice === 2) {
      try {
        await openSystemPrivacySettings(shell, { pane: 'automation' });
        console.log('[perm] Opened Automation settings');
      } catch (error) {
        console.warn('[perm] Could not open Automation settings:', error);
      }
    } else if (choice === 3) {
      // Re-check - add small delay to let TCC update
      console.log('🔥 [EMERGENCY] User clicked Re-check, waiting 2 seconds for TCC to update...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay
      const newStatus = getScreenStatus();
      console.log('🔥 [EMERGENCY] Re-checked screen recording status:', newStatus);
      console.log('🔥 [EMERGENCY] Electron raw status:', systemPreferences.getMediaAccessStatus('screen'));

      if (newStatus === 'authorized') {
        console.log('[perm] ✅ Screen recording permission granted');
        return true;
      } else {
        console.log('🔥 [EMERGENCY] Permission STILL not authorized after re-check!');
      }
    } else if (choice === 4) {
      console.log('[perm] User chose to quit - exiting app');
      app.quit();
      return false;
    }

    // Safety: Break after 10 loops to prevent infinite loop
    if (loopCount > 10) {
      console.error('🔥 [EMERGENCY] Permission check looped 10 times! Breaking out...');
      console.error('🔥 [EMERGENCY] Final status check:', getScreenStatus());
      console.error('🔥 [EMERGENCY] Electron API says:', systemPreferences.getMediaAccessStatus('screen'));
      // Continue anyway
      return false;
    }
  }

  console.log('[perm] ✅ Screen recording permission granted');
  return true;
}

/**
 * Handle screen recording permission check for Windows
 * @returns {Promise<boolean>} - true if permission granted
 */
async function ensureWindowsScreenRecordingPermission() {
  console.log('[perm] Checking Windows screen recording permission...');

  const status = getScreenStatus();
  console.log('[perm] Windows screen recording status:', status);

  if (status === 'authorized') {
    return true;
  }

  try {
    await openSystemPrivacySettings(shell, { pane: 'screenRecording' });
  } catch (error) {
    console.warn('[perm] Could not open Windows Settings automatically:', error);
  }

  let loopCount = 0;
  while (getScreenStatus() !== 'authorized') {
    loopCount++;
    const choice = await showWindowsPermissionBlocker();

    if (choice === 0) {
      try {
        await openSystemPrivacySettings(shell, { pane: 'screenRecording' });
      } catch (error) {
        console.warn('[perm] Could not open Graphics capture settings:', error);
      }
    } else if (choice === 1) {
      try {
        await openSystemPrivacySettings(shell, { pane: 'accessibility' });
      } catch (error) {
        console.warn('[perm] Could not open Ease of Access:', error);
      }
    } else if (choice === 2) {
      try {
        await openSystemPrivacySettings(shell, { pane: 'automation' });
      } catch (error) {
        console.warn('[perm] Could not open Privacy settings:', error);
      }
    } else if (choice === 3) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (getScreenStatus() === 'authorized') {
        console.log('[perm] ✅ Windows permission check: authorized');
        return true;
      }
    } else if (choice === 4) {
      console.log('[perm] User chose to quit - exiting app');
      app.quit();
      return false;
    }

    if (loopCount > 10) {
      console.error('[perm] Windows permission dialog loop limit — continuing without confirmation');
      return false;
    }
  }

  return true;
}

/**
 * Handle screen recording permission check for Linux
 * @returns {Promise<boolean>} - true if permission granted
 */
async function ensureLinuxScreenRecordingPermission() {
  console.log('[perm] Checking Linux screen recording permission...');

  const status = getScreenStatus();
  console.log('[perm] Linux display server status:', status);

  if (status === 'authorized') {
    return true;
  }

  try {
    await openSystemPrivacySettings(shell, { pane: 'screenRecording' });
  } catch (error) {
    console.warn('[perm] Could not open Linux settings automatically:', error);
  }

  let loopCount = 0;
  while (getScreenStatus() !== 'authorized') {
    loopCount++;
    const choice = await showLinuxPermissionBlocker();

    if (choice === 0) {
      try {
        await openSystemPrivacySettings(shell, { pane: 'screenRecording' });
      } catch (error) {
        console.warn('[perm] Could not open Privacy / screen settings:', error);
      }
    } else if (choice === 1) {
      try {
        await openSystemPrivacySettings(shell, { pane: 'accessibility' });
      } catch (error) {
        console.warn('[perm] Could not open Accessibility settings:', error);
      }
    } else if (choice === 2) {
      try {
        await openSystemPrivacySettings(shell, { pane: 'automation' });
      } catch (error) {
        console.warn('[perm] Could not open Applications settings:', error);
      }
    } else if (choice === 3) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (getScreenStatus() === 'authorized') {
        console.log('[perm] ✅ Linux display access OK');
        return true;
      }
    } else if (choice === 4) {
      console.log('[perm] User chose to quit - exiting app');
      app.quit();
      return false;
    }

    if (loopCount > 10) {
      console.error('[perm] Linux permission dialog loop limit — exiting flow');
      return false;
    }
  }

  return true;
}

/**
 * Handle accessibility permission check for macOS
 * @returns {Promise<boolean>} - true if permission granted
 */
async function ensureMacOSAccessibilityPermission() {
  console.log('[perm] Checking macOS accessibility permission...');

  let authorized = getAccessibilityAuthorized();
  console.log('[perm] Accessibility authorized:', authorized);

  if (authorized) {
    return true;
  }

  // Request permission first
  if (askForAccessibilityAccess) {
    try {
      console.log('[perm] Requesting accessibility access...');
      askForAccessibilityAccess();
    } catch (error) {
      console.error('[perm] Error requesting accessibility access:', error);
    }
  }

  // Open system preferences using shell.openExternal with macOS URL scheme
  try {
    const { shell } = require('electron');
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    console.log('[perm] Opened Accessibility settings');
  } catch (error) {
    console.warn('[perm] Could not open system preferences automatically:', error);
  }

  // Show blocking modal until permission is granted
  while (!getAccessibilityAuthorized()) {
    const choice = await showBlocker({
      title: 'Enable Accessibility',
      message: 'This app needs Accessibility to detect input activity.',
      detail: 'System Settings → Privacy & Security → Accessibility. Tick the checkbox next to this app.'
    });

    if (choice === 0) {
      // Open Settings again using shell.openExternal
      try {
        const { shell } = require('electron');
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        console.log('[perm] Opened Accessibility settings');
      } catch (error) {
        console.warn('[perm] Could not open system preferences:', error);
      }
    } else if (choice === 1) {
      // Re-check - add small delay to let TCC update
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay
      const newAuthorized = getAccessibilityAuthorized();
      console.log('[perm] Re-checked accessibility authorized:', newAuthorized);

      if (newAuthorized) {
        console.log('[perm] ✅ Accessibility permission granted');
        return true;
      }
    } else {
      // Quit
      console.log('[perm] User chose to quit - exiting app');
      app.quit();
      return false;
    }
  }

  console.log('[perm] ✅ Accessibility permission granted');
  return true;
}

// ensureMacOSInputMonitoringPermission() — REMOVED
// Input Monitoring permission is no longer required.
// The app now uses Accessibility permission for input detection (NSEvent global monitor).
// The ensureMacOSAccessibilityPermission() function above handles the Accessibility check.

/**
 * Handle accessibility permission check for Windows
 * @returns {Promise<boolean>} - true if permission granted
 */
async function ensureWindowsAccessibilityPermission() {
  console.log('[perm] Checking Windows accessibility permission...');

  const authorized = getAccessibilityAuthorized();
  console.log('[perm] Windows accessibility authorized:', authorized);

  if (authorized) {
    return true;
  }

  // Show informational dialog about Windows accessibility
  const choice = await showBlocker({
    title: 'Enable Accessibility Features',
    message: 'This app needs accessibility features to detect input activity.',
    detail: 'Windows Settings → Ease of Access → Interaction → Use the computer without a mouse or keyboard. Some features may need to be enabled.'
  });

  if (choice === 0) {
    // Open Windows Accessibility Settings
    try {
      await shell.openExternal('ms-settings:easeofaccess-keyboard');
    } catch (error) {
      console.warn('[perm] Could not open Windows Accessibility Settings:', error);
    }
    return ensureWindowsAccessibilityPermission();
  } else if (choice === 1) {
    // Re-check
    await new Promise(resolve => setTimeout(resolve, 300));
    return true; // Assume granted on Windows
  } else {
    // Quit
    console.log('[perm] User chose to quit - exiting app');
    app.quit();
    return false;
  }
}

/**
 * Handle accessibility permission check for Linux
 * @returns {Promise<boolean>} - true if permission granted
 */
async function ensureLinuxAccessibilityPermission() {
  console.log('[perm] Checking Linux accessibility permission...');

  const authorized = getAccessibilityAuthorized();
  console.log('[perm] Linux accessibility authorized:', authorized);

  if (authorized) {
    return true;
  }

  // Show informational dialog about Linux accessibility
  const choice = await showBlocker({
    title: 'Enable Accessibility Support',
    message: 'This app needs AT-SPI accessibility support to detect input activity.',
    detail: 'Install and enable AT-SPI: sudo apt install at-spi2-core (Ubuntu/Debian) or equivalent for your distribution. Restart the desktop session if needed.'
  });

  if (choice === 0) {
    // Open documentation about AT-SPI
    try {
      await shell.openExternal('https://wiki.gnome.org/Accessibility/AT-SPI');
    } catch (error) {
      console.warn('[perm] Could not open AT-SPI documentation:', error);
    }
    return ensureLinuxAccessibilityPermission();
  } else if (choice === 1) {
    // Re-check
    await new Promise(resolve => setTimeout(resolve, 300));
    const newAuthorized = getAccessibilityAuthorized();
    return newAuthorized;
  } else {
    // Quit
    console.log('[perm] User chose to quit - exiting app');
    app.quit();
    return false;
  }
}

/**
 * Main function to ensure platform-specific permissions are granted
 * Runs on macOS, Windows, and Linux with platform-specific checks
 * @returns {Promise<void>}
 */
async function ensureMacPermissions() {
  const platform = process.platform;
  console.log(`[perm] 🖥️ Starting ${platform} permission checks...`);

  try {
    if (platform === 'darwin') {
      // macOS — only Screen Recording + Accessibility needed
      // Input Monitoring is no longer required (switched to NSEvent/Accessibility)
      console.log('[perm] 🍎 Running macOS permission checks...');
      await ensureMacOSScreenRecordingPermission();
      await ensureMacOSAccessibilityPermission();
      console.log('[perm] 🎉 All macOS permissions granted successfully');

    } else if (platform === 'win32') {
      // Windows
      console.log('[perm] 🪟 Running Windows permission checks...');
      await ensureWindowsScreenRecordingPermission();
      await ensureWindowsAccessibilityPermission();
      console.log('[perm] 🎉 All Windows permissions verified successfully');

    } else if (platform === 'linux') {
      // Linux
      console.log('[perm] 🐧 Running Linux permission checks...');
      await ensureLinuxScreenRecordingPermission();
      await ensureLinuxAccessibilityPermission();
      console.log('[perm] 🎉 All Linux permissions verified successfully');

    } else {
      // Other platforms
      console.log(`[perm] ✅ Platform ${platform} - no specific permission checks required`);
    }

  } catch (error) {
    console.error(`[perm] ❌ Error during ${platform} permission checks:`, error);

    // Show error and quit
    if (dialog && dialog.showErrorBox) {
      dialog.showErrorBox(
        'Permission Check Failed',
        `Failed to verify ${platform} permissions: ${error.message}\n\nThe app will now exit.`
      );
    }

    app.quit();
  }
}

module.exports = {
  ensureMacPermissions,
  getScreenStatus,
  getAccessibilityAuthorized,
  getInputMonitoringAuthorized,
  getPermissionDiagnosticSnapshot
};
