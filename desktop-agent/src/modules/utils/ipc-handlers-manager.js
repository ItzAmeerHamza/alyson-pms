/**
 * IPC HANDLERS MANAGER MODULE
 * 
 * Manages IPC handlers for various application functions in the TimeFlow desktop agent.
 * This includes tracking controls, settings, queue status, and fraud detection handlers.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class IPCHandlersManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.Date = dependencies.Date || Date;
    this.fs = dependencies.fs || require('fs');
    
    // Dependencies
    this.ipcMain = dependencies.ipcMain;
    this.resumeTracking = dependencies.resumeTracking;
    this.stopTracking = dependencies.stopTracking;
    this.appSettings = dependencies.appSettings;
    this.antiCheatDetector = dependencies.antiCheatDetector;
    this.AntiCheatDetector = dependencies.AntiCheatDetector;
    this.syncManager = dependencies.syncManager;
    this.config = dependencies.config;
    this.configPath = dependencies.configPath;
    this.offlineQueue = dependencies.offlineQueue;
    this.captureScreenshot = dependencies.captureScreenshot;
    this.forceUpdater = dependencies.forceUpdater;
    
    console.log('✅ IPCHandlersManager initialized');
  }

  /**
   * Register tracking control handlers
   */
  registerTrackingControlHandlers() {
    if (!this.ipcMain) {
      this.console.log('⚠️ IpcMain not available for tracking control handlers');
      return;
    }

    // Handler moved to modules/ipc-handlers.js to avoid duplication
    // this.ipcMain.handle('confirm-resume-after-idle', async (event, confirmed) => {
    //   if (confirmed) {
    //     await this.resumeTracking();
    //     return { success: true, message: 'Tracking resumed after idle period' };
    //   } else {
    //     await this.stopTracking();
    //     return { success: true, message: 'Tracking stopped' };
    //   }
    // });

    // Handler moved to modules/ipc-handlers.js to avoid duplication
    // this.ipcMain.handle('confirm-resume-after-sleep', async (event, confirmed) => {
    //   if (confirmed) {
    //     await this.resumeTracking();
    //     return { success: true, message: 'Tracking resumed after sleep' };
    //   } else {
    //     await this.stopTracking();
    //     return { success: true, message: 'Tracking stopped' };
    //   }
    // });

    this.console.log('✅ [IPC] Tracking control handlers registered');
  }

  /**
   * Register settings handlers
   */
  registerSettingsHandlers() {
    if (!this.ipcMain) {
      this.console.log('⚠️ IpcMain not available for settings handlers');
      return;
    }

    // Handler moved to modules/ipc-handlers.js to avoid duplication
    // this.ipcMain.handle('get-app-settings', () => {
    //   return this.appSettings;
    // });

    // Handler moved to modules/ipc-handlers.js to avoid duplication
    // this.ipcMain.handle('update-app-settings', (event, newSettings) => {
    //   this.appSettings = { ...this.appSettings, ...newSettings };
    //   
    //   // Restart anti-cheat detector with new settings
    //   if (this.antiCheatDetector && this.appSettings.enable_anti_cheat && this.AntiCheatDetector) {
    //     this.antiCheatDetector.stopMonitoring();
    //     this.antiCheatDetector = new this.AntiCheatDetector(this.appSettings, this.syncManager);
    //     this.antiCheatDetector.startMonitoring();
    //   }
    //   
    //   // Save to config file
    //   if (this.config && this.configPath) {
    //     const configToSave = { ...this.config, ...newSettings };
    //     this.fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
    //   }
    //   
    //   return { success: true, message: 'Settings updated' };
    // });

    this.console.log('✅ [IPC] Settings handlers registered');
  }

  /**
   * Register queue status and testing handlers
   */
  registerQueueAndTestingHandlers() {
    if (!this.ipcMain) {
      this.console.log('⚠️ IpcMain not available for queue and testing handlers');
      return;
    }

    // Handler moved to modules/ipc-handlers.js to avoid duplication
    // this.ipcMain.handle('get-queue-status', () => {
    //   return {
    //     screenshots: this.offlineQueue?.screenshots?.length || 0,
    //     appLogs: this.offlineQueue?.appLogs?.length || 0,
    //     urlLogs: this.offlineQueue?.urlLogs?.length || 0,
    //     idleLogs: this.offlineQueue?.idleLogs?.length || 0,
    //     timeLogs: this.offlineQueue?.timeLogs?.length || 0,
    //     fraudAlerts: this.offlineQueue?.fraudAlerts?.length || 0
    //   };
    // });

    // Handler moved to modules/ipc-handlers.js to avoid duplication
    // this.ipcMain.handle('force-screenshot', async () => {
    //   if (this.captureScreenshot) {
    //     await this.captureScreenshot(true); // Mark as test screenshot
    //   }
    //   return { success: true, message: 'Screenshot captured manually (test mode - not saved to database)' };
    // });

    // Handler moved to modules/ipc-handlers.js to avoid duplication
    // this.ipcMain.handle('simulate-activity', async () => {
    //   try {
    //     this.console.log('🚫 [DEBUG] Activity simulation DISABLED - using real input detection only');
    //     
    //     return {
    //       success: false,
    //       message: 'Activity simulation disabled - system tracks real user input only',
    //       timestamp: new this.Date().toISOString()
    //     };
    //   } catch (error) {
    //     this.console.error('❌ [DEBUG] Activity simulation error:', error);
    //     return {
    //       success: false,
    //       error: error.message
    //     };
    //   }
    // });

    this.console.log('✅ [IPC] Queue and testing handlers registered');
  }

  /**
   * Register fraud detection handlers
   */
  registerFraudDetectionHandlers() {
    if (!this.ipcMain) {
      this.console.log('⚠️ IpcMain not available for fraud detection handlers');
      return;
    }

    // Handler moved to modules/ipc-handlers.js to avoid duplication
    // this.ipcMain.handle('report-suspicious-activity', (event, activityData) => {
    //   if (this.antiCheatDetector) {
    //     this.antiCheatDetector.recordActivity('manual_report', activityData);
    //     return { success: true, message: 'Suspicious activity reported' };
    //   }
    //   return { error: 'Anti-cheat detector not available' };
    // });

    // Handler moved to modules/ipc-handlers.js to avoid duplication
    // this.ipcMain.handle('get-fraud-alerts', () => {
    //   return this.offlineQueue?.fraudAlerts?.slice(-20) || []; // Return last 20 alerts
    // });

    this.console.log('✅ [IPC] Fraud detection handlers registered');
  }

  /**
   * Register auto-update handlers
   */
  registerAutoUpdateHandlers() {
    if (!this.ipcMain) {
      this.console.log('⚠️ IpcMain not available for auto-update handlers');
      return;
    }

    this.ipcMain.handle('manual-update-check', async () => {
      if (!this.forceUpdater) {
        return { available: false, reason: 'not_available' };
      }
      return await this.forceUpdater.manualUpdateCheck();
    });

    this.ipcMain.handle('get-update-status', () => {
      if (!this.forceUpdater) {
        return { 
          updateRequired: false, 
          backgroundUpdateAvailable: false, 
          isTimerRunning: false, 
          pendingUpdate: null 
        };
      }
      return this.forceUpdater.getUpdateStatus();
    });

    this.console.log('✅ [IPC] Auto-update handlers registered');
  }

  /**
   * Register all IPC handlers
   */
  registerAllHandlers() {
    this.console.log('🔧 [IPC] Registering all IPC handlers...');
    
    this.registerTrackingControlHandlers();
    this.registerSettingsHandlers();
    this.registerQueueAndTestingHandlers();
    this.registerFraudDetectionHandlers();
    this.registerAutoUpdateHandlers();
    
    this.console.log('✅ [IPC] All IPC handlers registered');
  }

  /**
   * Get IPC handler status
   */
  getHandlerStatus() {
    return {
      ipcMainAvailable: !!this.ipcMain,
      resumeTrackingAvailable: !!this.resumeTracking,
      stopTrackingAvailable: !!this.stopTracking,
      antiCheatDetectorAvailable: !!this.antiCheatDetector,
      forceUpdaterAvailable: !!this.forceUpdater,
      configPathAvailable: !!this.configPath
    };
  }

  /**
   * Initialize the IPC handlers manager
   */
  async initialize() {
    try {
      this.registerAllHandlers();
      console.log('📡 IPCHandlersManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ IPCHandlersManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the IPC handlers manager
   */
  async shutdown() {
    try {
      console.log('📡 IPCHandlersManager shutdown complete');
    } catch (error) {
      console.error('❌ IPCHandlersManager shutdown failed:', error);
    }
  }
}

module.exports = IPCHandlersManager;