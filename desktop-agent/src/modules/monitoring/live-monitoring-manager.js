/**
 * Live Monitoring Manager Module
 * Handles all live activity updates and real-time monitoring
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('../core/cleanup-registry');

class LiveMonitoringManager {
  constructor(config) {
    this.config = config;
    this.liveActivityInterval = null;
    this.screenshotTimerInterval = null;
    this.isTracking = false;
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'liveMonitoringManager',
      cleanup: async () => this.shutdown()
    });
  }

  initialize({ isTracking = false } = {}) {
    this.isTracking = isTracking;
    console.log('📊 [LIVE-MONITORING-MANAGER] Initialized');
  }

  setTrackingState(tracking) {
    this.isTracking = tracking;
  }

  // === LIVE ACTIVITY UPDATES ===
  
  startLiveActivityUpdates() {
    if (this.liveActivityInterval) {
      clearInterval(this.liveActivityInterval);
    }
    
    console.log('📊 [LIVE-ACTIVITY] Starting live activity updates for UI');
    
    // Use performance-aware intervals
    const currentMode = this.getCurrentMode();
    let updateInterval;
    
    switch (currentMode) {
      case 'ultra_performance':
        updateInterval = 120000; // 2 minutes in ultra performance mode
        break;
      case 'high_performance':
        updateInterval = 60000; // 1 minute in high performance mode
        break;
      default:
        updateInterval = 10000; // 10 seconds in normal mode
    }
    
    let logCounter = 0; // Log every 100th update to reduce spam
    
    this.liveActivityInterval = setInterval(() => {
      if (!this.isTracking || !global.mainWindow || global.mainWindow.isDestroyed()) {
        return;
      }
      
      // Send next screenshot timer update
      this.sendNextScreenshotUpdate();
      
      try {
        // In ultra performance mode, skip most processing to save resources
        if (currentMode === 'ultra_performance') {
          const basicActivity = {
            mouseClicks: global.activityStats?.mouseClicks || 0,
            keystrokes: global.activityStats?.keystrokes || 0,
            mouseMovements: global.activityStats?.mouseMovements || 0,
            activityPercent: 100,
            totalActivity: (global.activityStats?.mouseClicks || 0) + 
                          (global.activityStats?.keystrokes || 0) + 
                          (global.activityStats?.mouseMovements || 0),
            timestamp: new Date().toISOString(),
            nextScreenshotTime: null,
            secondsToNextScreenshot: 0,
            nextScreenshotFormatted: '--:--:--'
          };
          
          // Batch activity data instead of immediate send
          global.enhancedSyncManager?.batchActivityUpdate(basicActivity);
          return;
        }
        
        // Normal mode processing
        const now = Date.now();
        
        // CRITICAL FIX: Ensure nextScreenshotTime is always valid
        if (!global.nextScreenshotTime && global.isTracking) {
          const interval = Math.floor(Math.random() * (360000 - 180000 + 1)) + 180000; // 3-6 minutes
          global.nextScreenshotTime = new Date(Date.now() + interval);
          console.log(`📸 [LIVE-MONITOR-FIX] Set missing nextScreenshotTime to ${global.nextScreenshotTime.toLocaleTimeString()}`);
        }
        
        const nextScreenshot = global.nextScreenshotTime;
        const timeToNextScreenshot = nextScreenshot ? Math.max(0, nextScreenshot.getTime() - now) : 0;
        const secondsToNextScreenshot = Math.floor(timeToNextScreenshot / 1000);
        
        const cumulativeActivity = this.getCumulativeDailyActivity();
        const currentActivity = {
          mouseClicks: cumulativeActivity.clicks || 0,
          keystrokes: cumulativeActivity.keys || 0,
          mouseMovements: cumulativeActivity.moves || 0,
          activityPercent: Math.round(this.calculateActivityPercent()),
          totalActivity: (cumulativeActivity.clicks || 0) + 
                        (cumulativeActivity.keys || 0) + 
                        (cumulativeActivity.moves || 0),
          timestamp: new Date().toISOString(),
          nextScreenshotTime: nextScreenshot ? nextScreenshot.toISOString() : null,
          secondsToNextScreenshot: secondsToNextScreenshot,
          nextScreenshotFormatted: nextScreenshot ? nextScreenshot.toLocaleTimeString() : '--:--:--'
        };
        
        // Greatly reduced logging frequency
        logCounter++;
        if (logCounter % 100 === 0) { // Log only every 100th update
          console.log('📊 [LIVE-ACTIVITY] Sending activity:', {
            clicks: currentActivity.mouseClicks,
            keys: currentActivity.keystrokes,
            moves: currentActivity.mouseMovements,
            total: currentActivity.totalActivity
          });
        }
        
        // Batch activity data instead of immediate send
        global.enhancedSyncManager?.batchActivityUpdate(currentActivity);
        
      } catch (error) {
        // No error logging in ultra performance mode
        if (currentMode !== 'ultra_performance') {
          console.log('❌ [LIVE-ACTIVITY] Error in live activity update:', error.message);
        }
      }
    }, updateInterval);
    
    cleanupRegistry.registerInterval(this.liveActivityInterval, 'Live Activity Updates');
    
    console.log(`✅ [LIVE-ACTIVITY] Live activity updates started (${updateInterval/1000}s interval, ${currentMode} mode)`);
    
    // Start a separate, more frequent timer for screenshot countdown
    this.startScreenshotTimerUpdates();
  }

  stopLiveActivityUpdates() {
    if (this.liveActivityInterval) {
      clearInterval(this.liveActivityInterval);
      this.liveActivityInterval = null;
      console.log('🛑 [LIVE-ACTIVITY] Live activity updates stopped');
    }
  }

  // === SCREENSHOT TIMER UPDATES ===
  
  startScreenshotTimerUpdates() {
    if (this.screenshotTimerInterval) {
      clearInterval(this.screenshotTimerInterval);
    }
    
    this.screenshotTimerInterval = setInterval(() => {
      if (!this.isTracking || !global.mainWindow || global.mainWindow.isDestroyed()) {
        return;
      }
      
      this.sendNextScreenshotUpdate();
    }, 1000); // Update every second
    
    cleanupRegistry.registerInterval(this.screenshotTimerInterval, 'Screenshot Timer Updates');
    console.log('📸 [SCREENSHOT-TIMER] Timer updates started (1 second interval)');
  }

  stopScreenshotTimerUpdates() {
    if (this.screenshotTimerInterval) {
      clearInterval(this.screenshotTimerInterval);
      this.screenshotTimerInterval = null;
      console.log('🛑 [SCREENSHOT-TIMER] Timer updates stopped');
    }
  }

  sendNextScreenshotUpdate() {
    try {
      const nextScreenshot = global.nextScreenshotTime;
      const now = Date.now();
      
      if (!nextScreenshot) {
        return;
      }
      
      const timeToNext = Math.max(0, nextScreenshot.getTime() - now);
      const secondsToNext = Math.floor(timeToNext / 1000);
      
      const updateData = {
        nextScreenshotTime: nextScreenshot.toISOString(),
        secondsToNextScreenshot: secondsToNext,
        nextScreenshotFormatted: nextScreenshot.toLocaleTimeString(),
        timestamp: new Date().toISOString()
      };
      
      global.enhancedSyncManager?.batchScreenshotUpdate(updateData);
      
    } catch (error) {
      console.log('❌ [SCREENSHOT-TIMER] Error in screenshot timer update:', error.message);
    }
  }

  // === UTILITY FUNCTIONS ===
  
  getCurrentMode() {
    // Delegate to interval manager if available
    return global.intervalManager?.getCurrentMode() || 'normal';
  }

  getCumulativeDailyActivity() {
    // Return cumulative daily activity
    return global.dailyActivity || { clicks: 0, keys: 0, moves: 0 };
  }

  calculateActivityPercent() {
    // Simple activity percentage calculation
    const activity = this.getCumulativeDailyActivity();
    const total = activity.clicks + activity.keys + activity.moves;
    return total > 0 ? Math.min(100, Math.max(0, total / 10)) : 0;
  }

  shutdown() {
    this.stopLiveActivityUpdates();
    this.stopScreenshotTimerUpdates();
    console.log('📊 [LIVE-MONITORING-MANAGER] Shutdown complete');
  }
}

module.exports = LiveMonitoringManager;