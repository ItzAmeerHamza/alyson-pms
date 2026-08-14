/**
 * Activity Manager Module
 * Manages activity detection, monitoring, and data processing
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('../core/cleanup-registry');

class ActivityManager {
  constructor(config) {
    this.config = config;
    this.activityQueue = [];
    this.activitySyncInterval = null;
    this.liveActivityInterval = null;
    this.isMonitoring = false;
    
    // Activity counters
    this.displayActivityStats = {
      totalClicks: 0,
      totalKeys: 0,
      totalMoves: 0,
      lastReset: Date.now(),
      sessionClicks: 0,
      sessionKeys: 0,
      sessionMoves: 0,
      sessionStart: Date.now(),
      idleSeconds: 0,
      lastActivity: Date.now(),
      // CRITICAL FIX: Add simple field names for screenshot compatibility
      clicks: 0,
      keys: 0,
      moves: 0,
      lastUpdate: Date.now()
    };
    
    // Make stats globally available
    global.displayActivityStats = this.displayActivityStats;
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'activityManager',
      cleanup: async () => this.cleanup()
    });
  }

  /**
   * Start activity monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ [ACTIVITY] Already monitoring');
      return;
    }

    console.log('📊 [ACTIVITY] Starting activity monitoring...');
    this.isMonitoring = true;
    
    // Start live activity updates
    this.startLiveActivityUpdates();
    
    // Start activity sync
    this.startActivitySync();
    
    console.log('✅ [ACTIVITY] Activity monitoring started');
  }

  /**
   * Stop activity monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;

    console.log('🛑 [ACTIVITY] Stopping activity monitoring...');
    this.isMonitoring = false;
    
    this.stopLiveActivityUpdates();
    this.stopActivitySync();
    
    console.log('✅ [ACTIVITY] Activity monitoring stopped');
  }

  /**
   * Start live activity updates to renderer
   */
  startLiveActivityUpdates() {
    if (this.liveActivityInterval) {
      clearInterval(this.liveActivityInterval);
    }

    // Send activity updates every 2 seconds
    this.liveActivityInterval = setInterval(() => {
      this.sendActivityToRenderer();
    }, 2000);
  }

  /**
   * Stop live activity updates
   */
  stopLiveActivityUpdates() {
    if (this.liveActivityInterval) {
      clearInterval(this.liveActivityInterval);
      this.liveActivityInterval = null;
    }
  }

  /**
   * Start activity sync to database
   */
  startActivitySync() {
    if (this.activitySyncInterval) {
      clearInterval(this.activitySyncInterval);
    }

    // Sync activity to database every 30 seconds
    this.activitySyncInterval = setInterval(() => {
      this.saveActivityStatsToDatabase();
    }, 30000);
  }

  /**
   * Stop activity sync
   */
  stopActivitySync() {
    if (this.activitySyncInterval) {
      clearInterval(this.activitySyncInterval);
      this.activitySyncInterval = null;
    }
  }

  /**
   * Queue a raw input event without incrementing counters (counters are owned by recordEnhancedActivity in main).
   */
  enqueueActivityEvent(type, method, details = {}) {
    const timestamp = Date.now();
    this.displayActivityStats.lastActivity = timestamp;
    this.displayActivityStats.lastUpdate = timestamp;
    this.displayActivityStats.idleSeconds = 0;

    this.activityQueue.push({
      type,
      method,
      details,
      timestamp
    });

    if (this.activityQueue.length > 1000) {
      this.activityQueue.splice(0, 500);
    }
  }

  /**
   * Record activity
   */
  recordActivity(type, method, details = {}) {
    const timestamp = Date.now();
    this.displayActivityStats.lastActivity = timestamp;

    switch (type) {
      case 'click':
        this.displayActivityStats.totalClicks++;
        this.displayActivityStats.sessionClicks++;
        this.displayActivityStats.clicks++; // CRITICAL FIX: Also update simple field for screenshot compatibility
        break;
      case 'key':
        this.displayActivityStats.totalKeys++;
        this.displayActivityStats.sessionKeys++;
        this.displayActivityStats.keys++; // CRITICAL FIX: Also update simple field for screenshot compatibility
        break;
      case 'move':
        this.displayActivityStats.totalMoves++;
        this.displayActivityStats.sessionMoves++;
        this.displayActivityStats.moves++; // CRITICAL FIX: Also update simple field for screenshot compatibility
        break;
    }
    
    // CRITICAL FIX: Update timestamp for simple fields
    this.displayActivityStats.lastUpdate = timestamp;

    // CRITICAL FIX: Also update per-screenshot activity counters
    // This ensures screenshots capture interval activity, not cumulative totals
    if (!global.betweenScreenshotsActivity) {
      global.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: timestamp };
    }

    switch (type) {
      case 'click':
        global.betweenScreenshotsActivity.clicks++;
        break;
      case 'key':
        global.betweenScreenshotsActivity.keys++;
        break;
      case 'move':
        global.betweenScreenshotsActivity.moves++;
        break;
    }
    global.betweenScreenshotsActivity.lastUpdate = timestamp;

    // Queue for database sync
    this.activityQueue.push({
      type,
      method,
      details,
      timestamp
    });

    // Keep queue size manageable
    if (this.activityQueue.length > 1000) {
      this.activityQueue.splice(0, 500); // Remove oldest 500 items
    }

    // Debug logging for activity tracking verification
    const total = this.displayActivityStats.totalClicks + this.displayActivityStats.totalKeys + this.displayActivityStats.totalMoves;
    try {
      const { logger } = require('../utils/logger');
      if (total % 200 === 0) {
        logger && logger.debug({ category: 'SYSTEM', step: 'ACTIVITY EVENT', ctx: {
          type, method, total,
          clicks: this.displayActivityStats.totalClicks,
          keys: this.displayActivityStats.totalKeys,
          moves: this.displayActivityStats.totalMoves,
        }});
      }
    } catch {}

    // Clear idle time when activity is detected
    this.displayActivityStats.idleSeconds = 0;
  }

  /**
   * Send activity data to renderer
   */
  sendActivityToRenderer() {
    if (!global.mainWindow || global.mainWindow.isDestroyed()) {
      return;
    }

    const activityData = this.getDefaultActivityData();
    
    try {
      global.mainWindow.webContents.send('activity-update', activityData);
    } catch (error) {
      console.log('⚠️ [ACTIVITY] Failed to send activity to renderer:', error.message);
    }
  }

  /**
   * Get default activity data structure
   */
  getDefaultActivityData() {
    const now = Date.now();
    const sessionDuration = Math.floor((now - this.displayActivityStats.sessionStart) / 1000);
    
    // CRITICAL FIX: Use global.betweenScreenshotsActivity for real-time counts
    // This is where the actual activity is being recorded
    const realtimeActivity = global.betweenScreenshotsActivity || { clicks: 0, keys: 0, moves: 0 };
    
    return {
      clicks: realtimeActivity.clicks || this.displayActivityStats.totalClicks,
      keystrokes: realtimeActivity.keys || this.displayActivityStats.totalKeys,
      mouseMovements: realtimeActivity.moves || this.displayActivityStats.totalMoves,
      // session* already includes all counted input; do not add realtimeActivity again (was double-counting in UI)
      sessionClicks: this.displayActivityStats.sessionClicks,
      sessionKeys: this.displayActivityStats.sessionKeys,
      sessionMoves: this.displayActivityStats.sessionMoves,
      lastActivity: realtimeActivity.lastUpdate || this.displayActivityStats.lastActivity,
      sessionDuration: sessionDuration,
      isActive: (now - (realtimeActivity.lastUpdate || this.displayActivityStats.lastActivity)) < 30000, // Active if activity within 30 seconds
      timestamp: now
    };
  }

  /**
   * No-op: activity_stats was a Supabase-only table. The backend derives activity
   * from screenshot and idle rows, so there is nothing to persist from here.
   */
  async saveActivityStatsToDatabase() {
    if (!this._activitySaveWarned) {
      console.log('⚠️ [ACTIVITY] activity_stats persistence removed — backend derives activity from screenshots/idle logs');
      this._activitySaveWarned = true;
    }
  }

  /**
   * Reset activity counters
   */
  resetActivityCounters() {
    console.log('🔄 [ACTIVITY] Resetting activity counters');
    
    this.displayActivityStats.sessionClicks = 0;
    this.displayActivityStats.sessionKeys = 0;
    this.displayActivityStats.sessionMoves = 0;
    this.displayActivityStats.sessionStart = Date.now();
    this.activityQueue = [];
  }

  /**
   * Update feature status
   */
  updateFeatureStatus(featureName, status, details = {}) {
    const statusData = {
      feature: featureName,
      status: status,
      details: details,
      timestamp: Date.now()
    };

    // Send to renderer
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      try {
        global.mainWindow.webContents.send('feature-status-update', statusData);
      } catch (error) {
        console.log('⚠️ [ACTIVITY] Failed to send feature status:', error.message);
      }
    }
  }

  /**
   * Get activity statistics
   */
  getActivityStats() {
    // Calculate active time based on session duration minus idle time
    const sessionDuration = Date.now() - this.displayActivityStats.sessionStart;
    const activeTime = Math.max(0, sessionDuration - (this.displayActivityStats.idleSeconds * 1000));
    
    // Return data in the format expected by the UI
    return {
      // UI-expected field names
      mouseMovements: this.displayActivityStats.totalMoves || 0,
      keyPresses: this.displayActivityStats.totalKeys || 0,
      mouseClicks: this.displayActivityStats.totalClicks || 0,
      activeTime: Math.floor(activeTime / 1000), // Convert to seconds
      appsCount: 0, // TODO: Calculate from app activity logs
      screenshotCount: 0, // TODO: Calculate from screenshot logs
      
      // Additional metadata
      queueSize: this.activityQueue.length,
      isMonitoring: this.isMonitoring,
      sessionStart: this.displayActivityStats.sessionStart,
      lastActivity: this.displayActivityStats.lastActivity,
      
      // Raw stats for debugging
      _raw: {
        ...this.displayActivityStats
      }
    };
  }

  /**
   * Process activity queue
   */
  processActivityQueue() {
    if (this.activityQueue.length === 0) return;

    console.log(`📊 [ACTIVITY] Processing ${this.activityQueue.length} queued activities`);
    
    // Process in batches
    const batchSize = 100;
    const batch = this.activityQueue.splice(0, batchSize);
    
    // Here you could send batch to database or process further
    // For now, just log the summary
    const summary = batch.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📊 [ACTIVITY] Processed batch:', summary);
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    console.log('🧹 [ACTIVITY] Cleaning up activity manager...');
    
    this.stopMonitoring();
    
    // Process remaining queue
    if (this.activityQueue.length > 0) {
      this.processActivityQueue();
    }
    
    // Save final stats
    await this.saveActivityStatsToDatabase();
  }
}

module.exports = ActivityManager;