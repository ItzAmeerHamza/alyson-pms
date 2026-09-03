/**
 * Monitoring Manager Module
 * Orchestrates all monitoring systems and coordinates their lifecycle
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('../core/cleanup-registry');

class MonitoringManager {
  constructor(config) {
    this.config = config;
    this.isMonitoring = false;
    this.monitoringSystems = new Map();
    
    // Monitoring intervals
    this.intervals = {
      liveActivity: null,
      screenshotTimer: null,
      idleCheck: null,
      appCapture: null,
      urlCapture: null,
      systemMonitor: null,
      notification: null,
      mandatoryScreenshot: null,
      activitySync: null
    };
    
    // System references
    this.managers = {};
    
    // Debounce map to suppress duplicate app saves within a short window
    this._appSaveDebounce = new Map();
    
    // Aggregator for app saves within 10s windows (saves with visit_count)
    this._appAggregate = new Map(); // key => { name, title, firstTs, lastTs, count, timer }
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'monitoringManager',
      cleanup: async () => this.cleanup()
    });
  }

  /**
   * Initialize with manager references
   */
  initialize(managers) {
    this.managers = managers;
    console.log('📡 [MONITORING] Monitoring manager initialized');
  }

  /**
   * Start all monitoring systems
   */
  async startAllMonitoring() {
    if (this.isMonitoring) {
      // RACE FIX: Monitoring may have started before initialize() provided the
      // enhancedIdleMonitor reference. Check if idle monitoring was missed.
      if (this.managers.enhancedIdleMonitor &&
          !this.managers.enhancedIdleMonitor.idleMonitoringInterval) {
        console.log('🔧 [MONITORING] Late-starting idle monitoring (race fix)');
        await this.startIdleMonitoring();
      }
      console.log('⚠️ [MONITORING] Already monitoring');
      return;
    }

    const trackingOn = !!(
      global.isTracking &&
      (global.trackingManager?.currentTimeLogId != null || global.currentTimeLogId != null)
    );
    if (!trackingOn) {
      console.log('📡 [MONITORING] Capture systems deferred until tracking starts');
      return;
    }

    console.log('🚀 [MONITORING] Starting all monitoring systems...');
    this.isMonitoring = true;

    try {
      // Start core monitoring systems
      await this.startActivityMonitoring();
      await this.startScreenshotMonitoring();
      await this.startIdleMonitoring();
      await this.startAppMonitoring();
      await this.startUrlMonitoring();
      await this.startSystemMonitoring();
      await this.startNotificationMonitoring();
      
      console.log('✅ [MONITORING] All monitoring systems started');
    } catch (error) {
      console.error('❌ [MONITORING] Failed to start monitoring systems:', error);
      throw error;
    }
  }

  /**
   * SYNCHRONOUS stop - clears intervals only, no async operations
   * Used by optimized stopTracking for fast UI response
   */
  stopAllMonitoringSync() {
    console.log('🛑 [MONITORING] Sync stop - clearing intervals...');
    this.isMonitoring = false;
    
    try {
      // Stop all intervals - synchronous operation
      Object.entries(this.intervals).forEach(([name, interval]) => {
        if (interval) {
          clearInterval(interval);
          this.intervals[name] = null;
        }
      });
      console.log('✅ [MONITORING] All intervals cleared (sync)');
    } catch (error) {
      console.error('❌ [MONITORING] Error in sync stop:', error);
    }
  }

  /**
   * Stop all monitoring systems
   */
  async stopAllMonitoring() {
    // CRITICAL FIX: Always try to stop intervals, even if isMonitoring is false
    // The flag might be stale but intervals could still be running
    console.log('🛑 [MONITORING] Stopping all monitoring systems...');
    this.isMonitoring = false;

    try {
      // Stop all intervals - ALWAYS do this regardless of isMonitoring flag
      Object.entries(this.intervals).forEach(([name, interval]) => {
        if (interval) {
          clearInterval(interval);
          this.intervals[name] = null;
          console.log(`🛑 [MONITORING] Stopped ${name} monitoring`);
        }
      });

      // Stop manager-specific monitoring
      await this.stopActivityMonitoring();
      await this.stopScreenshotMonitoring();
      await this.stopIdleMonitoring();
      await this.stopAppMonitoring();
      await this.stopUrlMonitoring();
      await this.stopSystemMonitoring();
      await this.stopNotificationMonitoring();

      console.log('✅ [MONITORING] All monitoring systems stopped');
    } catch (error) {
      console.error('❌ [MONITORING] Error stopping monitoring systems:', error);
    }
  }

  /**
   * Start activity monitoring
   * PERFORMANCE FIX: Reduced from 2s to 3s interval - still responsive but less CPU load
   */
  async startActivityMonitoring() {
    if (this.managers.activityManager) {
      this.managers.activityManager.startMonitoring();
      this.registerSystem('activity', this.managers.activityManager);
    }

    // Live activity IPC only while tracking (15s). Was 5s even at the login screen.
    let liveMs = 15000;
    try {
      liveMs = require('../utils/power-profile').IPC.liveActivityMs;
    } catch (_) { /* default */ }
    this.intervals.liveActivity = setInterval(() => {
      this.sendLiveActivityUpdates();
    }, liveMs);

    console.log('📊 [MONITORING] Activity monitoring started');
  }

  /**
   * Stop activity monitoring
   */
  async stopActivityMonitoring() {
    if (this.intervals.liveActivity) {
      clearInterval(this.intervals.liveActivity);
      this.intervals.liveActivity = null;
    }

    if (this.managers.activityManager) {
      this.managers.activityManager.stopMonitoring();
    }

    console.log('📊 [MONITORING] Activity monitoring stopped');
  }

  /**
   * Start screenshot monitoring
   */
  async startScreenshotMonitoring() {
    if (!global.isTracking) {
      console.log('📸 [MONITORING] Skipping screenshot capture — not tracking');
      return;
    }
    if (this.managers.screenshotManager) {
      // Only start if not already scheduled (avoid duplicate windows)
      try {
        const status = this.managers.screenshotManager.getScreenshotStatus?.();
        if (status && status.nextScreenshotTime && (this.managers.screenshotManager.windowTimers?.length || 0) > 0) {
          console.log('⚠️ [MONITORING] Screenshot scheduling already active; skipping duplicate start');
        } else {
          this.managers.screenshotManager.startScreenshotCapture();
        }
      } catch {
        this.managers.screenshotManager.startScreenshotCapture();
      }
      this.managers.screenshotManager.startScreenshotTimerUpdates();
      // REMOVED: startMandatoryScreenshotMonitoring() - window-based 3-per-10-min is single source
      this.registerSystem('screenshot', this.managers.screenshotManager);
    }

    console.log('📸 [MONITORING] Screenshot monitoring started');
  }

  /**
   * Stop screenshot monitoring
   */
  async stopScreenshotMonitoring() {
    if (this.managers.screenshotManager) {
      this.managers.screenshotManager.stopScreenshotCapture();
      this.managers.screenshotManager.stopScreenshotTimerUpdates();
      this.managers.screenshotManager.stopMandatoryScreenshotMonitoring();
    }

    console.log('📸 [MONITORING] Screenshot monitoring stopped');
  }

  /**
   * Start idle monitoring
   */
  async startIdleMonitoring() {
    if (!global.isTracking) {
      console.log('😴 [MONITORING] Skipping idle monitor — not tracking');
      return;
    }
    // Use enhanced idle monitor for idle detection
    if (this.managers.enhancedIdleMonitor && this.managers.enhancedIdleMonitor.startIdleMonitoring) {
      // CRITICAL FIX: Set tracking state to true so idle detection loop runs
      this.managers.enhancedIdleMonitor.setTrackingState(true);
      this.managers.enhancedIdleMonitor.startIdleMonitoring();
      this.registerSystem('idle', this.managers.enhancedIdleMonitor);
    }

    console.log('😴 [MONITORING] Idle monitoring started');
  }

  /**
   * Stop idle monitoring
   */
  async stopIdleMonitoring() {
    if (this.managers.enhancedIdleMonitor) {
      // CRITICAL FIX: Set tracking state to false to stop idle detection loop
      this.managers.enhancedIdleMonitor.setTrackingState(false);
      await this.managers.enhancedIdleMonitor.stopIdleMonitoring();
    }

    console.log('😴 [MONITORING] Idle monitoring stopped');
  }

  /**
   * Start app monitoring
   */
  async startAppMonitoring() {
    // App monitoring handled by EnhancedAppDetector
    let appMs = 45000;
    try {
      appMs = require('../utils/power-profile').getAppDetectIntervalMs();
    } catch (_) { /* default */ }
    this.intervals.appCapture = setInterval(() => {
      if (!global.isTracking) return;
      try {
        if (require('../utils/power-profile').shouldSkipAppDetection()) return;
      } catch (_) { /* continue */ }
      this.captureAppActivity();
    }, appMs);

    console.log(`📱 [MONITORING] App monitoring started with ${Math.round(appMs / 1000)}s interval`);
  }

  /**
   * Stop app monitoring
   */
  async stopAppMonitoring() {
    if (this.intervals.appCapture) {
      clearInterval(this.intervals.appCapture);
      this.intervals.appCapture = null;
    }

    console.log('📱 [MONITORING] App monitoring stopped');
  }

  /**
   * Start URL monitoring
   */
  async startUrlMonitoring() {
    // Prefer enhanced browser URL manager if available
    if (this.managers.browserUrlManager && typeof this.managers.browserUrlManager.startUrlCapture === 'function') {
      try {
        // Let BrowserUrlManager manage its own tab monitor lifecycle; just request capture start
        this.managers.browserUrlManager.startUrlCapture();
        this.registerSystem('browser-url', this.managers.browserUrlManager);
        console.log('🌐 [MONITORING] URL monitoring started via BrowserUrlManager (capture + tab monitor)');
        return;
      } catch (error) {
        console.log('⚠️ [MONITORING] Failed to start BrowserUrlManager, falling back:', error.message);
      }
    }

    // No fallback available
    console.log('⚠️ [MONITORING] BrowserUrlManager not available for URL monitoring');
  }

  /**
   * Stop URL monitoring
   */
  async stopUrlMonitoring() {
    // Stop enhanced browser URL manager if present
    if (this.managers.browserUrlManager && typeof this.managers.browserUrlManager.stopUrlCapture === 'function') {
      try {
        this.managers.browserUrlManager.stopUrlCapture();
      } catch (error) {
        console.log('⚠️ [MONITORING] Failed to stop BrowserUrlManager:', error.message);
      }
    }



    console.log('🌐 [MONITORING] URL monitoring stopped');
  }

  /**
   * Start system monitoring
   */
  async startSystemMonitoring() {
    let healthMs = 120000;
    try {
      healthMs = require('../utils/power-profile').IPC.systemHealthMs;
    } catch (_) { /* default */ }
    this.intervals.systemMonitor = setInterval(() => {
      this.checkSystemHealth();
    }, healthMs);

    console.log(`⚙️ [MONITORING] System monitoring started (${Math.round(healthMs / 1000)}s)`);
  }

  /**
   * Stop system monitoring
   */
  async stopSystemMonitoring() {
    if (this.intervals.systemMonitor) {
      clearInterval(this.intervals.systemMonitor);
      this.intervals.systemMonitor = null;
    }

    console.log('⚙️ [MONITORING] System monitoring stopped');
  }

  /**
   * Start notification monitoring
   */
  async startNotificationMonitoring() {
    // No notification backend. A 60s timer here was wake + log spam for no product gain.
    console.log('🔔 [MONITORING] Notification polling skipped (no-op)');
  }

  /**
   * Stop notification monitoring
   */
  async stopNotificationMonitoring() {
    if (this.intervals.notification) {
      clearInterval(this.intervals.notification);
      this.intervals.notification = null;
    }

    console.log('🔔 [MONITORING] Notification monitoring stopped');
  }

  /**
   * Send live activity updates
   * PERFORMANCE FIX: Skip sending when user is idle to reduce IPC overhead
   */
  sendLiveActivityUpdates() {
    if (!global.isTracking) return;
    if (!global.mainWindow || global.mainWindow.isDestroyed()) return;
    
    // PERFORMANCE FIX: Throttle updates when idle
    try {
      const idleStatus = global.enhancedIdleMonitor?.getIdleStatus?.();
      const isIdle = idleStatus?.isIdle;
      
      // When idle, only send updates every 10 seconds instead of every 3
      if (isIdle) {
        this._idleUpdateCounter = (this._idleUpdateCounter || 0) + 1;
        if (this._idleUpdateCounter < 3) return; // Skip 2 out of 3 updates when idle
        this._idleUpdateCounter = 0;
      } else {
        // CRITICAL FIX: Reset counter when transitioning from idle to active
        // Prevents counter state from carrying over into the next idle period
        this._idleUpdateCounter = 0;
      }
    } catch (e) {
      // Continue if idle check fails
    }

    try {
      const activityData = this.collectActivityData();
      global.mainWindow.webContents.send('live-activity-update', activityData);
    } catch (error) {
      // Throttle error logging
      if (!this._lastLiveUpdateError || Date.now() - this._lastLiveUpdateError > 30000) {
        this._lastLiveUpdateError = Date.now();
        console.log('⚠️ [MONITORING] Failed to send live activity update:', error.message);
      }
    }
  }

  /**
   * Capture app activity
   * PERFORMANCE FIX: Skip when user is idle to reduce CPU load
   */
  async captureAppActivity() {
    if (!global.isTracking) {
      return;
    }

    try {
      // Use platform manager to detect active app
      if (global.platformManager) {
        const appData = await global.platformManager.detectActiveApplication();
        // PERFORMANCE FIX: Only log when app actually changes
        if (appData && appData.appName !== this._lastDetectedApp) {
          this._lastDetectedApp = appData.appName;
          console.log('🔍 [MONITORING] Detected app:', {
            appName: appData?.appName,
            windowTitle: appData?.windowTitle?.substring(0, 50) // Truncate long titles
          });
        }
        if (appData) {
          this.processAppData(appData);
        }
      }
    } catch (error) {
      // Throttle error logging
      if (!this._lastAppErrorLog || Date.now() - this._lastAppErrorLog > 30000) {
        this._lastAppErrorLog = Date.now();
        console.log('⚠️ [MONITORING] App capture error:', error.message);
      }
    }
  }

  /**
   * Check system health
   */
  checkSystemHealth() {
    try {
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      const healthData = {
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        },
        uptime: Math.round(uptime),
        monitoring: this.getMonitoringStatus(),
        timestamp: Date.now()
      };

      // Send to renderer
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('system-health-update', healthData);
      }

      // Log if memory usage is high
      if (healthData.memory.rss > 500) { // 500MB
        console.log('⚠️ [MONITORING] High memory usage detected:', healthData.memory.rss, 'MB');
      }

    } catch (error) {
      console.log('⚠️ [MONITORING] System health check error:', error.message);
    }
  }

  /**
   * Check notifications
   */
  async checkNotifications() {
    try {
      // Placeholder for notification checking
      // Actual implementation would check database for new notifications
      console.log('🔔 [MONITORING] Checking notifications...');
    } catch (error) {
      console.log('⚠️ [MONITORING] Notification check error:', error.message);
    }
  }

  /**
   * Collect activity data
   */
  collectActivityData() {
    const activityData = {
      timestamp: Date.now(),
      isTracking: global.isTracking || false,
      isPaused: global.isPaused || false
    };

    // Add activity manager data
    if (this.managers.activityManager) {
      const stats = this.managers.activityManager.getActivityStats();
      activityData.activity = stats;
    }

    // Add idle monitor data
    if (this.managers.enhancedIdleMonitor) {
      const idleStatus = this.managers.enhancedIdleMonitor.getIdleStatus();
      activityData.idle = idleStatus;
    }

    // Add screenshot data
    if (this.managers.screenshotManager) {
      const screenshotStatus = this.managers.screenshotManager.getScreenshotStatus();
      activityData.screenshot = screenshotStatus;
    }

    return activityData;
  }

  /**
   * Process app data
   */
  processAppData(appData) {
    // Send app data to renderer for display
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('app-detected', {
        appName: appData.appName,
        windowTitle: appData.windowTitle,
        timestamp: Date.now()
      });
    }

    // Record activity (UI metrics only). DB writes centralized in enhanced-app-detector (dwell-gated)
    if (this.managers.activityManager) {
      this.managers.activityManager.recordActivity('app_switch', 'platform_detection', {
        appName: appData.appName,
        windowTitle: appData.windowTitle
      });
    }
  }

  /**
   * Save app data to database
   */
  async saveAppToDatabase(appData) {
    try {
      const appLog = {
        user_id: global.currentUserId,
        time_log_id: global.currentTimeLogId,
        app_name: appData.appName || appData.name || 'Unknown',
        window_title: appData.windowTitle || appData.title || '',
        timestamp: new Date(appData.timestamp || Date.now()).toISOString()
      };

      // Use the same sync manager as the Test Detection button
      if (global.syncManager && typeof global.syncManager.addAppLogs === 'function') {
        await global.syncManager.addAppLogs([appLog]);
        console.log('📱 [MONITORING] App saved to database:', appData.appName);
      } else if (global.enhancedSyncManager && typeof global.enhancedSyncManager.addToQueue === 'function') {
        await global.enhancedSyncManager.addToQueue('appLogs', [appLog]);
        console.log(`📱 [APP-LOG] Queued app log: ${appLog.app_name} | ${appLog.window_title}`);
        console.log('📱 [MONITORING] App queued for sync:', appData.appName);
      } else {
        console.log('⚠️ [MONITORING] No sync manager available for app save');
      }
    } catch (error) {
      console.log('⚠️ [MONITORING] Failed to save app to database:', error.message);
    }
  }

  /**
   * Register monitoring system
   */
  registerSystem(name, system) {
    this.monitoringSystems.set(name, {
      system: system,
      status: 'active',
      startTime: Date.now()
    });
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus() {
    const status = {
      isMonitoring: this.isMonitoring,
      systems: {},
      intervals: {}
    };

    // Check system status
    this.monitoringSystems.forEach((info, name) => {
      status.systems[name] = {
        status: info.status,
        uptime: Date.now() - info.startTime
      };
    });

    // Check interval status
    Object.entries(this.intervals).forEach(([name, interval]) => {
      status.intervals[name] = !!interval;
    });

    return status;
  }

  /**
   * Restart monitoring system
   */
  async restartSystem(systemName) {
    console.log(`🔄 [MONITORING] Restarting ${systemName} system...`);

    try {
      switch (systemName) {
        case 'activity':
          await this.stopActivityMonitoring();
          await this.startActivityMonitoring();
          break;
        case 'screenshot':
          await this.stopScreenshotMonitoring();
          await this.startScreenshotMonitoring();
          break;
        case 'idle':
          await this.stopIdleMonitoring();
          await this.startIdleMonitoring();
          break;
        case 'app':
          await this.stopAppMonitoring();
          await this.startAppMonitoring();
          break;
        case 'url':
          await this.stopUrlMonitoring();
          await this.startUrlMonitoring();
          break;
        default:
          console.log(`⚠️ [MONITORING] Unknown system: ${systemName}`);
      }

      console.log(`✅ [MONITORING] ${systemName} system restarted`);
    } catch (error) {
      console.error(`❌ [MONITORING] Failed to restart ${systemName}:`, error);
    }
  }

  /**
   * Emergency stop all monitoring
   */
  async emergencyStop() {
    console.log('🚨 [MONITORING] Emergency stop initiated');
    
    try {
      // Clear all intervals immediately
      Object.keys(this.intervals).forEach(name => {
        if (this.intervals[name]) {
          clearInterval(this.intervals[name]);
          this.intervals[name] = null;
        }
      });

      // Stop all systems
      this.monitoringSystems.forEach((info, name) => {
        try {
          if (info.system && typeof info.system.stop === 'function') {
            info.system.stop();
          }
        } catch (error) {
          console.error(`❌ [MONITORING] Emergency stop error for ${name}:`, error);
        }
      });

      this.isMonitoring = false;
      console.log('✅ [MONITORING] Emergency stop completed');
    } catch (error) {
      console.error('❌ [MONITORING] Emergency stop failed:', error);
    }
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    console.log('🧹 [MONITORING] Cleaning up monitoring manager...');
    
    await this.stopAllMonitoring();
    this.monitoringSystems.clear();
  }
}

module.exports = MonitoringManager;