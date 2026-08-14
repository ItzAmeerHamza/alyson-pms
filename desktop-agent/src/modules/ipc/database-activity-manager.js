/**
 * DATABASE ACTIVITY MANAGER MODULE
 * 
 * Manages database-related activity and security IPC handlers for the TimeFlow desktop agent.
 * This includes activity stats fetching, anti-cheat reporting, and security monitoring.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class DatabaseActivityManager {
  constructor(dependencies = {}) {
    this.ipcMain = dependencies.ipcMain;
    this.global = dependencies.global || global;
    this.activityStats = dependencies.activityStats;
    this.activityStatsCache = dependencies.activityStatsCache;
    this.antiCheatDetector = dependencies.antiCheatDetector;
    
    console.log('✅ DatabaseActivityManager initialized');
  }

  /**
   * Register all database activity-related IPC handlers
   */
  registerHandlers() {
    this.registerGetActivityStatsFromDb();
    this.registerGetAntiCheatReportFromDb();
    
    console.log('✅ All database activity IPC handlers registered');
  }

  /**
   * Get activity statistics from database
   */
  registerGetActivityStatsFromDb() {
    this.ipcMain.handle('get-activity-stats-from-db', async () => {
      try {
        if (!this.global.currentUserId) {
          return { error: 'Database not available or user not authenticated' };
        }

        // The rolled-up `activity_stats` table was Supabase-only and has no RDS
        // equivalent, so the in-process counters are the only source now.
        console.warn(
          '⚠️ [DatabaseActivityManager] activity_stats has no RDS equivalent — using local counters',
        );

        return {
          mouseMovements: (this.activityStats && this.activityStats.mouseMovements) || 0,
          keyPresses: (this.activityStats && this.activityStats.keystrokes) || 0,
          mouseClicks: (this.activityStats && this.activityStats.mouseClicks) || 0,
          activeTime: Math.max(0, Math.floor((Date.now() - (this.activityStats && this.activityStats.lastReset || Date.now())) / 1000) - (this.activityStats && this.activityStats.idleSeconds || 0)),
          appsCount: (this.activityStats && this.activityStats.appsUsed) ? this.activityStats.appsUsed.size : 0,
          screenshotCount: (this.activityStats && this.activityStats.screenshotsCaptured) || 0,
          sessionDuration: Math.floor((Date.now() - (this.activityStats && this.activityStats.lastReset || Date.now())) / 1000),
          productivity: (this.activityStats && this.activityStats.productivity) || 0
        };

      } catch (error) {
        console.error('Error in get-activity-stats-from-db:', error);
        return { error: error.message };
      }
    });
  }

  /**
   * Get anti-cheat/security report from database
   */
  registerGetAntiCheatReportFromDb() {
    this.ipcMain.handle('get-anti-cheat-report-from-db', async () => {
      try {
        // `fraud_alerts` and `suspicious_activity` were Supabase-only tables with no RDS
        // read action, so no stored risk history can be reported.
        console.warn(
          '⚠️ [DatabaseActivityManager] fraud_alerts / suspicious_activity have no RDS equivalent — reporting no stored events',
        );

        return {
          currentRiskLevel: 'LOW',
          totalSuspiciousEvents: 0,
          lastCheck: new Date().toISOString(),
          status: 'offline',
          message: 'Stored security history unavailable',
          fraudAlerts: [],
          suspiciousActivity: []
        };

      } catch (error) {
        console.error('Error in get-anti-cheat-report-from-db:', error);
        return {
          currentRiskLevel: 'LOW',
          totalSuspiciousEvents: 0,
          lastCheck: new Date().toISOString(),
          status: 'error',
          message: 'Failed to load security data',
          error: error.message
        };
      }
    });
  }

  /**
   * Initialize the database activity manager
   */
  async initialize() {
    try {
      this.registerHandlers();
      console.log('📊 DatabaseActivityManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ DatabaseActivityManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the database activity manager
   */
  async shutdown() {
    try {
      console.log('📊 DatabaseActivityManager shutdown complete');
    } catch (error) {
      console.error('❌ DatabaseActivityManager shutdown failed:', error);
    }
  }
}

module.exports = DatabaseActivityManager;