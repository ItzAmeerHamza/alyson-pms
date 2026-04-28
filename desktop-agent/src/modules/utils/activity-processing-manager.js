/**
 * ACTIVITY PROCESSING MANAGER MODULE
 * 
 * Manages activity processing and reset functions for the TimeFlow desktop agent.
 * This includes activity recording, resetting, and counter management.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class ActivityProcessingManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.Date = dependencies.Date || Date;
    this.activityStats = dependencies.activityStats;
    this.periodActivityStats = dependencies.periodActivityStats;
    this.betweenScreenshotsActivity = dependencies.betweenScreenshotsActivity;
    this.lastActivity = dependencies.lastActivity;
    this.sendActivityToRenderer = dependencies.sendActivityToRenderer;
    this.antiCheatDetector = dependencies.antiCheatDetector;
    
    console.log('✅ ActivityProcessingManager initialized');
  }

  /**
   * Record activity for display purposes
   */
  recordActivityForDisplay(type, source = 'unknown') {
    const now = this.Date.now();
    
    // Initialize displayActivityStats if not exists
    if (!this.global.displayActivityStats) {
      this.global.displayActivityStats = {
        clicks: 0,
        keys: 0,
        moves: 0,
        lastUpdate: now,
        dailyClicks: 0,
        dailyKeys: 0,
        dailyMoves: 0,
        sessionClicks: 0,
        sessionKeys: 0,
        sessionMoves: 0,
        sessionStart: now,
        lastResetDay: null
      };
    }
    
    // 🔧 IMPROVED: Only reset on actual new day, not every 24 hours
    const currentDay = new this.Date(now).toDateString();
    const lastResetDay = this.global.displayActivityStats.lastResetDay;
    
    if (!lastResetDay || lastResetDay !== currentDay) {
      this.console.log('🔄 [ACTIVITY-RESET] New day reset triggered:', currentDay);
      // Only reset daily totals, not real-time counters
      this.global.displayActivityStats.dailyClicks = 0;
      this.global.displayActivityStats.dailyKeys = 0;
      this.global.displayActivityStats.dailyMoves = 0;
      this.global.displayActivityStats.lastResetDay = currentDay;
      // DON'T reset current activity counters that show real-time data
    }
    
    // Update display stats
    if (type === 'click') {
      this.global.displayActivityStats.clicks++;
      // Handled by global.recordActivityForDisplay
    } else if (type === 'key') {
      this.global.displayActivityStats.keys++;
      // Handled by global.recordActivityForDisplay
    } else if (type === 'move') {
      this.global.displayActivityStats.moves++;
      // Handled by global.recordActivityForDisplay
    }
    
    this.global.displayActivityStats.lastUpdate = now;
    
    // Update all activity tracking systems if they exist
    if (this.activityStats) {
      this.activityStats.mouseClicks = this.global.displayActivityStats.clicks;
      this.activityStats.keystrokes = this.global.displayActivityStats.keys;
      this.activityStats.mouseMovements = this.global.displayActivityStats.moves;
    }
    
    if (this.periodActivityStats) {
      this.periodActivityStats.mouseClicks = this.global.displayActivityStats.clicks;
      this.periodActivityStats.keystrokes = this.global.displayActivityStats.keys;
      this.periodActivityStats.mouseMovements = this.global.displayActivityStats.moves;
      this.periodActivityStats.lastActivity = now;
    }
    
    // Update lastActivity
    if (this.lastActivity !== undefined) {
      this.lastActivity = now;
    }
    
    // Send immediately to renderer if function exists
    if (this.sendActivityToRenderer) {
      this.sendActivityToRenderer();
    }
    
    // Note: Anti-cheat forwarding handled by main.js:recordEnhancedActivity (has actual position data)
    
    const totalActivity = (this.global.displayActivityStats.clicks || 0) + 
                         (this.global.displayActivityStats.keys || 0) + 
                         (this.global.displayActivityStats.moves || 0);
    this.console.log(`🎯 [${source.toUpperCase()}] ${type} recorded - Display total: ${totalActivity} | clicks: ${this.global.displayActivityStats.clicks} | keys: ${this.global.displayActivityStats.keys} | moves: ${this.global.displayActivityStats.moves}`);
  }

  /**
   * Reset activity for screenshot capture - only reset period counters, preserve daily cumulative
   */
  resetActivityForScreenshot() {
    // Initialize betweenScreenshotsActivity if not exists
    if (!this.betweenScreenshotsActivity) {
      this.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0 };
      this.global.betweenScreenshotsActivity = this.betweenScreenshotsActivity;
    }

    this.console.log('📸 [SCREENSHOT-RESET] Current betweenScreenshots activity before reset:', {
      clicks: this.betweenScreenshotsActivity.clicks,
      keys: this.betweenScreenshotsActivity.keys,
      moves: this.betweenScreenshotsActivity.moves
    });
    
    if (this.global.displayActivityStats) {
      this.console.log('📸 [SCREENSHOT-RESET] Daily cumulative activity (preserved):', {
        clicks: this.global.displayActivityStats.clicks,
        keys: this.global.displayActivityStats.keys,
        moves: this.global.displayActivityStats.moves
      });
    }
    
    // CRITICAL FIX: Add current period activity to daily cumulative totals BEFORE resetting
    if (this.global.dailyActivity && this.betweenScreenshotsActivity) {
      this.global.dailyActivity.clicks += this.betweenScreenshotsActivity.clicks;
      this.global.dailyActivity.keys += this.betweenScreenshotsActivity.keys;
      this.global.dailyActivity.moves += this.betweenScreenshotsActivity.moves;
      
      this.console.log('📊 [SCREENSHOT-RESET] Added to daily totals:', {
        periodClicks: this.betweenScreenshotsActivity.clicks,
        periodKeys: this.betweenScreenshotsActivity.keys,
        periodMoves: this.betweenScreenshotsActivity.moves,
        newDailyTotal: `C:${this.global.dailyActivity.clicks} K:${this.global.dailyActivity.keys} M:${this.global.dailyActivity.moves}`
      });
    }
    
    // CRITICAL FIX: ONLY reset betweenScreenshotsActivity, NOT global.displayActivityStats
    const beforeReset = { ...this.betweenScreenshotsActivity };
    this.betweenScreenshotsActivity = {
      clicks: 0,
      keys: 0,
      moves: 0,
      lastUpdate: this.Date.now()
    };
    
    // CRITICAL FIX: Update global reference after reset
    this.global.betweenScreenshotsActivity = this.betweenScreenshotsActivity;
    this.console.log(`🔄 [ACTIVITY-RESET] Period reset | Before: C:${beforeReset.clicks} K:${beforeReset.keys} M:${beforeReset.moves} | After: C:0 K:0 M:0`);
    
    // DO NOT reset global.displayActivityStats - it should be cumulative!
    // global.displayActivityStats should continue accumulating throughout the day
    
    this.console.log('✅ [SCREENSHOT-RESET] Period activity reset complete - daily cumulative preserved');
  }

  /**
   * Reset all activity counters for new tracking session
   */
  resetAllActivityCounters() {
    this.console.log('🔄 [ACTIVITY-RESET] Resetting session counters for new tracking session');
    
    const now = this.Date.now();
    
    // Initialize with proper structure for real-time tracking
    if (!this.global.displayActivityStats) {
      this.global.displayActivityStats = {
        clicks: 0,
        keys: 0,
        moves: 0,
        lastUpdate: now,
        dailyClicks: 0,
        dailyKeys: 0,
        dailyMoves: 0,
        sessionClicks: 0,
        sessionKeys: 0,
        sessionMoves: 0,
        sessionStart: now,
        lastResetDay: null
      };
    }
    
    // Ensure real-time counters exist (don't reset them)
    if (this.global.displayActivityStats.clicks === undefined) this.global.displayActivityStats.clicks = 0;
    if (this.global.displayActivityStats.keys === undefined) this.global.displayActivityStats.keys = 0;
    if (this.global.displayActivityStats.moves === undefined) this.global.displayActivityStats.moves = 0;
    
    // Reset only session totals, not real-time counters
    this.global.displayActivityStats.sessionClicks = 0;
    this.global.displayActivityStats.sessionKeys = 0;
    this.global.displayActivityStats.sessionMoves = 0;
    this.global.displayActivityStats.sessionStart = now;
    
    // Keep current activity counters for real-time display
    // DON'T reset: clicks, keys, moves (these show real-time activity)
    
    // Reset between screenshots tracking
    this.betweenScreenshotsActivity = {
      clicks: 0,
      keys: 0,
      moves: 0
    };
    
    // CRITICAL FIX: Update global reference after reset
    this.global.betweenScreenshotsActivity = this.betweenScreenshotsActivity;
    
    // Update anti-cheat detector if available
    if (this.antiCheatDetector) {
      this.antiCheatDetector.resetActivityCounters();
    }
    
    this.console.log('✅ [ACTIVITY-RESET] Session reset complete - real-time tracking preserved');
    this.console.log('✅ [ACTIVITY-RESET] All counters reset successfully');
  }

  /**
   * Get current activity display stats
   */
  getDisplayActivityStats() {
    return this.global.displayActivityStats || {
      clicks: 0,
      keys: 0,
      moves: 0,
      lastUpdate: this.Date.now(),
      dailyClicks: 0,
      dailyKeys: 0,
      dailyMoves: 0,
      sessionClicks: 0,
      sessionKeys: 0,
      sessionMoves: 0,
      sessionStart: this.Date.now(),
      lastResetDay: null
    };
  }

  /**
   * Update activity counters with specific amounts
   */
  updateActivityCounters(type, amount = 1) {
    if (!this.global.displayActivityStats) {
      this.resetAllActivityCounters();
    }

    switch (type) {
      case 'click':
      case 'mouseClick':
        this.global.displayActivityStats.clicks += amount;
        break;
      case 'key':
      case 'keystroke':
        this.global.displayActivityStats.keys += amount;
        break;
      case 'move':
      case 'mouseMovement':
        this.global.displayActivityStats.moves += amount;
        break;
    }

    this.global.displayActivityStats.lastUpdate = this.Date.now();
    
    // Also update between screenshots activity
    if (this.betweenScreenshotsActivity) {
      switch (type) {
        case 'click':
        case 'mouseClick':
          this.betweenScreenshotsActivity.clicks += amount;
          break;
        case 'key':
        case 'keystroke':
          this.betweenScreenshotsActivity.keys += amount;
          break;
        case 'move':
        case 'mouseMovement':
          this.betweenScreenshotsActivity.moves += amount;
          break;
      }
    }
  }

  /**
   * Initialize the activity processing manager
   */
  async initialize() {
    try {
      // Initialize display activity stats if not exists
      if (!this.global.displayActivityStats) {
        this.resetAllActivityCounters();
      }
      
      // Set up global recordActivityForDisplay function
      this.global.recordActivityForDisplay = this.recordActivityForDisplay.bind(this);
      
      console.log('🎯 ActivityProcessingManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ ActivityProcessingManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the activity processing manager
   */
  async shutdown() {
    try {
      console.log('🎯 ActivityProcessingManager shutdown complete');
    } catch (error) {
      console.error('❌ ActivityProcessingManager shutdown failed:', error);
    }
  }
}

module.exports = ActivityProcessingManager;