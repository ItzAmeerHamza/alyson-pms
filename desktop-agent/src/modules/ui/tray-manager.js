/**
 * Tray Manager Module
 * Manages system tray icon, live timer, project selection, and menu
 * Extracted from main.js for modular architecture
 */

const path = require('path');
const fs = require('fs');
const { nativeImage } = require('electron');

class TrayManager {
  constructor(electronModules) {
    this.Tray = electronModules.Tray;
    this.Menu = electronModules.Menu;
    this.app = electronModules.app;
    this.Notification = electronModules.Notification;
    
    this.tray = null;
    this.contextMenu = null;
    
    // State
    this.isTracking = false;
    this.isPaused = false;
    
    // Timer state
    this._timerInterval = null;
    this._trackingStartTime = null;  // Date object for when current session started
    /** Seconds from closed time_logs today before the current open session (for "total worked today" display). */
    this._cumulativeBaseSeconds = 0;
    this._localDayKey = null;
    this._currentProjectName = null;
    this._projectList = [];          // Cached project list [{project_id, name}]
    this._selectedProjectId = null;
    
    // Callbacks
    this.onStartTracking = null;
    this.onStopTracking = null;
    this.onPauseTracking = null;
    this.onResumeTracking = null;
    this.onShowWindow = null;
    this.onQuit = null;
    this.onSelectProject = null;
    this.onDebugConsole = null;
    this.onCheckAccessibility = null;
    this.onSetupAccessibility = null;
    this.onCheckAllPermissions = null;
    this.onOpenAccessibilitySettings = null;
    this.onEnableFeatures = null;
    this.onTestScreenCapture = null;
    
    // Additional state
    this.currentSession = null;
    this.config = null;
    this.systemPreferences = null;
    
    // Sleep/resume state for deferred notifications
    this._systemSleeping = false;
    this._pendingAutoStopReason = null;
    this._pendingAutoStopMessage = null;
    
    // Human-readable auto-stop reason labels
    this._autoStopReasons = {
      'idle_timeout': 'You were idle for too long — tracking was paused automatically.',
      'phantom_idle': 'No keyboard or click activity detected — tracking was paused (mouse jitter does not count as work).',
      'display_sleep': 'Your display was turned off for 2+ minutes — tracking was stopped to save your time log.',
      'screen_lock': 'Your screen was locked for 2+ minutes — tracking was stopped automatically. Click Start to resume.',
      'on_break': 'You chose to take a break — tracking was stopped. Click Start when you are back.',
      'system_sleep': 'Your laptop went to sleep — tracking was stopped to keep your time log accurate.',
      'system_shutdown': 'System is shutting down — tracking was stopped.',
      'screenshot_failures': 'Screenshot capture failed repeatedly',
      'mandatory_screenshot_timeout': 'Screenshot was required but not taken in time',
      'permissions_revoked': 'Required permissions were revoked',
      'manual': 'Stopped manually',
      'shutdown': 'Application is shutting down'
    };
  }

  /**
   * Initialize callbacks
   */
  initialize(callbacks) {
    this.onStartTracking = callbacks.onStartTracking;
    this.onStopTracking = callbacks.onStopTracking;
    this.onPauseTracking = callbacks.onPauseTracking;
    this.onResumeTracking = callbacks.onResumeTracking;
    this.onShowWindow = callbacks.onShowWindow;
    this.onQuit = callbacks.onQuit;
    this.onSelectProject = callbacks.onSelectProject;
    this.onTestScreenCapture = callbacks.onTestScreenCapture;
  }

  /**
   * Resolve tray asset path (dev + packaged builds).
   */
  _resolveAssetPath(fileName) {
    const candidates = [
      path.join(__dirname, '../../../assets', fileName),
      this.app?.getAppPath ? path.join(this.app.getAppPath(), 'assets', fileName) : null,
      global.__alysonIconPath ? path.join(path.dirname(global.__alysonIconPath), fileName) : null,
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return candidates[0];
  }

  /**
   * Build a macOS template tray image from the Alyson tray assets.
   */
  _loadMacTrayImage() {
    const templatePath = this._resolveAssetPath('tray-iconTemplate.png');
    const template2xPath = this._resolveAssetPath('tray-iconTemplate@2x.png');
    const coloredTrayPath = this._resolveAssetPath('tray-icon.png');
    const appIconPath = global.__alysonIconPath || this._resolveAssetPath('icon.png');

    const tryImage = (imagePath, asTemplate = true) => {
      if (!imagePath || !fs.existsSync(imagePath)) return null;
      const image = nativeImage.createFromPath(imagePath);
      if (!image || image.isEmpty()) return null;
      if (asTemplate && typeof image.setTemplateImage === 'function') {
        image.setTemplateImage(true);
      }
      return image;
    };

    if (fs.existsSync(templatePath) && fs.existsSync(template2xPath)) {
      const image = nativeImage.createFromPath(templatePath);
      const image2x = nativeImage.createFromPath(template2xPath);
      if (!image.isEmpty()) {
        image.addRepresentation({
          scaleFactor: 2,
          buffer: image2x.toPNG(),
          width: image2x.getSize().width,
          height: image2x.getSize().height,
        });
        if (typeof image.setTemplateImage === 'function') {
          image.setTemplateImage(true);
        }
        console.log('✅ [TRAY] Loaded macOS template tray icon');
        return image;
      }
    }

    const templateFallback = tryImage(templatePath, true);
    if (templateFallback) {
      console.log('✅ [TRAY] Loaded macOS template tray icon (1x only)');
      return templateFallback;
    }

    const coloredFallback = tryImage(coloredTrayPath, false);
    if (coloredFallback) {
      console.log('⚠️ [TRAY] Using colored tray icon on macOS');
      return coloredFallback.resize({ width: 22, height: 22 });
    }

    const appIconFallback = tryImage(appIconPath, false);
    if (appIconFallback) {
      console.log('⚠️ [TRAY] Using app icon fallback on macOS');
      return appIconFallback.resize({ width: 22, height: 22 });
    }

    return null;
  }

  /**
   * Create system tray
   */
  create() {
    if (this.tray) {
      console.log('⚠️ Tray already exists');
      return;
    }

    const isMac = process.platform === 'darwin';
    const iconPath = this._resolveAssetPath(isMac ? 'tray-iconTemplate.png' : 'tray-icon.png');

    console.log('🔍 [TRAY] Icon path:', iconPath);
    console.log('🔍 [TRAY] File exists:', fs.existsSync(iconPath));
    console.log('🔍 [TRAY] Platform:', process.platform);

    let trayIcon = null;
    try {
      if (isMac) {
        trayIcon = this._loadMacTrayImage();
        if (!trayIcon) {
          throw new Error('No macOS tray icon assets found — run npm run generate:icons');
        }
        this.tray = new this.Tray(trayIcon);
        console.log('✅ [TRAY] macOS tray created with Alyson template icon');
      } else {
        const alysonIconPath = global.__alysonIconPath || this._resolveAssetPath('icon.png');
        const trayPngPath = this._resolveAssetPath('tray-icon.png');
        if (fs.existsSync(trayPngPath)) {
          trayIcon = nativeImage.createFromPath(trayPngPath);
        } else if (fs.existsSync(alysonIconPath)) {
          trayIcon = nativeImage.createFromPath(alysonIconPath);
        }
        if (!trayIcon || trayIcon.isEmpty()) {
          throw new Error('No tray icon assets found — run npm run generate:icons');
        }
        this.tray = new this.Tray(trayIcon);
        console.log('✅ [TRAY] Standard tray created');
      }
    } catch (error) {
      console.error('❌ [TRAY] Error creating tray icon:', error?.message);
      throw error;
    }

    // Cache the base icon for status indicator overlays (Windows/Linux only)
    this._baseIcon = trayIcon || nativeImage.createFromPath(iconPath);
    this._generateStatusIcons();

    // Set initial stopped icon on tray and window taskbar
    this._setStoppedIcon();
    
    // Set tooltip
    this.tray.setToolTip('⏹ Alyson Time Doctor — Not Tracking');
    
    // Create initial menu
    this.updateMenu();
    
    // Handle tray click
    this.tray.on('click', () => {
      if (this.onShowWindow) {
        this.onShowWindow();
      }
    });
    
    console.log(`✅ System tray created (${isMac ? 'macOS template icon' : 'standard icon'})`);
    this._startLocalDayWatch();
  }

  // ─── Timer helpers ─────────────────────────────────────────────

  /**
   * Format elapsed seconds to HH:MM:SS
   */
  _formatElapsed(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  /**
   * Generate tray icons with colored status dots for Windows/Linux.
   * Large, bold dot at bottom-right of the icon with white outline for visibility.
   * macOS uses template images and setTitle, so we skip icon overlays there.
   */
  _generateStatusIcons() {
    if (process.platform === 'darwin') return; // macOS uses title text instead

    try {
      const baseIcon = this._baseIcon;
      if (!baseIcon || baseIcon.isEmpty()) {
        console.log('⚠️ [TRAY] Base icon is empty — skipping status icons');
        return;
      }
      const size = 48; // Larger for clarity on high-DPI and taskbar
      const resized = baseIcon.resize({ width: size, height: size });
      
      // Store the default icon
      this._defaultIcon = resized;
      this._trackingIcon = null;
      this._stoppedIcon = null;

      // Large status dot: bottom-right corner for maximum visibility
      const dotRadius = 8;  // Big and bold
      const dotCX = size - dotRadius - 1;   // Right side with 1px margin
      const dotCY = size - dotRadius - 1;   // Bottom with 1px margin

      // Generate tracking icon (bright green dot with white outline)
      this._trackingIcon = this._overlayStatusDot(resized, size, dotCX, dotCY, dotRadius, [0, 200, 50, 255]);
      // Generate stopped icon (bright red dot with white outline)
      this._stoppedIcon = this._overlayStatusDot(resized, size, dotCX, dotCY, dotRadius, [220, 30, 30, 255]);

      if (this._trackingIcon && this._stoppedIcon) {
        console.log('✅ [TRAY] Status indicator icons generated (big dot, bottom-right)');
      }
    } catch (e) {
      console.log('⚠️ [TRAY] Could not generate status icons:', e?.message);
      this._trackingIcon = null;
      this._stoppedIcon = null;
    }
  }

  /**
   * Overlay a large colored dot with white outline on a base icon.
   * Uses raw pixel manipulation on the BGRA bitmap buffer.
   */
  _overlayStatusDot(baseIcon, size, cx, cy, radius, rgba) {
    try {
      const bitmap = baseIcon.toBitmap();
      const buf = Buffer.from(bitmap);

      const setPixel = (x, y, r, g, b, a) => {
        if (x < 0 || x >= size || y < 0 || y >= size) return;
        const idx = (y * size + x) * 4;
        buf[idx] = b;
        buf[idx + 1] = g;
        buf[idx + 2] = r;
        buf[idx + 3] = a;
      };

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          // White outline ring (2px thick)
          if (dist <= radius + 2 && dist > radius) {
            setPixel(x, y, 255, 255, 255, 255);
          }
          // Colored dot fill
          if (dist <= radius) {
            setPixel(x, y, rgba[0], rgba[1], rgba[2], rgba[3]);
          }
        }
      }

      return nativeImage.createFromBuffer(buf, { width: size, height: size });
    } catch (e) {
      return null;
    }
  }

  /**
   * Switch tray AND window icon to tracking state (green dot)
   */
  _setTrackingIcon() {
    if (process.platform === 'darwin') return;
    try {
      if (this._trackingIcon && this.tray && !this.tray.isDestroyed()) {
        this.tray.setImage(this._trackingIcon);
      }
      // Also update the BrowserWindow taskbar icon
      const mainWindow = this.mainWindow || global.mainWindow;
      if (this._trackingIcon && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setIcon(this._trackingIcon);
      }
    } catch (e) {
      console.log('⚠️ [TRAY] Failed to set tracking icon:', e?.message);
    }
  }

  /**
   * Switch tray AND window icon to stopped state (red dot)
   */
  _setStoppedIcon() {
    if (process.platform === 'darwin') return;
    try {
      if (this._stoppedIcon && this.tray && !this.tray.isDestroyed()) {
        this.tray.setImage(this._stoppedIcon);
      }
      // Also update the BrowserWindow taskbar icon
      const mainWindow = this.mainWindow || global.mainWindow;
      if (this._stoppedIcon && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setIcon(this._stoppedIcon);
      }
    } catch (e) {
      console.log('⚠️ [TRAY] Failed to set stopped icon:', e?.message);
    }
  }

  _maybeRolloverLocalDay() {
    const { localDateKey } = require('../utils/today-time-log-stats');
    const todayKey = localDateKey();
    if (!this._localDayKey) {
      this._localDayKey = todayKey;
      return false;
    }
    if (this._localDayKey === todayKey) return false;

    console.log(`🌙 [TRAY] Work-day rollover (${require('../utils/work-timezone').getWorkTimezone()}): ${this._localDayKey} → ${todayKey}`);
    this._localDayKey = todayKey;
    this._cumulativeBaseSeconds = 0;
    this._lastCumulativeSeconds = 0;
    if (typeof global !== 'undefined') {
      global._lastTodayTotalAtStop = null;
      global._rendererFrozenTotalAtStop = null;
      global._frozenTotalDate = todayKey;
    }

    if (this.isTracking && this.tray && !this.tray.isDestroyed()) {
      const zeroDisplay = this._formatElapsed(0);
      if (process.platform === 'darwin') {
        this.tray.setTitle(zeroDisplay, { fontType: 'monospacedDigit' });
      }
      const projectLabel = this._currentProjectName || 'No Project';
      this.tray.setToolTip(`▶ Today: ${zeroDisplay} (session ${zeroDisplay}) — ${projectLabel}`);
    }

    try {
      const { BrowserWindow } = require('electron');
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0 && !windows[0].isDestroyed()) {
        windows[0].webContents.send('local-day-rollover', {
          date: todayKey,
          isTracking: this.isTracking,
        });
      }
    } catch (_) { /* ignore send failures */ }

    return true;
  }

  _startLocalDayWatch() {
    if (this._dayWatchInterval) return;
    const { localDateKey } = require('../utils/today-time-log-stats');
    this._localDayKey = localDateKey();
    this._dayWatchInterval = setInterval(() => {
      this._maybeRolloverLocalDay();
    }, 1000);
    if (typeof this._dayWatchInterval.unref === 'function') {
      this._dayWatchInterval.unref();
    }
  }

  _getSessionElapsedSeconds() {
    const { elapsedSecondsSinceLocalMidnight } = require('../utils/today-time-log-stats');
    return elapsedSecondsSinceLocalMidnight(this._trackingStartTime);
  }

  /**
   * Start the 1-second tray timer that updates the status bar title (macOS)
   * or tooltip (Windows/Linux)
   */
  startTrayTimer() {
    this.stopTrayTimer(); // clear any existing interval

    // Switch to green tracking icon on Windows/Linux
    this._setTrackingIcon();

    // Use the session start time set by updateState() if available.
    // Only fall back to NOW when no start time was provided (should not happen
    // in normal tracking flow — updateState always passes startTime).
    if (!this._trackingStartTime) {
      this._trackingStartTime = new Date();
      console.log('⏱️ [TRAY] No start time set — defaulting to NOW');
    } else {
      console.log('⏱️ [TRAY] Using session start time:', this._trackingStartTime.toISOString());
    }

    this._maybeRolloverLocalDay();

    // Set initial display based on actual elapsed time (not always 00:00:00)
    const initialElapsed = this._getSessionElapsedSeconds();
    const base = Math.max(0, Math.floor(Number(this._cumulativeBaseSeconds) || 0));
    const initialCumulative = base + initialElapsed;
    const initialDisplay = this._formatElapsed(initialElapsed);
    const initialCumulativeDisplay = this._formatElapsed(initialCumulative);

    if (process.platform === 'darwin' && this.tray && !this.tray.isDestroyed()) {
      const hasSetTitle = typeof this.tray.setTitle === 'function';
      if (hasSetTitle) {
        try {
          this.tray.setTitle(initialCumulativeDisplay, { fontType: 'monospacedDigit' });
        } catch (e) {
          console.error('❌ [TRAY] setTitle failed:', e?.message);
        }
      }
    }

    let tickCount = 0;
    const tick = () => {
      try {
        if (!this.tray || this.tray.isDestroyed()) return;

        this._maybeRolloverLocalDay();
        const elapsed = this._getSessionElapsedSeconds();
        const display = this._formatElapsed(elapsed);
        const baseSec = Math.max(0, Math.floor(Number(this._cumulativeBaseSeconds) || 0));
        const cumulativeSeconds = Math.max(0, baseSec + elapsed);
        const cumulativeDisplay = this._formatElapsed(cumulativeSeconds);
        this._lastCumulativeSeconds = cumulativeSeconds;

        if (process.platform === 'darwin') {
          // macOS: show timer text next to tray icon in the menu bar
          // Use monospacedDigit font for consistent width and better macOS compatibility
          this.tray.setTitle(cumulativeDisplay, { fontType: 'monospacedDigit' });
        }
        // All platforms: update tooltip with clear tracking indicator
        const projectLabel = this._currentProjectName || 'No Project';
        this.tray.setToolTip(`▶ Today: ${cumulativeDisplay} (session ${display}) — ${projectLabel}`);

        // Push elapsed time to renderer so the in-app timer stays in sync
        try {
          const { BrowserWindow } = require('electron');
          const windows = BrowserWindow.getAllWindows();
          if (windows.length > 0 && !windows[0].isDestroyed()) {
            windows[0].webContents.send('tray-timer-tick', {
              display,
              cumulativeDisplay,
              elapsed,
              cumulativeSeconds,
              sessionElapsedSeconds: elapsed
            });
          }
        } catch (_) { /* ignore send failures */ }

        // Log first few ticks for diagnostics
        tickCount++;
        if (tickCount <= 3) {
          const readBack = (process.platform === 'darwin' && typeof this.tray.getTitle === 'function')
            ? this.tray.getTitle() : '(n/a)';
          console.log(`⏱️ [TRAY] Tick #${tickCount}: set="${display}" readBack="${readBack}" (project: ${projectLabel})`);
        }
      } catch (e) {
        console.error('❌ [TRAY] Tick error:', e?.message);
      }
    };

    tick(); // immediate first tick
    this._timerInterval = setInterval(tick, 1000);
    if (typeof this._timerInterval.unref === 'function') {
      this._timerInterval.unref();
    }
    console.log('⏱️ [TRAY] Timer started');
  }

  /**
   * Stop the 1-second tray timer and clear the title
   */
  stopTrayTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    // Switch to red stopped icon on Windows/Linux
    this._setStoppedIcon();

    if (this.tray && !this.tray.isDestroyed()) {
      if (process.platform === 'darwin') {
        this.tray.setTitle('');
      }
      this.tray.setToolTip('⏹ Alyson Time Doctor — Not Tracking');
    }
    console.log('⏱️ [TRAY] Timer stopped');
  }

  // ─── Menu ─────────────────────────────────────────────────────

  /**
   * Update tray menu based on current state
   */
  updateMenu() {
    if (!this.tray) return;

    try {
      const menuItems = [];

      // ── Header: elapsed time or idle label ──
      if (this.isTracking && this._trackingStartTime) {
        const elapsed = this._getSessionElapsedSeconds();
        const baseSec = Math.max(0, Math.floor(Number(this._cumulativeBaseSeconds) || 0));
        const todayTotal = this._formatElapsed(baseSec + elapsed);
        const projectLabel = this._currentProjectName || 'No Project';
        menuItems.push({
          label: `${projectLabel}  ${todayTotal}`,
          enabled: false
        });
      } else {
        menuItems.push({
          label: 'Alyson PM Agent  —  Idle',
          enabled: false
        });
      }

      menuItems.push({ type: 'separator' });

      // ── Start / Stop + Project selection ──
      if (this.isTracking) {
        // Stop button only — user must stop then start with a different project
        menuItems.push({
          label: '⏹  Stop Tracking',
          click: () => this.onStopTracking?.()
        });
      } else {
        // Start Tracking → project submenu (selecting a project starts the timer)
        if (this._projectList.length > 0) {
          const startSubmenu = this._projectList.map((proj) => ({
            label: proj.name || proj.project_id,
            click: () => {
              this._selectedProjectId = proj.project_id;
              this._currentProjectName = proj.name || proj.project_id;
              console.log(`▶ [TRAY] Start tracking with project: ${this._currentProjectName} (${proj.project_id})`);
              this.onStartTracking?.(proj.project_id);
            }
          }));
          menuItems.push({
            label: '▶  Start Tracking',
            submenu: startSubmenu
          });
        } else {
          menuItems.push({
            label: '▶  Start Tracking',
            enabled: false,
            toolTip: 'No projects available'
          });
        }
      }

      menuItems.push({ type: 'separator' });

      // ── Utilities ──
      menuItems.push({
        label: '🔧 Toggle Monitoring Tools',
        click: () => {
          // Send message to renderer to toggle monitoring tools section
          if (this.onShowWindow) {
            this.onShowWindow();
          }
          // Send IPC to toggle the developer tools section
          const { BrowserWindow } = require('electron');
          const windows = BrowserWindow.getAllWindows();
          if (windows.length > 0) {
            windows[0].webContents.send('toggle-monitoring-tools');
          }
        }
      });

      menuItems.push({ type: 'separator' });

      menuItems.push({
        label: 'Quit',
        click: () => this.onQuit?.()
      });

      // Build and set menu
      this.contextMenu = this.Menu.buildFromTemplate(menuItems);
      this.tray.setContextMenu(this.contextMenu);
      
    } catch (error) {
      console.error('❌ Error updating tray menu:', error);
    }
  }

  // ─── State management ─────────────────────────────────────────

  /**
   * Update tracking state with optional extended info
   * @param {boolean} isTracking - Whether tracking is active
   * @param {boolean} isPaused - Whether tracking is paused
   * @param {object} [extra] - Optional extra state
   * @param {string} [extra.projectName] - Current project name
   * @param {string} [extra.projectId] - Current project ID
   * @param {Date|string} [extra.startTime] - Session start time
   * @param {Array} [extra.projectList] - Array of {project_id, name}
   * @param {number} [extra.completedTodayBeforeSessionSeconds] - Closed sessions today (local day) before current run
   */
  updateState(isTracking, isPaused, extra = {}) {
    const wasTracking = this.isTracking;
    this.isTracking = isTracking;
    this.isPaused = isPaused;

    if (extra.projectName !== undefined) this._currentProjectName = extra.projectName;
    if (extra.projectId !== undefined) this._selectedProjectId = extra.projectId;
    if (extra.startTime !== undefined) {
      this._trackingStartTime = extra.startTime ? new Date(extra.startTime) : null;
    }
    if (extra.completedTodayBeforeSessionSeconds !== undefined) {
      const n = Number(extra.completedTodayBeforeSessionSeconds);
      this._cumulativeBaseSeconds = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
    if (extra.projectList !== undefined) this._projectList = extra.projectList;

    // Resolve project name from cached list if only ID was provided
    if (!this._currentProjectName && this._selectedProjectId && this._projectList?.length) {
      const match = this._projectList.find(p => p.project_id === this._selectedProjectId);
      if (match) this._currentProjectName = match.name;
    }

    // Start or stop the live timer
    if (isTracking && !wasTracking) {
      this.startTrayTimer();
      const projLabel = this._currentProjectName || 'your project';
      this.showNotification('Tracking Started', `Now tracking time for ${projLabel}.`);
    } else if (!isTracking && wasTracking) {
      this.stopTrayTimer();
      this._trackingStartTime = null;
      this._cumulativeBaseSeconds = 0;
    }

    this.updateMenu();
  }

  /**
   * Load closed time_logs total for today (excludes open row) — used when tray is created after tracking already started.
   */
  async ensureCumulativeBaseFromDb() {
    try {
      const { computeTodayTimeLogSeconds } = require('../utils/today-time-log-stats');
      const supabase = global.supabaseClient || global.supabaseService || global.supabase;
      const userId = global.currentUserId || global.trackingManager?.currentSession?.user_id;
      const isTracking = !!(global.isTracking || global.trackingManager?.isTracking);
      const currentTimeLogId = isTracking
        ? (global.currentTimeLogId || global.trackingManager?.currentTimeLogId || null)
        : null;
      const agg = await computeTodayTimeLogSeconds(supabase, userId, currentTimeLogId, isTracking);
      this._cumulativeBaseSeconds = agg.completedClosedSeconds;
      console.log('⏱️ [TRAY] Cumulative base synced from DB:', this._cumulativeBaseSeconds, 's');
    } catch (e) {
      console.warn('⚠️ [TRAY] ensureCumulativeBaseFromDb failed:', e?.message || e);
    }
  }

  /**
   * Set the cached project list (called after IPC fetch)
   */
  setProjectList(projects) {
    if (!Array.isArray(projects)) return;
    this._projectList = projects.map(p => ({
      project_id: p.project_id || p.id,
      name: p.name || p.projects?.name || 'Unknown Project'
    }));
    console.log(`📁 [TRAY] Project list cached: ${this._projectList.length} projects`);

    // Resolve project name now that the list is available
    if (!this._currentProjectName && this._selectedProjectId) {
      const match = this._projectList.find(p => p.project_id === this._selectedProjectId);
      if (match) this._currentProjectName = match.name;
    }

    this.updateMenu();
  }

  // ─── System sleep / resume ────────────────────────────────────

  /**
   * Called when the OS is about to suspend (laptop lid closed, etc.).
   * Marks the system as sleeping so notifications can be deferred.
   */
  onSystemSleep() {
    this._systemSleeping = true;
    console.log('💤 [TRAY] System sleeping flag set');
  }

  /**
   * Called when the OS resumes from sleep.
   * Re-syncs the tray visual state and fires any deferred auto-stop notification.
   */
  onSystemResume() {
    this._systemSleeping = false;
    console.log('🌅 [TRAY] System resumed — re-syncing tray state');

    // Use global.isTracking as ground truth (set in Phase 1 of stopTracking,
    // BEFORE the graceful shutdown that gets suspended by the OS).
    // The tray's own this.isTracking may still be stale (true) because
    // updateState() in Phase 3 hasn't run yet.
    const globalTracking = (typeof global !== 'undefined') && (global.isTracking === true);

    // Force re-sync after a short delay so macOS has fully restored the menu bar
    setTimeout(() => {
      try {
        if (!globalTracking && this.tray && !this.tray.isDestroyed()) {
          console.log('⏱️ [TRAY] Force-clearing stale timer on resume (global.isTracking=false)');
          this.isTracking = false;
          this.stopTrayTimer();
          this._trackingStartTime = null;
          this.updateMenu();
        }
      } catch (e) {
        console.error('❌ [TRAY] Error re-syncing on resume:', e?.message);
      }
    }, 1000);

    // Fire any deferred auto-stop notification
    if (this._pendingAutoStopReason) {
      const reason = this._pendingAutoStopReason;
      const message = this._pendingAutoStopMessage;
      this._pendingAutoStopReason = null;
      this._pendingAutoStopMessage = null;
      console.log(`🔔 [TRAY] Firing deferred auto-stop notification: ${reason}`);
      // Delay so the OS notification subsystem is fully awake
      setTimeout(() => {
        this.showAutoStopNotification(reason, message);
      }, 2000);
    }
  }

  // ─── Auto-stop notifications ──────────────────────────────────

  /**
   * Show a prominent notification when tracking is auto-stopped.
   * If the system is currently sleeping, the notification is deferred until resume.
   * @param {string} reason - Machine reason key (e.g. 'idle_timeout', 'display_sleep')
   * @param {string} [message] - Optional custom message
   */
  showAutoStopNotification(reason, message) {
    // Defer if the system is sleeping or screen is locked — the OS cannot display notifications
    if (this._systemSleeping || global.isScreenLocked) {
      const deferReason = this._systemSleeping ? 'system sleeping' : 'screen locked';
      console.log(`🔔 [TRAY] Deferring auto-stop notification (${deferReason}): ${reason}`);
      this._pendingAutoStopReason = reason;
      this._pendingAutoStopMessage = message || null;
      return;
    }
    const humanReason = this._autoStopReasons[reason] || reason || 'Tracking was stopped automatically.';
    const title = '⏹ Time Tracking Stopped';
    const body = message || humanReason;

    console.log(`🔔 [TRAY] Auto-stop notification: ${reason} -> ${humanReason}`);

    // Native Notification (cross-platform)
    this.showNotification(title, body, { urgency: 'critical' });

    // Windows balloon notification (fallback for older Windows)
    if (process.platform === 'win32' && this.tray && !this.tray.isDestroyed()) {
      try {
        this.tray.displayBalloon({
          iconType: 'warning',
          title,
          content: body
        });
      } catch (e) {
        console.warn('⚠️ [TRAY] displayBalloon failed:', e?.message);
      }
    }
  }

  // ─── Notifications ────────────────────────────────────────────

  /**
   * Ensure notification permission is granted.
   * - Sends a test notification (triggers macOS first-time prompt).
   * - Then verifies it was seen via a confirmation dialog.
   * - If user didn't see it, guides them to System Settings.
   * Uses a flag file so the full dialog flow only runs once.
   */
  requestNotificationPermission() {
    if (!this.Notification || typeof this.Notification.isSupported !== 'function') {
      console.log('⚠️ [TRAY] Cannot request notification permission — module not available');
      return;
    }
    if (!this.Notification.isSupported()) {
      console.log('⚠️ [TRAY] Notifications not supported on this platform');
      return;
    }

    try {
      const path = require('path');
      const fs = require('fs');
      const { app } = require('electron');
      const flagFile = path.join(app.getPath('userData'), '.notification-permission-checked');

      // Only run the full check once
      if (fs.existsSync(flagFile)) {
        console.log('🔔 [TRAY] Notification permission already checked previously — skipping dialog');
        // Still send a silent welcome notification (works if allowed, harmless if not)
        try {
          new this.Notification({
            title: 'Alyson PM Agent',
            body: 'Notifications enabled — you\'ll be alerted on auto-stop.',
            silent: true
          }).show();
        } catch (_) {}
        return;
      }

      console.log('🔔 [TRAY] First launch — sending silent notification check');

      // Send a test notification (triggers macOS prompt if never asked before)
      // No dialog — just fire the notification and mark as checked
      try {
        new this.Notification({
          title: 'Alyson PM Agent',
          body: 'Notifications enabled — you\'ll be alerted on auto-stop.',
          silent: true
        }).show();
      } catch (_) {}

      // Mark as checked so we don't run again
      try {
        fs.writeFileSync(flagFile, new Date().toISOString(), 'utf8');
      } catch (e) {
        console.warn('⚠️ [TRAY] Could not write notification flag file:', e?.message);
      }

    } catch (error) {
      console.error('⚠️ [TRAY] Failed to request notification permission:', error?.message);
    }
  }

  /**
   * Show notification
   */
  showNotification(title, body, options = {}) {
    if (!this.Notification || typeof this.Notification.isSupported !== 'function') {
      console.log('⚠️ Notification module not available');
      return;
    }
    if (!this.Notification.isSupported()) {
      console.log('⚠️ Notifications not supported');
      return;
    }

    try {
      const notification = new this.Notification({
        title,
        body,
        silent: false,
        timeoutType: 'default',
        ...options
      });

      notification.show();

      // Auto-close after 5 seconds to prevent lingering in notification center
      setTimeout(() => {
        try { notification.close(); } catch (_) {}
      }, 5000);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  /**
   * Set tray icon
   */
  setIcon(iconPath) {
    if (this.tray) {
      this.tray.setImage(iconPath);
    }
  }

  /**
   * Set tooltip
   */
  setTooltip(text) {
    if (this.tray) {
      this.tray.setToolTip(text);
    }
  }

  /**
   * Destroy tray and clean up timer
   */
  destroy() {
    this.stopTrayTimer();
    if (this._dayWatchInterval) {
      clearInterval(this._dayWatchInterval);
      this._dayWatchInterval = null;
    }
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
      this.contextMenu = null;
    }
  }

  /**
   * Alias methods for compatibility
   */
  createTray() {
    return this.create();
  }

  buildTrayMenu() {
    return this.updateMenu();
  }
}

module.exports = TrayManager;