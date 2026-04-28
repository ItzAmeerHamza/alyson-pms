/**
 * SCREENSHOT UTILITIES MANAGER MODULE
 * 
 * Manages screenshot-related utility functions and helpers for the TimeFlow desktop agent.
 * This includes rate limiting, validation, history tracking, and monitoring utilities.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class ScreenshotUtilsManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.Date = dependencies.Date || Date;
    this.Math = dependencies.Math || Math;
    
    // Screenshot configuration constants
    this.MAX_SCREENSHOTS_PER_WINDOW = 3;
    this.RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
    this.MAX_SCREENSHOT_FAILURES = 3;
    this.MANDATORY_SCREENSHOT_INTERVAL = 15 * 60 * 1000; // 15 minutes
    
    console.log('✅ ScreenshotUtilsManager initialized');
  }

  /**
   * Clean old entries from screenshot history
   */
  cleanScreenshotHistory() {
    const now = this.Date.now();
    this.global.screenshotHistory = (this.global.screenshotHistory || []).filter(timestamp => 
      (now - timestamp) < this.RATE_LIMIT_WINDOW_MS
    );
  }

  /**
   * Check if we can take a screenshot (rate limiting)
   */
  canTakeScreenshot(isHealthCheck = false) {
    // Health checks always allowed
    if (isHealthCheck) return true;
    
    this.cleanScreenshotHistory();
    
    const currentCount = (this.global.screenshotHistory || []).length;
    const canTake = currentCount < this.MAX_SCREENSHOTS_PER_WINDOW;
    
    if (!canTake) {
      const oldestScreenshot = this.Math.min(...this.global.screenshotHistory);
      const timeUntilAllowed = this.RATE_LIMIT_WINDOW_MS - (this.Date.now() - oldestScreenshot);
      const minutesUntilAllowed = this.Math.ceil(timeUntilAllowed / (60 * 1000));
      
      this.console.log(`🚨 [RATE-LIMIT] Screenshot blocked: ${currentCount}/${this.MAX_SCREENSHOTS_PER_WINDOW} in last 10 minutes. Next allowed in ${minutesUntilAllowed} minutes`);
    } else {
      this.console.log(`✅ [RATE-LIMIT] Screenshot allowed: ${currentCount}/${this.MAX_SCREENSHOTS_PER_WINDOW} in last 10 minutes`);
    }
    
    return canTake;
  }

  /**
   * Check if tracking should stop due to screenshot failures
   */
  checkScreenshotStopConditions() {
    const now = this.Date.now();
    
    // === MANDATORY SCREENSHOT ENFORCEMENT ===
    this.console.log('🔍 [SCREENSHOT-CHECK] Checking stop conditions:', {
      consecutiveFailures: this.global.consecutiveScreenshotFailures || 0,
      maxFailures: this.MAX_SCREENSHOT_FAILURES,
      lastSuccessfulTime: this.global.lastSuccessfulScreenshotTime || 0,
      mandatoryInterval: this.MANDATORY_SCREENSHOT_INTERVAL / (60 * 1000) + ' minutes',
      failureStartTime: this.global.screenshotFailureStart || null
    });
    
    // Stop if too many consecutive failures (ALWAYS enforce this rule)
    if ((this.global.consecutiveScreenshotFailures || 0) >= this.MAX_SCREENSHOT_FAILURES) {
      this.console.log(`🛑 [SCREENSHOT-CHECK] STOPPING: ${this.global.consecutiveScreenshotFailures} consecutive failures >= ${this.MAX_SCREENSHOT_FAILURES}`);
      return true;
    }
    
    // Stop if mandatory screenshot interval exceeded (15 minutes without successful screenshot)
    if ((this.global.lastSuccessfulScreenshotTime || 0) > 0 && (now - this.global.lastSuccessfulScreenshotTime) > this.MANDATORY_SCREENSHOT_INTERVAL) {
      const minutesWithoutScreenshot = this.Math.floor((now - this.global.lastSuccessfulScreenshotTime) / (60 * 1000));
      this.console.log(`🛑 [SCREENSHOT-CHECK] STOPPING: ${minutesWithoutScreenshot} minutes since last successful screenshot`);
      return true;
    }
    
    // Stop if we're tracking but haven't had any successful screenshots for the mandatory interval
    if (this.global.isTracking && this.global.screenshotFailureStart && (now - this.global.screenshotFailureStart) > this.MANDATORY_SCREENSHOT_INTERVAL) {
      const minutesSinceFirstFailure = this.Math.floor((now - this.global.screenshotFailureStart) / (60 * 1000));
      this.console.log(`🛑 [SCREENSHOT-CHECK] STOPPING: ${minutesSinceFirstFailure} minutes of continuous failures`);
      return true;
    }
    
    this.console.log('✅ [SCREENSHOT-CHECK] Continue tracking - conditions not met for stopping');
    return false;
  }

  /**
   * Get stop reason for screenshot failures
   */
  getScreenshotStopReason() {
    const now = this.Date.now();
    
    if ((this.global.consecutiveScreenshotFailures || 0) >= this.MAX_SCREENSHOT_FAILURES) {
      return {
        reason: 'consecutive_failures',
        message: `Screenshot capture failed 3 consecutive times. Screenshots disabled, but app/URL tracking continues. Please check screen recording permissions.`
      };
    }
    
    if ((this.global.lastSuccessfulScreenshotTime || 0) > 0) {
      const minutesWithoutScreenshot = this.Math.floor((now - this.global.lastSuccessfulScreenshotTime) / (60 * 1000));
      return {
        reason: 'mandatory_timeout',
        message: `No successful screenshots in ${minutesWithoutScreenshot} minutes. Screenshot system disabled. Please check screen recording permissions.`
      };
    }
    
    if (this.global.screenshotFailureStart && (now - this.global.screenshotFailureStart) > this.MANDATORY_SCREENSHOT_INTERVAL) {
      const minutesSinceFirstFailure = this.Math.floor((now - this.global.screenshotFailureStart) / (60 * 1000));
      return {
        reason: 'continuous_failures',
        message: `Continuous screenshot failures for ${minutesSinceFirstFailure} minutes. Screenshot system disabled.`
      };
    }
    
    return {
      reason: 'unknown',
      message: 'Screenshot system stopped for unknown reason.'
    };
  }

  /**
   * Debug screenshot timer
   */
  debugScreenshotTimer() {
    this.console.log('🔍 [TIMER-DEBUG] Screenshot timer status:');
    this.console.log('  - screenshotInterval:', this.global.screenshotInterval ? 'SET' : 'NULL');
    this.console.log('  - global.nextScreenshotTime:', this.global.nextScreenshotTime ? this.global.nextScreenshotTime.toLocaleTimeString() : 'NULL');
    this.console.log('  - isTracking:', this.global.isTracking);
    this.console.log('  - currentSession:', this.global.currentSession ? 'EXISTS' : 'NULL');
    this.console.log('  - systemSuspended:', this.global.systemSuspended);
    this.console.log('  - screenshotsPaused:', this.global.screenshotsPaused);
    
    // Check if timer is properly scheduled
    if (this.global.nextScreenshotTime) {
      const now = this.Date.now();
      const timeLeft = this.global.nextScreenshotTime.getTime() - now;
      this.console.log('  - Time until next screenshot:', this.Math.floor(timeLeft / 1000), 'seconds');
      
      if (timeLeft < 0) {
        this.console.log('  ⚠️ Next screenshot time is in the past! (Consolidated system will handle)');
        // DISABLED: Manual rescheduling (PERFORMANCE FIX)
        // scheduleRandomScreenshot();
      }
    }
  }

  /**
   * Force screenshot timer recovery
   */
  forceScreenshotTimerRecovery() {
    this.console.log('🔧 [TIMER-RECOVERY] Forcing screenshot timer recovery...');
    
    // Clear any existing timer
    if (this.global.screenshotInterval) {
      clearTimeout(this.global.screenshotInterval);
      this.global.screenshotInterval = null;
    }
    
    // Clear global next screenshot time
    this.global.nextScreenshotTime = null;
    this.global.nextScreenshotInterval = null;
    
    // DISABLED: Legacy timer recovery - consolidated system handles all scheduling
    if (this.global.isTracking && this.global.currentSession) {
      this.console.log('🔧 [TIMER-RECOVERY] Screenshot scheduling handled by consolidated system');
      // scheduleRandomScreenshot(); // DISABLED - conflicts with consolidated system
      
      // Add additional recovery check
      setTimeout(() => {
        if (!this.global.screenshotInterval || !this.global.nextScreenshotTime) {
          this.console.log('⚠️ [TIMER-RECOVERY] Recovery failed, trying alternative scheduling...');
          
          // Alternative scheduling approach
          const backupInterval = 120; // 2 minutes
          const nextTime = new this.Date(this.Date.now() + backupInterval * 1000);
          this.global.nextScreenshotTime = nextTime;
          
          // DISABLED: Backup scheduling conflicts with consolidated system
          this.console.log('📸 [BACKUP-SCHEDULE] Backup scheduling disabled - using consolidated system');
          
          this.console.log('✅ [TIMER-RECOVERY] Backup scheduling activated');
        }
      }, 2000);
    }
  }

  // REMOVED: Mandatory screenshot monitoring - window-based 3-per-10-min logic in enhanced-screenshot-manager is the single source
  // checkMandatoryScreenshot() - removed
  // startMandatoryScreenshotMonitoring() - removed

  /**
   * Stop mandatory screenshot monitoring (no-op, kept for compatibility)
   */
  stopMandatoryScreenshotMonitoring() {
    if (this.global.mandatoryScreenshotInterval) {
      clearInterval(this.global.mandatoryScreenshotInterval);
      this.global.mandatoryScreenshotInterval = null;
    }
  }

  /**
   * Initialize the screenshot utils manager
   */
  async initialize() {
    try {
      // Initialize screenshot history if not exists
      if (!this.global.screenshotHistory) {
        this.global.screenshotHistory = [];
      }
      
      console.log('📸 ScreenshotUtilsManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ ScreenshotUtilsManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the screenshot utils manager
   */
  async shutdown() {
    try {
      this.stopMandatoryScreenshotMonitoring();
      console.log('📸 ScreenshotUtilsManager shutdown complete');
    } catch (error) {
      console.error('❌ ScreenshotUtilsManager shutdown failed:', error);
    }
  }
}

module.exports = ScreenshotUtilsManager;