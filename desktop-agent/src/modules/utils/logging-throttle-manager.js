/**
 * LOGGING THROTTLE MANAGER MODULE
 * 
 * Manages logging throttling and frequency control for the TimeFlow desktop agent.
 * This helps prevent log spam and provides summary logging capabilities.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class LoggingThrottleManager {
  constructor() {
    this.throttles = new Map();
    this.counters = new Map();
    this.lastLogTimes = new Map();
    
    console.log('✅ LoggingThrottleManager initialized');
  }
  
  /**
   * Check if we should log based on throttling rules
   */
  shouldLog(logKey, throttleMs = 5000, maxPerPeriod = 1) {
    const now = Date.now();
    const lastTime = this.lastLogTimes.get(logKey) || 0;
    const counter = this.counters.get(logKey) || 0;
    
    // Reset counter if enough time has passed
    if (now - lastTime > throttleMs) {
      this.counters.set(logKey, 0);
      this.lastLogTimes.set(logKey, now);
      return true;
    }
    
    // Check if we're within the allowed frequency
    if (counter < maxPerPeriod) {
      this.counters.set(logKey, counter + 1);
      return true;
    }
    
    return false;
  }
  
  /**
   * Log with summary for repeated events
   */
  logWithSummary(logKey, message, summaryInterval = 30000) {
    const counter = this.counters.get(logKey + '_summary') || 0;
    this.counters.set(logKey + '_summary', counter + 1);
    
    if (this.shouldLog(logKey + '_summary_display', summaryInterval, 1)) {
      const total = this.counters.get(logKey + '_summary');
      console.log(`📊 [SUMMARY] ${message} (occurred ${total} times in last 30s)`);
      this.counters.set(logKey + '_summary', 0);
    }
  }

  /**
   * Clear all throttling data
   */
  clearAll() {
    this.throttles.clear();
    this.counters.clear();
    this.lastLogTimes.clear();
    console.log('🧹 [THROTTLE] All throttling data cleared');
  }

  /**
   * Get throttling statistics
   */
  getStats() {
    return {
      activeThrottles: this.throttles.size,
      activeCounters: this.counters.size,
      activeLogs: this.lastLogTimes.size,
      throttles: Array.from(this.throttles.keys()),
      counters: Object.fromEntries(this.counters),
      lastLogTimes: Object.fromEntries(this.lastLogTimes)
    };
  }

  /**
   * Set custom throttle for a specific log key
   */
  setThrottle(logKey, throttleMs, maxPerPeriod = 1) {
    this.throttles.set(logKey, { throttleMs, maxPerPeriod });
    console.log(`⚙️ [THROTTLE] Set custom throttle for ${logKey}: ${throttleMs}ms, max ${maxPerPeriod} per period`);
  }

  /**
   * Remove throttle for a specific log key
   */
  removeThrottle(logKey) {
    this.throttles.delete(logKey);
    this.counters.delete(logKey);
    this.lastLogTimes.delete(logKey);
    console.log(`🗑️ [THROTTLE] Removed throttle for ${logKey}`);
  }

  /**
   * Create a throttled logger function
   */
  createThrottledLogger(logKey, throttleMs = 5000, maxPerPeriod = 1) {
    return (message, ...args) => {
      if (this.shouldLog(logKey, throttleMs, maxPerPeriod)) {
        console.log(`[${logKey.toUpperCase()}]`, message, ...args);
      }
    };
  }

  /**
   * Initialize the logging throttle manager
   */
  async initialize() {
    try {
      console.log('📊 LoggingThrottleManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ LoggingThrottleManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the logging throttle manager
   */
  async shutdown() {
    try {
      this.clearAll();
      console.log('📊 LoggingThrottleManager shutdown complete');
    } catch (error) {
      console.error('❌ LoggingThrottleManager shutdown failed:', error);
    }
  }
}

module.exports = LoggingThrottleManager;