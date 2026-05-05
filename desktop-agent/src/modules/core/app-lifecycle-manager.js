/**
 * App Lifecycle Manager Module
 * Manages application startup, window creation, and shutdown
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('./cleanup-registry');

class AppLifecycleManager {
  constructor(electronModules, config) {
    this.electronModules = electronModules;
    this.config = config;
    this.mainWindow = null;
    this.debugWindow = null;
    this.isReady = false;
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'appLifecycleManager',
      cleanup: async () => this.cleanup()
    });
  }

  /**
   * Initialize the application
   */
  async initialize() {
    console.log('🚀 [APP-LIFECYCLE] Initializing application...');
    
    try {
      // Create main window
      await this.createMainWindow();
      
      // Setup activity monitoring
      this.setupActivityMonitoring();
      
      // Initialize window ready state
      this.initializeWindowReadyState();
      
      this.isReady = true;
      console.log('✅ [APP-LIFECYCLE] Application initialized successfully');
      
    } catch (error) {
      console.error('❌ [APP-LIFECYCLE] Application initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create the main application window
   */
  async createMainWindow() {
    const { BrowserWindow, screen, app } = this.electronModules;
    
    if (this.mainWindow) {
      console.log('⚠️ [APP-LIFECYCLE] Main window already exists');
      return this.mainWindow;
    }

    console.log('🪟 [APP-LIFECYCLE] Creating main window...');

    // Ensure Dock icon is set on macOS
    try {
      if (process.platform === 'darwin' && app && app.dock && typeof app.dock.setIcon === 'function') {
        const path = require('path');
        const icnsPath = path.join(__dirname, '../../../assets/icon.icns');
        app.dock.setIcon(icnsPath);
      }
    } catch (e) {
      console.log('⚠️ [APP-LIFECYCLE] Failed to set Dock icon:', e?.message || e);
    }

    // Get primary display dimensions
    let windowConfig = {
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      icon: global.__alysonIconPath || require('path').join(__dirname, '../../../assets/icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        spellcheck: false
      },
      titleBarStyle: 'default',
      show: true, // PERFORMANCE FIX: Show immediately to reduce perceived startup time
      backgroundColor: '#667eea' // Match login gradient to prevent white flash
    };

    // macOS specific adjustments
    if (screen && process.platform === 'darwin') {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { workAreaSize } = primaryDisplay;
      
      windowConfig.width = Math.min(1200, workAreaSize.width - 100);
      windowConfig.height = Math.min(800, workAreaSize.height - 100);
      windowConfig.titleBarStyle = 'default';
    }

    this.mainWindow = new BrowserWindow(windowConfig);

    // Window is already visible (show: true), just ensure focus when content is ready
    this.mainWindow.once('ready-to-show', () => {
      console.log('🪟 [APP-LIFECYCLE] Window ready-to-show event fired');
      try {
        const { app } = this.electronModules || {};
        // macOS: ensure Dock is shown
        try { if (process.platform === 'darwin' && app?.dock && app.dock.show) app.dock.show(); } catch {}
        // Focus the window (already visible due to show: true)
        this.mainWindow.focus();
      } catch (e) {
        console.log('⚠️ [APP-LIFECYCLE] ready-to-show focus failed:', e?.message || e);
      }
      console.log('✅ [APP-LIFECYCLE] Main window focused');
    });

    // IMPORTANT: Delay loading URL to ensure IPC handlers are registered
    // This prevents "No handler registered" errors
    console.log('⏳ [APP-LIFECYCLE] Delaying URL load to ensure IPC handlers are ready...');
    
    // Force load local file to avoid connection refused errors
    // const isDev = process.env.NODE_ENV === 'development';
    // const url = isDev ? 'http://localhost:3000' : `file://${require('path').join(__dirname, '../../../renderer/index.html')}`;
    
    // ALWAYS use the local file for now to ensure it loads
    const filePath = require('path').join(__dirname, '../../../renderer/index.html');
    const url = `file://${filePath}`;
    
    console.log('🔍 [APP-LIFECYCLE] Attempting to load:', url);
    console.log('   Exists?', require('fs').existsSync(filePath));

    // Use setImmediate to load URL after current event loop iteration
    // This ensures all synchronous handler registrations complete first
    await new Promise((resolve) => {
      setImmediate(async () => {
        console.log('🌐 [APP-LIFECYCLE] Loading URL now...');
        await this.mainWindow.loadURL(url);
        
        // DEVTOOLS: Uncomment to debug renderer issues
        // this.mainWindow.webContents.openDevTools({ mode: 'detach' });
        
        // Window is already visible, just ensure focus after load
        try {
          const { app } = this.electronModules || {};
          if (process.platform === 'darwin' && app?.dock && app.dock.show) app.dock.show();
          this.mainWindow.focus();
        } catch (e) {
          console.log('⚠️ [APP-LIFECYCLE] post-load focus failed:', e?.message || e);
        }
        resolve();
      });
    });

    // SAFETY: Ensure window is centered after creation (already visible)
    setTimeout(() => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.center();
        console.log('✅ [APP-LIFECYCLE] Window centered');
      }
    }, 100);

    // Handle window CLOSE (before it actually closes)
    // FIX v1.0.136: On Windows, pressing X should quit the app (not hide to tray)
    this.mainWindow.on('close', (event) => {
      // If app is quitting (from tray menu, dock quit, etc.), allow the close
      if (global.isQuitting) {
        console.log('🛑 [APP-LIFECYCLE] App is quitting - allowing window close');
        return; // Don't prevent, let it close
      }
      
      // FIX v1.0.136: On Windows/Linux, pressing X should quit the app entirely
      // On macOS, hide to tray (standard macOS behavior)
      if (process.platform !== 'darwin') {
        console.log('🛑 [APP-LIFECYCLE] Window X pressed on Windows - triggering app quit');
        global.isQuitting = true;
        const { app } = require('electron');
        app.quit();
        return;
      }
      
      // macOS: hide to tray instead of quitting
      event.preventDefault();
      this.mainWindow.hide();
      
      // Show notification that app is still running
      if (global.trayManager && global.trayManager.showNotification) {
        global.trayManager.showNotification('Alyson PM', 'App continues running in background. Click the tray icon to restore.');
      }
      
      console.log('📱 [APP-LIFECYCLE] Window hidden to tray - use tray or dock icon to restore');
    });
    
    // Handle window CLOSED (after destroyed) - cleanup reference
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    console.log('✅ [APP-LIFECYCLE] Main window created');
    return this.mainWindow;
  }

  /**
   * Create debug window
   */
  createDebugWindow() {
    const { BrowserWindow } = this.electronModules;
    
    if (this.debugWindow) {
      this.debugWindow.focus();
      return this.debugWindow;
    }

    console.log('🔧 [APP-LIFECYCLE] Creating debug window...');

    this.debugWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'TimeFlow Debug Console',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        spellcheck: false,
        preload: require('path').join(__dirname, '../../renderer/renderer-modular.js')
      },
      parent: this.mainWindow,
      modal: false,
      show: false
    });

    // Load debug URL
    const debugUrl = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:3000/debug' 
      : `file://${require('path').join(__dirname, '../../../renderer/index.html#/debug')}`;
    
    this.debugWindow.loadURL(debugUrl);

    this.debugWindow.once('ready-to-show', () => {
      this.debugWindow.show();
    });

    this.debugWindow.on('closed', () => {
      this.debugWindow = null;
    });

    console.log('✅ [APP-LIFECYCLE] Debug window created');
    return this.debugWindow;
  }

  /**
   * Setup activity monitoring
   */
  setupActivityMonitoring() {
    console.log('📊 [APP-LIFECYCLE] Setting up activity monitoring...');
    
    // Initialize display activity stats
    if (!global.displayActivityStats) {
      global.displayActivityStats = {
        totalClicks: 0,
        totalKeys: 0,
        totalMoves: 0,
        lastReset: Date.now(),
        sessionClicks: 0,
        sessionKeys: 0,
        sessionMoves: 0,
        sessionStart: Date.now(),
        idleSeconds: 0,
        lastActivity: Date.now()
      };
    }
  }

  /**
   * Initialize window ready state
   */
  initializeWindowReadyState() {
    if (!this.mainWindow) return;

    // Set up window ready detection
    this.mainWindow.webContents.once('did-finish-load', () => {
      console.log('✅ [APP-LIFECYCLE] Main window finished loading');
      
      // Send initial state to renderer
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('app-ready', {
          timestamp: new Date().toISOString(),
          config: this.config
        });
      }
    });
  }

  /**
   * Load system state from previous session
   */
  loadSystemState() {
    console.log('💾 [APP-LIFECYCLE] Loading system state...');
    
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = this.electronModules;
      
      const stateFile = path.join(app.getPath('userData'), 'system-state.json');
      
      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        console.log('✅ [APP-LIFECYCLE] System state loaded:', Object.keys(state));
        return state;
      }
    } catch (error) {
      console.log('⚠️ [APP-LIFECYCLE] Could not load system state:', error.message);
    }
    
    return null;
  }

  /**
   * Save system state
   */
  async saveSystemState(state) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const { app } = this.electronModules;
      
      const stateFile = path.join(app.getPath('userData'), 'system-state.json');
      await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
      console.log('✅ [APP-LIFECYCLE] System state saved');
    } catch (error) {
      console.error('❌ [APP-LIFECYCLE] Failed to save system state:', error);
    }
  }

  /**
   * Get main window
   */
  getMainWindow() {
    return this.mainWindow;
  }

  /**
   * Get debug window
   */
  getDebugWindow() {
    return this.debugWindow;
  }

  /**
   * Check if app is ready
   */
  isAppReady() {
    return this.isReady && this.mainWindow && !this.mainWindow.isDestroyed();
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    console.log('🧹 [APP-LIFECYCLE] Cleaning up...');
    
    if (this.debugWindow && !this.debugWindow.isDestroyed()) {
      this.debugWindow.close();
    }
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }
    
    this.isReady = false;
  }
}

module.exports = AppLifecycleManager;