/**
 * Database Manager Module
 * Handles all database operations, status reporting, and data persistence
 * Extracted from main.js for modular architecture
 */

const debugLogger = require('../utils/debug-logger');

class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.isTracking = false;
    this.dbStatusInterval = null;
    this.activityStatsSaveInterval = null;
    this.lastActivityStatsSave = Date.now();
  }

  initialize({ isTracking = false } = {}) {
    this.isTracking = isTracking;
    console.log('🗄️ [DATABASE-MANAGER] Initialized');
  }

  setTrackingState(tracking) {
    this.isTracking = tracking;
  }

  // === DATABASE STATUS REPORTING ===
  /**
   * Always 0: counting today's distinct apps needs a direct app_logs read, which
   * only the Supabase client could do. No backend action exposes this.
   */
  async getTodayAppCount() {
    console.log('⚠️ [APP COUNT] Unavailable — no backend action for distinct app counts');
    return 0;
  }

  /**
   * No-op: the report queried app_logs / url_logs directly through Supabase and
   * has no backend equivalent. Nothing is scheduled so we do not burn a timer.
   */
  startDatabaseStatusReporting() {
    console.log('📊 [DATABASE STATUS] Periodic status reporting unavailable (no backend read action)');
  }

  stopDatabaseStatusReporting() {
    if (this.dbStatusInterval) {
      clearInterval(this.dbStatusInterval);
      this.dbStatusInterval = null;
      console.log('📊 [DATABASE STATUS] Status reporting stopped');
    }
  }

  // Activity stats persistence
  /**
   * No-op: activity_stats was a Supabase-only table with no backend action.
   * Input counters still reach the backend through screenshot rows.
   */
  async saveActivityStatsToDatabase() {
    if (!this.isTracking || !global.displayActivityStats) {
      return;
    }

    const stats = {
      user_id: this.config.user_id,
      clicks: global.displayActivityStats.clicks || 0,
      keys: global.displayActivityStats.keys || 0,
      moves: global.displayActivityStats.moves || 0,
      timestamp: new Date().toISOString()
    };

    // [IN5] Pre-save payload — kept so input-tracking diagnostics still emit
    debugLogger.in5('Input activity pre-save payload', {
      sessionId: global.currentTimeLogId,
      userId: stats.user_id,
      timestamp: stats.timestamp,
      kpm: Math.round(stats.keys * 60000 / (Date.now() - (global.sessionStartTime ? new Date(global.sessionStartTime).getTime() : Date.now()))),
      cpm: Math.round(stats.clicks * 60000 / (Date.now() - (global.sessionStartTime ? new Date(global.sessionStartTime).getTime() : Date.now()))),
      movement: stats.moves
    });

    if (!this._activityStatsWarned) {
      console.log('⚠️ [DATABASE] activity_stats persistence unavailable (no backend action)');
      this._activityStatsWarned = true;
    }
  }

  startActivityStatsPersistence() {
    console.log('💾 [DATABASE] Activity stats persistence unavailable (no backend action)');
  }

  stopActivityStatsPersistence() {
    if (this.activityStatsSaveInterval) {
      clearInterval(this.activityStatsSaveInterval);
      this.activityStatsSaveInterval = null;
      console.log('💾 [DATABASE] Activity stats persistence stopped');
    }
  }

  // Feature status updates
  updateFeatureStatus(featureName, status, details = {}) {
    const featureData = {
      feature: featureName,
      status: status,
      details: details,
      timestamp: new Date().toISOString()
    };

    // Send to renderer for UI updates
    try {
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('feature-status-update', featureData);
      }
    } catch (error) {
      console.log('⚠️ [FEATURE-STATUS] Send error:', error.message);
    }
  }

  // Success callbacks for different monitoring systems
  onScreenshotSuccess() {
    this.updateFeatureStatus('screenshots', 'active', { 
      lastCapture: new Date().toISOString() 
    });
  }

  onAppDetectionSuccess(appName) {
    this.updateFeatureStatus('appDetection', 'active', { 
      lastApp: appName,
      timestamp: new Date().toISOString()
    });
  }

  onUrlDetectionSuccess(url) {
    this.updateFeatureStatus('urlDetection', 'active', { 
      lastUrl: url,
      timestamp: new Date().toISOString()
    });
  }

  onIdleDetectionSuccess(idleTime) {
    this.updateFeatureStatus('idleDetection', 'active', { 
      idleTime: idleTime,
      timestamp: new Date().toISOString()
    });
  }

  onInputTrackingSuccess(inputType) {
    this.updateFeatureStatus('inputTracking', 'active', { 
      inputType: inputType,
      timestamp: new Date().toISOString()
    });
  }

  onDatabaseSuccess(operation) {
    this.updateFeatureStatus('database', 'active', { 
      operation: operation,
      timestamp: new Date().toISOString()
    });
  }

  shutdown() {
    this.stopDatabaseStatusReporting();
    this.stopActivityStatsPersistence();
    console.log('🗄️ [DATABASE-MANAGER] Shutdown complete');
  }
}

module.exports = DatabaseManager;