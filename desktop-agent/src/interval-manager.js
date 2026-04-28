// ================================
// TimeFlow Desktop Agent - Centralized Interval Manager
// ================================

const { getInterval, getCurrentMode } = require('../config/intervals');

class IntervalManager {
  constructor() {
    this.intervals = new Map();
    this.isRunning = false;
    this.callbacks = new Map();
    
    console.log('🎛️ Interval Manager initialized');
  }

  /**
   * Register a callback for a specific interval
   * @param {string} name - Interval name (e.g., 'IDLE_CHECK')
   * @param {function} callback - Function to call
   */
  register(name, callback) {
    this.callbacks.set(name, callback);
    console.log(`📋 Registered callback for: ${name}`);
  }

  /**
   * Start all monitoring intervals
   */
  startAll() {
    if (this.isRunning) {
      console.log('⚠️ Interval Manager already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting all intervals...');

    // Start each interval type
    this.startInterval('IDLE_CHECK');
    this.startInterval('MOUSE_TRACKING');
    this.startInterval('KEYBOARD_TRACKING');
    this.startInterval('TAB_MONITORING');
    this.startInterval('ANTI_CHEAT_MONITORING');
    this.startInterval('BACKGROUND_BROWSER_CHECK');
    this.startInterval('SCREENSHOT_MONITORING');
    this.startInterval('NOTIFICATIONS');
    this.startInterval('SETTINGS_REFRESH');

    console.log(`✅ All intervals started in ${getCurrentMode()} mode`);
    this.logCurrentIntervals();
  }

  /**
   * Start a specific interval
   * @param {string} name - Interval name
   */
  startInterval(name) {
    if (this.intervals.has(name)) {
      console.log(`⚠️ Interval ${name} already running`);
      return;
    }

    const callback = this.callbacks.get(name);
    if (!callback) {
      console.log(`⚠️ No callback registered for interval: ${name}`);
      return;
    }

    const intervalTime = this.getIntervalTime(name);
    const intervalId = setInterval(() => {
      try {
        callback();
      } catch (error) {
        console.error(`❌ Error in interval ${name}:`, error.message);
      }
    }, intervalTime);

    this.intervals.set(name, intervalId);
    console.log(`✅ Started ${name}: ${intervalTime}ms`);
  }

  /**
   * Stop a specific interval
   * @param {string} name - Interval name
   */
  stopInterval(name) {
    const intervalId = this.intervals.get(name);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(name);
      console.log(`🛑 Stopped interval: ${name}`);
    }
  }

  /**
   * Stop all intervals
   */
  stopAll() {
    console.log('🛑 Stopping all intervals...');
    
    for (const [name, intervalId] of this.intervals) {
      clearInterval(intervalId);
      console.log(`🛑 Stopped: ${name}`);
    }
    
    this.intervals.clear();
    this.isRunning = false;
    console.log('✅ All intervals stopped');
  }

  /**
   * Restart all intervals (useful when changing performance modes)
   */
  restartAll() {
    console.log('🔄 Restarting all intervals...');
    this.stopAll();
    setTimeout(() => {
      this.startAll();
    }, 1000);
  }

  /**
   * Get interval time for a specific interval
   * @param {string} name - Interval name
   * @returns {number} Interval time in milliseconds
   */
  getIntervalTime(name) {
    switch (name) {
      case 'IDLE_CHECK':
        return getInterval('IDLE_CHECK');
      case 'MOUSE_TRACKING':
        return getInterval('MOUSE_TRACKING');
      case 'KEYBOARD_TRACKING':
        return getInterval('KEYBOARD_TRACKING');
      case 'TAB_MONITORING':
        return 10000; // 10 seconds for tab monitoring
      case 'ANTI_CHEAT_MONITORING':
        return 15000; // 15 seconds for anti-cheat
      case 'BACKGROUND_BROWSER_CHECK':
        return 10000; // 10 seconds for background browser check
      case 'SCREENSHOT_MONITORING':
        return getInterval('SCREENSHOT_MONITORING');
      case 'NOTIFICATIONS':
        return getInterval('NOTIFICATIONS');
      case 'SETTINGS_REFRESH':
        return getInterval('SETTINGS_REFRESH');
      default:
        return 5000; // Default 5 seconds
    }
  }

  /**
   * Log current intervals for debugging
   */
  logCurrentIntervals() {
    console.log('📊 Current Active Intervals:');
    for (const [name] of this.intervals) {
      const time = this.getIntervalTime(name);
      console.log(`   ${name}: ${time}ms (${time/1000}s)`);
    }
  }

  /**
   * Get status of all intervals
   * @returns {object} Status object
   */
  getStatus() {
    const status = {
      isRunning: this.isRunning,
      activeIntervals: this.intervals.size,
      registeredCallbacks: this.callbacks.size,
      mode: getCurrentMode(),
      intervals: {}
    };

    for (const [name] of this.intervals) {
      status.intervals[name] = {
        active: true,
        intervalTime: this.getIntervalTime(name)
      };
    }

    return status;
  }

  /**
   * Update interval frequency for a specific interval
   * @param {string} name - Interval name
   * @param {number} newInterval - New interval time in milliseconds
   */
  updateInterval(name, newInterval) {
    console.log(`🔄 Updating ${name} from ${this.getIntervalTime(name)}ms to ${newInterval}ms`);
    
    // Stop current interval
    this.stopInterval(name);
    
    // Start with new interval
    const callback = this.callbacks.get(name);
    if (callback) {
      const intervalId = setInterval(() => {
        try {
          callback();
        } catch (error) {
          console.error(`❌ Error in interval ${name}:`, error.message);
        }
      }, newInterval);
      
      this.intervals.set(name, intervalId);
      console.log(`✅ Updated ${name} to ${newInterval}ms`);
    }
  }

  /**
   * Cleanup - stop all intervals and clear callbacks
   */
  cleanup() {
    console.log('🧹 Cleaning up Interval Manager...');
    this.stopAll();
    this.callbacks.clear();
    console.log('✅ Interval Manager cleaned up');
  }
}

module.exports = IntervalManager; 