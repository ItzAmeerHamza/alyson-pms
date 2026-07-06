/**
 * FORCE UPDATER MODULE
 * 
 * Manages forced app updates - blocks timer start when updates are available.
 * Shows mandatory update modal that cannot be dismissed.
 * Cross-platform support for macOS, Windows, and Linux.
 */

// Electron main process only (avoid ELECTRON_RUN_AS_NODE / renderer contexts)
const isElectronMain =
  typeof process !== 'undefined' &&
  process.versions &&
  !!process.versions.electron &&
  process.type === 'browser';

// Back-compat: older code used isElectronContext
const isElectronContext = isElectronMain;

let autoUpdater, app, BrowserWindow, dialog, ipcMain;

if (isElectronMain) {
  const electronUpdater = require('electron-updater');
  const electron = require('electron');
  autoUpdater = electronUpdater.autoUpdater;
  app = electron.app;
  BrowserWindow = electron.BrowserWindow;
  dialog = electron.dialog;
  ipcMain = electron.ipcMain;
} else {
  console.log('🔧 [FORCE-UPDATER] Running in Node.js mode - updater disabled');
  autoUpdater = null;
  app = null;
  BrowserWindow = null;
  dialog = null;
  ipcMain = null;
}

const path = require('path');
const fs = require('fs');

class ForceUpdater {
  constructor() {
    // Update state
    this.isUpdateRequired = false;
    this.isUpdateAvailable = false;
    this.isUpdateDownloaded = false;
    this.isDownloading = false;
    this.pendingVersion = null;
    this.currentVersion = null;
    this.downloadProgress = 0;
    this.updateError = null;
    this.isDevMode = !!(app && app.isPackaged === false);
    
    // Window references
    this.updateWindow = null;
    this.mainWindow = null;
    
    // Callbacks
    this.mainAppCallback = null;
    this.progressCallback = null;
    
    // Get current version
    if (app) {
      this.currentVersion = app.getVersion();
    }
    
    // Cross-platform app data path
    this.appDataPath = this.getAppDataPath();
    this.updateStatePath = path.join(this.appDataPath, 'update-state.json');
    
    // Make instance available globally
    global.forceUpdater = this;
    
    // Configure auto-updater
    this.setupAutoUpdater();
    
    // Register IPC handlers
    this.registerIPCHandlers();
    
    if (this.isDevMode) {
      console.log('🔧 [FORCE-UPDATER] Dev mode detected (not packaged) - updater install disabled');
    }
    if (app) {
      console.log('🔧 [FORCE-UPDATER] Packaging state:', { isPackaged: app.isPackaged, isDevMode: this.isDevMode });
    }
    console.log('✅ [FORCE-UPDATER] Initialized with cross-platform support');
  }

  /**
   * Get cross-platform app data path
   */
  getAppDataPath() {
    if (app) {
      return app.getPath('userData');
    }
    
    // Fallback for non-Electron context
      const os = require('os');
    const platform = process.platform;
    
    if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'alyson-work-time-agent');
    } else if (platform === 'win32') {
      return path.join(process.env.APPDATA || os.homedir(), 'alyson-work-time-agent');
    } else {
      return path.join(os.homedir(), '.config', 'alyson-work-time-agent');
    }
  }

  /**
   * GitHub owner/repo for electron-updater, parsed from bundled package.json
   * `repository` field. Falls back if missing so packaged builds never point at
   * a stale hardcoded fork (which causes perpetual "update required" and broken installs).
   */
  getGithubReleaseTarget() {
    const fallback = { owner: 'ItzAmeerHamza', repo: 'alyson-pms' };
    try {
      const pkgPath = path.join(__dirname, '../../../package.json');
      if (!fs.existsSync(pkgPath)) {
        console.warn('⚠️ [FORCE-UPDATER] package.json not found at', pkgPath, '- using fallback feed');
        return fallback;
      }
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const raw =
        pkg.repository &&
        (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url);
      if (!raw || typeof raw !== 'string') {
        console.warn('⚠️ [FORCE-UPDATER] No repository in package.json - using fallback feed');
        return fallback;
      }
      const normalized = raw
        .replace(/\.git$/i, '')
        .replace(/^git@github\.com:/i, 'https://github.com/');
      const m = normalized.match(/github\.com\/([^/]+)\/([^/]+)/i);
      if (m) {
        return { owner: m[1], repo: m[2] };
      }
    } catch (e) {
      console.warn('⚠️ [FORCE-UPDATER] Could not read GitHub repo from package.json:', e.message);
    }
    return fallback;
  }

  /**
   * Ensure app data directory exists
   */
  ensureAppDataDir() {
    try {
      if (!fs.existsSync(this.appDataPath)) {
        fs.mkdirSync(this.appDataPath, { recursive: true });
      }
    } catch (error) {
      console.error('⚠️ [FORCE-UPDATER] Could not create app data directory:', error.message);
    }
  }

  /**
   * Save update state to disk (cross-platform)
   */
  saveUpdateState() {
    try {
      this.ensureAppDataDir();
      const state = {
        isUpdateAvailable: this.isUpdateAvailable,
        isUpdateDownloaded: this.isUpdateDownloaded,
        pendingVersion: this.pendingVersion,
        currentVersion: this.currentVersion,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.updateStatePath, JSON.stringify(state, null, 2));
      console.log('💾 [FORCE-UPDATER] Update state saved');
    } catch (error) {
      console.error('⚠️ [FORCE-UPDATER] Could not save update state:', error.message);
    }
  }

  /**
   * Load update state from disk (cross-platform)
   */
  loadUpdateState() {
    try {
      if (fs.existsSync(this.updateStatePath)) {
        const state = JSON.parse(fs.readFileSync(this.updateStatePath, 'utf8'));
        console.log('📂 [FORCE-UPDATER] Loaded update state:', state);
        
        // CRITICAL FIX: If saved state has old version, clear it
        // This happens after an update when the new app loads stale state
        const actualVersion = app ? app.getVersion() : null;
        if (actualVersion && state.currentVersion && state.currentVersion !== actualVersion) {
          console.log(`🔄 [FORCE-UPDATER] Version mismatch detected! Cached: ${state.currentVersion}, Actual: ${actualVersion}`);
          console.log('🗑️ [FORCE-UPDATER] Clearing stale update state...');
          this.clearUpdateState();
          return null; // Return null to indicate no valid state
        }
        
        // Also clear if pendingVersion matches actual version (update was completed)
        if (actualVersion && state.pendingVersion && state.pendingVersion === actualVersion) {
          console.log(`✅ [FORCE-UPDATER] Update to ${actualVersion} was successful! Clearing state.`);
          this.clearUpdateState();
          return null;
        }
        
        return state;
      }
    } catch (error) {
      console.error('⚠️ [FORCE-UPDATER] Could not load update state:', error.message);
    }
    return null;
  }

  /**
   * Clear update state from disk
   */
  clearUpdateState() {
    try {
      if (fs.existsSync(this.updateStatePath)) {
        fs.unlinkSync(this.updateStatePath);
        console.log('🗑️ [FORCE-UPDATER] Update state cleared');
      }
    } catch (error) {
      console.error('⚠️ [FORCE-UPDATER] Could not clear update state:', error.message);
    }
  }

  /**
   * Register IPC handlers for renderer communication
   */
  registerIPCHandlers() {
    if (!ipcMain || !isElectronMain) {
      console.log('🔧 [FORCE-UPDATER] Skipping IPC handler registration (not in Electron context)');
      return;
    }

    // Helper to safely register handlers (removes existing if present)
    const safeHandle = (channel, handler) => {
      try {
        // Try to remove existing handler first
        ipcMain.removeHandler(channel);
      } catch (e) {
        // Ignore if no handler exists
      }
      ipcMain.handle(channel, handler);
      console.log(`📡 [FORCE-UPDATER] Registered handler: ${channel}`);
    };

    // Check for updates (synchronous check)
    safeHandle('check-for-update', async () => {
      console.log('🔍 [FORCE-UPDATER] IPC: check-for-update requested');
      const result = await this.checkForUpdates();
      return result;
    });

    // Get current update status
    safeHandle('get-update-status', () => {
      console.log('📊 [FORCE-UPDATER] IPC: get-update-status requested');
      return this.getUpdateStatus();
    });

    // Start download
    safeHandle('download-update', async () => {
      console.log('📥 [FORCE-UPDATER] IPC: download-update requested');
      return await this.downloadUpdate();
    });

    // Install update (quit and install)
    safeHandle('install-update', () => {
      console.log('🔄 [FORCE-UPDATER] IPC: install-update requested');
      return this.installUpdate();
    });

    // Get app version
    safeHandle('get-app-version', () => {
      return this.currentVersion || (app ? app.getVersion() : '1.0.0');
    });

    console.log('✅ [FORCE-UPDATER] IPC handlers registered');
  }

  /**
   * Setup auto-updater with event handlers
   */
  setupAutoUpdater() {
    if (!autoUpdater || !isElectronMain) {
      console.log('🔧 [FORCE-UPDATER] Skipping auto-updater setup (not in Electron context)');
      return;
    }

    // In dev (`npm start`), never auto-check/download/install updates.
    // It causes app quits and bundle-id errors (Squirrel.Mac expects packaged app IDs).
    if (this.isDevMode) {
      console.log('🔧 [FORCE-UPDATER] Skipping auto-updater setup (dev mode)');
      return;
    }
    
    // Configure GitHub repository for auto-updater (must match where you publish
    // latest-mac.yml + ZIPs — driven by package.json repository, not a stale constant).
    const gh = this.getGithubReleaseTarget();
    console.log('🔧 [FORCE-UPDATER] Configuring GitHub repository:', gh);

    // Packaged builds only
    autoUpdater.forceDevUpdateConfig = false;

    autoUpdater.setFeedURL({
      provider: 'github',
      owner: gh.owner,
      repo: gh.repo,
      // GitHub releases are published as pre-releases (unsigned test builds).
      releaseType: 'prerelease',
    });
    
    // Auto-download updates when detected
    autoUpdater.autoDownload = true;
    // CRITICAL FIX v1.0.135: Enable auto-install on quit so update applies when app quits
    autoUpdater.autoInstallOnAppQuit = true;
    
    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      console.log('🔍 [FORCE-UPDATER] Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('🆕 [FORCE-UPDATER] Update available:', info.version);
      this.isUpdateAvailable = true;
      this.isUpdateRequired = true;
      this.pendingVersion = info.version;
      this.updateError = null;
      this.saveUpdateState();
      
      // Notify renderer
      this.sendToRenderer('update-available', {
        version: info.version,
        currentVersion: this.currentVersion,
        releaseNotes: info.releaseNotes || ''
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('✅ [FORCE-UPDATER] App is up to date:', info.version);
      this.isUpdateAvailable = false;
      this.isUpdateRequired = false;
      this.pendingVersion = null;
      this.clearUpdateState();
      
      // Notify renderer
      this.sendToRenderer('update-not-available', {
        currentVersion: this.currentVersion
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('❌ [FORCE-UPDATER] Update error:', err.message);
      
      // Check if this is a development mode bundle ID mismatch error
      const isDevModeError = err.message.includes('Could not locate update bundle') && 
                             err.message.includes('com.github.Electron') &&
                             app && !app.isPackaged;
      
      if (isDevModeError) {
        console.log('⚠️ [FORCE-UPDATER] Development mode detected - update install not supported');
        console.log('ℹ️ [FORCE-UPDATER] This error only occurs in dev mode. Production installs will work correctly.');
        
        // In dev mode, if download completed, simulate success for testing
        if (this.isUpdateDownloaded) {
          this.sendToRenderer('update-dev-mode', {
            message: 'Update downloaded successfully! In production, the app would restart with the new version.',
            version: this.pendingVersion
          });
          return; // Don't show error in dev mode if download was successful
        }
      }
      
      this.updateError = err.message;
      this.isDownloading = false;
      
      // Notify renderer
      this.sendToRenderer('update-error', {
        error: isDevModeError ? 
          'Development mode: Update downloaded but install requires production build. Run "npm run build" then test the built app.' :
          err.message
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const percent = Math.round(progressObj.percent);
      console.log(`📥 [FORCE-UPDATER] Download progress: ${percent}%`);
      this.downloadProgress = percent;
      
      // Notify renderer
      this.sendToRenderer('update-download-progress', {
        percent: percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('✅ [FORCE-UPDATER] Update downloaded:', info.version);
      this.isUpdateDownloaded = true;
      this.isDownloading = false;
      this.downloadProgress = 100;
      this.saveUpdateState();
      
      // Notify renderer
      this.sendToRenderer('update-downloaded', {
        version: info.version
      });
    });

    console.log('✅ [FORCE-UPDATER] Auto-updater configured');
  }

  /**
   * Send message to renderer process
   */
  sendToRenderer(channel, data) {
    try {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        if (win && win.webContents) {
          win.webContents.send(channel, data);
        }
      });
    } catch (error) {
      console.error('⚠️ [FORCE-UPDATER] Could not send to renderer:', error.message);
    }
  }

  /**
   * Check for updates (returns promise)
   * This is the main method called after login
   */
  async checkForUpdates() {
    // CRITICAL: Always get fresh version from app, never use cached
    if (app) {
      const freshVersion = app.getVersion();
      if (freshVersion !== this.currentVersion) {
        console.log(`🔄 [FORCE-UPDATER] Version updated: ${this.currentVersion} → ${freshVersion}`);
        this.currentVersion = freshVersion;
        // Clear any stale update state
        this.isUpdateAvailable = false;
        this.isUpdateDownloaded = false;
        this.pendingVersion = null;
        this.clearUpdateState();
      }
    }
    
    if (this.isDevMode) {
      return {
        updateAvailable: false,
        reason: 'dev_mode',
        currentVersion: this.currentVersion
      };
    }

    if (!autoUpdater || !isElectronContext) {
      console.log('🔧 [FORCE-UPDATER] Update check not available');
      return { 
        updateAvailable: false, 
        reason: 'not_supported',
        currentVersion: this.currentVersion
      };
    }

    // Check if we already have a downloaded update
    if (this.isUpdateDownloaded && this.pendingVersion) {
      console.log('📦 [FORCE-UPDATER] Already have downloaded update:', this.pendingVersion);
      return {
        updateAvailable: true,
        updateDownloaded: true,
        currentVersion: this.currentVersion,
        newVersion: this.pendingVersion
      };
    }

    // Check if we already know about an available update
    if (this.isUpdateAvailable && this.pendingVersion) {
      console.log('📦 [FORCE-UPDATER] Already know about update:', this.pendingVersion);
      return {
        updateAvailable: true,
        updateDownloaded: this.isUpdateDownloaded,
        currentVersion: this.currentVersion,
        newVersion: this.pendingVersion
      };
    }

    console.log('🔍 [FORCE-UPDATER] Checking for updates...');
    try {
      // Use promise result directly (more reliable than events in dev mode)
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo) {
        const remoteVersion = result.updateInfo.version;
        const currentVersion = this.currentVersion;
        
        // Compare versions to determine if update is available
        const isNewer = this.compareVersions(remoteVersion, currentVersion) > 0;
        
        if (isNewer) {
          console.log(`🆕 [FORCE-UPDATER] Update available: ${currentVersion} → ${remoteVersion}`);
          this.isUpdateAvailable = true;
          this.isUpdateRequired = true;
          this.pendingVersion = remoteVersion;
          this.saveUpdateState();
          
          return {
            updateAvailable: true,
            updateDownloaded: false,
            currentVersion: currentVersion,
            newVersion: remoteVersion,
            releaseNotes: result.updateInfo.releaseNotes || ''
          };
        } else {
          console.log(`✅ [FORCE-UPDATER] App is up to date (${currentVersion})`);
          return {
            updateAvailable: false,
            currentVersion: currentVersion,
            checkedVersion: remoteVersion
          };
        }
      }
      
      // No update info returned
      console.log('⚠️ [FORCE-UPDATER] No update info returned from check');
      return {
        updateAvailable: false,
        reason: 'no_info',
        currentVersion: this.currentVersion
      };
      
    } catch (error) {
      console.error('❌ [FORCE-UPDATER] Update check error:', error.message);
      return {
        updateAvailable: false,
        reason: 'error',
        error: error.message,
        currentVersion: this.currentVersion
      };
    }
  }

  /**
   * Compare two semantic versions
   * Returns: 1 if a > b, -1 if a < b, 0 if equal
   */
  compareVersions(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA > numB) return 1;
      if (numA < numB) return -1;
    }
    return 0;
  }

  /**
   * Download the update
   */
  async downloadUpdate() {
    if (this.isDevMode) {
      return { success: false, error: 'dev_mode', message: 'Updates are disabled while running in development mode.' };
    }

    if (!autoUpdater || !isElectronContext) {
      return { success: false, error: 'Not supported' };
    }

    if (this.isUpdateDownloaded) {
      console.log('📦 [FORCE-UPDATER] Update already downloaded');
      return { success: true, alreadyDownloaded: true };
    }

    if (this.isDownloading) {
      console.log('📥 [FORCE-UPDATER] Download already in progress');
      return { success: true, inProgress: true };
    }

    if (!this.isUpdateAvailable) {
      console.log('⚠️ [FORCE-UPDATER] No update available to download');
      return { success: false, error: 'No update available' };
    }

    console.log('📥 [FORCE-UPDATER] Starting download...');
    this.isDownloading = true;
    this.downloadProgress = 0;

    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('❌ [FORCE-UPDATER] Download failed:', error.message);
      this.isDownloading = false;
      this.updateError = error.message;
      
      // Handle "ZIP file not provided" error - server doesn't have ZIP files for auto-update
      if (error.message.includes('ZIP file not provided') || error.message.includes('zip')) {
        console.log('🔧 [FORCE-UPDATER] ZIP error - release missing ZIP files for auto-update');
        
        return { 
          success: false, 
          error: 'zip_not_available',
          message: 'Update files not available on server. Please wait for the next release.',
          pendingVersion: this.pendingVersion
        };
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Install the update (quit and install)
   */
  installUpdate() {
    console.log('🔄 [FORCE-UPDATER] installUpdate() called');
    console.log('🔧 [FORCE-UPDATER] State check:', {
      hasAutoUpdater: !!autoUpdater,
      isElectronContext,
      isUpdateDownloaded: this.isUpdateDownloaded,
      pendingVersion: this.pendingVersion
    });

    if (this.isDevMode) {
      console.log('🔧 [FORCE-UPDATER] Dev mode - refusing to quit/install update');
      return {
        success: false,
        error: 'dev_mode',
        installing: false,
        message: 'Update install is disabled in development mode. Build the app and test updates in the packaged build.'
      };
    }
    
    if (!autoUpdater || !isElectronContext) {
      console.error('❌ [FORCE-UPDATER] Cannot install: autoUpdater not available');
      return { success: false, error: 'Not supported', installing: false };
    }

    if (!this.isUpdateDownloaded) {
      console.log('⚠️ [FORCE-UPDATER] No update downloaded to install');
      // CRITICAL FIX: Try to force install anyway if we have a pending version
      // This handles race conditions where isUpdateDownloaded flag wasn't set
      if (this.pendingVersion && this.downloadProgress >= 100) {
        console.log('🔧 [FORCE-UPDATER] Download progress 100% but flag not set - trying install anyway');
        this.isUpdateDownloaded = true;
      } else {
        return { success: false, error: 'No update downloaded', installing: false };
      }
    }

    console.log('🔄 [FORCE-UPDATER] Installing update and restarting...');
    console.log('✅ [FORCE-UPDATER] autoInstallOnAppQuit is enabled - update will install when app quits');
    
    // Clear update state before restart
    this.clearUpdateState();
    
    // Schedule quit with a small delay to allow IPC response to complete
    setTimeout(async () => {
      try {
        console.log('🔧 [FORCE-UPDATER] Stopping all services and closing windows...');
        const { BrowserWindow } = require('electron');
        
        // Step 1: Stop all tracking and services
        try {
          if (typeof global.stopTracking === 'function') {
            console.log('🔧 [FORCE-UPDATER] Stopping tracking via global.stopTracking...');
            await global.stopTracking('force_update', 'Force update in progress');
          }
          if (global.enhancedScreenshotManager) {
            console.log('🔧 [FORCE-UPDATER] Confirming screenshot manager stopped...');
            global.enhancedScreenshotManager.stopScreenshotCapture?.();
          }
        } catch (e) {
          console.warn('⚠️ [FORCE-UPDATER] Error stopping services:', e.message);
        }
        
        // Step 2: Force close all windows
        const allWindows = BrowserWindow.getAllWindows();
        console.log(`🔧 [FORCE-UPDATER] Closing ${allWindows.length} window(s)...`);
        allWindows.forEach(win => {
          try {
            win.removeAllListeners('close');
            win.removeAllListeners('closed');
            win.webContents?.removeAllListeners?.();
            win.destroy();
          } catch (e) {
            console.warn('⚠️ [FORCE-UPDATER] Could not destroy window:', e.message);
          }
        });
        
        // Step 3: Give time for cleanup, then install and restart
        // CRITICAL FIX v1.0.139: Windows-specific restart handling
        setTimeout(() => {
          console.log('🚀 [FORCE-UPDATER] Installing update and restarting...');
          console.log(`🔧 [FORCE-UPDATER] Platform: ${process.platform}`);
          
          try {
            if (process.platform === 'win32') {
              // WINDOWS FIX v1.0.139: quitAndInstall on Windows NSIS has issues with restart
              // Solution: Use SILENT install (isSilent=true) + forceRunAfter=true
              // Silent install runs the NSIS installer without UI, then restarts the app
              console.log('🪟 [FORCE-UPDATER] Windows: Using silent install method');
              
              // quitAndInstall(isSilent, isForceRunAfter)
              // isSilent=TRUE: Run NSIS installer silently (no GUI)
              // isForceRunAfter=TRUE: Restart app after install completes
              try {
                console.log('🔧 [FORCE-UPDATER] Windows: Calling quitAndInstall(true, true) for silent update...');
                autoUpdater.quitAndInstall(true, true);
                console.log('✅ [FORCE-UPDATER] Windows: quitAndInstall() called - app will restart');
              } catch (winErr) {
                console.error('❌ [FORCE-UPDATER] Windows: quitAndInstall failed:', winErr.message);
                // Fallback: Try non-silent install
                console.log('🔧 [FORCE-UPDATER] Windows: Fallback - trying non-silent install...');
                try {
                  autoUpdater.quitAndInstall(false, true);
                } catch (fallbackErr) {
                  console.error('❌ [FORCE-UPDATER] Windows: Non-silent also failed:', fallbackErr.message);
                  // Last resort: Force quit and let installer handle restart
                  if (app) {
                    console.log('🔧 [FORCE-UPDATER] Windows: Last resort - app.exit(0)');
                    app.exit(0);
                  }
                }
              }
            } else if (process.platform === 'darwin') {
              // macOS: quitAndInstall works well
              console.log('🍎 [FORCE-UPDATER] macOS: Using quitAndInstall()');
              autoUpdater.quitAndInstall(false, true);
              console.log('✅ [FORCE-UPDATER] macOS: quitAndInstall() called');
            } else {
              // Linux: Standard approach
              console.log('🐧 [FORCE-UPDATER] Linux: Using quitAndInstall()');
              autoUpdater.quitAndInstall(false, true);
              console.log('✅ [FORCE-UPDATER] Linux: quitAndInstall() called');
            }
          } catch (quitErr) {
            console.error('❌ [FORCE-UPDATER] quitAndInstall() error:', quitErr.message);
            // Last resort fallback for all platforms
            if (app) {
              console.log('🔧 [FORCE-UPDATER] Last resort: app.relaunch() + app.exit()');
              app.relaunch();
              app.exit(0);
            }
          }
        }, 1000);
        
      } catch (err) {
        console.error('⚠️ [FORCE-UPDATER] Error during cleanup:', err.message);
        // Still try to quit - the update should still apply
        if (app) {
          console.log('🔧 [FORCE-UPDATER] Forcing app.quit() despite error...');
          app.quit();
        }
      }
    }, 500);

    return { success: true, installing: true };
  }

  /**
   * Get current update status
   */
  getUpdateStatus() {
    return {
      isUpdateAvailable: this.isUpdateAvailable,
      isUpdateRequired: this.isUpdateRequired,
      isUpdateDownloaded: this.isUpdateDownloaded,
      isDownloading: this.isDownloading,
      currentVersion: this.currentVersion,
      pendingVersion: this.pendingVersion,
      downloadProgress: this.downloadProgress,
      updateError: this.updateError
    };
  }

  /**
   * Check if timer should be blocked due to pending update
   */
  shouldBlockTimer() {
    return this.isUpdateRequired && this.isUpdateAvailable;
  }

  /**
   * Legacy method: Check for updates and start main app
   * @param {Function} callback - Function to call when app can start
   */
  async checkForUpdatesAndStart(callback) {
    this.mainAppCallback = callback;
    
    console.log('🔍 [FORCE-UPDATER] Checking for updates before app start...');
    
    if (!autoUpdater || !isElectronContext) {
      console.log('🔧 [FORCE-UPDATER] Skipping update check (not in Electron context)');
      this.startMainApp();
      return;
    }
    
    // Check for updates
    const result = await this.checkForUpdates();
    
    if (result.updateAvailable) {
      console.log('🆕 [FORCE-UPDATER] Update available, app will show update modal after login');
      // Don't block here - let the app start, the update modal will show after login
    }
    
    // Start the app
    this.startMainApp();
  }

  /**
   * Start the main application
   */
  startMainApp() {
    if (this.mainAppCallback) {
      console.log('🚀 [FORCE-UPDATER] Starting main application...');
      this.mainAppCallback();
    }
  }

  /**
   * Show system notification
   */
  showNotification(title, body) {
    if (!isElectronContext || !app) return;
    
    try {
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        new Notification({ title, body, silent: false }).show();
      }
    } catch (error) {
      console.error('⚠️ [FORCE-UPDATER] Could not show notification:', error.message);
    }
  }

  /**
   * Start periodic background update checks (every 6 hours)
   */
  startPeriodicUpdateChecks() {
    if (!autoUpdater || !isElectronContext) {
      console.log('🔧 [FORCE-UPDATER] Periodic update checks not available');
      return;
    }

    if (this.isDevMode) {
      console.log('🔧 [FORCE-UPDATER] Skipping periodic update checks (dev mode)');
      return;
    }
    
    console.log('⏰ [FORCE-UPDATER] Starting periodic update checks (every 6 hours)');
    
    // Check after 30 seconds
    setTimeout(() => {
      this.checkForUpdates();
    }, 30000);
    
    // Then check every 6 hours
    setInterval(() => {
      this.checkForUpdates();
    }, 6 * 60 * 60 * 1000);
  }
}

module.exports = ForceUpdater; 
