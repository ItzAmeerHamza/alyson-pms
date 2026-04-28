/**
 * Enhanced Activity Manager Module
 * Handles all activity detection, recording, and monitoring
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('../core/cleanup-registry');
const { logger } = require('../utils/logger');

class EnhancedActivityManager {
  constructor(config) {
    this.config = config;
    this.isTracking = false;
    this.lastActivity = Date.now();
    this.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
    this.activityStats = null;
    this.periodActivityStats = null;
    this.loggingThrottle = null;
  }

  initialize({ 
    isTracking = false, 
    activityStats = null, 
    periodActivityStats = null,
    loggingThrottle = null,
    betweenScreenshotsActivity = null
  } = {}) {
    this.isTracking = isTracking;
    this.activityStats = activityStats;
    this.periodActivityStats = periodActivityStats;
    this.loggingThrottle = loggingThrottle;
    
    if (betweenScreenshotsActivity) {
      this.betweenScreenshotsActivity = betweenScreenshotsActivity;
    }

    // Initialize global references
    if (!global.displayActivityStats) {
      global.displayActivityStats = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
    }

    logger.info({ category: 'SYSTEM', step: 'ACTIVITY MANAGER INIT' });
  }

  setTrackingState(tracking) {
    this.isTracking = tracking;
  }

  // Enhanced activity tracking with multiple detection methods
  setupEnhancedActivityDetection() {
    logger.debug({ category: 'SYSTEM', step: 'ACTIVITY DETECT SETUP' });
    
    // DISABLED: PowerMonitor artificial activity detection (creates ghost events)
    logger.debug({ category: 'SYSTEM', step: 'ANTI-SPAM', message: 'PowerMonitor artificial generation disabled' });
    
    // DISABLED: System idle monitoring with artificial activity generation
    logger.debug({ category: 'SYSTEM', step: 'ANTI-SPAM', message: 'System idle artificial generation disabled' });
    
    // DISABLED: Mouse position tracking that creates artificial clicks/keys
    logger.debug({ category: 'SYSTEM', step: 'ANTI-SPAM', message: 'Mouse position artificial generation disabled' });
    
    // DISABLED: Backup activity generation (creates artificial minimum activity)
    logger.debug({ category: 'SYSTEM', step: 'ANTI-SPAM', message: 'Backup artificial generation disabled' });
    
    logger.info({ category: 'SYSTEM', step: 'SCREENSHOT MONITOR', message: 'Enhanced monitoring active' });
  }

  recordEnhancedActivity(type, method, details = {}) {
    const now = Date.now();
    
    // CRITICAL FIX: Only record activity when tracking is active
    if (!this.isTracking) {
      return;
    }
    
    // ANTI-SPAM: Filter out artificial activity sources that create ghost events
    const artificialSources = [
      'mouse-position', 'mouse-rapid', 'mouse-typing-pattern', 'mouse-activation',
      'system-active', 'idle-recovery', 'backup-generation',
      'emergency-generation', 'active-user',
      // Fake sources removed from cross-platform-input-detector.js
      'applescript_app_change', 'applescript_app_shortcut', 'powermonitor_basic_activity',
      'windows_fallback_powermonitor', 'windows_fallback_estimated', 
      'windows_fallback_idle_delta', 'windows_fallback_click_detected',
      'windows_fallback_typing_detected', 'windows_fallback_active',
      'windows_fallback_active_click', 'windows_fallback_active_key',
      'linux_xdotool_estimated', 'linux_fallback_estimated', 'linux_fallback_powermonitor',
      // CRITICAL FIX: Move synthetic polling-based sources to blocklist
      // These generate activity from position polling or PowerMonitor events, not real input
      'powermonitor-activity',      // Windows: generates synthetic clicks/keys from any PM event
      'applescript_movement',       // macOS: generates movement from mouse position polling
    ];
    
    if (artificialSources.includes(method)) {
      // THROTTLED LOGGING: Only log blocked artificial activity every 30 seconds to reduce spam
      const throttleKey = `artificial-${method}`;
      if (!global.lastLogTime) global.lastLogTime = {};
      
      if (!global.lastLogTime[throttleKey] || now - global.lastLogTime[throttleKey] > 30000) {
        logger.debug({ category: 'SYSTEM', step: 'ANTI-SPAM', message: `Blocked artificial activity: ${type} from ${method}` });
        global.lastLogTime[throttleKey] = now;
      }
      return;
    }
    
    // WHITELIST: Only allow real input detection sources
    // CRITICAL FIX: Removed synthetic/polling-based sources that generate false activity
    const validRealSources = [
      'input-manager', 'cross-platform-detector', 'real-os-detector',
      // Real input from Python external monitors (actual clicks/keys/moves detected)
      'platform-external_python_macos', 'platform-external_python_windows', 'platform-external_python_linux',
      'native-mouse-event', 'native-key-event',
      // REMOVED: 'powerMonitor', 'mousePosition' - these don't detect real input
      // REMOVED: 'powermonitor-quick', 'powermonitor-keystroke', 'powermonitor-movement', 'powermonitor-mixed'
      // REMOVED: 'powermonitor-activity' - generates synthetic clicks/keys from PowerMonitor events
      // REMOVED: 'applescript_app_change', 'applescript_app_shortcut', 'applescript_movement' - polling-based
      // REMOVED: 'powermonitor_basic_activity' - generates synthetic activity
      'unified-manager', 'platform', 'fallback'
    ];
    
    if (!validRealSources.includes(method)) {
      // THROTTLED LOGGING: Only log rejected sources every 30 seconds to reduce spam
      const throttleKey = `source-${method}`;
      if (!global.lastLogTime) global.lastLogTime = {};
      
      if (!global.lastLogTime[throttleKey] || now - global.lastLogTime[throttleKey] > 30000) {
        logger.debug({ category: 'SYSTEM', step: 'SOURCE-FILTER', message: `Rejected unknown source: ${type} from ${method}` });
        global.lastLogTime[throttleKey] = now;
      }
      return;
    }
    
    // Ensure betweenScreenshotsActivity exists
    if (!this.betweenScreenshotsActivity) {
      this.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: now };
    }
    
    // Ensure global.displayActivityStats exists
    if (!global.displayActivityStats) {
      global.displayActivityStats = { clicks: 0, keys: 0, moves: 0, lastUpdate: now };
    }
    
    // Ensure global.dailyActivity exists and is properly initialized
    const today = new Date().toDateString();
    if (!global.dailyActivity || global.dailyActivity.date !== today) {
      global.dailyActivity = {
        date: today,
        clicks: 0,
        keys: 0,
        moves: 0,
        startTime: Date.now()
      };
      logger.debug({ category: 'SYSTEM', step: 'DAILY-ACTIVITY', message: 'Initialized new day', ctx: { date: today } });
    }
    
    // Update all activity counters
    if (type === 'click') {
      this.betweenScreenshotsActivity.clicks++;
      global.displayActivityStats.clicks++;
      global.dailyActivity.clicks++;
      if (this.activityStats) this.activityStats.mouseClicks++;
      if (this.periodActivityStats) this.periodActivityStats.mouseClicks++;
    } else if (type === 'key') {
      this.betweenScreenshotsActivity.keys++;
      global.displayActivityStats.keys++;
      global.dailyActivity.keys++;
      if (this.activityStats) this.activityStats.keystrokes++;
      if (this.periodActivityStats) this.periodActivityStats.keystrokes++;
    } else if (type === 'move') {
      this.betweenScreenshotsActivity.moves++;
      global.displayActivityStats.moves++;
      global.dailyActivity.moves++;
      if (this.activityStats) this.activityStats.mouseMovements++;
      if (this.periodActivityStats) this.periodActivityStats.mouseMovements++;
    }
    
    // Update timestamps
    this.betweenScreenshotsActivity.lastUpdate = now;
    global.displayActivityStats.lastUpdate = now;
    if (this.periodActivityStats) this.periodActivityStats.lastActivity = now;
    this.lastActivity = now;
    
    // Mirror per-screenshot counters to global so the screenshot timer reads real values
    try {
      if (!global.betweenScreenshotsActivity) {
        global.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: now };
      }
      global.betweenScreenshotsActivity.clicks = this.betweenScreenshotsActivity.clicks;
      global.betweenScreenshotsActivity.keys = this.betweenScreenshotsActivity.keys;
      global.betweenScreenshotsActivity.moves = this.betweenScreenshotsActivity.moves;
      global.betweenScreenshotsActivity.lastUpdate = now;
      
      // MEMORY FIX: Removed per-event mirror log — was firing on every click/key
      // Activity data is still mirrored; only the verbose log is removed
    } catch {}

    // Structured, low-noise summary (throttled)
    this.__lastSummaryAt = this.__lastSummaryAt || 0;
    const since = now - this.__lastSummaryAt;
    const total = this.betweenScreenshotsActivity.clicks + this.betweenScreenshotsActivity.keys + this.betweenScreenshotsActivity.moves;
    if (since >= 60000) {
      logger.info({ category: 'SYSTEM', step: 'ACTIVITY SUMMARY', ctx: {
        clicks: this.betweenScreenshotsActivity.clicks,
        keys: this.betweenScreenshotsActivity.keys,
        moves: this.betweenScreenshotsActivity.moves,
        total,
        last_update_iso: new Date(this.betweenScreenshotsActivity.lastUpdate).toISOString(),
      }});
      this.__lastSummaryAt = now;
    }
  }

  // Initialize enhanced activity detection when tracking starts
  initializeEnhancedActivityDetection() {
    logger.info({ category: 'SYSTEM', step: 'ACTIVITY DETECT INIT' });
    
    // Initialize activity objects if they don't exist
    if (!this.betweenScreenshotsActivity) {
      this.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
    }
    
    if (!global.displayActivityStats) {
      global.displayActivityStats = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
    }
    
    // Setup all detection methods
    this.setupEnhancedActivityDetection();
    
    logger.info({ category: 'SYSTEM', step: 'ACTIVITY DETECT READY' });
  }

  // Optimized activity display function
  sendActivityToRendererOptimized() {
    if (!global.mainWindow || global.mainWindow.isDestroyed()) return;
    
    // CRITICAL FIX: Check idle state FIRST before reading activity
    let isIdle = false;
    let idleSeconds = 0;
    try {
      const getIdleTime = global.unifiedInputManager?.getIdleTime?.bind(global.unifiedInputManager);
      idleSeconds = typeof getIdleTime === 'function' ? (getIdleTime() || 0) : 0;
      const idleStatus = global.enhancedIdleMonitor?.getIdleStatus?.();
      const idleThreshold = (global.enhancedIdleMonitor && global.enhancedIdleMonitor.IDLE_THRESHOLD) || 60;
      isIdle = (idleStatus ? !!idleStatus.isIdle : false) || (idleSeconds > idleThreshold);
    } catch (_) {}
    
    // CRITICAL FIX: Use betweenScreenshotsActivity as primary source (where real-time activity is stored)
    // displayActivityStats is a fallback
    let clicks = global.betweenScreenshotsActivity?.clicks || global.displayActivityStats?.clicks || this.betweenScreenshotsActivity?.clicks || 0;
    let keys = global.betweenScreenshotsActivity?.keys || global.displayActivityStats?.keys || this.betweenScreenshotsActivity?.keys || 0;
    let moves = global.betweenScreenshotsActivity?.moves || global.displayActivityStats?.moves || this.betweenScreenshotsActivity?.moves || 0;
    
    // CRITICAL FIX: When idle, send zeros to UI so Activity Monitor shows zeros
    // This makes it clear to the user that no activity is being tracked during idle
    if (isIdle) {
      clicks = 0;
      keys = 0;
      moves = 0;
    }
    
    const activityData = {
      // Primary names (preferred)
      mouseClicks: clicks,
      keystrokes: keys,
      mouseMovements: moves,
      // Aliases for backward compatibility
      clicks: clicks,
      keys: keys,
      moves: moves,
      // Legacy names used by some modules
      keyPresses: keys,
      // Metadata
      totalActivity: clicks + keys + moves,
      activityPercent: isIdle ? 0 : 100,
      focusPercent: isIdle ? 0 : 100,
      lastUpdate: Date.now(),
      timestamp: Date.now(),
      source: 'enhanced-activity-manager',
      // CRITICAL FIX: Include idle state so renderer can display appropriately
      isIdle: isIdle,
      idleSeconds: idleSeconds
    };
    
    // Only log occasionally to reduce spam
    if (this.loggingThrottle && this.loggingThrottle.shouldLog('activity-display', 15000, 1)) {
      logger.debug({ category: 'SYSTEM', step: 'ACTIVITY UPDATE', ctx: activityData });
    }
    
    try {
      global.mainWindow.webContents.send('activity-update', activityData);
    } catch (error) {
      if (this.loggingThrottle && this.loggingThrottle.shouldLog('activity-send-error', 10000, 1)) {
        logger.warn({ category: 'SYSTEM', step: 'ACTIVITY UPDATE ERROR', message: error.message.split('\n')[0] });
      }
    }
  }

  // Optimized activity recording with reduced logging
  recordActivityOptimized(type, method, details = {}) {
    const now = Date.now();
    
    // Update counters - CRITICAL FIX: Update BOTH simple fields (clicks) AND total fields (totalClicks)
    if (type === 'click') {
      if (this.betweenScreenshotsActivity) this.betweenScreenshotsActivity.clicks++;
      if (global.displayActivityStats) {
        global.displayActivityStats.clicks++;
        global.displayActivityStats.totalClicks++; // CRITICAL FIX: Keep totalClicks in sync
        global.displayActivityStats.sessionClicks++; // CRITICAL FIX: Keep sessionClicks in sync
      }
      if (this.activityStats) this.activityStats.mouseClicks++;
      if (this.periodActivityStats) this.periodActivityStats.mouseClicks++;
    } else if (type === 'key') {
      if (this.betweenScreenshotsActivity) this.betweenScreenshotsActivity.keys++;
      if (global.displayActivityStats) {
        global.displayActivityStats.keys++;
        global.displayActivityStats.totalKeys++; // CRITICAL FIX: Keep totalKeys in sync
        global.displayActivityStats.sessionKeys++; // CRITICAL FIX: Keep sessionKeys in sync
      }
      if (this.activityStats) this.activityStats.keystrokes++;
      if (this.periodActivityStats) this.periodActivityStats.keystrokes++;
    } else if (type === 'move') {
      if (this.betweenScreenshotsActivity) this.betweenScreenshotsActivity.moves++;
      if (global.displayActivityStats) {
        global.displayActivityStats.moves++;
        global.displayActivityStats.totalMoves++; // CRITICAL FIX: Keep totalMoves in sync
        global.displayActivityStats.sessionMoves++; // CRITICAL FIX: Keep sessionMoves in sync
      }
      if (this.activityStats) this.activityStats.mouseMovements++;
      if (this.periodActivityStats) this.periodActivityStats.mouseMovements++;
    }
    
    // Update timestamps
    if (this.betweenScreenshotsActivity) this.betweenScreenshotsActivity.lastUpdate = now;
    if (global.displayActivityStats) global.displayActivityStats.lastUpdate = now;
    if (this.periodActivityStats) this.periodActivityStats.lastActivity = now;
    this.lastActivity = now;
    
    // Smart logging - only log significant events or summaries
    const total = (this.betweenScreenshotsActivity?.clicks || 0) + (this.betweenScreenshotsActivity?.keys || 0) + (this.betweenScreenshotsActivity?.moves || 0);
    
    if (type === 'click' || (type === 'key' && details.significant) || total % 200 === 0) {
      if (this.loggingThrottle && this.loggingThrottle.shouldLog(`activity-${type}`, 10000, 1)) {
        logger.debug({ category: 'SYSTEM', step: 'ACTIVITY EVENT', ctx: {
          type,
          method,
          clicks: this.betweenScreenshotsActivity?.clicks || 0,
          keys: this.betweenScreenshotsActivity?.keys || 0,
          moves: this.betweenScreenshotsActivity?.moves || 0,
          total,
        }});
      }
    }
  }

  // Activity counter reset functions
  resetActivityForScreenshot() {
    if (this.betweenScreenshotsActivity) {
    logger.debug({ category: 'SYSTEM', step: 'SCREENSHOT RESET', ctx: { clicks: this.betweenScreenshotsActivity.clicks, keys: this.betweenScreenshotsActivity.keys, moves: this.betweenScreenshotsActivity.moves } });
      this.betweenScreenshotsActivity.clicks = 0;
      this.betweenScreenshotsActivity.keys = 0;
      this.betweenScreenshotsActivity.moves = 0;
      this.betweenScreenshotsActivity.lastUpdate = Date.now();
    }
    // Keep global in sync so the screenshot timer immediately reflects reset
    try {
      if (global.betweenScreenshotsActivity) {
        global.betweenScreenshotsActivity.clicks = 0;
        global.betweenScreenshotsActivity.keys = 0;
        global.betweenScreenshotsActivity.moves = 0;
        global.betweenScreenshotsActivity.lastUpdate = Date.now();
      }
    } catch {}
  }

  resetAllActivityCounters() {
    logger.info({ category: 'SYSTEM', step: 'ACTIVITY RESET' });
    
    // Reset screenshot activity
    this.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
    
    // Reset display stats - CRITICAL FIX: Reset ALL field patterns to keep them in sync
    if (global.displayActivityStats) {
      global.displayActivityStats.clicks = 0;
      global.displayActivityStats.keys = 0;
      global.displayActivityStats.moves = 0;
      global.displayActivityStats.totalClicks = 0; // CRITICAL FIX: Also reset total fields
      global.displayActivityStats.totalKeys = 0;
      global.displayActivityStats.totalMoves = 0;
      global.displayActivityStats.sessionClicks = 0; // CRITICAL FIX: Also reset session fields
      global.displayActivityStats.sessionKeys = 0;
      global.displayActivityStats.sessionMoves = 0;
      global.displayActivityStats.lastUpdate = Date.now();
    }
    
    // Reset daily activity
    const today = new Date().toDateString();
    global.dailyActivity = {
      date: today,
      clicks: 0,
      keys: 0,
      moves: 0,
      startTime: Date.now()
    };
    
    logger.info({ category: 'SYSTEM', step: 'ACTIVITY RESET DONE' });
  }

  // Simulation functions for testing
  simulateKeyboardActivity() {
    this.recordEnhancedActivity('key', 'input-manager', { simulated: true });
  }

  simulateMouseClick() {
    this.recordEnhancedActivity('click', 'input-manager', { simulated: true });
  }

  getCurrentMousePosition() {
    // Return cached mouse position
    return { x: 0, y: 0 };
  }

  /**
   * Update idle status from EnhancedIdleMonitor
   * This method is called periodically to sync idle state
   */
  updateIdleStatus(isIdle, idleSeconds) {
    // Store idle state for use in activity processing
    this.isIdle = isIdle;
    this.lastIdleSeconds = idleSeconds;
    
    // When user goes idle, we don't need to do anything special here
    // The activity counters are already reset by EnhancedIdleMonitor
    // when user transitions to idle
  }

  shutdown() {
    logger.info({ category: 'SYSTEM', step: 'ACTIVITY MANAGER SHUTDOWN' });
  }
}

module.exports = EnhancedActivityManager;