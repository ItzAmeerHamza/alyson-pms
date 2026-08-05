// ================================
// TimeFlow Desktop Agent - Optimized Interval Manager
// ================================

const { getInterval, getCurrentMode } = require('../config/intervals');
const os = require('os');

class OptimizedIntervalManager {
  constructor() {
    this.intervals = new Map();
    this.callbacks = new Map();
    this.batchData = {
      activities: [],
      appLogs: [],
      urlLogs: [],
      screenshots: []
    };
    
    // Activity state tracking
    this.activityState = {
      activityLevel: 'idle',
      lastActivityTime: Date.now(),
      totalEvents: 0,
      cpuUsage: 0,
      memoryUsage: 0
    };
    
    // Performance mode
    this.performanceMode = 'normal';
    
    // Base intervals for different monitor types (much more conservative)
    this.baseIntervals = {
      input: 15000,    // 15 seconds base for input monitoring
      app: 20000,      // 20 seconds base for app monitoring (much longer)
      screenshot: 300000,  // 5 minutes for screenshots
      sync: 60000      // 1 minute for sync operations
    };
    
    console.log('🎛️ OptimizedIntervalManager initialized with conservative intervals');
  }

  /**
   * Start optimized monitoring with consolidated intervals
   */
  startOptimized() {
    if (this.isRunning) {
      console.log('⚠️ Optimized Interval Manager already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting optimized monitoring...');

    // 1. Master activity monitor (10s) - determines activity level
    this.startMasterActivityMonitor();
    
    // 2. Combined input monitor (adaptive: 5-30s based on activity)
    this.startCombinedInputMonitor();
    
    // 3. Combined app/URL monitor (adaptive: 10-60s based on activity)
    this.startCombinedAppMonitor();
    
    // 4. Low frequency monitor (60s) - handles screenshots, notifications, settings
    this.startLowFrequencyMonitor();
    
    // 5. Batch flush interval (30s) - sends accumulated data
    this.startBatchFlush();
    
    // 6. System resource monitor (30s) - monitors CPU/memory
    this.startResourceMonitor();

    console.log('✅ Optimized monitoring started with adaptive intervals');
    this.logOptimizedStatus();
  }

  /**
   * Master activity monitor - determines user activity level
   */
  startMasterActivityMonitor() {
    const interval = setInterval(() => {
      try {
        const now = Date.now();
        const timeSinceLastActivity = now - this.activityState.lastActivityTime;
        
        // Determine activity level based on time since last activity
        if (timeSinceLastActivity < 30000) { // < 30 seconds
          this.activityState.activityLevel = 'high';
          this.activityState.isActive = true;
        } else if (timeSinceLastActivity < 120000) { // < 2 minutes
          this.activityState.activityLevel = 'medium';
          this.activityState.isActive = true;
        } else if (timeSinceLastActivity < 300000) { // < 5 minutes
          this.activityState.activityLevel = 'low';
          this.activityState.isActive = true;
        } else {
          this.activityState.activityLevel = 'idle';
          this.activityState.isActive = false;
        }
        
        // Adjust other intervals based on activity level
        this.adjustIntervalsBasedOnActivity();
        
      } catch (error) {
        console.error('❌ Error in master activity monitor:', error.message);
      }
    }, 10000); // Check every 10 seconds
    
    this.intervals.set('MASTER_ACTIVITY', interval);
  }

  /**
   * Combined input monitor - handles both mouse and keyboard in one interval
   */
  startCombinedInputMonitor() {
    let currentInterval = this.getAdaptiveInterval('input');
    
    const monitor = () => {
      try {
        // Get all callbacks for input monitoring
        const mouseCallback = this.callbacks.get('MOUSE_TRACKING');
        const keyboardCallback = this.callbacks.get('KEYBOARD_TRACKING');
        const idleCallback = this.callbacks.get('IDLE_CHECK');
        
        // Execute all input-related checks in one go
        const inputData = {
          mouse: { moved: false, clicked: false },
          keyboard: { pressed: false },
          idle: { isIdle: false, duration: 0 }
        };
        
        // Check mouse activity
        if (mouseCallback) {
          const mouseResult = mouseCallback();
          if (mouseResult) {
            inputData.mouse = mouseResult;
            if (mouseResult.moved || mouseResult.clicked) {
              this.activityState.lastActivityTime = Date.now();
            }
          }
        }
        
        // Check keyboard activity
        if (keyboardCallback) {
          const keyboardResult = keyboardCallback();
          if (keyboardResult && keyboardResult.pressed) {
            inputData.keyboard = keyboardResult;
            this.activityState.lastActivityTime = Date.now();
          }
        }
        
        // Check idle state
        if (idleCallback) {
          const idleResult = idleCallback();
          if (idleResult) {
            inputData.idle = idleResult;
          }
        }
        
        // Batch store the data instead of immediate database write
        this.batchData.activities.push({
          timestamp: Date.now(),
          type: 'input',
          data: inputData
        });
        
      } catch (error) {
        console.error('❌ Error in combined input monitor:', error.message);
      }
    };
    
    // Start with initial interval
    let intervalId = setInterval(monitor, currentInterval);
    this.intervals.set('COMBINED_INPUT', intervalId);
    
    // Store reference for dynamic adjustment
    this.intervals.set('COMBINED_INPUT_FUNCTION', monitor);
  }

  /**
   * Combined app/URL monitor - handles tab and browser monitoring together
   */
  startCombinedAppMonitor() {
    let currentInterval = this.getAdaptiveInterval('app');
    
    // Use even longer intervals in ultra performance mode to reduce load
    if (this.performanceMode === 'ultra_performance') {
      currentInterval = Math.max(currentInterval, 30000); // Minimum 30 seconds in ultra mode
    } else if (this.performanceMode === 'high_performance') {
      currentInterval = Math.max(currentInterval, 20000); // Minimum 20 seconds in high mode
    }
    
    console.log(`🖥️ [COMBINED-APP] Starting with ${currentInterval/1000}s interval (${this.performanceMode} mode)`);
    
    const monitor = () => {
      try {
        // Skip expensive operations in ultra performance mode - be even more aggressive
        if (this.performanceMode === 'ultra_performance') {
          // In ultra performance mode, only do minimal essential monitoring
          // Skip all expensive app detection, URL monitoring, and anti-cheat
          return;
        }
        
        const tabCallback = this.callbacks.get('TAB_MONITORING');
        const browserCallback = this.callbacks.get('BACKGROUND_BROWSER_CHECK');
        const antiCheatCallback = this.callbacks.get('ANTI_CHEAT_MONITORING');
        
        const appData = {
          activeApp: null,
          activeUrl: null,
          backgroundApps: [],
          suspiciousActivity: false
        };
        
        // Get active tab/app info
        if (tabCallback) {
          const tabResult = tabCallback();
          if (tabResult) {
            appData.activeApp = tabResult.app;
            appData.activeUrl = tabResult.url;
          }
        }
        
        // Check background browsers (skip in ultra performance mode to save resources)
        if (browserCallback && this.performanceMode !== 'ultra_performance') {
          const browserResult = browserCallback();
          if (browserResult) {
            appData.backgroundApps = browserResult.apps;
          }
        }
        
        // Anti-cheat check (only in high activity mode and not ultra performance)
        if (antiCheatCallback && this.activityState.activityLevel === 'high' && this.performanceMode !== 'ultra_performance') {
          const antiCheatResult = antiCheatCallback();
          if (antiCheatResult) {
            appData.suspiciousActivity = antiCheatResult.suspicious;
          }
        }
        
        // Batch store the data
        this.batchData.appLogs.push({
          timestamp: Date.now(),
          type: 'app_monitoring',
          data: appData
        });
        
      } catch (error) {
        console.error('❌ Error in combined app monitor:', error.message);
      }
    };
    
    let intervalId = setInterval(monitor, currentInterval);
    this.intervals.set('COMBINED_APP', intervalId);
    this.intervals.set('COMBINED_APP_FUNCTION', monitor);
  }

  /**
   * Low frequency monitor - handles screenshots, notifications, settings
   */
  startLowFrequencyMonitor() {
    const interval = setInterval(() => {
      try {
        // Only run these if user is active
        if (this.activityState.isActive) {
          const screenshotCallback = this.callbacks.get('SCREENSHOT_MONITORING');
          const notificationCallback = this.callbacks.get('NOTIFICATIONS');
          const settingsCallback = this.callbacks.get('SETTINGS_REFRESH');
          
          // Screenshot check (adaptive based on activity)
          if (screenshotCallback) {
            const shouldTakeScreenshot = this.shouldTakeScreenshot();
            if (shouldTakeScreenshot) {
              screenshotCallback();
            }
          }
          
          // Notification check
          if (notificationCallback) {
            notificationCallback();
          }
          
          // Settings refresh (only every 5th iteration = 5 minutes)
          if (settingsCallback && Date.now() % 5 === 0) {
            settingsCallback();
          }
        }
      } catch (error) {
        console.error('❌ Error in low frequency monitor:', error.message);
      }
    }, 60000); // 60 seconds
    
    this.intervals.set('LOW_FREQUENCY', interval);
  }

  /**
   * PERFORMANCE OPTIMIZATION: Enhanced batch flush with dynamic batching
   * - Reduces database write frequency during low activity
   * - Processes larger batches less frequently for better efficiency
   * - Maintains responsiveness during high activity periods
   */
  startBatchFlush() {
    this.lastFlushTime = Date.now(); // Track last flush for dynamic timing
    
    const interval = setInterval(async () => {
      try {
        const totalItems = this.batchData.activities.length + 
                          this.batchData.appLogs.length + 
                          this.batchData.urlLogs.length;
        
        const timeSinceLastFlush = Date.now() - this.lastFlushTime;
        
        // PERFORMANCE OPTIMIZATION: More aggressive dynamic flush criteria for better performance
        const shouldFlush = 
          // Flush if we have 100+ items (prevent memory buildup, increased threshold)
          totalItems >= 100 ||
          // Flush if we have data and 120+ seconds have passed (much less frequent during low activity)
          (totalItems > 0 && timeSinceLastFlush >= 120000) ||
          // Flush more frequently during high activity periods (60s max, was 30s)
          (totalItems > 20 && this.activityState.activityLevel === 'high' && timeSinceLastFlush >= 60000);
        
        if (shouldFlush) {
          // Process and send batch data
          const batchPayload = {
            activities: [...this.batchData.activities],
            appLogs: [...this.batchData.appLogs],
            urlLogs: [...this.batchData.urlLogs],
            timestamp: Date.now(),
            activityLevel: this.activityState.activityLevel
          };
          
          // Clear batch data
          this.batchData.activities = [];
          this.batchData.appLogs = [];
          this.batchData.urlLogs = [];
          this.lastFlushTime = Date.now();
          
          // Send to backend (implement your batch endpoint)
          console.log(`📦 Dynamic batch flush: ${batchPayload.activities.length} activities, ${batchPayload.appLogs.length} app logs (${this.activityState.activityLevel} activity)`);
          
          // Call batch processing callback if registered
          const batchCallback = this.callbacks.get('BATCH_PROCESS');
          if (batchCallback) {
            await batchCallback(batchPayload);
          }
        } else {
          // PERFORMANCE OPTIMIZATION: Log throttled status to show system is working efficiently
          if (totalItems > 0) {
            console.log(`📦 Batch holding: ${totalItems} items, ${Math.round(timeSinceLastFlush/1000)}s since last flush (waiting for more data or time threshold)`);
          }
        }
      } catch (error) {
        console.error('❌ Error in batch flush:', error.message);
      }
    }, 90000); // PERFORMANCE OPTIMIZATION: Increased from 30s to 90s for much better efficiency
    
    this.intervals.set('BATCH_FLUSH', interval);
  }

  /**
   * Resource monitor - tracks CPU and memory usage
   */
  startResourceMonitor() {
    const interval = setInterval(() => {
      try {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        
        // Calculate CPU usage (simplified)
        let totalIdle = 0;
        let totalTick = 0;
        cpus.forEach(cpu => {
          for (const type in cpu.times) {
            totalTick += cpu.times[type];
          }
          totalIdle += cpu.times.idle;
        });
        
        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        const usage = 100 - ~~(100 * idle / total);
        
        this.activityState.cpuUsage = usage;
        this.activityState.memoryUsage = ((totalMem - freeMem) / totalMem) * 100;
        
        // FIXED: Disable aggressive performance monitoring that causes more overhead than benefit
        // Only do basic resource checking every 5 minutes instead of constantly
        const now = Date.now();
        if (!this.lastResourceCheck || now - this.lastResourceCheck > 300000) { // 5 minutes
          this.lastResourceCheck = now;
          
          // Only log for debugging, don't switch modes constantly
          if (this.activityState.cpuUsage > 90) {
            console.log(`📊 [DEBUG] High CPU usage: ${this.activityState.cpuUsage.toFixed(1)}% (monitoring disabled for performance)`);
          }
        }
        
      } catch (error) {
        console.error('❌ Error in resource monitor:', error.message);
      }
    }, 5 * 60 * 1000); // 5 minutes — avoid burning CPU just to measure CPU
    
    this.intervals.set('RESOURCE_MONITOR', interval);
  }

  /**
   * Get adaptive interval based on activity level and monitor type
   */
  getAdaptiveInterval(type) {
    const baseInterval = this.baseIntervals[type] || 5000;
    
    // Use much longer intervals in ultra performance mode to reduce resource usage
    if (this.performanceMode === 'ultra_performance') {
      // Significantly increase intervals for ultra performance
      const multiplier = type === 'app' ? 8 : 4; // Apps get 8x longer intervals, others 4x
      return Math.max(baseInterval * multiplier, 30000); // Minimum 30 seconds for apps
    }
    
    switch (this.activityState.activityLevel) {
      case 'idle':
        return baseInterval * 6; // Much longer for idle
      case 'low':
        return baseInterval * 4; // Longer for low activity
      case 'medium':
        return baseInterval * 2; // Moderate for medium activity
      case 'high':
        return baseInterval * 1.5; // Slightly longer even for high activity
      default:
        return baseInterval * 3; // Conservative default
    }
  }

  /**
   * Adjust intervals based on current activity level
   */
  adjustIntervalsBasedOnActivity(forceMode = null) {
    const mode = forceMode || this.activityState.activityLevel;
    
    // Adjust combined input monitor
    const inputInterval = this.getAdaptiveInterval('input');
    this.updateMonitorInterval('COMBINED_INPUT', inputInterval, 'COMBINED_INPUT_FUNCTION');
    
    // Adjust combined app monitor
    const appInterval = this.getAdaptiveInterval('app');
    this.updateMonitorInterval('COMBINED_APP', appInterval, 'COMBINED_APP_FUNCTION');
    
    console.log(`🔄 Intervals adjusted for ${mode} activity level`);
  }

  /**
   * Update a specific monitor's interval
   */
  updateMonitorInterval(intervalName, newInterval, functionName) {
    const currentInterval = this.intervals.get(intervalName);
    if (currentInterval) {
      clearInterval(currentInterval);
      
      const monitorFunction = this.intervals.get(functionName);
      if (monitorFunction) {
        const newIntervalId = setInterval(monitorFunction, newInterval);
        this.intervals.set(intervalName, newIntervalId);
      }
    }
  }

  /**
   * Determine if screenshot should be taken based on activity
   */
  shouldTakeScreenshot() {
    const activityLevel = this.activityState.activityLevel;
    const random = Math.random();
    
    // Adaptive screenshot probability
    const probabilities = {
      high: 0.8,    // 80% chance when highly active
      medium: 0.5,  // 50% chance when medium activity
      low: 0.2,     // 20% chance when low activity
      idle: 0.05    // 5% chance when idle
    };
    
    return random < probabilities[activityLevel];
  }

  /**
   * Register a callback for a specific interval type
   */
  register(name, callback) {
    this.callbacks.set(name, callback);
    console.log(`📋 Registered callback for: ${name}`);
  }

  /**
   * Register batch processing callback
   */
  registerBatchProcessor(callback) {
    this.callbacks.set('BATCH_PROCESS', callback);
    console.log('📋 Registered batch processor');
  }

  /**
   * Stop all optimized intervals
   */
  stopAll() {
    console.log('🛑 Stopping all optimized intervals...');
    
    for (const [name, intervalId] of this.intervals) {
      if (typeof intervalId === 'number') {
        clearInterval(intervalId);
        console.log(`🛑 Stopped: ${name}`);
      }
    }
    
    this.intervals.clear();
    this.isRunning = false;
    console.log('✅ All optimized intervals stopped');
  }

  /**
   * Set performance mode to adjust interval frequency
   */
  setPerformanceMode(mode) {
    const validModes = ['normal', 'high_performance', 'ultra_performance'];
    if (validModes.includes(mode)) {
      this.performanceMode = mode;
      console.log(`🎛️ [OPTIMIZED-MANAGER] Performance mode set to: ${mode}`);
      
      // Restart intervals with new performance settings
      if (this.intervals.size > 0) {
        console.log('🔄 [OPTIMIZED-MANAGER] Restarting intervals with new performance mode');
                 this.stopAll();
        setTimeout(() => this.startOptimized(), 1000);
      }
    } else {
      console.warn(`⚠️ Invalid performance mode: ${mode}`);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activityState: this.activityState,
      activeIntervals: Array.from(this.intervals.keys()).filter(key => !key.includes('_FUNCTION')),
      batchDataSize: {
        activities: this.batchData.activities.length,
        appLogs: this.batchData.appLogs.length,
        urlLogs: this.batchData.urlLogs.length
      }
    };
  }

  /**
   * Log optimized status
   */
  logOptimizedStatus() {
    try {
      console.log('📊 Optimized Monitoring Status:');
      console.log(`   Activity Level: ${this.activityState?.activityLevel || 'unknown'}`);
      console.log(`   Active Intervals: ${Array.from(this.intervals.keys()).filter(key => !key.includes('_FUNCTION')).length}`);
      
      // Defensive logging for CPU and Memory usage
      const cpuUsage = this.activityState?.cpuUsage;
      const memoryUsage = this.activityState?.memoryUsage;
      console.log(`   CPU Usage: ${typeof cpuUsage === 'number' ? cpuUsage.toFixed(1) : 'N/A'}%`);
      console.log(`   Memory Usage: ${typeof memoryUsage === 'number' ? memoryUsage.toFixed(1) : 'N/A'}%`);
      
      console.log('   Intervals:');
      console.log(`     - Master Activity: 10s (fixed)`);
      console.log(`     - Combined Input: ${this.getAdaptiveInterval('input')/1000}s (adaptive)`);
      console.log(`     - Combined App: ${this.getAdaptiveInterval('app')/1000}s (adaptive)`);
      console.log(`     - Low Frequency: 60s (fixed)`);
      console.log(`     - Batch Flush: 30s (fixed)`);
      console.log(`     - Resource Monitor: 30s (fixed)`);
    } catch (error) {
      console.log('📊 Optimized Monitoring Status: Error displaying status -', error.message);
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    console.log('🧹 Cleaning up Optimized Interval Manager...');
    this.stopAll();
    this.callbacks.clear();
    this.batchData.activities = [];
    this.batchData.appLogs = [];
    this.batchData.urlLogs = [];
    console.log('✅ Optimized Interval Manager cleaned up');
  }
}

module.exports = OptimizedIntervalManager; 