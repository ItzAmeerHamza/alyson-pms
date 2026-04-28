/**
 * Database Manager Module
 * Handles all database operations, status reporting, and data persistence
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('../core/cleanup-registry');
const debugLogger = require('../utils/debug-logger');

class DatabaseManager {
  constructor(config, supabaseService) {
    this.config = config;
    this.supabaseService = supabaseService;
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
  async getTodayAppCount() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const { data, error } = await this.supabaseService
        .from('app_logs')
        .select('app_name')
        .eq('user_id', this.config.user_id)
        .gte('timestamp', today.toISOString())
        .lt('timestamp', tomorrow.toISOString());
      
      if (error) {
        console.log('❌ Error getting today\'s app count:', error.message);
        return 0;
      }
      
      // Count unique apps
      const uniqueApps = new Set(data.map(log => log.app_name));
      console.log(`📊 [APP COUNT] Found ${uniqueApps.size} unique apps today`);
      return uniqueApps.size;
    } catch (error) {
      console.log('❌ Error in getTodayAppCount:', error.message);
      return 0;
    }
  }

  startDatabaseStatusReporting() {
    // PERFORMANCE FIX: Track interval with cleanup-registry for proper memory management
    this.dbStatusInterval = setInterval(async () => {
      // CRITICAL FIX: Only generate database status reports when tracking is active
      if (!this.isTracking) {
        return;
      }
      
      try {
        // Query last app detected and saved
        const { data: lastApp } = await this.supabaseService
          .from('app_logs')
          .select('app_name, window_title, timestamp')
          .order('timestamp', { ascending: false })
          .limit(1);
        
        // Query last URL detected and saved  
        const { data: lastUrl } = await this.supabaseService
          .from('url_logs')
          .select('site_url, domain, browser, title, timestamp')
          .order('timestamp', { ascending: false })
          .limit(1);
        
        console.log('📊 [DATABASE STATUS REPORT] ==========================================');
        
        if (lastApp && lastApp.length > 0) {
          const app = lastApp[0];
          const timeAgo = Math.round((Date.now() - new Date(app.timestamp).getTime()) / 1000);
          console.log(`📱 [LAST APP IN DATABASE]: "${app.app_name}" | Window: "${app.window_title}" | ${timeAgo}s ago`);
        } else {
          console.log('📱 [LAST APP IN DATABASE]: No app data found');
        }
        
        if (lastUrl && lastUrl.length > 0) {
          const url = lastUrl[0];
          const timeAgo = Math.round((Date.now() - new Date(url.timestamp).getTime()) / 1000);
          console.log(`🌐 [LAST URL IN DATABASE]: "${url.site_url || 'null'}" | Domain: "${url.domain}" | Browser: "${url.browser}" | ${timeAgo}s ago`);
        } else {
          console.log('🌐 [LAST URL IN DATABASE]: No URL data found');
        }
        
        console.log('📊 ================================================================');
        
      } catch (error) {
        console.log('❌ [DATABASE STATUS] Error querying last detected data:', error.message);
      }
    }, 30000); // Every 30 seconds
    
    cleanupRegistry.registerInterval(this.dbStatusInterval, 'Database Status Reporting');
    
    console.log('📊 [DATABASE STATUS] Periodic status reporting started (every 30s)');
  }

  stopDatabaseStatusReporting() {
    if (this.dbStatusInterval) {
      clearInterval(this.dbStatusInterval);
      this.dbStatusInterval = null;
      console.log('📊 [DATABASE STATUS] Status reporting stopped');
    }
  }

  // Activity stats persistence
  async saveActivityStatsToDatabase() {
    try {
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

      // [IN5] Pre-save payload
      debugLogger.in5('Input activity pre-save payload', {
        sessionId: global.currentTimeLogId,
        userId: stats.user_id,
        timestamp: stats.timestamp,
        kpm: Math.round(stats.keys * 60000 / (Date.now() - (global.sessionStartTime ? new Date(global.sessionStartTime).getTime() : Date.now()))),
        cpm: Math.round(stats.clicks * 60000 / (Date.now() - (global.sessionStartTime ? new Date(global.sessionStartTime).getTime() : Date.now()))),
        movement: stats.moves
      });

      const { error } = await this.supabaseService
        .from('activity_stats')
        .insert(stats);

      if (error) {
        // [IN6] DB write result - error
        debugLogger.in6('Input activity DB write error', {
          error: error.message,
          userId: stats.user_id,
          timestamp: stats.timestamp
        });
        
        console.log('❌ Error saving activity stats:', error.message);
      } else {
        // [IN6] DB write result - success
        debugLogger.in6('Input activity DB write success', {
          userId: stats.user_id,
          timestamp: stats.timestamp,
          rowInserted: true
        });
        
        console.log('✅ Activity stats saved to database');
      }
    } catch (error) {
      // [IN6] DB write result - error (exception)
      debugLogger.in6('Input activity DB write exception', {
        error: error.message,
        userId: this.config.user_id,
        timestamp: new Date().toISOString()
      });
      
      console.log('❌ Error in saveActivityStatsToDatabase:', error.message);
    }
  }

  startActivityStatsPersistence() {
    this.activityStatsSaveInterval = setInterval(async () => {
      await this.saveActivityStatsToDatabase();
    }, 60000); // Every minute

    cleanupRegistry.registerInterval(this.activityStatsSaveInterval, 'Activity Stats Persistence');
    console.log('💾 [DATABASE] Activity stats persistence started (every 60s)');
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