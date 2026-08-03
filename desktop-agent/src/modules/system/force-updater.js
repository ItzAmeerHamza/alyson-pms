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
    this.macStagedAppPath = null;
    this.macUpdateWorkDir = null;
    /** @type {string|null} Path to a Node-downloaded Windows Setup.exe ready to launch */
    this.windowsInstallerPath = null;
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
        windowsInstallerPath: this.windowsInstallerPath || null,
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
        if (
          state.windowsInstallerPath &&
          typeof state.windowsInstallerPath === 'string' &&
          fs.existsSync(state.windowsInstallerPath)
        ) {
          this.windowsInstallerPath = state.windowsInstallerPath;
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
      this.installAttempts = 0;
      this.manualInstallRequired = false;
      this.windowsInstallerPath = null;
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
   * macOS packaged build. Unsigned builds can't use Squirrel quitAndInstall,
   * so we run a custom in-place bundle swap instead (with DMG fallback).
   */
  isMacPackaged() {
    return process.platform === 'darwin' && !!(app && app.isPackaged);
  }

  /**
   * Legacy flag kept for older UI branches. The in-place updater is now the
   * primary macOS path; DMG is only a fallback after a failed swap, so this
   * returns false to keep the normal download → install UI flow.
   */
  shouldUseMacDmgInstall() {
    return false;
  }

  /**
   * Arch-appropriate ZIP asset URL used by the macOS in-place updater.
   * electron-builder names them Alyson.PM-<ver>-arm64-mac.zip / -mac.zip.
   */
  getMacZipUrl(version) {
    const gh = this.getGithubReleaseTarget();
    const ver = String(version || this.pendingVersion || '').replace(/^v/i, '');
    const tag = `v${ver}`;
    const archSuffix = process.arch === 'arm64' ? 'arm64-mac' : 'mac';
    return `https://github.com/${gh.owner}/${gh.repo}/releases/download/${tag}/Alyson.PM-${ver}-${archSuffix}.zip`;
  }

  /**
   * Resolve the installed .app bundle path from the running executable.
   */
  getInstalledAppBundlePath() {
    try {
      const exe = app.getPath('exe');
      const marker = '/Contents/MacOS/';
      const idx = exe.indexOf(marker);
      if (idx !== -1) return exe.slice(0, idx);
      return path.resolve(path.dirname(exe), '..', '..');
    } catch {
      return null;
    }
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
    
    const macInPlace = this.isMacPackaged();
    if (macInPlace) {
      console.log('🍎 [FORCE-UPDATER] macOS packaged build — using custom in-place updater (unsigned builds)');
    }
    // On macOS we download/install manually (Squirrel cannot apply unsigned updates).
    autoUpdater.autoDownload = !macInPlace;
    autoUpdater.autoInstallOnAppQuit = !macInPlace;
    // Differential downloads hit GitHub CDN with many range requests and fail often
    // on corporate/VPN networks (net::ERR_ADDRESS_UNREACHABLE). Prefer one full file.
    try {
      autoUpdater.disableDifferentialDownload = true;
    } catch (_) {}
    
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

      // Windows: electron-updater often emits net::ERR_ADDRESS_UNREACHABLE while we
      // still have a Node https fallback in flight. Don't scare the user with raw Chromium codes.
      if (process.platform === 'win32' && this.isTransientNetworkUpdateError(err)) {
        this.updateError = err.message;
        this.isDownloading = false;
        this.sendToRenderer('update-download-progress', {
          percent: this.downloadProgress || 0,
          message: 'Primary download failed — trying alternate method…',
        });
        return;
      }
      
      this.updateError = err.message;
      this.isDownloading = false;
      
      // Notify renderer
      this.sendToRenderer('update-error', {
        error: isDevModeError ? 
          'Development mode: Update downloaded but install requires production build. Run "npm run build" then test the built app.' :
          this.friendlyUpdateError(err.message)
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
    
    // macOS in-place staging (macStagedAppPath) lives in memory only, but isUpdateDownloaded
    // is persisted to disk. After a restart the flag reloads as true with no staged bundle,
    // which used to shortcut Download and push Install into the DMG fallback. Reconcile here
    // so a "downloaded" update without its staged bundle is treated as needing a re-download.
    if (
      this.isMacPackaged() &&
      this.isUpdateDownloaded &&
      !(this.macStagedAppPath && fs.existsSync(this.macStagedAppPath))
    ) {
      console.log('🍎 [FORCE-UPDATER] Persisted downloaded flag has no staged bundle — will re-download for in-place install');
      this.isUpdateDownloaded = false;
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
      if (
        process.platform === 'win32' &&
        this.windowsInstallerPath &&
        fs.existsSync(this.windowsInstallerPath)
      ) {
        console.log('📦 [FORCE-UPDATER] Already have Node-downloaded Windows installer:', this.windowsInstallerPath);
        return {
          updateAvailable: true,
          updateDownloaded: true,
          windowsInstallerReady: true,
          alreadyDownloaded: true,
          currentVersion: this.currentVersion,
          newVersion: this.pendingVersion,
          manualInstallRequired: false,
        };
      }
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

    // Do NOT short-circuit on a remembered pendingVersion from disk. That left
    // Windows clients stuck offering an old build (e.g. 1.0.206) and calling
    // downloadUpdate() without a fresh electron-updater check ("Please check
    // update first"). Always re-query the remote below.

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
      // On macOS the staged bundle is in-memory; if it's gone (restart, tmp cleanup),
      // re-stage instead of reporting "already downloaded" with nothing to install.
      const stagedValid = this.macStagedAppPath && fs.existsSync(this.macStagedAppPath);
      if (this.isMacPackaged() && !stagedValid) {
        console.log('📦 [FORCE-UPDATER] Downloaded flag set but staged bundle missing — re-staging in-place update');
        this.isUpdateDownloaded = false;
      } else {
        console.log('📦 [FORCE-UPDATER] Update already downloaded');
        return { success: true, alreadyDownloaded: true };
      }
    }

    if (this.isDownloading) {
      console.log('📥 [FORCE-UPDATER] Download already in progress');
      return { success: true, inProgress: true };
    }

    if (!this.isUpdateAvailable) {
      console.log('⚠️ [FORCE-UPDATER] No update available to download');
      return { success: false, error: 'No update available' };
    }

    if (this.isMacPackaged()) {
      return await this.downloadMacInPlaceUpdate();
    }

    // Windows: prefer Node https download of Setup.exe. Electron's Chromium net
    // stack frequently fails with net::ERR_ADDRESS_UNREACHABLE against GitHub's
    // release CDN on employee networks; Node + IPv4 is much more reliable.
    if (process.platform === 'win32') {
      console.log('📥 [FORCE-UPDATER] Windows — downloading Setup.exe via Node (primary path)...');
      const nodePrimary = await this.downloadWindowsInstallerViaNode();
      if (nodePrimary?.success) {
        return nodePrimary;
      }
      console.warn(
        '⚠️ [FORCE-UPDATER] Node primary download failed, trying electron-updater:',
        nodePrimary?.error
      );
    }

    // electron-updater keeps updateInfo only in-memory for this process. A
    // restored disk flag (isUpdateAvailable) is not enough — downloadUpdate()
    // then throws "Please check update first". Always refresh metadata first.
    try {
      console.log('📥 [FORCE-UPDATER] Running electron-updater check before download...');
      const checkResult = await autoUpdater.checkForUpdates();
      const remote = checkResult?.updateInfo?.version
        ? String(checkResult.updateInfo.version).replace(/^v/i, '')
        : null;
      if (remote) {
        this.isUpdateAvailable = true;
        this.pendingVersion = remote;
        this.saveUpdateState();
        console.log(`📡 [FORCE-UPDATER] Pre-download remote version: ${remote}`);
      } else {
        // Fall back to our GitHub API check so we at least know the latest tag.
        const api = await this.checkGithubFallbackForUpdate();
        if (api?.version) {
          this.isUpdateAvailable = true;
          this.pendingVersion = api.version;
          this.saveUpdateState();
        }
      }
    } catch (preCheckErr) {
      console.warn('⚠️ [FORCE-UPDATER] Pre-download check failed:', preCheckErr?.message || preCheckErr);
    }

    console.log('📥 [FORCE-UPDATER] Starting electron-updater download...');
    this.isDownloading = true;
    this.downloadProgress = 0;

    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('❌ [FORCE-UPDATER] Download failed:', error.message);
      this.isDownloading = false;
      this.updateError = error.message;

      // Retry once: check → download (covers "Please check update first").
      if (/please check update first/i.test(String(error.message || ''))) {
        try {
          console.log('🔁 [FORCE-UPDATER] Retrying download after fresh check...');
          await autoUpdater.checkForUpdates();
          this.isDownloading = true;
          await autoUpdater.downloadUpdate();
          return { success: true };
        } catch (retryErr) {
          console.error('❌ [FORCE-UPDATER] Retry download failed:', retryErr.message);
          this.isDownloading = false;
          this.updateError = retryErr.message;
          if (process.platform === 'win32') {
            return this._windowsDownloadFallback(retryErr.message);
          }
          return { success: false, error: retryErr.message };
        }
      }

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

      // Windows: Node already tried as primary; last resort is browser.
      if (process.platform === 'win32') {
        return this._windowsManualInstallFallback(error.message);
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Prefer in-app Node download of Setup.exe; only open the browser if that fails too.
   */
  async _windowsDownloadFallback(reason) {
    console.log(`🔧 [FORCE-UPDATER] Windows download fallback after: ${reason || 'unknown'}`);
    this.sendToRenderer('update-download-progress', {
      percent: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total: 0,
      via: 'node-fallback',
      message: 'Retrying download…',
    });

    const nodeResult = await this.downloadWindowsInstallerViaNode();
    if (nodeResult?.success && (nodeResult.windowsInstallerReady || nodeResult.alreadyDownloaded || nodeResult.inProgress)) {
      return nodeResult;
    }

    return this._windowsManualInstallFallback(nodeResult?.error || reason);
  }

  /**
   * Last-resort Windows path when in-app download cannot complete.
   * Do NOT auto-open the browser — that made every slow-network failure look like
   * "auto update never works". Offer Retry + an optional manual URL instead.
   */
  _windowsManualInstallFallback(reason) {
    const url = this.getManualDownloadUrl(this.pendingVersion);
    this.manualInstallRequired = true;
    this.isUpdateDownloaded = false;
    this.saveUpdateState();
    console.log(`🔧 [FORCE-UPDATER] Windows manual fallback ready (browser NOT opened): ${url} (${reason || 'unknown'})`);
    const friendly = this.isTransientNetworkUpdateError(reason)
      ? 'Could not reach the update server from the app. Click Retry Update. If it keeps failing, use Download Installer Manually.'
      : 'Automatic download failed. Click Retry Update. If it keeps failing, use Download Installer Manually.';
    return {
      success: false,
      error: reason || 'download_failed',
      fallbackToWindowsInstaller: true,
      manualInstallRequired: true,
      manualDownloadUrl: url,
      // UI can open browser only when the user clicks the manual button.
      openBrowser: false,
      version: this.pendingVersion,
      message: friendly,
    };
  }

  /**
   * Download a file over HTTPS following redirects, reporting progress.
   * Forces IPv4 first — broken IPv6 on many Windows networks surfaces as
   * net::ERR_ADDRESS_UNREACHABLE / ENETUNREACH when Electron's Chromium net is used.
   *
   * IMPORTANT: do NOT use a short absolute socket timeout. Corporate networks often
   * download the ~100MB Windows installer at 20–50 KB/s (30–60+ minutes). A 3-minute
   * hard timeout was the main reason Windows "auto update" always fell back to the browser.
   *
   * @param {object} [opts]
   * @param {number} [opts.family=4] - 4 = IPv4, 6 = IPv6, 0 = dual
   * @param {number} [opts.idleTimeoutMs=180000] - abort only if NO bytes arrive for this long
   * @param {number} [opts.maxDurationMs=3600000] - absolute max (default 60 minutes)
   */
  downloadFile(url, destPath, onProgress, {
    family = 4,
    idleTimeoutMs = 180000,
    maxDurationMs = 60 * 60 * 1000,
  } = {}) {
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      let settled = false;
      let idleTimer = null;
      let hardTimer = null;
      let activeReq = null;
      let activeRes = null;
      let outStream = null;

      const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (hardTimer) clearTimeout(hardTimer);
        idleTimer = null;
        hardTimer = null;
      };

      const fail = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        try { activeReq?.destroy?.(err); } catch (_) {}
        try { activeRes?.destroy?.(err); } catch (_) {}
        try { outStream?.destroy?.(err); } catch (_) {}
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {}
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const succeed = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const bumpIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          fail(new Error(`Download stalled (no data for ${Math.round(idleTimeoutMs / 1000)}s)`));
        }, idleTimeoutMs);
      };

      hardTimer = setTimeout(() => {
        fail(new Error(`Download exceeded ${Math.round(maxDurationMs / 60000)} minute limit`));
      }, maxDurationMs);

      const request = (currentUrl, redirects = 0) => {
        if (settled) return;
        if (redirects > 8) return fail(new Error('Too many redirects'));
        let parsed;
        try {
          parsed = new URL(currentUrl);
        } catch (e) {
          return fail(new Error(`Invalid download URL: ${currentUrl}`));
        }
        const lib = parsed.protocol === 'http:' ? http : https;
        const opts = {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
          path: `${parsed.pathname}${parsed.search || ''}`,
          headers: {
            'User-Agent': 'alyson-pm-desktop-agent-updater',
            Accept: '*/*',
          },
          // Connect/headers only — body uses idle timeout so slow corporate links work.
          timeout: Math.min(120000, idleTimeoutMs),
        };
        if (family === 4 || family === 6) {
          opts.family = family;
        }
        bumpIdle();
        const req = lib.get(opts, (res) => {
          activeRes = res;
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const next = new URL(res.headers.location, currentUrl).toString();
            res.resume();
            return request(next, redirects + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return fail(new Error(`Download failed: HTTP ${res.statusCode}`));
          }
          const total = parseInt(res.headers['content-length'] || '0', 10);
          let received = 0;
          outStream = fs.createWriteStream(destPath);
          bumpIdle();
          res.on('data', (chunk) => {
            received += chunk.length;
            bumpIdle();
            if (typeof onProgress === 'function') {
              const percent = total
                ? Math.round((received / total) * 100)
                : Math.min(99, Math.round(received / (1024 * 1024)));
              onProgress(percent, received, total);
            }
          });
          res.on('error', fail);
          res.pipe(outStream);
          outStream.on('finish', () => {
            outStream.close(() => {
              succeed({
                received,
                total,
                elapsedMs: Date.now() - startedAt,
              });
            });
          });
          outStream.on('error', fail);
        });
        activeReq = req;
        req.on('error', fail);
        req.on('timeout', () => {
          // Only applies before response body starts; body uses idle timer.
          req.destroy(new Error('Connection timed out'));
        });
      };
      request(url);
    });
  }

  /**
   * True when the failure looks like a network / CDN reachability problem
   * (common for GitHub release-assets.githubusercontent.com on Windows).
   */
  isTransientNetworkUpdateError(err) {
    const msg = String(err?.message || err || '');
    return /ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|ERR_TIMED_OUT|ENETUNREACH|EHOSTUNREACH|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|getaddrinfo|Download timed out|Download failed: HTTP 5/i.test(msg);
  }

  friendlyUpdateError(message) {
    const msg = String(message || '');
    if (this.isTransientNetworkUpdateError(msg)) {
      return 'Could not reach the update server. Retrying with an alternate download…';
    }
    if (/please check update first/i.test(msg)) {
      return 'Update check expired. Click Retry Update.';
    }
    return msg || 'Update failed. Please try again.';
  }

  /**
   * Download the Windows NSIS Setup.exe with Node https (IPv4 + retries), then
   * stage it for install. Used when electron-updater's Chromium download fails.
   */
  async downloadWindowsInstallerViaNode() {
    const os = require('os');
    const version = String(this.pendingVersion || '').replace(/^v/i, '');
    if (!version) {
      return { success: false, error: 'No pending version for Windows installer download' };
    }

    if (this.isDownloading) {
      return { success: true, inProgress: true };
    }

    const url = this.getManualDownloadUrl(version);
    const destDir = path.join(os.tmpdir(), 'alyson-pm-updates');
    try {
      fs.mkdirSync(destDir, { recursive: true });
    } catch (_) {}
    const destPath = path.join(destDir, `Alyson.PM.Setup.${version}.exe`);

    console.log(`📥 [FORCE-UPDATER] Windows Node download: ${url}`);
    this.isDownloading = true;
    this.downloadProgress = 0;
    this.updateError = null;
    // Fresh attempt — clear sticky "manual only" so Retry can succeed in-app.
    this.manualInstallRequired = false;
    this.sendToRenderer('update-download-progress', {
      percent: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total: 0,
      via: 'node',
      message: 'Downloading update… this can take a while on slow networks.',
    });

    const families = [4, 0]; // IPv4 first, then dual-stack
    let lastErr = null;
    let lastProgressAt = Date.now();
    let lastReceived = 0;

    for (const family of families) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (fs.existsSync(destPath)) {
            try { fs.unlinkSync(destPath); } catch (_) {}
          }
          const result = await this.downloadFile(
            url,
            destPath,
            (percent, received, total) => {
              this.downloadProgress = percent;
              const now = Date.now();
              const dt = Math.max(1, now - lastProgressAt);
              const bytesPerSecond = Math.max(0, Math.round(((received - lastReceived) * 1000) / dt));
              lastProgressAt = now;
              lastReceived = received;
              this.sendToRenderer('update-download-progress', {
                percent,
                transferred: received,
                total: total || 0,
                bytesPerSecond,
                via: 'node',
                message: total
                  ? `Downloading update… ${percent}%`
                  : 'Downloading update…',
              });
            },
            {
              family,
              // Stall only if truly idle; allow up to 60 minutes for slow links.
              idleTimeoutMs: 5 * 60 * 1000,
              maxDurationMs: 60 * 60 * 1000,
            }
          );

          const size = result?.received || (fs.existsSync(destPath) ? fs.statSync(destPath).size : 0);
          if (!size || size < 1024 * 1024) {
            throw new Error(`Downloaded installer too small (${size} bytes)`);
          }

          this.windowsInstallerPath = destPath;
          this.isUpdateDownloaded = true;
          this.isDownloading = false;
          this.downloadProgress = 100;
          this.manualInstallRequired = false;
          this.updateError = null;
          this.saveUpdateState();
          this.sendToRenderer('update-downloaded', {
            version,
            currentVersion: this.currentVersion,
            via: 'node',
          });
          console.log(
            `✅ [FORCE-UPDATER] Windows installer saved (${size} bytes in ${Math.round((result?.elapsedMs || 0) / 1000)}s): ${destPath}`
          );
          return {
            success: true,
            windowsInstallerReady: true,
            alreadyDownloaded: true,
            path: destPath,
            version,
          };
        } catch (err) {
          lastErr = err;
          console.warn(
            `⚠️ [FORCE-UPDATER] Windows Node download failed (family=${family}, attempt=${attempt}):`,
            err?.message || err
          );
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }

    this.isDownloading = false;
    this.updateError = lastErr?.message || 'Windows installer download failed';
    return { success: false, error: this.updateError };
  }

  /**
   * Launch a previously downloaded Windows Setup.exe and quit so NSIS can replace files.
   */
  launchWindowsInstaller(installerPath) {
    const { spawn } = require('child_process');
    const exePath = installerPath || this.windowsInstallerPath;
    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, error: 'Windows installer file not found' };
    }

    console.log(`🚀 [FORCE-UPDATER] Launching Windows installer: ${exePath}`);
    global.isInstallingUpdate = true;
    this.recordInstallAttempt();

    try {
      // Detached so NSIS keeps running after we exit.
      // /S = silent oneClick NSIS reinstall (no wizard). UAC may still prompt.
      const child = spawn(exePath, ['/S'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch (err) {
      global.isInstallingUpdate = false;
      console.error('❌ [FORCE-UPDATER] Failed to spawn Windows installer:', err.message);
      // Last resort: open in Explorer / default handler
      try {
        if (shell?.openPath) {
          shell.openPath(exePath);
        } else if (shell?.openExternal) {
          shell.openExternal(`file:///${exePath.replace(/\\/g, '/')}`);
        }
      } catch (_) {
        return { success: false, error: err.message };
      }
    }

    setTimeout(() => {
      try {
        if (app) {
          app.quit();
        }
      } catch (_) {
        process.exit(0);
      }
    }, 800);

    return {
      success: true,
      installing: true,
      via: 'windows-setup-exe',
      message: 'Installer started. Follow the prompts, then reopen Alyson PM.',
    };
  }

  /**
   * macOS custom updater: download the release ZIP, extract, strip quarantine,
   * preserve a stable CI code signature (or ad-hoc-sign only if unsigned), and
   * stage the new .app for an in-place swap on install.
   * Falls back to DMG download if any step fails.
   */
  async downloadMacInPlaceUpdate() {
    const os = require('os');
    const { execFileSync } = require('child_process');

    if (this.isDownloading) {
      return { success: true, inProgress: true };
    }

    this.isDownloading = true;
    this.downloadProgress = 0;
    this.macStagedAppPath = null;

    const version = String(this.pendingVersion || '').replace(/^v/i, '');
    const workDir = path.join(os.tmpdir(), `alyson-pm-update-${version}-${Date.now()}`);
    const zipPath = path.join(workDir, 'update.zip');
    const extractDir = path.join(workDir, 'extracted');

    try {
      // Verify we can write to the installed bundle location before downloading.
      const bundlePath = this.getInstalledAppBundlePath();
      if (!bundlePath) throw new Error('Could not resolve installed app path');
      const parentDir = path.dirname(bundlePath);
      try {
        fs.accessSync(parentDir, fs.constants.W_OK);
      } catch {
        throw new Error(`No write access to ${parentDir} (app likely needs manual install)`);
      }

      fs.mkdirSync(extractDir, { recursive: true });

      const url = this.getMacZipUrl(version);
      console.log('📥 [FORCE-UPDATER] macOS in-place download:', url);

      await this.downloadFile(url, zipPath, (percent) => {
        this.downloadProgress = percent;
        this.sendToRenderer('update-download-progress', { percent });
      });

      console.log('📦 [FORCE-UPDATER] Extracting update ZIP...');
      execFileSync('ditto', ['-x', '-k', zipPath, extractDir], { timeout: 120000 });

      const appName = fs.readdirSync(extractDir).find((n) => n.endsWith('.app'));
      if (!appName) throw new Error('No .app found in update ZIP');
      const stagedApp = path.join(extractDir, appName);

      // Remove quarantine so Gatekeeper does not block the swapped bundle.
      try { execFileSync('xattr', ['-cr', stagedApp], { timeout: 60000 }); } catch (e) {
        console.warn('⚠️ [FORCE-UPDATER] xattr strip warning:', e.message);
      }

      // Preserve a stable CI signature so macOS TCC permissions (Screen Recording /
      // Accessibility) survive the in-place swap. Ad-hoc re-signing ("-") creates a
      // NEW identity on every update and forces users to re-grant permissions.
      // Only fall back to ad-hoc when the downloaded bundle is unsigned / ad-hoc.
      this._ensureMacBundleSignature(stagedApp);

      this.macStagedAppPath = stagedApp;
      this.macUpdateWorkDir = workDir;
      this.isDownloading = false;
      this.isUpdateDownloaded = true;
      this.downloadProgress = 100;
      this.manualInstallRequired = false;
      this.saveUpdateState();

      this.sendToRenderer('update-downloaded', { version });
      console.log('✅ [FORCE-UPDATER] macOS update staged for in-place install:', stagedApp);
      return { success: true, inPlaceReady: true };
    } catch (error) {
      console.error('❌ [FORCE-UPDATER] macOS in-place download failed:', error.message);
      this.isDownloading = false;
      this.updateError = error.message;
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}

      // Fall back to manual DMG install so the user is never stuck.
      this.manualInstallRequired = true;
      this.saveUpdateState();
      return {
        success: false,
        error: 'in_place_failed',
        fallbackToDmg: true,
        manualInstallRequired: true,
        manualDownloadUrl: this.getManualDownloadUrl(version),
        message: 'Automatic update could not complete. Use Download Installer to finish updating.',
      };
    }
  }

  /**
   * Keep a stable CI code signature when present; only ad-hoc sign unsigned /
   * ad-hoc bundles. Stable identity is required for TCC permissions to persist
   * across in-place updates.
   */
  _ensureMacBundleSignature(stagedApp) {
    const { spawnSync } = require('child_process');
    const { execFileSync } = require('child_process');

    const probe = spawnSync('codesign', ['-dv', '--verbose=2', stagedApp], {
      encoding: 'utf8',
      timeout: 30000,
    });
    const info = `${probe.stdout || ''}${probe.stderr || ''}`;
    const hasStableAuthority = /Authority=Alyson PM Code Signing/i.test(info);
    const unsigned = /code object is not signed/i.test(info) ||
      (probe.status !== 0 && !/Authority=/i.test(info) && !/Signature=/i.test(info));
    const adhoc = /Signature=adhoc/i.test(info);

    // Never strip a stable CI signature — TCC grants are pinned to this cert root.
    if (hasStableAuthority) {
      console.log('✅ [FORCE-UPDATER] Preserving Alyson PM Code Signing identity (TCC intact)');
      return;
    }

    if (!unsigned && !adhoc) {
      console.log('✅ [FORCE-UPDATER] Preserving existing code signature (TCC identity intact)');
      return;
    }

    // Re-signing an already ad-hoc bundle with "-" creates a NEW cdhash identity and
    // forces another permissions re-grant. Leave the downloaded signature alone.
    if (adhoc) {
      console.warn(
        '⚠️ [FORCE-UPDATER] Bundle is ad-hoc signed — leaving as-is (permissions may still reset vs prior build)',
      );
      return;
    }

    try {
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', stagedApp], { timeout: 120000 });
      console.log('⚠️ [FORCE-UPDATER] Bundle was unsigned — applied ad-hoc signature');
    } catch (e) {
      console.warn('⚠️ [FORCE-UPDATER] ad-hoc codesign warning:', e.message);
    }
  }

  /**
   * Swap the staged .app over the installed bundle via a detached script,
   * then quit so the script can replace files and relaunch the app.
   */
  installMacInPlace() {
    const os = require('os');
    const { spawn } = require('child_process');

    const stagedApp = this.macStagedAppPath;
    const bundlePath = this.getInstalledAppBundlePath();

    if (!stagedApp || !fs.existsSync(stagedApp) || !bundlePath) {
      console.warn('⚠️ [FORCE-UPDATER] No staged app for in-place install — falling back to DMG');
      this.manualInstallRequired = true;
      this.openManualDownload();
      return {
        success: true,
        installing: false,
        dmgOpened: true,
        manualInstallRequired: true,
        manualDownloadUrl: this.getManualDownloadUrl(),
        message: 'Installer opened in your browser. Drag Alyson PM to Applications, then reopen the app.',
      };
    }

    const pid = process.pid;
    const scriptPath = path.join(os.tmpdir(), `alyson-pm-swap-${Date.now()}.sh`);
    const workDir = this.macUpdateWorkDir || path.dirname(path.dirname(stagedApp));
    // Overwrite the existing .app in place. Do NOT rm -rf the target first —
    // deleting the bundle breaks Launch Services / TCC association even when the
    // new build uses the same code-signing certificate (macOS then asks for
    // Screen Recording / Accessibility again).
    const script = `#!/bin/bash
set -e
PID=${pid}
STAGED="${stagedApp.replace(/"/g, '\\"')}"
TARGET="${bundlePath.replace(/"/g, '\\"')}"
WORKDIR="${workDir.replace(/"/g, '\\"')}"
# Wait for the running app to fully quit
for i in $(seq 1 60); do
  if ! kill -0 "$PID" 2>/dev/null; then break; fi
  sleep 0.5
done
sleep 1
if [ -d "$TARGET" ]; then
  # Keep the destination bundle directory; sync contents from the staged update.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$STAGED/" "$TARGET/"
  else
    ditto "$STAGED/" "$TARGET/"
  fi
else
  mkdir -p "$(dirname "$TARGET")"
  ditto "$STAGED" "$TARGET"
fi
# Strip quarantine only — do not touch the code signature.
xattr -d com.apple.quarantine "$TARGET" 2>/dev/null || true
xattr -cr "$TARGET" 2>/dev/null || true
rm -rf "$WORKDIR" 2>/dev/null || true
open "$TARGET"
`;

    try {
      fs.writeFileSync(scriptPath, script, { mode: 0o755 });
      global.isInstallingUpdate = true;
      this.recordInstallAttempt();

      const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' });
      child.unref();

      console.log('🚀 [FORCE-UPDATER] macOS in-place swap script launched, quitting app...');
      setTimeout(() => {
        try {
          if (app) app.quit();
        } catch (e) {
          console.error('❌ [FORCE-UPDATER] app.quit() error:', e.message);
        }
      }, 400);

      return { success: true, installing: true };
    } catch (error) {
      console.error('❌ [FORCE-UPDATER] macOS in-place install failed:', error.message);
      global.isInstallingUpdate = false;
      this.manualInstallRequired = true;
      this.openManualDownload();
      return {
        success: false,
        installing: false,
        dmgOpened: true,
        manualInstallRequired: true,
        manualDownloadUrl: this.getManualDownloadUrl(),
        error: error.message,
        message: 'Automatic install failed. Installer opened in your browser — drag Alyson PM to Applications, then reopen.',
      };
    }
  }

  /**
   * Install the update (quit and install)
   */
  async installUpdate() {
    console.log('🔄 [FORCE-UPDATER] installUpdate() called');
    console.log('🔧 [FORCE-UPDATER] State check:', {
      hasAutoUpdater: !!autoUpdater,
      isElectronContext,
      isUpdateDownloaded: this.isUpdateDownloaded,
      pendingVersion: this.pendingVersion,
      installAttempts: this.installAttempts,
      manualInstallRequired: this.manualInstallRequired,
      windowsInstallerPath: this.windowsInstallerPath,
    });

    // Node-downloaded Setup.exe (Windows CDN fallback) — launch it directly.
    if (
      process.platform === 'win32' &&
      this.windowsInstallerPath &&
      fs.existsSync(this.windowsInstallerPath)
    ) {
      return this.launchWindowsInstaller(this.windowsInstallerPath);
    }

    // If electron-updater never staged a payload but we know the version, try Node download then launch.
    if (
      process.platform === 'win32' &&
      this.isUpdateAvailable &&
      this.pendingVersion &&
      !this.isUpdateDownloaded
    ) {
      console.log('🔧 [FORCE-UPDATER] No staged Windows update — downloading Setup.exe via Node before install');
      const dl = await this.downloadWindowsInstallerViaNode();
      if (dl?.success && this.windowsInstallerPath && fs.existsSync(this.windowsInstallerPath)) {
        return this.launchWindowsInstaller(this.windowsInstallerPath);
      }
    }

    if (this.isMacPackaged()) {
      const stagedValid = this.macStagedAppPath && fs.existsSync(this.macStagedAppPath);
      if (stagedValid && !this.manualInstallRequired) {
        return this.installMacInPlace();
      }
      // No valid staged bundle (e.g. app restarted after download, losing the in-memory
      // staged path). Re-stage in place before ever falling back to the DMG, so the running
      // app updates itself instead of forcing a manual drag-to-Applications.
      if (!this.manualInstallRequired && (this.isUpdateAvailable || this.pendingVersion)) {
        console.log('🍎 [FORCE-UPDATER] No staged bundle at install time — attempting in-place re-stage');
        try {
          const restage = await this.downloadMacInPlaceUpdate();
          if (restage?.success && this.macStagedAppPath && fs.existsSync(this.macStagedAppPath)) {
            return this.installMacInPlace();
          }
        } catch (e) {
          console.warn('⚠️ [FORCE-UPDATER] In-place re-stage failed:', e?.message || e);
        }
      }
      // Genuine failure — fall back to DMG so the user is never stuck.
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

    if (this.manualInstallRequired) {
      // Windows: sticky "manual" state used to open the browser forever. Prefer
      // another in-app Node download + silent NSIS launch before browser.
      if (process.platform === 'win32' && this.pendingVersion) {
        console.log('🔧 [FORCE-UPDATER] Clearing sticky Windows manual flag — retrying in-app download');
        this.manualInstallRequired = false;
        const dl = await this.downloadWindowsInstallerViaNode();
        if (dl?.success && this.windowsInstallerPath && fs.existsSync(this.windowsInstallerPath)) {
          return this.launchWindowsInstaller(this.windowsInstallerPath);
        }
      }
      const url = this.getManualDownloadUrl();
      // Only open browser when install is explicitly stuck after retry.
      if (process.platform !== 'win32') {
        this.openManualDownload();
      }
      return {
        success: false,
        installing: false,
        dmgOpened: process.platform !== 'win32',
        manualInstallRequired: true,
        manualDownloadUrl: url,
        message:
          process.platform === 'win32'
            ? 'In-app download failed. Click Retry Update, or use Download Installer Manually.'
            : 'Installer opened in your browser. Install it, then reopen the app.',
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
