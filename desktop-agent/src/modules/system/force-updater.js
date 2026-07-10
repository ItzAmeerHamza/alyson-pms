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

let autoUpdater, app, BrowserWindow, dialog, ipcMain, shell;

if (isElectronMain) {
  const electronUpdater = require('electron-updater');
  const electron = require('electron');
  autoUpdater = electronUpdater.autoUpdater;
  app = electron.app;
  BrowserWindow = electron.BrowserWindow;
  dialog = electron.dialog;
  ipcMain = electron.ipcMain;
  shell = electron.shell;
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
    this.installAttempts = 0;
    this.manualInstallRequired = false;
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

    // Detect install loops from prior sessions (download OK, install never applied)
    this.recoverFromInstallLoop();
    this.recoverFromStaleState();
    
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
        installAttempts: this.installAttempts,
        manualInstallRequired: this.manualInstallRequired,
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

        this.installAttempts = Number(state.installAttempts) || 0;
        this.manualInstallRequired = !!state.manualInstallRequired;
        
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
      this.installAttempts = 0;
      this.manualInstallRequired = false;
    } catch (error) {
      console.error('⚠️ [FORCE-UPDATER] Could not clear update state:', error.message);
    }
  }

  /**
   * Detect a prior failed install (downloaded update but app version unchanged).
   */
  recoverFromInstallLoop() {
    const saved = this.loadUpdateState();
    if (!saved?.pendingVersion || !this.currentVersion) return;

    const pending = String(saved.pendingVersion).replace(/^v/i, '');
    const current = String(this.currentVersion).replace(/^v/i, '');
    if (this.compareVersions(pending, current) <= 0) return;

    this.installAttempts = Number(saved.installAttempts) || 0;
    this.pendingVersion = pending;
    this.isUpdateAvailable = true;
    this.isUpdateRequired = true;
    this.isUpdateDownloaded = !!saved.isUpdateDownloaded;

    if (this.installAttempts >= 1) {
      console.log(`⚠️ [FORCE-UPDATER] Install loop detected (${this.installAttempts} attempts, still on ${current})`);
      this.manualInstallRequired = true;
      this.clearPendingUpdateCache();
      this.isUpdateDownloaded = false;
      this.saveUpdateState();
    }
  }

  recordInstallAttempt() {
    this.installAttempts = (this.installAttempts || 0) + 1;
    this.saveUpdateState();
    console.log(`📝 [FORCE-UPDATER] Install attempt #${this.installAttempts}`);
  }

  /**
   * macOS CI builds are unsigned — Squirrel quitAndInstall fails reliably.
   * Use one-click DMG download instead of ZIP + quitAndInstall.
   */
  shouldUseMacDmgInstall() {
    return process.platform === 'darwin' && !!(app && app.isPackaged);
  }

  /**
   * Clear saved update state when the installed build is already at/above pending.
   */
  recoverFromStaleState() {
    if (!this.pendingVersion || !this.currentVersion) return;

    const pending = String(this.pendingVersion).replace(/^v/i, '');
    const current = String(this.currentVersion).replace(/^v/i, '');
    if (this.compareVersions(current, pending) >= 0) {
      console.log(`✅ [FORCE-UPDATER] On ${current} (pending was ${pending}) — clearing stale update state`);
      this.isUpdateAvailable = false;
      this.isUpdateRequired = false;
      this.isUpdateDownloaded = false;
      this.pendingVersion = null;
      this.clearUpdateState();
    }
  }

  /**
   * Remove Squirrel/electron-updater cached payloads so a broken download can be retried.
   */
  clearPendingUpdateCache() {
    const os = require('os');
    const candidates = [
      path.join(os.homedir(), 'Library', 'Caches', 'com.alyson.work-time-agent.ShipIt'),
      path.join(os.homedir(), 'Library', 'Caches', 'alyson-pm-desktop-agent-updater'),
      path.join(this.appDataPath, 'pending'),
    ];

    for (const dir of candidates) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log('🗑️ [FORCE-UPDATER] Cleared update cache:', dir);
        }
      } catch (error) {
        console.warn('⚠️ [FORCE-UPDATER] Could not clear cache dir:', dir, error.message);
      }
    }
  }

  getManualDownloadUrl(version) {
    const gh = this.getGithubReleaseTarget();
    const tag = `v${String(version || this.pendingVersion || '').replace(/^v/i, '')}`;
    if (process.platform === 'win32') {
      const ver = tag.replace(/^v/i, '');
      return `https://github.com/${gh.owner}/${gh.repo}/releases/download/${tag}/Alyson.PM.Setup.${ver}.exe`;
    }
    const arch = process.arch === 'arm64' ? 'arm64' : 'mac';
    const suffix = arch === 'arm64' ? '-arm64.dmg' : '.dmg';
    const ver = tag.replace(/^v/i, '');
    return `https://github.com/${gh.owner}/${gh.repo}/releases/download/${tag}/Alyson.PM-${ver}${suffix}`;
  }

  openManualDownload() {
    const url = this.getManualDownloadUrl();
    if (shell?.openExternal) {
      shell.openExternal(url);
      return { success: true, url };
    }
    return { success: false, url, error: 'Cannot open browser' };
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

    safeHandle('open-manual-update-download', () => {
      return this.openManualDownload();
    });

    safeHandle('reset-update-cache', () => {
      this.clearPendingUpdateCache();
      this.isUpdateDownloaded = false;
      this.saveUpdateState();
      return { success: true };
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
      releaseType: 'release',
    });
    
    const useMacDmg = this.shouldUseMacDmgInstall();
    if (useMacDmg) {
      console.log('🍎 [FORCE-UPDATER] macOS packaged build — using DMG installer path (unsigned builds)');
    }
    // Unsigned macOS builds cannot apply Squirrel updates; skip background ZIP download there.
    autoUpdater.autoDownload = !useMacDmg;
    autoUpdater.autoInstallOnAppQuit = !useMacDmg;
    
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
      const current = String(this.currentVersion || '').replace(/^v/i, '');
      const remote = String(info?.version || '').replace(/^v/i, '');
      if (this.compareVersions(remote, current) <= 0) {
        console.log('⚠️ [FORCE-UPDATER] update-not-available — verifying newest release via GitHub API');
        void this.checkGithubFallbackForUpdate().then((fallback) => {
          if (fallback) {
            const payload = this.markUpdateAvailable(fallback.version);
            this.notifyUpdateAvailable(payload);
          }
        });
        return;
      }
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
   * Notify renderer to show mandatory update UI
   */
  notifyUpdateAvailable(result = {}) {
    if (!result.updateAvailable && !result.newVersion) return;
    const dmgInstallReady = !!(result.dmgInstallReady || (this.shouldUseMacDmgInstall() && (result.newVersion || this.pendingVersion)));
    this.sendToRenderer('mandatory-update-required', {
      version: result.newVersion || this.pendingVersion,
      currentVersion: result.currentVersion || this.currentVersion,
      updateDownloaded: !!(result.updateDownloaded || this.isUpdateDownloaded),
      manualInstallRequired: !!(result.manualInstallRequired || this.manualInstallRequired || dmgInstallReady),
      dmgInstallReady,
      manualDownloadUrl: this.getManualDownloadUrl(result.newVersion || this.pendingVersion),
      releaseNotes: result.releaseNotes || '',
    });
    this.sendToRenderer('update-available', {
      version: result.newVersion || this.pendingVersion,
      currentVersion: result.currentVersion || this.currentVersion,
      releaseNotes: result.releaseNotes || '',
    });
  }

  /**
   * Fallback: query GitHub API for newest pre-release with updater metadata.
   * Used when electron-updater returns no_info/error but a newer build exists.
   */
  async fetchLatestPrereleaseViaGithubApi() {
    const gh = this.getGithubReleaseTarget();
    const url = `https://api.github.com/repos/${gh.owner}/${gh.repo}/releases?per_page=30`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'alyson-pm-desktop-agent-updater',
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub releases API returned ${res.status}`);
    }
    const releases = await res.json();
    if (!Array.isArray(releases)) return null;

    const platformAsset = process.platform === 'win32' ? 'latest.yml' : 'latest-mac.yml';
    const candidate = releases.find((r) => {
      if (r.draft) return false;
      const assets = r.assets || [];
      if (assets.some((a) => a.name === platformAsset)) return true;
      if (process.platform === 'darwin') {
        return assets.some((a) => /\.dmg$/i.test(a.name));
      }
      return false;
    });
    if (!candidate) return null;

    const version = String(candidate.tag_name || '').replace(/^v/i, '');
    return { version, tagName: candidate.tag_name, publishedAt: candidate.published_at };
  }

  async checkGithubFallbackForUpdate() {
    try {
      const latest = await this.fetchLatestPrereleaseViaGithubApi();
      if (!latest?.version) return null;
      const current = String(this.currentVersion || '').replace(/^v/i, '');
      if (this.compareVersions(latest.version, current) > 0) {
        console.log(`🆕 [FORCE-UPDATER] GitHub API fallback found newer version: ${current} → ${latest.version}`);
        return latest;
      }
    } catch (err) {
      console.warn('⚠️ [FORCE-UPDATER] GitHub API fallback failed:', err?.message || err);
    }
    return null;
  }

  markUpdateAvailable(remoteVersion, releaseNotes = '') {
    const normalized = String(remoteVersion || '').replace(/^v/i, '');
    const dmgInstallReady = this.shouldUseMacDmgInstall();
    this.isUpdateAvailable = true;
    this.isUpdateRequired = true;
    this.pendingVersion = normalized;
    this.updateError = null;
    if (dmgInstallReady) {
      this.manualInstallRequired = true;
      this.isUpdateDownloaded = false;
    }
    this.saveUpdateState();
    return {
      updateAvailable: true,
      updateDownloaded: dmgInstallReady ? false : this.isUpdateDownloaded,
      currentVersion: this.currentVersion,
      newVersion: normalized,
      releaseNotes,
      dmgInstallReady,
      manualInstallRequired: this.manualInstallRequired || dmgInstallReady,
      manualDownloadUrl: dmgInstallReady ? this.getManualDownloadUrl(normalized) : undefined,
    };
  }

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
    if (this.isUpdateDownloaded && this.pendingVersion && !this.manualInstallRequired && !this.shouldUseMacDmgInstall()) {
      console.log('📦 [FORCE-UPDATER] Already have downloaded update:', this.pendingVersion);
      return {
        updateAvailable: true,
        updateDownloaded: true,
        currentVersion: this.currentVersion,
        newVersion: this.pendingVersion,
        manualInstallRequired: false,
      };
    }

    if ((this.manualInstallRequired || this.shouldUseMacDmgInstall()) && this.pendingVersion) {
      console.log('📦 [FORCE-UPDATER] DMG/manual install required for:', this.pendingVersion);
      return {
        updateAvailable: true,
        updateDownloaded: false,
        manualInstallRequired: true,
        dmgInstallReady: this.shouldUseMacDmgInstall(),
        manualDownloadUrl: this.getManualDownloadUrl(this.pendingVersion),
        currentVersion: this.currentVersion,
        newVersion: this.pendingVersion,
      };
    }

    // Check if we already know about an available update
    if (this.isUpdateAvailable && this.pendingVersion) {
      console.log('📦 [FORCE-UPDATER] Already know about update:', this.pendingVersion);
      const dmgInstallReady = this.shouldUseMacDmgInstall();
      return {
        updateAvailable: true,
        updateDownloaded: dmgInstallReady ? false : this.isUpdateDownloaded,
        manualInstallRequired: this.manualInstallRequired || dmgInstallReady,
        dmgInstallReady,
        manualDownloadUrl: (this.manualInstallRequired || dmgInstallReady) ? this.getManualDownloadUrl(this.pendingVersion) : undefined,
        currentVersion: this.currentVersion,
        newVersion: this.pendingVersion
      };
    }

    console.log('🔍 [FORCE-UPDATER] Checking for updates...');
    this.recoverFromStaleState();

    const currentVersion = String(this.currentVersion || '').replace(/^v/i, '');
    let apiLatest = null;
    let electronRemote = null;
    let electronReleaseNotes = '';

    try {
      apiLatest = await this.checkGithubFallbackForUpdate();
    } catch (apiErr) {
      console.warn('⚠️ [FORCE-UPDATER] GitHub API pre-check failed:', apiErr?.message || apiErr);
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo?.version) {
        electronRemote = String(result.updateInfo.version).replace(/^v/i, '');
        electronReleaseNotes = result.updateInfo.releaseNotes || '';
        console.log(`📡 [FORCE-UPDATER] electron-updater remote: ${electronRemote}`);
      }
    } catch (error) {
      console.error('❌ [FORCE-UPDATER] electron-updater check error:', error.message);
      if (!apiLatest) {
        const fallback = await this.checkGithubFallbackForUpdate();
        if (fallback) {
          return this.markUpdateAvailable(fallback.version);
        }
      }
      return {
        updateAvailable: false,
        reason: 'error',
        error: error.message,
        currentVersion: this.currentVersion,
      };
    }

    let newestRemote = null;
    let releaseNotes = '';
    let updateSource = null;

    if (apiLatest?.version && this.compareVersions(apiLatest.version, currentVersion) > 0) {
      newestRemote = apiLatest.version;
      releaseNotes = '';
      updateSource = 'github-api';
    }

    if (electronRemote && this.compareVersions(electronRemote, currentVersion) > 0) {
      if (!newestRemote || this.compareVersions(electronRemote, newestRemote) > 0) {
        newestRemote = electronRemote;
        releaseNotes = electronReleaseNotes;
        updateSource = 'electron-updater';
      }
    }

    if (newestRemote) {
      console.log(`🆕 [FORCE-UPDATER] Update available (${updateSource}): ${currentVersion} → ${newestRemote}`);
      const payload = this.markUpdateAvailable(newestRemote, releaseNotes);
      payload.updateSource = updateSource;
      return payload;
    }

    const checkedVersion = electronRemote || apiLatest?.version || currentVersion;
    console.log(`✅ [FORCE-UPDATER] Up to date (${currentVersion}), newest seen: ${checkedVersion}`);
    return {
      updateAvailable: false,
      currentVersion: this.currentVersion,
      checkedVersion,
    };
  }

  /**
   * Manual update check (settings / IPC) — always hits remote and notifies UI.
   */
  async manualUpdateCheck() {
    const result = await this.checkForUpdates();
    if (result?.updateAvailable) {
      this.notifyUpdateAvailable(result);
    } else {
      this.sendToRenderer('update-not-available', {
        currentVersion: this.currentVersion,
      });
    }
    return result;
  }

  /**
   * Compare two semantic versions
   * Returns: 1 if a > b, -1 if a < b, 0 if equal
   */
  compareVersions(a, b) {
    const clean = (v) => String(v || '').replace(/^v/i, '').trim();
    const partsA = clean(a).split('.').map(Number);
    const partsB = clean(b).split('.').map(Number);
    
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

    if (this.shouldUseMacDmgInstall()) {
      console.log('🍎 [FORCE-UPDATER] macOS DMG path — skipping ZIP download');
      return {
        success: true,
        alreadyDownloaded: true,
        dmgInstall: true,
        manualDownloadUrl: this.getManualDownloadUrl(),
      };
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
      pendingVersion: this.pendingVersion,
      installAttempts: this.installAttempts,
      manualInstallRequired: this.manualInstallRequired,
    });

    if (this.shouldUseMacDmgInstall() || this.manualInstallRequired) {
      const url = this.getManualDownloadUrl();
      this.openManualDownload();
      return {
        success: true,
        installing: false,
        dmgOpened: true,
        manualInstallRequired: true,
        manualDownloadUrl: url,
        message: 'Installer opened in your browser. Drag Alyson PM to Applications to replace the old version, then reopen the app.',
      };
    }

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
      if (this.pendingVersion && this.downloadProgress >= 100) {
        console.log('🔧 [FORCE-UPDATER] Download progress 100% but flag not set - trying install anyway');
        this.isUpdateDownloaded = true;
      } else {
        return { success: false, error: 'No update downloaded', installing: false };
      }
    }

    console.log('🔄 [FORCE-UPDATER] Installing update and restarting...');
    global.isInstallingUpdate = true;
    this.recordInstallAttempt();

    setTimeout(() => {
      try {
        console.log(`🚀 [FORCE-UPDATER] quitAndInstall on ${process.platform}`);
        if (process.platform === 'win32') {
          autoUpdater.quitAndInstall(true, true);
        } else {
          autoUpdater.quitAndInstall(false, true);
        }
      } catch (quitErr) {
        console.error('❌ [FORCE-UPDATER] quitAndInstall() error:', quitErr.message);
        global.isInstallingUpdate = false;
        if (this.installAttempts >= 1) {
          this.manualInstallRequired = true;
          this.clearPendingUpdateCache();
          this.isUpdateDownloaded = false;
          this.saveUpdateState();
          this.sendToRenderer('manual-update-required', {
            version: this.pendingVersion,
            currentVersion: this.currentVersion,
            manualDownloadUrl: this.getManualDownloadUrl(),
            error: quitErr.message,
          });
        }
        if (app) {
          app.relaunch();
          app.exit(0);
        }
      }
    }, 250);

    return { success: true, installing: true };
  }

  /**
   * Get current update status
   */
  getUpdateStatus() {
    const dmgInstallReady = this.shouldUseMacDmgInstall() && !!(this.isUpdateAvailable && this.pendingVersion);
    return {
      isUpdateAvailable: this.isUpdateAvailable,
      isUpdateRequired: this.isUpdateRequired,
      isUpdateDownloaded: this.isUpdateDownloaded,
      isDownloading: this.isDownloading,
      currentVersion: this.currentVersion,
      pendingVersion: this.pendingVersion,
      downloadProgress: this.downloadProgress,
      updateError: this.updateError,
      installAttempts: this.installAttempts,
      manualInstallRequired: this.manualInstallRequired || dmgInstallReady,
      dmgInstallReady,
      manualDownloadUrl: (this.manualInstallRequired || dmgInstallReady) ? this.getManualDownloadUrl() : undefined,
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
      console.log('🆕 [FORCE-UPDATER] Update available — app start blocked until install');
      this.sendToRenderer('mandatory-update-required', {
        version: result.newVersion,
        currentVersion: result.currentVersion,
        updateDownloaded: result.updateDownloaded || false,
      });
      return result;
    }
    
    // Start the app only when no update is pending
    this.startMainApp();
    return result;
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

    const runStartupCheck = () => {
      this.checkForUpdates().then((result) => {
        if (result?.updateAvailable) {
          this.notifyUpdateAvailable(result);
        }
      }).catch((err) => {
        console.warn('⚠️ [FORCE-UPDATER] Startup update check failed:', err?.message || err);
      });
    };

    // Check immediately and again after 3s (login screen should block before sign-in).
    runStartupCheck();
    setTimeout(runStartupCheck, 3000);
    
    // Then check every 6 hours
    setInterval(() => {
      this.checkForUpdates();
    }, 6 * 60 * 60 * 1000);
  }
}

module.exports = ForceUpdater; 
