/**
 * CLEANUP REGISTRY
 * Fixes memory leak issues identified in audit
 * Tracks all intervals, listeners, and resources for proper cleanup
 * 
 * AUDIT FINDING: Event listeners not removed, intervals not cleared,
 * screenshots not disposed, windows not destroyed
 */

class CleanupRegistry {
  constructor() {
    this.intervals = new Map(); // id -> description
    this.timeouts = new Map();  // id -> description
    this.listeners = new Map(); // key -> {target, event, handler}
    this.resources = new Set(); // disposable resources
    this.windows = new Set();   // electron windows
    this.screenshots = new Set(); // screenshot buffers
  }

  /**
   * Register an interval for cleanup tracking
   */
  registerInterval(id, description = 'Unknown interval') {
    if (id) {
      this.intervals.set(id, description);
      console.log(`🔄 [CLEANUP] Registered interval: ${description}`);
    }
    return id;
  }

  /**
   * Register a timeout for cleanup tracking
   */
  registerTimeout(id, description = 'Unknown timeout') {
    if (id) {
      this.timeouts.set(id, description);
    }
    return id;
  }

  /**
   * Register an event listener for cleanup tracking
   */
  registerListener(target, event, handler, key = null) {
    const listenerKey = key || `${target.constructor.name}_${event}_${Date.now()}`;
    this.listeners.set(listenerKey, { target, event, handler });
    return listenerKey;
  }

  /**
   * Register a disposable resource
   */
  registerResource(resource) {
    this.resources.add(resource);
  }

  /**
   * Register an Electron window
   */
  registerWindow(window) {
    this.windows.add(window);
  }

  /**
   * Register a screenshot buffer for disposal
   */
  registerScreenshot(buffer) {
    this.screenshots.add(buffer);
  }

  /**
   * Clear a specific interval
   */
  clearInterval(id) {
    if (this.intervals.has(id)) {
      clearInterval(id);
      const desc = this.intervals.get(id);
      this.intervals.delete(id);
      console.log(`🛑 [CLEANUP] Cleared interval: ${desc}`);
    }
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(id) {
    if (this.timeouts.has(id)) {
      clearTimeout(id);
      this.timeouts.delete(id);
    }
  }

  /**
   * Remove a specific listener
   */
  removeListener(key) {
    if (this.listeners.has(key)) {
      const { target, event, handler } = this.listeners.get(key);
      if (target && target.removeListener) {
        target.removeListener(event, handler);
      } else if (target && target.off) {
        target.off(event, handler);
      }
      this.listeners.delete(key);
    }
  }

  /**
   * Dispose of a screenshot buffer
   */
  disposeScreenshot(buffer) {
    if (this.screenshots.has(buffer)) {
      // Clear buffer reference
      buffer = null;
      this.screenshots.delete(buffer);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Clean up all tracked resources
   */
  cleanupAll() {
    console.log('🧹 [CLEANUP] Starting comprehensive cleanup...');

    // Clear all intervals
    this.intervals.forEach((desc, id) => {
      clearInterval(id);
      console.log(`🛑 [CLEANUP] Cleared interval: ${desc}`);
    });
    this.intervals.clear();

    // Clear all timeouts
    this.timeouts.forEach((desc, id) => {
      clearTimeout(id);
    });
    this.timeouts.clear();

    // Remove all event listeners
    this.listeners.forEach(({ target, event, handler }, key) => {
      try {
        if (target && target.removeListener) {
          target.removeListener(event, handler);
        } else if (target && target.off) {
          target.off(event, handler);
        }
      } catch (error) {
        console.error(`❌ [CLEANUP] Failed to remove listener ${key}:`, error.message);
      }
    });
    this.listeners.clear();

    // Dispose all resources
    this.resources.forEach(resource => {
      try {
        if (resource && resource.dispose) {
          resource.dispose();
        }
      } catch (error) {
        console.error('❌ [CLEANUP] Failed to dispose resource:', error.message);
      }
    });
    this.resources.clear();

    // Destroy all windows
    this.windows.forEach(window => {
      try {
        if (window && !window.isDestroyed()) {
          window.destroy();
        }
      } catch (error) {
        console.error('❌ [CLEANUP] Failed to destroy window:', error.message);
      }
    });
    this.windows.clear();

    // Clear screenshot buffers
    this.screenshots.clear();

    // Force garbage collection
    if (global.gc) {
      global.gc();
      console.log('♻️ [CLEANUP] Forced garbage collection');
    }

    console.log('✅ [CLEANUP] Comprehensive cleanup completed');
  }

  /**
   * Emergency cleanup - nuclear option
   */
  emergencyCleanup() {
    console.log('🚨 [CLEANUP] EMERGENCY CLEANUP INITIATED');

    // Clear ALL possible intervals and timeouts (nuclear option)
    for (let i = 1; i < 10000; i++) {
      try {
        clearInterval(i);
        clearTimeout(i);
      } catch (error) {
        // Ignore errors
      }
    }

    // Clear tracked resources
    this.cleanupAll();

    console.log('✅ [CLEANUP] Emergency cleanup completed');
  }

  /**
   * Get cleanup statistics
   */
  getStats() {
    return {
      intervals: this.intervals.size,
      timeouts: this.timeouts.size,
      listeners: this.listeners.size,
      resources: this.resources.size,
      windows: this.windows.size,
      screenshots: this.screenshots.size
    };
  }
}

// Export singleton instance
module.exports = new CleanupRegistry();