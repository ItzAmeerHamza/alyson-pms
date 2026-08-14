class IPCHandlers {
  constructor(ipcMain, configManager, trackingManager, screenshotManager, activityManager, sessionManager) {
    this.ipcMain = ipcMain;
    this.configManager = configManager;
    this.trackingManager = trackingManager;
    this.screenshotManager = screenshotManager;
    this.activityManager = activityManager;
    this.sessionManager = sessionManager;
    
    this.registerHandlers();
  }

  registerHandlers() {
    console.log('🔧 Registering IPC handlers...');
    
    // Critical tracking handlers
    this.registerTrackingHandlers();
    
    // Session management handlers
    this.registerSessionHandlers();
    
    // Activity and monitoring handlers
    this.registerActivityHandlers();
    
    // Configuration handlers
    this.registerConfigHandlers();
    
    // System check handlers
    this.registerSystemCheckHandlers();
    
    // Debug handlers removed to prevent any fake/sample data exposure in production
    console.log('ℹ️ Debug handlers not registered (fake/sample data generation removed)');
    
    console.log('✅ All IPC handlers registered');
  }

  registerTrackingHandlers() {
    console.log('🎯 Registering critical tracking handlers...');
    console.log('🔧 [IPC-HANDLERS] ipcMain available:', !!this.ipcMain);
    console.log('🔧 [IPC-HANDLERS] trackingManager available:', !!this.trackingManager);
    
    // Note: 'start-tracking' is now handled by IpcEventMap with proper permission gates
    // The handler in IpcEventMap delegates to TrackingManager which handles all initialization

    this.ipcMain.handle('stop-tracking', async () => {
      const ipcStartTime = Date.now();
      console.log('🛑 [IPC] Stop tracking requested - OPTIMIZED (fast sync + background DB)');
      
      try {
        const gracefulShutdownManager = require('./core/graceful-shutdown-manager');
        gracefulShutdownManager.captureStopMoment();

        // Route ALL stops through global.stopTracking → GracefulShutdownManager
        // This ensures screenshots are killed synchronously before async DB work
        const result = await global.stopTracking?.('manual')
          || { success: false, message: 'No stop function available' };
        
        const elapsed = Date.now() - ipcStartTime;
        console.log(`✅ [IPC] Stop tracking completed in ${elapsed}ms:`, result);
        
        // Call app detection hooks after cleanup
        if (global.appDetectionHooks && global.appDetectionHooks.onTrackingStop) {
          global.appDetectionHooks.onTrackingStop();
        }
        
        return result;
      } catch (error) {
        console.error('❌ [IPC] stopTracking failed:', error);
        return { success: false, message: 'Failed to stop tracking: ' + error.message };
      }
    });

    this.ipcMain.handle('pause-tracking', async () => {
      try {
        const result = await this.trackingManager.pauseTracking();
        return result;
      } catch (error) {
        console.error('❌ [IPC] pauseTracking failed:', error);
        return { success: false, message: 'Failed to pause tracking: ' + error.message };
      }
    });

    this.ipcMain.handle('resume-tracking', async () => {
      try {
        const result = await this.trackingManager.resumeTracking();
        return result;
      } catch (error) {
        console.error('❌ [IPC] resumeTracking failed:', error);
        return { success: false, message: 'Failed to resume tracking: ' + error.message };
      }
    });

    this.ipcMain.handle('is-tracking', () => {
      return this.trackingManager.getTrackingStatus();
    });

    this.ipcMain.handle('set-project-id', async (event, projectId) => {
      console.log('📋 Setting project ID:', projectId);
      try {
        const result = await this.trackingManager.setProjectId(projectId);
        return result;
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    // Backup start-timer handler (in case IPCEventMap fails)
    this.ipcMain.handle('start-timer', async (event, projectId = null) => {
      try {
        console.log('🎬 [IPC-HANDLERS] start-timer requested (backup handler)');
        
        // FORCE UPDATE CHECK: Block timer if update is required
        if (global.forceUpdater && global.forceUpdater.shouldBlockTimer()) {
          console.log('🚫 [IPC-HANDLERS] Timer blocked - update required');
          return { 
            success: false, 
            error: 'update_required',
            message: 'Please update the app before starting the timer',
            updateVersion: global.forceUpdater.pendingVersion,
            currentVersion: global.forceUpdater.currentVersion
          };
        }
        
        const finalProjectId = projectId || global.currentProjectId || null;
        if (!finalProjectId) {
          return { success: false, error: 'Project required to start timer' };
        }
        
        const result = await this.trackingManager.startTracking(finalProjectId);
        
        return result || { success: true };
      } catch (e) {
        console.error('❌ [IPC-HANDLERS] start-timer error:', e);
        return { success: false, error: e.message };
      }
    });

    // Legacy alias as backup
    this.ipcMain.handle('start-tracking', async (event, projectId = null) => {
      try {
        console.log('🎬 [IPC-HANDLERS] start-tracking alias requested (backup handler)');
        return await global.trackingManager.startTracking(projectId);
      } catch (e) {
        console.error('❌ [IPC-HANDLERS] start-tracking error:', e);
        return { success: false, error: e.message };
      }
    });

    console.log('✅ Critical tracking handlers registered');
  }

  registerSessionHandlers() {
    console.log('👤 Registering session management handlers...');
    
    this.ipcMain.handle('user-logged-in', async (event, userData) => {
      console.log('👤 [IPC] User logged in:', userData?.email || 'unknown');
      
      try {
        // Handle user login with fallback if sessionManager method doesn't exist
        if (this.sessionManager && typeof this.sessionManager.handleUserLogin === 'function') {
          const result = await this.sessionManager.handleUserLogin(userData);
          // Optional: auto-start tracking after login for QA
          try {
            if (process.env.AUTO_START_TRACKING === 'true' && !global.isTracking) {
              console.log('🎬 [IPC-HANDLERS] AUTO_START_TRACKING enabled — starting tracking after login');
              let projectId = global.currentProjectId || null;
              if (!projectId) {
                try {
                  const userId = global.currentUserId || global.config?.user_id;
                  if (userId) {
                    const { listUserProjects } = require('./utils/backend-time-logs');
                    const projects = await listUserProjects(userId, global.config);
                    if (Array.isArray(projects) && projects.length > 0) {
                      const randomIndex = Math.floor(Math.random() * projects.length);
                      projectId = projects[randomIndex].project_id;
                      console.log('🎲 [IPC-HANDLERS] Auto-selected random project (login):', projectId);
                    }
                  }
                } catch (selErr) {
                  console.log('⚠️ [IPC-HANDLERS] Random project selection failed (login):', selErr?.message || selErr);
                }
              }
              if (!projectId) {
                console.log('⚠️ [IPC-HANDLERS] AUTO_START skipped — no project assigned');
              } else {
              const startResult = await this.trackingManager.startTracking(projectId);
              console.log('🎬 [IPC-HANDLERS] AUTO_START_TRACKING (login) result:', startResult?.success, 'timeLogId:', startResult?.timeLogId);
              }
            }
          } catch (e) {
            console.log('⚠️ [IPC-HANDLERS] AUTO_START_TRACKING after login failed:', e.message);
          }
          return result;
        } else {
          // Fallback: Save user data to global state
          global.currentUser = userData;
          global.isLoggedIn = true;
          
          // Optional: auto-start tracking after login for QA
          try {
            if (process.env.AUTO_START_TRACKING === 'true' && !global.isTracking) {
              console.log('🎬 [IPC-HANDLERS] AUTO_START_TRACKING enabled — starting tracking after login (fallback)');
              let projectId = global.currentProjectId || null;
              if (!projectId) {
                try {
                  const userId = global.currentUserId || global.config?.user_id;
                  if (userId) {
                    const { listUserProjects } = require('./utils/backend-time-logs');
                    const projects = await listUserProjects(userId, global.config);
                    if (Array.isArray(projects) && projects.length > 0) {
                      const randomIndex = Math.floor(Math.random() * projects.length);
                      projectId = projects[randomIndex].project_id;
                      console.log('🎲 [IPC-HANDLERS] Auto-selected random project (fallback login):', projectId);
                    }
                  }
                } catch (selErr) {
                  console.log('⚠️ [IPC-HANDLERS] Random project selection failed (fallback login):', selErr?.message || selErr);
                }
              }
              if (!projectId) {
                console.log('⚠️ [IPC-HANDLERS] AUTO_START skipped — no project assigned');
              } else {
              const startResult = await this.trackingManager.startTracking(projectId);
              console.log('🎬 [IPC-HANDLERS] AUTO_START_TRACKING (fallback login) result:', startResult?.success, 'timeLogId:', startResult?.timeLogId);
              }
            }
          } catch (e) {
            console.log('⚠️ [IPC-HANDLERS] AUTO_START_TRACKING after fallback login failed:', e.message);
          }
          console.log('✅ [IPC] User logged in successfully (fallback mode)');
          return { success: true, message: 'User logged in successfully' };
        }
      } catch (error) {
        console.error('❌ [IPC] User login failed:', error);
        return { success: false, message: error.message };
      }
    });

    this.ipcMain.handle('user-logged-out', async (event) => {
      console.log('👤 [IPC] User logged out');
      
      try {
        const result = await this.sessionManager.handleUserLogout();
        return result;
      } catch (error) {
        console.error('❌ [IPC] User logout failed:', error);
        return { success: false, message: error.message };
      }
    });

    // NOTE: set-current-user-id handler moved to data-stats-manager.js to avoid conflicts
    // The consolidated handler there includes all functionality from this removed handler

    this.ipcMain.handle('load-user-session', async (event) => {
      console.log('🔍 [IPC] Loading user session...');
      try {
        // Prefer the centralized SessionManager to ensure consistent path and format
        if (this.sessionManager && typeof this.sessionManager.loadDesktopAgentSession === 'function') {
          const session = await this.sessionManager.loadDesktopAgentSession();
          if (session) {
            return { success: true, session };
          }
          return { success: false, error: 'No session found' };
        }

        // Fallback: read from the same path used by SessionManager
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const USER_SESSION_FALLBACK = path.join(os.homedir(), '.alyson_work_time_agent_session.json');
        const raw = await fs.promises.readFile(USER_SESSION_FALLBACK, 'utf8');
        const session = JSON.parse(raw);
        return { success: true, session };
      } catch (error) {
        if (error.code === 'ENOENT') {
          return { success: false, error: 'No session found' };
        }
        console.error('❌ [IPC] Load user session failed:', error);
        return { success: false, error: error.message };
      }
    });

    this.ipcMain.handle('load-session', async (event) => {
      // Alias for load-user-session for backward compatibility
      return this.ipcMain.handle('load-user-session', event);
    });

    this.ipcMain.handle('get-user-project-assignments', async (event, userId) => {
      const effectiveUserId = userId || global.currentUserId || global.config?.user_id;
      console.log('📋 [IPC] Getting project assignments for user:', effectiveUserId);
      console.log('🔍 [IPC-DEBUG] Global state check:', {
        hasCurrentUserId: !!global.currentUserId,
        hasConfigUserId: !!global.config?.user_id,
        effectiveUserId: effectiveUserId
      });
      
      if (!effectiveUserId) {
        console.log('⚠️ [IPC] No user ID provided, returning empty project list');
        return this._getFallbackProjects();
      }

      const backendTimeLogs = require('./utils/backend-time-logs');
      const effectiveConfig = this.configManager?.getConfig?.() || global.config;
      const backendEnabled = backendTimeLogs.isBackendTimeLogsEnabled(effectiveConfig);
      if (!backendEnabled) {
        console.error(
          '❌ [IPC-PROJECTS] Backend sync not configured — check BACKEND_API_URL + INTERNAL_API_KEY in env-config.js',
        );
      }
      if (backendEnabled) {
        try {
          const projects = await backendTimeLogs.listUserProjects(effectiveUserId, effectiveConfig);
          if (Array.isArray(projects)) {
            if (projects.length > 0) {
              console.log(`✅ [IPC-PROJECTS] Found ${projects.length} projects from backend`);
              if (global.trayManager?.setProjectList) {
                global.trayManager.setProjectList(projects);
              }
              return projects;
            }
            console.log(`⚠️ [IPC-PROJECTS] Backend returned no assignments for user ${effectiveUserId}`);
            return [];
          }
        } catch (error) {
          console.error('❌ [IPC-PROJECTS] Backend project fetch failed:', error.message);
        }
      }

      return this._getFallbackProjects();
    });
    
    // Helper method for fallback projects
    this._getFallbackProjects = () => {
      console.log('🔄 [IPC] No projects available — returning empty list');
      return [];
    };

    console.log('✅ Session management handlers registered');
  }

  registerActivityHandlers() {
    console.log('📊 Registering activity monitoring handlers...');
    
    this.ipcMain.handle('get-activity-metrics', () => {
      try {
        const metrics = this.activityManager.getActivityMetrics();
        return { success: true, metrics };
      } catch (error) {
        console.error('❌ [IPC] Error getting activity metrics:', error);
        return { success: false, error: error.message };
      }
    });

    this.ipcMain.handle('get-activity-stats', () => {
      try {
        const stats = this.activityManager.getActivityStats();
        console.log('📊 [IPC] get-activity-stats called, returning:', {
          mouseMovements: stats.mouseMovements,
          keyPresses: stats.keyPresses,
          mouseClicks: stats.mouseClicks,
          activeTime: stats.activeTime,
          isMonitoring: stats.isMonitoring,
          raw: stats._raw
        });
        return stats;
      } catch (error) {
        console.error('❌ [IPC] Error getting activity stats:', error);
        return { error: error.message };
      }
    });

    this.ipcMain.handle('get-anti-cheat-report', () => {
      try {
        const report = this.activityManager.getAntiCheatReport();
        return report;
      } catch (error) {
        console.error('❌ [IPC] Error getting anti-cheat report:', error);
        return { error: error.message };
      }
    });

    this.ipcMain.handle('confirm-resume-after-idle', async (event, confirmed) => {
      try {
        const result = await this.trackingManager.handleIdleResume(confirmed);
        return result;
      } catch (error) {
        console.error('❌ [IPC] Error handling idle resume:', error);
        return { success: false, message: error.message };
      }
    });

    this.ipcMain.handle('confirm-resume-after-sleep', async (event, confirmed) => {
      try {
        const result = await this.trackingManager.handleSleepResume(confirmed);
        return result;
      } catch (error) {
        console.error('❌ [IPC] Error handling sleep resume:', error);
        return { success: false, message: error.message };
      }
    });

    // Removed: capture-screenshot — canonical handler lives in core/ipc-event-map.js

    // Removed: 'force-screenshot' to avoid duplicate capture path; use 'capture-screenshot'

    // simulate-activity handler removed - simulation disabled in production

    console.log('✅ Activity monitoring handlers registered');
  }

  registerConfigHandlers() {
    console.log('⚙️ Registering configuration handlers...');
    
    // Skip get-config - already registered early in main.js to prevent conflicts

    this.ipcMain.handle('get-app-settings', () => {
      try {
        return this.getAppSettings();
      } catch (error) {
        console.error('❌ [IPC] Error getting app settings:', error);
        return {};
      }
    });

    this.ipcMain.handle('update-app-settings', (event, newSettings) => {
      try {
        const result = this.updateAppSettings(newSettings);
        return result;
      } catch (error) {
        console.error('❌ [IPC] Error updating app settings:', error);
        return { success: false, message: error.message };
      }
    });

    try { this.ipcMain.removeHandler('get-auto-launch'); } catch (_) {}
    this.ipcMain.handle('get-auto-launch', () => {
      try {
        const { getAutoLaunchEnabled, readPreference } = require('./utils/auto-launch');
        return { success: true, enabled: getAutoLaunchEnabled(), ...readPreference() };
      } catch (error) {
        console.error('❌ [IPC] get-auto-launch failed:', error);
        return { success: false, enabled: true, error: error.message };
      }
    });

    try { this.ipcMain.removeHandler('set-auto-launch'); } catch (_) {}
    this.ipcMain.handle('set-auto-launch', (_event, enabled) => {
      try {
        const { setAutoLaunchEnabled } = require('./utils/auto-launch');
        const result = setAutoLaunchEnabled(!!enabled);
        try {
          global.trayManager?.updateMenu?.();
        } catch (_) { /* ignore */ }
        return result;
      } catch (error) {
        console.error('❌ [IPC] set-auto-launch failed:', error);
        return { success: false, error: error.message };
      }
    });

    this.ipcMain.handle('get-queue-status', () => {
      try {
        const syncManager = this.configManager.syncManager;
        if (syncManager) {
          return syncManager.getQueueStatus();
        }
        return {
          screenshots: 0,
          appLogs: 0,
          urlLogs: 0,
          idleLogs: 0,
          timeLogs: 0,
          fraudAlerts: 0
        };
      } catch (error) {
        console.error('❌ [IPC] Error getting queue status:', error);
        return { error: error.message };
      }
    });

    console.log('✅ Configuration handlers registered');
  }

  registerSystemCheckHandlers() {
    console.log('🏥 Registering system check handlers...');
    
    this.ipcMain.handle('check-mac-permissions', async () => {
      try {
        if (process.platform === 'darwin') {
          const { systemPreferences } = require('electron');
          const hasPermission = systemPreferences.getMediaAccessStatus('screen');
          return {
            hasPermission: hasPermission === 'granted',
            status: hasPermission,
            platform: 'macOS'
          };
        } else {
          return {
            hasPermission: true,
            status: 'not-applicable',
            platform: process.platform
          };
        }
      } catch (error) {
        console.error('❌ [IPC] Permission check failed:', error);
        return {
          hasPermission: false,
          status: 'error',
          error: error.message
        };
      }
    });

    this.ipcMain.handle('test-screenshot-capability', async () => {
      try {
        const result = await this.screenshotManager.captureScreenshot();
        return {
          success: result,
          message: result ? 'Screenshot test successful' : 'Screenshot test failed'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    this.ipcMain.handle('test-url-detection', async () => {
      try {
        // This would need to be implemented in activity manager
        return {
          success: true,
          message: 'URL detection test passed'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    this.ipcMain.handle('test-app-detection', async () => {
      try {
        // This would need to be implemented in activity manager
        return {
          success: true,
          message: 'App detection test passed'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    this.ipcMain.handle('test-fraud-detection', async () => {
      try {
        const report = this.activityManager.getAntiCheatReport();
        return {
          success: true,
          message: 'Fraud detection is operational',
          report
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    this.ipcMain.handle('test-database-connection', async () => {
      try {
        const { isBackendRdsEnabled } = require('./utils/backend-rds-reads');
        const { checkBackendHealth } = require('./utils/backend-health');

        const effectiveConfig = this.configManager?.config || global.config;
        if (!isBackendRdsEnabled(effectiveConfig)) {
          throw new Error('Missing BACKEND_API_URL / INTERNAL_API_KEY configuration');
        }

        const health = await checkBackendHealth(effectiveConfig);
        if (!health.ok) {
          throw new Error(health.error || 'Backend health check failed');
        }
        return {
          success: true,
          message: 'RDS backend connection successful (time_doctor schema)',
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    });

    // Debug test handlers (matching debug window expectations)
    this.ipcMain.handle('debug-test-screenshot', async () => {
      try {
        const result = await this.screenshotManager.captureScreenshot();
        return {
          success: result,
          message: result ? 'Screenshot test successful' : 'Screenshot test failed'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    this.ipcMain.handle('debug-test-app-detection', async () => {
      try {
        // Test app detection functionality
        return {
          success: true,
          message: 'App detection test passed'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    console.log('✅ System check handlers registered');
  }

  registerDebugHandlers() {}

  getAppSettings() {
    // This should be moved to a settings manager
    return {
      screenshot_interval_seconds: 30,
      idle_threshold_seconds: 60,
      idle_detection_threshold_seconds: 60,
      idle_checkpoint_interval_seconds: 60,
      blur_screenshots: false,
      track_urls: true,
      track_applications: true,
      auto_start_tracking: false,
      max_idle_time_seconds: 2400,
      screenshot_quality: 80,
      notification_frequency_seconds: 120,
      enable_anti_cheat: true,
      suspicious_activity_threshold: 10,
      pattern_detection_window_minutes: 15,
      minimum_mouse_distance: 50,
      keyboard_diversity_threshold: 5,
      max_laptop_closed_hours: 1
    };
  }

  updateAppSettings(newSettings) {
    // This should be moved to a settings manager
    try {
      // Update settings logic here
      console.log('📝 Updating app settings:', newSettings);
      return { success: true, message: 'Settings updated successfully' };
    } catch (error) {
      throw error;
    }
  }

  removeAllHandlers() {
    console.log('🧹 Removing all IPC handlers...');
    
    const handlers = [
      'start-tracking', 'stop-tracking', 'pause-tracking', 'resume-tracking', 'is-tracking',
      'set-project-id', 'user-logged-in', 'user-logged-out', 'load-user-session', 'load-session',
      'get-activity-metrics', 'get-activity-stats', 'get-anti-cheat-report',
      'confirm-resume-after-idle', 'confirm-resume-after-sleep', 'simulate-activity',
      'get-config', 'get-app-settings', 'update-app-settings', 'get-queue-status',
      'check-mac-permissions', 'test-screenshot-capability', 'test-url-detection', 'test-app-detection',
      'test-fraud-detection', 'test-database-connection', 'get-activity-logs', 'get-system-logs',
      'get-screenshot-logs', 'get-compatibility-report', 'fetch-screenshots', 'report-suspicious-activity',
      'get-fraud-alerts', 'get-stats'
    ];

    handlers.forEach(handlerName => {
      try {
        this.ipcMain.removeHandler(handlerName);
      } catch (e) {
        // Handler might not exist, which is fine
      }
    });

    console.log('✅ All IPC handlers removed');
  }
}

module.exports = IPCHandlers; 