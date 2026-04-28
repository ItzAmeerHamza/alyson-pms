/**
 * INPUT TRACKING MANAGER MODULE
 * 
 * Manages unified input tracking initialization and global debugging functions for the TimeFlow desktop agent.
 * This includes PowerMonitor integration and activity recording.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class InputTrackingManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.powerMonitor = dependencies.powerMonitor;
    this.isTracking = dependencies.isTracking;
    this.recordEnhancedActivity = dependencies.recordEnhancedActivity;
    this.unifiedInputTracker = dependencies.unifiedInputTracker;
    
    console.log('✅ InputTrackingManager initialized');
  }

  /**
   * Initialize unified input tracking - SIMPLE VERSION TO PREVENT STARTUP ERRORS
   */
  initializeUnifiedInputTracking() {
    this.console.log('🚀 [UNIFIED-TRACKER] Initializing minimal unified input tracking...');
    
    try {
      // Very basic PowerMonitor detection (minimal to prevent errors)
      if (typeof this.powerMonitor !== 'undefined' && this.powerMonitor && this.powerMonitor.on) {
        this.powerMonitor.on('user-activity', () => {
          if (!this.isTracking) return;
          // Simple activity recording - no complex logic to cause errors
          try {
            if (typeof this.recordEnhancedActivity === 'function') {
              this.recordEnhancedActivity('move', 'unified-tracker');
            }
          } catch (e) {
            // Ignore any errors in activity recording
          }
        });
        this.console.log('✅ [UNIFIED-TRACKER] Basic PowerMonitor active');
      } else {
        this.console.log('⚠️ [UNIFIED-TRACKER] PowerMonitor not available, using backup');
      }
      
      this.console.log('✅ [UNIFIED-TRACKER] Minimal unified input tracking initialized');
      
    } catch (error) {
      this.console.error('❌ [UNIFIED-TRACKER] Initialization failed (non-fatal):', error.message);
      // Critical: Don't throw errors - just log and continue
    }
  }

  /**
   * Set up global debugging functions for input tracking
   */
  setupGlobalDebugFunctions() {
    // Add to global scope for debugging
    this.global.getInputTrackerStats = () => {
      return this.unifiedInputTracker ? this.unifiedInputTracker.getStats() : null;
    };

    this.global.enableInputTrackerDebug = () => {
      if (this.unifiedInputTracker) this.unifiedInputTracker.enableDebugMode();
    };

    this.global.disableInputTrackerDebug = () => {
      if (this.unifiedInputTracker) this.unifiedInputTracker.disableDebugMode();
    };

    this.console.log('🔧 [UNIFIED-TRACKER] Global debug functions set up');
  }

  /**
   * Get input tracking statistics
   */
  getInputTrackingStats() {
    if (this.unifiedInputTracker) {
      return this.unifiedInputTracker.getStats();
    }
    
    return {
      isActive: false,
      powerMonitorAvailable: !!(this.powerMonitor && this.powerMonitor.on),
      error: 'No unified input tracker available'
    };
  }

  /**
   * Enable debug mode for input tracking
   */
  enableDebugMode() {
    if (this.unifiedInputTracker) {
      this.unifiedInputTracker.enableDebugMode();
      this.console.log('🔍 [UNIFIED-TRACKER] Debug mode enabled');
    } else {
      this.console.log('⚠️ [UNIFIED-TRACKER] No tracker available for debug mode');
    }
  }

  /**
   * Disable debug mode for input tracking
   */
  disableDebugMode() {
    if (this.unifiedInputTracker) {
      this.unifiedInputTracker.disableDebugMode();
      this.console.log('🔕 [UNIFIED-TRACKER] Debug mode disabled');
    } else {
      this.console.log('⚠️ [UNIFIED-TRACKER] No tracker available for debug mode');
    }
  }

  /**
   * Check if PowerMonitor is available and functional
   */
  checkPowerMonitorStatus() {
    const status = {
      available: !!(this.powerMonitor && typeof this.powerMonitor.on === 'function'),
      hasUserActivity: !!(this.powerMonitor && this.powerMonitor.on),
      type: typeof this.powerMonitor
    };
    
    this.console.log('🔋 [POWER-MONITOR] Status check:', status);
    return status;
  }

  /**
   * Test PowerMonitor functionality
   */
  testPowerMonitor() {
    try {
      if (this.powerMonitor && this.powerMonitor.on) {
        // Test by adding a temporary listener
        const testListener = () => {
          this.console.log('✅ [POWER-MONITOR] Test event received');
        };
        
        this.powerMonitor.on('user-activity', testListener);
        
        // Remove test listener after short delay
        setTimeout(() => {
          if (this.powerMonitor.removeListener) {
            this.powerMonitor.removeListener('user-activity', testListener);
          }
        }, 1000);
        
        this.console.log('🧪 [POWER-MONITOR] Test listener added (will be removed in 1s)');
        return true;
      } else {
        this.console.log('❌ [POWER-MONITOR] Not available for testing');
        return false;
      }
    } catch (error) {
      this.console.error('❌ [POWER-MONITOR] Test failed:', error.message);
      return false;
    }
  }

  /**
   * Initialize the input tracking manager
   */
  async initialize() {
    try {
      this.initializeUnifiedInputTracking();
      this.setupGlobalDebugFunctions();
      
      console.log('🎯 InputTrackingManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ InputTrackingManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the input tracking manager
   */
  async shutdown() {
    try {
      // Clean up global functions
      if (this.global.getInputTrackerStats) delete this.global.getInputTrackerStats;
      if (this.global.enableInputTrackerDebug) delete this.global.enableInputTrackerDebug;
      if (this.global.disableInputTrackerDebug) delete this.global.disableInputTrackerDebug;
      
      console.log('🎯 InputTrackingManager shutdown complete');
    } catch (error) {
      console.error('❌ InputTrackingManager shutdown failed:', error);
    }
  }
}

module.exports = InputTrackingManager;