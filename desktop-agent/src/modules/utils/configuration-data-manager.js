/**
 * CONFIGURATION DATA MANAGER MODULE
 * 
 * Manages configuration data structures and state variables for the TimeFlow desktop agent.
 * This includes app settings, activity statistics, and tracking state.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class ConfigurationDataManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.Date = dependencies.Date || Date;
    
    // Initialize data structures
    this.initializeDataStructures();
    
    console.log('✅ ConfigurationDataManager initialized');
  }

  /**
   * Initialize all data structures
   */
  initializeDataStructures() {
    // App Settings
    this.appSettings = {
      screenshot_interval_seconds: 30, // 30 seconds for better monitoring
      idle_threshold_seconds: 60, // legacy alias; prefer idle_detection_threshold_seconds
      idle_detection_threshold_seconds: 60, // start counting idle after 1 minute
      idle_checkpoint_interval_seconds: 30, // persist idle while still idle every 30 seconds
      idle_low_activity_percent: 30,
      blur_screenshots: false,
      track_urls: true,
      track_applications: true,
      auto_start_tracking: false,
      max_idle_time_seconds: 2400, // 40 minutes
      screenshot_quality: 80,
      notification_frequency_seconds: 120, // 2 minutes
      enable_anti_cheat: true,
      suspicious_activity_threshold: 10,
      pattern_detection_window_minutes: 15,
      minimum_mouse_distance: 50,
      keyboard_diversity_threshold: 5,
      max_laptop_closed_hours: 1
    };

    // Activity Statistics
    this.activityStats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      idleSeconds: 0,
      activeSeconds: 0,
      lastReset: this.Date.now(),
      suspiciousEvents: 0,
      riskScore: 0,
      screenshotsCaptured: 0,
      lastScreenshotTime: null,
      // Enhanced fields for reports
      keyPresses: 0,  // Alias for keystrokes for UI compatibility
      activeTime: 0,  // Active time in seconds
      appsCount: 0,   // Number of apps used
      appsUsed: new Set(), // Track unique apps
      sessionDuration: 0,  // Total session duration
      isActive: false,     // Current activity state
      lastActivity: this.Date.now(),
      productivity: 0,     // Productivity score
      screenshotCount: 0   // Alias for screenshotsCaptured
    };

    // Period-based Activity Tracking
    this.periodActivityStats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      periodStart: this.Date.now(),
      lastActivity: this.Date.now()
    };

    // Between Screenshots Activity
    this.betweenScreenshotsActivity = {
      clicks: 0,
      keys: 0,
      moves: 0
    };

    // Mouse tracking data
    this.mouseTracker = {
      x: 0,
      y: 0,
      timestamp: this.Date.now()
    };

    // Offline queue structure
    this.offlineQueue = {
      screenshots: [],
      appLogs: [],
      urlLogs: [],
      idleLogs: [],
      timeLogs: [],
      fraudAlerts: []
    };

    // Make data globally accessible
    this.exposeGlobalReferences();
  }

  /**
   * Expose global references for backward compatibility
   */
  exposeGlobalReferences() {
    this.global.appSettings = this.appSettings;
    this.global.activityStats = this.activityStats;
    this.global.periodActivityStats = this.periodActivityStats;
    this.global.betweenScreenshotsActivity = this.betweenScreenshotsActivity;
    this.global.mouseTracker = this.mouseTracker;
    this.global.offlineQueue = this.offlineQueue;
  }

  /**
   * Get app settings
   */
  getAppSettings() {
    return { ...this.appSettings };
  }

  /**
   * Update app settings
   */
  updateAppSettings(newSettings) {
    Object.assign(this.appSettings, newSettings);
    this.global.appSettings = this.appSettings;
    this.console.log('⚙️ App settings updated:', Object.keys(newSettings));
  }

  /**
   * Reset app settings to defaults
   */
  resetAppSettings() {
    this.initializeDataStructures();
    this.console.log('🔄 App settings reset to defaults');
  }

  /**
   * Get activity statistics
   */
  getActivityStats() {
    return { ...this.activityStats };
  }

  /**
   * Update activity statistics
   */
  updateActivityStats(updates) {
    Object.assign(this.activityStats, updates);
    this.global.activityStats = this.activityStats;
  }

  /**
   * Reset activity statistics
   */
  resetActivityStats() {
    const now = this.Date.now();
    this.activityStats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      idleSeconds: 0,
      activeSeconds: 0,
      lastReset: now,
      suspiciousEvents: 0,
      riskScore: 0,
      screenshotsCaptured: 0,
      lastScreenshotTime: null,
      keyPresses: 0,
      activeTime: 0,
      appsCount: 0,
      appsUsed: new Set(),
      sessionDuration: 0,
      isActive: false,
      lastActivity: now,
      productivity: 0,
      screenshotCount: 0
    };
    this.global.activityStats = this.activityStats;
    this.console.log('📊 Activity statistics reset');
  }

  /**
   * Get period activity statistics
   */
  getPeriodActivityStats() {
    return { ...this.periodActivityStats };
  }

  /**
   * Reset period activity statistics
   */
  resetPeriodActivityStats() {
    const now = this.Date.now();
    this.periodActivityStats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      periodStart: now,
      lastActivity: now
    };
    this.global.periodActivityStats = this.periodActivityStats;
    this.console.log('🔄 Period activity statistics reset');
  }

  /**
   * Get between screenshots activity
   */
  getBetweenScreenshotsActivity() {
    return { ...this.betweenScreenshotsActivity };
  }

  /**
   * Reset between screenshots activity
   */
  resetBetweenScreenshotsActivity() {
    this.betweenScreenshotsActivity = {
      clicks: 0,
      keys: 0,
      moves: 0
    };
    this.global.betweenScreenshotsActivity = this.betweenScreenshotsActivity;
  }

  /**
   * Get mouse tracker data
   */
  getMouseTracker() {
    return { ...this.mouseTracker };
  }

  /**
   * Update mouse tracker
   */
  updateMouseTracker(x, y) {
    this.mouseTracker.x = x;
    this.mouseTracker.y = y;
    this.mouseTracker.timestamp = this.Date.now();
    this.global.mouseTracker = this.mouseTracker;
  }

  /**
   * Get offline queue
   */
  getOfflineQueue() {
    return { ...this.offlineQueue };
  }

  /**
   * Add item to offline queue
   */
  addToOfflineQueue(type, item) {
    if (this.offlineQueue[type]) {
      this.offlineQueue[type].push(item);
      this.global.offlineQueue = this.offlineQueue;
    }
  }

  /**
   * Clear offline queue
   */
  clearOfflineQueue(type = null) {
    if (type && this.offlineQueue[type]) {
      this.offlineQueue[type] = [];
    } else {
      // Clear all queues
      Object.keys(this.offlineQueue).forEach(key => {
        this.offlineQueue[key] = [];
      });
    }
    this.global.offlineQueue = this.offlineQueue;
    this.console.log(`🧹 Offline queue cleared: ${type || 'all'}`);
  }

  /**
   * Get all configuration data
   */
  getAllConfigurationData() {
    return {
      appSettings: this.getAppSettings(),
      activityStats: this.getActivityStats(),
      periodActivityStats: this.getPeriodActivityStats(),
      betweenScreenshotsActivity: this.getBetweenScreenshotsActivity(),
      mouseTracker: this.getMouseTracker(),
      offlineQueue: this.getOfflineQueue()
    };
  }

  /**
   * Initialize the configuration data manager
   */
  async initialize() {
    try {
      this.initializeDataStructures();
      console.log('⚙️ ConfigurationDataManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ ConfigurationDataManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the configuration data manager
   */
  async shutdown() {
    try {
      console.log('⚙️ ConfigurationDataManager shutdown complete');
    } catch (error) {
      console.error('❌ ConfigurationDataManager shutdown failed:', error);
    }
  }
}

module.exports = ConfigurationDataManager;