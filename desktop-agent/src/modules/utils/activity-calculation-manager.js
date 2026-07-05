/**
 * ACTIVITY CALCULATION MANAGER MODULE
 * 
 * Manages activity calculation utilities and helpers for the TimeFlow desktop agent.
 * This includes activity percentage calculations, idle time detection, and daily activity tracking.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class ActivityCalculationManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.Date = dependencies.Date || Date;
    this.Math = dependencies.Math || Math;
    this.getSystemIdleTime = dependencies.getSystemIdleTime;
    this.appSettings = dependencies.appSettings;
    this.activityStats = dependencies.activityStats;
    this.lastActivity = dependencies.lastActivity;
    this.betweenScreenshotsActivity = dependencies.betweenScreenshotsActivity;
    
    console.log('✅ ActivityCalculationManager initialized');
  }

  /**
   * Calculate activity percentage based on idle time and recent activity
   */
  calculateActivityPercent() {
    const now = this.Date.now();
    const timeSinceLastActivity = now - (this.lastActivity || now);
    const currentIdleTime = this.calculateIdleTimeSeconds();
    const idleThreshold =
      (this.appSettings && this.appSettings.idle_detection_threshold_seconds) ||
      (this.appSettings && this.appSettings.idle_threshold_seconds) ||
      60;
    
    // ✅ IMMEDIATE 100% ON ACTIVITY - User requested this behavior
    // If user has been active within the last 10 seconds, immediately show 100%
    if (timeSinceLastActivity < 10000) { // Last 10 seconds
      return 100;
    }
    
    // ✅ GRADUAL DECREASE ON IDLE - User requested this behavior
    // Apply gradual decay during idle periods  
    if (currentIdleTime > idleThreshold) {
      const idleMinutes = currentIdleTime / 60;
      let activityPercent = 100; // Start from 100%
      
      // LESS AGGRESSIVE DECAY - Allow for normal breaks without going idle too fast
      if (idleMinutes > 3) activityPercent = 90;   // 90% after 3 minutes idle
      if (idleMinutes > 5) activityPercent = 80;   // 80% after 5 minutes idle  
      if (idleMinutes > 8) activityPercent = 70;   // 70% after 8 minutes idle
      if (idleMinutes > 10) activityPercent = 60;  // 60% after 10 minutes idle
      if (idleMinutes > 15) activityPercent = 50;  // 50% after 15 minutes idle
      if (idleMinutes > 20) activityPercent = 40;  // 40% after 20 minutes idle
      if (idleMinutes > 25) activityPercent = 30;  // 30% after 25 minutes idle
      if (idleMinutes > 30) activityPercent = 20;  // 20% after 30 minutes idle
      if (idleMinutes > 45) activityPercent = 10;  // 10% after 45 minutes idle
      if (idleMinutes > 60) activityPercent = 0;   // 0% after 60 minutes idle
      
      // Only log occasionally to avoid spam
      if (this.Date.now() - ((this.activityStats && this.activityStats.lastIdleLog) || 0) > 30000) { // Every 30 seconds
        this.console.log(`💤 ACTIVITY DECAY: ${this.Math.round(idleMinutes * 10) / 10}min idle → ${activityPercent}%`);
        if (this.activityStats) {
          this.activityStats.lastIdleLog = this.Date.now();
        }
      }
      
      return activityPercent;
    }
    
    // Default to 100% for any recent activity (within idle threshold)
    return 100;
  }

  /**
   * Get cumulative daily activity instead of period-based activity
   */
  getCumulativeDailyActivity() {
    const today = new this.Date().toDateString();
    
    // Initialize daily activity if new day
    if (!this.global.dailyActivity || this.global.dailyActivity.date !== today) {
      this.global.dailyActivity = {
        date: today,
        clicks: 0,
        keys: 0,
        moves: 0,
        startTime: this.Date.now()
      };
    }
    
    // Add current period activity to daily totals (without resetting period)
    const periodActivity = this.betweenScreenshotsActivity || { clicks: 0, keys: 0, moves: 0 };
    
    return {
      clicks: this.global.dailyActivity.clicks + (periodActivity.clicks || 0),
      keys: this.global.dailyActivity.keys + (periodActivity.keys || 0),
      moves: this.global.dailyActivity.moves + (periodActivity.moves || 0)
    };
  }

  /**
   * Calculate idle time in seconds using system and manual tracking
   */
  calculateIdleTimeSeconds() {
    // Use system idle time instead of our activity tracking to avoid fake input interference
    const systemIdleMs = this.getSystemIdleTime ? this.getSystemIdleTime() : 0;
    const systemIdleSeconds = this.Math.floor(systemIdleMs / 1000);
    
    // Also calculate our manual tracking for comparison
    const now = this.Date.now();
    const manualIdleSeconds = this.Math.floor((now - (this.lastActivity || now)) / 1000);
    
    // Use the larger of the two values (system idle is more reliable)
    const finalIdleSeconds = this.Math.max(systemIdleSeconds, manualIdleSeconds);
    
    // Logging disabled for performance - was causing slowdowns
    // Only log on significant changes (idle state transitions)
    // if (Date.now() - lastIdleLogTime > 300000) { // 5 minutes
    //   console.log('🕐 IDLE CALCULATION (5min update):', {
    //     final_idle_seconds: finalIdleSeconds,
    //     using_system_idle: systemIdleSeconds >= manualIdleSeconds
    //   });
    //   lastIdleLogTime = Date.now();
    // }
    
    return finalIdleSeconds;
  }

  /**
   * Calculate focus percentage based on active time vs total time
   */
  calculateFocusPercent() {
    if (!this.activityStats) return 100;
    
    const timeSinceReset = this.Date.now() - (this.activityStats.lastReset || this.Date.now());
    const activeTime = timeSinceReset - ((this.activityStats.idleSeconds || 0) * 1000);
    return this.Math.max(0, this.Math.min(100, (activeTime / timeSinceReset) * 100));
  }

  /**
   * Reset activity statistics
   */
  resetActivityStats() {
    if (!this.activityStats) return;
    
    const resetStats = {
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

    // Merge with existing stats to preserve any additional properties
    Object.assign(this.activityStats, resetStats);
    
    this.console.log('📊 Activity statistics reset');
  }

  /**
   * Get current activity summary
   */
  getActivitySummary() {
    return {
      activityPercent: this.calculateActivityPercent(),
      idleTimeSeconds: this.calculateIdleTimeSeconds(),
      focusPercent: this.calculateFocusPercent(),
      dailyActivity: this.getCumulativeDailyActivity(),
      stats: this.activityStats || {},
      lastActivity: this.lastActivity || 0
    };
  }

  /**
   * Update activity counters
   */
  updateActivityCounters(type, amount = 1) {
    if (!this.activityStats) return;

    switch (type) {
      case 'mouseClick':
      case 'mouse_click':
        this.activityStats.mouseClicks = (this.activityStats.mouseClicks || 0) + amount;
        break;
      case 'keystroke':
      case 'keypress':
        this.activityStats.keystrokes = (this.activityStats.keystrokes || 0) + amount;
        this.activityStats.keyPresses = this.activityStats.keystrokes; // Alias
        break;
      case 'mouseMovement':
      case 'mouse_movement':
        this.activityStats.mouseMovements = (this.activityStats.mouseMovements || 0) + amount;
        break;
      case 'screenshot':
        this.activityStats.screenshotsCaptured = (this.activityStats.screenshotsCaptured || 0) + amount;
        this.activityStats.screenshotCount = this.activityStats.screenshotsCaptured; // Alias
        this.activityStats.lastScreenshotTime = this.Date.now();
        break;
    }

    // Update last activity time
    this.lastActivity = this.Date.now();
    if (this.activityStats) {
      this.activityStats.lastActivity = this.lastActivity;
      this.activityStats.isActive = true;
    }
  }

  /**
   * Initialize the activity calculation manager
   */
  async initialize() {
    try {
      // Initialize daily activity if not exists
      if (!this.global.dailyActivity) {
        const today = new this.Date().toDateString();
        this.global.dailyActivity = {
          date: today,
          clicks: 0,
          keys: 0,
          moves: 0,
          startTime: this.Date.now()
        };
      }
      
      console.log('🧮 ActivityCalculationManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ ActivityCalculationManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the activity calculation manager
   */
  async shutdown() {
    try {
      console.log('🧮 ActivityCalculationManager shutdown complete');
    } catch (error) {
      console.error('❌ ActivityCalculationManager shutdown failed:', error);
    }
  }
}

module.exports = ActivityCalculationManager;