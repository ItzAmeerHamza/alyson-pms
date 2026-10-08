/**
 * macOS App Detection Module
 * Platform-specific code for detecting active applications on macOS
 * Extracted from main.js for modular architecture
 */

const { exec } = require('child_process');

const BROWSER_NAME_RE = /safari|chrome|firefox|edge|brave|opera|arc|vivaldi|chromium|\bdia\b/i;

let activeWinFn = null;
let activeWinBroken = false;
let activeWinFailCount = 0;

function looksLikeBrowserApp(name) {
  return BROWSER_NAME_RE.test(String(name || ''));
}

function loadActiveWin() {
  if (activeWinBroken) return null;
  if (activeWinFn) return activeWinFn;
  try {
    activeWinFn = require('active-win');
  } catch (_) {
    activeWinBroken = true;
    return null;
  }
  return activeWinFn;
}

function normalizeActiveWinResult(result) {
  if (!result?.owner?.name) return null;
  const appName = String(result.owner.name).replace(/\.app$/i, '');
  return {
    name: appName,
    bundleId: result.owner.bundleId || '',
    title: result.title || 'No Window',
    platform: 'darwin',
    method: 'active-win',
    pid: result.owner.processId || null,
  };
}

async function tryActiveWin() {
  const activeWin = loadActiveWin();
  if (!activeWin) return null;
  const timeoutMs = 800;
  try {
    const result = await Promise.race([
      activeWin(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('active-win timeout')), timeoutMs)),
    ]);
    const normalized = normalizeActiveWinResult(result);
    if (!normalized) {
      activeWinFailCount += 1;
      if (activeWinFailCount >= 3) activeWinBroken = true;
      return null;
    }
    activeWinFailCount = 0;
    return normalized;
  } catch (_) {
    activeWinFailCount += 1;
    if (activeWinFailCount >= 3) activeWinBroken = true;
    return null;
  }
}

function _resetActiveWinForTests() {
  activeWinFn = null;
  activeWinBroken = false;
  activeWinFailCount = 0;
  lastKnownApp = null;
  resetOsascriptBackoff();
}

async function execAsync(command, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(error);
      resolve((stdout || '').trim());
    });
  });
}

// App detection logging counter to reduce spam
let appDetectionLogCounter = 0;

// Keep the last good foreground app so a wedged System Events tick
// does not spawn osascript / ps / lsof and beachball the Mac.
let lastKnownApp = null;

// 1.5s — 8s waits were long enough to freeze the menu bar when
// System Events was already wedged (zaman@cintara.ai Oct 7/8).
const OSA_TIMEOUT_MS = 1500;

// macOS AppleScript / System Events backoff. Any osascript failure
// arms this — not only "accessibility denied" strings.
const accessibilityBackoff = {
  failureCount: 0,
  lastFailureTime: 0,
  nextRetryTime: 0,
  warningShown: false,
  baseDelay: 30 * 1000, // 30s first retry; do not hammer System Events
  maxDelay: 300000, // Max 5 minutes
  resetAfter: 600000 // Reset after 10 minutes of success
};

function rememberApp(app) {
  if (app?.name) lastKnownApp = app;
  return app;
}

function cheapFallbackApp(reason) {
  if (lastKnownApp?.name) {
    return { ...lastKnownApp, method: lastKnownApp.method || 'last-known' };
  }
  return {
    name: 'Desktop Activity',
    bundleId: 'com.desktop.activity',
    title: 'User Activity Detected',
    platform: 'darwin',
    method: reason || 'default-fallback',
  };
}

function resetOsascriptBackoff() {
  accessibilityBackoff.failureCount = 0;
  accessibilityBackoff.lastFailureTime = 0;
  accessibilityBackoff.nextRetryTime = 0;
  accessibilityBackoff.warningShown = false;
}

function armOsascriptBackoff() {
  const now = Date.now();
  accessibilityBackoff.failureCount += 1;
  accessibilityBackoff.lastFailureTime = now;
  const delay = Math.min(
    accessibilityBackoff.baseDelay * Math.pow(2, accessibilityBackoff.failureCount - 1),
    accessibilityBackoff.maxDelay,
  );
  accessibilityBackoff.nextRetryTime = now + delay;
  if (!accessibilityBackoff.warningShown) {
    console.warn('⚠️ [MACOS] System Events/osascript failed. Skipping AppleScript until backoff expires.');
    console.warn(`⚠️ [MACOS] Will retry in ${delay / 1000}s (max ${accessibilityBackoff.maxDelay / 1000}s)`);
    accessibilityBackoff.warningShown = true;
  }
  return delay;
}

/**
 * Get the currently active application on macOS
 */
async function getMacActiveApplication() {
  try {
    const currentMode = global.performanceMode || 'standard';

    // PRIMARY: native Accessibility via active-win (~10ms). Do this even when
    // AppleScript is in backoff — the two APIs fail independently.
    const native = await tryActiveWin();
    if (native) {
      appDetectionLogCounter++;
      if (currentMode !== 'ultra_performance' && appDetectionLogCounter % 100 === 0) {
        try {
          const { logger } = require('../../modules/utils/logger');
          logger && logger.debug({ category: 'APP_DETECTION', step: 'ACTIVE-WIN OK', message: native.name });
        } catch {}
      }
      if (global.captureActiveApp) {
        setTimeout(() => global.captureActiveApp(), 100);
      }
      return rememberApp(native);
    }

    const now = Date.now();
    if (accessibilityBackoff.failureCount > 0 && now < accessibilityBackoff.nextRetryTime) {
      return cheapFallbackApp('osascript-backoff');
    }

    // FALLBACK: AppleScript with System Events (requires Accessibility permission)
    try {
      // Combined script to get app name, bundle ID, and window title in one call
            // Use JSON.stringify to properly escape the script
      const combinedScript = `tell application "System Events"
set frontApp to first application process whose frontmost is true
set appName to name of frontApp
set appBundleId to bundle identifier of frontApp
try
  set windowTitle to name of front window of frontApp
on error
  set windowTitle to "No Window"
end try
return appName & "|" & appBundleId & "|" & windowTitle
end tell`;
      
      // Use heredoc approach to avoid escaping issues
      const scriptResult = await execAsync(`/usr/bin/osascript << 'EOF'
${combinedScript}
EOF`, OSA_TIMEOUT_MS);
      
      const [appName, bundleId, windowTitle] = scriptResult.split('|');

      if (accessibilityBackoff.failureCount > 0) {
        console.log('✅ [MACOS] AppleScript working again, resetting accessibility backoff');
      }
      resetOsascriptBackoff();
      
      // Only log occasionally to reduce spam - much more aggressive in ultra performance mode
      appDetectionLogCounter++;
      
      // In ultra performance mode, disable all app detection logging
      if (currentMode === 'ultra_performance') {
        // No logging at all in ultra performance mode
      } else if (appDetectionLogCounter % 100 === 0) { // Log every 100th detection instead of 20th
        try { const { logger } = require('../../modules/utils/logger'); logger && logger.debug({ category: 'APP_DETECTION', step: 'PRIMARY OK', message: appName }); } catch {}
      }
      
      // IMMEDIATE APP CAPTURE: Trigger capture when app is detected
      if (global.captureActiveApp) {
        try { const { logger } = require('../../modules/utils/logger'); logger && logger.debug({ category: 'APP_DETECTION', step: 'TRIGGER CAPTURE', message: appName }); } catch {}
        setTimeout(() => global.captureActiveApp(), 100); // Small delay to avoid conflicts
      }
      
      // Enhanced logging for Apple apps
      const result = {
        name: appName,
        bundleId: bundleId,
        title: windowTitle,
        platform: 'darwin',
        method: 'applescript'
      };
      
      // Log Apple apps detection specifically
      if (bundleId && bundleId.startsWith('com.apple.')) {
        try { const { logger } = require('../../modules/utils/logger'); logger && logger.info({ category: 'APP_DETECTION', step: 'APPLE', ctx: { name: appName, bundleId, title: windowTitle, timestamp: new Date().toISOString() } }); } catch {}
      }

      return rememberApp(result);
    } catch (primaryError) {
      // Any osascript failure (timeout, System Events wedge, permission)
      // arms backoff. Do not spawn ps/lsof — those made a hung Mac worse.
      armOsascriptBackoff();

      const errorMessage = primaryError?.message || String(primaryError);
      const isTimeout = errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout');
      
      if (isTimeout) {
        try { const { logger } = require('../../modules/utils/logger'); logger && logger.warn({ category: 'APP_DETECTION', step: 'PRIMARY FAIL', message: `AppleScript timeout (${errorMessage})` }); } catch {}
        console.warn('⚠️ [MACOS] AppleScript timeout — backing off System Events');
      } else {
        try { const { logger } = require('../../modules/utils/logger'); logger && logger.warn({ category: 'APP_DETECTION', step: 'PRIMARY FAIL', message: errorMessage }); } catch {}
      }

      return cheapFallbackApp('osascript-fail');
    }
  } catch (error) {
    return cheapFallbackApp('detect-error');
  }
}

/**
 * Get current performance mode
 */
function getCurrentMode() {
  return global.performanceMode || 'standard';
}

/**
 * Unified interface for platform managers
 * Returns strict ActiveApp type
 */
async function detectActiveApp() {
  const app = await getMacActiveApplication();
  if (!app) return null;
  
  return {
    appName: app.name,
    windowTitle: app.title || 'No Window',
    bundleId: app.bundleId,
    pid: app.pid || null,
    platform: 'darwin',
    method: app.method,
    isBrowser: looksLikeBrowserApp(app.name),
  };
}

module.exports = {
  getMacActiveApplication,
  detectActiveApp,
  looksLikeBrowserApp,
  OSA_TIMEOUT_MS,
  _resetActiveWinForTests,
  _getOsascriptBackoffForTests: () => ({ ...accessibilityBackoff }),
};