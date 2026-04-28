/**
 * MEMORY MANAGER MODULE
 * 
 * Manages memory cleanup, interval management, and resource optimization
 * for the TimeFlow desktop agent.
 * 
 * Part of TimeFlow Desktop Agent Phase 5 refactoring
 */

class MemoryManager {
  constructor(dependencies = {}) {
    this.cleanupRegistry = dependencies.cleanupRegistry;
    this.global = dependencies.global || global;
    
    this.memoryCleanupInterval = null;
    this.memoryMonitorInterval = null;
    this.timerMutex = false;
    
    // Memory thresholds for auto-adjustment
    this.memoryThresholds = {
      warning: 70,    // 70% - Warning level
      critical: 85,   // 85% - Critical level
      emergency: 95   // 95% - Emergency level
    };
    
    // Performance mode adjustment based on memory
    this.performanceModeAdjustments = {
      normal: { interval: 300000, mode: 'normal' },           // 5 minutes
      warning: { interval: 180000, mode: 'memory_saving' },   // 3 minutes
      critical: { interval: 120000, mode: 'ultra_saving' },   // 2 minutes
      emergency: { interval: 60000, mode: 'emergency' }       // 1 minute
    };
    
    console.log('✅ MemoryManager initialized with enhanced monitoring');
  }

  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }
    
    console.log('🔍 [MEMORY] Starting memory monitoring every 3 minutes');
    
    this.memoryMonitorInterval = setInterval(() => {
      try {
        const memoryUsage = this.checkMemoryUsage();
        this.handleMemoryThreshold(memoryUsage);
      } catch (error) {
        console.error('❌ [MEMORY] Error in memory monitoring:', error.message);
      }
    }, 180000); // 3 minutes
    
    // Register with cleanup registry
    if (this.cleanupRegistry) {
      this.cleanupRegistry.registerInterval(this.memoryMonitorInterval, 'Memory Monitoring');
    }
  }
  
  /**
   * Check current memory usage
   */
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const memoryPercentage = (usage.heapUsed / usage.heapTotal) * 100;
    
    const memoryInfo = {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      percentage: Math.round(memoryPercentage * 100) / 100
    };
    
    // Log memory usage every minute (every 2nd check)
    if (Date.now() % 60000 < 30000) {
      console.log('📊 [MEMORY] Current usage:', memoryInfo);
    }
    
    return memoryInfo;
  }
  
  /**
   * Handle memory threshold breaches
   */
  handleMemoryThreshold(memoryInfo) {
    const { percentage } = memoryInfo;
    
    if (percentage >= this.memoryThresholds.emergency) {
      console.log('🚨 [MEMORY] EMERGENCY LEVEL - Triggering immediate cleanup');
      this.triggerEmergencyCleanup();
      this.adjustPerformanceMode('emergency');
    } else if (percentage >= this.memoryThresholds.critical) {
      console.log('⚠️ [MEMORY] CRITICAL LEVEL - Aggressive cleanup needed');
      this.triggerAggressiveCleanup();
      this.adjustPerformanceMode('critical');
    } else if (percentage >= this.memoryThresholds.warning) {
      console.log('⚠️ [MEMORY] WARNING LEVEL - Increased cleanup frequency');
      this.adjustPerformanceMode('warning');
    }
  }
  
  /**
   * Trigger emergency memory cleanup
   */
  triggerEmergencyCleanup() {
    console.log('🚨 [MEMORY] Emergency memory cleanup started');
    
    try {
      // Force immediate garbage collection
      if (this.global.gc) {
        this.global.gc();
        console.log('🗑️ [MEMORY] Emergency garbage collection completed');
      }
      
      // Clear all large objects immediately
      this.clearAllLargeObjects();
      
      // Clear screenshot buffers
      this.clearScreenshotBuffers();
      
      // Clear input buffers
      this.clearInputBuffers();
      
      console.log('✅ [MEMORY] Emergency cleanup completed');
      
    } catch (error) {
      console.error('❌ [MEMORY] Emergency cleanup failed:', error.message);
    }
  }
  
  /**
   * Trigger aggressive memory cleanup
   */
  triggerAggressiveCleanup() {
    console.log('⚠️ [MEMORY] Aggressive memory cleanup started');
    
    try {
      // Clear large data structures
      this.clearAllLargeObjects();
      
      // Clear screenshot buffers
      this.clearScreenshotBuffers();
      
      // Force garbage collection
      if (this.global.gc) {
        this.global.gc();
      }
      
      console.log('✅ [MEMORY] Aggressive cleanup completed');
      
    } catch (error) {
      console.error('❌ [MEMORY] Aggressive cleanup failed:', error.message);
    }
  }
  
  /**
   * Clear all large objects
   * PERFORMANCE FIX: Enhanced cleanup to prevent memory accumulation over long sessions
   */
  clearAllLargeObjects() {
    // Clear global memory-heavy variables
    if (this.global.activityQueue && Array.isArray(this.global.activityQueue)) {
      this.global.activityQueue.length = 0;
    }
    if (this.global.retryAttempts && this.global.retryAttempts.clear) {
      this.global.retryAttempts.clear();
    }
    
    // Clear large data structures
    if (typeof this.global.lastBrowserUrls !== 'undefined' && this.global.lastBrowserUrls?.clear) {
      this.global.lastBrowserUrls.clear();
    }
    if (typeof this.global.lastUrlCapturesByBrowser !== 'undefined' && this.global.lastUrlCapturesByBrowser?.clear) {
      this.global.lastUrlCapturesByBrowser.clear();
    }
    
    // Clear screenshot buffer
    if (this.global.screenshotBuffer) {
      this.global.screenshotBuffer = null;
    }
    
    // PERFORMANCE FIX: Clear additional caches that can accumulate over time
    try {
      // Clear monitoring manager debounce caches
      if (this.global.monitoringManager?._appSaveDebounce?.clear) {
        this.global.monitoringManager._appSaveDebounce.clear();
      }
      if (this.global.monitoringManager?._appAggregate?.clear) {
        this.global.monitoringManager._appAggregate.clear();
      }
      
      // Clear URL capture manager caches
      if (this.global.urlCaptureManager?._urlCache?.clear) {
        this.global.urlCaptureManager._urlCache.clear();
      }
      
      // Clear browser URL manager caches
      if (this.global.browserUrlManager?._lastUrls?.clear) {
        this.global.browserUrlManager._lastUrls.clear();
      }
      
      // Clear throttle caches in logger (if they exist)
      if (this.global.lastLogTime) {
        this.global.lastLogTime = {};
      }
      
      // Trim offline queue if it's getting too large (keep only recent 1000 items per type)
      if (this.global.offlineQueue) {
        const MAX_QUEUE_SIZE = 1000;
        ['urlLogs', 'appLogs', 'screenshots', 'activities'].forEach(type => {
          if (this.global.offlineQueue[type]?.length > MAX_QUEUE_SIZE) {
            const excess = this.global.offlineQueue[type].length - MAX_QUEUE_SIZE;
            this.global.offlineQueue[type].splice(0, excess);
            console.log(`🧹 [MEMORY] Trimmed ${excess} old items from ${type} queue`);
          }
        });
      }
      
      // Clear stale event listeners cache if present
      if (this.global._eventListenerCache?.clear) {
        this.global._eventListenerCache.clear();
      }
    } catch (e) {
      // Silent catch - cleanup shouldn't break the app
    }
    
    console.log('🧹 [MEMORY] Large objects cleared');
  }
  
  /**
   * Clear screenshot buffers
   */
  clearScreenshotBuffers() {
    // Clear any screenshot managers
    if (this.global.screenshotManager && this.global.screenshotManager.inputAnalyzer) {
      this.global.screenshotManager.inputAnalyzer.clearBuffers();
    }
    
    // Clear any stored screenshot buffers
    if (this.global.screenshotBuffer) {
      this.global.screenshotBuffer = null;
    }
    
    console.log('🧹 [MEMORY] Screenshot buffers cleared');
  }
  
  /**
   * Clear input buffers
   */
  clearInputBuffers() {
    // Clear input managers
    if (this.global.globalInputManager) {
      // Clear any input buffers in the manager
      if (this.global.globalInputManager.clearBuffers) {
        this.global.globalInputManager.clearBuffers();
      }
    }
    
    console.log('🧹 [MEMORY] Input buffers cleared');
  }
  
  /**
   * Adjust performance mode based on memory usage
   */
  adjustPerformanceMode(level) {
    const adjustment = this.performanceModeAdjustments[level];
    if (!adjustment) return;
    
    console.log(`🎛️ [MEMORY] Adjusting performance mode to: ${adjustment.mode}`);
    
    // Update cleanup interval
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
      this.memoryCleanupInterval = setInterval(() => {
        this.triggerAggressiveCleanup();
      }, adjustment.interval);
      
      console.log(`⏰ [MEMORY] Cleanup interval adjusted to: ${adjustment.interval / 1000}s`);
    }
  }

  /**
   * Start automatic memory cleanup
   */
  startMemoryCleanup() {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
    }
    
    console.log('🧹 [MEMORY] Starting automatic memory cleanup every 5 minutes');
    
    this.memoryCleanupInterval = setInterval(() => {
      try {
        const beforeMemory = process.memoryUsage();
        console.log('🧹 [MEMORY] Starting periodic cleanup', {
          heapUsed: Math.round(beforeMemory.heapUsed / 1024 / 1024) + 'MB',
          rss: Math.round(beforeMemory.rss / 1024 / 1024) + 'MB'
        });
        
        // Clear global memory-heavy variables
        if (this.global.activityQueue && Array.isArray(this.global.activityQueue)) {
          this.global.activityQueue.length = 0;
        }
        if (this.global.retryAttempts && this.global.retryAttempts.clear) {
          this.global.retryAttempts.clear();
        }
        
        // Clear large data structures
        if (typeof this.global.lastBrowserUrls !== 'undefined' && this.global.lastBrowserUrls?.clear) {
          this.global.lastBrowserUrls.clear();
        }
        if (typeof this.global.lastUrlCapturesByBrowser !== 'undefined' && this.global.lastUrlCapturesByBrowser?.clear) {
          this.global.lastUrlCapturesByBrowser.clear();
        }
        
        // Clear screenshot buffer
        if (this.global.screenshotBuffer) {
          this.global.screenshotBuffer = null;
        }
        
        // Force garbage collection if available
        if (this.global.gc) {
          this.global.gc();
        }
        
        const afterMemory = process.memoryUsage();
        const heapDiff = beforeMemory.heapUsed - afterMemory.heapUsed;
        console.log('✅ [MEMORY] Periodic cleanup completed', {
          heapUsed: Math.round(afterMemory.heapUsed / 1024 / 1024) + 'MB',
          heapFreed: Math.round(heapDiff / 1024 / 1024) + 'MB'
        });
        
      } catch (error) {
        console.error('❌ [MEMORY] Error in periodic cleanup:', error.message);
      }
    }, 300000); // 5 minutes = 300,000ms
    
    // Register with cleanup registry
    if (this.cleanupRegistry) {
      this.cleanupRegistry.registerInterval(this.memoryCleanupInterval, 'Automatic Memory Cleanup');
    }
    
    // Also start memory monitoring
    this.startMemoryMonitoring();
  }

  /**
   * Stop automatic memory cleanup
   */
  stopMemoryCleanup() {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
      this.memoryCleanupInterval = null;
      console.log('🛑 [MEMORY] Automatic memory cleanup stopped');
    }
  }

  /**
   * Clear all intervals and timeouts
   */
  clearAllIntervals() {
    // CRITICAL FIX: Prevent race conditions with mutex
    if (this.timerMutex) {
      console.log('⚠️ Timer operations in progress, deferring cleanup');
      setTimeout(() => this.clearAllIntervals(), 100);
      return;
    }
    
    this.timerMutex = true;
    console.log('🧹 Clearing all intervals and timeouts');
    
    try {
      // Clear known intervals
      const intervalNames = [
        'screenshotInterval',
        'activityInterval', 
        'idleCheckInterval',
        'appCaptureInterval',
        'urlCaptureInterval',
        'settingsInterval',
        'notificationInterval',
        'mouseTrackingInterval',
        'keyboardTrackingInterval',
        'screenTimerUpdateInterval',
        'liveActivityInterval',
        'memoryCleanupInterval',
        'systemHealthInterval',
        'queueProcessingInterval',
        'activeBrowserUrlCheckInterval'
      ];

      intervalNames.forEach(intervalName => {
        if (this.global[intervalName]) {
          if (intervalName.includes('Timeout')) {
            clearTimeout(this.global[intervalName]);
          } else {
            clearInterval(this.global[intervalName]);
          }
          this.global[intervalName] = null;
          console.log(`✅ Cleared ${intervalName}`);
        }
      });
      
      // Nuclear option: clear ALL possible intervals (with safety bounds)
      for (let i = 1; i < 10000; i++) {
        try {
          clearInterval(i);
          clearTimeout(i);
        } catch (e) {
          // Ignore errors - some IDs may not exist
        }
      }
      
      console.log('✅ [CLEANUP] All intervals and timeouts cleared');
      
    } catch (error) {
      console.error('❌ [CLEANUP] Error clearing intervals:', error);
    } finally {
      this.timerMutex = false;
    }
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Initialize the memory manager
   */
  async initialize() {
    try {
      this.startMemoryCleanup();
      console.log('🧹 MemoryManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ MemoryManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the memory manager
   */
  async shutdown() {
    try {
      this.stopMemoryCleanup();
      this.clearAllIntervals();
      console.log('🧹 MemoryManager shutdown complete');
    } catch (error) {
      console.error('❌ MemoryManager shutdown failed:', error);
    }
  }
}

module.exports = MemoryManager;