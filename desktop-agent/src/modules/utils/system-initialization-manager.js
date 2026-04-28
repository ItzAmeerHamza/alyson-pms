/**
 * SYSTEM INITIALIZATION MANAGER MODULE
 * 
 * Manages system initialization, memory audit, and crash handling for the TimeFlow desktop agent.
 * This includes memory audit variables, crash handlers, and system mocks.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class SystemInitializationManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.setTimeout = dependencies.setTimeout || setTimeout;
    this.process = dependencies.process || process;
    
    // Electron dependencies
    this.app = dependencies.app;
    this.mainWindow = dependencies.mainWindow;
    this.cleanupRegistry = dependencies.cleanupRegistry;
    
    console.log('✅ SystemInitializationManager initialized');
  }

  /**
   * Expose memory audit variables for monitoring
   */
  exposeMemoryAuditVariables() {
    try {
      // Make cleanup registry globally accessible
      this.global.cleanupRegistry = this.cleanupRegistry;
      
      // Expose key interval variables for monitoring
      this.global.memoryAuditExports = {
        // Interval references
        get liveActivityInterval() { return typeof this.global.liveActivityInterval !== 'undefined' ? this.global.liveActivityInterval : null; },
        get screenshotTimerInterval() { return typeof this.global.screenshotTimerInterval !== 'undefined' ? this.global.screenshotTimerInterval : null; },
        get idleCheckInterval() { return typeof this.global.idleCheckInterval !== 'undefined' ? this.global.idleCheckInterval : null; },
        get notificationInterval() { return typeof this.global.notificationInterval !== 'undefined' ? this.global.notificationInterval : null; },
        get consolidatedIPCInterval() { return typeof this.global.consolidatedIPCInterval !== 'undefined' ? this.global.consolidatedIPCInterval : null; },
        get memoryCleanupInterval() { return typeof this.global.memoryCleanupInterval !== 'undefined' ? this.global.memoryCleanupInterval : null; },
        get activeBrowserUrlCheckInterval() { return typeof this.global.activeBrowserUrlCheckInterval !== 'undefined' ? this.global.activeBrowserUrlCheckInterval : null; },
        
        // Data structures that could grow
        get lastBrowserUrls() { return typeof this.global.lastBrowserUrls !== 'undefined' ? this.global.lastBrowserUrls : null; },
        get lastUrlCapturesByBrowser() { return typeof this.global.lastUrlCapturesByBrowser !== 'undefined' ? this.global.lastUrlCapturesByBrowser : null; },
        get retryAttempts() { return typeof this.global.retryAttempts !== 'undefined' ? this.global.retryAttempts : null; },
        get activityQueue() { return typeof this.global.activityQueue !== 'undefined' ? this.global.activityQueue : []; },
        get batchedIPCData() { return typeof this.global.batchedIPCData !== 'undefined' ? this.global.batchedIPCData : null; },
        
        // Tracking state
        get isTracking() { return this.global.isTracking; },
        get isPaused() { return this.global.isPaused; },
        get currentSession() { return this.global.currentSession; },
        
        // Activity stats
        get activityStats() { return typeof this.global.activityStats !== 'undefined' ? this.global.activityStats : {}; }
      };
      
      this.console.log('🧠 [MEMORY-AUDIT] Variables exposed for monitoring');
    } catch (error) {
      this.console.error('❌ [MEMORY-AUDIT] Failed to expose variables:', error.message);
    }
  }

  /**
   * Set up application crash handlers
   */
  setupCrashHandlers() {
    if (!this.app) {
      this.console.log('⚠️ App not available - skipping crash handler setup');
      return;
    }

    // GPU process crash handler
    this.app.on('gpu-process-crashed', (event, killed) => {
      this.console.error('💥 [GPU] GPU process crashed, killed:', killed);
      this.console.log('🔄 [GPU] Hardware acceleration disabled, should prevent future crashes');
    });

    // Render process crash handler
    this.app.on('render-process-gone', (event, webContents, details) => {
      this.console.error('💥 [RENDERER] Render process gone:', details.reason);
      
      if (details.reason === 'crashed' || details.reason === 'oom') {
        this.console.log('🔄 [RENDERER] Attempting to reload after crash...');
        
        this.setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.reload();
          }
        }, 1000);
      }
    });

    // Uncaught exception handler
    this.process.on('uncaughtException', (error) => {
      try {
        const msg = error?.message || String(error || 'Unknown error');
        this.console.error(`💥 [PROCESS] Uncaught exception: ${msg}`);
        
        // Silently handle EPIPE errors (broken pipe when terminal disconnects)
        if (msg.includes('EPIPE') || error?.code === 'EPIPE') {
          return;
        }

        // Don't exit on GPU-related errors
        if (msg.includes('GPU') || msg.includes('render') || msg.includes('gpu')) {
          this.console.log('🔄 [PROCESS] GPU/render error caught, continuing...');
          return;
        }
        
        // For other errors, log and continue
        this.console.log('🔄 [PROCESS] Continuing despite error...');
      } catch (handlerErr) {
        this.console.error('💥 [PROCESS] Exception handler crashed:', String(handlerErr));
      }
    });

    this.console.log('✅ [CRASH-HANDLERS] Application crash handlers set up');
  }

  /**
   * Create Node.js mock objects for Electron APIs
   */
  createNodeMocks() {
    this.console.log('🔧 Running in Node.js mode - Electron features disabled');
    
    return {
      app: null,
      BrowserWindow: null,
      powerMonitor: {
        on: () => {},
        getSystemIdleTime: () => 0
      },
      screen: null,
      ipcMain: {
        on: () => {},
        handle: () => {}
      },
      Notification: null,
      Tray: null,
      Menu: null,
      desktopCapturer: null,
      systemPreferences: null,
      globalShortcut: null
    };
  }

  /**
   * Initialize delayed memory audit variable exposure
   */
  initializeDelayedMemoryAudit() {
    // Expose variables after a short delay to ensure all modules are loaded
    this.setTimeout(() => {
      this.exposeMemoryAuditVariables();
    }, 3000);
  }

  /**
   * Check if running in Electron environment
   */
  isElectronEnvironment() {
    try {
      return !!this.app && typeof this.app.getVersion === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Perform complete system initialization
   */
  performSystemInitialization() {
    if (this.isElectronEnvironment()) {
      this.console.log('🔧 [INIT] Setting up Electron environment');
      this.setupCrashHandlers();
      this.initializeDelayedMemoryAudit();
    } else {
      this.console.log('🔧 [INIT] Setting up Node.js mock environment');
      const mocks = this.createNodeMocks();
      
      // Apply mocks to global if needed
      Object.keys(mocks).forEach(key => {
        if (this.global[key] === undefined) {
          this.global[key] = mocks[key];
        }
      });
    }
  }

  /**
   * Get memory audit status
   */
  getMemoryAuditStatus() {
    return {
      hasCleanupRegistry: !!this.global.cleanupRegistry,
      hasMemoryAuditExports: !!this.global.memoryAuditExports,
      exportedVariables: this.global.memoryAuditExports ? Object.keys(this.global.memoryAuditExports) : [],
      environment: this.isElectronEnvironment() ? 'electron' : 'node'
    };
  }

  /**
   * Initialize the system initialization manager
   */
  async initialize() {
    try {
      this.performSystemInitialization();
      console.log('🔧 SystemInitializationManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ SystemInitializationManager initialization failed:', error);
      throw error;
    }
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