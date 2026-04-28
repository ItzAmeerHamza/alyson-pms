/**
 * App Detection IPC Module
 * 
 * Standardized IPC communication for app detection
 * Implements the unified contract specified in the prompt
 */

const EventEmitter = require('events');

class AppDetectionIPC extends EventEmitter {
  constructor(ipcMain, appDetectionService, permissionManager) {
    super();
    
    this.ipcMain = ipcMain;
    this.appDetectionService = appDetectionService;
    this.permissionManager = permissionManager;
    
    this.isRegistered = false;
    this.lastStatus = 'idle';
    
    this._registerHandlers();
    this._setupServiceListeners();
  }

  /**
   * Register IPC handlers for app detection
   */
  _registerHandlers() {
    if (this.isRegistered) return;
    
    // Renderer → Main: Start app detection
    this.ipcMain.handle('appDetection:start', async (event) => {
      try {
        console.log('📱 [APP-IPC] Start request received');
        
        if (this.appDetectionService) {
          this.appDetectionService.start();
          return { success: true, status: 'starting' };
        } else {
          throw new Error('App detection service not available');
        }
      } catch (error) {
        console.error('❌ [APP-IPC] Start failed:', error.message);
        return { success: false, error: error.message };
      }
    });

    // Renderer → Main: Stop app detection
    this.ipcMain.handle('appDetection:stop', async (event) => {
      try {
        console.log('📱 [APP-IPC] Stop request received');
        
        if (this.appDetectionService) {
          this.appDetectionService.stop();
          return { success: true, status: 'stopped' };
        } else {
          throw new Error('App detection service not available');
        }
      } catch (error) {
        console.error('❌ [APP-IPC] Stop failed:', error.message);
        return { success: false, error: error.message };
      }
    });

    // Renderer → Main: Get current status
    this.ipcMain.handle('appDetection:getStatus', async (event) => {
      try {
        if (this.appDetectionService) {
          return this.appDetectionService.getStatus();
        } else {
          return { status: 'unavailable', error: 'Service not initialized' };
        }
      } catch (error) {
        console.error('❌ [APP-IPC] Status query failed:', error.message);
        return { status: 'error', error: error.message };
      }
    });

    // Renderer → Main: Check permissions
    this.ipcMain.handle('appDetection:checkPermissions', async (event) => {
      try {
        if (process.platform === 'darwin' && this.permissionManager) {
          const permissions = await this.permissionManager.checkMacOSPermissions();
          return { success: true, permissions };
        } else {
          return { success: true, permissions: { all: true } };
        }
      } catch (error) {
        console.error('❌ [APP-IPC] Permission check failed:', error.message);
        return { success: false, error: error.message };
      }
    });

    // Renderer → Main: Handle permission action
    this.ipcMain.handle('appDetection:permissionAction', async (event, action) => {
      try {
        if (this.permissionManager) {
          await this.permissionManager.handlePermissionAction(action);
          return { success: true };
        } else {
          return { success: false, error: 'Permission manager not available' };
        }
      } catch (error) {
        console.error('❌ [APP-IPC] Permission action failed:', error.message);
        return { success: false, error: error.message };
      }
    });

    // Renderer → Main: Get current app manually
    this.ipcMain.handle('appDetection:getCurrentApp', async (event) => {
      try {
        if (this.appDetectionService) {
          const status = this.appDetectionService.getStatus();
          return { success: true, app: status.currentApp };
        } else {
          return { success: false, error: 'Service not available' };
        }
      } catch (error) {
        console.error('❌ [APP-IPC] Get current app failed:', error.message);
        return { success: false, error: error.message };
      }
    });

    this.isRegistered = true;
    console.log('✅ [APP-IPC] Handlers registered');
  }

  /**
   * Setup listeners for service events
   */
  _setupServiceListeners() {
    if (!this.appDetectionService) {
      console.warn('⚠️ [APP-IPC] App detection service not available for listeners');
      return;
    }

    // Listen for app detection events
    this.appDetectionService.on('appDetection:event', (payload) => {
      // Filter placeholder/desktop noise before broadcasting
      const title = String(payload.windowTitle || '').trim();
      const name = String(payload.appName || '').trim();
      const isPlaceholder = (
        name.toLowerCase() === 'windows desktop' ||
        title.toLowerCase() === 'no active application detected' ||
        title === ''
      );

      if (!isPlaceholder) {
        this._broadcastToRenderer('appDetection:event', payload);
        
        // Also emit legacy 'app-detected' for backward compatibility
        this._broadcastToRenderer('app-detected', {
          name: payload.appName,
          title: payload.windowTitle,
          timestamp: new Date(payload.ts).toISOString(),
          type: payload.type,
          bundleId: payload.bundleId,
          source: payload.source,
          seq: payload.seq
        });
      } else {
        try { console.log('🧹 [APP-IPC] Placeholder app detection suppressed:', { name, title }); } catch {}
      }
    });

    // Listen for status changes
    this.appDetectionService.on('status', (statusData) => {
      this.lastStatus = statusData.status;
      this._broadcastToRenderer('appDetection:status', statusData);
      
      console.log(`📱 [APP-IPC] Status changed: ${statusData.status}`);
    });

    // Setup permission manager listeners if available
    if (this.permissionManager) {
      this.permissionManager.on('permissions:guidance', (guidance) => {
        this._broadcastToRenderer('appDetection:permissionGuidance', guidance);
      });

      this.permissionManager.on('permissions:instructions', (instructions) => {
        this._broadcastToRenderer('appDetection:permissionInstructions', instructions);
      });

      this.permissionManager.on('permissions:granted', () => {
        this._broadcastToRenderer('appDetection:permissionsGranted', { timestamp: Date.now() });
      });

      this.permissionManager.on('permissions:revoked', () => {
        this._broadcastToRenderer('appDetection:permissionsRevoked', { timestamp: Date.now() });
      });
    }

    console.log('✅ [APP-IPC] Service listeners setup');
  }

  /**
   * Broadcast message to all renderer processes
   */
  _broadcastToRenderer(channel, data) {
    try {
      // Send to main window
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send(channel, data);
      }

      // Send to any other windows if they exist
      const { BrowserWindow } = require('electron');
      const allWindows = BrowserWindow.getAllWindows();
      
      allWindows.forEach(window => {
        if (window !== global.mainWindow && !window.isDestroyed()) {
          window.webContents.send(channel, data);
        }
      });

      console.log(`📡 [APP-IPC] Broadcasted ${channel}:`, data);
    } catch (error) {
      console.error(`❌ [APP-IPC] Broadcast failed for ${channel}:`, error.message);
    }
  }

  /**
   * Get current IPC status
   */
  getStatus() {
    return {
      isRegistered: this.isRegistered,
      lastStatus: this.lastStatus,
      hasService: !!this.appDetectionService,
      hasPermissionManager: !!this.permissionManager
    };
  }

  /**
   * Send status update manually (for testing)
   */
  sendStatusUpdate() {
    if (this.appDetectionService) {
      const status = this.appDetectionService.getStatus();
      this._broadcastToRenderer('appDetection:status', {
        status: status.status,
        isTracking: status.isTracking,
        currentApp: status.currentApp,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Clean up IPC handlers
   */
  cleanup() {
    if (this.isRegistered) {
      // Note: ipcMain.removeHandler is not available in all Electron versions
      // In newer versions, you would do:
      // this.ipcMain.removeHandler('appDetection:start');
      // this.ipcMain.removeHandler('appDetection:stop');
      // etc.
      
      console.log('🧹 [APP-IPC] Cleanup requested (handlers may persist)');
    }
  }
}

module.exports = AppDetectionIPC;
