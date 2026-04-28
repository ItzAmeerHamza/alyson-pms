/**
 * WINDOW ACTIVITY MANAGEMENT UTILITIES MODULE
 * 
 * Manages window-related activity functions and UI updates for the TimeFlow desktop agent.
 * This includes window ready state, activity rendering, and update intervals.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class WindowActivityManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.Date = dependencies.Date || Date;
    this.Math = dependencies.Math || Math;
    this.setTimeout = dependencies.setTimeout || setTimeout;
    this.setInterval = dependencies.setInterval || setInterval;
    this.clearInterval = dependencies.clearInterval || clearInterval;
    
    // Dependencies
    this.mainWindow = dependencies.mainWindow;
    this.processActivityQueue = dependencies.processActivityQueue;
    this.isTracking = dependencies.isTracking;
    
    // State variables
    this.renderFrameReady = false;
    this.activityQueue = [];
    this.lastActivitySent = 0;
    this.activitySyncInterval = null;
    this.ACTIVITY_UPDATE_THROTTLE = 2000; // Only send updates every 2 seconds
    
    console.log('✅ WindowActivityManager initialized');
  }

  /**
   * Initialize window ready state detection
   */
  initializeWindowReadyState() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    
    this.mainWindow.webContents.once('dom-ready', () => {
      this.console.log('🎯 [IPC] DOM ready detected');
      
      // Wait a bit more for full initialization
      this.setTimeout(() => {
        this.renderFrameReady = true;
        this.console.log('✅ [IPC] Render frame marked as ready');
        
        // Process queued activity updates
        if (this.processActivityQueue) {
          this.processActivityQueue();
        }
      }, 2000);
    });
    
    this.mainWindow.webContents.on('crashed', () => {
      this.console.error('💥 [IPC] Render frame crashed - marking as not ready');
      this.renderFrameReady = false;
      this.activityQueue = []; // Clear queue on crash
    });
    
    this.mainWindow.on('closed', () => {
      this.console.log('🗑️ [IPC] Window closed - marking as not ready');
      this.renderFrameReady = false;
      this.activityQueue = [];
    });

    this.console.log('✅ [WINDOW] Window ready state initialized');
  }

  /**
   * Send activity data to renderer with throttling
   */
  sendActivityToRenderer(activityData) {
    try {
      // Throttle updates to prevent UI freeze
      const now = this.Date.now();
      if (now - this.lastActivitySent < this.ACTIVITY_UPDATE_THROTTLE) {
        return; // Skip this update
      }
      this.lastActivitySent = now;
      
      // Initialize global stats if not already done
      if (!this.global.displayActivityStats) {
        this.global.displayActivityStats = {
          clicks: 0,
          keys: 0,
          moves: 0,
          lastUpdate: this.Date.now()
        };
      }

      // Use provided data or fall back to global stats
      const dataToSend = activityData || {
        mouseClicks: this.global.displayActivityStats.clicks || 0,
        keystrokes: this.global.displayActivityStats.keys || 0,
        mouseMovements: this.global.displayActivityStats.moves || 0,
        totalActivity: (this.global.displayActivityStats.clicks || 0) + 
                       (this.global.displayActivityStats.keys || 0) + 
                       (this.global.displayActivityStats.moves || 0),
        activityPercent: this.Math.min(100, ((this.global.displayActivityStats.clicks || 0) + 
                                            (this.global.displayActivityStats.keys || 0) + 
                                            (this.global.displayActivityStats.moves || 0)) * 10),
        focusPercent: 100,
        lastUpdate: this.Date.now()
      };

      // Only log occasionally to prevent console spam
      if (dataToSend.totalActivity % 30 === 0 || dataToSend.mouseClicks > 0 || dataToSend.keystrokes > 0) {
        this.console.log('📊 [ACTIVITY-UPDATE] C:' + dataToSend.mouseClicks + ' K:' + dataToSend.keystrokes + ' M:' + dataToSend.mouseMovements + ' | Total: ' + dataToSend.totalActivity);
      }
      
      // Safety checks
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        this.console.log('⚠️ [ACTIVITY-DISPLAY] MainWindow not available');
        return false;
      }
      
      if (!this.mainWindow.webContents || this.mainWindow.webContents.isDestroyed()) {
        this.console.log('⚠️ [ACTIVITY-DISPLAY] WebContents not available');
        return false;
      }
      
      // Send to renderer
      this.mainWindow.webContents.send('activity-update', dataToSend);
      this.console.log('✅ [ACTIVITY-DISPLAY] Successfully sent to renderer');
      return true;
      
    } catch (error) {
      this.console.error('❌ [ACTIVITY-DISPLAY] Error sending activity:', error.message);
      return false;
    }
  }

  /**
   * Start regular interval to ensure renderer stays updated
   */
  startActivityUpdateInterval() {
    if (this.activitySyncInterval) {
      this.clearInterval(this.activitySyncInterval);
    }

    this.activitySyncInterval = this.setInterval(() => {
      if (this.isTracking && this.global.displayActivityStats && 
          this.global.displayActivityStats.lastUpdate > this.Date.now() - 30000) {
        this.sendActivityToRenderer();
      }
    }, 5000); // Update every 5 seconds

    this.console.log('✅ [WINDOW] Activity update interval started');
  }

  /**
   * Stop activity update interval
   */
  stopActivityUpdateInterval() {
    if (this.activitySyncInterval) {
      this.clearInterval(this.activitySyncInterval);
      this.activitySyncInterval = null;
      this.console.log('🛑 [WINDOW] Activity update interval stopped');
    }
  }

  /**
   * Get window and activity status
   */
  getWindowActivityStatus() {
    return {
      renderFrameReady: this.renderFrameReady,
      activityQueueLength: this.activityQueue.length,
      lastActivitySent: this.lastActivitySent,
      activitySyncInterval: !!this.activitySyncInterval,
      windowAvailable: !!(this.mainWindow && !this.mainWindow.isDestroyed()),
      webContentsAvailable: !!(this.mainWindow && !this.mainWindow.isDestroyed() && 
                              this.mainWindow.webContents && !this.mainWindow.webContents.isDestroyed())
    };
  }

  /**
   * Clear activity queue
   */
  clearActivityQueue() {
    this.activityQueue = [];
    this.console.log('🧹 [WINDOW] Activity queue cleared');
  }

  /**
   * Add item to activity queue
   */
  addToActivityQueue(item) {
    if (this.activityQueue.length < 100) { // Prevent queue from growing too large
      this.activityQueue.push(item);
    } else {
      this.console.log('⚠️ [WINDOW] Activity queue full, dropping oldest item');
      this.activityQueue.shift();
      this.activityQueue.push(item);
    }
  }

  /**
   * Initialize all window activity management
   */
  initializeAll() {
    this.initializeWindowReadyState();
    this.startActivityUpdateInterval();
    this.console.log('✅ [WINDOW] All window activity management initialized');
  }

  /**
   * Initialize the window activity manager
   */
  async initialize() {
    try {
      this.initializeAll();
      console.log('🪟 WindowActivityManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ WindowActivityManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the window activity manager
   */
  async shutdown() {
    try {
      this.stopActivityUpdateInterval();
      this.clearActivityQueue();
      console.log('🪟 WindowActivityManager shutdown complete');
    } catch (error) {
      console.error('❌ WindowActivityManager shutdown failed:', error);
    }
  }
}

module.exports = WindowActivityManager;