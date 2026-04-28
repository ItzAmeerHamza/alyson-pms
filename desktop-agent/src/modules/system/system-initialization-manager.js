/**
 * SYSTEM INITIALIZATION MANAGER MODULE
 * 
 * Manages all system initialization tasks, power monitor events,
 * and component setup for the TimeFlow desktop agent.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class SystemInitializationManager {
  constructor(dependencies = {}) {
    this.powerMonitor = dependencies.powerMonitor;
    this.app = dependencies.app;
    this.mainWindow = dependencies.mainWindow;
    this.config = dependencies.config;
    this.cleanupRegistry = dependencies.cleanupRegistry;
    this.showTrayNotification = dependencies.showTrayNotification;
    this.stopTracking = dependencies.stopTracking;
    this.updateTrayMenuThrottled = dependencies.updateTrayMenuThrottled;
    this.recoverScreenshotPermissions = dependencies.recoverScreenshotPermissions;
    this.global = dependencies.global || global;
    
    this.systemSleepStart = null;
    // NOTE: Use global.isTracking instead of local state to avoid stale references.
    // this.isTracking and this.isPaused are kept for backward compatibility but
    // all checks should prefer global.isTracking.
    
    console.log('✅ SystemInitializationManager initialized');
  }

  /**
   * Initialize all power monitor event handlers
   */
  initializePowerMonitorEvents() {
    if (!this.powerMonitor) {
      console.log('⚠️ PowerMonitor not available, skipping power event setup');
      return;
    }

    this.setupSuspendResumeHandlers();
    // NOTE: lock-screen/unlock-screen handlers are registered in EventHandlerManager
    // to avoid duplicate stopTracking calls. Do NOT register them here.
    this.setupDisplaySleepHandlers?.() || this._setupDisplaySleepHandlers();
    
    console.log('✅ Power monitor events initialized');
  }

  /**
   * Setup suspend and resume event handlers
   */
  setupSuspendResumeHandlers() {
    this.powerMonitor.on('suspend', () => {
      console.log('💤 System suspending...');
      this.systemSleepStart = Date.now();
      
      // NOTE: stopTracking on suspend is handled by EventHandlerManager.setupPowerMonitoring()
      // to avoid duplicate stopTracking calls. Only handle non-tracking concerns here.
      
      // Stop anti-cheat monitoring
      if (this.global.antiCheatDetector) {
        this.global.antiCheatDetector.stopMonitoring();
      }
    });

    // NOTE: Resume handler has been REMOVED from here to prevent duplicate work.
    // All resume logic is consolidated in EventHandlerManager.setupPowerMonitoring().
    // This eliminates race conditions and doubled process spawning on low-memory machines.
    this.powerMonitor.on('resume', () => {
      const sleepDuration = this.systemSleepStart ? Date.now() - this.systemSleepStart : 0;
      const sleepMinutes = Math.floor(sleepDuration / 60000);
      const sleepHours = Math.floor(sleepDuration / (60 * 60 * 1000));
      console.log(`⚡ [SYS-INIT] System resumed after ${sleepHours}h ${sleepMinutes % 60}m (handled by EventHandlerManager)`);
      this.systemSleepStart = null;
    });
  }

  /**
   * Setup screen lock/unlock event handlers
   */
  setupScreenLockHandlers() {
    this.powerMonitor.on('lock-screen', () => {
      console.log('🔒 Screen locked');
      // Treat screen lock the same as laptop closure - stop tracking completely
      // Use global.isTracking to avoid stale local state
      if (this.global.isTracking) {
        console.log('🛑 Screen locked - stopping tracking (same as laptop closure)');
        if (typeof this.global.stopTracking === 'function') {
          this.global.stopTracking('screen_lock', 'Screen locked - tracking stopped automatically');
        } else if (this.stopTracking) {
          this.stopTracking('screen_lock', 'Screen locked - tracking stopped automatically');
        }
      }
    });

    this.powerMonitor.on('unlock-screen', () => {
      console.log('🔓 Screen unlocked');
      // Don't auto-resume tracking on unlock - user must manually start
      console.log('⏸️ Screen unlocked - tracking remains stopped (manual restart required)');
      if (this.showTrayNotification) {
        this.showTrayNotification('Screen unlocked - click to resume tracking', 'info');
      }
    });
  }

  /**
   * Setup display sleep/wake event handlers
   */
  _setupDisplaySleepHandlers() {
    try {
      if (typeof this.powerMonitor.on !== 'function') return;
      
      this.powerMonitor.on('display-sleep', () => {
        console.log('🖥️ Display sleep detected (system-init)');
        try {
          // NOTE: stopTracking on display-sleep is handled by EventHandlerManager
          // to avoid duplicate stopTracking calls. Only handle screenshot pause here.
          if (this.global?.screenshotManager?.pauseScreenshots) {
            this.global.screenshotManager.pauseScreenshots();
          }
        } catch (e) {
          console.warn('⚠️ Display sleep handler error:', e?.message);
        }
      });
      
      this.powerMonitor.on('display-wake', () => {
        console.log('🌅 Display wake');
        try {
          if (this.global?.screenshotManager?.resumeScreenshots) {
            this.global.screenshotManager.resumeScreenshots();
          }
          if (this.showTrayNotification) {
            this.showTrayNotification('Display awake - click to start tracking', 'info');
          }
        } catch (e) {
          console.warn('⚠️ Display wake handler error:', e?.message);
        }
      });
      
      console.log('✅ Display sleep/wake handlers initialized');
    } catch (error) {
      console.warn('⚠️ Could not set up display sleep handlers:', error?.message);
    }
  }

  /**
   * Initialize simple backup detection system
   */
  initializeSimpleBackupDetection() {
    console.log('🔄 [BACKUP] Initializing simple backup activity detection...');
    
    // Initialize display activity stats if needed
    if (!this.global.displayActivityStats) {
      this.global.displayActivityStats = { 
        clicks: 0, 
        keys: 0, 
        moves: 0, 
        lastUpdate: Date.now() 
      };
      console.log('🎯 [BACKUP] Created global.displayActivityStats');
    }
    
    if (!this.global.betweenScreenshotsActivity) {
      this.global.betweenScreenshotsActivity = { 
        clicks: 0, 
        keys: 0, 
        moves: 0, 
        lastUpdate: Date.now() 
      };
      console.log('🎯 [BACKUP] Created betweenScreenshotsActivity');
    }
    
    // Setup a timer to generate test activity for verification
    setTimeout(() => {
      console.log('🎯 [BACKUP] Generating test activity to verify UI updates...');
      
      this.generateTestActivity();
    }, 5000);
    
    console.log('✅ [BACKUP] Simple backup detection initialized');
  }

  /**
   * Generate test activity for verification
   */
  generateTestActivity() {
    // Generate some test activity
    this.global.displayActivityStats.clicks += 1;
    this.global.displayActivityStats.keys += 1;
    this.global.displayActivityStats.moves += 5;
    this.global.betweenScreenshotsActivity.clicks += 1;
    this.global.betweenScreenshotsActivity.keys += 1;
    this.global.betweenScreenshotsActivity.moves += 5;
    
    const now = Date.now();
    this.global.displayActivityStats.lastUpdate = now;
    this.global.betweenScreenshotsActivity.lastUpdate = now;
    
    console.log(`🎯 [BACKUP] Test activity generated: C:${this.global.displayActivityStats.clicks} K:${this.global.displayActivityStats.keys} M:${this.global.displayActivityStats.moves}`);
    
    // Send UI update
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('next-screenshot-update', {
        nextScreenshotTime: this.global.nextScreenshotTime ? this.global.nextScreenshotTime.toISOString() : null,
        secondsToNext: 0,
        activitySinceLastScreenshot: {
          clicks: this.global.betweenScreenshotsActivity.clicks,
          keys: this.global.betweenScreenshotsActivity.keys,
          moves: this.global.betweenScreenshotsActivity.moves
        }
      });
      
      console.log('✅ [BACKUP] Test activity UI update sent');
    }
  }

  /**
   * Initialize components with optimized intervals
   */
  initializeComponentsWithOptimizedIntervals() {
    console.log('💤 [STARTUP] SyncManager will initialize when tracking starts');
    
    // Use optimized interval manager if enabled
    if (this.global.useOptimizedIntervals) {
      console.log('🚀 Using Optimized Interval Manager');
      
      const OptimizedIntervalManager = require('../../optimized-interval-manager');
      this.global.intervalManager = new OptimizedIntervalManager();
      
      // Set performance mode on interval manager
      try {
        const intervalConfig = require('../../../config/intervals');
        const currentMode = intervalConfig.getCurrentMode();
        this.global.intervalManager.setPerformanceMode(currentMode);
        console.log(`🎛️ [MAIN] Set interval manager performance mode to: ${currentMode}`);
      } catch (error) {
        console.log('⚠️ [MAIN] Could not set performance mode on interval manager:', error.message);
        this.global.intervalManager.setPerformanceMode('ultra_performance');
      }
      
      this.setupOptimizedIntervals();
    } else {
      const IntervalManager = require('../../interval-manager');
      this.global.intervalManager = new IntervalManager();
    }
  }

  /**
   * Setup optimized intervals
   */
  setupOptimizedIntervals() {
    console.log('🎛️ [MAIN] Setting up optimized intervals...');
    
    if (this.global.intervalManager && this.global.intervalManager.register) {
      // Register optimized interval callbacks
      this.registerOptimizedCallbacks();
      console.log('✅ [MAIN] Optimized intervals setup complete');
    } else {
      console.error('❌ [MAIN] Interval manager not available for optimization');
    }
  }

  /**
   * Register optimized callback functions
   */
  registerOptimizedCallbacks() {
    // Register mouse tracking callback
    this.global.intervalManager.register('MOUSE_TRACKING', () => {
      try {
        const mouseData = this.getMouseActivityData();
        return mouseData;
      } catch (error) {
        console.error('Mouse tracking error:', error.message);
        return { moved: false, clicked: false };
      }
    });

    // Register keyboard tracking callback
    this.global.intervalManager.register('KEYBOARD_TRACKING', () => {
      try {
        return this.getKeyboardActivityData();
      } catch (error) {
        return { pressed: false };
      }
    });
  }

  /**
   * Get mouse activity data
   */
  getMouseActivityData() {
    // Implementation would go here
    return { moved: false, clicked: false };
  }

  /**
   * Get keyboard activity data
   */
  getKeyboardActivityData() {
    // Implementation would go here
    return { pressed: false };
  }

  /**
   * Initialize the system initialization manager
   */
  async initialize() {
    try {
      this.initializePowerMonitorEvents();
      this.initializeSimpleBackupDetection();
      this.initializeComponentsWithOptimizedIntervals();
      
      console.log('🔧 SystemInitializationManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ SystemInitializationManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Update tracking state
   */
  updateTrackingState(isTracking, isPaused) {
    this.isTracking = isTracking;
    this.isPaused = isPaused;
  }

  /**
   * Shutdown the system initialization manager
   */
  async shutdown() {
    try {
      console.log('🔧 SystemInitializationManager shutdown complete');
    } catch (error) {
      console.error('❌ SystemInitializationManager shutdown failed:', error);
    }
  }
}

module.exports = SystemInitializationManager;