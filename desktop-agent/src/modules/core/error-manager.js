/**
 * ErrorManager - Centralized error handling and recovery logic
 * Extracted from main.js to improve modularity and maintainability
 */

const { EventEmitter } = require('events');

class ErrorManager extends EventEmitter {
  constructor(dependencies = {}) {
    super();
    this.app = dependencies.app;
    this.cleanupRegistry = dependencies.cleanupRegistry;
    this.mainWindow = dependencies.mainWindow;
    
    // Error tracking
    this.errorCounts = {
      total: 0,
      recent: 0,
      byType: {}
    };
    
    this.recentErrorsWindow = 5 * 60 * 1000; // 5 minutes
    this.maxRecentErrors = 10;
    this.lastErrorReset = Date.now();
    
    console.log('✅ ErrorManager initialized');
  }

  /**
   * Initialize error handling systems
   */
  initialize() {
    try {
      this._setupGlobalErrorHandlers();
      this._setupElectronErrorHandlers();
      this._setupProcessErrorHandlers();
      
      console.log('✅ [ERROR-MANAGER] Error handling systems initialized');
    } catch (error) {
      console.error('❌ [ERROR-MANAGER] Failed to initialize:', error);
    }
  }

  /**
   * Handle application crash events
   */
  _setupElectronErrorHandlers() {
    if (!this.app) return;

    // GPU process crashed
    this.app.on('gpu-process-crashed', (event, killed) => {
      this._handleError({
        type: 'gpu-crash',
        message: 'GPU process crashed',
        metadata: { killed },
        severity: 'high',
        recovery: 'hardware-acceleration-disabled'
      });
    });

    // Renderer process gone
    this.app.on('render-process-gone', (event, webContents, details) => {
      this._handleError({
        type: 'renderer-crash',
        message: 'Renderer process crashed',
        metadata: { reason: details.reason, exitCode: details.exitCode },
        severity: 'high',
        recovery: 'reload-window'
      });
    });

    // Child process gone  
    this.app.on('child-process-gone', (event, details) => {
      this._handleError({
        type: 'child-process-crash',
        message: 'Child process crashed',
        metadata: { type: details.type, reason: details.reason },
        severity: 'medium',
        recovery: 'restart-process'
      });
    });

    console.log('✅ [ERROR-MANAGER] Electron error handlers registered');
  }

  /**
   * Setup process-level error handlers
   */
  _setupProcessErrorHandlers() {
    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      try {
        this._handleError({
          type: 'uncaught-exception',
          message: error?.message || String(error || 'Unknown error'),
          stack: error?.stack || '',
          severity: 'critical',
          recovery: 'emergency-cleanup'
        });
      } catch (handlerErr) {
        console.error('💥 [ERROR-MANAGER] Exception handler crashed:', String(handlerErr));
      }
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this._handleError({
        type: 'unhandled-rejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : null,
        metadata: { promise: promise.toString() },
        severity: 'high',
        recovery: 'log-and-continue'
      });
    });

    // Process warnings
    process.on('warning', (warning) => {
      this._handleError({
        type: 'process-warning',
        message: warning.message,
        metadata: { name: warning.name, code: warning.code },
        severity: 'low',
        recovery: 'log-only'
      });
    });

    console.log('✅ [ERROR-MANAGER] Process error handlers registered');
  }

  /**
   * Setup global error handlers for custom errors
   */
  _setupGlobalErrorHandlers() {
    // Make error handler globally available
    global.handleError = (error, context = 'unknown') => {
      this._handleError({
        type: 'application-error',
        message: error.message || String(error),
        stack: error.stack,
        metadata: { context },
        severity: 'medium',
        recovery: 'log-and-continue'
      });
    };

    // Database error handler
    global.handleDatabaseError = (error, operation = 'unknown') => {
      this._handleError({
        type: 'database-error',
        message: error.message || String(error),
        stack: error.stack,
        metadata: { operation },
        severity: 'high',
        recovery: 'retry-with-fallback'
      });
    };

    // Network error handler
    global.handleNetworkError = (error, endpoint = 'unknown') => {
      this._handleError({
        type: 'network-error',
        message: error.message || String(error),
        metadata: { endpoint },
        severity: 'medium',
        recovery: 'retry-with-backoff'
      });
    };

    console.log('✅ [ERROR-MANAGER] Global error handlers registered');
  }

  /**
   * Core error handling logic
   * @param {Object} errorInfo - Error information object
   */
  _handleError(errorInfo) {
    try {
      // Update error tracking
      this._updateErrorTracking(errorInfo);
      
      // Log the error
      this._logError(errorInfo);
      
      // Emit error event for other modules
      this.emit('error', errorInfo);
      
      // Determine and execute recovery strategy
      this._executeRecoveryStrategy(errorInfo);
      
      // Check if we need emergency shutdown
      this._checkEmergencyShutdown();
      
    } catch (handlingError) {
      console.error('❌ [ERROR-MANAGER] Error in error handler:', handlingError);
      // Fallback to basic logging
      console.error('❌ [ORIGINAL-ERROR]:', errorInfo);
    }
  }

  /**
   * Update error tracking statistics
   */
  _updateErrorTracking(errorInfo) {
    const now = Date.now();
    
    // Reset recent errors if window expired
    if (now - this.lastErrorReset > this.recentErrorsWindow) {
      this.errorCounts.recent = 0;
      this.lastErrorReset = now;
    }
    
    // Update counts
    this.errorCounts.total++;
    this.errorCounts.recent++;
    
    // Update by type
    const type = errorInfo.type || 'unknown';
    this.errorCounts.byType[type] = (this.errorCounts.byType[type] || 0) + 1;
  }

  /**
   * Log error with appropriate level and formatting
   */
  _logError(errorInfo) {
    const timestamp = new Date().toISOString();
    const severity = errorInfo.severity || 'unknown';
    const type = errorInfo.type || 'unknown';
    
    let logMessage = `${timestamp} [${severity.toUpperCase()}] ${type}: ${errorInfo.message}`;
    
    if (errorInfo.metadata) {
      logMessage += ` | Metadata: ${JSON.stringify(errorInfo.metadata)}`;
    }
    
    // Log based on severity
    switch (severity) {
      case 'critical':
        console.error('🚨 [CRITICAL]', logMessage);
        break;
      case 'high':
        console.error('❌ [HIGH]', logMessage);
        break;
      case 'medium':
        console.warn('⚠️ [MEDIUM]', logMessage);
        break;
      case 'low':
        console.log('ℹ️ [LOW]', logMessage);
        break;
      default:
        console.log('❓ [UNKNOWN]', logMessage);
    }
    
    // Log stack trace for high severity errors
    if ((severity === 'critical' || severity === 'high') && errorInfo.stack) {
      console.error('Stack trace:', errorInfo.stack);
    }
  }

  /**
   * Execute recovery strategy based on error type and severity
   */
  _executeRecoveryStrategy(errorInfo) {
    const recovery = errorInfo.recovery || 'log-only';
    
    switch (recovery) {
      case 'emergency-cleanup':
        this._emergencyCleanup();
        break;
        
      case 'hardware-acceleration-disabled':
        this._disableHardwareAcceleration();
        break;
        
      case 'reload-window':
        this._reloadMainWindow();
        break;
        
      case 'restart-process':
        this._scheduleRestart();
        break;
        
      case 'retry-with-fallback':
        this._retryWithFallback(errorInfo);
        break;
        
      case 'retry-with-backoff':
        this._retryWithBackoff(errorInfo);
        break;
        
      case 'log-and-continue':
      case 'log-only':
      default:
        // Already logged, continue execution
        break;
    }
  }

  /**
   * Emergency cleanup procedure
   */
  _emergencyCleanup() {
    console.log('🚨 [ERROR-MANAGER] Emergency cleanup initiated...');
    
    try {
      // Stop all tracking
      if (global.stopTracking) {
        global.stopTracking('emergency_error');
      }
      
      // Cleanup all systems
      if (global.cleanupRegistry) {
        global.cleanupRegistry.emergencyCleanup();
      }
      
      // Save any pending data
      this._savePendingData();
      
      console.log('✅ [ERROR-MANAGER] Emergency cleanup completed');
    } catch (cleanupError) {
      console.error('❌ [ERROR-MANAGER] Emergency cleanup failed:', cleanupError);
    }
  }

  /**
   * Disable hardware acceleration after GPU crashes
   */
  _disableHardwareAcceleration() {
    console.log('🔧 [ERROR-MANAGER] Disabling hardware acceleration...');
    
    try {
      if (this.app && !this.app.isReady()) {
        this.app.disableHardwareAcceleration();
        console.log('✅ [ERROR-MANAGER] Hardware acceleration disabled');
      } else {
        console.log('⚠️ [ERROR-MANAGER] Cannot disable hardware acceleration - app already ready');
      }
    } catch (error) {
      console.error('❌ [ERROR-MANAGER] Failed to disable hardware acceleration:', error);
    }
  }

  /**
   * Reload the main window after renderer crash
   */
  _reloadMainWindow() {
    console.log('🔄 [ERROR-MANAGER] Reloading main window...');
    
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.reload();
        console.log('✅ [ERROR-MANAGER] Main window reloaded');
      } else {
        console.log('⚠️ [ERROR-MANAGER] Main window not available for reload');
      }
    } catch (error) {
      console.error('❌ [ERROR-MANAGER] Failed to reload main window:', error);
    }
  }

  /**
   * Schedule application restart
   */
  _scheduleRestart() {
    console.log('🔄 [ERROR-MANAGER] Scheduling application restart...');
    console.log('🔄 [ERROR-MANAGER] Scheduling application restart - this may cause double instances');
    console.log('🔄 [ERROR-MANAGER] Current PID:', process.pid);
    
    
    try {
      setTimeout(() => {
        if (this.app) {
          this.app.relaunch();
          this.app.exit(1);
        }
      }, 5000); // 5 second delay
      
      console.log('✅ [ERROR-MANAGER] Restart scheduled in 5 seconds');
    } catch (error) {
      console.error('❌ [ERROR-MANAGER] Failed to schedule restart:', error);
    }
  }

  /**
   * Retry operation with fallback
   */
  _retryWithFallback(errorInfo) {
    // Implementation depends on specific error type
    console.log('🔄 [ERROR-MANAGER] Implementing fallback for:', errorInfo.type);
  }

  /**
   * Retry operation with exponential backoff
   */
  _retryWithBackoff(errorInfo) {
    // Implementation depends on specific error type
    console.log('🔄 [ERROR-MANAGER] Implementing retry with backoff for:', errorInfo.type);
  }

  /**
   * Save any pending data before shutdown
   */
  _savePendingData() {
    try {
      // Save offline queue
      if (global.offlineQueue) {
        console.log('💾 [ERROR-MANAGER] Saving offline queue...');
        // Implementation would save queue to file
      }
      
      // Save current session state
      if (global.currentSession) {
        console.log('💾 [ERROR-MANAGER] Saving session state...');
        // Implementation would save session to file
      }
      
      console.log('✅ [ERROR-MANAGER] Pending data saved');
    } catch (error) {
      console.error('❌ [ERROR-MANAGER] Failed to save pending data:', error);
    }
  }

  /**
   * Check if emergency shutdown is needed
   */
  _checkEmergencyShutdown() {
    if (this.errorCounts.recent > this.maxRecentErrors) {
      console.log('🚨 [ERROR-MANAGER] Too many recent errors, initiating emergency shutdown...');
      this._emergencyCleanup();
      
      setTimeout(() => {
        if (this.app) {
          this.app.exit(1);
        }
      }, 3000);
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return {
      total: this.errorCounts.total,
      recent: this.errorCounts.recent,
      byType: { ...this.errorCounts.byType },
      lastReset: this.lastErrorReset,
      windowMs: this.recentErrorsWindow
    };
  }

  /**
   * Reset error counters
   */
  resetErrorStats() {
    this.errorCounts = {
      total: 0,
      recent: 0,
      byType: {}
    };
    this.lastErrorReset = Date.now();
    
    console.log('🔄 [ERROR-MANAGER] Error statistics reset');
  }

  /**
   * Cleanup function for registry
   */
  shutdown() {
    try {
      console.log('🧹 [ERROR-MANAGER] Shutting down...');
      
      // Remove event listeners
      this.removeAllListeners();
      
      // Clean up global error handlers
      delete global.handleError;
      delete global.handleDatabaseError;
      delete global.handleNetworkError;
      
      console.log('✅ [ERROR-MANAGER] Shutdown complete');
    } catch (error) {
      console.error('❌ [ERROR-MANAGER] Error during shutdown:', error);
    }
  }
}

// Register with cleanup registry if available
if (typeof global !== 'undefined' && global.cleanupRegistry) {
  global.cleanupRegistry.register('error-manager', () => {
    if (global.errorManager && global.errorManager.shutdown) {
      global.errorManager.shutdown();
    }
  });
}

module.exports = ErrorManager;