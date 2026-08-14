/**
 * APP INITIALIZATION MANAGER MODULE
 * 
 * Centralizes app initialization, component setup, and interval management
 * for the TimeFlow desktop agent.
 * 
 * Part of TimeFlow Desktop Agent Phase 6 refactoring
 */

class AppInitializationManager {
  constructor(dependencies = {}) {
    this.systemPreferences = dependencies.systemPreferences;
    this.screen = dependencies.screen;
    this.config = dependencies.config;
    this.loadSystemState = dependencies.loadSystemState;
    this.loadOfflineQueue = dependencies.loadOfflineQueue;
    this.getCurrentMousePosition = dependencies.getCurrentMousePosition;
    this.getSystemIdleTime = dependencies.getSystemIdleTime;
    this.lastMousePos = dependencies.lastMousePos || { x: 0, y: 0 };
    
    // Initialize managers
    this.intervalManager = null;
    this.warningManager = null;
    this.useOptimizedIntervals = dependencies.useOptimizedIntervals || false;
    
    console.log('✅ AppInitializationManager initialized');
  }

  /**
   * Initialize all application components
   */
  initializeComponents() {
    // ARCHITECTURAL FIX: SyncManager will be initialized when tracking starts
    console.log('💤 [STARTUP] SyncManager will initialize when tracking starts');
    
    // Use optimized interval manager if enabled
    if (this.useOptimizedIntervals) {
      console.log('🚀 Using Optimized Interval Manager');
      
      // Import interval manager classes
      const OptimizedIntervalManager = require('../../optimized-interval-manager');
      this.intervalManager = new OptimizedIntervalManager();
      
      // Set performance mode on interval manager (get current mode from intervals config)
      try {
        const intervalConfig = require('../../../config/intervals');
        const currentMode = intervalConfig.getCurrentMode();
        this.intervalManager.setPerformanceMode(currentMode);
        console.log(`🎛️ [MAIN] Set interval manager performance mode to: ${currentMode}`);
      } catch (error) {
        console.log('⚠️ [MAIN] Could not set performance mode on interval manager:', error.message);
        this.intervalManager.setPerformanceMode('ultra_performance'); // Default to ultra performance to prevent slowdowns
      }
      
      this.setupOptimizedIntervals();
      
      // ENHANCED INPUT DETECTION WITH IMMEDIATE DISPLAY UPDATES
      // Commented setupRealOSInputDetection removed - functionality moved to consolidated modules

      // Initialize real OS-level input detection (no fake activity)
      // DISABLED: Old RealOSInputDetection replaced with CrossPlatformInputDetector
      console.log('🚫 [DISABLED] Old RealOSInputDetection disabled - using CrossPlatformInputDetector only');

    } else {
      const IntervalManager = require('../utils/interval-manager');
      this.intervalManager = new IntervalManager();
    }
    
    // Initialize warning manager
    const WarningManager = require('../ui/warning-manager');
    this.warningManager = new WarningManager(this.config);
    
    console.log('📱 Alyson PM Agent initialized');
    
    // Load saved system state and offline queue on startup
    this.loadSystemState();
    this.loadOfflineQueue();
    
    // Check for permission requirements without blocking
    if (process.platform === 'darwin') {
      setTimeout(() => {
        const currentPermission = this.systemPreferences.getMediaAccessStatus('screen');
        
        if (currentPermission === 'granted') {
          console.log('✅ Screen Recording permission: Granted');
        } else {
          console.log('⚠️ Screen Recording permission: Not granted - App and URL capture will be limited');
          console.log('💡 To enable full features, the app will prompt for permissions when starting tracking');
        }
      }, 1000);
    }
    
    return {
      intervalManager: this.intervalManager,
      warningManager: this.warningManager
    };
  }

  /**
   * Helper function for browser info extraction
   */
  getBrowserInfo(activeWindowInfo) {
    try {
      if (!activeWindowInfo) return null;
      
      const browserApps = ['Safari', 'Chrome', 'Firefox', 'Edge', 'Brave'];
      const appName = activeWindowInfo.owner?.name || '';
      
      if (browserApps.includes(appName)) {
        return {
          isBrowser: true,
          app: appName,
          url: null // URL extraction would require additional logic
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Setup optimized intervals for activity tracking
   */
  setupOptimizedIntervals() {
    if (!this.intervalManager) {
      console.error('❌ Cannot setup optimized intervals: intervalManager not initialized');
      return;
    }

    // Position-only polling is not real input — OS monitors handle clicks/keys/moves.
    this.intervalManager.register('MOUSE_TRACKING', () => {
      try {
        if (this.screen && typeof this.screen.getCursorScreenPoint === 'function') {
          const currentPos = this.screen.getCursorScreenPoint();
          if (currentPos) {
            this.lastMousePos.x = currentPos.x;
            this.lastMousePos.y = currentPos.y;
          }
        }
      } catch (error) {
        console.error('❌ Mouse tracking error:', error.message);
      }
    });

    // Register keyboard tracking
    this.intervalManager.register('KEYBOARD_TRACKING', () => {
      // Keyboard tracking logic would go here
      // This is typically handled by the input detection modules
    });

    // Register app and URL monitoring
    const USE_LEGACY_GLOBAL_CAPTURE = false; // Feature flag to prevent duplicate capture paths

    this.intervalManager.register('APP_URL_MONITORING', () => {
      try {
        // Prefer consolidated managers. Legacy global capture disabled by default to avoid duplicate logs
        if (USE_LEGACY_GLOBAL_CAPTURE && global.captureActiveApplication && typeof global.captureActiveApplication === 'function') {
          global.captureActiveApplication();
        }
      } catch (error) {
        console.error('❌ App/URL monitoring error:', error.message);
      }
    });

    console.log('✅ Optimized intervals setup completed');
  }

  /**
   * Start all intervals
   */
  startIntervals() {
    if (this.intervalManager && typeof this.intervalManager.start === 'function') {
      this.intervalManager.start();
      console.log('🚀 All intervals started');
    }
  }

  /**
   * Stop all intervals
   */
  stopIntervals() {
    if (this.intervalManager && typeof this.intervalManager.stop === 'function') {
      this.intervalManager.stop();
      console.log('🛑 All intervals stopped');
    }
  }

  /**
   * Initialize the app initialization manager
   */
  async initialize() {
    try {
      const managers = this.initializeComponents();
      console.log('🏗️ AppInitializationManager initialized successfully');
      return managers;
    } catch (error) {
      console.error('❌ AppInitializationManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the app initialization manager
   */
  async shutdown() {
    try {
      this.stopIntervals();
      console.log('🏗️ AppInitializationManager shutdown complete');
    } catch (error) {
      console.error('❌ AppInitializationManager shutdown failed:', error);
    }
  }
}

module.exports = AppInitializationManager;