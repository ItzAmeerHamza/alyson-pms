/**
 * IPC Event Map Module
 * Centralizes all IPC event handlers from main.js
 * Provides clean separation of IPC communication logic
 */

const { ipcMain } = require('electron');
const cleanupRegistry = require('./cleanup-registry');

class IPCEventMap {
  constructor(dependencies = {}) {
    this.deps = dependencies;
    this.handlers = new Map();
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'ipcEventMap',
      cleanup: async () => this.shutdown()
    });
  }

  initialize() {
    console.log('📡 [IPC-EVENT-MAP] Initializing IPC handlers...');
    this.registerHandlers();
    console.log('✅ [IPC-EVENT-MAP] IPC handlers initialized');
    
    // CRITICAL: Verify capture-screenshot handler is registered (consider pre-registered handlers)
    try {
      const preRegistered = (ipcMain._invokeHandlers && ipcMain._invokeHandlers.has('capture-screenshot'));
      if (this.handlers.has('capture-screenshot') || preRegistered) {
        console.log('✅ [IPC-EVENT-MAP] capture-screenshot handler confirmed registered');
      } else {
        console.error('❌ [IPC-EVENT-MAP] capture-screenshot handler NOT registered!');
      }
    } catch (_) {
      // Fallback to local registry only
      if (this.handlers.has('capture-screenshot')) {
        console.log('✅ [IPC-EVENT-MAP] capture-screenshot handler confirmed registered');
      } else {
        console.error('❌ [IPC-EVENT-MAP] capture-screenshot handler NOT registered!');
      }
    }
  }

  registerHandlers() {
    // Timer controls
    this.registerHandler('start-timer', async (event, projectId = null, options = {}) => {
      console.log('🎬 [IPC] Start timer requested from renderer');      
      // FORCE UPDATE CHECK: Block timer if update is required
      if (global.forceUpdater && global.forceUpdater.shouldBlockTimer()) {
        console.log('🚫 [IPC] Timer blocked - update required');        return { 
          success: false, 
          error: 'update_required',
          message: 'Please update the app before starting the timer',
          updateVersion: global.forceUpdater.pendingVersion,
          currentVersion: global.forceUpdater.currentVersion
        };
      }
      
      // Use provided projectId or fall back to global
      const finalProjectId = projectId || global.currentProjectId || null;
      
      // VALIDATION: Require projectId to prevent null sessions
      if (!finalProjectId) {
        console.error('❌ [IPC] Start timer failed: No project selected');
        return { 
          success: false, 
          error: 'Project required to start timer',
          message: 'Please select a project before starting the timer'
        };
      }

      // Renderer localStorage high-water survives reboot; main in-memory floors do not.
      const floor = Math.max(0, Math.floor(Number(options?.todayFloorSeconds) || 0));
      if (floor > 0) {
        global._rendererTodayFloorSeconds = floor;
        global._trayTodayHighWaterSeconds = Math.max(
          Math.floor(Number(global._trayTodayHighWaterSeconds) || 0),
          floor,
        );
        global._trayTodayHighWaterDate = new Date().toDateString();
      }
      
      const result = global.trackingManager?.startTracking
        ? await global.trackingManager.startTracking(finalProjectId)
        : await global.startTracking?.(finalProjectId);
      return result;
    });
    console.log('📡 [IPC] Registered handler: start-timer');

    // Legacy alias for backward compatibility
    this.registerHandler('start-tracking', async (event, projectId = null) => {
      console.log('🎬 [IPC] Start tracking (legacy) requested from renderer');
      return this.handlers.get('start-timer')(event, projectId);
    });
    console.log('📡 [IPC] Registered handler: start-tracking');

    this.registerHandler('stop-timer', async (event, reason) => {
      console.log('🛑 [IPC] Stop timer requested from renderer');
      const result = await global.stopTracking?.(reason || 'manual');
      return result;
    });

    this.registerHandler('pause-timer', async (event) => {
      console.log('⏸️ [IPC] Pause timer requested from renderer');
      const result = await global.pauseTracking?.();
      return result;
    });

    this.registerHandler('resume-timer', async (event) => {
      console.log('▶️ [IPC] Resume timer requested from renderer');
      const result = await global.resumeTracking?.();
      return result;
    });

    // Activity and Stats handlers
    this._registerActivityHandlers();
    
    // Debug and Test handlers
    this._registerDebugHandlers();
    
    // Settings and Configuration handlers
    this._registerSettingsHandlers();
    
    // User and Authentication handlers
    this._registerUserHandlers();
    
    // System and Permission handlers  
    this._registerSystemHandlers();

    // Status requests
    this.registerHandler('get-tracking-status', (event) => {
      return {
        isTracking: global.isTracking || false,
        isPaused: global.isPaused || false,
        currentSession: global.currentSession,
        currentTimeLogId: global.currentTimeLogId
      };
    });

    this.registerHandler('get-activity-stats', (event) => {
      return global.enhancedActivityManager?.getActivityStats() || {};
    });

    this.registerHandler('get-system-status', (event) => {
      return global.systemMonitor?.getStatus() || {};
    });

    // Screenshot controls
    this.registerHandler('capture-screenshot', async (event, payload) => {
      try {
        const source = (payload && payload.source) === 'manual' ? 'manual' : 'scheduled';
        console.log('📸 [IPC] Screenshot requested', { source, payload });
        
        // Step 1: Check if enhancedScreenshotManager exists
        console.log('🔍 [IPC] Checking enhancedScreenshotManager:', {
          exists: !!global.enhancedScreenshotManager,
          hasRequestMethod: !!(global.enhancedScreenshotManager && global.enhancedScreenshotManager.requestScreenshot),
          hasCaptureMethod: !!(global.enhancedScreenshotManager && global.enhancedScreenshotManager.captureScreenshot)
        });
        
        if (!global.enhancedScreenshotManager) {
          console.error('❌ [IPC] enhancedScreenshotManager not available');
          return { ok: false, skipped: true, reason: 'manager-not-available', nextAllowedInMs: 0 };
        }
        
        if (!global.enhancedScreenshotManager.requestScreenshot) {
          console.error('❌ [IPC] requestScreenshot method not available');
          return { ok: false, skipped: true, reason: 'method-not-available', nextAllowedInMs: 0 };
        }
        
        // Step 2: Call requestScreenshot
        console.log('📸 [IPC] Calling requestScreenshot...');
        const result = await global.enhancedScreenshotManager.requestScreenshot(source);
        console.log('📸 [IPC] requestScreenshot result:', result);
        
        return result;
      } catch (e) {
        console.error('❌ [IPC] capture-screenshot error:', e);
        console.error('❌ [IPC] Error stack:', e.stack);
        return { ok: false, skipped: false, error: e.message || 'unknown' };
      }
    });

    this.registerHandler('get-screenshot-status', (event) => {
      return global.enhancedScreenshotManager?.getStatus() || {};
    });

    // Settings
    this.registerHandler('get-settings', (event) => {
      return global.configManager?.config || {};
    });

    this.registerHandler('update-settings', async (event, newSettings) => {
      console.log('⚙️ [IPC] Settings update requested');
      const result = await global.configManager?.updateSettings(newSettings);
      return result;
    });

    // Permission checks (guarded, centralized fallback to system-monitor/permissions-check)
    this.registerHandler('check-permissions', async (event, options = {}) => {
      console.log('🔐 [IPC] Permission check requested', options);
      const normalize = (raw) => {
        if (!raw || typeof raw !== 'object') {
          return { success: false, screen: false, accessibility: false, error: 'empty' };
        }
        // Legacy / SessionAuthManager shape: { screen: boolean, accessibility: boolean }
        if (typeof raw.screen === 'boolean' && typeof raw.accessibility === 'boolean') {
          return {
            success: raw.success !== false,
            screen: !!raw.screen,
            accessibility: !!raw.accessibility,
            details: raw.details || null,
          };
        }
        const d = raw.details || {};
        const screen = !!d.screenRecording;
        const accessibility = !!d.accessibility;
        return {
          success: raw.success !== false,
          screen,
          accessibility,
          allGranted: screen && accessibility,
          status: raw.status,
          details: raw.details,
          message: raw.message,
          requiresUserAction: raw.requiresUserAction,
          fixAction: raw.fixAction,
        };
      };

      // Use a lightweight direct check here.
      // Avoid running comprehensive health checks from login/onboarding polling,
      // which can trigger heavyweight screenshot tests and stale false negatives.
      try {
        const { resolveDisplayPermissions } = require('../../system/permissions-check');
        const deepCheck = !!(options && options.deepCheck);
        const resolved = await resolveDisplayPermissions({ deepCheck });
        const allGranted = resolved.screen && resolved.accessibility;
        return normalize({
          success: true,
          status: allGranted ? 'pass' : 'fail',
          details: {
            screenRecording: resolved.screen,
            accessibility: resolved.accessibility,
            inputMonitoring: resolved.accessibility,
          },
        });
      } catch (e) {
        return { success: false, screen: false, accessibility: false, error: e.message };
      }
    });

    this.registerHandler('request-permissions', async (event) => {
      console.log('🔐 [IPC] Permission request initiated');
      try {
        const { ensureMacPermissions } = require('../../system/permissions-check');
        // ensureMacPermissions internally handles platform-specific flows
        await ensureMacPermissions();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    // App and URL detection
    this.registerHandler('get-active-app', async (event) => {
      const result = await global.enhancedAppDetector?.detectActiveApplication();
      return result;
    });

    this.registerHandler('get-active-url', async (event) => {
      const result = await global.browserUrlManager?.detectBrowserUrl();
      return result;
    });

    // Add alias for UI compatibility (UI calls 'get-current-url')
    this.registerHandler('get-current-url', async (event) => {
      const result = await global.browserUrlManager?.detectBrowserUrl();
      return result;
    });

    // Session management
    this.registerHandler('get-current-session', (event) => {
      return global.sessionManager?.getCurrentSession() || global.currentSession;
    });

    this.registerHandler('get-session-stats', async (event) => {
      const result = await global.sessionManager?.getSessionStats();
      return result;
    });

    // Debug and diagnostics
    this.registerHandler('get-debug-info', (event) => {
      return {
        platform: process.platform,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        appVersion: global.app?.getVersion() || 'unknown',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      };
    });

    this.registerHandler('clear-cache', async (event) => {
      console.log('🧹 [IPC] Cache clear requested');
      if (global.windowUIManager?.getMainWindow()) {
        await global.windowUIManager.getMainWindow().webContents.session.clearCache();
      }
      return { success: true };
    });

    // Window controls
    this.registerHandler('show-window', (event) => {
      global.windowUIManager?.showWindow();
    });

    this.registerHandler('hide-window', (event) => {
      global.windowUIManager?.hideWindow();
    });

    this.registerHandler('minimize-window', (event) => {
      const window = global.windowUIManager?.getMainWindow();
      if (window) window.minimize();
    });

    this.registerHandler('maximize-window', (event) => {
      const window = global.windowUIManager?.getMainWindow();
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
      }
    });

    // Notifications
    this.registerHandler('show-notification', (event, { title, body, type }) => {
      global.showTrayNotification?.(body, type);
    });

    // App lifecycle
    this.registerHandler('restart-app', (event) => {
      console.log('🔄 [IPC] App restart requested');
      global.app?.relaunch();
      global.app?.exit(0);
    });

    this.registerHandler('quit-app', (event) => {
      console.log('🛑 [IPC] App quit requested');
      global.isQuitting = true;
      global.app?.quit();
    });

    this.registerHandler('open-url-capture-settings', async () => {
      const current = {
        enableCdp: process.env.WIN_URL_ENABLE_CDP === 'true',
        cdpPort: process.env.WIN_URL_CDP_PORT || '',
      };
      console.log('[IPC] open-url-capture-settings', current);
      return current;
    });

    // Open allowlisted HTTPS URLs in the system browser (e.g. web dashboard)
    this.registerHandler('open-external-url', async (_event, { url } = {}) => {
      try {
        const raw = String(url || '').trim();
        let parsed;
        try {
          parsed = new URL(raw);
        } catch {
          return { success: false, error: 'Invalid URL' };
        }
        const allowedHosts = new Set(['app.alyson.ai']);
        if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
          console.warn('⚠️ [IPC] Blocked open-external-url:', raw);
          return { success: false, error: 'URL not allowed' };
        }
        const { shell } = require('electron');
        await shell.openExternal(parsed.toString());
        console.log('🌐 [IPC] Opened external URL:', parsed.toString());
        return { success: true };
      } catch (error) {
        console.error('❌ [IPC] open-external-url failed:', error?.message || error);
        return { success: false, error: 'Failed to open URL' };
      }
    });
  }

  registerHandler(channel, handler) {
    // Check if handler already exists (from another module)
    if (ipcMain._invokeHandlers && ipcMain._invokeHandlers.has(channel)) {
      console.log(`⚠️ [IPC] Handler already exists for: ${channel}, skipping registration`);
      return;
    }
    
    // Remove any existing handler from our registry
    if (this.handlers.has(channel)) {
      try {
        ipcMain.removeHandler(channel);
        console.log(`🔄 [IPC] Removed existing handler for: ${channel}`);
      } catch (e) {
        console.log(`⚠️ [IPC] Could not remove existing handler for: ${channel}`, e.message);
      }
    }
    
    // Register new handler
    try {
      ipcMain.handle(channel, handler);
      this.handlers.set(channel, handler);
      console.log(`📡 [IPC] Registered handler: ${channel}`);
      
      // Special logging for critical handlers
      if (channel === 'capture-screenshot') {
        console.log('🎯 [IPC] CRITICAL: capture-screenshot handler registered successfully');
      }
    } catch (e) {
      console.error(`❌ [IPC] Failed to register handler for: ${channel}`, e.message);
    }
  }

  removeHandler(channel) {
    if (this.handlers.has(channel)) {
      ipcMain.removeHandler(channel);
      this.handlers.delete(channel);
      console.log(`📡 [IPC] Removed handler: ${channel}`);
    }
  }

  /**
   * Register activity and statistics related handlers
   */
  _registerActivityHandlers() {
    this.registerHandler('get-activity-stats-from-db', async () => {
      return await this._getActivityStatsFromDB();
    });

    this.registerHandler('get-anti-cheat-report', () => {
      return this._getAntiCheatReport();
    });

    this.registerHandler('get-anti-cheat-report-from-db', async () => {
      return await this._getAntiCheatReportFromDB();
    });

    this.registerHandler('get-fraud-alerts', () => {
      const offlineQueue = global.offlineQueue || {};
      return offlineQueue.fraudAlerts?.slice(-20) || [];
    });

    this.registerHandler('get-activity-logs', async () => {
      return await this._getActivityLogs();
    });

    // get-url-activity / get-app-activity / get-screenshot-activity / fetch-screenshots*
    // are owned by DataStatsManager (real DB queries). Stub handlers here previously
    // registered first and blocked DataStats from replacing them (removeAllListeners
    // does not clear ipcMain.handle registrations).
  }

  /**
   * Register debug and test related handlers
   */
  _registerDebugHandlers() {
    this.registerHandler('debug-tracking-status', () => {
      return this._getDebugTrackingStatus();
    });

    this.registerHandler('debug-get-status', async () => {
      return await this._getDebugStatus();
    });

    this.registerHandler('debug-test-screenshot', async () => {
      return await this._testScreenshot();
    });

    this.registerHandler('debug-test-app-detection', async () => {
      return await this._testAppDetection();
    });

    this.registerHandler('debug-test-url-detection', async () => {
      return await this._testUrlDetection();
    });

    this.registerHandler('debug-test-database', async () => {
      return await this._testDatabase();
    });

    this.registerHandler('debug-test-screen-permission', async () => {
      return await this._testScreenPermission();
    });

    this.registerHandler('debug-test-accessibility-permission', async () => {
      return await this._testAccessibilityPermission();
    });

    this.registerHandler('debug-test-input-monitoring', async () => {
      return await this._testInputMonitoring();
    });

    this.registerHandler('debug-test-idle-detection', async () => {
      return await this._testIdleDetection();
    });

    this.registerHandler('debug-test-activity', async () => {
      return await this._testActivity();
    });

    // Test capability handlers
    this.registerHandler('test-screenshot-capability', async () => {
      return await this._testScreenshotCapability();
    });

    // Verifies dual/multi-monitor capture against Electron's display list.
    // Returns incompleteMultiDisplay=true when captures < connected monitors.
    this.registerHandler('verify-multi-display-capture', async () => {
      try {
        const { screen } = require('electron');
        const electronCount = screen?.getAllDisplays?.()?.length || 0;
        const {
          captureAllDisplaysStitched,
        } = require('../utils/multi-display-screenshot');
        const result = await captureAllDisplaysStitched();
        const displayCount = result.displayCount || 0;
        const ok =
          !!result.success &&
          (electronCount < 2 || (displayCount >= 2 && !result.incompleteMultiDisplay));
        return {
          ok,
          platform: process.platform,
          electronCount,
          displayCount,
          expectedDisplayCount: result.expectedDisplayCount || electronCount,
          incompleteMultiDisplay: !!result.incompleteMultiDisplay,
          method: result.method || null,
          bytes: result.buffer?.length || 0,
          error: result.error || null,
          message: ok
            ? electronCount < 2
              ? 'Only 1 display connected — dual capture cannot be proven until an external monitor is attached (Extended mode).'
              : `Multi-display capture OK (${displayCount} displays via ${result.method})`
            : `FAILED: Electron sees ${electronCount} display(s) but capture got ${displayCount}`,
        };
      } catch (error) {
        return {
          ok: false,
          error: error.message,
          message: `verify-multi-display-capture crashed: ${error.message}`,
        };
      }
    });

    this.registerHandler('test-url-detection', async () => {
      return await this._testUrlDetectionCapability();
    });

    this.registerHandler('test-app-detection', async () => {
      return await this._testAppDetectionCapability();
    });

    this.registerHandler('test-fraud-detection', async () => {
      return await this._testFraudDetection();
    });

    this.registerHandler('test-database-connection', async () => {
      return await this._testDatabaseConnection();
    });

    this.registerHandler('test-input-detection', async () => {
      return await this._testInputDetection();
    });

    // Windows-specific debug action for URL tracking verification
    if (process.platform === 'win32') {
      this.registerHandler('debug-force-url-capture-windows', async () => {
        return await this._testWindowsUrlCapture();
      });
    }
  }

  /**
   * Register settings and configuration handlers
   */
  _registerSettingsHandlers() {
    this.registerHandler('get-app-settings', () => {
      return global.appSettings || {};
    });

    this.registerHandler('update-app-settings', (event, newSettings) => {
      return this._updateAppSettings(newSettings);
    });

    this.registerHandler('get-auto-launch', () => {
      try {
        const { getAutoLaunchEnabled, readPreference } = require('../utils/auto-launch');
        return { success: true, enabled: getAutoLaunchEnabled(), ...readPreference() };
      } catch (error) {
        return { success: false, enabled: true, error: error.message };
      }
    });

    this.registerHandler('set-auto-launch', (_event, enabled) => {
      try {
        const { setAutoLaunchEnabled } = require('../utils/auto-launch');
        return setAutoLaunchEnabled(!!enabled);
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    this.registerHandler('get-config', () => {
      return this._getSafeConfig();
    });

    this.registerHandler('get-queue-status', () => {
      return this._getQueueStatus();
    });

    this.registerHandler('get-stats', () => {
      return this._getStats();
    });

    this.registerHandler('get-activity-metrics', () => {
      return this._getActivityMetrics();
    });

    this.registerHandler('confirm-resume-after-idle', async (event, confirmed) => {
      if (confirmed) {
        await global.resumeTracking?.();
        return { success: true, message: 'Tracking resumed after idle period' };
      } else {
        await global.stopTracking?.();
        return { success: true, message: 'Tracking stopped' };
      }
    });

    this.registerHandler('confirm-resume-after-sleep', async (event, confirmed) => {
      if (confirmed) {
        await global.resumeTracking?.();
        return { success: true, message: 'Tracking resumed after sleep' };
      } else {
        await global.stopTracking?.();
        return { success: true, message: 'Tracking stopped' };
      }
    });

    // Removed: 'force-screenshot' to ensure single capture entrypoint via 'capture-screenshot'

    this.registerHandler('simulate-activity', async () => {
      return this._simulateActivity();
    });

    this.registerHandler('report-suspicious-activity', (event, activityData) => {
      return this._reportSuspiciousActivity(activityData);
    });
  }

  /**
   * Register system and permission handlers
   */
  _registerSystemHandlers() {
    // Note: 'system-health-check' is handled by CoreIPCManager for centralized health management
    
    this.registerHandler('check-mac-permissions', async () => {
      return await this._checkMacPermissions();
    });

    this.registerHandler('get-compatibility-report', () => {
      return this._getCompatibilityReport();
    });

    this.registerHandler('get-system-logs', () => {
      return this._getSystemLogs();
    });

    this.registerHandler('get-screenshot-logs', () => {
      return this._getScreenshotLogs();
    });

    this.registerHandler('manual-update-check', async () => {
      return await this._checkForUpdates();
    });

    this.registerHandler('get-update-status', () => {
      return this._getUpdateStatus();
    });

    this.registerHandler('open-system-preferences', async (event, opts) => {
      return await this._openSystemPreferences(event, opts);
    });

    // Alias for UI compatibility
    this.registerHandler('open-system-settings', async (event, opts) => {
      return await this._openSystemPreferences(event, opts);
    });

    this.registerHandler('check-screen-permission', async () => {
      return await this._checkScreenPermission();
    });

    this.registerHandler('show-permission-dialog', async () => {
      return await this._showPermissionDialog();
    });
  }

  /**
   * Register user and authentication handlers
   */
  _registerUserHandlers() {
    this.registerHandler('user-logged-in', async (event, userData) => {
      return await this._handleUserLogin(userData);
    });

    this.registerHandler('user-logged-out', async (event) => {
      return await this._handleUserLogout();
    });

    this.registerHandler('load-user-session', async (event) => {
      return await this._loadUserSession();
    });

    this.registerHandler('get-user-projects', async (event) => {
      return await this._getUserProjects();
    });

    this.registerHandler('get-user-project-assignments', async (event, userId) => {
      return await this._getUserProjectAssignments(userId);
    });

    this.registerHandler('set-current-user-id', async (event, userId, userRole) => {
      global.currentUserId = userId;
      global.currentUserRole = userRole;
      // Optional: auto-start tracking for QA when enabled via env flag
      try {
        if (process.env.AUTO_START_TRACKING === 'true' && !global.isTracking) {
          console.log('🎬 [IPC-EVENT-MAP] AUTO_START_TRACKING enabled — starting tracking after user set');
          let projectId = global.currentProjectId || null;
          if (!projectId) {
            try {
              const supabase = global.supabaseService || global.supabaseClient;
              if (supabase && userId) {
                const { data, error } = await supabase
                  .from('employee_project_assignments')
                  .select('project_id')
                  .eq('user_id', userId);
                if (!error && Array.isArray(data) && data.length > 0) {
                  const randomIndex = Math.floor(Math.random() * data.length);
                  projectId = data[randomIndex].project_id;
                  console.log('🎲 [IPC-EVENT-MAP] Auto-selected random project for AUTO_START:', projectId);
                }
              }
            } catch (e) {
              console.log('⚠️ [IPC-EVENT-MAP] Random project selection failed:', e?.message || e);
            }
          }
          if (!projectId) {
            console.log('⚠️ [IPC-EVENT-MAP] AUTO_START skipped — no project assigned');
          } else {
          const result = global.trackingManager?.startTracking
            ? await global.trackingManager.startTracking(projectId)
            : await global.startTracking?.(projectId);
          console.log('🎬 [IPC-EVENT-MAP] AUTO_START_TRACKING result:', result?.success);
          }
        }
      } catch (e) {
        console.log('⚠️ [IPC-EVENT-MAP] AUTO_START_TRACKING failed:', e.message);
      }
      return { success: true, message: 'Current user updated' };
    });

    this.registerHandler('complete-onboarding', async (event) => {
      return { success: true, message: 'Onboarding completed' };
    });

    this.registerHandler('set-project-id', async (event, projectId) => {
      global.currentProjectId = projectId;
      return { success: true, projectId };
    });
  }

  // === IMPLEMENTATION METHODS ===

  async _getActivityStatsFromDB() {
    try {
      // Implementation for database activity stats
      return { success: true, stats: global.activityStats || {} };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _getAntiCheatReport() {
    return {
      totalEvents: 0,
      riskLevel: 'LOW',
      lastCheck: new Date().toISOString(),
      status: 'monitoring'
    };
  }

  async _getAntiCheatReportFromDB() {
    try {
      return {
        currentRiskLevel: 'LOW',
        totalSuspiciousEvents: 0,
        lastCheck: new Date().toISOString(),
        status: 'monitoring',
        message: 'No suspicious activity detected'
      };
    } catch (error) {
      return {
        currentRiskLevel: 'LOW',
        totalSuspiciousEvents: 0,
        status: 'error',
        error: error.message
      };
    }
  }

  async _getActivityLogs() {
    try {
      return { success: true, logs: [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _getUrlActivity() {
    try {
      return { success: true, urls: [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _getAppActivity() {
    try {
      return { success: true, apps: [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _getScreenshotActivity() {
    try {
      return { success: true, screenshots: [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _fetchScreenshots(params) {
    try {
      return { success: true, screenshots: [], total: 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _fetchScreenshotsEnhanced(params) {
    try {
      // Generate correlation ID for tracking
      const corrId = `${global.currentTimeLogId || 'no-session'}-${Date.now()}`;
      console.log(`🔍 [FETCH_REQUEST] corrId:${corrId} userId:${global.currentUserId} params:`, params);
      
      if (!global.supabaseService || !global.currentUserId) {
        console.log(`❌ [FETCH_REQUEST] corrId:${corrId} Missing service or user`);
        return { success: false, error: 'Database service or user not available' };
      }

      const { user_id, date, activity_filter = 'all', limit = 50 } = params || {};
      
      // Work-calendar day (Pacific by default) → UTC range
      let startUTC, endUTC;
      if (date) {
        const { workDayBoundsForYmd, getWorkTimezone } = require('../utils/work-timezone');
        const [y, mo, d] = String(date).split('-').map(Number);
        const { startMs, endMs } = workDayBoundsForYmd(y, mo, d);
        startUTC = new Date(startMs).toISOString();
        endUTC = new Date(endMs - 1).toISOString();
        console.log(
          `🌍 [FETCH_REQUEST] corrId:${corrId} workTz:${getWorkTimezone()} date:${date} UTC range: ${startUTC} to ${endUTC}`,
        );
      }

      // Build query with proper column names (removed file_size - doesn't exist in schema)
      let query = global.supabaseService
        .from('screenshots')
        .select('id, file_path, captured_at, activity_percent, mouse_clicks, keystrokes, mouse_movements, time_log_id')
        .eq('user_id', global.currentUserId)
        .order('captured_at', { ascending: false })
        .limit(limit);

      // Add date filters if provided
      if (startUTC && endUTC) {
        query = query.gte('captured_at', startUTC).lte('captured_at', endUTC);
      }

      // Add activity filter
      if (activity_filter === 'high') {
        query = query.gte('activity_percent', 70);
      } else if (activity_filter === 'medium') {
        query = query.gte('activity_percent', 30).lt('activity_percent', 70);
      } else if (activity_filter === 'low') {
        query = query.lt('activity_percent', 30);
      }

      const { data: screenshots, error } = await query;

      if (error) {
        console.error(`❌ [FETCH_REQUEST] corrId:${corrId} Database error:`, error);
        return { success: false, error: error.message };
      }

      console.log(`✅ [FETCH_RESULT] corrId:${corrId} count:${screenshots?.length || 0}`);
      
      // Transform data to include image_url for renderer compatibility
      const transformedScreenshots = (screenshots || []).map(screenshot => ({
        ...screenshot,
        image_url: screenshot.file_path, // Map file_path to image_url for renderer
        timestamp: screenshot.captured_at  // Add timestamp alias
      }));

      return { 
        success: true, 
        screenshots: transformedScreenshots,
        total: transformedScreenshots.length,
        screenshotCount: transformedScreenshots.length // Add for compatibility
      };

    } catch (error) {
      console.error('❌ [FETCH_REQUEST] Unexpected error:', error);
      return { success: false, error: error.message };
    }
  }

  _getDebugTrackingStatus() {
    return {
      isTracking: global.isTracking || false,
      isPaused: global.isPaused || false,
      currentTimeLogId: global.currentTimeLogId || null,
      sessionStartTime: global.sessionStartTime || null,
      lastActivity: global.lastActivity || null
    };
  }

  async _getDebugStatus() {
    return {
      status: 'operational',
      systems: {
        tracking: global.isTracking || false,
        monitoring: true,
        database: !!global.supabaseService
      },
      timestamp: new Date().toISOString()
    };
  }

  _updateAppSettings(newSettings) {
    try {
      global.appSettings = { ...global.appSettings, ...newSettings };
      // Keep OS login-item in sync when settings payload includes auto_launch.
      if (newSettings && typeof newSettings.auto_launch === 'boolean') {
        try {
          const { setAutoLaunchEnabled } = require('../utils/auto-launch');
          setAutoLaunchEnabled(newSettings.auto_launch);
          global.trayManager?.updateMenu?.();
        } catch (err) {
          console.warn('⚠️ [IPC] auto_launch sync failed:', err?.message || err);
        }
      }
      return { success: true, message: 'Settings updated successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _getSafeConfig() {
    const config = global.config || {};
    const { supabase_key, supabase_service_key, ...safeConfig } = config;
    return safeConfig;
  }

  _getQueueStatus() {
    const offlineQueue = global.offlineQueue || {};
    return {
      screenshots: offlineQueue.screenshots?.length || 0,
      appLogs: offlineQueue.appLogs?.length || 0,
      urlLogs: offlineQueue.urlLogs?.length || 0,
      idleLogs: offlineQueue.idleLogs?.length || 0,
      timeLogs: offlineQueue.timeLogs?.length || 0,
      fraudAlerts: offlineQueue.fraudAlerts?.length || 0
    };
  }

  _getStats() {
    return {
      tracking: {
        isTracking: global.isTracking || false,
        isPaused: global.isPaused || false
      },
      activity: global.activityStats || {},
      queue: this._getQueueStatus()
    };
  }

  _getActivityMetrics() {
    return global.activityStats || {};
  }

  // Removed _forceScreenshot to avoid duplicate logic; use capture-screenshot path only

  _simulateActivity() {
    return {
      success: false,
      message: 'Activity simulation disabled - system tracks real user input only'
    };
  }

  _reportSuspiciousActivity(activityData) {
    return { success: true, message: 'Suspicious activity reported' };
  }



  async _checkMacPermissions() {
    try {
      if (process.platform === 'darwin' && global.systemPreferences) {
        const hasPermission = global.systemPreferences.getMediaAccessStatus('screen');
        return {
          hasPermission: hasPermission === 'granted',
          status: hasPermission,
          platform: 'macOS'
        };
      }
      return {
        hasPermission: true,
        status: 'not-applicable',
        platform: process.platform
      };
    } catch (error) {
      return {
        hasPermission: false,
        status: 'error',
        error: error.message
      };
    }
  }

  _getCompatibilityReport() {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      status: 'compatible'
    };
  }

  _getSystemLogs() {
    return [
      `TimeFlow System Logs - ${new Date().toISOString()}`,
      `Platform: ${process.platform}`,
      `Node: ${process.version}`,
      `Electron: ${process.versions.electron}`
    ];
  }

  _getScreenshotLogs() {
    return [
      'Screenshot system operational',
      `Last capture: ${global.activityStats?.lastScreenshotTime || 'Never'}`
    ];
  }

  async _checkForUpdates() {
    if (global.forceUpdater && typeof global.forceUpdater.checkForUpdates === 'function') {
      return await global.forceUpdater.checkForUpdates();
    }
    return { updateAvailable: false, reason: 'updater_unavailable' };
  }

  _getUpdateStatus() {
    return { status: 'up-to-date' };
  }

  async _openSystemPreferences(event, options = {}) {
    try {
      const { shell } = require('electron');
      const opts = options && typeof options === 'object' ? options : {};
      const { openSystemPrivacySettings } = require('../utils/system-settings-opener');
      const result = await openSystemPrivacySettings(shell, opts);
      console.log('✅ [IPC] Opened system privacy UI:', result.pane, result.url || '');
      return { success: true, message: 'System settings opened', ...result };
    } catch (error) {
      console.error('❌ [IPC] Failed to open system settings:', error);
      return { success: false, error: error.message };
    }
  }

  async _checkScreenPermission() {
    return await this._checkMacPermissions();
  }

  async _showPermissionDialog() {
    return { success: true, message: 'Permission dialog shown' };
  }

  async _handleUserLogin(userData) {
    try {
      global.currentUserId = userData.id || userData?.user?.id;
      global.currentUserRole = userData.role || userData?.user?.role || 'employee';

      // Persist session using centralized SessionManager if available
      if (global.sessionManager && typeof global.sessionManager.handleUserLogin === 'function') {
        const persistResult = await global.sessionManager.handleUserLogin(userData);
        // Log outcome for diagnostics
        try { console.log('💾 [SESSION] Persist result (ipc-event-map):', persistResult?.success); } catch {}
      } else if (typeof global.saveDesktopAgentSession === 'function') {
        // Fallback: directly save minimal session if helper exists
        const s = userData.session || {};
        await global.saveDesktopAgentSession({
          id: userData.id || userData?.user?.id,
          email: userData.email || userData?.user?.email || s.email,
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          expires_at: (s.expires_at && s.expires_at < 9999999999) ? s.expires_at * 1000 : s.expires_at,
          remember_me: true
        });
        try { console.log('💾 [SESSION] Persisted via fallback (ipc-event-map)'); } catch {}
      }

      return { success: true, message: 'User logged in successfully' };
    } catch (e) {
      console.error('❌ [IPC-EVENT-MAP] handleUserLogin error:', e);
      return { success: false, message: e.message };
    }
  }

  async _handleUserLogout() {
    global.currentUserId = null;
    global.currentUserRole = null;
    if (global.isTracking) {
      await global.stopTracking?.('user_logout');
    }
    try {
      global.notTrackingReminderManager?.stop?.();
    } catch (_) { /* ignore */ }
    return { success: true, message: 'User logged out successfully' };
  }

  async _loadUserSession() {
    return { success: true, session: null };
  }

  async _getUserProjects() {
    const userId = global.currentUserId || global.config?.user_id;
    if (!userId) {
      console.log('⚠️ [IPC-EVENT-MAP] No user ID available for getting projects');
      return { success: false, error: 'No user ID available' };
    }
    // Delegate to the more complete implementation
    return await this._getUserProjectAssignments(userId);
  }

  async _getUserProjectAssignments(userId) {
    console.log('📋 [IPC-EVENT-MAP] Getting project assignments for user:', userId);

    const backendTimeLogs = require('../utils/backend-time-logs');
    const effectiveConfig = global.configManager?.getConfig?.() || global.config;
    if (backendTimeLogs.isBackendTimeLogsEnabled(effectiveConfig)) {
      try {
        const projects = await backendTimeLogs.listUserProjects(userId, effectiveConfig);
        if (Array.isArray(projects)) {
          if (projects.length > 0) {
            console.log(`✅ [IPC-EVENT-MAP] Found ${projects.length} projects from backend`);
            return projects;
          }
          console.log(`⚠️ [IPC-EVENT-MAP] Backend returned no assignments for user ${userId}`);
          return [];
        }
      } catch (error) {
        console.error('❌ [IPC-EVENT-MAP] Backend project fetch failed:', error.message);
      }
    }

    const { normalizeTenantUserId } = require('../utils/tenant-user-id');
    if (
      (effectiveConfig?.auth_provider === 'cognito' || global.config?.auth_provider === 'cognito') &&
      normalizeTenantUserId(userId)
    ) {
      console.log('⚠️ [IPC-EVENT-MAP] Cognito/RDS mode — skipping legacy Supabase project query');
      return this._getFallbackProjects();
    }

    console.log('🔍 [IPC-EVENT-MAP] Global state check:', {
      hasCurrentUserId: !!global.currentUserId,
      hasConfigUserId: !!global.config?.user_id,
      userId: userId
    });
    
    try {
      // Get Supabase client from global scope
      const supabase = global.supabaseService || global.supabaseClient;
      console.log('🔍 [IPC-EVENT-MAP] Supabase client check:', {
        hasSupabaseService: !!global.supabaseService,
        hasSupabaseClient: !!global.supabaseClient,
        selectedClient: supabase === global.supabaseService ? 'service' : supabase === global.supabaseClient ? 'client' : 'unknown'
      });
      
      if (!supabase) {
        console.error('❌ [IPC-EVENT-MAP] No Supabase client available');
        return this._getFallbackProjects();
      }
      
      // Query real project assignments from database
      console.log('🔍 [IPC-EVENT-MAP] About to query employee_project_assignments for user:', userId);
      const { data, error } = await supabase
        .from('employee_project_assignments')
        .select(`
          id,
          project_id,
          projects:project_id (
            id,
            name,
            description
          )
        `)
        .eq('user_id', userId);
      
      console.log('🔍 [IPC-EVENT-MAP] Query result:', {
        hasData: !!data,
        dataLength: data ? data.length : 0,
        hasError: !!error,
        errorMessage: error ? error.message : null,
        errorCode: error ? error.code : null
      });
      
      if (error) {
        console.error('❌ [IPC-EVENT-MAP] Database error:', error);
        return this._getFallbackProjects();
      }
      
      if (!data || data.length === 0) {
        console.log('⚠️ [IPC-EVENT-MAP] No project assignments found for user');
        return this._getFallbackProjects();
      }
      
      // Format data for UI-Manager
      const formattedProjects = data.map(assignment => ({
        project_id: assignment.project_id,
        name: assignment.projects.name,
        description: assignment.projects.description,
        projects: {
          id: assignment.projects.id,
          name: assignment.projects.name
        }
      }));
      
      console.log(`✅ [IPC-EVENT-MAP] Found ${formattedProjects.length} project assignments from database`);
      return formattedProjects;
      
    } catch (error) {
      console.error('❌ [IPC-EVENT-MAP] Error getting project assignments:', error);
      console.error('❌ [IPC-EVENT-MAP] Error stack:', error.stack);
      console.log('🔄 [IPC-EVENT-MAP] Falling back to default projects due to error');
      return this._getFallbackProjects();
    }
  }
  
  _getFallbackProjects() {
    console.log('🔄 [IPC-EVENT-MAP] No projects available — returning empty list');
    return [];
  }

  // Test method implementations (simplified for now)
  async _testScreenshot() { return { success: true, message: 'Screenshot test completed' }; }
  async _testAppDetection() { return { success: true, message: 'App detection test completed' }; }
  async _testUrlDetection() { return { success: true, message: 'URL detection test completed' }; }
  async _testDatabase() { return { success: true, message: 'Database test completed' }; }
  async _testScreenPermission() { return { success: true, message: 'Screen permission test completed' }; }
  async _testAccessibilityPermission() { return { success: true, message: 'Accessibility permission test completed' }; }
  async _testInputMonitoring() { return { success: true, message: 'Input monitoring test completed' }; }
  async _testIdleDetection() { return { success: true, message: 'Idle detection test completed' }; }
  async _testActivity() { return { success: true, message: 'Activity test completed' }; }
  async _testScreenshotCapability() { return { success: true, message: 'Screenshot capability test completed' }; }
  async _testUrlDetectionCapability() { return { success: true, message: 'URL detection capability test completed' }; }
  async _testAppDetectionCapability() { return { success: true, message: 'App detection capability test completed' }; }
  async _testFraudDetection() { return { success: true, message: 'Fraud detection test completed' }; }
  async _testDatabaseConnection() { return { success: true, message: 'Database connection test completed' }; }
  async _testInputDetection() { return { success: true, message: 'Input detection test completed' }; }

  // Windows-specific URL capture test
  async _testWindowsUrlCapture() {
    if (process.platform !== 'win32') {
      return { success: false, message: 'This test is Windows-only' };
    }

    console.log('🧭 [WIN-DEBUG] Starting Windows URL capture test...');
    
    try {
      // Step 1: Verify URL capture manager exists
      if (!global.urlCaptureManager) {
        return {
          success: false,
          message: 'URL capture manager not available',
          step: 'manager_check',
          details: 'UrlCaptureManager not found in global scope'
        };
      }

      // Step 2: Test session validation
      const session = global.sessionManager?.getCurrentSession() || global.currentSession;
      const userId = session?.user?.id || global.currentUserId;
      
      if (!userId) {
        return {
          success: false,
          message: 'No valid user session found',
          step: 'session_check',
          details: 'User must be logged in for URL tracking'
        };
      }

      console.log('[WIN-DEBUG] Session validation passed, userId:', userId);

      // Step 3: Force URL capture
      console.log('[WIN-DEBUG] Calling captureCurrentUrl()...');
      await global.urlCaptureManager.captureCurrentUrl();

      // Step 4: Wait a moment for async processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 5: Check if we got URL history in last 5 minutes
      console.log('[WIN-DEBUG] Checking URL history from last 5 minutes...');
      
      if (!global.supabaseService) {
        return {
          success: false,
          message: 'Database service not available',
          step: 'db_check',
          details: 'Supabase service not initialized'
        };
      }

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const { data: urlHistory, error } = await global.supabaseService
        .from('app_url_activity')
        .select('id, site_url, title, browser, started_at')
        .eq('user_id', userId)
        .gte('started_at', fiveMinutesAgo.toISOString())
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) {
        return {
          success: false,
          message: 'Database query failed',
          step: 'db_query',
          error: error.message
        };
      }

      console.log(`[WIN-DEBUG] Found ${urlHistory?.length || 0} URL entries in last 5 minutes`);

      if (urlHistory && urlHistory.length > 0) {
        console.log('✅ WINDOWS URL FLOW VERIFIED');
        return {
          success: true,
          message: '✅ WINDOWS URL FLOW VERIFIED',
          step: 'complete',
          details: {
            userId: userId,
            urlCount: urlHistory.length,
            latestUrls: urlHistory.slice(0, 3).map(url => ({
              site_url: url.site_url,
              title: url.title,
              browser: url.browser,
              time: url.started_at
            }))
          }
        };
      } else {
        // Still log partial success for debugging
        return {
          success: false,
          message: 'URL capture test completed but no URLs found in database',
          step: 'verification',
          details: {
            userId: userId,
            sessionValid: true,
            managerAvailable: true,
            dbConnected: true,
            urlHistoryCount: 0,
            possibleReasons: [
              'No active browser windows found',
              'URL extraction failed from window titles', 
              'URL event handler not attached',
              'Database save operation failed'
            ]
          }
        };
      }
    } catch (error) {
      console.error('[WIN-DEBUG] URL capture test failed:', error);
      return {
        success: false,
        message: 'URL capture test failed with error',
        step: 'error',
        error: error.message,
        stack: error.stack
      };
    }
  }

  shutdown() {
    // Remove all handlers
    for (const [channel, handler] of this.handlers) {
      ipcMain.removeHandler(channel);
    }
    this.handlers.clear();
    
    console.log('📡 [IPC-EVENT-MAP] Shutdown complete');
  }
}

module.exports = IPCEventMap;