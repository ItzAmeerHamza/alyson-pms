/**
 * INTERVAL MONITORING MANAGER MODULE
 * 
 * Specialized management of advanced interval callbacks and batch processing
 * for the TimeFlow desktop agent.
 * 
 * Part of TimeFlow Desktop Agent Phase 6 refactoring
 */

class IntervalMonitoringManager {
  constructor(dependencies = {}) {
    this.intervalManager = dependencies.intervalManager;
    this.antiCheatDetector = dependencies.antiCheatDetector;
    this.screenshotsPaused = dependencies.screenshotsPaused;
    this.isTracking = dependencies.isTracking;
    this.currentSession = dependencies.currentSession;
    this.activityStats = dependencies.activityStats;
    this.betweenScreenshotsActivity = dependencies.betweenScreenshotsActivity;
    this.smartUrlCapture = dependencies.smartUrlCapture;
    this.captureScreenshot = dependencies.captureScreenshot;
    this.checkMandatoryScreenshot = dependencies.checkMandatoryScreenshot;
    this.checkNotifications = dependencies.checkNotifications;
    this.fetchSettings = dependencies.fetchSettings;
    this.scheduleRandomScreenshot = dependencies.scheduleRandomScreenshot;
    this.screenshotInterval = dependencies.screenshotInterval;
    
    console.log('✅ IntervalMonitoringManager initialized');
  }

  /**
   * Setup advanced interval monitoring callbacks
   */
  setupAdvancedIntervals() {
    if (!this.intervalManager) {
      console.error('❌ Cannot setup advanced intervals: intervalManager not initialized');
      return;
    }

    // Register background browser check with actual URL detection
    this.intervalManager.register('BACKGROUND_BROWSER_CHECK', async () => {
      try {
        console.log('🔍 [BACKGROUND_BROWSER_CHECK] Running URL detection...');
        await this.smartUrlCapture();
        return { status: 'completed' };
      } catch (error) {
        console.error('❌ [BACKGROUND_BROWSER_CHECK] Error:', error.message);
        return { status: 'error', error: error.message };
      }
    });
    
    // Register anti-cheat monitoring
    this.intervalManager.register('ANTI_CHEAT_MONITORING', () => {
      try {
        if (this.antiCheatDetector) {
          const report = this.antiCheatDetector.getDetectionReport();
          return {
            suspicious: report.currentRiskLevel !== 'LOW',
            indicators: report.totalSuspiciousEvents
          };
        }
        
        return { suspicious: false };
      } catch (error) {
        return { suspicious: false };
      }
    });
    
    // REMOVED: Screenshot monitoring recovery - window-based 3-per-10-min logic in enhanced-screenshot-manager is the single source
    // The enhanced-screenshot-manager has its own heartbeat diagnostics that will self-heal if needed
    // this.intervalManager.register('SCREENSHOT_MONITORING', ...) - removed to prevent conflicts
    
    // Register notifications check
    this.intervalManager.register('NOTIFICATIONS', async () => {
      await this.checkNotifications();
    });
    
    // Register settings refresh
    this.intervalManager.register('SETTINGS_REFRESH', async () => {
      await this.fetchSettings();
    });

    console.log('✅ Advanced intervals setup completed');
  }

  /**
   * Setup batch processor for database writes
   */
  setupBatchProcessor() {
    if (!this.intervalManager || typeof this.intervalManager.registerBatchProcessor !== 'function') {
      console.error('❌ Cannot setup batch processor: intervalManager not available');
      return;
    }

    this.intervalManager.registerBatchProcessor(async (batchData) => {
      try {
        // Aggregate and process activity data
        if (batchData.activities && batchData.activities.length > 0) {
          const aggregated = this.aggregateActivityData(batchData.activities);
          
          // Update local stats
          this.activityStats.mouseMovements += aggregated.mouseMovements;
          this.activityStats.mouseClicks += aggregated.mouseClicks;
          this.activityStats.keystrokes += aggregated.keystrokes;
        }
        
        // Process app/URL logs
        if (batchData.appLogs && batchData.appLogs.length > 0) {
          const uniqueApps = this.deduplicateAppLogs(batchData.appLogs);
          
          for (const appLog of uniqueApps) {
            if (appLog.data && appLog.data.activeApp !== this.lastActiveApp) {
              this.lastActiveApp = appLog.data.activeApp;
            }
            
            if (appLog.data && appLog.data.activeUrl && appLog.data.activeUrl !== this.lastActiveUrl) {
              this.lastActiveUrl = appLog.data.activeUrl;
            }
          }
        }
        
        console.log(`📦 Batch processed: ${batchData.activities?.length || 0} activities, ${batchData.appLogs?.length || 0} app logs`);
        
      } catch (error) {
        console.error('❌ Error in batch processor:', error);
      }
    });
  }

  /**
   * Aggregate activity data for batch processing
   */
  aggregateActivityData(activities) {
    const result = {
      mouseMovements: 0,
      mouseClicks: 0,
      keystrokes: 0,
      idleTime: 0,
      activeTime: 0
    };
    
    activities.forEach(activity => {
      if (activity.data) {
        if (activity.data.mouse?.moved) result.mouseMovements++;
        if (activity.data.mouse?.clicked) result.mouseClicks++;
        if (activity.data.keyboard?.pressed) result.keystrokes++;
        
        if (activity.data.idle?.isIdle) {
          result.idleTime += activity.data.idle.duration || 0;
        } else {
          result.activeTime += 1000;
        }
      }
    });
    
    return result;
  }

  /**
   * Deduplicate app logs to avoid redundant processing
   */
  deduplicateAppLogs(appLogs) {
    const seen = new Map();
    
    return appLogs.filter(log => {
      if (!log.data) return false;
      
      const key = `${log.data.activeApp}-${log.data.activeUrl || ''}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        return true;
      }
      return false;
    });
  }

  /**
   * Initialize the interval monitoring manager
   */
  async initialize() {
    try {
      this.setupAdvancedIntervals();
      this.setupBatchProcessor();
      console.log('⏱️ IntervalMonitoringManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ IntervalMonitoringManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the interval monitoring manager
   */
  async shutdown() {
    try {
      console.log('⏱️ IntervalMonitoringManager shutdown complete');
    } catch (error) {
      console.error('❌ IntervalMonitoringManager shutdown failed:', error);
    }
  }
}

module.exports = IntervalMonitoringManager;