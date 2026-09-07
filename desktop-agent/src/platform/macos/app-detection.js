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

// macOS Accessibility permission backoff state
const accessibilityBackoff = {
  failureCount: 0,
  lastFailureTime: 0,
  nextRetryTime: 0,
  warningShown: false,
  baseDelay: 1000, // Start with 1 second
  maxDelay: 300000, // Max 5 minutes
  resetAfter: 600000 // Reset after 10 minutes of success
};

// Fallback cooldown to prevent heavy process spawning
const fallbackCooldown = {
  psCommandLastUsed: 0,
  lsofCommandLastUsed: 0,
  cooldownMs: 8000 // 8 second cooldown for heavy fallbacks
};

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
      return native;
    }

    const now = Date.now();
    if (accessibilityBackoff.failureCount > 0 && now < accessibilityBackoff.nextRetryTime) {
      throw new Error('Accessibility backoff active');
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
EOF`, 8000);
      
      const [appName, bundleId, windowTitle] = scriptResult.split('|');
      
      // Reset accessibility backoff on successful execution
      if (accessibilityBackoff.failureCount > 0) {
        console.log('✅ [MACOS] AppleScript working again, resetting accessibility backoff');
        accessibilityBackoff.failureCount = 0;
        accessibilityBackoff.nextRetryTime = 0;
        accessibilityBackoff.warningShown = false;
      }
      
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
      
      // Reset backoff on success
      if (accessibilityBackoff.failureCount > 0) {
        console.log('✅ [MACOS] Accessibility permission restored - resetting backoff');
        accessibilityBackoff.failureCount = 0;
        accessibilityBackoff.lastFailureTime = 0;
        accessibilityBackoff.nextRetryTime = 0;
        accessibilityBackoff.warningShown = false;
      }
      
      return result;
    } catch (primaryError) {
      // Handle accessibility permission failure with exponential backoff
      const isAccessibilityError = primaryError.message && 
        (primaryError.message.includes('System Events') || 
         primaryError.message.includes('not allowed') ||
         primaryError.message.includes('accessibility'));
      
      if (isAccessibilityError) {
        const now = Date.now();
        accessibilityBackoff.failureCount++;
        accessibilityBackoff.lastFailureTime = now;
        
        // Calculate exponential backoff delay
        const delay = Math.min(
          accessibilityBackoff.baseDelay * Math.pow(2, accessibilityBackoff.failureCount - 1),
          accessibilityBackoff.maxDelay
        );
        accessibilityBackoff.nextRetryTime = now + delay;
        
        // Show warning only once
        if (!accessibilityBackoff.warningShown) {
          console.warn('⚠️ [MACOS] Accessibility permission denied. App detection will use fallback methods.');
          console.warn(`⚠️ [MACOS] Will retry in ${delay/1000}s, then ${delay*2/1000}s, up to ${accessibilityBackoff.maxDelay/1000}s`);
          accessibilityBackoff.warningShown = true;
        }
        
        if (process.env.DEBUG_APP) {
          console.log(`[MACOS] Accessibility backoff: attempt ${accessibilityBackoff.failureCount}, retry in ${delay/1000}s`);
        }
      }
      
      // Enhanced error logging with timeout detection
      const errorMessage = primaryError?.message || String(primaryError);
      const isTimeout = errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout');
      
      if (isTimeout) {
        try { const { logger } = require('../../modules/utils/logger'); logger && logger.warn({ category: 'APP_DETECTION', step: 'PRIMARY FAIL', message: `AppleScript timeout (${errorMessage}) - increasing timeout may help` }); } catch {}
        console.warn('⚠️ [MACOS] AppleScript timeout detected - this may indicate system load or permission issues');
      } else {
        try { const { logger } = require('../../modules/utils/logger'); logger && logger.warn({ category: 'APP_DETECTION', step: 'PRIMARY FAIL', message: errorMessage }); } catch {}
      }
      
      // FALLBACK METHOD 1: Use ps command to find frontmost processes (with cooldown)
      try {
        const now = Date.now();
        if (now - fallbackCooldown.psCommandLastUsed < fallbackCooldown.cooldownMs) {
          throw new Error('ps command on cooldown');
        }
        
        fallbackCooldown.psCommandLastUsed = now;
        try { const { logger } = require('../../modules/utils/logger'); logger && logger.debug({ category: 'APP_DETECTION', step: 'FALLBACK1 TRY', message: 'ps command' }); } catch {}
        const psResult = await execAsync(`ps aux | grep -E "(Safari|Chrome|Firefox|Cursor|Code|Terminal|Finder)" | grep -v grep | head -10`, 3000);
        
        if (psResult) {
          const lines = psResult.split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const command = parts.slice(10).join(' ');
            
            // Extract app name from process command
            let appName = 'Unknown';
            if (command.includes('Safari')) appName = 'Safari';
            else if (command.includes('Chrome')) appName = 'Google Chrome';
            else if (command.includes('Firefox')) appName = 'Firefox';
            else if (command.includes('Cursor')) appName = 'Cursor';
            else if (command.includes('Code')) appName = 'Visual Studio Code';
            else if (command.includes('Terminal')) appName = 'Terminal';
            else if (command.includes('Finder')) appName = 'Finder';
            
            if (appName !== 'Unknown') {
              // Use same counter for fallback method 1 logging - respect ultra performance mode
              if (currentMode === 'ultra_performance') {
                // No logging at all in ultra performance mode
              } else if (appDetectionLogCounter % 100 === 0) {
                try { const { logger } = require('../../modules/utils/logger'); logger && logger.debug({ category: 'APP_DETECTION', step: 'FALLBACK1 OK', message: appName }); } catch {}
              }
              
              // IMMEDIATE APP CAPTURE: Trigger capture when app is detected
              if (global.captureActiveApp) {
                try { const { logger } = require('../../modules/utils/logger'); logger && logger.debug({ category: 'APP_DETECTION', step: 'TRIGGER CAPTURE', message: appName }); } catch {}
                setTimeout(() => global.captureActiveApp(), 100);
              }
              
              return {
                name: appName,
                bundleId: 'unknown',
                title: 'Unknown Window',
                platform: 'darwin',
                method: 'ps-fallback'
              };
            }
          }
        }
        
        // FALLBACK METHOD 2: Use lsof to detect browser network activity (with cooldown)
        const lsofNow = Date.now();
        if (lsofNow - fallbackCooldown.lsofCommandLastUsed < fallbackCooldown.cooldownMs) {
          throw new Error('lsof command on cooldown');
        }
        
        fallbackCooldown.lsofCommandLastUsed = lsofNow;
        try { const { logger } = require('../../modules/utils/logger'); logger && logger.debug({ category: 'APP_DETECTION', step: 'FALLBACK2 TRY', message: 'network activity' }); } catch {}
        const lsofResult = await execAsync(`lsof -i TCP:80,TCP:443 | grep -E "(Safari|Chrome|Firefox)" | head -5`, 3000);
        
        if (lsofResult) {
          const lines = lsofResult.split('\n');
          for (const line of lines) {
            let appName = 'Unknown';
            if (line.includes('Safari')) appName = 'Safari';
            else if (line.includes('Chrome')) appName = 'Google Chrome';
            else if (line.includes('Firefox')) appName = 'Firefox';
            
            if (appName !== 'Unknown') {
              console.log('✅ [APP-DETECT] Fallback method 2 successful:', appName);
              return {
                name: appName,
                bundleId: 'unknown',
                title: 'Active Network Connection',
                platform: 'darwin',
                method: 'network-fallback'
              };
            }
          }
        }
        
        // FALLBACK METHOD 3: Always return a default active app to keep tracking working
        console.log('⚠️ [APP-DETECT] All methods failed, using default app detection');
        return {
          name: 'Desktop Activity',
          bundleId: 'com.desktop.activity',
          title: 'User Activity Detected',
          platform: 'darwin',
          method: 'default-fallback'
        };
        
      } catch (fallbackError) {
        console.log('❌ [APP-DETECT] All fallback methods failed:', fallbackError.message);
        throw new Error(`All macOS app detection methods failed: ${primaryError.message}`);
      }
    }
  } catch (error) {
    throw new Error(`macOS app detection failed: ${error.message}`);
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
  _resetActiveWinForTests,
};