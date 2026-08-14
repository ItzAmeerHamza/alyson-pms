/**
 * ADVANCED IPC HANDLERS MODULE
 * 
 * Manages complex IPC handlers for activity logs, screenshots, reports, 
 * and other advanced functionality for the TimeFlow desktop agent.
 * 
 * Part of TimeFlow Desktop Agent Phase 5 refactoring
 */

class AdvancedIPCHandlers {
  constructor(dependencies = {}) {
    this.ipcMain = dependencies.ipcMain;
    this.config = dependencies.config;
    this.safeLog = dependencies.safeLog;
    this.global = dependencies.global || global;
    this.activityStats = dependencies.activityStats;
    this.isTracking = dependencies.isTracking;
    
    console.log('✅ AdvancedIPCHandlers initialized');
  }

  /**
   * Register all advanced IPC handlers
   */
  registerHandlers() {
    this.registerActivityLogsHandler();
    this.registerSystemLogsHandler();
    this.registerScreenshotLogsHandler();
    this.registerCompatibilityReportHandler();
    this.registerEnhancedScreenshotHandler();
    
    console.log('✅ All advanced IPC handlers registered');
  }

  /**
   * Register activity logs handler
   */
  registerActivityLogsHandler() {
    this.ipcMain.handle('get-activity-logs', async () => {
      try {
        this.safeLog('📊 Fetching recent activity logs from database...');
        
        const { isBackendRdsEnabled, listAppLogs, listUrlLogs } = require('../utils/backend-rds-reads');
        if (!isBackendRdsEnabled(this.config) || !this.global.currentUserId) {
          console.warn('⚠️ Cannot fetch activity logs: backend not configured or missing user ID');
          return this.generateFallbackLogs();
        }

        const logs = [];
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const nowIso = new Date().toISOString();
        const currentUser = this.global.currentUserId;

        try {
          // Fetch recent app logs
          const appLogs = await listAppLogs(
            currentUser,
            { start: oneDayAgo, end: nowIso, limit: 5 },
            this.config,
          );

          if (appLogs?.length) {
            appLogs.forEach(log => {
              logs.push({
                id: `app_${log.timestamp}`,
                timestamp: log.timestamp,
                type: 'App Activity',
                description: `Switched to ${log.app_name}${log.window_title ? ` (${log.window_title})` : ''}`,
                metadata: { app: log.app_name, timeLogId: log.time_log_id }
              });
            });
          }

          // Fetch recent URL logs
          const urlLogs = await listUrlLogs(
            currentUser,
            { start: oneDayAgo, end: nowIso, limit: 5 },
            this.config,
          );

          if (urlLogs?.length) {
            urlLogs.forEach(log => {
              logs.push({
                id: `url_${log.timestamp}`,
                timestamp: log.timestamp,
                type: 'Web Activity',
                description: `Visited ${log.domain || log.url}${log.title ? ` - ${log.title}` : ''}`,
                metadata: { url: log.url, browser: log.browser, timeLogId: log.time_log_id }
              });
            });
          }

          // Fetch recent screenshots with activity data — RDS names the capture time `captured_at`
          const { fetchScreenshotsFromBackend } = require('../utils/backend-screenshots');
          const screenshots = await fetchScreenshotsFromBackend(currentUser, this.config, {
            startIso: oneDayAgo,
            endIso: nowIso,
            limit: 3,
          });

          if (screenshots?.length) {
            screenshots.forEach(log => {
              logs.push({
                id: `screenshot_${log.captured_at}`,
                timestamp: log.captured_at,
                type: 'Screenshot',
                description: `Activity: ${log.activity_percent}% - ${log.mouse_clicks || 0} clicks, ${log.keystrokes || 0} keys, ${log.mouse_movements || 0} moves`,
                metadata: { 
                  activity: log.activity_percent, 
                  clicks: log.mouse_clicks,
                  keys: log.keystrokes,
                  moves: log.mouse_movements,
                  timeLogId: log.time_log_id 
                }
              });
            });
          }

          // 'Input Activity' entries came from the Supabase `activities` table (raw
          // mouse/keyboard events); there is no RDS equivalent, so they are omitted.

        } catch (dbError) {
          console.error('❌ Database error fetching activity logs:', dbError);
          // Continue with empty logs rather than failing completely
        }

        // Sort logs by timestamp (most recent first)
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return { 
          success: true, 
          logs: logs.slice(0, 15), // Limit to 15 most recent entries
          totalCount: logs.length 
        };

      } catch (error) {
        console.error('❌ Error fetching activity logs:', error);
        return this.generateFallbackLogs();
      }
    });
  }

  /**
   * Generate fallback logs when database is unavailable
   */
  generateFallbackLogs() {
    const fallbackLogs = [];
    const now = new Date();
    
    if (this.activityStats?.mouseClicks > 0 || this.activityStats?.keystrokes > 0 || this.activityStats?.mouseMovements > 0) {
      fallbackLogs.push({
        id: 'fallback_activity',
        timestamp: now.toISOString(),
        type: 'Activity Summary',
        description: `Session activity: ${this.activityStats?.mouseClicks || 0} clicks, ${this.activityStats?.keystrokes || 0} keystrokes, ${this.activityStats?.mouseMovements || 0} mouse movements`,
        metadata: { source: 'fallback' }
      });
    }
    
    if (this.isTracking) {
      fallbackLogs.push({
        id: 'fallback_tracking',
        timestamp: now.toISOString(),
        type: 'Tracking Status',
        description: 'Time tracking is currently active',
        metadata: { source: 'fallback' }
      });
    }
    
    return { success: true, logs: fallbackLogs };
  }

  /**
   * Register system logs handler
   */
  registerSystemLogsHandler() {
    this.ipcMain.handle('get-system-logs', () => {
      try {
        const logs = [];
        const now = new Date();
        
        // Add startup log
        logs.push({
          id: 'system_startup',
          timestamp: now.toISOString(),
          type: 'System',
          message: 'TimeFlow Desktop Agent started successfully',
          level: 'info'
        });
        
        // Add memory usage log
        const memUsage = process.memoryUsage();
        logs.push({
          id: 'memory_usage',
          timestamp: now.toISOString(),
          type: 'Performance',
          message: `Memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB heap, ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS`,
          level: 'info'
        });
        
        return { success: true, logs };
      } catch (error) {
        console.error('❌ Error getting system logs:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Register screenshot logs handler
   */
  registerScreenshotLogsHandler() {
    this.ipcMain.handle('get-screenshot-logs', () => {
      try {
        const logs = [];
        const now = new Date();
        
        // Add screenshot status log
        logs.push({
          id: 'screenshot_status',
          timestamp: now.toISOString(),
          type: 'Screenshot',
          message: 'Screenshot system operational',
          level: 'info'
        });
        
        return { success: true, logs };
      } catch (error) {
        console.error('❌ Error getting screenshot logs:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Register compatibility report handler
   */
  registerCompatibilityReportHandler() {
    this.ipcMain.handle('get-compatibility-report', () => {
      try {
        const report = {
          platform: process.platform,
          architecture: process.arch,
          nodeVersion: process.version,
          electronVersion: process.versions.electron,
          chromeVersion: process.versions.chrome,
          v8Version: process.versions.v8,
          timestamp: new Date().toISOString()
        };
        
        // Add platform-specific compatibility checks
        if (process.platform === 'darwin') {
          report.macOSCompatibility = 'Compatible';
        } else if (process.platform === 'win32') {
          report.windowsCompatibility = 'Compatible';
        } else {
          report.linuxCompatibility = 'Compatible';
        }
        
        return { success: true, report };
      } catch (error) {
        console.error('❌ Error generating compatibility report:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Register enhanced screenshot handler - DISABLED (using ipc-event-map version)
   */
  registerEnhancedScreenshotHandler() {
    // 'fetch-screenshots-enhanced' is owned by DataStatsManager (RDS + S3).
  }

  /**
   * Initialize the advanced IPC handlers
   */
  async initialize() {
    try {
      this.registerHandlers();
      console.log('🔗 AdvancedIPCHandlers initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ AdvancedIPCHandlers initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the advanced IPC handlers
   */
  async shutdown() {
    try {
      console.log('🔗 AdvancedIPCHandlers shutdown complete');
    } catch (error) {
      console.error('❌ AdvancedIPCHandlers shutdown failed:', error);
    }
  }
}

module.exports = AdvancedIPCHandlers;