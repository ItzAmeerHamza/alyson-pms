// ================================
// TimeFlow Desktop Agent - Centralized Intervals Configuration
// ================================

/**
 * All intervals and timing configurations in one place
 * Adjust these values to optimize performance vs functionality
 */

const INTERVALS = {
  // === CORE MONITORING INTERVALS ===
  
  // PERFORMANCE OPTIMIZATION: More aggressive intervals for better startup performance
  // Increased idle detection interval from 15s to 60s for major CPU reduction
  IDLE_CHECK: 60 * 1000, // 60 seconds - MEMORY OPTIMIZATION: Reduced from 15s
  
  // PERFORMANCE OPTIMIZATION: Increased mouse tracking from 5s to 30s  
  // Mouse movements are now tracked via screenshot-triggered analysis instead of real-time
  MOUSE_TRACKING: 30 * 1000, // 30 seconds - MEMORY OPTIMIZATION: Reduced from 5s
  
  // PERFORMANCE OPTIMIZATION: Increased keyboard tracking from 20s to 60s
  // Keyboard activity detection now uses screenshot-triggered analysis
  KEYBOARD_TRACKING: 60 * 1000, // 60 seconds - MEMORY OPTIMIZATION: Reduced from 20s
  
  // === CAPTURE INTERVALS ===
  
  // PERFORMANCE FIX: Increased from 2s to 10s to reduce CPU usage
  // App detection via native calls (AppleScript) takes 300-450ms per call
  APP_CAPTURE_THROTTLE: 10000, // 10 seconds - PERFORMANCE FIX
  
  // URL capture throttling - minimum time between URL captures  
  URL_CAPTURE_THROTTLE: 30000, // 30 seconds — AppleScript is the energy hog
  
  // === SCREENSHOT INTERVALS ===
  
  // Random screenshot capture timing
  SCREENSHOT_MIN: 10 * 60 * 1000, // 10 minutes minimum (was 3 minutes - MEMORY OPTIMIZATION)
  SCREENSHOT_MAX: 15 * 60 * 1000, // 15 minutes maximum
  
  // Mandatory screenshot monitoring - how often to check screenshot requirements
  SCREENSHOT_MONITORING: 10 * 60 * 1000, // 10 minutes (was 60 seconds - MEMORY OPTIMIZATION)
  
  // === NOTIFICATION & SYNC INTERVALS ===
  
  // Notification checking frequency
  NOTIFICATIONS: 60 * 1000, // 60 seconds (configurable via appSettings)
  
  // Settings refresh interval
  SETTINGS_REFRESH: 5 * 60 * 1000, // 5 minutes
  
  // === SYSTEM MONITORING ===
  
  // Node.js keep-alive interval (for standalone mode)
  NODEJS_KEEPALIVE: 30 * 1000, // 30 seconds
  
  // Sync manager intervals
  SYNC_RETRY: 30 * 1000, // 30 seconds for retry attempts
  
  // === PERFORMANCE MODES ===
  
  // High Performance Mode (reduce all intervals by 50%)
  HIGH_PERFORMANCE: {
    IDLE_CHECK: 10000, // 10 seconds
    MOUSE_TRACKING: 1000, // 1 second - improved responsiveness for real-time detection
    KEYBOARD_TRACKING: 5000, // 5 seconds
    URL_CAPTURE_THROTTLE: 3000, // 3 seconds for fast real-time URL detection
    SCREENSHOT_MONITORING: 120 * 1000, // 2 minutes
    NOTIFICATIONS: 120 * 1000, // 2 minutes
  },
  
  // Ultra Performance Mode (Balanced for memory-constrained systems but maintaining functionality)
  ULTRA_PERFORMANCE: {
    IDLE_CHECK: 300000, // 5 minutes (drastically reduced to prevent constant checks)
    MOUSE_TRACKING: 15000, // 15 seconds (FIXED: better activity detection)
    KEYBOARD_TRACKING: 30000, // 30 seconds (FIXED: better activity detection)
    APP_CAPTURE_THROTTLE: 60000, // 60 seconds (PERFORMANCE FIX: prevent rapid captures)
    URL_CAPTURE_THROTTLE: 10000, // 10 seconds for real-time URL detection
    SCREENSHOT_MIN: 10 * 60 * 1000, // 10 minutes minimum (MEMORY OPTIMIZATION)
    SCREENSHOT_MAX: 20 * 60 * 1000, // 20 minutes maximum (MEMORY OPTIMIZATION)
    SCREENSHOT_MONITORING: 10 * 60 * 1000, // 10 minutes (MEMORY OPTIMIZATION)
    NOTIFICATIONS: 600000, // 10 minutes
    SETTINGS_REFRESH: 1800000, // 30 minutes (reduced frequency)
    NODEJS_KEEPALIVE: 600000, // 10 minutes (much less frequent)
    SYNC_RETRY: 600000, // 10 minutes (much less frequent)
    TAB_MONITORING: 300000, // 5 minutes (prevent excessive tab checks)
    FAST_TAB_MONITOR: 300000, // 5 minutes (much slower in ultra mode)
    REAL_TIME_APP_DETECTION: 120000, // 2 minutes (much less aggressive)
  },
  
  // Debug Mode (very frequent for testing)
  DEBUG: {
    IDLE_CHECK: 1000, // 1 second
    MOUSE_TRACKING: 1000, // 1 second - improved responsiveness for real-time detection
    KEYBOARD_TRACKING: 1000, // 1 second
    APP_CAPTURE_THROTTLE: 100, // 100ms - capture every app switch for debugging
    SCREENSHOT_MONITORING: 10 * 1000, // 10 seconds
    NOTIFICATIONS: 10 * 1000, // 10 seconds
  }
};

/**
 * Performance mode configuration
 * Available modes: 'normal', 'high_performance', 'ultra_performance', 'debug'
 */
let currentMode = 'normal';

/**
 * Get interval value based on current performance mode
 * @param {string} intervalName - Name of the interval (e.g., 'IDLE_CHECK')
 * @returns {number} Interval value in milliseconds
 */
function getInterval(intervalName) {
  const mode = currentMode.toUpperCase();
  
  // Check if current mode has override for this interval
  if (INTERVALS[mode] && INTERVALS[mode][intervalName] !== undefined) {
    return INTERVALS[mode][intervalName];
  }
  
  // Fallback to normal interval
  return INTERVALS[intervalName] || 5000; // Default 5 seconds if not found
}

/**
 * Set performance mode
 * @param {string} mode - Performance mode ('normal', 'high_performance', 'ultra_performance', 'debug')
 */
function setPerformanceMode(mode) {
  const validModes = ['normal', 'high_performance', 'ultra_performance', 'debug'];
  
  if (validModes.includes(mode)) {
    currentMode = mode;
    console.log(`🎛️ Performance mode set to: ${mode}`);
    return true;
  } else {
    console.warn(`⚠️ Invalid performance mode: ${mode}. Valid modes:`, validModes);
    return false;
  }
}

/**
 * Get current performance mode
 * @returns {string} Current performance mode
 */
function getCurrentMode() {
  return currentMode;
}

/**
 * Get all intervals for current mode
 * @returns {object} All interval values for current mode
 */
function getAllIntervals() {
  const intervals = {};
  const mode = currentMode.toUpperCase();
  
  // Start with normal intervals
  Object.keys(INTERVALS).forEach(key => {
    if (typeof INTERVALS[key] === 'number') {
      intervals[key] = INTERVALS[key];
    }
  });
  
  // Override with mode-specific intervals if they exist
  if (INTERVALS[mode]) {
    Object.keys(INTERVALS[mode]).forEach(key => {
      intervals[key] = INTERVALS[mode][key];
    });
  }
  
  return intervals;
}

/**
 * Auto-detect performance mode based on system resources
 * @param {object} systemInfo - System information (optional)
 */
function autoDetectPerformanceMode(systemInfo = {}) {
  try {
    const os = require('os');
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpuCount = os.cpus().length;
    
    const memUsagePercent = ((totalMem - freeMem) / totalMem) * 100;
    
    console.log(`🔍 System analysis: ${cpuCount} CPUs, ${Math.round(memUsagePercent)}% memory used`);
    
    // MUCH MORE AGGRESSIVE: Ultra performance mode for any memory-constrained system
    if (cpuCount <= 8 || memUsagePercent > 70) {
      setPerformanceMode('ultra_performance');
      console.log('🐌 Memory-constrained system detected - using ultra performance mode');
    }
    // High performance mode for medium systems
    else if (cpuCount <= 16 || memUsagePercent > 50) {
      setPerformanceMode('high_performance');
      console.log('⚡ Medium system detected - using high performance mode');
    }
    // Normal mode only for very powerful systems with low memory usage
    else {
      setPerformanceMode('normal');
      console.log('🚀 Powerful system with low memory usage detected - using normal mode');
    }
    
  } catch (error) {
    console.warn('⚠️ Could not auto-detect performance mode:', error.message);
    setPerformanceMode('high_performance'); // Safe default
  }
}

/**
 * Export configuration for environment variables override
 */
function getEnvironmentOverrides() {
  const overrides = {};
  
  // Check for environment variable overrides
  Object.keys(INTERVALS).forEach(key => {
    if (typeof INTERVALS[key] === 'number') {
      const envKey = `TIMEFLOW_INTERVAL_${key}`;
      const envValue = process.env[envKey];
      
      if (envValue && !isNaN(envValue)) {
        overrides[key] = parseInt(envValue);
        console.log(`🔧 Environment override: ${key} = ${envValue}ms`);
      }
    }
  });
  
  return overrides;
}

module.exports = {
  INTERVALS,
  getInterval,
  setPerformanceMode,
  getCurrentMode,
  getAllIntervals,
  autoDetectPerformanceMode,
  getEnvironmentOverrides
}; 