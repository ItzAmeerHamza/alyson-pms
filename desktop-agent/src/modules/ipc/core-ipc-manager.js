/**
 * CORE IPC MANAGER MODULE
 * 
 * Centralized management of core IPC handlers, activity metrics, health checks,
 * and system status for the TimeFlow desktop agent.
 * 
 * Part of TimeFlow Desktop Agent Phase 7 refactoring
 */

class CoreIPCManager {
  constructor(dependencies = {}) {
    this.ipcMain = dependencies.ipcMain;
    this.config = dependencies.config;
    this.systemMonitor = dependencies.systemMonitor;
    this.calculateActivityPercent = dependencies.calculateActivityPercent;
    this.calculateIdleTimeSeconds = dependencies.calculateIdleTimeSeconds;
    this.getPerPeriodActivity = dependencies.getPerPeriodActivity;
    this.lastActivity = dependencies.lastActivity;
    this.idleCheckInterval = dependencies.idleCheckInterval;
    this.isTracking = dependencies.isTracking;
    this.isPaused = dependencies.isPaused;
    this.currentSession = dependencies.currentSession;
    
    console.log('✅ CoreIPCManager initialized');
  }

  /**
   * Register all core IPC handlers
   */
  registerHandlers() {
    this.registerHealthCheckHandlers();
    this.registerActivityMetricsHandler();
    this.registerProjectIdHandler();
    this.registerSystemStatusHandlers();
    
    console.log('✅ All core IPC handlers registered');
  }

  /**
   * Register health check handlers
   */
  registerHealthCheckHandlers() {
    // === CENTRALIZED HEALTH CHECK HANDLER ===
    this.ipcMain.handle('system-health-check', async () => {
      try {
        const healthResults = await this.systemMonitor.performComprehensiveHealthCheck();
        return {
          success: true,
          ...healthResults
        };
      } catch (error) {
        console.error('❌ [SYSTEM-MONITOR] Health check handler failed:', error);
        return {
          success: false,
          error: error.message,
          overall: 'critical',
          canStartTimer: false
        };
      }
    });
  }

  /**
   * Register system status handlers
   */
  registerSystemStatusHandlers() {
    // === CENTRALIZED SYSTEM STATUS HANDLER ===
    this.ipcMain.handle('get-system-status', () => {
      try {
        return {
          success: true,
          status: this.systemMonitor.getSystemStatus()
        };
      } catch (error) {
        console.error('❌ [SYSTEM-MONITOR] System status handler failed:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
  }

  /**
   * Register activity metrics handler
   */
  registerActivityMetricsHandler() {
    this.ipcMain.handle('get-activity-metrics', () => {
      try {
        console.log('📊 Getting activity metrics...');
        
        const activityScore = this.calculateActivityPercent();
        const idleTimeSeconds = this.calculateIdleTimeSeconds();
        
        // Get current period activity (shows zero during idle)
        const currentPeriodActivity = this.getPerPeriodActivity();
        
        const currentMetrics = {
          mouseClicks: currentPeriodActivity.mouseClicks,
          keystrokes: currentPeriodActivity.keystrokes,
          mouseMovements: currentPeriodActivity.mouseMovements,
          activityScore: activityScore,
          idleTime: idleTimeSeconds,
          timeSinceLastActivity: idleTimeSeconds,
          // Legacy field names for backward compatibility
          mouse_clicks: currentPeriodActivity.mouseClicks,
          mouse_movements: currentPeriodActivity.mouseMovements,
          activity_score: activityScore,
          time_since_last_activity_ms: Date.now() - this.lastActivity,
          time_since_last_activity_seconds: idleTimeSeconds,
          is_monitoring: !!this.idleCheckInterval,
          is_tracking: this.isTracking,
          is_paused: this.isPaused,
          // System info
          lastActivity: new Date(this.lastActivity).toISOString(),
          trackingDuration: this.isTracking ? Date.now() - (this.currentSession?.start_time || Date.now()) : 0
        };
        
        return { success: true, metrics: currentMetrics };
      } catch (error) {
        console.error('❌ Error getting activity metrics:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Register project ID handler
   */
  registerProjectIdHandler() {
    this.ipcMain.handle('set-project-id', async (event, projectId) => {
      console.log('📋 Setting project ID:', projectId);
      this.config.project_id = projectId;
      return { success: true };
    });
  }

  /**
   * Register additional core handlers
   */
  registerAdditionalHandlers() {
    // Placeholder for additional core handlers that might be needed
    // This method can be expanded as more handlers are identified
  }

  /**
   * Initialize the core IPC manager
   */
  async initialize() {
    try {
      this.registerHandlers();
      console.log('🔗 CoreIPCManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ CoreIPCManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the core IPC manager
   */
  async shutdown() {
    try {
      console.log('🔗 CoreIPCManager shutdown complete');
    } catch (error) {
      console.error('❌ CoreIPCManager shutdown failed:', error);
    }
  }
}

module.exports = CoreIPCManager;