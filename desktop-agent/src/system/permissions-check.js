/**
 * Cross-Platform Permissions Check Module
 * Ensures required permissions are granted before app starts on macOS, Windows, and Linux
 */

const { dialog, app, systemPreferences, shell } = require('electron');
const os = require('os');

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
    // macOS - Use Electron's systemPreferences API for consistency
    try {
      const electronStatus = systemPreferences.getMediaAccessStatus('screen');
      console.log('🔥 [EMERGENCY] Electron API screen status RAW:', electronStatus);
      console.log('🔥 [EMERGENCY] Type:', typeof electronStatus);
      console.log('🔥 [EMERGENCY] Checking if === "granted":', electronStatus === 'granted');

      // Map Electron status to our expected format
      if (electronStatus === 'granted') {
        console.log('🔥 [EMERGENCY] Returning "authorized"');
        return 'authorized';
      }
      if (electronStatus === 'denied') return 'denied';
      if (electronStatus === 'restricted') return 'restricted';
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
    // macOS — prefer node-mac-permissions, fall back to Electron's systemPreferences
    if (getAuthStatus) {
      try {
        return getAuthStatus('accessibility') === 'authorized';
      } catch (error) {
        console.error('[perm] Error checking macOS accessibility via node-mac-permissions:', error);
      }
    }
    // Fallback: use Electron built-in (does NOT require node-mac-permissions)
    try {
      return systemPreferences.isTrustedAccessibilityClient(false);
    } catch (error) {
      console.error('[perm] Error checking macOS accessibility via systemPreferences:', error);
      return false;
    }
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

  // Open system preferences using shell.openExternal with macOS URL scheme
  try {
    const { shell } = require('electron');
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    console.log('[perm] Opened Screen Recording settings');
  } catch (error) {
    console.warn('[perm] Could not open system preferences automatically:', error);
  }

  // Show blocking modal until permission is granted
  let loopCount = 0;
  while (getScreenStatus() !== 'authorized') {
    loopCount++;
    console.log(`🔥 [EMERGENCY] Permission check loop iteration ${loopCount}, current status:`, getScreenStatus());

    const choice = await showBlocker({
      title: 'Enable Screen Recording',
      message: 'This app needs Screen Recording to capture activity metrics.',
      detail: 'System Settings → Privacy & Security → Screen Recording. Tick the checkbox next to this app. You may need to quit & reopen when prompted.'
    });

    if (choice === 0) {
      // Open Settings again using shell.openExternal
      try {
        const { shell } = require('electron');
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
        console.log('[perm] Opened Screen Recording settings');
      } catch (error) {
        console.warn('[perm] Could not open system preferences:', error);
      }
    } else if (choice === 1) {
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
    } else {
      // Quit
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

  // On Windows 10/11, check if the app can capture screen
  const status = getScreenStatus();
  console.log('[perm] Windows screen recording status:', status);

  if (status === 'authorized') {
    return true;
  }

  // Show informational dialog about Windows permissions
  const choice = await showBlocker({
    title: 'Enable Screen Recording',
    message: 'This app needs screen recording permissions to capture activity metrics.',
    detail: 'Windows Settings → Privacy & Security → Screen Recording → Allow apps to record your screen. Make sure this app is enabled.'
  });

  if (choice === 0) {
    // Open Windows Settings
    try {
      await shell.openExternal('ms-settings:privacy-screencapture');
    } catch (error) {
      console.warn('[perm] Could not open Windows Settings automatically:', error);
    }
    // Show again after user hopefully enabled it
    return ensureWindowsScreenRecordingPermission();
  } else if (choice === 1) {
    // Re-check
    await new Promise(resolve => setTimeout(resolve, 300));
    return true; // Assume granted on Windows for now
  } else {
    // Quit
    console.log('[perm] User chose to quit - exiting app');
    app.quit();
    return false;
  }
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

  // Show informational dialog about Linux permissions
  const choice = await showBlocker({
    title: 'Enable Screen Recording',
    message: 'This app needs access to your display server to capture activity metrics.',
    detail: 'Ensure your display server (X11/Wayland) is running and accessible. You may need to start the app from a terminal or grant permissions to access the display.'
  });

  if (choice === 0) {
    // Open documentation or settings (Linux-specific)
    try {
      // Try to open system settings or provide help
      await shell.openExternal('https://wiki.archlinux.org/title/Screen_capture');
    } catch (error) {
      console.warn('[perm] Could not open help documentation:', error);
    }
    // Show again after user hopefully fixed it
    return ensureLinuxScreenRecordingPermission();
  } else if (choice === 1) {
    // Re-check
    await new Promise(resolve => setTimeout(resolve, 300));
    const newStatus = getScreenStatus();
    return newStatus === 'authorized';
  } else {
    // Quit
    console.log('[perm] User chose to quit - exiting app');
    app.quit();
    return false;
  }
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
  getInputMonitoringAuthorized
};
