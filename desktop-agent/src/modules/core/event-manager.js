/**
 * Event Manager Module
 * Manages system events, signals, and application lifecycle events
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('./cleanup-registry');

class EventManager {
  constructor(electronModules) {
    this.electronModules = electronModules;
    this.eventHandlers = new Map();
    this.isInitialized = false;
    
    // System state
    this.systemSuspended = false;
    this.isQuitting = false;
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'eventManager',
      cleanup: async () => this.cleanup()
    });
  }

  /**
   * Initialize event handlers
   */
  initialize() {
    if (this.isInitialized) {
      console.log('⚠️ [EVENTS] Already initialized');
      return;
    }

    console.log('🎯 [EVENTS] Initializing event manager...');
    
    this.setupAppEvents();
    this.setupWindowEvents();
    this.setupSystemEvents();
    this.setupProcessEvents();
    
    this.isInitialized = true;
    console.log('✅ [EVENTS] Event manager initialized');
  }

  /**
   * Setup application lifecycle events
   */
  setupAppEvents() {
    const { app } = this.electronModules;
    if (!app) return;

    // App ready event
    if (app.isReady()) {
      this.onAppReady();
    } else {
      app.once('ready', () => this.onAppReady());
    }

    // App quit events
    app.on('before-quit', (event) => this.onBeforeQuit(event));
    app.on('will-quit', (event) => this.onWillQuit(event));
    app.on('window-all-closed', () => this.onWindowAllClosed());

    // Close any open URL slice on shutdown to avoid inflated durations (debounced; offline-safe)
    app.on('before-quit', async () => {
      if (global.isInstallingUpdate) return;
      try {
        // Debounce flaps and tag reason in diagnostics
        await new Promise((r) => setTimeout(r, 300));
        try { console.log(JSON.stringify({ category: 'URL', event: 'CLOSE_ONLY', reason: 'shutdown', ts: new Date().toISOString() })); } catch {}
        // Track close reason in telemetry
        if (global.urlCaptureManager?.trackCloseOnly) {
          global.urlCaptureManager.trackCloseOnly('shutdown');
        }
        // Stamping ended_at on the open url_logs slice is GracefulShutdownManager's job
        // (closeOpenUrlLogs). This hook stays telemetry-only so shutdown has one writer.
      } catch {}
    });

    // App activation (macOS)
    app.on('activate', () => this.onActivate());

    // App crash handlers
    app.on('gpu-process-crashed', (event, killed) => this.onGpuProcessCrashed(event, killed));
    app.on('render-process-gone', (event, webContents, details) => this.onRenderProcessGone(event, webContents, details));

    console.log('📱 [EVENTS] App events registered');
  }

  /**
   * Setup window events
   */
  setupWindowEvents() {
    // Window events are typically handled by app-lifecycle-manager
    // This is for additional window-related event handling
    console.log('🪟 [EVENTS] Window events prepared');
  }

  /**
   * Setup system events
   */
  setupSystemEvents() {
    const { powerMonitor } = this.electronModules;
    if (!powerMonitor) return;

    // System suspend/resume events
    powerMonitor.on('suspend', () => this.onSystemSuspend());
    powerMonitor.on('resume', () => this.onSystemResume());
    powerMonitor.on('on-ac', () => this.onPowerConnect());
    powerMonitor.on('on-battery', () => this.onPowerDisconnect());

    // Thermal state events (macOS)
    if (process.platform === 'darwin') {
      powerMonitor.on('thermal-state-change', (state) => this.onThermalStateChange(state));
    }

    // User activity events
    powerMonitor.on('user-did-become-active', () => this.onUserBecameActive());
    powerMonitor.on('user-did-resign-active', () => this.onUserResignedActive());

    console.log('⚡ [EVENTS] System events registered');
  }

  /**
   * Setup process events
   */
  setupProcessEvents() {
    // Uncaught exception handler
    process.on('uncaughtException', (error) => this.onUncaughtException(error));
    
    // Unhandled promise rejection
    process.on('unhandledRejection', (reason, promise) => this.onUnhandledRejection(reason, promise));

    // Process exit signals
    process.on('SIGINT', () => this.onSigInt());
    process.on('SIGTERM', () => this.onSigTerm());

    // Windows-specific events
    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => this.onSigBreak());
    }

    console.log('🔄 [EVENTS] Process events registered');
  }

  /**
   * App ready handler
   */
  onAppReady() {
    console.log('🚀 [EVENTS] App is ready');
    
    // Notify other components
    this.emit('app-ready');
  }

  /**
   * Before quit handler
   * Ensures tracking session is properly closed before app exits
   */
  onBeforeQuit(event) {
    console.log('🛑 [EVENTS] App before quit');

    if (global.isInstallingUpdate) {
      console.log('✅ [EVENTS] Update install - allowing immediate quit');
      global.isQuitting = true;
      return;
    }
    
    // Set global flag so window close handler allows quit
    global.isQuitting = true;
    
    // GUARD: If cleanup already done/in-progress, allow quit to proceed
    // This prevents re-entry when app.quit() is called after async cleanup
    if (this.isQuitting) {
      console.log('✅ [EVENTS] Cleanup already done, allowing quit to proceed');
      return; // Don't preventDefault - let the quit happen
    }
    
    // CRITICAL: Set flag IMMEDIATELY after guard check to prevent re-entry
    this.isQuitting = true;
    
    // Check tracking state from multiple sources for robustness
    const timeLogId =
      global.currentTimeLogId || global.trackingManager?.currentTimeLogId;
    const isTrackingActive =
      global.isTracking || global.trackingManager?.isTracking;
    const stopTrackingFn = global.stopTracking || (global.trackingManager?.stopTracking?.bind(global.trackingManager));
    
    // If tracking is active or an open time log exists, stop it before quitting
    if ((isTrackingActive || timeLogId) && typeof stopTrackingFn === 'function') {
      // Prevent the quit to give time for async cleanup
      event.preventDefault();
      
      console.log('🛑 [EVENTS] Stopping active tracking session before quit...');
      
      // Perform async cleanup then re-trigger quit
      const cleanup = async () => {
        try {
          const gracefulShutdownManager = require('./graceful-shutdown-manager');
          gracefulShutdownManager.captureStopMoment();
          // Await the stop tracking to ensure database is updated
          await stopTrackingFn('quit', 'App quit - session ended automatically');
          console.log('✅ [EVENTS] Tracking session stopped successfully');
        } catch (error) {
          console.error('❌ [EVENTS] Error stopping tracking:', error);
          // Continue with quit even on error
        }
        
        // Emit event for other cleanup handlers
        try {
          this.emit('before-quit');
        } catch (e) {
          console.error('❌ [EVENTS] Error emitting before-quit:', e);
        }
        
        // Small delay to ensure any final writes complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('🏁 [EVENTS] Cleanup complete, re-triggering quit');
        
        // Re-trigger quit - isQuitting is true so guard will allow it through
        this.electronModules.app?.quit();
      };
      
      // Execute cleanup - errors are handled internally
      cleanup().catch(err => {
        console.error('❌ [EVENTS] Fatal cleanup error, forcing quit:', err);
        this.electronModules.app?.quit();
      });
    } else {
      // No active tracking, just emit and proceed
      this.emit('before-quit');
      console.log('✅ [EVENTS] No active tracking, proceeding with quit');
    }
  }

  /**
   * Will quit handler
   */
  onWillQuit(event) {
    console.log('🏁 [EVENTS] App will quit');
    this.emit('will-quit');
  }

  /**
   * Window all closed handler
   */
  onWindowAllClosed() {
    console.log('🪟 [EVENTS] All windows closed');
    
    // On macOS, keep app running even when all windows are closed
    if (process.platform !== 'darwin') {
      this.electronModules.app?.quit();
    }
    
    this.emit('windows-all-closed');
  }

  /**
   * App activate handler (macOS)
   */
  onActivate() {
    console.log('🔄 [EVENTS] App activated');
    this.emit('app-activate');
  }

  /**
   * GPU process crashed handler
   */
  onGpuProcessCrashed(event, killed) {
    console.error('💥 [EVENTS] GPU process crashed, killed:', killed);
    console.log('🔄 [EVENTS] Hardware acceleration disabled to prevent future crashes');
    
    this.emit('gpu-crashed', { killed });
  }

  /**
   * Render process gone handler
   */
  onRenderProcessGone(event, webContents, details) {
    console.error('💥 [EVENTS] Render process gone:', details.reason);
    
    if (details.reason === 'crashed' || details.reason === 'oom') {
      console.log('🔄 [EVENTS] Attempting to reload after crash...');
      
      setTimeout(() => {
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
          global.mainWindow.reload();
        }
      }, 1000);
    }
    
    this.emit('render-process-gone', details);
  }

  /**
   * System suspend handler
   */
  onSystemSuspend() {
    console.log('😴 [EVENTS] System suspended');
    this.systemSuspended = true;
    
    // Pause screenshots and other activities
    if (global.enhancedScreenshotManager) {
      global.enhancedScreenshotManager.pauseScreenshotsOnly();
    }
    
    this.emit('system-suspend');
  }

  /**
   * System resume handler
   * NOTE: Screenshot resume is handled by the consolidated EventHandlerManager resume handler.
   * Do NOT call resumeScreenshotsOnly() here to avoid duplicate/racing resume logic.
   */
  onSystemResume() {
    console.log('👋 [EVENTS] System resumed');
    this.systemSuspended = false;
    
    this.emit('system-resume');
  }

  /**
   * Power connect handler
   */
  onPowerConnect() {
    console.log('🔌 [EVENTS] AC power connected');
    this.emit('power-connect');
  }

  /**
   * Power disconnect handler
   */
  onPowerDisconnect() {
    console.log('🔋 [EVENTS] Running on battery');
    this.emit('power-disconnect');
  }

  /**
   * Thermal state change handler (macOS)
   */
  onThermalStateChange(state) {
    console.log('🌡️ [EVENTS] Thermal state changed:', state);
    
    if (state === 'critical') {
      console.log('⚠️ [EVENTS] Critical thermal state - reducing activity');
      
      // Reduce screenshot frequency during thermal stress
      if (global.enhancedScreenshotManager) {
        global.enhancedScreenshotManager.pauseScreenshotsOnly();
        
        // Resume after thermal event
        setTimeout(() => {
          global.enhancedScreenshotManager.resumeScreenshotsOnly();
        }, 60000); // 1 minute
      }
    }
    
    this.emit('thermal-state-change', state);
  }

  /**
   * User became active handler
   */
  onUserBecameActive() {
    console.log('👤 [EVENTS] User became active');
    
    // Record activity
    if (global.enhancedIdleMonitor) {
      global.enhancedIdleMonitor.recordActivity('system_active');
    }
    
    this.emit('user-active');
  }

  /**
   * User resigned active handler
   */
  onUserResignedActive() {
    console.log('👤 [EVENTS] User resigned active');
    this.emit('user-inactive');
  }

  /**
   * Uncaught exception handler
   */
  onUncaughtException(error) {
    // Rate-limit: prevent error flood from crashing the process
    const now = Date.now();
    if (!this._lastExceptionTime) this._lastExceptionTime = 0;
    if (!this._exceptionCount) this._exceptionCount = 0;
    this._exceptionCount++;
    if (now - this._lastExceptionTime < 100 && this._exceptionCount > 5) {
      // Suppress rapid-fire errors after initial 5
      if (this._exceptionCount === 6) {
        console.warn('⚠️ [EVENTS] Suppressing rapid uncaught exceptions (too many in < 100ms)');
      }
      return;
    }
    if (now - this._lastExceptionTime >= 5000) {
      this._exceptionCount = 1; // Reset counter every 5s
    }
    this._lastExceptionTime = now;

    try {
      const msg = error?.message || String(error || 'Unknown error');
      const stack = error?.stack || '';
      // Use console.log (not .error) to ensure visibility in terminal redirects
      console.log(`💥 [EVENTS] Uncaught exception: ${msg}`);
      if (stack) console.log(`   Stack: ${stack.split('\n').slice(0, 3).join(' | ')}`);
      
      // Silently handle EPIPE errors (broken pipe when terminal disconnects)
      if (msg.includes('EPIPE') || error?.code === 'EPIPE') {
        return;
      }

      // Don't exit on GPU-related errors
      if (msg.includes('GPU') || msg.includes('render') || msg.includes('gpu')) {
        console.log('🔄 [EVENTS] GPU/render error caught, continuing...');
        return;
      }
      
      // For other errors, log and continue
      console.log('🔄 [EVENTS] Continuing despite error...');
      
      try { this.emit('uncaught-exception', error); } catch (_) {}
    } catch (handlerError) {
      // The handler itself failed — just log safely and return
      console.log('💥 [EVENTS] Exception handler crashed:', String(handlerError));
    }
  }

  /**
   * Unhandled rejection handler
   */
  onUnhandledRejection(reason, promise) {
    console.error('💥 [EVENTS] Unhandled promise rejection:', reason);
    this.emit('unhandled-rejection', { reason, promise });
  }

  /**
   * SIGINT handler
   */
  onSigInt() {
    console.log('🛑 [EVENTS] Received SIGINT');
    this.gracefulShutdown('SIGINT');
  }

  /**
   * SIGTERM handler
   */
  onSigTerm() {
    console.log('🛑 [EVENTS] Received SIGTERM');
    this.gracefulShutdown('SIGTERM');
  }

  /**
   * SIGBREAK handler (Windows)
   */
  onSigBreak() {
    console.log('🛑 [EVENTS] Received SIGBREAK');
    this.gracefulShutdown('SIGBREAK');
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown(signal) {
    console.log(`🏁 [EVENTS] Graceful shutdown initiated by ${signal}`);
    
    try {
      // Emit shutdown event
      this.emit('graceful-shutdown', signal);
      
      // Trigger cleanup
      await cleanupRegistry.cleanupAll();
      
      // Exit process
      process.exit(0);
    } catch (error) {
      console.error('❌ [EVENTS] Shutdown error:', error);
      process.exit(1);
    }
  }

  /**
   * Emit custom event
   */
  emit(eventName, data = null) {
    const handlers = this.eventHandlers.get(eventName) || [];
    
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(`❌ [EVENTS] Handler error for ${eventName}:`, error);
      }
    }
  }

  /**
   * Register event handler
   */
  on(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    
    this.eventHandlers.get(eventName).push(handler);
  }

  /**
   * Remove event handler
   */
  off(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get system state
   */
  getSystemState() {
    return {
      systemSuspended: this.systemSuspended,
      isQuitting: this.isQuitting,
      isInitialized: this.isInitialized,
      eventHandlerCount: this.eventHandlers.size
    };
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    console.log('🧹 [EVENTS] Cleaning up event manager...');
    
    // Clear all event handlers
    this.eventHandlers.clear();
    
    this.isInitialized = false;
  }
}

module.exports = EventManager;