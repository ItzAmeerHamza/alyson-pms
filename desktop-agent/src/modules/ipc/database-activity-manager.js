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
    this.supabaseService = dependencies.supabaseService;
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
        if (!this.supabaseService || !this.global.currentUserId) {
          return { error: 'Database not available or user not authenticated' };
        }

        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Get recent activity stats from database
        const { data: activityStatsData, error: statsError } = await this.supabaseService
          .from('activity_stats')
          .select('*')
          .eq('user_id', this.global.currentUserId)
          .gte('period_start', last24Hours.toISOString())
          .order('period_start', { ascending: false })
          .limit(1);

        if (statsError) {
          console.error('Error fetching activity stats:', statsError);
          // Fallback to local data
          const localStats = (this.activityStatsCache && this.activityStatsCache.data) || {
            mouseMovements: (this.activityStats && this.activityStats.mouseMovements) || 0,
            keyPresses: (this.activityStats && this.activityStats.keystrokes) || 0,
            mouseClicks: (this.activityStats && this.activityStats.mouseClicks) || 0,
            activeTime: 0,
            appsCount: 0,
            screenshotCount: 0
          };
          return localStats;
        }

        // If we have recent database data, use it
        if (activityStatsData && activityStatsData.length > 0) {
          const dbStats = activityStatsData[0];
          return {
            mouseMovements: dbStats.mouse_movements || 0,
            keyPresses: dbStats.keystrokes || 0,
            mouseClicks: dbStats.mouse_clicks || 0,
            activeTime: dbStats.active_time_seconds || 0,
            appsCount: dbStats.apps_count || 0,
            screenshotCount: dbStats.screenshot_count || 0,
            sessionDuration: dbStats.session_duration_seconds || 0,
            productivity: dbStats.productivity_score || 0
          };
        }

        // Fallback to local stats if no database data
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
        if (!this.supabaseService || !this.global.currentUserId) {
          return { 
            currentRiskLevel: 'LOW',
            totalSuspiciousEvents: 0,
            lastCheck: new Date().toISOString(),
            status: 'offline',
            message: 'Database not available'
          };
        }

        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Get recent fraud alerts from database
        const { data: fraudAlerts, error: fraudError } = await this.supabaseService
          .from('fraud_alerts')
          .select('*')
          .eq('user_id', this.global.currentUserId)
          .gte('detected_at', last24Hours.toISOString())
          .order('detected_at', { ascending: false });

        // Get recent suspicious activity as fallback
        const { data: suspiciousActivity, error: suspiciousError } = await this.supabaseService
          .from('suspicious_activity')
          .select('*')
          .eq('user_id', this.global.currentUserId)
          .gte('timestamp', last24Hours.toISOString())
          .order('timestamp', { ascending: false })
          .limit(10);

        // Calculate risk level based on recent activities
        let totalSuspiciousEvents = 0;
        let currentRiskLevel = 'LOW';

        if (!fraudError && fraudAlerts && fraudAlerts.length > 0) {
          totalSuspiciousEvents += fraudAlerts.length;
          const highRiskAlerts = fraudAlerts.filter(alert => alert.severity === 'HIGH' || alert.severity === 'CRITICAL');
          if (highRiskAlerts.length > 0) {
            currentRiskLevel = 'HIGH';
          } else if (fraudAlerts.length > 2) {
            currentRiskLevel = 'MEDIUM';
          }
        }

        if (!suspiciousError && suspiciousActivity && suspiciousActivity.length > 0) {
          totalSuspiciousEvents += suspiciousActivity.length;
          const highRiskActivities = suspiciousActivity.filter(activity => activity.risk_score && activity.risk_score > 7);
          if (highRiskActivities.length > 0 && currentRiskLevel === 'LOW') {
            currentRiskLevel = 'MEDIUM';
          }
        }

        return {
          currentRiskLevel: currentRiskLevel,
          totalSuspiciousEvents: totalSuspiciousEvents,
          lastCheck: now.toISOString(),
          status: 'monitoring',
          message: totalSuspiciousEvents > 0 
            ? `${totalSuspiciousEvents} suspicious events detected in last 24 hours`
            : 'No suspicious activity detected',
          fraudAlerts: fraudAlerts || [],
          suspiciousActivity: suspiciousActivity || []
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