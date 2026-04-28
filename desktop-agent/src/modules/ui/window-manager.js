/**
 * WindowManager - Centralized window creation and management
 * Extracted from main.js to improve modularity and maintainability
 */

const path = require('path');
const { EventEmitter } = require('events');

class WindowManager extends EventEmitter {
  constructor(electronModules, dependencies = {}) {
    super();
    this.electronModules = electronModules;
    this.app = electronModules.app;
    this.BrowserWindow = electronModules.BrowserWindow;
    
    this.systemMonitor = dependencies.systemMonitor;
    this.cleanupRegistry = dependencies.cleanupRegistry;
    
    // Window instances
    this.mainWindow = null;
    this.debugWindow = null;
    
    // Event debouncing
    this.EVENT_DEBOUNCE_MS = 200;
    this.lastEventTime = 0;
    this.eventDebounceTimeouts = new Map();
    
    console.log('✅ WindowManager initialized');
  }

  /**
   * Initialize the window manager
   */
  initialize(deps = {}) {
    this.config = deps.config;
    this.isTracking = deps.isTracking;
    this.isPaused = deps.isPaused;
    this.currentTimeLogId = deps.currentTimeLogId;
    this.showTrayNotification = deps.showTrayNotification;
    this.safeSendToRenderer = deps.safeSendToRenderer;
    
    console.log('✅ [WINDOW-MANAGER] Initialized with dependencies');
  }

  /**
   * Create main application window
   */
  createWindow() {
    if (this.mainWindow) {
      this.mainWindow.focus();
      return this.mainWindow;
    }

    console.log('🪟 [WINDOW-MANAGER] Creating main window...');

    this.mainWindow = new this.BrowserWindow({
      width: 1000,
      height: 700,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        spellcheck: false
      },
      icon: global.__ebdaaIconPath || path.join(__dirname, '../../../assets/icon.png'),
      title: 'Alyson Time Doctor',
      resizable: true,
      show: true,
      minWidth: 800,
      minHeight: 600,
      center: true,
      alwaysOnTop: false
    });

    this.mainWindow.setMenuBarVisibility(false);
    this.mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      if (process.platform === 'darwin') {
        this.app.focus();
      }
      
      // Register main window with system monitor
      if (this.systemMonitor) {
        this.systemMonitor.registerMainWindow(this.mainWindow);
      }
      
      console.log('✅ [WINDOW-MANAGER] Alyson Time Doctor Agent ready and visible');
      this.emit('main-window-ready', this.mainWindow);
    });

    // Force show the window after a short delay
    setTimeout(() => {
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
        console.log('🔄 [WINDOW-MANAGER] Window forced to show');
      }
    }, 2000);

    // Handle window events
    this.mainWindow.on('minimize', () => {
      this.mainWindow.hide();
      if (this.showTrayNotification) {
        this.showTrayNotification('Alyson Time Doctor continues tracking in background');
      }
      console.log('📱 [WINDOW-MANAGER] Window minimized and hidden - use tray or dock icon to restore');
      this.emit('window-minimized');
    });

    this.mainWindow.on('close', (event) => {
      // If app is already quitting, allow the close
      if (global.isQuitting) {
        console.log('🛑 [WINDOW-MANAGER] App is quitting - allowing window close');
        return;
      }
      
      // FIX v1.0.136: On Windows/Linux, pressing X should quit the app entirely
      if (process.platform !== 'darwin') {
        console.log('🛑 [WINDOW-MANAGER] Window X pressed on Windows - triggering app quit');
        global.isQuitting = true;
        const { app } = require('electron');
        app.quit();
        return;
      }
      
      // macOS: hide to tray instead of quitting (standard behavior)
      event.preventDefault();
      this.mainWindow.hide();
      if (this.showTrayNotification) {
        this.showTrayNotification('Alyson Time Doctor continues running in background');
      }
      console.log('📱 [WINDOW-MANAGER] Window hidden - use tray or dock icon to restore');
      this.emit('window-hidden', this.isTracking ? 'tracking-active' : 'tracking-inactive');
    });

    // Make globally available
    global.mainWindow = this.mainWindow;

    return this.mainWindow;
  }

  /**
   * Create debug console window
   */
  createDebugWindow() {
    if (this.debugWindow) {
      this.debugWindow.focus();
      return this.debugWindow;
    }

    console.log('🔬 [WINDOW-MANAGER] Creating debug window...');

    this.debugWindow = new this.BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        spellcheck: false
      },
      icon: global.__ebdaaIconPath || path.join(__dirname, '../../../assets/icon.png'),
      title: '🔬 Alyson Time Doctor Debug Console',
      resizable: true,
      show: false,
      minWidth: 1000,
      minHeight: 700
    });

    this.debugWindow.setMenuBarVisibility(false);
    this.debugWindow.loadFile(path.join(__dirname, '../../debug-window.html'));

    this.debugWindow.once('ready-to-show', () => {
      this.debugWindow.show();
      try {
        console.log('🔬 [WINDOW-MANAGER] Debug window opened');
        
        // Register debug window with system monitor
        if (this.systemMonitor) {
          this.systemMonitor.registerDebugWindow(this.debugWindow);
          
          // Update system monitor with current tracking state
          this.systemMonitor.updateTrackingState({
            isTracking: this.isTracking,
            isPaused: this.isPaused,
            currentTimeLogId: this.currentTimeLogId,
            currentProjectId: this.config?.project_id
          });
        }
        
        this.emit('debug-window-ready', this.debugWindow);
        
      } catch (err) {
        // Ignore EPIPE errors from console.log
        console.warn('⚠️ [WINDOW-MANAGER] Debug window setup warning:', err.message);
      }
    });

    this.debugWindow.on('closed', () => {
      this.debugWindow = null;
      console.log('🔬 [WINDOW-MANAGER] Debug window closed');
      this.emit('debug-window-closed');
    });

    return this.debugWindow;
  }

  /**
   * Show main window
   */
  showMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
      if (process.platform === 'darwin') {
        this.app.focus();
      }
      console.log('👁️ [WINDOW-MANAGER] Main window shown and focused');
      this.emit('window-shown');
      return true;
    }
    console.warn('⚠️ [WINDOW-MANAGER] No main window to show');
    return false;
  }

  /**
   * Hide main window
   */
  hideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
      console.log('👁️ [WINDOW-MANAGER] Main window hidden');
      this.emit('window-hidden', 'manual');
      return true;
    }
    return false;
  }

  /**
   * Performance optimized event handling with debouncing
   */
  debounceEvent(eventName, handler, delay = null) {
    const actualDelay = delay || this.EVENT_DEBOUNCE_MS;
    
    return (...args) => {
      const now = Date.now();
      
      // Clear any existing timeout for this event
      if (this.eventDebounceTimeouts.has(eventName)) {
        clearTimeout(this.eventDebounceTimeouts.get(eventName));
      }
      
      // Only execute if enough time has passed OR this is the first event
      if (now - this.lastEventTime > actualDelay) {
        this.lastEventTime = now;
        handler.apply(this, args);
      } else {
        // Schedule execution for later
        const timeoutId = setTimeout(() => {
          this.lastEventTime = Date.now();
          handler.apply(this, args);
          this.eventDebounceTimeouts.delete(eventName);
        }, actualDelay);
        this.eventDebounceTimeouts.set(eventName, timeoutId);
      }
    };
  }

  /**
   * Send data to main window renderer
   */
  sendToMainWindow(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send(channel, data);
        return true;
      } catch (error) {
        console.error(`❌ [WINDOW-MANAGER] Failed to send to main window:`, error.message);
        return false;
      }
    }
    return false;
  }

  /**
   * Send data to debug window renderer
   */
  sendToDebugWindow(channel, data) {
    if (this.debugWindow && !this.debugWindow.isDestroyed()) {
      try {
        this.debugWindow.webContents.send(channel, data);
        return true;
      } catch (error) {
        console.error(`❌ [WINDOW-MANAGER] Failed to send to debug window:`, error.message);
        return false;
      }
    }
    return false;
  }

  /**
   * Navigate main window to specific route
   */
  navigateToRoute(route) {
    if (this.safeSendToRenderer) {
      return this.safeSendToRenderer('navigate-to-route', { route });
    }
    return this.sendToMainWindow('navigate-to-route', { route });
  }

  /**
   * Get window state information
   */
  getWindowState() {
    return {
      mainWindow: {
        exists: !!this.mainWindow,
        visible: this.mainWindow ? this.mainWindow.isVisible() : false,
        minimized: this.mainWindow ? this.mainWindow.isMinimized() : false,
        focused: this.mainWindow ? this.mainWindow.isFocused() : false
      },
      debugWindow: {
        exists: !!this.debugWindow,
        visible: this.debugWindow ? this.debugWindow.isVisible() : false,
        focused: this.debugWindow ? this.debugWindow.isFocused() : false
      }
    };
  }

  /**
   * Update tracking state for window behavior
   */
  updateTrackingState(state) {
    this.isTracking = state.isTracking;
    this.isPaused = state.isPaused;
    this.currentTimeLogId = state.currentTimeLogId;
    
    console.log('🔄 [WINDOW-MANAGER] Tracking state updated:', {
      isTracking: this.isTracking,
      isPaused: this.isPaused
    });
  }

  /**
   * Cleanup function for registry
   */
  shutdown() {
    try {
      console.log('🧹 [WINDOW-MANAGER] Shutting down...');
      
      // Clear all debounce timeouts
      this.eventDebounceTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
      this.eventDebounceTimeouts.clear();
      
      // Close windows if they exist
      if (this.debugWindow && !this.debugWindow.isDestroyed()) {
        this.debugWindow.close();
      }
      
      // Don't force close main window - let app lifecycle handle it
      
      this.removeAllListeners();
      
      console.log('✅ [WINDOW-MANAGER] Shutdown complete');
    } catch (error) {
      console.error('❌ [WINDOW-MANAGER] Error during shutdown:', error);
    }
  }
}

// Register with cleanup registry if available
if (typeof global !== 'undefined' && global.cleanupRegistry) {
  global.cleanupRegistry.register('window-manager', () => {
    if (global.windowManager && global.windowManager.shutdown) {
      global.windowManager.shutdown();
    }
  });
}

module.exports = WindowManager;