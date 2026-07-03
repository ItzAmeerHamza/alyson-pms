/**
 * Window & UI Manager Module
 * Handles main window creation, tray menu, and window event listeners
 * Extracted from main.js for modular architecture
 */

const { BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const cleanupRegistry = require('./cleanup-registry');

class WindowUIManager {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.deps = dependencies;
    this.mainWindow = null;
    this.tray = null;
    this.windowListeners = [];
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'windowUIManager',
      cleanup: async () => this.shutdown()
    });
  }

  initialize() {
    console.log('🪟 [WINDOW-UI-MANAGER] Initialized');
  }

  // === MAIN WINDOW CREATION ===
  
  async createMainWindow() {
    if (this.mainWindow) {
      console.log('🪟 [WINDOW] Main window already exists');
      return this.mainWindow;
    }
    
    console.log('🪟 [WINDOW] Creating main window...');
    
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../preload.js')
      },
      icon: path.join(__dirname, '../../../assets/icon.png'),
      show: false,
      titleBarStyle: 'default',
      title: 'Alyson Time Doctor',
      backgroundColor: '#ffffff'
    });

    // Load the renderer
    const rendererPath = path.join(__dirname, '../../../renderer/index.html');
    await this.mainWindow.loadFile(rendererPath);
    
    // Setup window event listeners
    this.setupWindowListeners();
    
    // Show window when ready (force show to ensure visibility)
    this.mainWindow.once('ready-to-show', () => {
      console.log('🪟 [WINDOW] Main window ready to show');
      try {
        if (!this.mainWindow.isVisible()) {
          this.mainWindow.show();
        }
        this.mainWindow.focus();
      } catch (e) {
        console.log('⚠️ [WINDOW] Failed to show/focus on ready-to-show:', e?.message || e);
      }
    });
    
    cleanupRegistry.registerResource({
      name: 'mainWindow',
      cleanup: async () => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.close();
        }
      }
    });
    
    console.log('✅ [WINDOW] Main window created');
    return this.mainWindow;
  }

  // === TRAY MENU CREATION ===
  
  createTrayMenu() {
    if (this.tray) {
      console.log('🔧 [TRAY] Tray already exists');
      return this.tray;
    }
    
    console.log('🔧 [TRAY] Creating tray menu...');
    
    // Use template icon for macOS to support light/dark mode
    const isMac = process.platform === 'darwin';
    const iconName = isMac ? 'tray-iconTemplate.png' : 'tray-icon.png';
    const trayIconPath = path.join(__dirname, '../../../assets', iconName);
    
    try {
      // On macOS, use nativeImage to explicitly mark as template
      if (isMac) {
        const { nativeImage } = require('electron');
        const icon = nativeImage.createFromPath(trayIconPath);
        if (!icon || icon.isEmpty()) {
          console.error('❌ [TRAY] Failed to load template icon from:', trayIconPath);
          // Fallback to regular icon
          const fallbackPath = path.join(__dirname, '../../../assets', 'tray-icon.png');
          this.tray = new Tray(fallbackPath);
          console.log('⚠️ [TRAY] Using fallback icon');
        } else {
          icon.setTemplateImage(true);
          this.tray = new Tray(icon);
          console.log('✅ [TRAY] Created macOS template tray icon');
        }
      } else {
        this.tray = new Tray(trayIconPath);
        console.log('✅ [TRAY] Created tray icon');
      }
    } catch (error) {
      console.error('❌ [TRAY] Error creating tray icon:', error);
      // Fallback to regular icon
      try {
        const fallbackPath = path.join(__dirname, '../../../assets', 'tray-icon.png');
        this.tray = new Tray(fallbackPath);
        console.log('⚠️ [TRAY] Using fallback icon after error');
      } catch (fallbackError) {
        console.error('❌ [TRAY] Failed to create tray with fallback:', fallbackError);
        return null;
      }
    }
    
    // Simplified tray menu - only Toggle Monitoring Tools and Quit
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Alyson PM Agent',
        enabled: false
      },
      { type: 'separator' },
      {
        label: '🔧 Toggle Monitoring Tools',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
            this.mainWindow.webContents.send('toggle-monitoring-tools');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          global.isQuitting = true;
          this.deps.app?.quit();
        }
      }
    ]);
    
    this.tray.setToolTip('Alyson PM');
    this.tray.setContextMenu(contextMenu);
    
    // Handle tray click
    this.tray.on('click', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isVisible()) {
          this.mainWindow.hide();
        } else {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      }
    });
    
    cleanupRegistry.registerResource({
      name: 'tray',
      cleanup: async () => {
        if (this.tray && !this.tray.isDestroyed()) {
          this.tray.destroy();
        }
      }
    });
    
    console.log('✅ [TRAY] Tray menu created');
    return this.tray;
  }

  updateTrayMenu(isTracking) {
    if (!this.tray) return;
    
    const contextMenu = this.tray.contextMenu;
    if (contextMenu) {
      const startItem = contextMenu.getMenuItemById('start-timer');
      const stopItem = contextMenu.getMenuItemById('stop-timer');
      
      if (startItem) startItem.enabled = !isTracking;
      if (stopItem) stopItem.enabled = isTracking;
      
      this.tray.setContextMenu(contextMenu);
    }
  }


  // === WINDOW EVENT LISTENERS ===
  
  setupWindowListeners() {
    if (!this.mainWindow) return;
    
    // Handle window close - quit on Windows, hide on macOS
    this.mainWindow.on('close', (event) => {
      const gracefulShutdownManager = require('../core/graceful-shutdown-manager');
      const { app } = require('electron');

      if (gracefulShutdownManager.handleWindowCloseEvent(event, this.mainWindow, { app })) {
        return;
      }

      if (global.isQuitting) {
        return; // Allow close
      }
      
      // FIX v1.0.136: On Windows/Linux, pressing X should quit the app entirely
      if (process.platform !== 'darwin') {
        global.isQuitting = true;
        app.quit();
        return;
      }
      
      // macOS: hide to tray
      event.preventDefault();
      this.mainWindow.hide();
    });
    
    // Handle window state changes
    this.mainWindow.on('minimize', () => {
      console.log('🪟 [WINDOW] Main window minimized');
    });
    
    this.mainWindow.on('restore', () => {
      console.log('🪟 [WINDOW] Main window restored');
    });
    
    this.mainWindow.on('focus', () => {
      console.log('🪟 [WINDOW] Main window focused');
      global.eventManager?.emit('window-focused');
    });
    
    this.mainWindow.on('blur', () => {
      console.log('🪟 [WINDOW] Main window blurred');
      global.eventManager?.emit('window-blurred');
    });
    
    // Handle window closed
    this.mainWindow.on('closed', () => {
      console.log('🪟 [WINDOW] Main window closed');
      this.mainWindow = null;
    });
    
    console.log('✅ [WINDOW] Window listeners setup complete');
  }

  // === UTILITY FUNCTIONS ===
  
  showWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  hideWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide();
    }
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  showNotification(title, body, type = 'info') {
    if (this.tray) {
      this.tray.displayBalloon({
        icon: path.join(__dirname, '../../../assets/icon.png'),
        title: title,
        content: body
      });
    }
  }

  setTrayTooltip(tooltip) {
    if (this.tray) {
      this.tray.setToolTip(tooltip);
    }
  }

  // === GETTERS ===
  
  getMainWindow() {
    return this.mainWindow;
  }

  getTray() {
    return this.tray;
  }

  isWindowVisible() {
    return this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible();
  }

  shutdown() {
    // Remove all listeners
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.removeAllListeners();
      this.mainWindow.close();
    }
    
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.destroy();
    }
    
    console.log('🪟 [WINDOW-UI-MANAGER] Shutdown complete');
  }
}

module.exports = WindowUIManager;