/**
 * ActivityProcessor - Centralized activity data processing and IPC management
 * Extracted from main.js to improve modularity and maintainability
 */

const { EventEmitter } = require('events');

class ActivityProcessor extends EventEmitter {
  constructor(config, dependencies = {}) {
    super();
    this.config = config;
    this.cleanupRegistry = dependencies.cleanupRegistry;
    
    // Activity queue for IPC safety
    this.activityQueue = [];
    this.retryAttempts = new Map();
    this.MAX_RETRY_ATTEMPTS = 3;
    
    // Batched IPC data
    this.batchedIPCData = {
      activity: null,
      timer: null,
      screenshot: null,
      sync: null,
      apps: null,
      memory: null,
      lastUpdate: 0
    };
    
    // IPC intervals
    this.activitySyncInterval = null;
    this.consolidatedIPCInterval = null;
    
    // State tracking
    this.renderFrameReady = false;
    this.mainWindow = null;
    
    console.log('✅ ActivityProcessor initialized');
  }

  /**
   * Initialize the activity processor
   */
  initialize(deps = {}) {
    this.mainWindow = deps.mainWindow;
    this.renderFrameReady = deps.renderFrameReady || false;
    
    // Make global functions available
    global.processActivityQueue = () => this.processActivityQueue();
    global.sendActivityToRendererSafe = (data, allowQueue) => this.sendActivityToRendererSafe(data, allowQueue);
    global.logActivityData = (data, context) => this.logActivityData(data, context);
    
    console.log('✅ [ACTIVITY-PROCESSOR] Initialized with dependencies');
  }

  /**
   * Process queued activity updates when render frame is ready
   */
  processActivityQueue() {
    if (!this.renderFrameReady || !this.mainWindow || this.mainWindow.isDestroyed()) {
      console.log('⚠️ [ACTIVITY-PROCESSOR] Cannot process queue - render frame not ready');
      return;
    }
    
    console.log(`🔄 [ACTIVITY-PROCESSOR] Processing ${this.activityQueue.length} queued activity updates`);
    
    while (this.activityQueue.length > 0) {
      const activityData = this.activityQueue.shift();
      this.sendActivityToRendererSafe(activityData, false); // Don't re-queue
    }
  }

  /**
   * Enhanced activity logging for debugging
   */
  logActivityData(activityData, context = '') {
    console.log(`📊 [ACTIVITY-PROCESSOR] ${context}: `, {
      data: activityData,
      displayStats: typeof global.displayActivityStats !== 'undefined' ? global.displayActivityStats : 'undefined',
      isDataValid: activityData && typeof activityData === 'object' && !Array.isArray(activityData)
    });
  }

  /**
   * Ultra-safe activity sender with comprehensive safety checks and retry logic
   */
  sendActivityToRendererSafe(activityData, allowQueue = true) {
    const dataKey = JSON.stringify(activityData);
    
    try {
      // Safety check 1: Window exists and not destroyed
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        console.log('⚠️ [ACTIVITY-PROCESSOR] MainWindow not available for activity update');
        if (allowQueue) {
          this.activityQueue.push(activityData);
          console.log(`📦 [ACTIVITY-PROCESSOR] Queued activity data (queue size: ${this.activityQueue.length})`);
        }
        return false;
      }
      
      // Safety check 2: WebContents exists and not destroyed
      if (!this.mainWindow.webContents || this.mainWindow.webContents.isDestroyed()) {
        console.log('⚠️ [ACTIVITY-PROCESSOR] WebContents not available for activity update');
        if (allowQueue) {
          this.activityQueue.push(activityData);
        }
        return false;
      }
      
      // Safety check 3: Render frame ready state
      if (!this.renderFrameReady) {
        console.log('⚠️ [ACTIVITY-PROCESSOR] Render frame not ready - queuing activity data');
        if (allowQueue) {
          this.activityQueue.push(activityData);
        }
        return false;
      }
      
      // Safety check 4: Window is loading or has no URL
      if (this.mainWindow.webContents.isLoading() || !this.mainWindow.webContents.getURL()) {
        console.log('⚠️ [ACTIVITY-PROCESSOR] Window still loading - queuing activity data');
        if (allowQueue) {
          this.activityQueue.push(activityData);
        }
        return false;
      }
      
      // Enhanced send with retry logic
      const attemptCount = this.retryAttempts.get(dataKey) || 0;
      
      if (attemptCount >= this.MAX_RETRY_ATTEMPTS) {
        console.log(`❌ [ACTIVITY-PROCESSOR] Max retry attempts reached for activity data: ${dataKey.substring(0, 50)}...`);
        this.retryAttempts.delete(dataKey);
        return false;
      }
      
      // Try to send
      this.mainWindow.webContents.send('activity-update', activityData);
      console.log('✅ [ACTIVITY-PROCESSOR] Activity data sent successfully');
      
      // Clear retry count on success
      this.retryAttempts.delete(dataKey);
      return true;
      
    } catch (error) {
      console.error(`❌ [ACTIVITY-PROCESSOR] Send failed (attempt ${attemptCount + 1}): ${error.message}`);
      
      // Increment retry count
      this.retryAttempts.set(dataKey, attemptCount + 1);
      
      // Retry after delay if allowed
      if (allowQueue && attemptCount < this.MAX_RETRY_ATTEMPTS) {
        setTimeout(() => {
          console.log(`🔄 [ACTIVITY-PROCESSOR] Retrying activity send (attempt ${attemptCount + 2})`);
          this.sendActivityToRendererSafe(activityData, false);
        }, 1000 * (attemptCount + 1)); // Exponential backoff
      }
      
      return false;
    }
  }

  /**
   * Safe send to renderer for any channel
   */
  safeSendToRenderer(channel, data) {
    if (global.enhancedSyncManager?.safeSendToRenderer) {
      return global.enhancedSyncManager.safeSendToRenderer(channel, data);
    }
    
    // Fallback implementation
    try {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        console.log(`⚠️ [ACTIVITY-PROCESSOR] Cannot send to ${channel} - window not available`);
        return false;
      }
      
      this.mainWindow.webContents.send(channel, data);
      return true;
    } catch (error) {
      console.error(`❌ [ACTIVITY-PROCESSOR] Failed to send to ${channel}:`, error.message);
      return false;
    }
  }

  /**
   * Start activity sync to ensure UI stays updated
   */
  startActivitySync() {
    if (global.enhancedSyncManager?.startActivitySync) {
      return global.enhancedSyncManager.startActivitySync();
    }
    
    // Fallback implementation
    if (this.activitySyncInterval) {
      clearInterval(this.activitySyncInterval);
    }
    
    this.activitySyncInterval = setInterval(() => {
      this.processActivityQueue();
    }, 5000); // Process queue every 5 seconds
    
    if (this.cleanupRegistry) {
      this.cleanupRegistry.registerInterval(this.activitySyncInterval, 'Activity Sync');
    }
    
    console.log('✅ [ACTIVITY-PROCESSOR] Activity sync started');
    return true;
  }

  /**
   * Stop activity sync
   */
  stopActivitySync() {
    if (global.enhancedSyncManager?.stopActivitySync) {
      return global.enhancedSyncManager.stopActivitySync();
    }
    
    // Fallback implementation
    if (this.activitySyncInterval) {
      clearInterval(this.activitySyncInterval);
      this.activitySyncInterval = null;
      console.log('🛑 [ACTIVITY-PROCESSOR] Activity sync stopped');
    }
    
    return true;
  }

  /**
   * Start consolidated IPC system for performance optimization
   */
  startConsolidatedIPC() {
    if (global.enhancedSyncManager?.startConsolidatedIPC) {
      return global.enhancedSyncManager.startConsolidatedIPC();
    }
    
    // Fallback implementation
    if (this.consolidatedIPCInterval) {
      clearInterval(this.consolidatedIPCInterval);
    }
    
    this.consolidatedIPCInterval = setInterval(() => {
      this._sendConsolidatedUpdate();
    }, 2000); // Send consolidated updates every 2 seconds
    
    if (this.cleanupRegistry) {
      this.cleanupRegistry.registerInterval(this.consolidatedIPCInterval, 'Consolidated IPC');
    }
    
    console.log('✅ [ACTIVITY-PROCESSOR] Consolidated IPC started');
    return true;
  }

  /**
   * Stop consolidated IPC system
   */
  stopConsolidatedIPC() {
    if (global.enhancedSyncManager?.stopConsolidatedIPC) {
      return global.enhancedSyncManager.stopConsolidatedIPC();
    }
    
    // Fallback implementation
    if (this.consolidatedIPCInterval) {
      clearInterval(this.consolidatedIPCInterval);
      this.consolidatedIPCInterval = null;
      console.log('🛑 [ACTIVITY-PROCESSOR] Consolidated IPC stopped');
    }
    
    return true;
  }

  /**
   * Send consolidated update with batched data
   */
  _sendConsolidatedUpdate() {
    try {
      const now = Date.now();
      
      // Only send if we have new data
      if (now - this.batchedIPCData.lastUpdate < 1000) {
        return; // Don't send too frequently
      }
      
      const consolidatedData = {
        timestamp: now,
        activity: this.batchedIPCData.activity,
        timer: this.batchedIPCData.timer,
        screenshot: this.batchedIPCData.screenshot,
        sync: this.batchedIPCData.sync,
        apps: this.batchedIPCData.apps,
        memory: this.batchedIPCData.memory
      };
      
      if (this.safeSendToRenderer('consolidated-update', consolidatedData)) {
        this.batchedIPCData.lastUpdate = now;
      }
      
    } catch (error) {
      console.error('❌ [ACTIVITY-PROCESSOR] Error sending consolidated update:', error);
    }
  }

  /**
   * Batch activity update for consolidated IPC
   */
  batchActivityUpdate(activityData) {
    this.batchedIPCData.activity = activityData;
  }

  /**
   * Batch timer update for consolidated IPC
   */
  batchTimerUpdate(timerData) {
    this.batchedIPCData.timer = timerData;
  }

  /**
   * Batch screenshot update for consolidated IPC
   */
  batchScreenshotUpdate(screenshotData) {
    this.batchedIPCData.screenshot = screenshotData;
  }

  /**
   * Batch sync update for consolidated IPC
   */
  batchSyncUpdate(syncData) {
    this.batchedIPCData.sync = syncData;
  }

  /**
   * Batch app update for consolidated IPC
   */
  batchAppUpdate(appData) {
    this.batchedIPCData.apps = appData;
  }

  /**
   * Get default activity data template
   */
  getDefaultActivityData() {
    return {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      screenshotsCaptured: 0,
      lastActivity: new Date().toISOString(),
      riskScore: 0
    };
  }

  /**
   * Get default timer data template
   */
  getDefaultTimerData() {
    return {
      isTracking: false,
      isPaused: false,
      sessionStartTime: null,
      nextScreenshotTime: null
    };
  }

  /**
   * Get default screenshot data template
   */
  getDefaultScreenshotData() {
    return {
      lastScreenshotTime: null,
      screenshotsCaptured: 0,
      nextScreenshotTime: null
    };
  }

  /**
   * Update render frame ready state
   */
  setRenderFrameReady(ready) {
    this.renderFrameReady = ready;
    console.log(`🖼️ [ACTIVITY-PROCESSOR] Render frame ready: ${ready}`);
    
    if (ready) {
      // Process any queued activities
      setTimeout(() => this.processActivityQueue(), 100);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      queueSize: this.activityQueue.length,
      retryAttempts: this.retryAttempts.size,
      renderFrameReady: this.renderFrameReady,
      syncActive: !!this.activitySyncInterval,
      consolidatedIPCActive: !!this.consolidatedIPCInterval
    };
  }

  /**
   * Cleanup function for registry
   */
  shutdown() {
    try {
      console.log('🧹 [ACTIVITY-PROCESSOR] Shutting down...');
      
      this.stopActivitySync();
      this.stopConsolidatedIPC();
      
      // Clear all queues and maps
      this.activityQueue.length = 0;
      this.retryAttempts.clear();
      
      // Remove global functions
      delete global.processActivityQueue;
      delete global.sendActivityToRendererSafe;
      delete global.logActivityData;
      
      this.removeAllListeners();
      
      console.log('✅ [ACTIVITY-PROCESSOR] Shutdown complete');
    } catch (error) {
      console.error('❌ [ACTIVITY-PROCESSOR] Error during shutdown:', error);
    }
  }
}

// Register with cleanup registry if available
if (typeof global !== 'undefined' && global.cleanupRegistry) {
  global.cleanupRegistry.register('activity-processor', () => {
    if (global.activityProcessor && global.activityProcessor.shutdown) {
      global.activityProcessor.shutdown();
    }
  });
}

module.exports = ActivityProcessor;