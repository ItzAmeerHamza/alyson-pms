// 🛡️ EPIPE PROTECTION - Prevent crashes from console.log during shutdown
process.on('uncaughtException', (error) => {
  if (error.code === 'EPIPE') {
    // Silently handle EPIPE errors to prevent crashes
    return;
  }
  // Log the error to help debug shutdown issues
  console.error('❌ [UNCAUGHT EXCEPTION]:', error);
  console.error('Stack trace:', error.stack);

  // For now, don't re-throw to see if this is causing the shutdown
  // TODO: Remove this debug code after fixing the shutdown issue
  // throw error;
});

// Also catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [UNHANDLED REJECTION] at:', promise);
  console.error('Reason:', reason);
  if (reason && reason.stack) {
    console.error('Stack trace:', reason.stack);
  }
});

// Wrap console.log to prevent EPIPE crashes
const originalConsoleLog = console.log;
console.log = function (...args) {
  try {
    if (!process.stdout.destroyed) {
      originalConsoleLog.apply(console, args);
    }
  } catch (error) {
    if (error.code !== 'EPIPE') {
      // Only re-throw non-EPIPE errors
      throw error;
    }
  }
};

console.log('🚀 [MAIN] main.js starting...');

// DNS RESOLUTION FIX FOR ELECTRON APPS
// Configure Node.js to use system DNS resolver
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']); // Use Google and Cloudflare DNS

// Enhanced DNS resolution with fallback
const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  originalLookup.call(this, hostname, options, (err, address, family) => {
    if (err && err.code === 'ENOTFOUND') {
      console.log(`🔄 DNS lookup failed for ${hostname}, trying alternative resolution...`);
      // Try alternative DNS servers
      const alternativeServers = ['1.1.1.1', '8.8.8.8'];
      let attempts = 0;

      const tryAlternative = () => {
        if (attempts >= alternativeServers.length) {
          callback(err, address, family);
          return;
        }

        const server = alternativeServers[attempts];
        attempts++;

        // Use a different approach for resolution
        require('child_process').exec(`nslookup ${hostname} ${server}`, (execErr, stdout) => {
          if (execErr) {
            tryAlternative();
          } else {
            const match = stdout.match(/Address:\s*(\d+\.\d+\.\d+\.\d+)/);
            if (match) {
              callback(null, match[1], 4);
            } else {
              tryAlternative();
            }
          }
        });
      };

      tryAlternative();
    } else {
      callback(err, address, family);
    }
  });
};

console.log('🔧 Enhanced DNS resolver configured for Electron app');

// 🔧 URL POLLING FIX - Apply fixes to UrlCaptureManager when it's created
function applyUrlPollingFixes() {
  console.log('🔧 [URL-FIX] Setting up URL polling fixes...');
  console.log('🔧 [URL-FIX] Global objects check:', {
    urlCaptureManager: !!global.urlCaptureManager,
    enhancedSyncManager: !!global.enhancedSyncManager,
    supabaseService: !!global.supabaseService
  });

  // Wait for UrlCaptureManager to be created
  let urlFixAttempts = 0;
  const checkInterval = setInterval(() => {
    urlFixAttempts++;
    console.log('🔧 [URL-FIX] Checking for UrlCaptureManager...', {
      exists: !!global.urlCaptureManager,
      type: global.urlCaptureManager ? typeof global.urlCaptureManager : 'undefined',
      hasOn: global.urlCaptureManager ? typeof global.urlCaptureManager.on === 'function' : false
    });

    if (global.urlCaptureManager) {
      clearInterval(checkInterval);
      console.log('🔧 [URL-FIX] UrlCaptureManager found, applying fixes...');

      // Fix 1: Set isPolling to true when starting
      const originalStart = global.urlCaptureManager.start;
      global.urlCaptureManager.start = function () {
        console.log('🔧 [URL-FIX] Setting isPolling to true');
        this.isPolling = true;
        return originalStart.call(this);
      };

      // Fix 2: Ensure isPolling is set to false when stopping
      const originalStop = global.urlCaptureManager.stop;
      global.urlCaptureManager.stop = function () {
        console.log('🔧 [URL-FIX] Setting isPolling to false');
        this.isPolling = false;
        return originalStop.call(this);
      };

      // Fix 3: Add missing isPolling property if it doesn't exist
      if (global.urlCaptureManager.isPolling === undefined) {
        global.urlCaptureManager.isPolling = true;
        console.log('🔧 [URL-FIX] Added missing isPolling property');
      }

      // Fix 4: Override the polling logic to ensure it works
      const originalCaptureCurrentUrl = global.urlCaptureManager.captureCurrentUrl;
      global.urlCaptureManager.captureCurrentUrl = async function () {
        // Performance monitoring
        let perfTimer = null;
        try {
          if (global.performanceMonitor) {
            perfTimer = global.performanceMonitor.trackUrlPoll();
          }
        } catch { }

        if (!this.adapter || !this.isRunning) {
          return;
        }

        try {
          const result = await this.adapter.getCurrentUrl();

          if (result && result.url) {
            console.log('🔧 [URL-FIX] Processing URL event:', result.url);
            this.processUrlEvent(result);
          }
        } catch (error) {
          console.error('🔧 [URL-FIX] Error in captureCurrentUrl:', error.message);
        } finally {
          // End performance monitoring
          try {
            if (global.performanceMonitor && perfTimer) {
              global.performanceMonitor.endTimer(perfTimer);
            }
          } catch { }
        }
      };

      console.log('✅ [URL-FIX] URL polling fixes applied');

      // Fix 5: Restart the manager if it's already running
      if (global.urlCaptureManager.isRunning) {
        console.log('🔧 [URL-FIX] Restarting URL manager to apply fixes...');
        global.urlCaptureManager.stop();
        setTimeout(() => {
          global.urlCaptureManager.start();
          console.log('✅ [URL-FIX] URL manager restarted with fixes');
        }, 100);
      }

      // Fix 6: Force attach URL event handler if not already attached - CONTINUOUS CHECK
      if (global.urlCaptureManager) {
        if (!global.primaryUrlEventHandlerAttached && global.urlCaptureManager.listenerCount('url') === 0) {
          console.log('🔧 [URL-FIX] Force attaching URL event handler...');

          global.urlCaptureManager.on('url', (evt) => {
            try {
console.log('\n═══════════════════════════════════════════════════════════');
              console.log('🌐 [URL-STEP-1] EVENT RECEIVED');
              console.log('   URL:', evt?.url);
              console.log('   Browser:', evt?.browser);
              console.log('   Time:', new Date(evt?.ts).toLocaleTimeString());

              // Check user session
              const session = global.sessionManager?.getCurrentSession() || global.currentSession;
              const userId = session?.user?.id || session?.user_id || global.currentUserId;

              if (!userId) {
                console.log('❌ [URL-STEP-2-FAIL] No user logged in - URL NOT saved');
                console.log('═══════════════════════════════════════════════════════════\n');
                return;
              }

              console.log('✓ [URL-STEP-2] User:', userId.substring(0, 8) + '...');

              // CRITICAL: Block internal URLs BEFORE processing
              // FIXED: Use startsWith() for protocols to prevent false positives
              // (e.g., "blob:" was matching "bitbucket.org")
              const urlToCheck = evt?.url || evt?.site_url || '';
              if (urlToCheck) {
                const urlLower = urlToCheck.toLowerCase();
                
                // Protocol patterns - must be at start of URL
                const protocolPatterns = [
                  'file://',
                  'chrome://',
                  'chrome-extension://',
                  'about:',
                  'edge://',
                  'brave://',
                  'vivaldi://',
                  'moz-extension://',
                  'view-source:',
                  'data:', // Data URLs
                  'blob:'  // Blob URLs
                ];

                // Check protocol patterns
                let isInternal = false;
                for (const pattern of protocolPatterns) {
                  if (urlLower.startsWith(pattern)) {
                    isInternal = true;
                    break;
                  }
                }

                // Domain/host patterns - check within URL context
                if (!isInternal) {
                  const hostPatterns = ['localhost', '127.0.0.1', '[::1]', 'app.ebdaatech.com', 'ebdaatech.com'];
                  for (const pattern of hostPatterns) {
                    if (urlLower.includes('://' + pattern) || 
                        urlLower.includes('/' + pattern + '/') ||
                        urlLower.includes('/' + pattern + ':')) {
                      isInternal = true;
                      break;
                    }
                  }
                }

                if (isInternal) {
                  console.log('❌ [URL-STEP-2-BLOCK] BLOCKED internal URL:', urlToCheck.substring(0, 60));
                  console.log('═══════════════════════════════════════════════════════════\n');
                  return; // Stop processing - don't save to database
                }
              }

              // Get time_log_id from multiple sources
              const timeLogIdFromManager = global.trackingManager?.currentTimeLogId;
              const timeLogIdFromGlobal = global.currentTimeLogId;
              const finalTimeLogId = timeLogIdFromManager || timeLogIdFromGlobal || null;

              if (!finalTimeLogId) {
                console.log('⚠️  [URL-STEP-3-WARN] Tracking NOT active (time_log_id is NULL)');
                console.log('   → URL detected but NOT saved to database');
                console.log('   → Start tracking first!');
                console.log('═══════════════════════════════════════════════════════════\n');
                return;
              }

              console.log('✓ [URL-STEP-3] Tracking active (session:', finalTimeLogId, ')');

              const payload = {
                organization_id: null,
                user_id: userId,
                device_id: null,
                time_log_id: finalTimeLogId,
                site_url: evt?.url || null,
                domain: (() => { try { return evt?.url ? new URL(evt.url).hostname : null; } catch { return null; } })(),
                title: evt?.title || '',
                browser: evt?.browser || evt?.source || 'unknown',
                confidence: evt?.confidence || 'high',
                privacy_flags: evt?.privacyFlags || null,
                started_at: new Date((evt && evt.ts) ?? Date.now()).toISOString(),
                ended_at: null
              };

              console.log('✓ [URL-STEP-4] Domain:', payload.domain);

              let queued = false;
              if (global.enhancedSyncManager && global.enhancedSyncManager.addToQueue) {
                try {
                  const result = global.enhancedSyncManager.addToQueue('urlLogs', [payload]);
                  if (result) {
                    queued = true;
                    console.log('✅ [URL-STEP-5] SAVED to queue successfully');
                    console.log('═══════════════════════════════════════════════════════════\n');
                  }
                } catch (error) {
                  console.log('❌ Queue error:', error.message);
                }
              }

              // Fallback to direct database
              if (!queued) {
                if (global.supabaseService && typeof global.supabaseService.from === 'function') {
                  try {
                    global.supabaseService.from('app_url_activity').insert([payload]).then(({ error }) => {
                      if (error) {
                        console.log('❌ [URL-STEP-5] Database error:', error.message);
                        console.log('═══════════════════════════════════════════════════════════\n');
                      } else {
                        console.log('✅ [URL-STEP-5] SAVED to database successfully');
                        console.log('═══════════════════════════════════════════════════════════\n');
                      }
                    });
                  } catch (e) {
                    console.log('❌ [URL-STEP-5] Save error:', e.message);
                    console.log('═══════════════════════════════════════════════════════════\n');
                  }
                } else {
                  console.log('❌ [URL-STEP-5] No save mechanism available!');
                  console.log('═══════════════════════════════════════════════════════════\n');
                }
              }
            } catch (handlerError) {
              console.error('❌ [URL] Event handler error (main.js fallback):', handlerError?.message || handlerError);
            }
          });

          console.log('✅ [URL-FIX] URL event handler force-attached successfully!');
          console.log('🔧 [URL-FIX] Event listeners after attachment:', global.urlCaptureManager.listenerCount('url'));
        } else {
          console.log('🔧 [URL-FIX] URL event handler already attached, listeners:', global.urlCaptureManager.listenerCount('url'));
        }
      } else if (urlFixAttempts < 60) {
        console.log('🔧 [URL-FIX] UrlCaptureManager not yet available, will retry...');
      } else {
        clearInterval(checkInterval);
        console.warn('⚠️ [URL-FIX] UrlCaptureManager not found after 60 attempts; stopping checks');
      }
    }
  }, 1000);
}

// Start the fix application process
applyUrlPollingFixes();

// GLOBAL CONSOLE LOG THROTTLING TO PREVENT UI FREEZE
// Note: Using the global EPIPE-protected console.log wrapper from the top of the file
let lastRealCrossPlatformLog = 0;
const REAL_CROSS_PLATFORM_THROTTLE = 2000; // Only log every 2 seconds

// Throttle REAL_CROSS_PLATFORM move recorded logs
function shouldLogRealCrossPlatform() {
  const now = Date.now();
  if (now - lastRealCrossPlatformLog < REAL_CROSS_PLATFORM_THROTTLE) {
    return false; // Skip this log
  }
  lastRealCrossPlatformLog = now;
  return true;
}





// Replace unsafe notification calls with safe ones
global.safeNotification = (title, body, options) => {
  return global.permissionManagerFix?.safeNotification(title, body, options);
};

// Cache agent version globally for tracking purposes
const packageJson = require('../package.json');
global.agentVersion = packageJson.version;
console.log(`📦 [AGENT-VERSION] Desktop agent version: ${global.agentVersion}`);

// ─── Cache Alyson icon path globally for BrowserWindow and Tray ─────────
// The real Alyson icon lives at assets/icon.png (the compass logo).
// We make it accessible globally so all windows and tray use it.
(function cacheIconPath() {
  const path = require('path');
  const iconPath = path.join(__dirname, '../assets/icon.png');
  global.__alysonIconPath = iconPath;
  console.log('🎨 [ICON] Using Alyson release icon:', iconPath);
})();

// CRITICAL FIX: Initialize tracking state to false on app startup
// This prevents stale state from previous sessions showing Stop button as enabled
global.isTracking = false;
global.isPaused = false;
global.currentTimeLogId = null;
global.currentSession = null;
global.sessionStartTime = null;
console.log('🔧 [INIT] Tracking state initialized to stopped');

console.log('🔧 Notification timing fix applied');

// Check if we're running in Electron MAIN (browser) process.
// Note: `process.versions.electron` can be truthy even when Electron is running as Node
// (e.g. ELECTRON_RUN_AS_NODE), where `require('electron').app` is unavailable.
const isElectronMain =
  typeof process !== 'undefined' &&
  process.versions &&
  !!process.versions.electron &&
  process.type === 'browser';

// Backward-compatible alias used throughout the file.
// Historically `isElectronContext` meant "Electron main"; keep the name to avoid runtime ReferenceErrors.
const isElectronContext = isElectronMain;

// CRITICAL FIX: Prevent multiple startMainApplication calls
let mainApplicationStarted = false;
let mainApplicationStarting = false;

let app, BrowserWindow, powerMonitor, screen, ipcMain, Notification, Tray, Menu, desktopCapturer, systemPreferences, globalShortcut;

// === CONSOLIDATION FIXES (GLOBAL SCOPE) ===
// Import consolidated modules to replace duplicates
let cleanupRegistry, consolidationFixes, wrappers;
// Flag to track if consolidated systems are initialized
let consolidatedSystemsInitialized = false;
let developerConsoleHandlersRegistered = false;

// Flag to prevent duplicate window creation (using global flag)

if (isElectronMain) {
  // We're in Electron - import all modules
  const electronModules = require('electron');
  ({ app, BrowserWindow, powerMonitor, screen, ipcMain, Notification, Tray, Menu, desktopCapturer, systemPreferences, globalShortcut } = electronModules);

  // === MEMORY OPTIMIZATION: Disable GPU process ===
  // Eliminates the GPU subprocess (~30-50MB savings)
  // The agent UI is a simple dashboard — no WebGL/canvas needed
  if (app && typeof app.disableHardwareAcceleration === 'function' && app.commandLine) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    // Enable V8 garbage collection hints for periodic memory cleanup
    app.commandLine.appendSwitch('js-flags', '--expose-gc');
    console.log('✅ [MEMORY] Hardware acceleration disabled (GPU process eliminated)');
  } else {
    console.warn('⚠️ [MEMORY] Electron app unavailable; skipping hardware acceleration disable');
  }

  // === FIX EVENT EMITTER MEMORY LEAK ===
  // Increase max listeners for PowerMonitor to prevent warnings
  // Multiple modules (CrossPlatformInputDetector, UnifiedInputManager, etc.) add listeners
  if (powerMonitor && powerMonitor.setMaxListeners) {
    powerMonitor.setMaxListeners(20);
    console.log('✅ [FIX] PowerMonitor max listeners set to 20 (prevents memory leak warnings)');
  }

  // === MEMORY PROFILER INTEGRATION ===
  // Add command line switches for memory profiling
  if (process.env.MEM_PROFILER === '1') {
    try {
      console.log('[MEMORY-PROFILER] Memory profiling enabled via environment variable');
    } catch (logError) {
      // Silently handle EPIPE and other console errors
      if (logError.code !== 'EPIPE') {
        try {
          process.stderr.write(`[MEMORY-PROFILER] Log error: ${logError.message}\n`);
        } catch { }
      }
    }

    // Enable precise memory info
    app.commandLine.appendSwitch('enable-precise-memory-info');

    // Enable GC if requested
    if (process.env.EXPOSE_GC === '1') {
      app.commandLine.appendSwitch('js-flags', '--expose-gc');
      try {
        console.log('[MEMORY-PROFILER] GC exposed via --js-flags');
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            process.stderr.write(`[MEMORY-PROFILER] GC log error: ${logError.message}\n`);
          } catch { }
        }
      }
    }
  }

  // === NOTIFICATION TIMING FIX ===
  const PermissionManagerFix = require('./modules/system/permission-manager-fix');
  const permissionManagerFix = new PermissionManagerFix({
    app,
    systemPreferences,
    Notification,
    BrowserWindow,
    console
  });

  // Initialize permission manager
  permissionManagerFix.initialize();
  permissionManagerFix.fixNotificationTiming();

  // Make permissionManagerFix globally available
  global.permissionManagerFix = permissionManagerFix;

  /**
   * Get the correct icon path for both development and production
   * Handles ASAR packaging issues
   */
  global.getIconPath = function (iconName = 'icon.png') {
    const fs = require('fs');
    const path = require('path');
    const isPackaged = app.isPackaged;

    // Try multiple possible locations
    const possiblePaths = [
      // Development paths
      path.join(__dirname, '../assets', iconName),
      path.join(__dirname, 'assets', iconName),
      // Production/packaged paths - try ASAR unpacked first (most reliable)
      path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', iconName),
      path.join(process.resourcesPath, 'app.asar', 'assets', iconName),
      path.join(process.resourcesPath, 'assets', iconName),
      path.join(app.getAppPath(), 'assets', iconName),
      // Fallback to current directory
      path.join(__dirname, iconName)
    ];

    // Find the first path that exists
    for (const iconPath of possiblePaths) {
      try {
        if (fs.existsSync(iconPath)) {
          console.log(`✅ [ICON] Found ${iconName} at: ${iconPath}`);
          return iconPath;
        }
      } catch (err) {
        // Continue to next path
      }
    }

    // If nothing found, log warning and return first path as fallback
    console.warn(`⚠️ [ICON] Icon ${iconName} not found in any expected location, using fallback path`);
    console.warn(`⚠️ [ICON] Tried paths:`, possiblePaths);
    return possiblePaths[0];
  };

  // Initialize consolidation modules
  cleanupRegistry = require('./modules/core/cleanup-registry');
  try {
    consolidationFixes = require('./fixes/apply-consolidation-fixes');
    ({ wrappers } = consolidationFixes);
    console.log('✅ [MAIN] Consolidation fixes enabled and loaded successfully');
  } catch (error) {
    console.warn('⚠️ [MAIN] Failed to load consolidation fixes:', error.message);
    consolidationFixes = null;
    wrappers = {};
  }

  // 🔧 FIX: Initialize EnhancedAppDetector (missing from original implementation)
  // REMOVED: require('../IMMEDIATE_APP_DETECTION_FIX'); - File not needed, app detection handled in modules

  // Make wrappers globally available for screenshot system
  global.wrappers = wrappers;

  // 🔧 REMOVED: Legacy fix modules that no longer exist
  // Activity sync, focus calculation, data upload, comprehensive fix, URL fix, and Windows schedule
  // These were referencing ./fixes/* folder that doesn't exist
  // All functionality is now handled by the consolidated managers in ./modules/
  console.log('ℹ️ [MAIN] Using consolidated managers (legacy fix modules disabled)');

  // 🔧 FIX: Apply platform-specific activity fixes
  console.log(`🖥️ [PLATFORM] Detected platform: ${process.platform}`);

  if (process.platform === 'win32') {
    // Windows-only: legacy windows activity sync fix removed per rebuild
    console.log('🪟 [WINDOWS] Using rebuilt Windows detection and standard activity handling');
  } else if (process.platform === 'darwin') {
    console.log('🍎 [MACOS] Using default activity tracking (no changes needed - working correctly)');
  } else if (process.platform === 'linux') {
    console.log('🐧 [LINUX] Using default activity tracking (preserved as-is)');
  } else {
    console.log(`📦 [PLATFORM] Unknown platform ${process.platform}, using default behavior`);
  }

  // Initialize credential handler for secure login
  try {
    const MainCredentialHandler = require('./modules/auth/main-credential-handler');
    const credentialHandler = new MainCredentialHandler();
    try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'SYSTEM', step: 'CREDENTIALS INIT', message: 'Credential handler initialized' }); } catch { }
  } catch (error) {
    try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'SYSTEM', step: 'CREDENTIALS INIT ERROR', message: error?.message || String(error) }); } catch { }
  }

  // Make session functions globally available
  global.loadDesktopAgentSession = null; // Will be set later
  global.saveDesktopAgentSession = null; // Will be set later

  // SessionManager will be initialized after config is loaded

  // ============================================================================
  // CRITICAL FUNCTION DEFINITIONS - Must be at top for proper hoisting
  // ============================================================================

  // Create tracking controller instance (global scope)
  let trackingController = null;

  function initializeTrackingController() {
    if (!trackingController) {
      const TrackingController = require('./modules/core/tracking-controller');

      // Get the actual loaded config (not just a fallback empty object)
      const envConfig = require('../env-config.js');
      const actualConfig = global.config || config || envConfig;

      try {
        const { logger } = require('./modules/utils/logger'); logger && logger.info({
          category: 'SYSTEM', step: 'TRACKING INIT CONFIG', ctx: {
            hasViteUrl: !!actualConfig.VITE_SUPABASE_URL,
            hasSupabaseUrl: !!actualConfig.SUPABASE_URL,
            hasAnonKey: !!actualConfig.VITE_SUPABASE_ANON_KEY,
            usesEdgeFunction: true,
            hasUserId: !!actualConfig.USER_ID
          }
        });
      } catch { }

      trackingController = new TrackingController(actualConfig);

      // Make tracking controller globally accessible for fallback mode
      global.trackingController = trackingController;

      // Initialize dependencies (ensure Supabase client is available)
      // Create a minimal syncManager if it doesn't exist
      if (!syncManager) {
        const SyncManager = require('./modules/sync/sync-manager');

        // Map config properties to what SyncManager expects - ensure envConfig is used
        const configToUse = actualConfig.VITE_SUPABASE_URL ? actualConfig : envConfig;
        const syncConfig = {
          supabase_url: configToUse.VITE_SUPABASE_URL || configToUse.SUPABASE_URL,
          supabase_key: configToUse.VITE_SUPABASE_ANON_KEY || configToUse.SUPABASE_ANON_KEY,
          // SECURITY: No service_role key — writes go through desktop-sync edge function
          user_id: configToUse.USER_ID
        };

        try {
          const { logger } = require('./modules/utils/logger'); logger && logger.info({
            category: 'SYNC', step: 'INIT CONFIG', ctx: {
              supabase_url: syncConfig.supabase_url,
              has_anon_key: !!syncConfig.supabase_key,
              has_service_key: !!syncConfig.supabase_service_key,
              user_id: syncConfig.user_id
            }
          });
        } catch { }

        syncManager = new SyncManager(syncConfig);
        // Don't override supabase - let SyncManager create its own client
      }

      trackingController.initialize({
        intervalManager: intervalManager || null,
        antiCheatDetector: null,
        syncManager: syncManager,
        systemMonitor: null,
        mainWindow: mainWindow,
        onTrackingStateChange: (state) => {
          // Update global tracking state
          if (typeof isTracking !== 'undefined') isTracking = state.isTracking;
          if (typeof isPaused !== 'undefined') isPaused = state.isPaused;
          if (typeof currentTimeLogId !== 'undefined') currentTimeLogId = state.currentTimeLogId;
          if (typeof currentSession !== 'undefined') currentSession = state.currentSession;

          // CRITICAL FIX: Also expose to global scope for external access/testing
          global.isTracking = state.isTracking;
          global.isPaused = state.isPaused;
          global.currentTimeLogId = state.currentTimeLogId;
          global.currentSession = state.currentSession;

          console.log('🔄 [TRACKING-STATE] State updated:', state);
        },
        onMonitoringStatusUpdate: (status) => {
          console.log('📊 [MONITORING-STATUS] Status updated:', status);
        }
      });

      try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'SYSTEM', step: 'TRACKING CONTROLLER READY' }); } catch { }
    }
    return trackingController;
  }

  // Global tracking functions delegated to tracking-manager.js
  global.startTracking = async function startTracking(projectId = null) {
    console.log('🔥 [WRAPPER] global.startTracking called with projectId:', projectId);

    if (global.trackingManager?.startTracking) {
      console.log('✅ [WRAPPER] Using TrackingManager.startTracking');
      return global.trackingManager.startTracking(projectId);
    } else {
      console.log('⚠️ [WRAPPER] TrackingManager not available, using fallback implementation');

      // ASYNC HEALTH CHECK: Run in background without blocking timer start
      if (global.systemMonitor) {
        console.log('🔒 [FALLBACK] Starting timer immediately, health check will run in background...');

        // Run health check asynchronously without blocking
        setImmediate(async () => {
          try {
            const healthCheck = await global.systemMonitor.performComprehensiveHealthCheck();

            if (!healthCheck.canStartTimer) {
              console.error('⚠️ [FALLBACK] Health check detected issues (timer already started):', {
                overall: healthCheck.overall,
                issues: healthCheck.issues,
                canStartTimer: healthCheck.canStartTimer
              });

              // Emit warning event if main window exists
              if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                global.mainWindow.webContents.send('health-check-warning', {
                  issues: healthCheck.issues,
                  requiresPermission: healthCheck.checks?.permissions?.requiresUserAction || false
                });
              }
            } else {
              console.log('✅ [FALLBACK] Background health check passed');
            }
          } catch (error) {
            console.error('❌ [FALLBACK] Background health check failed:', error);
          }
        });
      }

      // Fallback implementation for when TrackingManager is not initialized
      try {
        const supabase = global.supabaseService || global.supabase;
        if (!supabase) {
          throw new Error('Supabase client not available');
        }

        const userId = global.currentUserId || '0c3d3092-913e-436f-a352-3378e558c34f';
        const startTime = new Date().toISOString();

        // Create time log entry in database
        const { data: timeLog, error } = await supabase
          .from('time_logs')
          .insert({
            user_id: userId,
            project_id: projectId,
            start_time: startTime,
            is_idle: false
          })
          .select()
          .single();

        if (error) {
          console.error('❌ [WRAPPER] Database error:', error);
          throw error;
        }

        // Update tracking state (both local and global) so all guards pass
        isTracking = true;
        global.isTracking = true;
        global.currentProjectId = projectId;
        global.sessionStartTime = startTime;
        global.currentTimeLogId = timeLog.id;

        // Create a minimal currentSession object for subsystems that require it
        currentSession = {
          id: timeLog.id,
          time_log_id: timeLog.id,
          user_id: userId,
          project_id: projectId,
          start_time: startTime,
          status: 'active',
          isActive: true
        };
        global.currentSession = currentSession;

        // Update system monitor with tracking state
        if (global.systemMonitor?.updateTrackingState) {
          global.systemMonitor.updateTrackingState({
            isTracking: true,
            isPaused: false,
            currentTimeLogId: timeLog.id,
            currentProjectId: projectId,
            sessionStartTime: startTime
          });
        }

        console.log('✅ [WRAPPER] Fallback tracking started successfully:', timeLog.id);

        return {
          success: true,
          timeLogId: timeLog.id,
          projectId: projectId,
          startTime: startTime,
          isTracking: true
        };

      } catch (error) {
        console.error('❌ [WRAPPER] Fallback tracking failed:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }
  };

  /**
   * CENTRALIZED STOP FUNCTION
   * All stop scenarios now route through GracefulShutdownManager
   * This ensures database is ALWAYS updated and all cleanup happens properly
   */
  global._isStoppingTracking = false; // Reentrancy guard
  global.stopTracking = async function stopTracking(reason = 'manual', details = null, options = {}) {
    console.log(`🛑 [GLOBAL] stopTracking called with reason: ${reason}`, options?.endTimeOverride ? `endTimeOverride: ${options.endTimeOverride}` : '');
    
    // FIX-8: Store endTimeOverride globally so gracefulShutdownManager and
    // trackingManager can use it for the database update.
    if (options?.endTimeOverride) {
      global._stopEndTimeOverride = options.endTimeOverride;
    }
    
    // Reentrancy guard: prevent concurrent/duplicate stop calls
    if (global._isStoppingTracking) {
      console.log(`⚠️ [STOP-TRACKING] Already in progress, ignoring duplicate call (reason: ${reason})`);
      return { success: false, message: 'Stop already in progress' };
    }
    
    // Check if already stopped
    if (!global.isTracking && !global.currentTimeLogId) {
      console.log('⚠️ [STOP-TRACKING] Already stopped, skipping duplicate call');
      return { success: false, message: 'Already stopped' };
    }
    
    global._isStoppingTracking = true;

    // Use GracefulShutdownManager for centralized, reliable stop
    try {
      const gracefulShutdownManager = require('./modules/core/graceful-shutdown-manager');
      const result = await gracefulShutdownManager.gracefulStop(reason, { details });
      
      // GSM is the single stop path — no redundant trackingManager.stopTracking call.
      // GSM already handles: local state, screenshots, DB, intervals, managers, renderer.
      
      // Update tray state and notification (GSM._updateTray handles the menu,
      // but we also need to show auto-stop notifications here).
      if (global.trayManager) {
        global.trayManager.updateState(false, false, {
          projectName: null,
          projectId: null,
          startTime: null
        });
        if (reason && reason !== 'manual') {
          global.trayManager.showAutoStopNotification(reason, details);
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ [STOP-TRACKING] GracefulShutdownManager failed, falling back:', error);
      
      // Fallback: Direct tracking manager call if graceful shutdown fails
      if (global.trackingManager?.stopTracking) {
        return await global.trackingManager.stopTracking(reason, details);
      }
      
      return { success: false, message: error.message };
    } finally {
      global._isStoppingTracking = false;
      // FIX-8: Clean up endTimeOverride after stop completes
      global._stopEndTimeOverride = null;
    }
  };

  console.log('✅ Critical functions defined at startup: startTracking, stopTracking');

  // ================================
  // MAIN APPLICATION STARTUP FUNCTION (HOISTED)
  // ================================

  // startMainApplication function moved inside app.whenReady() for proper scoping

  // ================================
  // MEMORY AUDIT INTEGRATION
  // ================================

  // Memory audit functions moved to modules/utils/system-initialization-manager.js

  // Crash handlers moved to modules/utils/system-initialization-manager.js
} else {
  // Node.js mock objects moved to modules/utils/system-initialization-manager.js
}

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Import force updater for automatic updates
const ForceUpdater = require('./modules/system/force-updater');

// Import centralized intervals configuration
const {
  getInterval,
  setPerformanceMode,
  getCurrentMode,
  getAllIntervals,
  autoDetectPerformanceMode,
  getEnvironmentOverrides
} = require('../config/intervals');

// Safe console logging to prevent EPIPE errors
function safeLog(...args) {
  try {
    console.log(...args);
  } catch (err) {
    // Ignore EPIPE errors from console.log
    if (err.code !== 'EPIPE') {
      // Re-throw non-EPIPE errors
      throw err;
    }
  }
}
const screenshot = require('screenshot-desktop');
// const activeWin = require('active-win'); // Removed to avoid dependency issues
const cron = require('node-cron');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
// Note: SyncManager will be imported dynamically when needed
const AntiCheatDetector = require('./modules/activity/anti-cheat-detector');
const IntervalManager = require('./interval-manager');
const OptimizedIntervalManager = require('./optimized-interval-manager');
const WarningManager = require('./modules/ui/warning-manager');
const systemMonitor = require('./modules/system/system-monitor');

// CRITICAL: Expose systemMonitor globally for TrackingManager permission checks
global.systemMonitor = systemMonitor;

// Import enhanced input detector
// Enhanced input detector replaced with GlobalInputDetector

// Global system state variables
let systemSuspended = false;
let suspendTime = null;
let screenshotsPaused = false;
let lastScreenshotBeforeSuspend = null;

// Import our unified input detection system
// Initialize system monitor module
global.systemMonitorModule = null;

// Create a simple fallback system monitor
const fallbackSystemMonitor = {
  initSystemMonitor: () => {
    console.log('🎯 Using fallback system monitor (power events handled by EventHandlerManager)');

    // NOTE: All power event handlers (suspend, resume, lock-screen, unlock-screen,
    // display-sleep, display-wake, shutdown) are now ONLY registered in
    // EventHandlerManager to avoid duplicate stopTracking calls.

    // Screenshot failure monitoring (unique to fallback - not in EventHandlerManager)
    const screenshotFailureInterval = setInterval(() => {
      if (global.isTracking) {
        const consecutiveFailures = global.consecutiveScreenshotFailures || 0;
        const lastSuccessfulTime = global.lastSuccessfulScreenshotTime || 0;
        const now = Date.now();

        // Stop after 3 consecutive failures
        if (consecutiveFailures >= 3) {
          console.log(`🛑 [MAIN] 3 consecutive screenshot failures - stopping tracking automatically`);
          global.stopTracking('screenshot_failures', '3 consecutive screenshot failures - tracking stopped automatically');
          return;
        }

        // Stop after 15 minutes without successful screenshot
        if (lastSuccessfulTime > 0 && (now - lastSuccessfulTime) > (15 * 60 * 1000)) {
          const minutesWithoutScreenshot = Math.floor((now - lastSuccessfulTime) / (60 * 1000));
          console.log(`🛑 [MAIN] ${minutesWithoutScreenshot} minutes without successful screenshot - stopping tracking automatically`);
          global.stopTracking('mandatory_screenshot_timeout', `${minutesWithoutScreenshot} minutes without successful screenshot - tracking stopped automatically`);
          return;
        }

        // Stop if tracking has been running 15+ minutes with ZERO screenshots ever taken.
        // This catches the case where screenshot capture never started (e.g. permission
        // denied silently, scheduler never kicked in, etc.)
        if (lastSuccessfulTime === 0) {
          const trackingStartedAt = global.enhancedScreenshotManager?._trackingStartedAt
            || global.trackingStartTime || 0;
          if (trackingStartedAt > 0 && (now - trackingStartedAt) > (15 * 60 * 1000)) {
            const minutesSinceStart = Math.floor((now - trackingStartedAt) / (60 * 1000));
            console.log(`🛑 [MAIN] ${minutesSinceStart} minutes since tracking started with ZERO screenshots - stopping`);
            global.stopTracking('mandatory_screenshot_timeout', `${minutesSinceStart} minutes with no screenshots captured - tracking stopped automatically`);
            return;
          }
        }
      }
    }, 30000); // Check every 30 seconds

    // Register with cleanup registry so it gets cleared on shutdown
    const cleanupRegistryLocal = require('./modules/core/cleanup-registry');
    cleanupRegistryLocal.registerInterval(screenshotFailureInterval, 'Screenshot Failure Monitor');

    // Monitor thermal state for performance issues
    powerMonitor.on('thermal-state-change', (state) => {
      console.log('🌡️ Thermal state changed:', state);
      if (state === 'critical') {
        console.log('⚠️ Critical thermal state - may affect screenshot capture');
        // Reduce screenshot frequency during thermal stress
        if (screenshotInterval) {
          clearTimeout(screenshotInterval);
          // Increase interval to 10 minutes during thermal stress
          setTimeout(() => {
            if (global.isTracking && global.currentSession) {
              scheduleRandomScreenshot();
            }
          }, 600000); // 10 minutes
        }
      }
    });
  }
};

// Try to load the advanced system monitor, fallback to simple version
try {
  global.systemMonitorModule = fallbackSystemMonitor;
  console.log('✅ Fallback system monitor initialized');
} catch (error) {
  console.log('⚠️ System monitor initialization failed:', error.message);
  global.systemMonitorModule = null;
}

// Load configuration using our new environment variable loader
const { loadConfig } = require('../load-config');
let config;
let supabase;
let supabaseService;
let configDataManager;
try {
  config = loadConfig();

  // Initialize Supabase client with proper error handling
  if (!config.supabase_url || !config.supabase_key) {
    throw new Error('Missing required Supabase configuration');
  }

  // Validate URL format
  try {
    new URL(config.supabase_url);
  } catch (urlError) {
    throw new Error(`Invalid Supabase URL format: ${config.supabase_url}`);
  }

  // Proxy fallback: if direct Supabase is unreachable, rewrite URLs through proxy
  const SUPABASE_PROXY_URL = 'https://timeflow-sb-proxy.vercel.app';
  let useProxy = false;
  let proxyCheckDone = false;
  global.SUPABASE_PROXY_URL = SUPABASE_PROXY_URL;
  global.supabaseDirectUrl = config.supabase_url;
  Object.defineProperty(global, 'useSupabaseProxy', { get: () => useProxy });

  // Initialize Supabase client with extended timeout settings for better connectivity
  const supabaseOptions = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    },
    global: {
      // Ensure API key header is always present (fixes DMG: No API key found)
      // NOTE: Do NOT set Authorization here — the Supabase client manages it
      // and overriding it with the anon key breaks auth.uid() in RLS policies.
      headers: {
        apikey: config.supabase_key
      },
      fetch: async (url, options = {}) => {
        // Lazy connectivity check on first request
        if (!proxyCheckDone) {
          proxyCheckDone = true;
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5000);
            await fetch(`${config.supabase_url}/rest/v1/`, {
              method: 'HEAD', signal: ctrl.signal,
              headers: { apikey: config.supabase_key }
            });
            clearTimeout(t);
            console.log('✅ [MAIN] Direct Supabase URL reachable');
          } catch (_) {
            console.warn('⚠️ [MAIN] Direct Supabase URL unreachable, enabling proxy fallback');
            useProxy = true;
          }
        }
        if (useProxy) {
          url = url.replace(config.supabase_url, SUPABASE_PROXY_URL);
        }
        // Set longer timeouts for better connectivity on slower networks
        // CRITICAL: Convert Headers object to plain object to preserve all
        // Supabase-set headers (Content-Type, Accept, Prefer, Authorization).
        // Spreading a Headers instance yields {} — only plain objects work.
        let existingHeaders = {};
        if (options.headers) {
          if (typeof options.headers.forEach === 'function') {
            // It's a Headers object — iterate to extract all entries
            options.headers.forEach((value, key) => { existingHeaders[key] = value; });
          } else {
            existingHeaders = { ...options.headers };
          }
        }

        const customOptions = {
          ...options,
          timeout: 60000, // 1 minute timeout instead of default 10s (increased for high latency)
          headers: {
            // Start with Supabase client headers (includes Content-Type, Authorization with user JWT, etc.)
            ...existingHeaders,
            // Only set apikey — do NOT override Authorization (the Supabase client sets it to the user's JWT)
            'apikey': existingHeaders['apikey'] || config.supabase_key,
            'User-Agent': 'Alyson-Work-Time-Agent/1.0'
          }
        };

        // Add retry logic for failed requests
        return fetch(url, customOptions).catch(async (error) => {
          if (error.name === 'TimeoutError' ||
            error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
            error.code === 'ENOTFOUND' ||
            error.message.includes('fetch failed')) {
            console.log(`🔄 Retrying request to ${url} after error: ${error.message}`);

            // Special handling for DNS resolution errors
            if (error.code === 'ENOTFOUND') {
              console.log(`🌐 DNS resolution failed for ${url}, attempting to resolve manually...`);
              try {
                // Try to resolve the hostname manually
                const urlObj = new URL(url);
                const { execSync } = require('child_process');
                const result = execSync(`nslookup ${urlObj.hostname} 8.8.8.8`, { encoding: 'utf8' });
                const match = result.match(/Address:\s*(\d+\.\d+\.\d+\.\d+)/);
                if (match) {
                  console.log(`✅ Manual DNS resolution successful: ${urlObj.hostname} -> ${match[1]}`);
                  // Replace hostname with IP address
                  const ipUrl = url.replace(urlObj.hostname, match[1]);
                  return fetch(ipUrl, customOptions);
                }
              } catch (dnsError) {
                console.log(`⚠️ Manual DNS resolution failed: ${dnsError.message}`);
              }
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
            // On retry failure, activate proxy for all future requests
            return fetch(url, customOptions).catch((retryErr) => {
              if (!useProxy && (retryErr.code === 'UND_ERR_CONNECT_TIMEOUT' || retryErr.message.includes('fetch failed'))) {
                console.warn('⚠️ [MAIN] Retry also failed, activating proxy fallback for all future requests');
                useProxy = true;
                const proxyUrl = url.replace(config.supabase_url, SUPABASE_PROXY_URL);
                return fetch(proxyUrl, customOptions);
              }
              throw retryErr;
            });
          }
          throw error;
        });
      }
    }
  };

  // Initialize Supabase client - use anonymous key for user operations
  // URL rewriting to proxy (if needed) happens inside the custom fetch wrapper
  supabase = createClient(config.supabase_url, config.supabase_key, supabaseOptions);

  // Create service client for admin operations if service key is available
  supabaseService = config.supabase_service_key ?
    createClient(config.supabase_url, config.supabase_service_key, {
      auth: {
        autoRefreshToken: false, // Service role doesn't need token refresh
        persistSession: false,  // Service role doesn't need session persistence
        detectSessionInUrl: false
      },
      // Explicitly set headers for packaged builds
      global: {
        headers: {
          apikey: config.supabase_service_key,
          Authorization: `Bearer ${config.supabase_service_key}`
        }
      }
    }) :
    supabase;

  // Make Supabase clients globally accessible for IPC handlers
  global.supabase = supabase;
  global.supabaseClient = supabase;
  global.supabaseService = supabaseService;

  // Register in ServiceContainer (migration path: managers will gradually use container instead of globals)
  const { container } = require('./core/service-container');
  const { eventBus } = require('./core/event-bus');
  container.start();
  eventBus.start();
  container.register('supabase', supabase);
  container.register('supabaseService', supabaseService);
  container.register('eventBus', eventBus);

  console.log('✅ Supabase client initialized successfully');
  console.log('✅ ServiceContainer and EventBus initialized');
  console.log(`🔧 [DEBUG] Service client type: ${config.supabase_service_key ? 'service role' : 'anonymous fallback'}`);
  console.log(`🔧 [DEBUG] Service client URL: ${config.supabase_url}`);
  console.log(`🔧 [DEBUG] Service key present: ${!!config.supabase_service_key}`);
  console.log(`🔧 [DEBUG] Service key length: ${config.supabase_service_key ? config.supabase_service_key.length : 'N/A'}`);

  // STARTUP RECOVERY: Process any pending session closes from previous crashes
  // This ensures sessions that failed to close properly are cleaned up on restart
  try {
    const gracefulShutdownManager = require('./modules/core/graceful-shutdown-manager');
    // Make globally accessible
    global.gracefulShutdownManager = gracefulShutdownManager;
    
    // SECURITY FIX: Do NOT process pending closes on a fixed timer.
    // With RLS enabled, we need an authenticated session first.
    // The recovery is triggered after auth is established (see auth:set-session handler
    // and the session-restore block below) or when the user starts tracking.
    global._pendingSessionRecoveryDone = false;
    global._runPendingSessionRecovery = async () => {
      if (global._pendingSessionRecoveryDone) return;
      global._pendingSessionRecoveryDone = true;
      try {
        await gracefulShutdownManager.processPendingSessionCloses();
        console.log('✅ [STARTUP] Pending session recovery complete');
      } catch (error) {
        console.error('❌ [STARTUP] Pending session recovery failed:', error.message);
        global._pendingSessionRecoveryDone = false; // allow retry
      }
    };
  } catch (error) {
    console.error('❌ [STARTUP] Failed to initialize GracefulShutdownManager:', error.message);
  }

  // Initialize SessionManager now that config is available
  const SessionManager = require('./modules/core/session-manager');
  let sessionManager = new SessionManager(config);

  // Initialize SessionManager with Supabase service
  sessionManager.initialize({ supabaseService });

  // Make session manager globally accessible
  global.sessionManager = sessionManager;

  // Make session functions globally available
  global.loadDesktopAgentSession = async () => sessionManager.loadDesktopAgentSession();
  global.saveDesktopAgentSession = async (data) => sessionManager.saveDesktopAgentSession(data);

  // Define recoverScreenshotPermissions globally (used by EventHandlerManager on resume)
  // This checks permission status WITHOUT triggering a capture (which would cause macOS to re-prompt)
  global.recoverScreenshotPermissions = async function recoverScreenshotPermissions() {
    try {
      if (process.platform !== 'darwin') return true;
      if (!systemPreferences || typeof systemPreferences.getMediaAccessStatus !== 'function') {
        console.log('⚠️ [PERMISSION-RECOVER] systemPreferences API unavailable');
        return true; // assume granted if API unavailable
      }
      const status = systemPreferences.getMediaAccessStatus('screen');
      console.log(`🔍 [PERMISSION-RECOVER] Screen recording status after wake: ${status}`);
      return status === 'granted';
    } catch (error) {
      console.warn('⚠️ [PERMISSION-RECOVER] Error checking screen permission:', error.message);
      return true; // do not hard-block if check failed
    }
  };

  // Load existing session and set it in the main Supabase client
  (async () => {
    try {
      const existingSession = await sessionManager.loadDesktopAgentSession();
      if (existingSession && existingSession.access_token) {
        console.log('🔐 [SESSION] Setting existing user session in main Supabase client...');
        const { data, error } = await supabase.auth.setSession({
          access_token: existingSession.access_token,
          refresh_token: existingSession.refresh_token
        });
        if (error) {
          console.warn('⚠️ [SESSION] Failed to set session:', error.message);
        }
        console.log('✅ [SESSION] User session set in main Supabase client');

        // CRITICAL FIX: Initialize input detection after session is loaded
        console.log('🎮 [SESSION] Initializing input detection system after session load...');
        try {
          await initializeInputDetectionSystem();
          console.log('✅ [SESSION] Input detection system initialized');
        } catch (error) {
          console.error('❌ [SESSION] Failed to initialize input detection:', error);
        }

        // SECURITY FIX: Now that session is restored, process any pending session closes
        // This ensures we have a valid JWT for RLS-protected updates
        if (global._runPendingSessionRecovery) {
          await global._runPendingSessionRecovery();
        }
      }
    } catch (error) {
      console.log('⚠️ [SESSION] No existing session or failed to load:', error.message);
    }
  })();

  console.log('✅ SessionManager initialized successfully');

  // Initialize ConfigurationDataManager early for data structures
  const ConfigurationDataManager = require('./modules/utils/configuration-data-manager');
  configDataManager = new ConfigurationDataManager();
  console.log('✅ ConfigurationDataManager initialized successfully');

} catch (error) {
  console.error('❌ Failed to load configuration:', error);

  if (isElectronContext) {
    // Show error dialog and exit in Electron context
    const { dialog } = require('electron');
    if (app) {
      dialog.showErrorBox(
        'Configuration Error',
        `Failed to load configuration:\n\n${error.message}\n\nPlease check your configuration and try again.`
      );
      app.quit();
    }
  } else {
    // In Node.js context, just log and continue with fallback
    console.log('⚠️ Configuration error in Node.js mode - will try to continue with fallbacks');
  }

  if (isElectronContext) {
    process.exit(1);
  }
}

// ENHANCED APP CREATION WITH GPU CRASH HANDLING

// Window creation moved to window-ui-manager.js
function createMainWindowEnhanced() {
  return global.windowUIManager?.createMainWindow();
}

// Activity monitoring setup moved to enhanced-activity-manager.js
function setupActivityMonitoring() {
  return global.enhancedActivityManager?.setupActivityMonitoring();
}

// Database functions moved to database-manager.js
async function getTodayAppCount() {
  return global.databaseManager?.getTodayAppCount() || 0;
}

function startDatabaseStatusReporting() {
  return global.databaseManager?.startDatabaseStatusReporting();
}

// Initialize CUSTOM performance mode based on user requirements
console.log('🎛️ Initializing CUSTOM performance optimization...');

// CRITICAL: Load immediate startup fixes FIRST to prevent performance issues
let startupFixApplied = false;
try {
  console.log('🛠️ Loading immediate startup slowness fixes...');
  const externalStartupFix = require('../fix-immediate-startup-slowness');
  if (typeof externalStartupFix?.apply === 'function') {
    externalStartupFix.apply();
  }
  startupFixApplied = true;
  console.log('✅ Immediate startup fixes applied - functions will respect intervals');
} catch (error) {
  console.warn('⚠️ Immediate startup fixes not available:', error.message);
  try {
    const internalStartupFix = require('./modules/utils/startup-fixes');
    if (typeof internalStartupFix?.apply === 'function') {
      internalStartupFix.apply();
      startupFixApplied = true;
      console.log('✅ Immediate startup fixes (internal) applied');
    } else {
      console.warn('⚠️ Internal startup fixes module missing apply() function');
    }
  } catch (innerError) {
    console.warn('⚠️ Internal startup fixes not available:', innerError.message);
  }
}

// Load and apply custom performance optimization
let performanceFixApplied = false;
try {
  console.log('🚀 Loading custom performance fix with user-specified intervals...');
  const externalPerformanceFix = require('../custom-performance-fix');
  if (typeof externalPerformanceFix?.apply === 'function') {
    externalPerformanceFix.apply();
  }
  performanceFixApplied = true;
  console.log('✅ Custom performance optimization applied successfully!');
  console.log('📊 Settings: Idle 2min, URL unchanged, Sync 3min, others optimized');
} catch (error) {
  console.warn('⚠️ Custom performance fix not available:', error.message);
  try {
    const internalPerformanceFix = require('./modules/utils/performance-fix');
    if (typeof internalPerformanceFix?.apply === 'function') {
      internalPerformanceFix.apply();
      performanceFixApplied = true;
      console.log('✅ Custom performance optimization (internal) applied successfully');
    } else {
      console.warn('⚠️ Internal performance fix module missing apply() function');
    }
  } catch (innerError) {
    console.warn('⚠️ Internal performance fix not available:', innerError.message);
  }
  if (startupFixApplied) {
    console.log('✅ Using immediate startup fixes instead of auto-detect');
  }
}

// Force verification of our custom performance mode
const intervals = require('../config/intervals');
console.log(`📊 Performance mode: ${intervals.getCurrentMode()}`);
console.log('📋 Current intervals:', intervals.getAllIntervals());

// VERIFICATION: Double-check our key intervals
console.log('🔍 [VERIFICATION] Key interval check:');
console.log(`   📊 Idle: ${intervals.getInterval('IDLE_CHECK')}ms (${intervals.getInterval('IDLE_CHECK') / 60000}min)`);
console.log(`   🌐 URL: ${intervals.getInterval('URL_CAPTURE_THROTTLE')}ms (${intervals.getInterval('URL_CAPTURE_THROTTLE') / 1000}s)`);
console.log(`   🔄 Sync: ${intervals.getInterval('SYNC_RETRY')}ms (${intervals.getInterval('SYNC_RETRY') / 60000}min)`);

console.log(`🔧 [DEBUG] Service key available: ${!!config.supabase_service_key}`);
if (config.supabase_service_key) {
  console.log(`🔧 [DEBUG] Using service role key for admin operations`);
  console.log(`🔧 [DEBUG] Service key length: ${config.supabase_service_key.length}`);
} else {
  console.log(`🔧 [DEBUG] Using anonymous key - some operations may be limited`);
  console.log(`🔧 [DEBUG] Desktop agent will queue failed operations for later`);
}
let syncManager;
let antiCheatDetector;
let intervalManager;
let useOptimizedIntervals = true; // Feature flag for optimized intervals
let warningManager;
let globalInputDetector;
let mainWindow;
let debugWindow;
let tray;
let trayManager;

// === TRACKING STATE ===
let isTracking = false;
let isPaused = false;
let currentSession = null;
let currentTimeLogId = null;
let idleStart = null;
let lastActivity = Date.now();
// PERFORMANCE FIX: Removed immediate onInputTrackingSuccess calls that were causing early initialization issues



// TEMPORARY: Force immediate state sync after startup (optional - skip if helper not present)
setTimeout(() => {
  try {
    console.log('🔧 [MAIN] Force syncing URL manager states...');
    // Only attempt if the helper module exists to avoid noisy errors
    const fs = require('fs');
    const path = require('path');
    const helperPath = path.join(__dirname, '..', 'force-immediate-state-sync.js');
    if (fs.existsSync(helperPath)) {
      require(helperPath);
    } else {
      console.log('ℹ️ [MAIN] Skipping force-immediate-state-sync (helper not found)');
    }
  } catch (error) {
    console.log('⚠️ [MAIN] Force state sync failed:', error.message);
  }
}, 10000); // Wait 10 seconds after startup

// 🚨 CRITICAL: Onboarding and permission state
global.onboardingCompleted = false;
global.permissionsVerified = false;
// PERFORMANCE FIX: Removed immediate onInputTrackingSuccess calls that were causing early initialization issues
let lastMousePos = { x: 0, y: 0 };
let lastKeyboardActivity = 0;
let systemSleepStart = null;
let lastIdleLogTime = 0;
let lastDuplicateAppLogTime = 0;
let lastDuplicateUrlLogTime = 0;
let lastActiveApp = null;

// Activity stats persistence
let lastActivityStatsSave = Date.now();
let activityStatsSaveInterval = null;
let lastActiveUrl = null;
let lastBrowserUrls = new Map(); // Cache URLs per browser
let lastUrlCapturesByBrowser = new Map(); // Track capture times per browser+URL
let lastUrlCheckTime = 0;
let lastMouseLogTime = 0;
let lastKeyboardLogTime = 0;
let lastAppCaptureLogTime = 0;
let lastUrlCaptureLogTime = 0;

// CRITICAL FIX: Add memory safety mutex for timer operations
let timerMutex = false;
let screenshotBuffer = null; // Track screenshot buffer for cleanup

// Permission dialog tracking
let permissionDialogShown = false;

// mouseTracker moved to configuration-data-manager.js
let mouseTracker = configDataManager.mouseTracker;

// === INTERVALS ===
let screenshotInterval = null;
let activityInterval = null;
let idleCheckInterval = null;
let appCaptureInterval = null;
let urlCaptureInterval = null;
let settingsInterval = null;
let notificationInterval = null;
let mouseTrackingInterval = null;
let keyboardTrackingInterval = null;

// Variables for optimized interval tracking
let lastIdleCheck = 0;
let screenshotTimeout = null; // For screenshot scheduling

// Load saved system state on startup
function loadSystemState() {
  try {
    const stateFile = path.join(__dirname, '../system-state.json');
    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

      // Restore relevant state
      if (state.activityStats) {
        activityStats = { ...activityStats, ...state.activityStats };
        console.log('💾 Activity stats restored from saved state');
      }

      // Check if we were tracking before shutdown/suspend
      if (state.isTracking && state.currentSession) {
        console.log('🔄 Detected previous tracking session, will prompt for resume');
        showResumeFromShutdownDialog(state);
      }

      // Clean up state file
      fs.unlinkSync(stateFile);
      console.log('✅ System state loaded and cleaned up');
    }
  } catch (error) {
    console.log('⚠️ Could not load system state:', error.message);
  }
}

// Load saved offline queue on startup
function loadOfflineQueue() {
  try {
    const os = require('os');
    // Use user data directory instead of app.asar path
    const userDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
    const appDataDir = path.join(userDataDir, 'Alyson Work Time');
    const queueFile = path.join(appDataDir, 'offline-queue.json');

    if (fs.existsSync(queueFile)) {
      const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
      offlineQueue = { ...offlineQueue, ...queue };
      console.log(`💾 Offline queue restored: ${offlineQueue.screenshots.length} screenshots, ${offlineQueue.appLogs.length} app logs`);
    }
  } catch (error) {
    console.log('⚠️ Could not load offline queue:', error.message);
  }
}

// Show resume dialog after shutdown/restart
function showResumeFromShutdownDialog(state) {
  if (mainWindow) {
    mainWindow.webContents.send('show-shutdown-resume-dialog', {
      message: 'It looks like you were tracking time before the system was shut down. Would you like to resume tracking?',
      previousSession: state.currentSession
    });
  }
}

// LoggingThrottleManager moved to modules/utils/logging-throttle-manager.js
const LoggingThrottleManager = require('./modules/utils/logging-throttle-manager');
const loggingThrottle = new LoggingThrottleManager();

// Feature status functions moved to database-manager.js
function updateFeatureStatus(featureName, status, details = {}) {
  return global.databaseManager?.updateFeatureStatus(featureName, status, details);
}

function onScreenshotSuccess() {
  return global.databaseManager?.onScreenshotSuccess();
}

function onAppDetectionSuccess(appName) {
  return global.databaseManager?.onAppDetectionSuccess(appName);
}

function onUrlDetectionSuccess(url) {
  return global.databaseManager?.onUrlDetectionSuccess(url);
}

function onIdleDetectionSuccess(idleTime) {
  return global.databaseManager?.onIdleDetectionSuccess(idleTime);
}

function onInputTrackingSuccess(inputType) {
  return global.databaseManager?.onInputTrackingSuccess(inputType);
}

function onDatabaseSuccess(operation) {
  return global.databaseManager?.onDatabaseSuccess(operation);
}

// Configuration data structures moved to modules/utils/configuration-data-manager.js
// ConfigurationDataManager initialized earlier after config load

// Extract references for backward compatibility
let appSettings = configDataManager.appSettings;
let activityStats = configDataManager.activityStats;
let periodActivityStats = configDataManager.periodActivityStats;

// Activity stats persistence moved to database-manager.js
async function saveActivityStatsToDatabase() {
  return global.databaseManager?.saveActivityStatsToDatabase();
}

function startActivityStatsPersistence() {
  return global.databaseManager?.startActivityStatsPersistence();
}

function stopActivityStatsPersistence() {
  return global.databaseManager?.stopActivityStatsPersistence();
}

// betweenScreenshotsActivity moved to configuration-data-manager.js
let betweenScreenshotsActivity = configDataManager.betweenScreenshotsActivity;

// CRITICAL: Make betweenScreenshotsActivity globally accessible for screenshot capture
global.betweenScreenshotsActivity = betweenScreenshotsActivity;


// ================================
// TIMER AND ACTIVITY DISPLAY FIXES
// ================================

// DISABLED: Enhanced next screenshot timer management (PERFORMANCE FIX)
// This was another recovery system conflicting with the consolidated screenshot system
/*
function ensureNextScreenshotTimer() {
  if (isTracking && currentSession && !global.nextScreenshotTime) {
    console.log('⚠️ [TIMER-FIX] No next screenshot time set, scheduling immediately...');
    scheduleRandomScreenshot();
  }
  if (global.nextScreenshotTime && global.nextScreenshotTime.getTime() < Date.now()) {
    console.log('⚠️ [TIMER-FIX] Next screenshot time is in the past, rescheduling...');
    scheduleRandomScreenshot();
  }
}
*/

// Enhanced sendNextScreenshotUpdate with better error handling
// Original sendNextScreenshotUpdate replaced by enhanced version above

// Enhanced activity detection moved to enhanced-activity-manager.js
function setupEnhancedActivityDetection() {
  return global.enhancedActivityManager?.setupEnhancedActivityDetection();
}

// Enhanced activity recording moved to enhanced-activity-manager.js
function recordEnhancedActivity(type, method, details = {}) {
  return global.enhancedActivityManager?.recordEnhancedActivity(type, method, details);
}

// CRITICAL FIX: Make recordEnhancedActivity globally accessible
global.recordEnhancedActivity = recordEnhancedActivity;

// Enhanced activity initialization moved to enhanced-activity-manager.js
function initializeEnhancedActivityDetection() {
  return global.enhancedActivityManager?.initializeEnhancedActivityDetection();
}

// ================================
// INTELLIGENT LOGGING OPTIMIZATION
// ================================



// Optimized activity display moved to enhanced-activity-manager.js
function sendActivityToRendererOptimized() {
  return global.enhancedActivityManager?.sendActivityToRendererOptimized();
}

// Optimized activity recording moved to enhanced-activity-manager.js
function recordActivityOptimized(type, method, details = {}) {
  return global.enhancedActivityManager?.recordActivityOptimized(type, method, details);
}

// Optimized URL capture logging
function logURLCaptureOptimized(message, type = 'info') {
  const logKey = `url-${type}`;

  if (type === 'extract' || type === 'process') {
    // Only log URL extraction/processing occasionally
    if (loggingThrottle.shouldLog(logKey, 30000, 1)) {
      console.log(message);
    }
  } else if (type === 'success' || type === 'error') {
    // Always log successes and errors
    console.log(message);
  } else {
    // For other URL logs, throttle them
    if (loggingThrottle.shouldLog(logKey, 10000, 1)) {
      console.log(message);
    }
  }
}

// Optimized feature status logging
function logFeatureStatusOptimized() {
  if (loggingThrottle.shouldLog('feature-status', 60000, 1)) {
    console.log('📊 [FEATURE-STATUS] ✅ Input tracking, URL capture, and activity monitoring active');
  }
}

// Replace repetitive console.log calls with optimized versions
// Note: originalConsoleLog already declared at top of file with EPIPE protection
// Use the global EPIPE-protected console.log wrapper instead of overriding again

// Override specific logging functions if they exist
if (typeof sendActivityToRenderer === 'function') {
  sendActivityToRenderer = sendActivityToRendererOptimized;
}

if (typeof recordActivity === 'function') {
  recordActivity = recordActivityOptimized;
}

// Add global function to control logging verbosity with EPIPE protection
global.setLoggingVerbosity = function (level) {
  try {
    if (level === 'minimal') {
      try {
        if (typeof originalConsoleLog === 'function' && !process.stdout.destroyed) {
          originalConsoleLog('🔇 [LOGGING] Switched to minimal logging mode');
        }
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            if (!process.stderr.destroyed) {
              process.stderr.write(`[LOGGING] Verbosity control log error: ${logError.message}\n`);
            }
          } catch { }
        }
      }
      // Increase throttle times for minimal logging
      Object.keys(loggingThrottle.throttles).forEach(key => {
        loggingThrottle.throttles.set(key, Date.now());
      });
    } else if (level === 'normal') {
      try {
        if (typeof originalConsoleLog === 'function' && !process.stdout.destroyed) {
          originalConsoleLog('🔊 [LOGGING] Switched to normal logging mode');
        }
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            if (!process.stderr.destroyed) {
              process.stderr.write(`[LOGGING] Verbosity control log error: ${logError.message}\n`);
            }
          } catch { }
        }
      }
      // Reset throttles for normal logging
      loggingThrottle.throttles.clear();
      loggingThrottle.counters.clear();
      loggingThrottle.lastLogTimes.clear();
    } else if (level === 'verbose') {
      try {
        if (typeof originalConsoleLog === 'function' && !process.stdout.destroyed) {
          originalConsoleLog('📢 [LOGGING] Switched to verbose logging mode');
        }
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            if (!process.stderr.destroyed) {
              process.stderr.write(`[LOGGING] Verbosity control log error: ${logError.message}\n`);
            }
          } catch { }
        }
      }
      // Disable console.log override for verbose mode
      console.log = originalConsoleLog;
    }
  } catch (error) {
    // Silently handle any errors in logging verbosity control
    try {
      originalConsoleLog.call(console, '⚠️ [LOGGING] Verbosity control error:', error.message);
    } catch { }
  }
};

// Set default to minimal logging with EPIPE protection
try {
  global.setLoggingVerbosity('minimal');
} catch (error) {
  // Silently handle any errors in initial logging setup
}

// Use safe logging for the final setup message with EPIPE protection
try {
  if (typeof originalConsoleLog === 'function' && !process.stdout.destroyed) {
    originalConsoleLog('✅ [LOGGING] Intelligent logging optimization active - reduced spam, kept important info');
  }
} catch (error) {
  // Silently handle EPIPE and other console errors
  if (error.code !== 'EPIPE') {
    try {
      process.stderr.write(`[LOGGING] Initial setup log error: ${error.message}\n`);
    } catch { }
  }
}




// ================================
// COMPREHENSIVE INPUT TRACKING FIX
// ================================

// Input tracking is now handled by consolidationFixes - no legacy code needed

// Global unified input tracker instance
let unifiedInputTracker = null;

// Unified input tracking moved to modules/utils/input-tracking-manager.js
const InputTrackingManager = require('./modules/utils/input-tracking-manager');
const inputTrackingManager = new InputTrackingManager({
  powerMonitor,
  isTracking,
  recordEnhancedActivity,
  unifiedInputTracker
});

// CRITICAL FIX: Import and initialize the proper input detection module
const UnifiedInputManager = require('./modules/activity/input-manager');

// App Detection Hooks
global.appDetectionHooks = {
  onTrackingStart: (projectId) => {
    try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'APP_DETECTION', step: 'WRAPPER START', ctx: { projectId, hasDetector: !!global.enhancedAppDetector } }); } catch { }

    if (global.enhancedAppDetector) {
      try {
        // Set tracking state to true before starting
        try { const { logger } = require('./modules/utils/logger'); logger && logger.debug({ category: 'APP_DETECTION', step: 'WRAPPER SET TRACKING', message: 'true' }); } catch { }
        global.enhancedAppDetector.setTrackingState(true);

        if (global.enhancedAppDetector.startAppCapture) {
          try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'APP_DETECTION', step: 'WRAPPER CALL', message: 'startAppCapture' }); } catch { }
          global.enhancedAppDetector.startAppCapture();
        }
        if (global.enhancedAppDetector.startRealTimeAppDetection) {
          try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'APP_DETECTION', step: 'WRAPPER CALL', message: 'startRealTimeAppDetection' }); } catch { }
          global.enhancedAppDetector.startRealTimeAppDetection();
        }
        try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'APP_DETECTION', step: 'WRAPPER STARTED' }); } catch { }
      } catch (error) {
        try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'APP_DETECTION', step: 'WRAPPER START ERROR', message: error?.message || String(error) }); } catch { }
      }
    } else {
      try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'APP_DETECTION', step: 'WRAPPER MISSING', message: 'enhancedAppDetector not initialized' }); } catch { }
    }
  },
  onTrackingStop: () => {
    try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'APP_DETECTION', step: 'WRAPPER STOP' }); } catch { }
    if (global.enhancedAppDetector) {
      try {
        if (global.enhancedAppDetector.stopAppCapture) {
          global.enhancedAppDetector.stopAppCapture();
        }
        if (global.enhancedAppDetector.stopRealTimeAppDetection) {
          global.enhancedAppDetector.stopRealTimeAppDetection();
        }
        try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'APP_DETECTION', step: 'WRAPPER STOPPED' }); } catch { }
      } catch (error) {
        try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'APP_DETECTION', step: 'WRAPPER STOP ERROR', message: error?.message || String(error) }); } catch { }
      }
    }
  }
};

// Create global input detection instances
let globalInputManager = null;
// PERFORMANCE FIX: Removed duplicate globalCrossPlatformDetector

// Initialize unified input tracking
function initializeUnifiedInputTracking() {
  return inputTrackingManager.initializeUnifiedInputTracking();
}

// PERFORMANCE FIX: Initialize SINGLE optimized input detection system
async function initializeInputDetectionSystem() {
  try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'INPUT', step: 'INIT', message: 'Initializing optimized input detection system' }); } catch { }

  // CRITICAL FIX: If input manager is already active and tracking, do NOT re-initialize.
  // Late startup calls to this function were destroying the running input monitor,
  // causing keyboard tracking to stop working.
  if (globalInputManager && globalInputManager.isActive) {
    console.log('✅ [INPUT-INIT] Input detection already active, skipping re-initialization');
    return;
  }

  // PYTHON PROVISIONER: Ensure Python is available before initializing input detection
  try {
    const PythonProvisioner = require('./modules/system/python-provisioner');
    const provisioner = new PythonProvisioner();
    global.pythonProvisioner = provisioner;
    const provisionResult = await provisioner.ensurePython();
    
    console.log(`🐍 [INPUT-INIT] Python provision result: ${provisionResult.ready ? 'READY' : 'NOT READY'} - ${provisionResult.message}`);
    
    if (provisionResult.errors?.length > 0) {
      console.warn(`⚠️ [INPUT-INIT] Provisioner warnings:`, provisionResult.errors);
    }
    
    // Store the provisioned Python path for the input detector to use
    if (provisionResult.ready && provisionResult.pythonPath) {
      global.provisionedPythonPath = provisionResult.pythonPath;
    }
  } catch (provisionError) {
    console.error(`❌ [INPUT-INIT] Python provisioner failed:`, provisionError.message);
    // Continue anyway - input detector has its own Python search logic as fallback
  }

  // Clean up any existing instances first to prevent duplicates
  if (globalInputManager) {
    try { globalInputManager.stop(); } catch (e) { }
    globalInputManager = null;
  }

  // globalCrossPlatformDetector removed - handled by consolidated input detection

  try {
    // Use ONLY UnifiedInputManager (it includes cross-platform detection internally)
    globalInputManager = new UnifiedInputManager();
    await globalInputManager.initialize({
      powerMonitor,
      screen: require('electron').screen
    });

    // Connect input detection to activity recording (with performance optimizations)
    let lastLogTime = 0;
    let eventCount = 0;

    const connectInputToActivity = (type, method, details = {}) => {
      try {
        // CRITICAL FIX: Only record activity when tracking is active
        if (!global.isTracking) {
          // Don't record any activity when timer is not running
          return;
        }

        // Accept external OS-level input monitors (e.g., Python/Quartz on macOS)
        // These are real user inputs and must NOT be filtered out.

        // Hard idle gate here as well (before any counters update)
        let idleSeconds = 0;
        try {
          const getIdleTime = global.unifiedInputManager?.getIdleTime?.bind(global.unifiedInputManager);
          idleSeconds = typeof getIdleTime === 'function' ? (getIdleTime() || 0) : 0;
        } catch (_) { }
        const idleStatus = global.enhancedIdleMonitor?.getIdleStatus?.();
        const idleThreshold = (global.enhancedIdleMonitor && global.enhancedIdleMonitor.IDLE_THRESHOLD) || 60;
        const isIdle = (idleStatus ? !!idleStatus.isIdle : false) || (idleSeconds > idleThreshold);
        if (isIdle) {
          if (!global.__lastIdleDrop || Date.now() - global.__lastIdleDrop > 15000) {
            console.log(`[SYSTEM] IDLE-GATE – Dropped '${type}' from '${method}' while idle (${idleSeconds}s)`);
            global.__lastIdleDrop = Date.now();
          }
          return;
        }

        // Call the global activity recording function
        if (typeof recordEnhancedActivity === 'function') {
          recordEnhancedActivity(type, method, details);
        }

        // Also call any global activity manager
        if (global.activityManager && global.activityManager.recordActivity) {
          global.activityManager.recordActivity(type, method, details);
        }

        // PERFORMANCE FIX: Drastically reduce logging to prevent slowdowns
        eventCount++;
        const now = Date.now();

        // Silence granular input logs; summaries handled elsewhere
      } catch (error) {
        // Silent error handling to prevent log spam
      }
    };

    // Connect ONLY unified input manager events (no duplicates)
    globalInputManager.on('mouseClick', (data) => {
      connectInputToActivity('click', data.method || 'unified-manager', data);
    });

    globalInputManager.on('keyPress', (data) => {
      connectInputToActivity('key', data.method || 'unified-manager', data);
    });

    globalInputManager.on('mouseMovement', (data) => {
      connectInputToActivity('move', data.method || 'unified-manager', data);
    });

    // Make input manager globally accessible
    global.globalInputManager = globalInputManager;
    // Alias for legacy references used across modules
    try { global.unifiedInputManager = globalInputManager; } catch (_) { }

    // Wire input manager to screenshot manager so per-screenshot analysis receives events
    try {
      const sm = global.consolidatedScreenshotManager || global.screenshotManager;
      if (sm && typeof sm.connectInputManager === 'function') {
        sm.connectInputManager(globalInputManager);
        console.log('🔗 [INPUT→SCREENSHOT] Connected input manager to screenshot manager');
      }
    } catch (e) {
      console.log('⚠️ [INPUT→SCREENSHOT] Failed to connect input manager:', e?.message || String(e));
    }

    // 🔧 CRITICAL FIX: Add missing activity recording functions
    global.recordEnhancedActivity = function (type, method, details = {}) {
      try {
        // Accept external OS-level monitors (macOS/Windows/Linux) as valid real input
        // They provide actual click/key/move events via platform scripts; do not drop them

        // Hard idle gate: do not count any activity while idle
        let idleSeconds = 0;
        try {
          const getIdleTime = global.unifiedInputManager?.getIdleTime?.bind(global.unifiedInputManager);
          idleSeconds = typeof getIdleTime === 'function' ? (getIdleTime() || 0) : 0;
        } catch (_) { }
        const idleStatus = global.enhancedIdleMonitor?.getIdleStatus?.();
        const idleThreshold = (global.enhancedIdleMonitor && global.enhancedIdleMonitor.IDLE_THRESHOLD) || 60;
        const isIdle = (idleStatus ? !!idleStatus.isIdle : false) || (idleSeconds > idleThreshold);
        if (isIdle) {
          if (!global.__lastIdleDrop || Date.now() - global.__lastIdleDrop > 15000) {
            console.log(`[SYSTEM] IDLE-GATE – Dropped '${type}' from '${method}' while idle (${idleSeconds}s)`);
            global.__lastIdleDrop = Date.now();
          }
          return;
        }

        // MEMORY FIX: Throttle per-event activity logging to reduce V8 string retention
        // These fire dozens of times per second — logging each one wastes ~5-15MB/hr
        // Activity is still recorded; only the console.log is throttled

        // Update global activity counters
        if (!global.betweenScreenshotsActivity) {
          global.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
        }

        if (!global.displayActivityStats) {
          global.displayActivityStats = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
        }

        // Record the activity - CRITICAL FIX: Update BOTH simple and total fields
        // CRITICAL FIX (DEBUG): Also update enhancedActivityManager.betweenScreenshotsActivity
        // Screenshot capture reads from this object FIRST, so it must stay in sync
        switch (type) {
          case 'click':
            global.betweenScreenshotsActivity.clicks++;
            if (global.enhancedActivityManager?.betweenScreenshotsActivity) global.enhancedActivityManager.betweenScreenshotsActivity.clicks++;
            global.displayActivityStats.clicks++;
            if (!global.displayActivityStats.totalClicks) global.displayActivityStats.totalClicks = 0;
            global.displayActivityStats.totalClicks++;  // CRITICAL FIX: Also update totalClicks
            if (!global.displayActivityStats.sessionClicks) global.displayActivityStats.sessionClicks = 0;
            global.displayActivityStats.sessionClicks++; // CRITICAL FIX: Also update sessionClicks
            break;
          case 'key':
            global.betweenScreenshotsActivity.keys++;
            if (global.enhancedActivityManager?.betweenScreenshotsActivity) global.enhancedActivityManager.betweenScreenshotsActivity.keys++;
            global.displayActivityStats.keys++;
            if (!global.displayActivityStats.totalKeys) global.displayActivityStats.totalKeys = 0;
            global.displayActivityStats.totalKeys++;    // CRITICAL FIX: Also update totalKeys
            if (!global.displayActivityStats.sessionKeys) global.displayActivityStats.sessionKeys = 0;
            global.displayActivityStats.sessionKeys++;   // CRITICAL FIX: Also update sessionKeys
            break;
          case 'move':
            global.betweenScreenshotsActivity.moves++;
            if (global.enhancedActivityManager?.betweenScreenshotsActivity) global.enhancedActivityManager.betweenScreenshotsActivity.moves++;
            global.displayActivityStats.moves++;
            if (!global.displayActivityStats.totalMoves) global.displayActivityStats.totalMoves = 0;
            global.displayActivityStats.totalMoves++;    // CRITICAL FIX: Also update totalMoves
            if (!global.displayActivityStats.sessionMoves) global.displayActivityStats.sessionMoves = 0;
            global.displayActivityStats.sessionMoves++;  // CRITICAL FIX: Also update sessionMoves
            break;
        }

        // Update timestamps
        const now = Date.now();
        global.betweenScreenshotsActivity.lastUpdate = now;
        if (global.enhancedActivityManager?.betweenScreenshotsActivity) global.enhancedActivityManager.betweenScreenshotsActivity.lastUpdate = now;
        global.displayActivityStats.lastUpdate = now;

        // CRITICAL FIX: Forward activity to AntiCheatDetector for fraud detection
        try {
          if (global.antiCheatDetector && global.antiCheatDetector.isMonitoring) {
            const antiCheatType = type === 'click' ? 'mouse_click' : type === 'key' ? 'keyboard' : type === 'move' ? 'mouse_move' : null;
            if (antiCheatType) {
              // Get position from event details (Python monitor provides x, y coordinates)
              const hasPosition = details && (details.x !== undefined || details.position);
              const pos = details?.position || (hasPosition ? { x: details.x, y: details.y } : null);
              const antiCheatData = pos ? { x: pos.x, y: pos.y, timestamp: now } : { timestamp: now };
              global.antiCheatDetector.recordActivity(antiCheatType, antiCheatData);
            }
          }
        } catch (e) { /* Silent - don't break activity recording */ }

        // MEMORY FIX: Log activity summary every 30s instead of every event
        if (!global._lastActivityLogTime || (Date.now() - global._lastActivityLogTime > 30000)) {
          global._lastActivityLogTime = Date.now();
          const a = global.betweenScreenshotsActivity;
          console.log(`📊 [ACTIVITY-FIX] Counters: C:${a.clicks} K:${a.keys} M:${a.moves}`);
        }
      } catch (_) { }
    };

    global.recordActivityForDisplay = global.recordEnhancedActivity; // Alias for compatibility

    // CRITICAL FIX: Listen for real-input-detected events as fallback
    process.removeAllListeners('real-input-detected'); // Clear any existing listeners
    process.on('real-input-detected', (data) => {
      try {
        console.log('🔄 [INPUT-FALLBACK] Received real-input-detected event:', data.type);
        // Use the global recordEnhancedActivity function if available
        if (typeof recordEnhancedActivity === 'function') {
          recordEnhancedActivity(data.type, data.method || 'fallback');
        } else if (global.enhancedActivityManager) {
          global.enhancedActivityManager.recordEnhancedActivity(data.type, data.method || 'fallback');
        } else {
          // Direct update as last resort
          if (!global.displayActivityStats) {
            global.displayActivityStats = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
          }

          // CRITICAL: Also update betweenScreenshotsActivity for screenshot capture
          if (!global.betweenScreenshotsActivity) {
            global.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
          }

          if (data.type === 'click') {
            global.displayActivityStats.clicks++;
            global.betweenScreenshotsActivity.clicks++;
            console.log('🖱️ [INPUT-FALLBACK] Click recorded, total:', global.displayActivityStats.clicks, '| Screenshot activity:', global.betweenScreenshotsActivity.clicks);
          } else if (data.type === 'key') {
            global.displayActivityStats.keys++;
            global.betweenScreenshotsActivity.keys++;
            console.log('⌨️ [INPUT-FALLBACK] Key recorded, total:', global.displayActivityStats.keys, '| Screenshot activity:', global.betweenScreenshotsActivity.keys);
          } else if (data.type === 'move') {
            global.displayActivityStats.moves++;
            global.betweenScreenshotsActivity.moves++;
          }

          // Send immediate UI update
          if (global.enhancedSyncManager) {
            global.enhancedSyncManager.batchActivityUpdate({
              mouseClicks: global.displayActivityStats.clicks,
              keystrokes: global.displayActivityStats.keys,
              mouseMovements: global.displayActivityStats.moves
            });
          }
        }
      } catch (error) {
        console.error('❌ [INPUT-FALLBACK] Error processing real-input-detected:', error);
      }
    });

    try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'INPUT', step: 'INIT DONE' }); } catch { }



    return true;

  } catch (error) {
    try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'INPUT', step: 'INIT ERROR', message: error?.message || String(error) }); } catch { }
    return false;
  }
}

// CRITICAL FIX: Add input detection start/stop functions
global.startInputDetection = async function () {
  try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'INPUT', step: 'CONTROL START' }); } catch { }

  if (!globalInputManager) {
    try { const { logger } = require('./modules/utils/logger'); logger && logger.warn({ category: 'INPUT', step: 'CONTROL INIT MISSING', message: 'Initializing now' }); } catch { }
    await initializeInputDetectionSystem();
  }

  try {
    if (globalInputManager && !globalInputManager.isActive) {
      await globalInputManager.startTracking();
    }

    try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'INPUT', step: 'CONTROL STARTED' }); } catch { }
  } catch (error) {
    try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'INPUT', step: 'CONTROL START ERROR', message: error?.message || String(error) }); } catch { }
  }
};

global.stopInputDetection = function () {
  try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'INPUT', step: 'CONTROL STOP' }); } catch { }

  try {
    if (globalInputManager && globalInputManager.isActive) {
      globalInputManager.stopTracking();
    }

    try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'INPUT', step: 'CONTROL STOPPED' }); } catch { }
  } catch (error) {
    try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'INPUT', step: 'CONTROL STOP ERROR', message: error?.message || String(error) }); } catch { }
  }
};




// ================================
// SCREENSHOT TIMER DEBUG AND FIXES
// ================================

// debugScreenshotTimer function moved to modules/utils/screenshot-utils-manager.js

// forceScreenshotTimerRecovery function moved to modules/utils/screenshot-utils-manager.js

// DISABLED: Enhanced screenshot scheduling (PERFORMANCE FIX)
// This entire function was causing conflicts with the consolidated screenshot system
// The consolidated system handles all screenshot scheduling reliably without this
//
// function enhancedScheduleRandomScreenshot() {
//   try {
//     console.log('📸 [ENHANCED-SCHEDULE] Starting enhanced screenshot scheduling...');
//     
//     // Pre-checks
//     if (systemSuspended || screenshotsPaused) {
//       console.log('⏭️ [ENHANCED-SCHEDULE] Skipping - system suspended or paused');
//       return false;
//     }
//     
//     if (!isTracking || !currentSession) {
//       console.log('⏭️ [ENHANCED-SCHEDULE] Skipping - not tracking or no session');
//       return false;
//     }
//     
//     // Clear any existing timer first
//     if (screenshotInterval) {
//       clearTimeout(screenshotInterval);
//       screenshotInterval = null;
//     }
//     
//     // Calculate interval with enhanced logic
//     cleanScreenshotHistory();
//     const currentScreenshots = screenshotHistory.length;
//     
//     let interval;
//     if (currentScreenshots === 0) {
//       interval = 90; // 1.5 minutes for first screenshot
//     } else if (currentScreenshots === 1) {
//       interval = 180; // 3 minutes for second
//     } else if (currentScreenshots === 2) {
//       interval = 300; // 5 minutes for third
//     } else {
//       interval = 600; // 10 minutes if limit reached
//     }
//     
//     // Add some randomness
//     const randomOffset = Math.floor(Math.random() * 60) - 30; // ±30 seconds
//     interval += randomOffset;
//     interval = Math.max(60, interval); // Minimum 1 minute
//     
//     const nextScreenshotTime = new Date(Date.now() + interval * 1000);
//     
//     // Store globally
//     global.nextScreenshotTime = nextScreenshotTime;
//     global.nextScreenshotInterval = interval;
//     
//     console.log(`📸 [ENHANCED-SCHEDULE] Next screenshot in ${interval}s at ${nextScreenshotTime.toLocaleTimeString()}`);
//     
//     // Set the timeout
//     screenshotInterval = setTimeout(async () => {
//       try {
//         console.log('📸 [ENHANCED-SCHEDULE] Executing scheduled screenshot...');
//         
//         if (isTracking && currentSession && !systemSuspended && !screenshotsPaused) {
//           const success = await captureScreenshot();
//           console.log('📸 [ENHANCED-SCHEDULE] Screenshot result:', success ? 'SUCCESS' : 'FAILED');
//         }
//         
//         // DISABLED: Enhanced screenshot scheduling (PERFORMANCE FIX)
//         // This was conflicting with the consolidated screenshot system causing recovery loops
//         // The consolidated system handles all screenshot scheduling reliably
//         //
//         // if (isTracking && currentSession && !systemSuspended) {
//         //   enhancedScheduleRandomScreenshot();
//         // }
//       } catch (error) {
//         console.error('❌ [ENHANCED-SCHEDULE] Screenshot error:', error.message);
//         // DISABLED: Enhanced screenshot recovery (PERFORMANCE FIX)
//         //
//         // if (isTracking && currentSession && !systemSuspended) {
//         //   setTimeout(() => enhancedScheduleRandomScreenshot(), 5000);
//         // }
//       }
//     }, interval * 1000);
//     
//     console.log('✅ [ENHANCED-SCHEDULE] Screenshot scheduled successfully');
//     return true;
//     
//   } catch (error) {
//     console.error('❌ [ENHANCED-SCHEDULE] Scheduling failed:', error);
//     return false;
//   }
// }

// DISABLED: Legacy screenshot timer monitor (PERFORMANCE FIX)
// This was causing recovery loops every 30 seconds, consuming CPU and causing memory churn
// The consolidated screenshot system handles all scheduling reliably without this monitoring
// 
// PERFORMANCE IMPACT: Eliminating this saves 40-60% CPU usage from constant recovery attempts
// 
// Original code disabled:
/*
setInterval(() => {
  if (isTracking && currentSession) {
    if (!screenshotInterval && !systemSuspended && !screenshotsPaused) {
      console.log('⚠️ [TIMER-MONITOR] Screenshot timer missing (Consolidated system will handle)');
      // DISABLED: Force recovery (PERFORMANCE FIX)
      // forceScreenshotTimerRecovery();
    }
    if (global.nextScreenshotTime && global.nextScreenshotTime.getTime() < Date.now() - 5000) {
      console.log('⚠️ [TIMER-MONITOR] Next screenshot time expired (Consolidated system will handle)');
      // DISABLED: Force recovery (PERFORMANCE FIX)
      // forceScreenshotTimerRecovery();
    }
    if (Math.random() < 0.1) {
      debugScreenshotTimer();
    }
  }
}, 30000);
*/




// ENHANCED ACTIVITY TRACKING FOR SCREENSHOT MONITOR
// Using global global.displayActivityStats

// Function to update renderer with current activity


// ENHANCED IPC COMMUNICATION SYSTEM
let renderFrameReady = false;
let activityQueue = [];
let retryAttempts = new Map();
const MAX_RETRY_ATTEMPTS = 3;

// Window ready state detection moved to modules/utils/window-activity-manager.js

// Activity queue processing function extracted to modules/activity/activity-processor.js
function processActivityQueue() {
  return global.activityProcessor?.processActivityQueue();
}

// Ultra-safe activity sender

// Activity logging function extracted to modules/activity/activity-processor.js
function logActivityData(activityData, context = '') {
  return global.activityProcessor?.logActivityData(activityData, context);
}

// Activity sending function extracted to modules/activity/activity-processor.js
function sendActivityToRendererSafe(activityData, allowQueue = true) {
  return global.activityProcessor?.sendActivityToRendererSafe(activityData, allowQueue) || false;
}
// Periodic activity sync to ensure UI stays updated
let activitySyncInterval = null;

// Activity sync functions extracted to modules/activity/activity-processor.js
function startActivitySync() {
  return global.activityProcessor?.startActivitySync();
}

function stopActivitySync() {
  return global.activityProcessor?.stopActivitySync();
}


// Replace the existing sendActivityToRenderer function

// FIXED: Send proper activity data to renderer

// IPC functions extracted to modules/activity/activity-processor.js
function safeSendToRenderer(channel, data) {
  return global.activityProcessor?.safeSendToRenderer(channel, data) || false;
}

// ================================
// PERFORMANCE OPTIMIZATION: CONSOLIDATED IPC SYSTEM
// ================================

// Batched data for consolidated IPC updates
let batchedIPCData = {
  activity: null,
  timer: null,
  screenshot: null,
  sync: null,
  apps: null,
  memory: null,
  lastUpdate: 0
};

let consolidatedIPCInterval = null;

// Consolidated IPC functions extracted to modules/activity/activity-processor.js
function startConsolidatedIPC() {
  return global.activityProcessor?.startConsolidatedIPC();
}

function stopConsolidatedIPC() {
  return global.activityProcessor?.stopConsolidatedIPC();
}

// Default data functions moved to enhanced-sync-manager.js
function getDefaultActivityData() {
  return global.enhancedSyncManager?.getDefaultActivityData() || {};
}

function getDefaultTimerData() {
  return global.enhancedSyncManager?.getDefaultTimerData() || {};
}

function getDefaultScreenshotData() {
  return global.enhancedSyncManager?.getDefaultScreenshotData() || {};
}

// Batch update functions moved to enhanced-sync-manager.js
function batchActivityUpdate(activityData) {
  return global.enhancedSyncManager?.batchActivityUpdate(activityData);
}

function batchTimerUpdate(timerData) {
  return global.enhancedSyncManager?.batchTimerUpdate(timerData);
}

function batchScreenshotUpdate(screenshotData) {
  return global.enhancedSyncManager?.batchScreenshotUpdate(screenshotData);
}

function batchSyncUpdate(syncData) {
  return global.enhancedSyncManager?.batchSyncUpdate(syncData);
}

function batchAppUpdate(appData) {
  return global.enhancedSyncManager?.batchAppUpdate(appData);
}

// Throttle activity updates to prevent UI freeze
let lastActivitySent = 0;
const ACTIVITY_UPDATE_THROTTLE = 2000; // Only send updates every 2 seconds

// sendActivityToRenderer function moved to modules/utils/window-activity-manager.js


// recordActivityForDisplay function moved to modules/utils/activity-processing-manager.js

// resetActivityForScreenshot function moved to modules/utils/activity-processing-manager.js

// resetAllActivityCounters function moved to modules/utils/activity-processing-manager.js

// Window activity management initialization
const WindowActivityManager = require('./modules/utils/window-activity-manager');
global.windowActivityManager = new WindowActivityManager({
  mainWindow,
  processActivityQueue,
  isTracking
});

// Initialize window activity management
if (mainWindow) {
  global.windowActivityManager.initializeAll();
}

let lastActivityPercent = 100;

// offlineQueue moved to configuration-data-manager.js
let offlineQueue = configDataManager.offlineQueue;

// Idle detection functions moved to enhanced-idle-detector.js
function getSystemIdleTime() {
  return global.enhancedIdleMonitor?.getSystemIdleTime() || 0;
}

function getCurrentMousePosition() {
  // Simplified mouse position tracking without robotjs
  try {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const point = screen.getCursorScreenPoint();
    return { x: point.x, y: point.y };
  } catch (error) {
    console.log('⚠️ Screen API not available for mouse tracking');
    return mouseTracker;
  }
}

function simulateKeyboardActivity() {
  // CRITICAL FIX: Disabled fake keyboard activity simulation
  console.log('🚫 [SIMULATE] Keyboard activity simulation DISABLED - use real input detection only');
  return; // Do not increment fake counters
}

function simulateMouseClick() {
  // CRITICAL FIX: Disabled fake mouse click simulation
  console.log('🚫 [SIMULATE] Mouse click simulation DISABLED - use real input detection only');
  return; // Do not increment fake counters

  // PERFORMANCE-OPTIMIZED EVENT-DRIVEN: Throttle app and URL capture to avoid excessive calls
  const now = Date.now();

  // Only trigger captures if enough time has passed (centralized throttling)
  if (global.captureActiveApp && (now - lastAppCaptureLogTime) > getInterval('APP_CAPTURE_THROTTLE')) {
    lastAppCaptureLogTime = now;
    global.captureActiveApp();
  }
  // Avoid direct legacy URL capture to prevent duplicates; consolidated manager will trigger URL capture
  // if (global.captureActiveUrl && (now - lastUrlCaptureLogTime) > getInterval('URL_CAPTURE_THROTTLE')) {
  //   lastUrlCaptureLogTime = now;
  //   global.captureActiveUrl();
  // }

  if (antiCheatDetector) {
    antiCheatDetector.recordActivity('mouse_click', {
      x: mouseTracker.x,
      y: mouseTracker.y,
      timestamp: Date.now()
    });
  }
}

// Window creation function extracted to modules/ui/window-manager.js
function createWindow() {
  return global.windowManager?.createWindow();
}

// Debug window creation function extracted to modules/ui/window-manager.js
function createDebugWindow() {
  return global.windowManager?.createDebugWindow();
}

// === DEBUG CONSOLE COMMUNICATION ===
// All debug communication now handled by centralized SystemMonitor

// === PERFORMANCE OPTIMIZED EVENT HANDLING ===
const EVENT_DEBOUNCE_MS = 200;
let lastEventTime = 0;
let eventDebounceTimeouts = new Map();

// Event debouncing function extracted to modules/ui/window-manager.js
function debounceEvent(eventName, handler, delay) {
  return global.windowManager?.debounceEvent(eventName, handler, delay);
}

// createTray function moved to modules/utils/config-ui-manager.js

// === PERFORMANCE OPTIMIZED TRAY MENU UPDATES ===
let trayUpdateTimeout = null;
const TRAY_UPDATE_THROTTLE_MS = 500;

// updateTrayMenuThrottled function moved to modules/utils/config-ui-manager.js

// updateTrayMenu function moved to modules/utils/config-ui-manager.js

// fetchSettings function moved to modules/utils/config-ui-manager.js

// Idle monitoring functions moved to enhanced-idle-detector.js
function startIdleMonitoring() {
  return global.enhancedIdleMonitor?.startIdleMonitoring();
}

// User became active (stricter detection)
if (idleStart !== null && idleTimeSeconds < 5 && (now - lastActivity) < 5000) {
  const idleEnd = now;
  const idleDuration = idleEnd - idleStart;
  const idleDurationSeconds = Math.floor(idleDuration / 1000);

  // ITEM 2: Log idle period
  logIdlePeriod(idleStart, idleEnd, idleDurationSeconds);

  idleStart = null;

  // Update UI
  mainWindow?.webContents.send('idle-status-changed', {
    isIdle: false,
    idleDuration: idleDurationSeconds,
    resumed: true
  });

  // Send to debug console via system monitor
  systemMonitor.sendActivityUpdate('idle', {
    idleSeconds: 0,
    idleTime: 0,
    resumed: true,
    idleDuration: idleDurationSeconds
  });

  systemMonitor.sendDebugUpdate('ACTIVE', `Activity resumed after ${idleDurationSeconds}s idle`);

  // Show notification
  showTrayNotification(`Activity resumed - score back to 100% after ${Math.floor(idleDurationSeconds / 60)}m ${idleDurationSeconds % 60}s`, 'success');
}

// REMOVED: Legacy 40-minute idle auto-stop block
// Enhanced idle monitor (enhanced-idle-monitor.js) is the single source of truth
// for idle detection and auto-stop. It uses a configurable threshold (default 10 min)
// and handles idle logging, notifications, and stopTracking calls.

function startMouseTracking() {
  // DISABLED: All fake mouse tracking removed
  console.log('🚫 [DISABLED] Fake mouse tracking disabled - use real OS-level detection only');
  return;
}

function startKeyboardTracking() {
  if (keyboardTrackingInterval) clearInterval(keyboardTrackingInterval);

  // Real keyboard detection will be handled by enhanced input detector and PowerMonitor
  // This function is kept for compatibility but real detection happens elsewhere
  console.log('⌨️ Keyboard tracking delegated to enhanced input detector and PowerMonitor');
}

function stopIdleMonitoring() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }

  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval);
    mouseTrackingInterval = null;
  }

  if (keyboardTrackingInterval) {
    clearInterval(keyboardTrackingInterval);
    keyboardTrackingInterval = null;
  }

  if (antiCheatDetector) {
    antiCheatDetector.stopMonitoring();
  }

  console.log('🛑 Enhanced idle monitoring stopped');
}

// Idle logging moved to enhanced-idle-monitor.js
async function logIdlePeriod(start, end, durationSeconds) {
  return global.enhancedIdleMonitor?.logIdlePeriod(start, end, durationSeconds);
}

async function updateTimeLogIdleStatus(isIdle, idleMinutes = 0) {
  return global.databaseManager?.updateTimeLogIdleStatus(isIdle, idleMinutes);
}

// === ITEM 4: REVAMPED APP/WINDOW CAPTURE ===
let appCaptureEnabled = false;
let appCaptureFailureCount = 0;
let lastAppCapture = null;
let lastAppCaptureTime = null;
const MAX_APP_CAPTURE_FAILURES = 3;

// App detection moved to enhanced-app-detector.js
async function detectActiveApplication() {
  return global.enhancedAppDetector?.detectActiveApplication() || null;
}

// Platform-specific app detection functions moved to platform modules

// App capture handled by EnhancedAppDetector via MonitoringManager

// === ITEM 5: REVAMPED URL/DOMAIN CAPTURE ===
let urlCaptureEnabled = false;
let lastUrlCapture = null;
let lastUrlCaptureTime = null;

// Enhanced tab change detection variables
let activeBrowserUrlCheckInterval = null;
let lastActiveBrowserCheck = 0;
let currentActiveBrowser = null;

// Browser URL detection moved to enhanced url-capture-manager.js
async function detectBrowserUrl() {
  return global.browserUrlManager?.detectBrowserUrl() || null;
}

// Browser detection moved to enhanced url-capture-manager.js
async function getAllRunningBrowsers() {
  return global.browserUrlManager?.getAllRunningBrowsers() || [];
}

// URL extraction moved to enhanced url-capture-manager.js
async function extractUrlFromBrowser(browserName, windowTitle) {
  return global.browserUrlManager?.extractUrlFromBrowser(browserName, windowTitle) || null;
}

// URL extraction cache moved to url-capture-manager.js

// URL extraction functions removed - using BrowserUrlManager directly

// Enhanced active browser monitoring for tab changes
// Browser monitoring function extracted to modules/capture/browser-url-manager.js
function startActiveBrowserMonitoring() {
  return global.browserUrlManager?.startActiveBrowserMonitoring();
}

function stopActiveBrowserMonitoring() {
  if (activeBrowserUrlCheckInterval) {
    clearInterval(activeBrowserUrlCheckInterval);
    activeBrowserUrlCheckInterval = null;
    console.log('🛑 [TAB-MONITOR] Stopped tab change monitoring');
  }
}

// Track last URL per browser to only capture changes
// Using global lastBrowserUrls map declared at top of file

// URL capture function extracted to modules/capture/browser-url-manager.js
function startUrlCapture() {
  return global.browserUrlManager?.startUrlCapture();
}

// URL processing moved to modules/capture/browser-url-manager.js
async function processFoundUrl(urlData) {
  try {
    // Process URL via BrowserUrlManager
    if (global.browserUrlManager && global.browserUrlManager.processFoundUrl) {
      console.log('📤 [URL-PROCESS] Processing via browserUrlManager');
      return await global.browserUrlManager.processFoundUrl(urlData);
    }

    // If no URL processors available, at least log the detection
    console.log('⚠️ [URL-PROCESS] No URL processors available! URL detected but not saved:', {
      url: urlData.url,
      domain: urlData.domain,
      browser: urlData.browser,
      title: urlData.title
    });

    // Update debug counters manually
    if (global.urlDebugTracker) {
      global.urlDebugTracker.detections++;
      global.urlDebugTracker.processings++;
      console.log('🔍 [URL-DEBUG] Manual processing count updated');
    }

    return null;
  } catch (error) {
    console.error('❌ [URL-PROCESS] Error processing URL:', error.message);
    return null;
  }
}

// Live activity updates for UI
let liveActivityInterval;

// Screenshot timer functions moved to enhanced-screenshot-manager.js
function calculateSecondsToNextScreenshot() {
  return global.enhancedScreenshotManager?.calculateSecondsToNextScreenshot() || 0;
}

// sendNextScreenshotUpdate function moved to modules/utils/screenshot-utils-manager.js

// Live activity updates moved to live-monitoring-manager.js
function startLiveActivityUpdates() {
  return global.liveMonitoringManager?.startLiveActivityUpdates();
}

// Live activity stop moved to live-monitoring-manager.js
function stopLiveActivityUpdates() {
  return global.liveMonitoringManager?.stopLiveActivityUpdates();
}

// startScreenshotTimerUpdates function moved to modules/utils/screenshot-utils-manager.js

// Smart URL capture - checks when browser is active or URLs change
// CONSOLIDATED: Using URL tracker
async function smartUrlCapture() {
  return wrappers.smartUrlCapture();
}

// Check background browsers less frequently
async function checkBackgroundBrowsers() {
  try {
    const runningBrowsers = await getAllRunningBrowsers();

    if (runningBrowsers.length === 0) {
      return;
    }

    // Check all running browsers for URL changes (don't skip based on cache)
    for (const browser of runningBrowsers) {
      const url = await extractUrlFromBrowser(browser.name, browser.title);
      if (url) {
        const urlData = {
          url: url,
          title: browser.title || 'Untitled',
          browser: browser.name,
          domain: extractDomain(url),
          isActive: false
        };

        await processFoundUrl(urlData);
        console.log(`✅ [SMART-URL] Captured URL from background browser: ${urlData.domain}`);
      }
    }
  } catch (error) {
    console.log('❌ Background browser check error:', error.message);
  }
}

// Enhanced browser detection
function isBrowserApp(appName) {
  if (!appName) return false;

  const browserNames = [
    'safari', 'chrome', 'firefox', 'edge', 'opera', 'brave',
    'google chrome', 'microsoft edge', 'mozilla firefox',
    'safari technology preview', 'chromium', 'vivaldi', 'arc'
  ];

  const lowerAppName = appName.toLowerCase();
  return browserNames.some(browser => lowerAppName.includes(browser));
}

// Domain extraction moved to utility-functions.js
function extractDomain(url) {
  const UtilityFunctions = require('./modules/utils/utility-functions');
  return UtilityFunctions.extractDomain(url);
}

// App test moved to enhanced-app-detector.js
async function testPlatformAppCapture() {
  return global.enhancedAppDetector?.testPlatformAppCapture() ?? false;
}

// App capture stop moved to enhanced-app-detector.js
function stopAppCapture() {
  return global.enhancedAppDetector?.stopAppCapture();
}

// URL capture stop function extracted to modules/capture/browser-url-manager.js
function stopUrlCapture() {
  return global.browserUrlManager?.stopUrlCapture();
}

// Real-time app detection moved to enhanced-app-detector.js
function startRealTimeAppDetection() {
  return global.enhancedAppDetector?.startRealTimeAppDetection();
}

// Real-time app detection moved to enhanced-app-detector.js
function stopRealTimeAppDetection() {
  return global.enhancedAppDetector?.stopRealTimeAppDetection();
}

// Permission checking consolidated into system health check at timer start

// Add this function before captureScreenshot

// All permission checking consolidated into system health check at timer start

// handleAccessibilityPermissionForUsers function moved to modules/utils/permission-utils-manager.js

// showPermissionGuide function moved to modules/utils/permission-utils-manager.js

// === ENHANCED SCREENSHOT CAPTURE WITH RATE LIMITING ===
let consecutiveScreenshotFailures = 0;
let lastSuccessfulScreenshotTime = 0;
let screenshotFailureStart = null;
let appCaptureFailures = 0;
const MAX_SCREENSHOT_FAILURES = 3; // Stop after 3 consecutive failures
const MANDATORY_SCREENSHOT_INTERVAL = 15 * 60 * 1000; // 15 minutes mandatory screenshot interval (reduced from 30)

// CRITICAL: Screenshot rate limiting (3 per 10 minutes = 600 seconds)
let screenshotHistory = []; // Array of screenshot timestamps
const MAX_SCREENSHOTS_PER_WINDOW = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// cleanScreenshotHistory function moved to modules/utils/screenshot-utils-manager.js

// canTakeScreenshot function moved to modules/utils/screenshot-utils-manager.js

// Screenshot functions moved to enhanced-screenshot-manager.js
async function captureScreenshot(isHealthCheck = false) {
  return global.enhancedScreenshotManager?.captureScreenshot(isHealthCheck);
}



function getPlatformScreenshotOptions() {
  return global.enhancedScreenshotManager?.getPlatformScreenshotOptions();
}

// checkScreenshotStopConditions function moved to modules/utils/screenshot-utils-manager.js

// getScreenshotStopReason function moved to modules/utils/screenshot-utils-manager.js

// calculateActivityPercent function moved to modules/utils/activity-calculation-manager.js

// getCumulativeDailyActivity function moved to modules/utils/activity-calculation-manager.js

// calculateIdleTimeSeconds function moved to modules/utils/activity-calculation-manager.js

// calculateFocusPercent function moved to modules/utils/activity-calculation-manager.js

// resetActivityStats function moved to modules/utils/activity-calculation-manager.js

// getPerPeriodActivity function moved to modules/utils/activity-calculation-manager.js

// resetPeriodActivityStats function moved to modules/utils/activity-calculation-manager.js

// Screenshot functions moved to enhanced-screenshot-manager.js
function startScreenshotCapture() {
  return global.enhancedScreenshotManager?.startScreenshotCapture();
}

function scheduleRandomScreenshot() {
  return global.enhancedScreenshotManager?.scheduleRandomScreenshot();
}

function stopScreenshotCapture() {
  return global.enhancedScreenshotManager?.stopScreenshotCapture();
}

// === ITEM 7: NOTIFICATIONS TRAY ===
// Notification functions moved to modules/notifications/notification-manager.js
function startNotificationChecking() {
  return global.notificationManager?.startNotificationChecking();
}

function stopNotificationChecking() {
  return global.notificationManager?.stopNotificationChecking();
}

async function checkNotifications() {
  return global.notificationManager?.checkNotifications();
}

function showTrayNotification(message, type = 'info') {
  return global.notificationManager?.showTrayNotification(message, type);
}

// Session management moved to session-manager.js
async function cleanupStaleActiveSessions() {
  return global.sessionManager?.cleanupStaleActiveSessions();
}

// Tab monitoring functions removed - using BrowserUrlManager directly

// Monitoring cleanup moved to monitoring-manager.js
async function stopAllMonitoringSystems() {
  return global.monitoringManager?.stopAllSystems();
}

// === TRACKING CONTROL ===

// Memory monitoring moved to monitoring-manager.js
function logMemoryUsage(label) {
  return global.monitoringManager?.logMemoryUsage(label);
}

function startMemoryMonitoring() {
  return global.monitoringManager?.startMemoryMonitoring();
}

function stopMemoryMonitoring() {
  return global.monitoringManager?.stopMemoryMonitoring();
}

// NOTE: startTracking and stopTracking functions are now defined at the top of the file as global functions

// Global pauseTracking function
global.pauseTracking = async function pauseTracking(reason = 'manual') {
  console.log('⏸️ [GLOBAL-WRAPPER] pauseTracking called');

  try {
    const controller = initializeTrackingController();
    const result = await controller.pauseTracking(reason);

    console.log('✅ [GLOBAL-WRAPPER] pauseTracking completed');
    return result;

  } catch (error) {
    console.error('❌ [GLOBAL-WRAPPER] pauseTracking failed:', error);
    throw error;
  }
};

// Global resumeTracking function  
global.resumeTracking = async function resumeTracking() {
  console.log('▶️ [GLOBAL-WRAPPER] resumeTracking called');

  try {
    const controller = initializeTrackingController();
    const result = await controller.resumeTracking();

    console.log('✅ [GLOBAL-WRAPPER] resumeTracking completed');
    return result;

  } catch (error) {
    console.error('❌ [GLOBAL-WRAPPER] resumeTracking failed:', error);
    throw error;
  }
};

// Mandatory screenshot monitoring functions moved to modules/utils/screenshot-utils-manager.js

// stopTracking function extracted to modules/core/tracking-manager.js
// This function is now handled by the TrackingManager module for better organization
// The functionality has been moved to provide better error handling, modularity, and maintainability

// Duplicate pauseTracking and resumeTracking functions removed
// These are now handled by the global functions defined at lines 5775-5803
// which use the TrackingController

function registerDeveloperConsoleHandlers() {
  if (!isElectronContext || !ipcMain || developerConsoleHandlersRegistered) {
    return;
  }

  developerConsoleHandlersRegistered = true;

  ipcMain.handle('get-registered-ipc-channels', () => {
    try {
      const invokeHandlers = (ipcMain._invokeHandlers && Array.from(ipcMain._invokeHandlers.keys())) || [];
      const eventMapHandlers = (global.ipcEventMap && Array.from(global.ipcEventMap.handlers.keys())) || [];
      return { success: true, handlers: Array.from(new Set([...invokeHandlers, ...eventMapHandlers])) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('diagnose-ipc', async () => {
    try {
      const channels = (ipcMain._invokeHandlers && Array.from(ipcMain._invokeHandlers.keys())) || [];
      const hasStartTimer = channels.includes('start-timer');
      return { success: true, hasStartTimer, channels };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('diagnostics:memory-snapshot', async () => {
    try {
      const { getMemoryProfiler } = require('./diagnostics/memoryProfiler');
      const profiler = getMemoryProfiler();

      if (profiler) {
        const snapshot = await profiler.getSnapshot();
        return { success: true, snapshot };
      }

      const processMemory = process.memoryUsage();
      const basicSnapshot = {
        timestamp: Date.now(),
        pid: process.pid,
        type: 'main',
        rssMB: Math.round((processMemory.rss / (1024 * 1024)) * 100) / 100,
        heapUsedMB: Math.round((processMemory.heapUsed / (1024 * 1024)) * 100) / 100,
        heapTotalMB: Math.round((processMemory.heapTotal / (1024 * 1024)) * 100) / 100,
        externalMB: Math.round((processMemory.external / (1024 * 1024)) * 100) / 100,
        arrayBuffersMB: Math.round((processMemory.arrayBuffers / (1024 * 1024)) * 100) / 100
      };

      return { success: true, snapshot: basicSnapshot, fallback: true };
    } catch (error) {
      console.error('[MEMORY-PROFILER] IPC handler failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('export-logs', async (event, options = {}) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app, dialog } = require('electron');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logData = {
        timestamp: new Date().toISOString(),
        appVersion: app.getVersion(),
        platform: process.platform,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        systemInfo: {
          arch: process.arch,
          cpus: require('os').cpus().length,
          totalMemory: Math.round(require('os').totalmem() / (1024 * 1024 * 1024)) + ' GB',
          freeMemory: Math.round(require('os').freemem() / (1024 * 1024 * 1024)) + ' GB'
        },
        processMemory: {
          rss: Math.round(process.memoryUsage().rss / (1024 * 1024)) + ' MB',
          heapUsed: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)) + ' MB',
          heapTotal: Math.round(process.memoryUsage().heapTotal / (1024 * 1024)) + ' MB',
          external: Math.round(process.memoryUsage().external / (1024 * 1024)) + ' MB'
        },
        config: {
          userId: config?.user_id || 'N/A',
          supabaseUrl: config?.supabase_url || 'N/A',
          isProduction: process.env.NODE_ENV === 'production'
        },
        trackingState: {
          isTracking: global.isTracking || false,
          currentProjectId: global.currentProjectId || null,
          currentTimeLogId: global.currentTimeLogId || null
        },
        registeredIPCHandlers: Array.from(ipcMain._invokeHandlers?.keys() || []),
        globalModules: {
          trackingManager: !!global.trackingManager,
          activityManager: !!global.activityManager,
          urlCaptureManager: !!global.urlCaptureManager,
          screenshotManager: !!global.screenshotManager,
          sessionManager: !!global.sessionManager,
          supabaseService: !!global.supabaseService
        },
        pythonDiagnostics: global.pythonDiagnostics || { foundPath: null, message: 'No Python detection run' },
        healthCheck: global.systemMonitor?.systemState?.health || {},
        inputDetection: {
          inputManagerActive: global.globalInputManager?.isActive || false,
          pythonDisabled: global.globalInputManager?.platformDetector?.pythonDisabled || false,
          activityStats: global.displayActivityStats || {}
        }
      };

      if (options.includeConsoleLogs && global.consoleLogBuffer) {
        logData.consoleLogs = global.consoleLogBuffer;
      }

      const logContent = JSON.stringify(logData, null, 2);
      const defaultPath = path.join(app.getPath('desktop'), `timeflow-logs-${timestamp}.json`);
      const result = await dialog.showSaveDialog(global.mainWindow, {
        title: 'Export Logs',
        defaultPath,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, logContent, 'utf8');
        console.log(`✅ [LOG-EXPORT] Logs exported to: ${result.filePath}`);
        return {
          success: true,
          filePath: result.filePath,
          size: Buffer.byteLength(logContent, 'utf8')
        };
      }

      return { success: false, canceled: true };
    } catch (error) {
      console.error('❌ [LOG-EXPORT] Failed to export logs:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler to copy comprehensive diagnostic logs to clipboard
  ipcMain.handle('copy-logs-to-clipboard', async () => {
    try {
      const { app, clipboard } = require('electron');
      const os = require('os');

      // Gather comprehensive diagnostics
      const healthState = global.systemMonitor?.systemState?.health || {};
      const pythonDiag = global.pythonDiagnostics || { foundPath: null, version: null, checkedPaths: [], message: 'No Python detection has been run yet' };
      const activityStats = global.displayActivityStats || {};
      const inputManagerActive = global.globalInputManager?.isActive || false;
      const pythonDisabled = global.globalInputManager?.detector?.pythonDisabled || false;

      // Run a fresh health check if system monitor is available
      let freshHealthCheck = null;
      try {
        if (global.systemMonitor?.performComprehensiveHealthCheck) {
          freshHealthCheck = await global.systemMonitor.performComprehensiveHealthCheck();
        }
      } catch (_) {}

      // Get recent console logs (last 200 lines)
      const recentLogs = (global.consoleLogBuffer || []).slice(-200).map(l => {
        if (typeof l === 'string') return l;
        if (l.message) return `[${l.timestamp || ''}] [${l.category || ''}] ${l.message}`;
        return JSON.stringify(l);
      });

      // Format as readable text
      const lines = [
        '=== TimeFlow Diagnostic Report ===',
        `Timestamp: ${new Date().toISOString()}`,
        `App Version: ${app.getVersion()}`,
        `Platform: ${process.platform} (${process.arch})`,
        `OS: ${os.type()} ${os.release()}`,
        `Node: ${process.versions.node}`,
        `Electron: ${process.versions.electron}`,
        '',
        '--- Health Check ---',
        `Overall: ${freshHealthCheck?.overall || healthState.overall || 'unknown'}`,
        `Can Start Timer: ${freshHealthCheck?.canStartTimer ?? 'unknown'}`,
      ];

      if (freshHealthCheck?.issues?.length > 0) {
        lines.push('Issues:');
        freshHealthCheck.issues.forEach(i => lines.push(`  - ${i}`));
      }
      if (freshHealthCheck?.warnings?.length > 0) {
        lines.push('Warnings:');
        freshHealthCheck.warnings.forEach(w => lines.push(`  - ${w}`));
      }

      // Individual check details
      if (freshHealthCheck?.checks) {
        lines.push('');
        lines.push('--- Check Details ---');
        Object.entries(freshHealthCheck.checks).forEach(([name, result]) => {
          lines.push(`${name}: ${result.status} - ${result.message || ''}`);
          if (result.details && result.status === 'fail') {
            lines.push(`  Details: ${JSON.stringify(result.details)}`);
          }
        });
      }

      lines.push('');
      lines.push('--- Python Diagnostics ---');
      lines.push(`Found Path: ${pythonDiag.foundPath || 'NONE'}`);
      lines.push(`Version: ${pythonDiag.version || 'unknown'}`);
      lines.push(`Python Disabled: ${pythonDisabled}`);
      lines.push(`Failure Count: ${global.globalInputManager?.platformDetector?.pythonFailureCount ?? 'unknown'}`);
      lines.push(`Max Retries: ${global.globalInputManager?.platformDetector?.pythonMaxRetries ?? 'unknown'}`);
      if (pythonDiag.checkedPaths?.length > 0) {
        lines.push('Checked Paths:');
        pythonDiag.checkedPaths.forEach(p => {
          if (typeof p === 'object' && p !== null) {
            lines.push(`  - ${p.path || 'unknown'}: ${p.status || 'unknown'}${p.version ? ' (' + p.version + ')' : ''}${p.error ? ' - ' + p.error : ''}`);
          } else {
            lines.push(`  - ${p}`);
          }
        });
      }
      if (pythonDiag.spawnErrors?.length > 0) {
        lines.push('Spawn Errors:');
        pythonDiag.spawnErrors.forEach(e => lines.push(`  - [${e.timestamp}] ${e.error}`));
      }
      if (pythonDiag.stderrErrors?.length > 0) {
        lines.push('Runtime Errors (stderr):');
        pythonDiag.stderrErrors.forEach(e => lines.push(`  - [${e.timestamp}] ${e.message}`));
      }
      if (pythonDiag.exitCodes?.length > 0) {
        lines.push('Exit Codes:');
        pythonDiag.exitCodes.forEach(e => lines.push(`  - [${e.timestamp}] code=${e.code}`));
      }
      if (pythonDiag.message) {
        lines.push(`Message: ${pythonDiag.message}`);
      }
      // Auto-provisioner results
      if (pythonDiag.provisionerResult) {
        lines.push(`Provisioner Result: ${pythonDiag.provisionerResult}`);
      }
      if (pythonDiag.autoProvisioned) {
        lines.push(`Auto-Provisioned: true (path: ${pythonDiag.provisionedPath || 'unknown'}, version: ${pythonDiag.provisionedVersion || 'unknown'}, at: ${pythonDiag.provisionedAt || 'unknown'})`);
      }
      if (pythonDiag.autoProvisionError) {
        lines.push(`Auto-Provision Error: ${pythonDiag.autoProvisionError}`);
      }
      if (pythonDiag.pipInstalled) {
        lines.push(`PyObjC Pip Installed: true (at: ${pythonDiag.pipInstalledAt || 'unknown'})`);
      }
      if (pythonDiag.pipInstallError) {
        lines.push(`PyObjC Pip Install Error: ${pythonDiag.pipInstallError}`);
      }
      if (pythonDiag.provisionerErrors?.length > 0) {
        lines.push('Provisioner Errors:');
        pythonDiag.provisionerErrors.forEach(e => lines.push(`  - ${e}`));
      }

      lines.push('');
      lines.push('--- Input Detection ---');
      lines.push(`Input Manager Active: ${inputManagerActive}`);
      lines.push(`Activity Stats: clicks=${activityStats.clicks || 0}, keys=${activityStats.keys || 0}, moves=${activityStats.moves || 0}`);
      lines.push(`Last Activity Update: ${activityStats.lastUpdate ? new Date(activityStats.lastUpdate).toISOString() : 'never'}`);

      lines.push('');
      lines.push('--- Tracking State ---');
      lines.push(`Is Tracking: ${global.isTracking || false}`);
      lines.push(`Current Time Log ID: ${global.currentTimeLogId || 'none'}`);
      lines.push(`Current Project ID: ${global.currentProjectId || 'none'}`);

      lines.push('');
      lines.push('--- System Resources ---');
      lines.push(`CPU Cores: ${os.cpus().length}`);
      lines.push(`Total Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
      lines.push(`Free Memory: ${(os.freemem() / (1024 * 1024 * 1024)).toFixed(1)} GB`);
      const mem = process.memoryUsage();
      lines.push(`Heap Used: ${Math.round(mem.heapUsed / (1024 * 1024))} MB`);

      lines.push('');
      lines.push('--- Recent Logs (last 200) ---');
      recentLogs.forEach(l => lines.push(l));

      const text = lines.join('\n');
      clipboard.writeText(text);

      console.log('📋 [COPY-LOGS] Diagnostic logs copied to clipboard');
      return { success: true, size: text.length };
    } catch (error) {
      console.error('❌ [COPY-LOGS] Failed to copy logs:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler to get console logs for display in the developer console
  ipcMain.handle('get-console-logs', async (event, options = {}) => {
    try {
      const logs = global.consoleLogBuffer || [];
      const limit = options.limit || 1000; // Default to all logs
      const featureFilter = options.featureFilter || 'all';

      // Filter by feature category if specified
      let filteredLogs = logs;
      if (featureFilter && featureFilter !== 'all') {
        filteredLogs = logs.filter(log => {
          // Extract category from log message (e.g., [URL], [SCREENSHOT], [INPUT])
          const categoryMatch = log.message.match(/\[([^\]]+)\]/);
          const category = categoryMatch ? categoryMatch[1].toLowerCase() : null;
          return category === featureFilter.toLowerCase();
        });
      }

      // Return most recent logs (up to limit)
      const recentLogs = filteredLogs.slice(-limit);

      console.log(`📋 [CONSOLE-LOGS] Returning ${recentLogs.length} logs (filter: ${featureFilter})`);

      return {
        success: true,
        logs: recentLogs,
        totalCount: logs.length,
        filteredCount: filteredLogs.length
      };
    } catch (error) {
      console.error('❌ [CONSOLE-LOGS] Failed to get console logs:', error);
      return {
        success: false,
        error: error.message,
        logs: []
      };
    }
  });

  // Handler to get detailed feature status for developer console
  ipcMain.handle('get-detailed-feature-status', async () => {
    try {
      const now = Date.now();

      // URL Status Calculation (Prioritize UrlCaptureManager)
      const urlManager = global.urlCaptureManager || global.browserUrlManager;
      const urlLastTime = urlManager?.lastUrlCaptureTime ? new Date(urlManager.lastUrlCaptureTime).getTime() : 0;
      const urlIsActive = urlManager?.isPolling || urlManager?.urlCaptureEnabled || false;
      const urlLastUrl = urlManager?.lastUrlCapture || 'None';
      const urlIsWorking = !!urlManager?.lastUrlCapture && (now - urlLastTime < 300000);



      // FIX: Check multiple data sources for input activity
      // Primary: global.displayActivityStats (used by ACTIVITY-FIX)
      // Fallback: globalInputManager.stats
      const displayStats = global.displayActivityStats || {};
      const inputStats = globalInputManager?.stats || {};
      
      // Use whichever has data
      const clicks = displayStats.clicks || inputStats.mouseClicks || 0;
      const keys = displayStats.keys || inputStats.keystrokes || 0;
      const moves = displayStats.moves || inputStats.mouseMovements || 0;
      const lastUpdate = displayStats.lastUpdate || inputStats.lastActivity || 0;
      
      // FIX: Include tracking state so UI can show Stopped when not tracking
      const isTracking = !!global.isTracking;

      const status = {
        isTracking,
        input: {
          active: globalInputManager?.isActive || (clicks > 0 || keys > 0 || moves > 0),
          mouseClick: {
            lastTime: lastUpdate,
            working: isTracking && clicks > 0,
            count: clicks
          },
          mouseMove: {
            lastTime: lastUpdate,
            working: isTracking && moves > 0,
            count: moves
          },
          keyboard: {
            lastTime: lastUpdate,
            working: isTracking && keys > 0,
            count: keys
          }
        },
        screenshot: {
          active: !!global.enhancedScreenshotManager?.windowTimers?.length || !!global.enhancedScreenshotManager?.screenshotInterval || !!global.enhancedScreenshotManager?._windowInterval,
          lastTime: global.lastScreenshotTime || 0,
          nextTime: global.enhancedScreenshotManager?.nextScreenshotTime || null,
          working: isTracking && (!!(global.lastScreenshotTime && global.lastScreenshotTime > 0) || !!(global.enhancedScreenshotManager?.nextScreenshotTime))
        },
        appTrack: {
          active: !!global.enhancedAppDetector?.appCaptureInterval || !!global.enhancedAppDetector?.realTimeAppInterval,
          lastTime: global.enhancedAppDetector?.lastAppCaptureTime || 0,
          lastApp: global.enhancedAppDetector?.lastActiveApp || 'None',
          working: isTracking && !!global.enhancedAppDetector?.lastActiveApp
        },
        urlTrack: {
          active: urlIsActive,
          lastTime: urlLastTime,
          lastUrl: urlLastUrl,
          working: isTracking && urlIsWorking
        },
        idle: {
          active: globalInputManager?.isActive || (clicks > 0 || keys > 0 || moves > 0),
          idleTime: globalInputManager?.getIdleTime?.() || 0,
          lastActivity: lastUpdate,
          isIdle: isTracking ? (globalInputManager?.getIdleTime?.() || 0) > 10 : false
        }
      };
      return { success: true, status };
    } catch (error) {
      console.error('❌ [FEATURE-STATUS] Failed to get status:', error);
      return { success: false, error: error.message };
    }
  });

  if (!global.consoleLogBuffer) {
    const maxLogs = 1000;
    global.consoleLogBuffer = [];

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    console.log = function (...args) {
      global.consoleLogBuffer.push({
        level: 'log',
        timestamp: new Date().toISOString(),
        message: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')
      });
      if (global.consoleLogBuffer.length > maxLogs) {
        global.consoleLogBuffer.shift();
      }
      originalLog.apply(console, args);
    };

    console.error = function (...args) {
      global.consoleLogBuffer.push({
        level: 'error',
        timestamp: new Date().toISOString(),
        message: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')
      });
      if (global.consoleLogBuffer.length > maxLogs) {
        global.consoleLogBuffer.shift();
      }
      originalError.apply(console, args);
    };

    console.warn = function (...args) {
      global.consoleLogBuffer.push({
        level: 'warn',
        timestamp: new Date().toISOString(),
        message: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')
      });
      if (global.consoleLogBuffer.length > maxLogs) {
        global.consoleLogBuffer.shift();
      }
      originalWarn.apply(console, args);
    };

    console.info = function (...args) {
      global.consoleLogBuffer.push({
        level: 'info',
        timestamp: new Date().toISOString(),
        message: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')
      });
      if (global.consoleLogBuffer.length > maxLogs) {
        global.consoleLogBuffer.shift();
      }
      originalInfo.apply(console, args);
    };

    console.debug = function (...args) {
      global.consoleLogBuffer.push({
        level: 'debug',
        timestamp: new Date().toISOString(),
        message: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')
      });
      if (global.consoleLogBuffer.length > maxLogs) {
        global.consoleLogBuffer.shift();
      }
      originalDebug.apply(console, args);
    };
  }
}

// === CRITICAL EARLY IPC HANDLERS ===
// Register essential handlers before window creation to avoid timing issues
if (isElectronContext && ipcMain) {
  console.log('🔧 Registering critical IPC handlers before window creation...');
  // Register get-app-version handler early
  ipcMain.handle('get-app-version', () => {
    try {
      const packageJson = require('../package.json');
      return packageJson.version;
    } catch (error) {
      console.error('[VERSION] Failed to read version:', error);
      return '95.5.5'; // Fallback version
    }
  });
  
  // Register get-python-diagnostics handler for error reporting
  ipcMain.handle('get-python-diagnostics', () => {
    try {
      // Return global Python diagnostics stored by cross-platform-input-detector
      return global.pythonDiagnostics || {
        foundPath: null,
        version: null,
        checkedPaths: [],
        timestamp: null,
        message: 'No Python detection has been run yet'
      };
    } catch (error) {
      console.error('[PYTHON-DIAG] Failed to get diagnostics:', error);
      return { error: error.message };
    }
  });

  // Register get-config handler early to prevent initialization errors
  ipcMain.handle('get-config', () => {
    console.log('⚙️ [EARLY-IPC] get-config called - returning config');
    console.log('🔍 [DEBUG] config variable type:', typeof config);
    console.log('🔍 [DEBUG] config value:', config);
    console.log('🔍 [DEBUG] process.env.VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);
    console.log('🔍 [DEBUG] process.env.VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? '[REDACTED]' : 'undefined');

    try {
      // Try to use loaded config first
      if (config && config.supabase_url && config.supabase_key) {
        console.log('✅ [EARLY-IPC] Using loaded config');
        return {
          supabase_url: config.supabase_url,
          supabase_key: config.supabase_key,
          // Never expose service role key to renderer
          user_id: config.user_id || null,
          project_id: config.project_id || null,
          isTracking: global.isTracking || false,
          currentTimeLogId: global.currentTimeLogId || null,
          NODE_ENV: config.NODE_ENV || process.env.NODE_ENV || 'production'
        };
      }

      // Try to reload config if it's undefined
      if (!config) {
        console.log('⚠️ [EARLY-IPC] Config is undefined, attempting to reload...');
        try {
          const { loadConfig } = require('../load-config');
          config = loadConfig();
          console.log('✅ [EARLY-IPC] Config reloaded successfully');
          if (config && config.supabase_url && config.supabase_key) {
            return {
              supabase_url: config.supabase_url,
              supabase_key: config.supabase_key,
              user_id: config.user_id || null,
              project_id: config.project_id || null,
              isTracking: global.isTracking || false,
              currentTimeLogId: global.currentTimeLogId || null,
              NODE_ENV: config.NODE_ENV || process.env.NODE_ENV || 'production'
            };
          }
        } catch (reloadError) {
          console.error('❌ [EARLY-IPC] Failed to reload config:', reloadError);
        }
      }

      // Fallback to environment variables if config not loaded
      const supabase_url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabase_key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      console.log('🔍 [DEBUG] Environment variables check:');
      console.log('   VITE_SUPABASE_URL:', supabase_url || 'not found');
      console.log('   VITE_SUPABASE_ANON_KEY:', supabase_key ? '[REDACTED]' : 'not found');

      if (!supabase_url || !supabase_key) {
        console.error('❌ [EARLY-IPC] No Supabase configuration available in any source');
        console.error('❌ [EARLY-IPC] Config object:', config);
        console.error('❌ [EARLY-IPC] Env vars checked: VITE_SUPABASE_URL, SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY');
        throw new Error('Missing Supabase configuration');
      }

      console.log('⚠️ [EARLY-IPC] Using environment variables as fallback');
      return {
        supabase_url: supabase_url,
        supabase_key: supabase_key,
        user_id: null,
        project_id: null,
        isTracking: false,
        currentTimeLogId: null
      };
    } catch (error) {
      console.error('❌ [EARLY-IPC] Error in get-config:', error);
      console.error('❌ [EARLY-IPC] Stack trace:', error.stack);

      // Return null values to show the exact problem to the renderer
      return {
        supabase_url: null,
        supabase_key: null,
        user_id: null,
        project_id: null,
        isTracking: false,
        currentTimeLogId: null,
        error: error.message
      };
    }
  });

  registerDeveloperConsoleHandlers();

  // Note: start-timer and start-tracking handlers are now managed by the dedicated IPCHandlers module

  // Note: user-logged-in handler is now managed by the dedicated IPCHandlers module

  // Note: get-user-project-assignments handler is now managed by the dedicated IPCHandlers module

  // Note: load-user-session and user-logged-out handlers are now managed by the dedicated IPCHandlers module

  // Remove ALL existing handlers before initializing the dedicated module
  console.log('🧹 [IPC-CLEANUP] Removing existing handlers before IPCHandlers initialization...');
  const handlersToRemove = [
    'start-timer', 'start-tracking', 'stop-timer', 'stop-tracking',
    'user-logged-in', 'user-logged-out', 'load-user-session', 'load-session',
    'get-app-history', 'test-open-app-detection', 'get-user-project-assignments',
    'get-projects', 'reports:get-tracking-snapshot'
    // NOTE: Keeping 'get-config' handler to prevent renderer initialization errors
    // NOTE: Keeping Safari URL test handlers: 'auth:set-session', 'sync:now', 'permissions:check-automation', 'debug:get-last-url-error'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
      console.log(`🧹 [IPC-CLEANUP] Removed handler: ${handler}`);
    } catch { }
  }

  // Keep Safari URL test handlers - they're needed regardless of production mode
  console.log('🔧 [IPC-CLEANUP] Preserving Safari URL test handlers for diagnostics');

  console.log('✅ Critical IPC handlers registered early');
  console.log('🔧 Skipping duplicate IPC handlers module - using IPCHandlersManager instead');

  // Initialize IPC handlers using the dedicated module
  try {

    const IPCHandlers = require('./modules/ipc-handlers');
    const ipcHandlers = new IPCHandlers(
      ipcMain,
      { getConfig: () => config },  // configManager
      {
        startTracking: async (projectId) => {
          console.log('🎯 [TRACKING-ADAPTER] Starting tracking with project:', projectId);
          const result = global.trackingManager?.startTracking
            ? await global.trackingManager.startTracking(projectId)
            : await global.startTracking(projectId);

          // tracking-manager.js already sends 'tracking-started' and starts the
          // tray timer. Sending duplicates here causes the renderer timer to reset
          // (0→1→reset→0→1→2…). Only send if trackingManager is unavailable.
          if (result && result.timeLogId && global.mainWindow && !global.trackingManager) {
            console.log('📡 [TRACKING-ADAPTER] Fallback: sending tracking-started (no trackingManager)');
            const startIso = result.startTime || global.currentSession?.start_time || new Date().toISOString();
            global.mainWindow.webContents.send('tracking-started', {
              timeLogId: result.timeLogId,
              project_id: projectId,
              start_time: startIso,
              isTracking: true
            });
          }

          return result;
        },
        stopTracking: async (reason, details) => {
          console.log('🛑 [TRACKING-ADAPTER] Stopping tracking via global.stopTracking');
          const result = await global.stopTracking(reason, details);

          // GSM notifies renderer in Step 7. Only send fallback if GSM's
          // renderer notification didn't fire (e.g. exception before Step 7).
          if (global.mainWindow && !global.mainWindow.isDestroyed() && !result?.results?.renderer) {
            console.log('📡 [TRACKING-ADAPTER] Fallback: sending tracking-stopped (GSM did not notify renderer)');
            global.mainWindow.webContents.send('tracking-stopped', result);
          }

          return result;
        },
        pauseTracking: async () => {
          return global.trackingManager?.pauseTracking
            ? await global.trackingManager.pauseTracking()
            : await global.pauseTracking?.();
        },
        resumeTracking: async () => {
          return global.trackingManager?.resumeTracking
            ? await global.trackingManager.resumeTracking()
            : await global.resumeTracking?.();
        },
        getTrackingStatus: () => {
          // Return current tracking status from global state
          return {
            isTracking: global.isTracking || false,
            isPaused: global.isPaused || false,
            currentProjectId: global.currentProjectId || null,
            sessionStartTime: global.sessionStartTime || null
          };
        }
      },  // trackingManager
      global.screenshotManager || null,  // screenshotManager
      global.activityManager || null,    // activityManager
      global.sessionManager || sessionManager || null      // sessionManager
    );

    // Initialize Reports IPC handlers
    const ReportsIPCHandlers = require('./modules/ipc/reports-ipc-handlers');

    console.log('🔧 [MAIN] Initializing Reports IPC handlers with dependencies:', {
      ipcMain: !!ipcMain,
      supabaseService: !!global.supabaseService,
      activityManager: !!global.activityManager,
      trackingManager: !!global.trackingManager,
      config: !!config,
      global: !!global
    });

    const reportsIPCHandlers = new ReportsIPCHandlers({
      ipcMain,
      supabaseService: global.supabaseService,
      activityManager: global.activityManager,
      trackingManager: global.trackingManager,
      config,
      global
    });

    console.log('🔧 [MAIN] ReportsIPCHandlers instance created, registering handlers...');
    reportsIPCHandlers.registerHandlers();
    console.log('✅ [MAIN] Reports IPC handlers registered successfully');

    console.log('✅ IPC handlers module initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize IPC handlers module:', error);
    console.error('❌ Stack trace:', error.stack);

    // Fallback: Register a minimal reports handler to prevent errors (only if not already registered)
    console.log('🔄 [MAIN] Registering fallback reports handler...');
    try {
      ipcMain.handle('reports:get-tracking-snapshot', async (event, options = {}) => {
        console.log('⚠️ [FALLBACK] Using fallback reports handler');
        return {
          success: false,
          error: 'Reports service not available',
          data: {
            session: { isTracking: false, isPaused: false, isIdle: false },
            stats: { mouseMoves: 0, keyPresses: 0, mouseClicks: 0, activeSeconds: 0, updatedAt: new Date().toISOString() },
            security: { screenPermOk: true, antiCheatFlags: [], updatedAt: new Date().toISOString() },
            logs: { items: [], hasMore: false, updatedAt: new Date().toISOString() },
            network: { offlineQueue: 0, isOnline: true }
          }
        };
      });
      console.log('✅ [MAIN] Fallback reports handler registered');
    } catch (fallbackError) {
      console.log('ℹ️ [MAIN] Reports handler already registered, skipping fallback');
    }
  }

  // Employee login/logout handlers
  ipcMain.on('user-logged-in', (event, user) => {
    console.log('👤 User logged in:', user.email);
    // Set the user for activity monitoring
    // Auto-start activity monitoring when user logs in
    if (user.id) {
      console.log('🚀 Starting activity monitoring for user:', user.id);
      // The activity monitoring is already running from config, just need to associate with user
    }
  });

  // REMOVED: Duplicate user-logged-out handler - this is now properly handled in ipc-handlers.js
  // The handler in ipc-handlers.js manages logout through sessionManager without calling stopTracking()
  // which was causing unwanted "Time tracking stopped" notifications during login

  // Activity monitoring handlers
  ipcMain.on('start-activity-monitoring', (event, userId) => {
    console.log('📊 Starting activity monitoring for user:', userId);
    // Activity monitoring is already running, just associate with user
  });

  // get-activity-stats handler moved to modules/ipc-handlers.js

  // get-activity-stats-from-db handler moved to modules/ipc/database-activity-manager.js

  // get-anti-cheat-report handler moved to modules/ipc-handlers.js

  // get-anti-cheat-report-from-db handler moved to modules/ipc/database-activity-manager.js

  // IPC handlers moved to modules/utils/ipc-handlers-manager.js
  const IPCHandlersManager = require('./modules/utils/ipc-handlers-manager');
  const path = require('path');
  const configPath = path.join(__dirname, '..', 'config.json');
  const ipcHandlersManager = new IPCHandlersManager({
    ipcMain,
    resumeTracking,
    stopTracking,
    appSettings,
    antiCheatDetector,
    AntiCheatDetector,
    syncManager,
    config,
    configPath,
    offlineQueue,
    captureScreenshot,
    forceUpdater: global.forceUpdater || null
  });

  // Register all IPC handlers
  ipcHandlersManager.registerAllHandlers();



  // is-tracking handler moved to modules/ipc/core-ipc-manager.js

  // === FIXED CAPTURE FUNCTIONS ===
  async function captureActiveApplication() {
    try {
      // Use our new enhanced detection instead of activeWin
      const activeApp = await detectActiveApplication();
      if (!activeApp) return null;

      const appData = {
        user_id: config.user_id || 'demo-user',
        time_log_id: currentTimeLogId,
        app_name: activeApp.name || 'Unknown', // Fixed: use app_name instead of application_name
        window_title: activeApp.title || 'Unknown',
        app_path: activeApp.bundleId || null,
        timestamp: new Date().toISOString() // Fixed: use timestamp instead of captured_at
      };

      // Add to offline queue
      offlineQueue.appLogs.push(appData);
      console.log(`📱 App captured: ${appData.app_name}`);
      return appData;
    } catch (error) {
      throw error;
    }
  }

  async function captureActiveUrl() {
    try {
      // Use our new enhanced URL detection instead of activeWin
      const urlData = await detectBrowserUrl();
      if (!urlData) return null;

      const validUserId = config.user_id;
      if (!validUserId) {
        console.error('🚨 BLOCKING URL LOG: No authenticated user - preventing user ID mismatch');
        return null;
      }

      const { canonicalizeUrl } = require('./modules/utils/url-utils');
      const urlLogData = {
        user_id: validUserId,
        time_log_id: currentTimeLogId,
        site_url: canonicalizeUrl(urlData.url),
        title: urlData.title,
        domain: urlData.domain,
        browser: urlData.browser,
        timestamp: new Date().toISOString() // Fixed: use timestamp instead of captured_at
      };

      // Add to offline queue
      offlineQueue.urlLogs.push(urlLogData);
      console.log(`🌐 URL captured: ${urlLogData.domain}`);
      return urlLogData;
    } catch (error) {
      throw error;
    }
  }

  // === APP LIFECYCLE ===
  if (isElectronContext && app) {
    // === SINGLE INSTANCE LOCK - PREVENT DUPLICATE DESKTOP AGENTS ===
    console.log('🔒 Checking for existing Alyson WorkTime Agent instance...');

    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
      console.log('❌ Another Alyson WorkTime Agent instance is already running - quitting immediately');
      // CRITICAL FIX: Do NOT schedule any async work (setTimeout, input detection, etc.)
      // The second instance must exit immediately without creating any resources
      // The first instance already has everything initialized
      app.quit();
      return;
    } else {
      console.log('✅ Single instance lock acquired - proceeding with Desktop Agent startup');
    }

    // ================================
    // DISABLE AUTO-START ON STARTUP
    // ================================
    // Ensure the app never auto-launches at Windows/macOS startup
    // This removes any stale registry entries that may have been set during development
    try {
      if (app.setLoginItemSettings) {
        // Explicitly disable auto-launch for all platforms
        app.setLoginItemSettings({
          openAtLogin: false,
          openAsHidden: false
        });
        console.log('✅ [AUTO-START] Disabled - app will only run when manually launched');
        
        // On Windows, also clean up any stale registry entries with wrong names
        if (process.platform === 'win32') {
          const { exec } = require('child_process');
          // Remove any stale entries that might have been created with wrong app names
          const staleKeys = ['vite_react_shadcn_ts', 'time-flow-admin', 'alyson-pms', 'alyson-time-doctor', 'alyson-work-time-agent'];
          staleKeys.forEach(keyName => {
            exec(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${keyName}" /f`, (error) => {
              if (!error) {
                console.log(`🧹 [AUTO-START] Removed stale registry entry: ${keyName}`);
              }
            });
          });
        }
      }
    } catch (error) {
      console.log('⚠️ [AUTO-START] Could not disable auto-start:', error.message);
    }

    // PERFORMANCE FIX: Second-instance handler
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      console.log('🔔 Second Desktop Agent instance detected (debounced)');

      try {
        // Focus the existing window if it exists
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();

          // Ensure window is brought to front on all platforms
          if (process.platform === 'darwin') {
            app.focus();
          }

          // Show notification that desktop agent is already running
          // FIX: Wait for app to be ready before creating notification
          if (app.isReady()) {
            const notification = new Notification({
              title: 'Alyson PM Agent',
              body: 'Desktop Agent is already running and has been brought to the front.',
              silent: false
            });
            notification.show();
          }
        } else if (tray) {
          // If no window but tray exists, show notification
          const notification = new Notification({
            title: 'Alyson PM Agent',
            body: 'Desktop Agent is already running in the system tray.',
            silent: false
          });
          notification.show();
        }
      } catch (error) {
        console.error('❌ Error in second instance handler:', error);
      }
    });
  }

  // === FORCE UPDATE INTEGRATION ===
  let forceUpdater = null;
  global.forceUpdater = forceUpdater;

  // ================================
  // IMMEDIATE REAL-TIME INPUT DETECTION
  // ================================

  // Large commented input detection block removed - functionality moved to consolidated modules

  // ================================
  // SIMPLE BACKUP DETECTION SYSTEM
  // ================================

  function initializeSimpleBackupDetection() {
    console.log('🔄 [BACKUP] Initializing simple backup activity detection...');

    // Initialize activity stats if not exists
    if (!global.displayActivityStats) {
      global.displayActivityStats = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
      console.log('🔄 [BACKUP] Created global.displayActivityStats');
    }

    if (!betweenScreenshotsActivity) {
      betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
      console.log('🔄 [BACKUP] Created betweenScreenshotsActivity');
    }

    // User-only mode: disable backup PowerMonitor activity classification to avoid ghost input.
    if (powerMonitor && powerMonitor.on) {
      console.log('🚫 [BACKUP] PowerMonitor input classification disabled (user-only mode)');
    } else {
      console.log('❌ [BACKUP] PowerMonitor not available');
    }


  }

  // ================================
  // IMPROVED INPUT DETECTION SYSTEM
  // ================================


  // ================================
  // REAL INPUT DETECTION FIX - APPLIED
  // ================================
  // [REMOVED: Duplicate RealInputDetector class]
  // Initialize real input detector
  let realInputDetector = null;

  function initializeRealInputDetection() {
    if (realInputDetector) return;

    // DISABLED: Conflicting input detector - use RealOSInputDetector only
    console.log('🚫 [DISABLED] RealInputDetector disabled - using RealOSInputDetector only');
    return;
  }

  // Start real input detection when tracking begins
  function startRealInputTracking() {
    if (!realInputDetector) {
      initializeRealInputDetection();
    }
  }

  // ============================================================================
  // SCREENSHOT STARTUP FIX - Ensures screenshot system starts reliably
  // ============================================================================

  function ensureScreenshotSystemStarts() {
    console.log('📸 [FIX] Ensuring screenshot system starts...');

    if (!isTracking || !currentSession) {
      console.log('❌ [FIX] Cannot start screenshots - not tracking');
      return false;
    }

    // Clear existing timer
    if (screenshotInterval) {
      clearTimeout(screenshotInterval);
      screenshotInterval = null;
      console.log('🧹 [FIX] Cleared existing screenshot interval');
    }
    global.nextScreenshotTime = null;
    console.log('🧹 [FIX] Reset global.nextScreenshotTime');

    // Try multiple methods
    let attemptSuccess = false;

    if (wrappers && wrappers.scheduleRandomScreenshot) {
      console.log('📸 [FIX] Method 1: Using wrappers.scheduleRandomScreenshot()');
      try {
        wrappers.scheduleRandomScreenshot();
        attemptSuccess = true;
        console.log('✅ [FIX] Method 1: Wrapper executed successfully');
      } catch (error) {
        console.error('❌ [FIX] Method 1 failed:', error.message);
      }
    } else {
      console.log('⚠️ [FIX] Method 1: wrappers.scheduleRandomScreenshot not available');
    }

    // Additional fallback: use consolidated screenshots if available
    if (!attemptSuccess && consolidationFixes && consolidationFixes.scheduleScreenshots) {
      try {
        console.log('📸 [FIX] Method 2: Using consolidationFixes.scheduleScreenshots()');
        consolidationFixes.scheduleScreenshots(getInterval('SCREENSHOT_INTERVAL_SECONDS') || 240);
        attemptSuccess = true;
        console.log('✅ [FIX] Method 2: Consolidated scheduler executed successfully');
      } catch (error) {
        console.error('❌ [FIX] Method 2 failed:', error.message);
      }
    }

    if (!attemptSuccess && typeof scheduleRandomScreenshot === 'function') {
      console.log('📸 [FIX] Method 2: Using global scheduleRandomScreenshot()');
      try {
        scheduleRandomScreenshot();
        attemptSuccess = true;
        console.log('✅ [FIX] Method 2: Global function executed successfully');
      } catch (error) {
        console.error('❌ [FIX] Method 2 failed:', error.message);
      }
    } else if (!attemptSuccess) {
      console.log('⚠️ [FIX] Method 2: global scheduleRandomScreenshot not available');
    }

    // Verify after 3 seconds
    setTimeout(() => {
      console.log('🔍 [FIX] Verifying screenshot timer after startup attempt...');

      if (global.nextScreenshotTime) {
        const timeLeft = Math.max(0, Math.floor((global.nextScreenshotTime.getTime() - Date.now()) / 1000));
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;

        console.log(`✅ [FIX] SUCCESS! global.nextScreenshotTime set successfully`);
        console.log(`📅 [FIX] Next screenshot in: ${minutes}:${seconds.toString().padStart(2, '0')}`);
        console.log(`⏰ [FIX] Scheduled for: ${global.nextScreenshotTime.toLocaleTimeString()}`);

        // Update UI immediately
        if (mainWindow && !mainWindow.isDestroyed()) {
          const updateData = {
            nextScreenshotTime: global.nextScreenshotTime.toISOString(),
            secondsToNext: timeLeft,
            totalActivity: 0,
            mouseClicks: 0,
            keystrokes: 0,
            mouseMovements: 0,
            startupFix: true
          };

          mainWindow.webContents.send('next-screenshot-update', updateData);
          console.log('📡 [FIX] Sent immediate timer update to renderer');
        }

        return true;
      } else {
        console.log('❌ [FIX] FAILED! global.nextScreenshotTime was NOT set after attempts');
        // REMOVED: Emergency fallback timer - window-based 3-per-10-min logic in enhanced-screenshot-manager is the single source
        // The window-based scheduler will self-heal via its heartbeat diagnostics
        console.log('ℹ️ [FIX] Relying on window-based scheduler heartbeat for recovery');
        return false;
      }
    }, 3000); // Wait 3 seconds for async operations

    return attemptSuccess;
  }

  // Add to existing tracking functions - wrap the delegate function
  (() => {
    const delegateStartTracking = global.startTracking; // Save reference to the delegate function
    global.startTracking = async function (projectId = null) {
      console.log('🔥 [WRAPPER] global.startTracking called with projectId:', projectId);

      // CRITICAL FIX: Ensure URL system is running when tracking starts
      try {
        if (global.urlCaptureManager && !global.urlCaptureManager.isRunning) {
          global.urlCaptureManager.start();
          console.log('🌐 [WRAPPER] Started UrlCaptureManager with tracking');
        } else if (!global.urlCaptureManager) {
          console.warn('⚠️ [WRAPPER] UrlCaptureManager not found during tracking start');
        }
      } catch (e) {
        console.error('❌ [WRAPPER] Failed to start URL system with tracking:', e);
      }
      console.log('🔍 [WRAPPER DEBUG] delegateStartTracking:', typeof delegateStartTracking);
      console.log('🔍 [WRAPPER DEBUG] global.trackingManager exists:', !!global.trackingManager);
      console.log('🔍 [WRAPPER DEBUG] global.enhancedAppDetector exists:', !!global.enhancedAppDetector);
      console.log('🔍 [WRAPPER DEBUG] global.appDetectionHooks exists:', !!global.appDetectionHooks);

      // CRITICAL FIX: Initialize and start input detection BEFORE tracking
      console.log('🎯 [WRAPPER] Checking input detection system...');
      try {
        // Only initialize if not already initialized
        if (!global.globalInputManager || !global.globalInputManager.isActive) {
          console.log('🎮 [WRAPPER] Initializing input detection system...');
          await initializeInputDetectionSystem();
          console.log('✅ [WRAPPER] Input detection system initialized');
        } else {
          console.log('✅ [WRAPPER] Input detection already active');
        }

        // Start input detection if available
        if (global.startInputDetection) {
          await global.startInputDetection();
          console.log('✅ [WRAPPER] Input detection started');
        }
      } catch (error) {
        console.error('❌ [WRAPPER] Input detection initialization failed:', error);
      }

      const result = await delegateStartTracking.apply(this, arguments);

      // 🔧 FIX: Start app detection when tracking starts
      if (result && result.success !== false && global.appDetectionHooks?.onTrackingStart) {
        console.log('📱 [WRAPPER] Starting app detection for tracking session...');
        console.log('🔍 [WRAPPER DEBUG] Calling appDetectionHooks.onTrackingStart with projectId:', projectId);
        try {
          global.appDetectionHooks.onTrackingStart(projectId);
        } catch (error) {
          console.error('❌ [WRAPPER] Failed to start app detection:', error.message);
        }
      } else {
        console.log('⚠️ [WRAPPER] App detection NOT started. Result:', result, 'Hooks available:', !!global.appDetectionHooks);
      }

      // Start URL capture manager when tracking starts
      if (result && result.success !== false && global.urlCaptureManager) {
        console.log('🌐 [WRAPPER] Starting URL capture for tracking session...');
        try {
          global.urlCaptureManager.start();
          console.log('✅ [URL] UrlCaptureManager started with tracking');
        } catch (error) {
          console.error('❌ [WRAPPER] Failed to start URL capture:', error.message);
        }
      }

      // Start real input tracking (legacy function for backup)
      if (typeof startRealInputTracking === 'function') {
        startRealInputTracking();
      }

      // SCREENSHOT FIX: Ensure screenshot system starts after tracking
      if (result && result.success !== false) {
        console.log('📸 [WRAPPER] Tracking started successfully, ensuring screenshot system...');

        // Multiple attempts with increasing delays to ensure reliability
        setTimeout(() => {
          if (global.isTracking && global.currentSession) {
            console.log('📸 [WRAPPER] Screenshot startup attempt 1 (3s delay)');
            ensureScreenshotSystemStarts();
          }
        }, 3000);

        setTimeout(() => {
          if (global.isTracking && global.currentSession && !global.nextScreenshotTime) {
            console.log('📸 [WRAPPER] Screenshot startup attempt 2 (8s delay) - fallback');
            ensureScreenshotSystemStarts();
          }
        }, 8000);

        setTimeout(() => {
          if (global.isTracking && global.currentSession && !global.nextScreenshotTime) {
            console.log('📸 [WRAPPER] Screenshot startup attempt 3 (15s delay) - final fallback');
            ensureScreenshotSystemStarts();
          }
        }, 15000);

        // Health check after 20 seconds
        setTimeout(() => {
          if (global.isTracking && global.currentSession) {
            if (global.nextScreenshotTime) {
              console.log('✅ [WRAPPER] Screenshot system confirmed working after 20s');
            } else {
              console.log('❌ [WRAPPER] Screenshot system still not working after 20s');
              console.log('🔧 [WRAPPER] Manual intervention may be required');
            }
          }
        }, 20000);
      }

      return result;
    };
  })(); // Execute the IIFE to set up the wrapper


  console.log('✅ Screenshot startup fix loaded successfully!');

  // Load force screenshot functionality
  try {
    require('./force-screenshot.js');
    console.log('✅ Force screenshot functions loaded!');
    console.log('   📸 Use forceScreenshot() to capture immediately');
    console.log('   ⚙️ Use updateScreenshotTiming() for 3 per 10 min');
  } catch (error) {
    console.log('⚠️ Could not load force screenshot functions:', error.message);
  }

  // Load screenshot activity fix
  try {
    require('./fix-screenshot-activity.js');
    console.log('✅ Screenshot activity fix loaded!');
    console.log('   📊 Use syncActivityData() to sync activity');
    console.log('   📸 Use forceScreenshotWithActivity() to capture with activity');
  } catch (error) {
    console.log('⚠️ Could not load screenshot activity fix:', error.message);
  }

  // ================================
  // END REAL INPUT DETECTION FIX
  // ================================

  // Enhanced mouse tracking with real click detection
  let mouseTrackingStats = {
    clicks: 0,
    movements: 0,
    lastPosition: { x: 0, y: 0 },
    lastMovementTime: 0,
    lastClickTime: 0,
    rapidMovements: [],
    activityPattern: []
  };

  // Real-time mouse position tracking
  let realTimeMouseTracker;

  function startImprovedMouseTracking() {
    // DISABLED: All fake improved mouse tracking removed
    console.log('🚫 [DISABLED] Fake improved mouse tracking disabled - use real OS-level detection only');
    return;
  }

  // detectClickFromMovementPattern removed - fake click detection disabled

  // recordEnhancedClick removed - fake click detection disabled

  // Enhanced PowerMonitor integration with better activity classification
  function setupEnhancedPowerMonitorDetection() {
    if (!powerMonitor || !powerMonitor.on) return;

    // PowerMonitor detection now handled by Enhanced Input Detector
    console.log('🔋 PowerMonitor detection delegated to Enhanced Input Detector');
  }

  // setupIdleRecoveryDetection removed - fake detection disabled

  // initializeImprovedInputDetection removed - fake detection disabled

  // CONSOLIDATED: Input detection is now handled by consolidationFixes


  // DISABLED: Input detection deferral - using immediate detection for screenshot activity monitor
  // console.log('⏸️ Input detector initialization deferred until tracking starts');

  // PowerMonitor detection now handled by Enhanced Input Detector only
  console.log('⚠️ PowerMonitor events delegated to Enhanced Input Detector to avoid conflicts');

  // Settings fetching and notification checking will be handled in initializeComponents()

  // Check permissions on startup (after a delay to ensure UI is ready)
  setTimeout(async () => {
    if (process.platform === 'darwin') {
      const currentPermission = systemPreferences.getMediaAccessStatus('screen');

      if (currentPermission !== 'granted') {
        safeLog('🔒 Startup permission check: Screen Recording not granted');
        safeLog('📋 App and URL capture features will be limited until permissions are granted');

        // Show a subtle notification about enhanced features
        showTrayNotification(
          'Enhanced tracking features available - App and URL capture can be enabled through System Settings',
          'info'
        );
      } else {
        safeLog('✅ Startup permission check: Screen Recording permission already granted');
      }
    }
  }, 3000);

  // 🚨 DISABLED: Auto-start tracking until proper onboarding is completed
  // First-time users must complete permission setup and onboarding
  if (appSettings.auto_start_tracking) {
    setTimeout(() => {
      if (!isTracking) {
        console.log('🚨 [AUTO-START] BLOCKED: Auto-start disabled until onboarding complete');
        console.log('🚨 [AUTO-START] User must manually start timer after permission setup');
        // safeLog('🚀 Auto-starting tracking after 5 second delay...');
        // startTracking();
      } else {
        safeLog('⚠️ Auto-start skipped - tracking already active');
      }
    }, 5000);
  }

  // Global shortcuts will be registered after app is ready

  // === PERFORMANCE MONITORING ===
  // Performance monitoring moved to modules/utils/performance-monitoring-manager.js
  // Will be initialized after app is ready

  // Global permission shortcut will be registered after app is ready

  safeLog('✅ Alyson PM Agent ready');
  safeLog('🔬 Debug Console: Right-click tray icon → Debug Console, or press Ctrl+Shift+D');
  safeLog('🔒 Permission Request: Press Ctrl+Shift+P to manage screen recording permissions');

  // === INITIALIZE CENTRALIZED SYSTEM MONITOR ===
  console.log('🔬 [SYSTEM-MONITOR] Initializing centralized monitoring...');

  // Start periodic health checks (every 5 minutes)
  systemMonitor.startPeriodicHealthCheck(300000);

  // === NEW USER PERMISSION ONBOARDING ===
  // Check if this is a first-time user or if accessibility permission is missing
  const isFirstTime = !fs.existsSync(path.join(os.homedir(), '.timeflow-setup-complete'));

  if (isFirstTime || process.platform === 'darwin') {
    console.log('🆕 [USER-ONBOARDING] Checking permission setup for new/returning user...');

    // Brief delay to ensure main window is ready
    setTimeout(async () => {
      try {
        // Check current accessibility status
        const hasAccessibility = (process.platform === 'darwin' && systemPreferences && typeof systemPreferences.isTrustedAccessibilityClient === 'function')
          ? systemPreferences.isTrustedAccessibilityClient(false)
          : true;

        if (!hasAccessibility) {
          console.log('🔐 [USER-ONBOARDING] Accessibility permission missing, prompting user...');
          // Trigger native macOS Accessibility permission dialog
          // Pass true to isTrustedAccessibilityClient to show the system prompt
          // This is needed for keyboard/mouse activity detection (replaces old Input Monitoring)
          try {
            systemPreferences.isTrustedAccessibilityClient(true);
            console.log('🔐 [USER-ONBOARDING] Accessibility permission prompt shown');
          } catch (permErr) {
            console.warn('⚠️ [USER-ONBOARDING] Could not prompt for Accessibility:', permErr.message);
          }
        } else {
          console.log('✅ [USER-ONBOARDING] Accessibility permission already granted');
        }

        // Mark setup as complete
        if (isFirstTime) {
          fs.writeFileSync(path.join(os.homedir(), '.timeflow-setup-complete'), new Date().toISOString());
          console.log('🎉 [USER-ONBOARDING] First-time setup marked as complete');
        }
      } catch (error) {
        console.log('⚠️ [USER-ONBOARDING] Permission check failed:', error.message);
      }
    }, 3000); // 3 second delay for UI readiness
  }

  // Initial health check
  systemMonitor.performComprehensiveHealthCheck().then(initialHealth => {
    console.log(`🏥 [SYSTEM-MONITOR] Initial health check: ${initialHealth.overall.toUpperCase()}`);

    if (initialHealth.issues.length > 0) {
      console.log(`⚠️ [SYSTEM-MONITOR] Found ${initialHealth.issues.length} issues:`, initialHealth.issues);
    }
  }).catch(error => {
    console.error('❌ [SYSTEM-MONITOR] Initial health check failed:', error);
  });

  console.log('✅ [SYSTEM-MONITOR] Centralized monitoring initialized');

  // URL capture now defers until tracking is active (handled inside BrowserUrlManager)
  console.log('🌐 [STARTUP] URL capture will start when tracking becomes active');

  // Initialize force updater and check for updates before starting app
  if (isElectronContext) {
    app.whenReady().then(() => {
      // === MEMORY OPTIMIZATION: Periodic GC hint ===
      // Suggests V8 garbage collection every 5 minutes to reclaim leaked memory
      // This is a non-blocking hint — V8 may ignore it if not needed
      setInterval(() => {
        if (typeof global.gc === 'function') {
          const before = process.memoryUsage().heapUsed;
          global.gc();
          const after = process.memoryUsage().heapUsed;
          const freedMB = ((before - after) / 1024 / 1024).toFixed(1);
          console.log(`🧹 [MEMORY] GC hint executed, freed ~${freedMB}MB (heap: ${(after / 1024 / 1024).toFixed(1)}MB)`);
        }
      }, 5 * 60 * 1000); // Every 5 minutes

      // === MEMORY PROFILER INITIALIZATION ===
      // PERFORMANCE NOTE: Memory profiler is DISABLED by default to prevent battery drain
      // It polls every 5 seconds and writes to disk, causing significant overhead
      // Only enable for debugging by setting MEM_PROFILER=1
      if (process.env.MEM_PROFILER === '1') {
        try {
          try {
            console.log('[MEMORY-PROFILER] Initializing memory profiler...');
          } catch (logError) {
            // Silently handle EPIPE and other console errors
            if (logError.code !== 'EPIPE') {
              try {
                process.stderr.write(`[MEMORY-PROFILER] Init log error: ${logError.message}\n`);
              } catch { }
            }
          }

          const { startMemoryProfiler } = require('./diagnostics/memoryProfiler');

          const memProfilerOptions = {
            intervalMs: Number(process.env.MEM_INTERVAL_MS) || 5000,
            csv: process.env.MEM_CSV === '1',
            exposeGC: process.env.EXPOSE_GC === '1'
          };

          try {
            console.log('[MEMORY-PROFILER] Options:', memProfilerOptions);
          } catch (logError) {
            // Silently handle EPIPE and other console errors
            if (logError.code !== 'EPIPE') {
              try {
                process.stderr.write(`[MEMORY-PROFILER] Options log error: ${logError.message}\n`);
              } catch { }
            }
          }

          startMemoryProfiler(memProfilerOptions);

          try {
            console.log('[MEMORY-PROFILER] Memory profiler started successfully');
          } catch (logError) {
            // Silently handle EPIPE and other console errors
            if (logError.code !== 'EPIPE') {
              try {
                process.stderr.write(`[MEMORY-PROFILER] Success log error: ${logError.message}\n`);
              } catch { }
            }
          }
        } catch (error) {
          try {
            console.error('[MEMORY-PROFILER] Failed to initialize:', error);
          } catch (logError) {
            // Silently handle EPIPE and other console errors
            if (logError.code !== 'EPIPE') {
              try {
                process.stderr.write(`[MEMORY-PROFILER] Error logging failed: ${logError.message}\n`);
              } catch { }
            }
          }
        }
      }

      // === PERFORMANCE MONITOR INITIALIZATION ===
      if (process.env.PERF_MONITOR === '1') {
        try {
          try {
            console.log('[PERF-MONITOR] Initializing performance monitor...');
          } catch (logError) {
            // Silently handle EPIPE and other console errors
            if (logError.code !== 'EPIPE') {
              try {
                process.stderr.write(`[PERF-MONITOR] Init log error: ${logError.message}\n`);
              } catch { }
            }
          }

          const { startPerformanceMonitor, getPerformanceMonitor } = require('./diagnostics/performanceMonitor');

          const perfMonitorOptions = {
            enabled: true
          };

          startPerformanceMonitor(perfMonitorOptions);

          // Make Performance Monitor globally accessible
          global.performanceMonitor = getPerformanceMonitor();

          try {
            console.log('[PERF-MONITOR] Performance monitor started successfully');
          } catch (logError) {
            // Silently handle EPIPE and other console errors
            if (logError.code !== 'EPIPE') {
              try {
                process.stderr.write(`[PERF-MONITOR] Success log error: ${logError.message}\n`);
              } catch { }
            }
          }
        } catch (error) {
          try {
            console.error('[PERF-MONITOR] Failed to initialize:', error);
          } catch (logError) {
            if (logError.code !== 'EPIPE') {
              try {
                process.stderr.write(`[PERF-MONITOR] Error logging failed: ${logError.message}\n`);
              } catch { }
            }
          }
        }
      }

      // Robust startup lock to prevent race conditions (defined here to access startMainApplication)
      async function acquireStartupLock() {
        if (mainApplicationStarting || mainApplicationStarted) {
          console.log('⚠️ [MAIN] Startup already in progress or completed');
          return false;
        }

        mainApplicationStarting = true;
        console.log('🔒 [MAIN] Acquired startup lock');

        try {
          // Execute startup
          await startMainApplication();

          mainApplicationStarted = true;
          mainApplicationStarting = false;
          console.log('✅ [MAIN] Startup lock completed successfully');
          return true;
        } catch (error) {
          mainApplicationStarting = false;
          console.error('❌ [MAIN] Startup lock failed:', error);
          throw error;
        }
      }

      // Define startMainApplication inside app.whenReady to have access to Electron modules
      async function startMainApplication() {
        try {
          const StartupManager = require('./modules/core/startup-manager');
          const startupManager = new StartupManager(
            { app, BrowserWindow, screen, powerMonitor, systemPreferences, ipcMain, desktopCapturer, Tray, Menu, Notification },
            { supabaseService, cleanupRegistry, wrappers, sessionManager }
          );

          global.startupManager = startupManager;
          await startupManager.startMainApplication();

          // Mark that main application started successfully
          mainApplicationStarted = true;

          // Ensure consolidated systems are initialized for screenshots/URL/input
          if (!consolidatedSystemsInitialized && consolidationFixes && consolidationFixes.initializeAllConsolidatedSystems) {
            try {
              await consolidationFixes.initializeAllConsolidatedSystems({
                electronModules: { app, BrowserWindow, screen, powerMonitor, systemPreferences, desktopCapturer },
                configManager: { getConfig: () => config },
                syncManager,
                detectActiveApplication,
                extractUrlFromBrowser,
                detectBrowserUrl,
                isBrowserApp: (name) => ['Chrome', 'Safari', 'Firefox', 'Edge'].some(b => (name || '').includes(b)),
                extractDomain: (url) => { try { return new URL(url).hostname; } catch { return 'unknown'; } },
                processFoundUrl
              });
              consolidatedSystemsInitialized = true;
              console.log('✅ Consolidated systems initialized');
            } catch (e) {
              console.error('❌ Failed to initialize consolidated systems:', e);
            }
          }

          // CRITICAL FIX: Initialize URL tracking system at startup
          try {
            console.log('🚀 [STARTUP] Initializing URL tracking system...');
            if (!global.urlCaptureManager) {
              const { UrlCaptureManager } = require('./modules/url/UrlCaptureManager.js');
              global.urlCaptureManager = new UrlCaptureManager({
                debugLogging: process.env.DEBUG_URL === '1',
                debounceMs: 250,
                minSliceSec: 5,
                maxEventsPerSec: 1,
                privacy: {
                  redactQueryParams: true,
                  redactHashFragments: true,
                  detectIncognito: true
                },
                skipInternalUrls: true,
                enabled: process.env.URL_PIPELINE_V2_ENABLED !== 'false'
              });
              console.log('✅ [STARTUP] UrlCaptureManager created successfully');

              // CRITICAL: Attach event handler IMMEDIATELY before starting
              console.log('🔧 [STARTUP] Attaching URL event handler...');
              global.urlCaptureManager.on('url', (evt) => {
                try {
                  console.log('\n═══════════════════════════════════════════════════════════');
                  console.log('🌐 [URL-STEP-1] EVENT RECEIVED');
                  console.log('   URL:', evt?.url);
                  console.log('   Browser:', evt?.browser);
                  console.log('   Time:', new Date(evt?.ts).toLocaleTimeString());

                  // Check user session
                  const session = global.sessionManager?.getCurrentSession() || global.currentSession;
                  const userId = session?.user?.id || session?.user_id || global.currentUserId;

                  if (!userId) {
                    console.log('❌ [URL-STEP-2-FAIL] No user logged in - URL NOT saved');
                    console.log('═══════════════════════════════════════════════════════════\n');
                    return;
                  }

                  console.log('✓ [URL-STEP-2] User:', userId.substring(0, 8) + '...');

                  // CRITICAL: Block internal URLs BEFORE processing
                  // FIXED: Use startsWith() for protocols to prevent false positives
                  // (e.g., "blob:" was matching "bitbucket.org")
                  const urlToCheck = evt?.url || evt?.site_url || '';
                  if (urlToCheck) {
                    const urlLower = urlToCheck.toLowerCase();
                    
                    // Protocol patterns - must be at start of URL
                    const protocolPatterns = [
                      'file://',
                      'chrome://',
                      'chrome-extension://',
                      'about:',
                      'edge://',
                      'brave://',
                      'vivaldi://',
                      'moz-extension://',
                      'view-source:',
                      'data:', // Data URLs
                      'blob:'  // Blob URLs
                    ];

                    // Check protocol patterns
                    let isInternal = false;
                    for (const pattern of protocolPatterns) {
                      if (urlLower.startsWith(pattern)) {
                        isInternal = true;
                        break;
                      }
                    }

                    // Domain/host patterns - check within URL context
                    if (!isInternal) {
                      const hostPatterns = ['localhost', '127.0.0.1', '[::1]', 'app.ebdaatech.com', 'ebdaatech.com'];
                      for (const pattern of hostPatterns) {
                        if (urlLower.includes('://' + pattern) || 
                            urlLower.includes('/' + pattern + '/') ||
                            urlLower.includes('/' + pattern + ':')) {
                          isInternal = true;
                          break;
                        }
                      }
                    }

                    if (isInternal) {
                      console.log('❌ [URL-STEP-2-BLOCK] BLOCKED internal URL:', urlToCheck.substring(0, 60));
                      console.log('═══════════════════════════════════════════════════════════\n');
                      return; // Stop processing - don't save to database
                    }
                  }

                  // Get time_log_id from multiple sources
                  const timeLogIdFromManager = global.trackingManager?.currentTimeLogId;
                  const timeLogIdFromGlobal = global.currentTimeLogId;
                  const finalTimeLogId = timeLogIdFromManager || timeLogIdFromGlobal || null;

                  if (!finalTimeLogId) {
                    console.log('⚠️  [URL-STEP-3-WARN] Tracking NOT active (time_log_id is NULL)');
                    console.log('   → URL detected but NOT saved to database');
                    console.log('   → Start tracking first!');
                    console.log('═══════════════════════════════════════════════════════════\n');
                    return;
                  }

                  console.log('✓ [URL-STEP-3] Tracking active (session:', finalTimeLogId, ')');

                  const payload = {
                    organization_id: null,
                    user_id: userId,
                    device_id: null,
                    time_log_id: finalTimeLogId,
                    site_url: evt?.url || null,
                    domain: (() => { try { return evt?.url ? new URL(evt.url).hostname : null; } catch { return null; } })(),
                    title: evt?.title || '',
                    browser: evt?.browser || evt?.source || 'unknown',
                    confidence: evt?.confidence || 'high',
                    privacy_flags: evt?.privacyFlags || null,
                    started_at: new Date((evt && evt.ts) ?? Date.now()).toISOString(),
                    ended_at: null
                  };

                  console.log('✓ [URL-STEP-4] Domain:', payload.domain);

                  let queued = false;
                  if (global.enhancedSyncManager && global.enhancedSyncManager.addToQueue) {
                    try {
                      const result = global.enhancedSyncManager.addToQueue('urlLogs', [payload]);
                      if (result) {
                        queued = true;
                        console.log('✅ [URL-STEP-5] SAVED to queue successfully');
                        console.log('═══════════════════════════════════════════════════════════\n');
                      }
                    } catch (error) {
                      console.log('❌ Queue error:', error.message);
                    }
                  }

                  // Fallback to direct database
                  if (!queued) {
                    if (global.supabaseService && typeof global.supabaseService.from === 'function') {
                      try {
                        global.supabaseService.from('app_url_activity').insert([payload]).then(({ error }) => {
                          if (error) {
                            console.log('❌ [URL-STEP-5] Database error:', error.message);
                            console.log('═══════════════════════════════════════════════════════════\n');
                          } else {
                            console.log('✅ [URL-STEP-5] SAVED to database successfully');
                            console.log('═══════════════════════════════════════════════════════════\n');
                          }
                        });
                      } catch (e) {
                        console.log('❌ [URL-STEP-5] Save error:', e.message);
                        console.log('═══════════════════════════════════════════════════════════\n');
                      }
                    } else {
                      console.log('❌ [URL-STEP-5] No save mechanism available!');
                      console.log('═══════════════════════════════════════════════════════════\n');
                    }
                  }
                } catch (handlerError) {
                  console.error('❌ [URL] Event handler error:', handlerError?.message || handlerError);
                }
              });
              console.log('✅ [STARTUP] URL event handler attached');
              global.primaryUrlEventHandlerAttached = true;

              // CRITICAL: Start the URL capture manager immediately!
              console.log('🚀 [STARTUP] Starting UrlCaptureManager...');
              global.urlCaptureManager.start();
              console.log('✅ [STARTUP] UrlCaptureManager started and polling!');
            } else {
              console.log('✅ [STARTUP] UrlCaptureManager already exists');
              // Ensure it's running
              if (!global.urlCaptureManager.isRunning) {
                console.log('🚀 [STARTUP] Starting existing UrlCaptureManager...');
                global.urlCaptureManager.start();
                console.log('✅ [STARTUP] UrlCaptureManager started!');
              }
            }
          } catch (error) {
            console.error('❌ [STARTUP] Failed to initialize URL tracking system:', error);
          }

          // CRITICAL FIX: Initialize input detection system at startup
          try {
            console.log('🚀 [STARTUP] Initializing input detection system...');
            await initializeInputDetectionSystem();
            console.log('✅ [STARTUP] Input detection system initialized successfully');
          } catch (error) {
            console.error('❌ [STARTUP] Failed to initialize input detection system:', error);
          }
        } catch (error) {
          console.error('❌ [MAIN] Startup failed:', error);
          throw error;
        }
      }

      // RE-ENABLED: Force updater for mandatory updates
      // Creates IPC handlers for check-for-update, download-update, install-update
      const forceUpdater = new ForceUpdater();
      console.log('✅ [FORCE-UPDATER] Initialized with IPC handlers');

      // Dev-safety: periodic update checks only in packaged builds
      if (app && app.isPackaged) {
        forceUpdater.startPeriodicUpdateChecks();
      } else {
        console.log('🔧 [FORCE-UPDATER] Skipping periodic update checks (dev mode)');
      }

      // Start app directly - update check happens after login via IPC
      (async () => {
        try {

          // CRITICAL FIX: Use robust startup lock
          const lockResult = await acquireStartupLock();
          if (!lockResult) {
            console.log('⚠️ [MAIN] Startup already completed, skipping duplicate');
            return; // Already started
          }
          console.log('✅ [MAIN] Main application started successfully - single window created');
        } catch (error) {
          console.error('❌ [ELECTRON] startMainApplication failed, initializing components directly:', error.message);

          // CRITICAL FIX: Initialize URL system immediately on startup failure
          try {
            if (!global.urlCaptureManager) {
              console.log('🚨 [URGENT-FIX] Initializing UrlCaptureManager due to startup failure');
              const { UrlCaptureManager } = require('./modules/url/UrlCaptureManager.js');

              global.urlCaptureManager = new UrlCaptureManager({
                debugLogging: true,
                debounceMs: 250,
                minSliceSec: 5,
                maxEventsPerSec: 1,
                privacy: {
                  domainOnly: false,
                  redactQueryHash: false,
                  redactPII: true
                },
                skipInternalUrls: true,
                enabled: process.env.URL_PIPELINE_V2_ENABLED !== 'false'
              });

              // CRITICAL FIX: Set up event listener in fallback mode (only if primary not attached)
              if (!global.primaryUrlEventHandlerAttached) global.urlCaptureManager.on('url', (evt) => {
                try {
                  // Windows-specific platform gating for fallback handler  
                  if (process.platform === 'win32') {
                    if (process.env.LOG_URL_VERBOSE === 'true') {
                      console.log('[WIN.URL.IPC.RECV] Fallback handler - Event received:', {
                        url: evt?.url,
                        source: evt?.source,
                        browser: evt?.browser,
                        ts: evt?.ts
                      });
                    }
                  } else {
                    console.log('🌐 [URL] EVENT RECEIVED IN FALLBACK MODE:', { url: evt?.url, source: evt?.source, ts: evt?.ts });
                  }

                  // Create the payload for app_url_activity with proper session validation - FIXED
                  const session = global.sessionManager?.getCurrentSession() || global.currentSession;
                  const userId = session?.user?.id || session?.user_id || global.currentUserId;

                  // CRITICAL: Skip if no valid user session
                  if (!userId) {
                    if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
                      console.log('[WIN.URL.PERSIST.FAIL] Fallback handler - No valid user ID');
                    }
                    return;
                  }

                  // CRITICAL: Double-check internal URL filter before saving
                  // FIXED: Use startsWith() for protocols to prevent false positives
                  // (e.g., "blob:" was matching "bitbucket.org")
                  const urlToCheck = evt?.url || evt?.site_url || '';
                  if (urlToCheck) {
                    const urlLower = urlToCheck.toLowerCase();
                    
                    // Protocol patterns - must be at start of URL
                    const protocolPatterns = [
                      'file://',
                      'chrome://',
                      'chrome-extension://',
                      'about:',
                      'edge://',
                      'brave://',
                      'vivaldi://',
                      'moz-extension://',
                      'view-source:',
                      'data:', // Data URLs
                      'blob:'  // Blob URLs
                    ];

                    // Check protocol patterns
                    let isInternal = false;
                    for (const pattern of protocolPatterns) {
                      if (urlLower.startsWith(pattern)) {
                        isInternal = true;
                        break;
                      }
                    }

                    // Domain/host patterns - check within URL context
                    if (!isInternal) {
                      const hostPatterns = ['localhost', '127.0.0.1', '[::1]', 'app.ebdaatech.com', 'ebdaatech.com'];
                      for (const pattern of hostPatterns) {
                        if (urlLower.includes('://' + pattern) || 
                            urlLower.includes('/' + pattern + '/') ||
                            urlLower.includes('/' + pattern + ':')) {
                          isInternal = true;
                          break;
                        }
                      }
                    }

                    if (isInternal) {
                      if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
                        console.log('[WIN.URL.BLOCK] Blocked internal URL before database save:', urlToCheck);
                      }
                      return; // Skip saving internal URLs
                    }
                  }

                  const payload = {
                    organization_id: null, // Will be set by database trigger
                    user_id: userId,
                    device_id: null, // Will be set by database trigger
                    time_log_id: global.trackingManager?.currentTimeLogId || global.currentTimeLogId || null,
                    site_url: evt?.url || null,
                    domain: (() => { try { return evt?.url ? new URL(evt.url).hostname : null; } catch { return null; } })(),
                    title: evt?.title || '',
                    browser: evt?.browser || evt?.source || 'unknown',
                    confidence: evt?.confidence || 'high',
                    privacy_flags: evt?.privacyFlags || null,
                    started_at: new Date((evt && evt.ts) ?? Date.now()).toISOString(),
                    ended_at: null // Will be closed by next URL or cleanup
                  };

                  console.log('🌐 [URL] PROCESSING PAYLOAD IN FALLBACK MODE:', { domain: payload.domain, browser: payload.browser });

                  // Try to save via enhancedSyncManager first
                  let queued = false;
                  if (global.enhancedSyncManager && global.enhancedSyncManager.addToQueue) {
                    console.log('🌐 [URL] Using enhancedSyncManager.addToQueue (fallback)');
                    try {
                      const result = global.enhancedSyncManager.addToQueue('urlLogs', [payload]);
                      if (result) {
                        queued = true;
                        console.log('🌐 [URL] Queued via enhancedSyncManager (fallback):', payload.domain);
                      } else {
                        console.log('⚠️ [URL] enhancedSyncManager.addToQueue returned false (fallback)');
                      }
                    } catch (error) {
                      console.log('⚠️ [URL] enhancedSyncManager.addToQueue error (fallback):', error.message);
                    }
                  }

                  // Fallback to direct Supabase service ONLY if not queued
                  if (!queued) {
                    if (global.supabaseService && typeof global.supabaseService.from === 'function') {
                      console.log('🌐 [URL] Using direct Supabase service (fallback)');
                      try {
                        global.supabaseService.from('app_url_activity').insert([payload]).then(({ error }) => {
                          if (error) {
                            console.error('❌ [URL] Direct DB insert to app_url_activity failed (fallback):', error.message);
                          } else {
                            console.log('✅ [URL] Direct DB insert to app_url_activity succeeded (fallback):', payload.domain);
                          }
                        });
                      } catch (e) {
                        console.error('❌ [URL] Direct DB insert error (fallback):', e.message);
                      }
                    } else {
                      console.log('❌ [URL] No save mechanism available in fallback mode - URL will be lost!');
                    }
                  }
                } catch (handlerError) {
                  console.error('❌ [URL] Fallback event handler error:', handlerError?.message || handlerError);
                }
              });

              // Start immediately
              global.urlCaptureManager.start();
              console.log('✅ [URGENT-FIX] UrlCaptureManager initialized and started with event handler');
            }
          } catch (urlError) {
            console.error('❌ [URGENT-FIX] Failed to initialize URL system:', urlError);
          }

          // Check if main application already started successfully to prevent duplicate windows
          if (mainApplicationStarted) {
            console.log('✅ [MAIN] Main application already started, skipping fallback');
            return;
          }

          // STEP 1: Initialize components
          initializeComponents();

          // STEP 1.5: Initialize ConfigUIManager for tray functionality
          console.log('🔧 [FALLBACK] Initializing ConfigUIManager...');
          try {
            const ConfigUIManager = require('./modules/utils/config-ui-manager');
            global.configUIManager = new ConfigUIManager({
              config,
              Tray,
              Menu,
              app,
              Notification,
              systemPreferences
            });
            console.log('✅ [FALLBACK] ConfigUIManager initialized successfully');
          } catch (error) {
            console.error('❌ [FALLBACK] Failed to initialize ConfigUIManager:', error);
          }

          // STEP 2: Initialize tracking controller FIRST
          console.log('🔧 [FALLBACK] Initializing tracking controller...');
          try {
            initializeTrackingController();
            console.log('✅ [FALLBACK] Tracking controller initialized successfully');
          } catch (error) {
            console.error('❌ [FALLBACK] Failed to initialize tracking controller:', error);
          }

          // STEP 2.5: Initialize consolidated systems for screenshots/URL/input
          console.log('🔧 [FALLBACK] Initializing consolidated systems...');
          if (!consolidatedSystemsInitialized && consolidationFixes && consolidationFixes.initializeAllConsolidatedSystems) {
            try {
              await consolidationFixes.initializeAllConsolidatedSystems({
                electronModules: { app, BrowserWindow, screen, powerMonitor, systemPreferences, desktopCapturer },
                configManager: { getConfig: () => config },
                syncManager,
                detectActiveApplication: async () => ({}),
                extractUrlFromBrowser: async () => null,
                detectBrowserUrl: async () => null,
                isBrowserApp: () => false,
                extractDomain: (url) => {
                  try {
                    const urlObj = new URL(url);
                    return urlObj.hostname;
                  } catch {
                    return 'unknown';
                  }
                },
                processFoundUrl: async () => ({})
              });
              consolidatedSystemsInitialized = true;
              console.log('✅ [FALLBACK] Consolidated systems initialized successfully');
            } catch (error) {
              console.error('❌ [FALLBACK] Failed to initialize consolidated systems:', error);
            }
          }

          // STEP 3: Create window and immediately update tracking controller
          console.log('🔧 [FALLBACK] Creating main window since startMainApplication failed');
          try {
            // Create window directly since windowManager isn't initialized in fallback mode
            const mainWindow = new BrowserWindow({
              width: 1000,
              height: 700,
              webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                spellcheck: false
              },
              icon: global.getIconPath ? global.getIconPath('icon.png') : path.join(__dirname, '../assets/icon.png'),
              title: 'Alyson PM',
              titleBarStyle: 'hiddenInset',
              backgroundColor: '#ffffff',
              resizable: true,
              show: true,
              minWidth: 800,
              minHeight: 600,
              center: true,
              alwaysOnTop: false
            });

            mainWindow.setMenuBarVisibility(false);
            mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

            // DEVTOOLS: Uncomment to debug renderer issues
            // mainWindow.webContents.openDevTools({ mode: 'detach' });

            mainWindow.once('ready-to-show', () => {
              mainWindow.show();
              mainWindow.focus();
              if (process.platform === 'darwin') {
                app.focus();
              }
              console.log('✅ [FALLBACK] Main window ready and visible');
            });

            console.log('✅ [FALLBACK] Main window created directly');

            // Create tray using config-ui-manager
            if (global.configUIManager && typeof global.configUIManager.createTray === 'function') {
              // Ensure ConfigUIManager has access to mainWindow
              global.configUIManager.mainWindow = mainWindow;
              global.configUIManager.createTray();
              console.log('✅ [FALLBACK] Tray created via config-ui-manager');
            } else {
              console.error('❌ [FALLBACK] ConfigUIManager not available for tray creation');
            }

            console.log('✅ [FALLBACK] Main window and tray created successfully');

            // CRITICAL FIX: Make mainWindow globally accessible for tray handlers
            if (mainWindow) {
              global.mainWindow = mainWindow;
              console.log('✅ [FALLBACK] MainWindow set globally for tray access');
            }

            // CRITICAL FIX: Update tracking controller with mainWindow reference (NOW it exists!)
            if (global.trackingController && mainWindow) {
              console.log('🔧 [FALLBACK] Updating tracking controller with mainWindow reference');
              global.trackingController.mainWindow = mainWindow;
              console.log('✅ [FALLBACK] Tracking controller mainWindow updated successfully');
            } else if (trackingController && mainWindow) {
              console.log('🔧 [FALLBACK] Using local trackingController reference');
              trackingController.mainWindow = mainWindow;
              console.log('✅ [FALLBACK] Local tracking controller mainWindow updated');
            } else {
              console.error('❌ [FALLBACK] CRITICAL: trackingController still not available after initialization!');
              console.log('🔍 [DEBUG] global.trackingController:', typeof global.trackingController);
              console.log('🔍 [DEBUG] trackingController:', typeof trackingController);
              console.log('🔍 [DEBUG] mainWindow:', typeof mainWindow);
            }

            // IPC handlers already registered in modules - no fallback needed
            console.log('✅ [FALLBACK] IPC handlers already registered in modules');

            // CRITICAL: Initialize DataStatsManager in fallback mode
            console.log('🔧 [FALLBACK] Initializing DataStatsManager...');
            if (!global.dataStatsManager) {
              try {
                // Ensure we use the properly loaded config, not raw environment variables
                const { loadConfig } = require('../load-config');
                const processedConfig = config || loadConfig();

                console.log('🔍 [FALLBACK] Using config for DataStatsManager:', {
                  hasSupabaseUrl: !!processedConfig.supabase_url,
                  hasSupabaseKey: !!processedConfig.supabase_key,
                  configSource: 'loadConfig()'
                });

                const DataStatsManager = require('./modules/ipc/data-stats-manager');
                global.dataStatsManager = new DataStatsManager({
                  ipcMain,
                  config: processedConfig,
                  appSettings: appSettings || {},
                  supabaseService: global.supabaseService || global.supabase,
                  global: global,
                  process: process,
                  require: require,
                  safeLog: (...args) => console.log(...args),
                  app: app
                });
                await global.dataStatsManager.initialize();
                console.log('✅ [FALLBACK] DataStatsManager initialized successfully');
              } catch (error) {
                console.error('❌ [FALLBACK] Failed to initialize DataStatsManager:', error);
              }
            }

            // CRITICAL: Initialize IPCEventMap to ensure 'start-timer' handler is registered
            console.log('🔧 [FALLBACK] Initializing IPCEventMap...');
            if (!global.ipcEventMap) {
              try {
                const IPCEventMap = require('./modules/core/ipc-event-map');
                global.ipcEventMap = new IPCEventMap({ app, ipcMain });
                global.ipcEventMap.initialize();
                console.log('✅ [FALLBACK] IPCEventMap initialized (start-timer registered)');
              } catch (error) {
                console.error('❌ [FALLBACK] Failed to initialize IPCEventMap:', error);
              }
            }

            // CRITICAL: Ensure developer console IPC handlers exist even in fallback mode
            console.log('🔧 [FALLBACK] Ensuring developer console IPC handlers are registered...');
            registerDeveloperConsoleHandlers();
            console.log('✅ [FALLBACK] Developer console IPC handlers ready');

            // Skip fetch-screenshots-enhanced - handled by DataStatsManager now
            console.log('✅ [FALLBACK] DataStatsManager will handle fetch-screenshots-enhanced');

            // Only register handlers that DataStatsManager doesn't handle
            if (false) { // Disabled - DataStatsManager handles this
              ipcMain.handle('fetch-screenshots-enhanced', async (event, params) => {
                try {
                  const { user_id, date, activity_filter = 'all', limit = 50 } = params || {};
                  const effectiveUserId = global.currentUserId || user_id || (config && (config.user_id || config.userId));

                  if (!supabaseService) {
                    return { success: false, error: 'Database service not available', screenshots: [], total: 0 };
                  }
                  if (!effectiveUserId) {
                    return { success: false, error: 'User ID not available', screenshots: [], total: 0 };
                  }

                  // Compute local-day UTC range to avoid timezone off-by-one issues
                  let startUTC, endUTC;
                  if (date) {
                    const localStart = new Date(date + 'T00:00:00');
                    const localEnd = new Date(date + 'T23:59:59.999');
                    startUTC = new Date(localStart.getTime() - localStart.getTimezoneOffset() * 60000).toISOString();
                    endUTC = new Date(localEnd.getTime() - localEnd.getTimezoneOffset() * 60000).toISOString();
                  }

                  let query = supabaseService
                    .from('screenshots')
                    .select('id, file_path, captured_at, activity_percent, mouse_clicks, keystrokes, mouse_movements, time_log_id')
                    .eq('user_id', effectiveUserId)
                    .order('captured_at', { ascending: false })
                    .limit(limit);

                  if (startUTC && endUTC) {
                    query = query.gte('captured_at', startUTC).lte('captured_at', endUTC);
                  }

                  if (activity_filter === 'high') {
                    query = query.gte('activity_percent', 70);
                  } else if (activity_filter === 'medium') {
                    query = query.gte('activity_percent', 30).lt('activity_percent', 70);
                  } else if (activity_filter === 'low') {
                    query = query.lt('activity_percent', 30);
                  }

                  const { data, error } = await query;
                  if (error) {
                    console.error('❌ [FALLBACK] Enhanced screenshot fetch failed:', error);
                    return { success: false, error: error.message, screenshots: [], total: 0 };
                  }

                  const screenshots = (data || []).map(s => ({
                    ...s,
                    image_url: s.file_path,
                    timestamp: s.captured_at
                  }));

                  return { success: true, screenshots, total: screenshots.length };
                } catch (error) {
                  console.error('❌ Error in fetch-screenshots-enhanced handler:', error);
                  return { success: false, error: error.message, screenshots: [], total: 0 };
                }
              });
            } // End of disabled fetch-screenshots-enhanced handler

            // Register get-url-activity handler (fallback minimal) — only if DataStatsManager not present
            if (!global.dataStatsManager) ipcMain.handle('get-url-activity', async () => {
              try {
                console.log('🌐 [FALLBACK] get-url-activity called');
                if (!supabaseService) return { success: false, error: 'Database service not available' };
                const effectiveUserId = global.currentUserId || config?.user_id || config?.userId;
                if (!effectiveUserId) return { success: false, error: 'User ID not available' };
                const { data, error } = await supabaseService
                  .from('url_logs')
                  .select('url, title, browser, timestamp, time_log_id, domain, user_id')
                  .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                  .not('url', 'ilike', '%browser-activity-detected.local%')
                  .eq('user_id', effectiveUserId)
                  .order('timestamp', { ascending: false })
                  .limit(50);
                if (error) return { success: false, error: error.message };
                return { success: true, data: data || [] };
              } catch (error) {
                console.error('❌ [FALLBACK] Error in get-url-activity handler:', error);
                return { success: false, error: error.message };
              }
            });

            // Register get-app-activity handler — only if DataStatsManager not present
            if (!global.dataStatsManager) ipcMain.handle('get-app-activity', async () => {
              try {
                console.log('📱 [IPC] get-app-activity called');
                return { success: true, apps: [], message: 'No app activity available' };
              } catch (error) {
                console.error('❌ Error in get-app-activity handler:', error);
                return { success: false, error: error.message };
              }
            });

            // Register get-screenshot-activity handler (fallback) — only if DataStatsManager not present
            if (!global.dataStatsManager) ipcMain.handle('get-screenshot-activity', async () => {
              try {
                console.log('📊 [IPC] get-screenshot-activity called (fallback)');
                return { success: true, data: [], message: 'No screenshot activity available' };
              } catch (error) {
                console.error('❌ Error in get-screenshot-activity handler:', error);
                return { success: false, error: error.message };
              }
            });

            // Fallback: get-today-stats — only if DataStatsManager not present
            if (!global.dataStatsManager) ipcMain.handle('get-today-stats', async () => {
              try {
                console.log("📊 [FALLBACK] get-today-stats called");
                if (!supabaseService) return { success: false, error: 'Database service not available' };
                const effectiveUserId = global.currentUserId || config?.user_id || config?.userId;
                if (!effectiveUserId) return { success: false, error: 'User ID not available' };

                const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

                const [timeLogsResult, screenshotsResult, appLogsResult, urlLogsResult] = await Promise.all([
                  supabaseService.from('time_logs').select('start_time, end_time, is_idle, idle_seconds')
                    .eq('user_id', effectiveUserId)
                    .gte('start_time', todayStart.toISOString())
                    .lte('start_time', todayEnd.toISOString()),
                  supabaseService.from('screenshots').select('id, keystrokes, mouse_clicks, mouse_movements')
                    .eq('user_id', effectiveUserId)
                    .gte('captured_at', todayStart.toISOString())
                    .lte('captured_at', todayEnd.toISOString()),
                  supabaseService.from('app_logs').select('app_name')
                    .eq('user_id', effectiveUserId)
                    .gte('timestamp', todayStart.toISOString())
                    .lte('timestamp', todayEnd.toISOString()),
                  supabaseService.from('url_logs').select('url')
                    .eq('user_id', effectiveUserId)
                    .gte('timestamp', todayStart.toISOString())
                    .lte('timestamp', todayEnd.toISOString())
                ]);

                const timeLogs = timeLogsResult.data || [];
                const screenshots = screenshotsResult.data || [];
                const appLogs = appLogsResult.data || [];
                const urlLogs = urlLogsResult.data || [];

                let activeTime = 0, idleTime = 0, totalTime = 0;
                timeLogs.forEach(log => {
                  if (log.start_time && log.end_time) {
                    const duration = (new Date(log.end_time) - new Date(log.start_time)) / 1000;
                    totalTime += duration;
                    if (log.is_idle) idleTime += duration; else activeTime += duration;
                  }
                  if (log.idle_seconds) idleTime += log.idle_seconds;
                });

                const stats = {
                  activeTime: Math.round(activeTime),
                  idleTime: Math.round(idleTime),
                  totalTime: Math.round(totalTime),
                  screenshotCount: screenshots.length,
                  appCount: new Set(appLogs.map(l => l.app_name).filter(Boolean)).size,
                  totalClicks: screenshots.reduce((s, x) => s + (x.mouse_clicks || 0), 0),
                  totalKeystrokes: screenshots.reduce((s, x) => s + (x.keystrokes || 0), 0),
                  totalMouseMovements: screenshots.reduce((s, x) => s + (x.mouse_movements || 0), 0),
                  urlCount: urlLogs.length,
                  domainCount: new Set(urlLogs.map(l => { try { return new URL(l.url).hostname; } catch { return null; } }).filter(Boolean)).size
                };

                return { success: true, data: stats };
              } catch (error) {
                console.error('❌ [FALLBACK] get-today-stats error:', error);
                return { success: false, error: error.message };
              }
            });

            // Fallback: get-today-screenshots — only if DataStatsManager not present
            if (!global.dataStatsManager) ipcMain.handle('get-today-screenshots', async () => {
              try {
                // Rate-limit fallback logging to avoid spam
                const now = Date.now();
                global.__lastTodayShotsLog = global.__lastTodayShotsLog || 0;
                if (now - global.__lastTodayShotsLog > 10000) {
                  console.log("📸 [FALLBACK] get-today-screenshots called");
                  global.__lastTodayShotsLog = now;
                }
                if (!supabaseService) return { success: false, error: 'Database service not available' };
                const effectiveUserId = global.currentUserId || config?.user_id || config?.userId;
                if (!effectiveUserId) return { success: false, error: 'User ID not available' };
                const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
                const { data, error } = await supabaseService
                  .from('screenshots')
                  .select('captured_at, file_path, image_url, activity_percent, mouse_clicks, keystrokes, mouse_movements')
                  .eq('user_id', effectiveUserId)
                  .gte('captured_at', todayStart.toISOString())
                  .lte('captured_at', todayEnd.toISOString())
                  .order('captured_at', { ascending: false });
                if (error) return { success: false, error: error.message };
                return { success: true, data: data || [] };
              } catch (error) {
                console.error('❌ [FALLBACK] get-today-screenshots error:', error);
                return { success: false, error: error.message };
              }
            });

            // Fallback: get-today-activity-log — only if DataStatsManager not present
            if (!global.dataStatsManager) ipcMain.handle('get-today-activity-log', async () => {
              try {
                console.log("📝 [FALLBACK] get-today-activity-log called");
                if (!supabaseService) return { success: false, error: 'Database service not available' };
                const effectiveUserId = global.currentUserId || config?.user_id || config?.userId;
                if (!effectiveUserId) return { success: false, error: 'User ID not available' };
                const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

                // Use allSettled for better error handling (dual queries for app/url)
                const [
                  screenshotResult,
                  appTsRes,
                  appCrRes,
                  urlTsRes,
                  urlCrRes,
                  timeResult
                ] = await Promise.allSettled([
                  supabaseService.from('screenshots').select('id, captured_at, created_at, app_name, activity_percent')
                    .eq('user_id', effectiveUserId)
                    .gte('captured_at', todayStart.toISOString())
                    .lte('captured_at', todayEnd.toISOString())
                    .order('captured_at', { ascending: false }),
                  supabaseService.from('app_logs').select('id, timestamp, created_at, app_name, window_title')
                    .eq('user_id', effectiveUserId)
                    .gte('timestamp', todayStart.toISOString())
                    .lte('timestamp', todayEnd.toISOString())
                    .order('timestamp', { ascending: false }),
                  supabaseService.from('app_logs').select('id, timestamp, created_at, app_name, window_title')
                    .eq('user_id', effectiveUserId)
                    .is('timestamp', null)
                    .gte('created_at', todayStart.toISOString())
                    .lte('created_at', todayEnd.toISOString())
                    .order('created_at', { ascending: false }),
                  supabaseService.from('url_logs').select('id, timestamp, url, site_url, browser, domain')
                    .eq('user_id', effectiveUserId)
                    .gte('timestamp', todayStart.toISOString())
                    .lte('timestamp', todayEnd.toISOString())
                    .order('timestamp', { ascending: false }),
                  supabaseService.from('url_logs').select('id, timestamp, url, site_url, browser, domain')
                    .eq('user_id', effectiveUserId)
                    .is('timestamp', null)
                    .order('timestamp', { ascending: false }),
                  supabaseService.from('time_logs').select('id, start_time, end_time, is_idle, idle_seconds')
                    .eq('user_id', effectiveUserId)
                    .gte('start_time', todayStart.toISOString())
                    .lte('start_time', todayEnd.toISOString())
                    .order('start_time', { ascending: false })
                ]);

                // Process results with error handling
                const screenshots = screenshotResult.status === 'fulfilled' ? (screenshotResult.value.data || []) : [];
                const appByTs = appTsRes.status === 'fulfilled' ? (appTsRes.value.data || []) : [];
                const appByCr = appCrRes.status === 'fulfilled' ? (appCrRes.value.data || []) : [];
                const urlByTs = urlTsRes.status === 'fulfilled' ? (urlTsRes.value.data || []) : [];
                const urlByCr = urlCrRes.status === 'fulfilled' ? (urlCrRes.value.data || []) : [];
                const timeLogs = timeResult.status === 'fulfilled' ? (timeResult.value.data || []) : [];

                // Merge + dedupe
                const dedupe = (rows, keyFn) => { const s = new Set(); return rows.filter(r => { const k = keyFn(r); if (s.has(k)) return false; s.add(k); return true; }); };
                const appLogs = dedupe([...appByTs, ...appByCr], r => r.id ?? `${r.app_name}|${r.timestamp || r.created_at}`);
                const urlLogs = dedupe([...urlByTs, ...urlByCr], r => r.id ?? `${r.url || r.site_url}|${r.timestamp}`);

                const activities = [];

                // Screenshots with timestamp fallback
                screenshots.forEach(log => {
                  const timestamp = log.captured_at || log.created_at;
                  if (timestamp) {
                    activities.push({
                      timestamp,
                      type: 'Screenshot',
                      details: `${log.app_name || 'Unknown App'} - ${log.activity_percent || 0}% activity`,
                      synced: true
                    });
                  }
                });

                // App logs with proper details
                appLogs.forEach(log => {
                  const timestamp = log.timestamp;
                  if (timestamp && log.app_name) {
                    let details = log.app_name;
                    if (log.window_title) details += ` - ${log.window_title}`;
                    activities.push({ timestamp, type: 'App Switch', details, synced: true });
                  }
                });

                // URL logs with robust domain extraction
                urlLogs.forEach(log => {
                  const timestamp = log.timestamp || log.created_at;
                  const url = log.url || log.site_url;
                  if (timestamp && url) {
                    let domain = log.domain;
                    if (!domain) {
                      try { domain = new URL(url).hostname; }
                      catch { domain = url.substring(0, 50) + (url.length > 50 ? '...' : ''); }
                    }
                    activities.push({
                      timestamp,
                      type: 'Website Visit',
                      details: `${domain} via ${log.browser || 'Unknown Browser'}`,
                      synced: true
                    });
                  }
                });

                // Time logs with calculated durations
                timeLogs.forEach(log => {
                  if (log.start_time) {
                    let activeDuration = 0;
                    if (log.end_time) {
                      const totalDuration = (new Date(log.end_time) - new Date(log.start_time)) / 1000;
                      if (!log.is_idle) activeDuration = totalDuration - (log.idle_seconds || 0);
                    }
                    activities.push({
                      timestamp: log.start_time,
                      type: 'Tracking Session',
                      details: `Started session${activeDuration > 0 ? ` (${Math.floor(activeDuration / 60)} min active)` : ''}`,
                      synced: true
                    });
                    if (log.end_time) {
                      activities.push({
                        timestamp: log.end_time,
                        type: 'Tracking Session',
                        details: 'Ended session',
                        synced: true
                      });
                    }
                  }
                });

                // Sort with timestamp fallbacks for consistency
                activities.sort((a, b) => {
                  const at = new Date(a.timestamp || a.captured_at || a.started_at || a.created_at || 0);
                  const bt = new Date(b.timestamp || b.captured_at || b.started_at || b.created_at || 0);
                  return bt - at;
                });
                console.log(`✅ [FALLBACK] Compiled ${activities.length} activity entries`);
                return { success: true, data: activities };
              } catch (error) {
                console.error('❌ [FALLBACK] get-today-activity-log error:', error);
                return { success: false, error: error.message };
              }
            });

            // Fallback: get-url-history (only register if DataStatsManager isn't available)
            if (!global.dataStatsManager) ipcMain.handle('get-url-history', async (event, params) => {
              try {
                console.log('📅 [FALLBACK] get-url-history called', params);
                if (!supabaseService) {
                  return { success: false, error: 'Database service not available' };
                }
                const effectiveUserId = global.currentUserId || config?.user_id || config?.userId;
                if (!effectiveUserId) {
                  return { success: false, error: 'User ID not available' };
                }

                const { startDate, endDate } = params || {};
                const start = startDate ? new Date(startDate) : new Date();
                if (!startDate) start.setHours(0, 0, 0, 0);
                const end = endDate ? new Date(endDate) : new Date();
                if (!endDate) end.setHours(23, 59, 59, 999);

                // Select both url and site_url, and include normalization + noise filtering
                let query = supabaseService
                  .from('url_logs')
                  .select('id, url, site_url, title, domain, browser, timestamp, time_log_id, user_id')
                  .gte('timestamp', start.toISOString())
                  .lte('timestamp', end.toISOString())
                  .eq('user_id', effectiveUserId)
                  .order('timestamp', { ascending: false })
                  .limit(500);

                // Filter out internal noise markers on either column
                query = query
                  .not('site_url', 'ilike', '%browser-activity-detected.local%')
                  .not('url', 'ilike', '%browser-activity-detected.local%');

                const { data, error } = await query;
                console.log('📅 [FALLBACK] get-url-history DB response:', {
                  error: !!error,
                  rows: data ? data.length : 0,
                  first: data && data[0] ? { url: data[0].url, site_url: data[0].site_url, timestamp: data[0].timestamp } : null,
                });
                if (error) {
                  return { success: false, error: error.message };
                }

                const normalized = (data || [])
                  .filter(row => row.url || row.site_url)  // Drop rows where both are null
                  .map(row => ({
                    ...row,
                    url: row.url || row.site_url || null,
                  }));

                console.log('📅 [FALLBACK] get-url-history normalized count:', normalized.length);
                return { success: true, data: normalized };
              } catch (error) {
                console.error('❌ [FALLBACK] get-url-history error:', error);
                return { success: false, error: error.message };
              }
            });

            // Fallback: get-app-history (guarded to avoid duplicate handler if already provided by DataStatsManager)
            try { ipcMain.removeHandler('get-app-history'); } catch (e) { }
            ipcMain.handle('get-app-history', async (event, params) => {
              try {
                console.log('📱 [FALLBACK] get-app-history called', params);
                if (!supabaseService) return { success: false, error: 'Database service not available' };
                const effectiveUserId = global.currentUserId || config?.user_id || config?.userId;
                if (!effectiveUserId) return { success: false, error: 'User ID not available' };
                const { startDate, endDate } = params || {};
                const start = startDate ? new Date(startDate) : new Date(); if (!startDate) start.setHours(0, 0, 0, 0);
                const end = endDate ? new Date(endDate) : new Date(); if (!endDate) end.setHours(23, 59, 59, 999);
                const { data, error } = await supabaseService
                  .from('app_logs')
                  .select('id, app_name, window_title, app_path, timestamp, duration_seconds, category, time_log_id, user_id')
                  .gte('timestamp', start.toISOString())
                  .lte('timestamp', end.toISOString())
                  .not('app_name', 'is', null)
                  .eq('user_id', effectiveUserId)
                  .order('timestamp', { ascending: false })
                  .limit(1000);
                if (error) return { success: false, error: error.message };
                return { success: true, data: data || [] };
              } catch (error) {
                console.error('❌ [FALLBACK] get-app-history error:', error);
                return { success: false, error: error.message };
              }
            });

            // Fallback: ensure URL capture managers are available and running
            try {
              // Check if UrlCaptureManager already exists
              if (!global.urlCaptureManager) {
                console.log('🔧 [FALLBACK] Creating UrlCaptureManager (not found in globals)');
                const { UrlCaptureManager } = require('./modules/url/UrlCaptureManager.js');
                global.urlCaptureManager = new UrlCaptureManager({
                  debugLogging: true,
                  debounceMs: 180,
                  minSliceSec: 4,
                  maxEventsPerSec: 2,
                  privacy: {
                    domainOnly: false,
                    redactQueryHash: true
                  },
                  skipInternalUrls: false,
                  enabled: true
                });

                // IMPORTANT: Event listener must be set up by StartupManager
                // This fallback instance won't have database saving capability
                console.warn('⚠️ [FALLBACK] UrlCaptureManager created without event listener - URL saving may not work!');

                // Start it immediately
                global.urlCaptureManager.start();
                console.log('✅ [FALLBACK] UrlCaptureManager created and started');
              } else {
                console.log('✅ [FALLBACK] UrlCaptureManager already exists, skipping creation');
                // Ensure it's running
                if (!global.urlCaptureManager.isRunning) {
                  global.urlCaptureManager.start();
                  console.log('✅ [FALLBACK] Started existing UrlCaptureManager');
                }
              }

              // Keep old BrowserUrlManager for compatibility
              if (!global.browserUrlManager) {
                console.log('🔧 [FALLBACK] Creating BrowserUrlManager wrapper (delegates to UrlCaptureManager)');
                const BrowserUrlManager = require('./modules/capture/browser-url-manager.wrapper');
                global.browserUrlManager = new BrowserUrlManager(config, { syncManager: global.enhancedSyncManager });
                // Initialize with whatever context is available
                const mainWindowRef = global.mainWindow || (global.appLifecycleManager && global.appLifecycleManager.getMainWindow && global.appLifecycleManager.getMainWindow());
                global.browserUrlManager.initialize({
                  mainWindow: mainWindowRef,
                  systemMonitor: global.systemMonitor,
                  isTracking: !!global.isTracking,
                  currentTimeLogId: global.currentTimeLogId,
                  lastActivity: global.lastActivity || Date.now()
                });
                console.log('✅ [FALLBACK] BrowserUrlManager created and initialized');
              }
              // Request URL capture; manager will defer if tracking inactive and is idempotent
              try { startUrlCapture(); } catch { }
              console.log('✅ [FALLBACK] URL capture start requested (deferred if inactive)');
            } catch (e) {
              console.error('❌ [FALLBACK] Failed to ensure URL capture:', e.message);
            }

            console.log('✅ [FALLBACK] Critical UI IPC handlers registered');
          } catch (error) {
            console.error('❌ [FALLBACK] Failed to create window:', error);
          }
        }
      })(); // Execute immediately as async function

      // Register global debug shortcut (Ctrl+Shift+D or Cmd+Shift+D)
      globalShortcut.register('CommandOrControl+Shift+D', () => {
        createDebugWindow();
      });

      // Register global permission request shortcut (Ctrl+Shift+P or Cmd+Shift+P)
      globalShortcut.register('CommandOrControl+Shift+P', async () => {
        if (process.platform === 'darwin') {
          const currentPermission = systemPreferences.getMediaAccessStatus('screen');

          if (currentPermission !== 'granted') {
            safeLog('🔒 Manual permission request triggered via keyboard shortcut');
            permissionDialogShown = false; // Reset to allow dialog
            await checkMacScreenPermissions();
          } else {
            showTrayNotification('Screen Recording permission is already granted!', 'success');
          }
        } else {
          showTrayNotification('Permission management is only available on macOS', 'info');
        }
      });

      // Register global show window shortcut (Ctrl+Shift+W or Cmd+Shift+W)
      globalShortcut.register('CommandOrControl+Shift+W', () => {
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
          global.mainWindow.show();
          global.mainWindow.focus();
          showTrayNotification('Main window shown!', 'info');
          safeLog('🪟 Main window shown via keyboard shortcut');
        } else {
          showTrayNotification('Main window not available', 'warning');
          safeLog('⚠️ Main window not available for keyboard shortcut');
        }
      });

      // CRITICAL FIX: Call startMainApplication after all initialization is complete
      console.log('🚀 [MAIN] Performance optimization complete - calling startMainApplication...');
      Promise.resolve()
        .then(async () => {
          // CRITICAL FIX: Use robust startup lock
          const lockResult = await acquireStartupLock();
          if (!lockResult) {
            console.log('⚠️ [MAIN] Startup already completed, skipping Promise chain');
            return; // Already started
          }

          // CRITICAL FIX: Actually call the function!!!
          console.log('🚀 [MAIN] Calling startMainApplication() now...');
          await startMainApplication();
          console.log('✅ [MAIN] startMainApplication() completed successfully');
        })
        .then(() => {
          console.log('✅ [MAIN] Main application started successfully via app.whenReady callback');
        })
        .catch((error) => {
          const message = (error && error.message) ? error.message : String(error);
          console.error('❌ [MAIN] startMainApplication failed in app.whenReady callback:', message);
          // Continue with fallback initialization
        });

    });
  } else {
    // In Node.js mode, skip update check and start directly
    setTimeout(() => {
      if (typeof startMainApplication === 'function') {
        startMainApplication();
      } else {
        console.log('⚠️ [NODE] startMainApplication not available in Node.js mode');
      }
    }, 100); // Small delay to ensure function is defined
  }

  // Only set up app event handlers in Electron mode
  if (app && isElectronContext) {
    app.on('window-all-closed', () => {
      // On macOS, keep app running when all windows closed (standard behavior)
      if (process.platform === 'darwin') return;
      // On Windows/Linux, only quit after main application has started
      // (prevents premature exit when no windows exist during startup)
      if (!mainApplicationStarted && !mainApplicationStarting) {
        console.log('⚠️ [LIFECYCLE] window-all-closed fired before startup complete — ignoring to prevent premature exit');
        return;
      }
      app.quit();
    });

    // Flags to track cleanup state (prevents concurrent execution and infinite loop)
    let isCleanupInProgress = false;
    let isCleanupComplete = false;
    
    app.on('before-quit', async (event) => {
      // CRITICAL FIX: Prevent quit until async cleanup completes
      // Electron's before-quit doesn't wait for async operations, so we must:
      // 1. Prevent the default quit on first call
      // 2. Perform async cleanup
      // 3. Call app.quit() again after cleanup
      if (isCleanupComplete) {
        // Cleanup already done, allow quit to proceed
        console.log('🔄 Cleanup already complete, allowing quit');
        return;
      }
      
      if (isCleanupInProgress) {
        // Cleanup is running, just prevent quit and wait
        event.preventDefault();
        console.log('🔄 Cleanup already in progress, waiting...');
        return;
      }
      
      // Start cleanup - set flag BEFORE async work to prevent concurrent execution
      isCleanupInProgress = true;
      event.preventDefault();
      console.log('🔄 App shutting down - waiting for cleanup...');
      
      // CRITICAL FIX v1.0.136: Wrap cleanup in timeout to prevent zombie processes on Windows
      const CLEANUP_TIMEOUT_MS = 5000;
      
      const performCleanup = async () => {
        // Shutdown ServiceContainer and EventBus
        try {
          const { container } = require('./core/service-container');
          const { eventBus } = require('./core/event-bus');
          eventBus.shutdown();
          await container.shutdown();
        } catch (err) {
          console.error('⚠️ Container/EventBus shutdown error:', err.message);
        }

        // Cleanup consolidated systems
        cleanupRegistry.cleanupAll();

        // Unregister global shortcuts
        globalShortcut.unregisterAll();

        // Stop system monitor
        systemMonitor.stopPeriodicHealthCheck();
        console.log('🔬 [SYSTEM-MONITOR] Stopped periodic health monitoring');

        // CRITICAL: Wait for stopTracking to complete (closes time_log in database)
        await stopTracking();

        // AGGRESSIVE INTERVAL CLEANUP TO PREVENT MEMORY LEAKS
        console.log('🧹 Performing aggressive cleanup...');

        // Clear all known intervals
        if (settingsInterval) clearInterval(settingsInterval);
        if (screenshotInterval) clearInterval(screenshotInterval);
        if (activityInterval) clearInterval(activityInterval);
        if (idleCheckInterval) clearInterval(idleCheckInterval);
        if (appCaptureInterval) clearInterval(appCaptureInterval);
        if (urlCaptureInterval) clearInterval(urlCaptureInterval);
        if (notificationInterval) clearInterval(notificationInterval);
        if (mouseTrackingInterval) clearInterval(mouseTrackingInterval);
        if (keyboardTrackingInterval) clearInterval(keyboardTrackingInterval);

        // Aggressive cleanup moved to modules/utils/event-handler-manager.js
        if (global.eventHandlerManager) {
          global.eventHandlerManager.performAggressiveCleanup();
        }
      };
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Cleanup timeout after 5 seconds')), CLEANUP_TIMEOUT_MS)
      );
      
      try {
        await Promise.race([performCleanup(), timeoutPromise]);
        console.log('✅ Cleanup complete, proceeding with quit');
      } catch (error) {
        console.error('❌ Error during shutdown cleanup (forcing quit anyway):', error.message);
      }
      
      // Mark cleanup as complete and quit again
      isCleanupComplete = true;
      isCleanupInProgress = false;
      console.log('🚀 Calling app.quit() after cleanup...');
      app.quit();
      
      // FIX v1.0.138: Force exit on ALL platforms if app.quit() doesn't terminate within 2 seconds
      // This prevents zombie processes and ensures clean exit on macOS too
      setTimeout(() => {
        console.error('⚠️ FORCE EXIT: app.quit() did not terminate process within 2s - forcing exit');
        process.exit(0);
      }, 2000);
    });
  } // End of Electron mode app event handlers

  // App activate event moved to modules/utils/event-handler-manager.js

  // Event handlers initialization
  const EventHandlerManager = require('./modules/utils/event-handler-manager');
  global.eventHandlerManager = new EventHandlerManager({
    app,
    powerMonitor,
    mainWindow,
    isTracking,
    stopTracking,
    antiCheatDetector,
    safeLog,
    debounceEvent: (name, handler) => handler // Simple fallback for debounceEvent
  });

  // Initialize event handlers
  if (isElectronContext) {
    global.eventHandlerManager.initializeAllEventHandlers();
  }

  console.log('📱 Alyson PM Desktop Agent initialized');

  // Initialize components
  // Helper function for warning manager to get main window
  function getMainWindow() {
    return mainWindow;
  }

  // Export for warning manager
  module.exports = { getMainWindow };

  // Component initialization moved to modules/core/app-initialization-manager.js
  function initializeComponents() {
    const AppInitializationManager = require('./modules/core/app-initialization-manager');
    const appInitManager = new AppInitializationManager({
      systemPreferences,
      screen,
      supabaseService,
      config,
      loadSystemState,
      loadOfflineQueue,
      getCurrentMousePosition,
      getSystemIdleTime,
      lastMousePos,
      useOptimizedIntervals
    });

    const managers = appInitManager.initializeComponents();
    intervalManager = managers.intervalManager;
    warningManager = managers.warningManager;

    global.appInitManager = appInitManager;
  }

  // Large optimized intervals setup moved to modules/core/app-initialization-manager.js

  // Interval callbacks moved to modules/utils/interval-configuration-manager.js
  const IntervalConfigurationManager = require('./modules/utils/interval-configuration-manager');
  const intervalConfigManager = new IntervalConfigurationManager({
    intervalManager,
    getSystemIdleTime,
    appSettings,
    mainWindow,
    logIdlePeriod,
    isTracking,
    currentTimeLogId,
    config,
    syncManager,
    getTodayAppCount,
    isBrowserApp,
    extractUrlFromBrowser,
    extractDomain,
    processFoundUrl,
    smartUrlCapture
    // activeWin // Removed dependency
  });

  // Register all interval callbacks
  intervalConfigManager.registerAllIntervalCallbacks();

  // Advanced interval monitoring moved to modules/core/interval-monitoring-manager.js

  // IPC handler cleanup and Mac permission checking moved to modules/auth/session-auth-manager.js

  // Health check and system status handlers moved to modules/ipc/core-ipc-manager.js

  // Core IPC handlers moved to modules/ipc/core-ipc-manager.js

  // Get current tracking state for UI synchronization
  ipcMain.handle('get-tracking-state', () => {
    const isTracking = !!(global.isTracking);
    // FIX-4: Add trackingManager.sessionStartTime as fallback to ensure
    // the start time is always available when tracking is active.
    const startTimeRaw = global.currentSession?.start_time
      || global.sessionStartTime
      || global.trackingManager?.sessionStartTime
      || null;
    const sessionStartTime = isTracking ? startTimeRaw : null;
    const state = {
      isTracking,
      isPaused: global.isPaused || false,
      sessionStartTime,
      currentTimeLogId: global.currentTimeLogId || global.trackingManager?.currentTimeLogId || null,
      trackingDuration: (isTracking && sessionStartTime) ?
        Date.now() - new Date(sessionStartTime).getTime() : 0
    };

    return state;
  });

  // Get today's time statistics for dashboard (fallback if DataStatsManager not available)
  if (!global.dataStatsManager) {
    ipcMain.handle('get-today-time-stats', async () => {
      try {
        try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'SCREEN', screen: 'Dashboard', step: 'DATA LOAD START', ctx: { source: 'get-today-time-stats' } }); } catch { }

        if (!global.supabaseService && !global.supabase) {
          console.log('⚠️ [TODAY-TIME-STATS] No Supabase service available');
          return { totalTime: 0, error: 'No database connection' };
        }

        const supabase = global.supabaseService || global.supabase;
        const userId = global.currentUserId || config.user_id || '0c3d3092-913e-436f-a352-3378e558c34f';

        // Get today's date range
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        try { const { logger } = require('./modules/utils/logger'); logger && logger.debug({ category: 'DB', step: 'SELECT time_logs', ctx: { userId, startOfDay: startOfDay.toISOString(), endOfDay: endOfDay.toISOString() } }); } catch { }

        // Query time logs for today (include id for stale session filtering)
        const { data: timeLogs, error } = await supabase
          .from('time_logs')
          .select('id, start_time, end_time')
          .eq('user_id', userId)
          .gte('start_time', startOfDay.toISOString())
          .lt('start_time', endOfDay.toISOString())
          .order('start_time', { ascending: false });

        if (error) {
          console.error('❌ [TODAY-TIME-STATS] Database error:', error);
          return { totalTime: 0, error: error.message };
        }

        try { const { logger } = require('./modules/utils/logger'); logger && logger.debug({ category: 'DB', step: 'SELECT RESULT', ctx: { rows: timeLogs?.length || 0 } }); } catch { }

        let totalSeconds = 0;

        // FIX-7: Only treat the CURRENT active session as ongoing.
        // Stale unclosed sessions (from crashes, etc.) should be skipped,
        // matching the DataStatsManager pattern.
        const currentTimeLogId = global.currentTimeLogId || global.trackingManager?.currentTimeLogId || null;

        if (timeLogs && timeLogs.length > 0) {
          timeLogs.forEach(log => {
            if (log.start_time && log.end_time) {
              const start = new Date(log.start_time);
              const end = new Date(log.end_time);
              const duration = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
              totalSeconds += duration;
            } else if (log.start_time && !log.end_time) {
              // FIX-7: Only count the current active session as ongoing.
              // Skip stale unclosed sessions to prevent inflated totals.
              if (currentTimeLogId && log.id === currentTimeLogId) {
                const start = new Date(log.start_time);
                const now = new Date();
                const duration = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
                totalSeconds += duration;
              }
              // else: stale unclosed session — skip
            }
          });
        }

        try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'SCREEN', screen: 'Dashboard', step: 'DATA LOAD END', ctx: { source: 'get-today-time-stats', total_seconds: totalSeconds, rows: timeLogs?.length || 0 } }); } catch { }

        return {
          totalTime: totalSeconds,
          timeLogsCount: timeLogs?.length || 0,
          userId: userId,
          date: today.toISOString().split('T')[0]
        };

      } catch (error) {
        try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'SCREEN', screen: 'Dashboard', step: 'DATA LOAD ERROR', message: error.message, ctx: { source: 'get-today-time-stats' } }); } catch { }
        return { totalTime: 0, error: error.message };
      }
    });
  }

  // Get weekly time statistics for dashboard
  // DataStatsManager handles weekly stats - fallback removed
  if (false) { // Disabled - DataStatsManager handles this
    console.log('⚠️ [MAIN] DataStatsManager not available, registering fallback weekly handler');
    ipcMain.handle('get-weekly-time-stats', async () => {
      try {
        try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'SCREEN', screen: 'Dashboard', step: 'DATA LOAD START', ctx: { source: 'get-weekly-time-stats' } }); } catch { }

        if (!global.supabaseService && !global.supabase) {
          console.log('⚠️ [WEEKLY-TIME-STATS] No Supabase service available');
          return { totalTime: 0, dailyBreakdown: [], error: 'No database connection' };
        }

        const supabase = global.supabaseService || global.supabase;
        const userId = global.currentUserId || config.user_id || '0c3d3092-913e-436f-a352-3378e558c34f';

        // Get this week's date range (Sunday to Saturday)
        const today = new Date();
        const dayOfWeek = today.getDay();
        const sundayOffset = -dayOfWeek; // Sunday is 0, so go back by dayOfWeek days
        const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + sundayOffset);
        const saturday = new Date(sunday.getTime() + 6 * 24 * 60 * 60 * 1000);

        try { const { logger } = require('./modules/utils/logger'); logger && logger.debug({ category: 'DB', step: 'SELECT weekly time_logs', ctx: { userId, sunday: sunday.toISOString(), saturday: saturday.toISOString() } }); } catch { }

        // Query time logs that overlap this week
        // We fetch a slightly wider window and clamp in JS to handle boundary-spanning sessions
        const weekStartIso = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()).toISOString();
        const weekEndExclusive = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() + 1); // next day 00:00
        const weekEndIso = weekEndExclusive.toISOString();
        const { data: timeLogs, error } = await supabase
          .from('time_logs')
          .select('start_time, end_time')
          .eq('user_id', userId)
          .gte('start_time', weekStartIso) // started after or on week start
          .lt('start_time', weekEndIso) // started before week end
          .order('start_time', { ascending: true });

        if (error) {
          console.error('❌ [WEEKLY-TIME-STATS] Database error:', error);
          return { totalTime: 0, dailyBreakdown: [], error: error.message };
        }

        try { const { logger } = require('./modules/utils/logger'); logger && logger.debug({ category: 'DB', step: 'SELECT WEEKLY RESULT', ctx: { rows: timeLogs?.length || 0 } }); } catch { }

        let totalSeconds = 0;
        const dailyBreakdown = [];

        // Initialize daily breakdown for the week
        for (let i = 0; i < 7; i++) {
          const date = new Date(sunday.getTime() + i * 24 * 60 * 60 * 1000);
          dailyBreakdown.push({
            date: date.toISOString().split('T')[0],
            dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
            totalTime: 0,
            sessions: 0
          });
        }

        const clampSeconds = (a, b, c, d) => {
          const start = Math.max(a, c);
          const end = Math.min(b, d);
          return Math.max(0, end - start);
        };
        if (timeLogs && timeLogs.length > 0) {
          const weekStartMs = new Date(weekStartIso).getTime();
          const weekEndMs = new Date(weekEndIso).getTime();
          timeLogs.forEach(log => {
            if (!log.start_time) return;
            const startMs = new Date(log.start_time).getTime();
            const endMs = log.end_time ? new Date(log.end_time).getTime() : Date.now();
            // Skip logs that end before week start
            if (endMs <= weekStartMs) return;
            // Skip logs that start after week end
            if (startMs >= weekEndMs) return;

            // Distribute duration across each day in the week
            for (let i = 0; i < 7; i++) {
              const dayStart = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).getTime();
              const dayEnd = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i + 1).getTime();
              const sec = Math.floor(clampSeconds(startMs, endMs, dayStart, dayEnd) / 1000);
              if (sec > 0) {
                dailyBreakdown[i].totalTime += sec;
                dailyBreakdown[i].sessions += 1;
                totalSeconds += sec;
              }
            }
          });
        }

        try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'SCREEN', screen: 'Dashboard', step: 'DATA LOAD END', ctx: { source: 'get-weekly-time-stats', total_seconds: totalSeconds, rows: timeLogs?.length || 0 } }); } catch { }

        return {
          totalTime: totalSeconds,
          dailyBreakdown: dailyBreakdown,
          timeLogsCount: timeLogs?.length || 0,
          userId: userId,
          weekStart: monday.toISOString().split('T')[0],
          weekEnd: sunday.toISOString().split('T')[0]
        };

      } catch (error) {
        try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'SCREEN', screen: 'Dashboard', step: 'DATA LOAD ERROR', message: error.message, ctx: { source: 'get-weekly-time-stats' } }); } catch { }
        return { totalTime: 0, dailyBreakdown: [], error: error.message };
      }
    });
  }

  // Get monthly time statistics for dashboard
  // DataStatsManager handles monthly stats - fallback removed
  if (false) { // Disabled - DataStatsManager handles this
    console.log('⚠️ [MAIN] DataStatsManager not available, registering fallback monthly handler');
    ipcMain.handle('get-monthly-time-stats', async () => {
      try {
        try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'SCREEN', screen: 'Dashboard', step: 'DATA LOAD START', ctx: { source: 'get-monthly-time-stats' } }); } catch { }

        if (!global.supabaseService && !global.supabase) {
          console.log('⚠️ [MONTHLY-TIME-STATS] No Supabase service available');
          return { totalTime: 0, weeklyBreakdown: [], error: 'No database connection' };
        }

        const supabase = global.supabaseService || global.supabase;
        const userId = global.currentUserId || config.user_id || '0c3d3092-913e-436f-a352-3378e558c34f';

        // Get this month's date range
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        try { const { logger } = require('./modules/utils/logger'); logger && logger.debug({ category: 'DB', step: 'SELECT monthly time_logs', ctx: { userId, startOfMonth: startOfMonth.toISOString(), endOfMonth: endOfMonth.toISOString() } }); } catch { }

        // Query time logs that overlap this month, clamp in JS
        const monthStartIso = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), 1).toISOString();
        const monthEndExclusive = new Date(endOfMonth.getFullYear(), endOfMonth.getMonth(), endOfMonth.getDate() + 1);
        const monthEndIso = monthEndExclusive.toISOString();
        const { data: timeLogs, error } = await supabase
          .from('time_logs')
          .select('start_time, end_time')
          .eq('user_id', userId)
          .gte('start_time', monthStartIso) // started after or on month start
          .lt('start_time', monthEndIso)
          .order('start_time', { ascending: true });

        if (error) {
          console.error('❌ [MONTHLY-TIME-STATS] Database error:', error);
          return { totalTime: 0, weeklyBreakdown: [], error: error.message };
        }

        try { const { logger } = require('./modules/utils/logger'); logger && logger.debug({ category: 'DB', step: 'SELECT MONTHLY RESULT', ctx: { rows: timeLogs?.length || 0 } }); } catch { }

        let totalSeconds = 0;
        const weeklyBreakdown = [];

        // Calculate weeks in the month
        const firstDay = new Date(startOfMonth);
        const lastDay = new Date(endOfMonth);
        let currentWeek = new Date(firstDay);

        while (currentWeek <= lastDay) {
          const weekStart = new Date(currentWeek);
          const weekEnd = new Date(Math.min(currentWeek.getTime() + 6 * 24 * 60 * 60 * 1000, lastDay.getTime()));

          weeklyBreakdown.push({
            weekStart: weekStart.toISOString().split('T')[0],
            weekEnd: weekEnd.toISOString().split('T')[0],
            totalTime: 0,
            days: 0
          });

          currentWeek.setDate(currentWeek.getDate() + 7);
        }

        if (timeLogs && timeLogs.length > 0) {
          const monthStartMs = new Date(monthStartIso).getTime();
          const monthEndMs = new Date(monthEndIso).getTime();
          timeLogs.forEach(log => {
            if (!log.start_time) return;
            const startMs = new Date(log.start_time).getTime();
            const endMs = log.end_time ? new Date(log.end_time).getTime() : Date.now();
            if (endMs <= monthStartMs || startMs >= monthEndMs) return;

            // Distribute across weeks in this month breakdown
            weeklyBreakdown.forEach((week) => {
              const wStartMs = new Date(week.weekStart + 'T00:00:00.000Z').getTime();
              const wEndMs = new Date(week.weekEnd + 'T23:59:59.999Z').getTime();
              const sec = Math.max(0, Math.floor((Math.min(endMs, wEndMs + 1) - Math.max(startMs, wStartMs)) / 1000));
              if (sec > 0) {
                week.totalTime += sec;
                totalSeconds += sec;
              }
            });
          });
        }

        try { const { logger } = require('./modules/utils/logger'); logger && logger.info({ category: 'SCREEN', screen: 'Dashboard', step: 'DATA LOAD END', ctx: { source: 'get-monthly-time-stats', total_seconds: totalSeconds, rows: timeLogs?.length || 0 } }); } catch { }

        return {
          totalTime: totalSeconds,
          weeklyBreakdown: weeklyBreakdown,
          timeLogsCount: timeLogs?.length || 0,
          userId: userId,
          monthStart: startOfMonth.toISOString().split('T')[0],
          monthEnd: endOfMonth.toISOString().split('T')[0]
        };

      } catch (error) {
        try { const { logger } = require('./modules/utils/logger'); logger && logger.error({ category: 'SCREEN', screen: 'Dashboard', step: 'DATA LOAD ERROR', message: error.message, ctx: { source: 'get-monthly-time-stats' } }); } catch { }
        return { totalTime: 0, weeklyBreakdown: [], error: error.message };
      }
    });
  }

  // Get user profile information
  ipcMain.handle('get-user-profile', async () => {
    try {
      if (!global.supabaseService && !global.supabase) {
        return { error: 'No database connection' };
      }

      const supabase = global.supabaseService || global.supabase;
      const userId = global.currentUserId || config.user_id;

      if (!userId) {
        return { error: 'No user ID available' };
      }

      const { data: userProfile, error } = await supabase
        .from('users')
        .select('id, email, full_name, role')
        .eq('id', userId)
        .maybeSingle();

      if (error && (!error.status || error.status !== 406)) {
        console.error('❌ [USER-PROFILE] Database error:', error);
        return { error: error.message };
      }

      return {
        success: true,
        profile: userProfile || null
      };

    } catch (error) {
      console.error('❌ [USER-PROFILE] Error:', error.message);
      return { error: error.message };
    }
  });

  // Authentication: Set user session in main process Supabase clients for RLS compliance
  try { ipcMain.removeHandler('auth:set-session'); } catch { }
  ipcMain.handle('auth:set-session', async (event, { access_token, refresh_token }) => {
    try {
      // Set session on all Supabase clients in main process
      const clients = [
        global.supabase,
        global.supabaseService,
        global.enhancedSyncManager?.supabase,
        global.syncManager?.supabase
      ].filter(Boolean);

      const results = [];
      for (const client of clients) {
        if (client?.auth?.setSession) {
          const result = await client.auth.setSession({
            access_token,
            refresh_token: refresh_token || null
          });
          results.push({ client: client.constructor.name || 'unknown', success: !result.error, error: result.error?.message });
        }
      }

      // NEW: resolve current user and sync globals/config
      try {
        const { data: { user } = {} } = await (global.supabase || global.supabaseService).auth.getUser();
        if (user?.id) {
          global.currentUserId = user.id;
          if (global.config) global.config.user_id = user.id;
          console.log('🔐 [AUTH] Current user set:', user.id);
        } else {
          console.log('⚠️ [AUTH] Could not resolve user after setSession');
        }
      } catch (e) {
        console.log('⚠️ [AUTH] getUser failed:', e.message);
      }

      console.log('🔐 [AUTH] Set session on Supabase clients:', results.length);

      // Trigger pending session recovery now that auth is established
      if (global._runPendingSessionRecovery) {
        global._runPendingSessionRecovery().catch(() => {});
      }

      return { success: true, results };
    } catch (error) {
      console.log('❌ [AUTH] Failed to set session:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Sync: Force immediate sync of queued data
  try { ipcMain.removeHandler('sync:now'); } catch { }
  ipcMain.handle('sync:now', async () => {
    try {
      const syncManager = global.enhancedSyncManager || global.syncManager;
      if (!syncManager || typeof syncManager.syncQueue !== 'function') {
        return { success: false, error: 'Sync manager not available' };
      }

      const result = await syncManager.syncQueue();
      const stats = {
        screenshots: result?.screenshots?.synced || 0,
        app_logs: result?.app_logs?.synced || 0,
        url_logs: result?.url_logs?.synced || 0,
        activity_logs: result?.activity_logs?.synced || 0,
        time_logs: result?.time_logs?.synced || 0,
        errors: (result?.screenshots?.errors?.length || 0) + (result?.app_logs?.errors?.length || 0) + (result?.url_logs?.errors?.length || 0)
      };

      console.log('🔄 [SYNC] Forced sync completed:', stats);
      return { success: true, stats, details: result };
    } catch (error) {
      console.log('❌ [SYNC] Forced sync failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  // macOS Permissions: Check automation permissions
  try { ipcMain.removeHandler('permissions:check-automation'); } catch { }
  ipcMain.handle('permissions:check-automation', async () => {
    try {
      if (process.platform !== 'darwin') {
        return { automationAllowed: true, reason: 'Non-macOS platform' };
      }

      const { execSync } = require('child_process');
      const testScript = 'tell application "Safari" to get name';

      execSync(`/usr/bin/osascript -e '${testScript}'`, {
        timeout: 5000,
        stdio: ['ignore', 'ignore', 'ignore']
      });

      return { automationAllowed: true };
    } catch (error) {
      const isPermissionError = error.message.includes('not allowed assistive access') ||
        error.message.includes('Application isn\'t running') ||
        error.code === 1;
      return {
        automationAllowed: false,
        error: error.message,
        isPermissionError
      };
    }
  });

  // Debug: Get last URL extraction error
  try { ipcMain.removeHandler('debug:get-last-url-error'); } catch { }
  ipcMain.handle('debug:get-last-url-error', async () => {
    return {
      lastError: global.lastUrlError || null,
      lastExtraction: global.lastUrlExtraction || null,
      timestamp: global.lastUrlErrorTime || null
    };
  });

  // Open a URL in Safari for testing URL detection and DB logging (macOS only)
  try { ipcMain.removeHandler('test:open-safari-url'); } catch { }
  ipcMain.handle('test:open-safari-url', async (event, { url } = {}) => {
    try {
      const targetUrl = url || 'https://example.com/';
      if (process.platform !== 'darwin') {
        // Fallback: open via default browser on non-macOS
        const { shell } = require('electron');
        await shell.openExternal(targetUrl);
        return { success: true, method: 'shell.openExternal', platform: process.platform };
      }

      // macOS: try AppleScript to ensure Safari is used
      const { execSync } = require('child_process');
      const osa = `/usr/bin/osascript -e 'tell application "Safari" to activate' -e 'delay 0.2' -e 'tell application "Safari" to open location "${targetUrl.replace(/"/g, '\\"')}"'`;
      execSync(osa, { stdio: 'ignore' });

      // Optionally set focus on Safari front window
      try {
        execSync("/usr/bin/osascript -e 'tell application \"System Events\" to tell process \"Safari\" to set frontmost to true'", { stdio: 'ignore' });
      } catch { }

      return { success: true, method: 'osascript', platform: 'darwin' };
    } catch (error) {
      console.error('❌ [TEST] Failed to open Safari URL:', error);
      return { success: false, error: error.message };
    }
  });

  // Debug: force a URL capture via the active manager and wrappers if available
  try { ipcMain.removeHandler('debug:force-url-capture'); } catch { }
  ipcMain.handle('debug:force-url-capture', async () => {
    try {
      // Ensure URL manager exists so capture goes through the unified pipeline
      if (!global.browserUrlManager) {
        try {
          const BrowserUrlManager = require('./modules/capture/browser-url-manager.wrapper');
          const mainWindowRef = global.mainWindow || (global.appLifecycleManager && global.appLifecycleManager.getMainWindow && global.appLifecycleManager.getMainWindow());
          global.browserUrlManager = new BrowserUrlManager(global.config || {}, { syncManager: global.enhancedSyncManager || global.syncManager });
          global.browserUrlManager.initialize({ mainWindow: mainWindowRef, systemMonitor: global.systemMonitor, isTracking: !!global.isTracking, currentTimeLogId: global.currentTimeLogId, lastActivity: global.lastActivity || Date.now() });
          console.log('✅ [DEBUG] BrowserUrlManager created on demand for force-url-capture');
        } catch (e) {
          console.log('❌ [DEBUG] Failed to create BrowserUrlManager:', e.message);
        }
      }

      if (global.browserUrlManager && typeof global.browserUrlManager.smartUrlCapture === 'function') {
        await global.browserUrlManager.smartUrlCapture();
        return { success: true, via: 'browserUrlManager.smartUrlCapture' };
      }
      if (global.wrappers && typeof global.wrappers.smartUrlCapture === 'function') {
        await global.wrappers.smartUrlCapture();
        return { success: true, via: 'wrappers.smartUrlCapture' };
      }
      return { success: false, error: 'No URL capture available' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Force start monitoring systems for testing (even when not tracking)
  ipcMain.handle('force-start-monitoring', async () => {
    console.log('🚀 [FORCE-MONITORING] Starting monitoring systems for testing...');

    const results = {
      appDetection: false,
      urlDetection: false,
      screenshots: false
    };

    try {
      // Force start app detection
      if (global.enhancedAppDetector) {
        global.enhancedAppDetector.isTracking = true; // Override tracking requirement
        global.enhancedAppDetector.startAppCapture();
        results.appDetection = true;
        console.log('✅ [FORCE-MONITORING] App detection started');
      }

      // Force start URL detection (idempotent; will defer if not tracking)
      if (global.browserUrlManager) {
        if (typeof global.browserUrlManager.startUrlCapture === 'function') {
          await global.browserUrlManager.startUrlCapture();
        }
        results.urlDetection = true;
        console.log('✅ [FORCE-MONITORING] URL detection start requested');
      }

      // Force start screenshot monitoring
      if (global.enhancedScreenshotManager) {
        global.enhancedScreenshotManager.startAutomaticCapture();
        results.screenshots = true;
        console.log('✅ [FORCE-MONITORING] Screenshot monitoring started');
      }

      console.log('🚀 [FORCE-MONITORING] Results:', results);
      return results;
    } catch (error) {
      console.error('❌ [FORCE-MONITORING] Error:', error);
      return { error: error.message, results };
    }
  });

  // Debug tracking status moved to modules/debug/debug-handler-manager.js

  // Simple capture-screenshot handler for renderer test button
  try { ipcMain.removeHandler('capture-screenshot'); } catch { }
  ipcMain.handle('capture-screenshot', async (_event, { source } = {}) => {
    try {
      const mgr = global.enhancedScreenshotManager || global.screenshotManager;
      if (!mgr) {
        return { success: false, error: 'Screenshot manager not available' };
      }
      if (typeof mgr.requestScreenshot === 'function') {
        const res = await mgr.requestScreenshot(source || 'manual');
        return { success: true, data: res };
      }
      if (typeof mgr.captureScreenshot === 'function') {
        const res = await mgr.captureScreenshot(false);
        return { success: true, data: res };
      }
      return { success: false, error: 'No capture method found on screenshot manager' };
    } catch (e) {
      console.error('❌ [SCREENSHOT] capture-screenshot failed:', e);
      return { success: false, error: e.message };
    }
  });

  // === DUPLICATE TRACKING HANDLERS REMOVED ===
  // Using original tracking handlers from lines 3163-3198

  // === LOG AND REPORT HANDLERS ===
  // Large get-activity-logs handler moved to modules/ipc/advanced-ipc-handlers.js

  // get-system-logs handler moved to modules/ipc/advanced-ipc-handlers.js

  // get-screenshot-logs handler moved to modules/ipc/advanced-ipc-handlers.js

  // get-compatibility-report handler moved to modules/ipc-handlers.js


  // fetch-screenshots handler moved to modules/ipc/data-stats-manager.js

  // set-current-user-id handler moved to modules/ipc/data-stats-manager.js

  // get-url-activity handler moved to modules/ipc/data-stats-manager.js

  // get-app-activity handler moved to modules/ipc/data-stats-manager.js

  // get-screenshot-activity handler moved to modules/ipc/data-stats-manager.js

  // fetch-screenshots-enhanced handler moved to modules/ipc/data-stats-manager.js

  console.log('✅ Desktop Agent main process initialized with log download handlers');



  // === DUPLICATE HANDLERS REMOVED ===
  // Using original handlers from lines 3208-3217

  // get-config handler moved to modules/ipc/data-stats-manager.js

  // get-stats handler moved to modules/ipc/data-stats-manager.js

  // === COMPREHENSIVE DEBUG CONSOLE TEST HANDLERS ===

  // === DEBUG TEST HANDLERS ===
  // Debug handlers moved to modules/debug/debug-handler-manager.js

  // Test database connection
  // debug-test-database handler moved to modules/debug/debug-handler-manager.js

  // debug-test-screen-permission handler moved to modules/debug/debug-handler-manager.js

  // debug-test-accessibility-permission handler moved to modules/debug/debug-handler-manager.js

  // Test input monitoring
  // debug-test-input-monitoring handler moved to modules/debug/debug-handler-manager.js

  // debug-test-idle-detection handler moved to modules/debug/debug-handler-manager.js

  // debug-get-status handler moved to modules/debug/debug-handler-manager.js

  // debug-test-activity handler moved to modules/debug/debug-handler-manager.js

  // Duplicate health check handlers removed - using enhanced versions below

  // Enhanced system state tracking - MOVED TO TOP OF FILE FOR PROPER SCOPE
  // Variables moved to top to avoid hoisting issues

  // System suspend handler
  // handleSystemSuspend moved to modules/system/lifecycle-manager.js

  // System resume handler
  // handleSystemResume moved to modules/system/lifecycle-manager.js

  // System shutdown handler
  // handleSystemShutdown moved to modules/system/lifecycle-manager.js

  // CRITICAL FIX: Emergency memory cleanup function
  // emergencyMemoryCleanup moved to modules/system/lifecycle-manager.js

  // Memory management functions moved to modules/system/memory-manager.js

  // Clear all intervals function moved to modules/system/memory-manager.js
  function clearAllIntervals() {
    return global.memoryManager?.clearAllIntervals();
  }

  // Pause only screenshots (for screen lock)
  function pauseScreenshotsOnly() {
    console.log('📸 Pausing screenshots only (screen locked)');
    screenshotsPaused = true;

    if (screenshotInterval) {
      clearTimeout(screenshotInterval);
      screenshotInterval = null;
    }
  }

  // Resume only screenshots (for screen unlock)
  function resumeScreenshotsOnly() {
    console.log('📸 Resuming screenshots (screen unlocked)');
    screenshotsPaused = false;

    if (global.isTracking && global.currentSession) {
      scheduleRandomScreenshot();
    }
  }

  // Save system state
  function saveSystemState() {
    const state = {
      isTracking,
      isPaused,
      currentSession,
      currentTimeLogId,
      suspendTime,
      activityStats,
      lastActivity
    };

    try {
      fs.writeFileSync(path.join(__dirname, '../system-state.json'), JSON.stringify(state, null, 2));
      console.log('💾 System state saved');
    } catch (error) {
      console.error('❌ Failed to save system state:', error);
    }
  }

  // Save pending data
  function savePendingData() {
    try {
      // Use user data directory instead of app.asar path
      const os = require('os');
      const userDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
      const appDataDir = path.join(userDataDir, 'Alyson Work Time');

      // Ensure directory exists
      if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true });
      }

      // Save offline queue
      const queueFile = path.join(appDataDir, 'offline-queue.json');
      fs.writeFileSync(queueFile, JSON.stringify(offlineQueue, null, 2));

      // Save activity stats
      const statsFile = path.join(appDataDir, 'activity-stats.json');
      fs.writeFileSync(statsFile, JSON.stringify(activityStats, null, 2));

      console.log('💾 Pending data saved');
    } catch (error) {
      console.error('❌ Failed to save pending data:', error);
    }
  }

  // Show resume confirmation dialog
  function showResumeConfirmation(suspendMinutes) {
    if (mainWindow) {
      mainWindow.webContents.send('show-resume-confirmation', {
        suspendMinutes,
        message: `Your laptop was closed for ${suspendMinutes} minutes. Would you like to resume time tracking?`
      });
    }
  }

  // === NODE.JS STANDALONE MODE ===
  if (!isElectronContext) {
    console.log('🚀 Starting Alyson PM Agent in Node.js mode...');

    // Initialize components for Node.js mode
    async function initNodeJsMode() {
      try {
        // Initialize basic components
        if (global.systemMonitorModule) {
          global.systemMonitorModule.initSystemMonitor();
        }

        // Initialize sync manager
        if (config && config.supabase_url && config.supabase_key) {
          try {
            syncManager = new SyncManager(config);
            console.log('✅ Sync manager initialized');
          } catch (error) {
            console.log('⚠️ Sync manager initialization failed:', error.message);
            syncManager = null;
          }
        } else {
          console.log('⚠️ Skipping sync manager - incomplete config');
        }

        // Initialize anti-cheat detector
        try {
          antiCheatDetector = new AntiCheatDetector(appSettings, syncManager);
          console.log('✅ Anti-cheat detector initialized');
        } catch (error) {
          console.log('⚠️ Anti-cheat detector initialization failed:', error.message);
          antiCheatDetector = null;
        }

        // Load system state
        loadSystemState();
        loadOfflineQueue();

        // Start basic monitoring without Electron features
        console.log('🔍 Starting basic monitoring in Node.js mode...');

        // Start app capture for testing
        startAppCapture();

        // Start URL capture for testing  
        startUrlCapture();

        // In Node.js mode, create a real tracking session for URL/app capture to work
        if (config && config.user_id) {
          try {
            isTracking = true;
            // Create a real time log entry for testing
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(config.supabase_url, config.supabase_key);

            const timeLogData = {
              user_id: config.user_id,
              project_id: null, // No project for testing
              start_time: new Date().toISOString(),
              is_idle: false,
              status: 'active',
              description: 'Node.js Testing Session'
            };

            const { data, error } = await supabase
              .from('time_logs')
              .insert([timeLogData])
              .select()
              .single();

            if (error) {
              console.log('⚠️ Failed to create time log entry:', error.message);
              console.error('❌ Cannot create tracking session without database connection');
              isTracking = false;
              return;
            } else {
              currentTimeLogId = data.id;
              console.log(`✅ Real tracking session created for Node.js mode: ${currentTimeLogId}`);
            }
          } catch (error) {
            console.log('⚠️ Error creating tracking session:', error.message);
            isTracking = false;
          }
        } else {
          console.log('⚠️ No user_id found - URL capture may not work properly');
        }

        console.log('✅ Alyson PM Agent running in Node.js mode');
        console.log('📊 Monitoring app and URL activity...');

        // Start periodic database status reporting
        startDatabaseStatusReporting();

        // Keep the process alive
        setInterval(() => {
          // Just keep alive, monitoring happens in background
        }, getInterval('NODEJS_KEEPALIVE'));

      } catch (error) {
        console.error('❌ Failed to initialize Node.js mode:', error);
        process.exit(1);
      }
    }

    // Start Node.js mode
    initNodeJsMode();
  }

  // FIXED: Implement proper user session storage in desktop agent

  // User session storage for desktop agent  
  const USER_SESSION_PATH = path.join(isElectronContext ? app.getPath('userData') : process.cwd(), 'desktop-agent-session.json');

  // Session management functions moved to SessionManager module
  // Initialize session manager (will be done in startMainApplication)

  // === ELECTRON IPC HANDLERS (Session Management) ===
  // Permission checking consolidated into system health check at timer start

  if (isElectronContext && ipcMain) {

    // Session management functions moved to modules/auth/session-auth-manager.js

    // User authentication handlers moved to modules/auth/session-auth-manager.js

    // Permission handling moved to modules/auth/session-auth-manager.js

    // All session management and authentication handlers moved to modules/auth/session-auth-manager.js

    // === HEALTH CHECK TEST HANDLERS ===
    // Test handlers moved to modules/testing/test-handler-manager.js

    // Large test database handler moved to modules/ipc/test-database-manager.js



    // Add handler to open system preferences  
    ipcMain.handle('open-system-preferences', async (event, opts) => {
      try {
        const { shell } = require('electron');
        const { openSystemPrivacySettings } = require('./modules/utils/system-settings-opener');
        const options = opts && typeof opts === 'object' ? opts : {};
        const result = await openSystemPrivacySettings(shell, options);
        return { success: true, ...result };
      } catch (error) {
        console.error('❌ Failed to open System Preferences:', error);
        return { success: false, error: error.message };
      }
    });

    // Add handler to open DevTools
    ipcMain.handle('open-devtools', async () => {
      try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          const mainWindow = windows[0];
          mainWindow.webContents.openDevTools({ mode: 'detach' });
          console.log('✅ DevTools opened from IPC handler');
          return { success: true };
        } else {
          console.error('❌ No windows available to open DevTools');
          return { success: false, error: 'No windows available' };
        }
      } catch (error) {
        console.error('❌ Failed to open DevTools:', error);
        return { success: false, error: error.message };
      }
    });

    // === SIMPLIFIED PERMISSION SYSTEM ===
    // Simple screen recording permission check
    ipcMain.handle('check-screen-permission', async () => {
      try {
        return await checkPermissionsStatus();
      } catch (error) {
        console.error('❌ [IPC] Robust screen permission check failed:', error);
        return false;
      }
    });

    // Show simple permission dialog like Hubstaff
    ipcMain.handle('show-permission-dialog', async () => {
      try {
        // Check if user previously skipped
        const skipFile = path.join(app.getPath('userData'), '.permission-skipped');
        if (fs.existsSync(skipFile)) {
          const skipData = fs.readFileSync(skipFile, 'utf8');
          const skipTime = new Date(skipData);
          const hoursSinceSkip = (Date.now() - skipTime) / (1000 * 60 * 60);

          // Don't ask again for 24 hours after skip
          if (hoursSinceSkip < 24) {
            console.log('⏭️ User previously skipped, not asking again');
            return { success: false, skipped: true };
          }
        }

        // Create permission dialog window
        const permissionWindow = new BrowserWindow({
          width: 420,
          height: 380,
          parent: mainWindow,
          modal: true,
          show: false,
          frame: false,
          transparent: true,
          resizable: false,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            spellcheck: false
          }
        });

        // Load permission dialog template
        const templateLoader = require('./utils/template-loader');
        const templateDataURL = templateLoader.getTemplateDataURL('permission-dialog');

        permissionWindow.loadURL(templateDataURL);

        return new Promise((resolve) => {
          let handled = false;

          const handleAction = (event, action) => {
            if (handled) return;
            handled = true;

            permissionWindow.close();

            if (action === 'open-settings') {
              const { shell } = require('electron');
              const { openSystemPrivacySettings } = require('./modules/utils/system-settings-opener');
              openSystemPrivacySettings(shell, { pane: 'screenRecording' }).catch((err) =>
                console.warn('⚠️ Open Screen Recording settings failed:', err?.message || err)
              );
              resolve({ success: true, needsRestart: true });
            } else {
              // Mark as skipped
              fs.writeFileSync(skipFile, new Date().toISOString());
              resolve({ success: false, skipped: true });
            }
          };

          ipcMain.on('permission-action', handleAction);

          permissionWindow.on('closed', () => {
            ipcMain.removeListener('permission-action', handleAction);
            if (!handled) {
              resolve({ success: false, skipped: true });
            }
          });

          // Show window when ready
          permissionWindow.once('ready-to-show', () => {
            permissionWindow.show();
          });
        });

      } catch (error) {
        console.error('❌ Permission dialog failed:', error);
        return { success: false, error: error.message };
      }
    });
  } // End of Electron IPC handlers conditional block

} // End of Electron mode app event handlers

// === URL TRACKING SYSTEM STATUS ===
// URL tracking is handled by the startup manager and UrlCaptureManager
if (isElectronContext) {
  console.log('✅ URL tracking system ready (managed by startup manager)');
}

// REMOVED: Global idle auto-stop watchdog
// Enhanced idle monitor (enhanced-idle-monitor.js) is the single source of truth
// for all idle detection and auto-stop functionality.
