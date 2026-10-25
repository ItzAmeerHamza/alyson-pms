/**
 * Tray Manager Module
 * Manages system tray icon, live timer, project selection, and menu
 * Extracted from main.js for modular architecture
 */

const path = require('path');
const fs = require('fs');
const { nativeImage } = require('electron');
const userPreferences = require('../utils/user-preferences');

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
    this._lastTrayTitle = null;
    this._lastTrayTooltip = null;
    this._lastRendererPushAt = 0;
    this._lastPushedCumulative = -1;
    this._windowShowHooksInstalled = false;
    this.BrowserWindow = electronModules.BrowserWindow || null;
    
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
   * Build the macOS menu-bar tray image.
   * Prefer the full-color Tavilo Time logo. Template (monochrome) icons lose the
   * lime/periwinkle split that keeps the mark readable at menu-bar size.
   */
  _loadMacTrayImage() {
    const menuBarPath = this._resolveAssetPath('tavilo-menubar.png');
    const menuBar2xPath = this._resolveAssetPath('tavilo-menubar@2x.png');
    const { imageFromScaleFiles } = require('./tray-icon-bg');
    const scales = [];
    if (fs.existsSync(menuBarPath)) {
      const loaded = nativeImage.createFromPath(menuBarPath);
      if (loaded && !loaded.isEmpty()) scales.push({ loaded, scaleFactor: 1 });
    }
    if (fs.existsSync(menuBar2xPath)) {
      const loaded = nativeImage.createFromPath(menuBar2xPath);
      if (loaded && !loaded.isEmpty()) scales.push({ loaded, scaleFactor: 2 });
    }
    if (scales.length) {
      const image = imageFromScaleFiles(scales);
      if (image) {
        console.log('✅ [TRAY] Loaded SVG menu-bar mark');
        return image;
      }
    }
    const wideTrayPath = this._resolveAssetPath('tavilo-logo-wide.png');
    const coloredTrayPath = fs.existsSync(wideTrayPath)
      ? wideTrayPath
      : this._resolveAssetPath('tray-icon.png');
    const appIconPath = global.__alysonIconPath || this._resolveAssetPath('icon.png');
    const templatePath = this._resolveAssetPath('tray-iconTemplate.png');
    const template2xPath = this._resolveAssetPath('tray-iconTemplate@2x.png');

    const tryImage = (imagePath, asTemplate = false) => {
      if (!imagePath || !fs.existsSync(imagePath)) return null;
      const image = nativeImage.createFromPath(imagePath);
      if (!image || image.isEmpty()) return null;
      if (asTemplate && typeof image.setTemplateImage === 'function') {
        image.setTemplateImage(true);
      }
      return image;
    };

    const { macTrayIconWithBackground } = require('./tray-icon-bg');
    const withPlate = (image, label) => {
      const badged = macTrayIconWithBackground(image);
      if (badged) {
        console.log(`✅ [TRAY] ${label} with white menu-bar plate`);
        return badged;
      }
      return image.resize({ width: 22, height: 22 });
    };

    const colored = tryImage(coloredTrayPath, false);
    if (colored) {
      return withPlate(colored, 'Loaded colored Tavilo Time tray icon');
    }

    const appIcon = tryImage(appIconPath, false);
    if (appIcon) {
      return withPlate(appIcon, 'Using app icon fallback');
    }

    // Last resort: monochrome template (often looks like a filled circle)
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
        console.log('⚠️ [TRAY] Falling back to macOS template tray icon');
        return image;
      }
    }

    const templateFallback = tryImage(templatePath, true);
    if (templateFallback) {
      console.log('⚠️ [TRAY] Falling back to macOS template tray icon (1x only)');
      return templateFallback;
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
    const iconPath = this._resolveAssetPath('tray-icon.png');

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
        console.log('✅ [TRAY] macOS tray created with colored Tavilo Time icon');
      } else {
        const alysonIconPath = global.__alysonIconPath || this._resolveAssetPath('icon.png');
        const widePath = this._resolveAssetPath('tavilo-logo-wide.png');
        const trayPngPath = this._resolveAssetPath('tray-icon.png');
        // Same rounded ink tile as the app / Dock icon, so Windows and macOS match.
        const tile48Path = this._resolveAssetPath('icon-48.png');
        const tile48 = fs.existsSync(tile48Path) ? nativeImage.createFromPath(tile48Path) : null;
        const { imageFromScaleFiles } = require('./tray-icon-bg');
        const scales = [];
        for (const [file, scaleFactor] of [['icon-32.png', 1], ['icon-64.png', 2]]) {
          const filePath = this._resolveAssetPath(file);
          if (!fs.existsSync(filePath)) continue;
          const loaded = nativeImage.createFromPath(filePath);
          if (loaded && !loaded.isEmpty()) scales.push({ loaded, scaleFactor });
        }
        const crispTile = scales.length ? imageFromScaleFiles(scales) : null;
        let rawIcon = null;
        if (crispTile) {
          this._logoIsTile = true;
          this._logoIcon = tile48 && !tile48.isEmpty() ? tile48 : crispTile;
          trayIcon = crispTile;
          this.tray = new this.Tray(trayIcon);
          console.log('✅ [TRAY] Windows tray created with the app tile icon');
        } else if (fs.existsSync(widePath)) {
          rawIcon = nativeImage.createFromPath(widePath);
        } else if (fs.existsSync(trayPngPath)) {
          rawIcon = nativeImage.createFromPath(trayPngPath);
        } else if (fs.existsSync(alysonIconPath)) {
          rawIcon = nativeImage.createFromPath(alysonIconPath);
        }
        if (!this.tray) {
          if (!rawIcon || rawIcon.isEmpty()) {
            throw new Error('No tray icon assets found — run npm run generate:icons');
          }
          // Fallback when icon.png is missing: plate the unplated mark once.
          this._logoIcon = rawIcon;
          const { composeTrayIconWithBackground, PLATE_CORNER_RATIO } = require('./tray-icon-bg');
          trayIcon = composeTrayIconWithBackground(rawIcon, {
            size: 32,
            inset: 1,
            radius: Math.round(32 * PLATE_CORNER_RATIO),
          }) || rawIcon;
          this.tray = new this.Tray(trayIcon);
          console.log('✅ [TRAY] Windows tray created with the Dock tile');
        }
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
    this.tray.setToolTip('⏹ Tavilo Time — Not Tracking');
    
    // Create initial menu
    this.updateMenu();
    
    // Handle tray click
    this.tray.on('click', () => {
      if (this.onShowWindow) {
        this.onShowWindow();
      }
    });
    
    console.log(`✅ System tray created (${isMac ? 'macOS colored Tavilo Time icon' : 'standard icon'})`);
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
   * Large, bold dot at bottom-right of the icon with a dark outline so it
   * stays visible on the dark Dock tile.
   * macOS uses template images and setTitle, so we skip icon overlays there.
   */
  _generateStatusIcons() {
    if (process.platform === 'darwin') return; // macOS uses title text instead

    try {
      const logoIcon = this._logoIcon || this._baseIcon;
      if (!logoIcon || logoIcon.isEmpty()) {
        console.log('⚠️ [TRAY] Base icon is empty — skipping status icons');
        return;
      }
      const size = 48; // Larger for clarity on high-DPI and taskbar
      const { composeTrayIconWithBackground, PLATE_CORNER_RATIO } = require('./tray-icon-bg');
      const plated = this._logoIsTile
        ? null
        : composeTrayIconWithBackground(logoIcon, {
            size,
            inset: 2,
            radius: Math.round(size * PLATE_CORNER_RATIO),
          });
      const current = logoIcon.getSize ? logoIcon.getSize() : null;
      const alreadySized = current && current.width === size && current.height === size;
      const resized = plated || (alreadySized ? logoIcon : logoIcon.resize({ width: size, height: size }));
      
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
   * Overlay a large colored dot with a dark outline on a base icon.
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
          // Dark outline ring (2px thick) so the dot reads on the white plate
          if (dist <= radius + 2 && dist > radius) {
            setPixel(x, y, 15, 23, 42, 255);
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

  _workDayKeyFilePath() {
    try {
      const userData =
        (this.app && typeof this.app.getPath === 'function' && this.app.getPath('userData')) ||
        null;
      if (!userData) return null;
      return path.join(userData, 'pacific-work-day-key.json');
    } catch (_) {
      return null;
    }
  }

  _readPersistedWorkDayKey() {
    try {
      const filePath = this._workDayKeyFilePath();
      if (!filePath || !fs.existsSync(filePath)) return null;
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const key = typeof raw?.workDayKey === 'string' ? raw.workDayKey : null;
      return key && /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
    } catch (_) {
      return null;
    }
  }

  _persistWorkDayKey(dayKey) {
    // Called from the 1s tray tick: only touch disk when the day changes.
    if (dayKey && dayKey === this._persistedWorkDayKey) return;
    try {
      const filePath = this._workDayKeyFilePath();
      if (!filePath || !dayKey) return;
      this._persistedWorkDayKey = dayKey;
      fs.writeFileSync(
        filePath,
        JSON.stringify({ workDayKey: dayKey, updatedAt: new Date().toISOString() }),
        'utf8',
      );
    } catch (_) { /* ignore */ }
  }

  _broadcastWorkDaySync(todayKey, previousDate = null, rolled = false) {
    try {
      const win = this._getMainTrackerWindow();
      if (!win || win.isDestroyed()) return;
      let workDay = null;
      try {
        workDay = require('../utils/work-timezone').getWorkDayContext();
      } catch (_) { /* ignore */ }
      const payload = {
        date: todayKey,
        previousDate,
        isTracking: this.isTracking,
        rolled: !!rolled,
        timezone: workDay?.timezone || null,
        workDay,
      };
      if (rolled) {
        win.webContents.send('local-day-rollover', payload);
      }
      // Always sync so a slept renderer can self-heal even if tray already rolled.
      win.webContents.send('work-day-sync', payload);
    } catch (_) { /* ignore send failures */ }
  }

  /**
   * Company work-day boundary (America/Los_Angeles by default). Safe to call on
   * resume/wake/start — no-ops if already on today's key. Returns true when
   * a rollover reset ran and the daily clock was zeroed.
   */
  _maybeRolloverLocalDay() {
    const { localDateKey } = require('../utils/today-time-log-stats');
    const todayKey = localDateKey();
    if (!this._localDayKey) {
      // Prefer persisted key so a missed midnight after lid-close still rolls.
      this._localDayKey = this._readPersistedWorkDayKey() || todayKey;
    }
    if (this._localDayKey === todayKey) {
      this._persistWorkDayKey(todayKey);
      return false;
    }

    const previousDate = this._localDayKey;
    console.log(`🌙 [TRAY] Work-day rollover (${require('../utils/work-timezone').getWorkTimezone()}): ${previousDate} → ${todayKey}`);
    this._localDayKey = todayKey;
    this._cumulativeBaseSeconds = 0;
    this._lastCumulativeSeconds = 0;
    this._persistWorkDayKey(todayKey);
    if (typeof global !== 'undefined') {
      if (global._lastTodayTotalAtStop) console.log(`🧹 [STOP-FLOOR] cleared ${global._lastTodayTotalAtStop}s: tray day rollover`);
      global._lastTodayTotalAtStop = null;
      global._rendererFrozenTotalAtStop = null;
      global._frozenTotalDate = todayKey;
      // Drop yesterday's floor so get-today-time-stats cannot reinflate the clock.
      global._lastGoodTodayStats = null;
      // Key tray high-water by company work day (not machine toDateString).
      global._trayTodayHighWaterSeconds = 0;
      global._trayTodayHighWaterDate = todayKey;
      global._rendererTodayFloorSeconds = 0;
    }

    if (this.isTracking && this.tray && !this.tray.isDestroyed()) {
      const zeroDisplay = this._formatElapsed(0);
      this._setMenuBarTitle(zeroDisplay, true);
      const projectLabel = this._currentProjectName || 'No Project';
      this.tray.setToolTip(`▶ Today: ${zeroDisplay} (session ${zeroDisplay}) — ${projectLabel}`);
    }

    this._broadcastWorkDaySync(todayKey, previousDate, true);
    this._scheduleNextWorkDayRollover();
    return true;
  }

  /** Public: force company (Chicago by default) day check (resume / unlock / Start). */
  ensureWorkDayRollover() {
    const rolled = this._maybeRolloverLocalDay();
    if (!rolled) {
      try {
        const { localDateKey } = require('../utils/today-time-log-stats');
        this._broadcastWorkDaySync(localDateKey(), null, false);
      } catch (_) { /* ignore */ }
    }
    return rolled;
  }

  _scheduleNextWorkDayRollover() {
    if (this._workDayRolloverTimeout) {
      clearTimeout(this._workDayRolloverTimeout);
      this._workDayRolloverTimeout = null;
    }
    try {
      const { nextWorkDayMidnight } = require('../utils/work-timezone');
      const nextMs = nextWorkDayMidnight().getTime();
      const delay = Math.max(250, nextMs - Date.now() + 250);
      this._workDayRolloverTimeout = setTimeout(() => {
        this._workDayRolloverTimeout = null;
        this._maybeRolloverLocalDay();
        this._scheduleNextWorkDayRollover();
      }, Math.min(delay, 2147483647));
      if (typeof this._workDayRolloverTimeout.unref === 'function') {
        this._workDayRolloverTimeout.unref();
      }
    } catch (err) {
      console.warn('⚠️ [TRAY] Failed to schedule work-day rollover:', err?.message || err);
    }
  }

  _startLocalDayWatch() {
    if (this._dayWatchInterval) return;
    const { localDateKey } = require('../utils/today-time-log-stats');
    const todayKey = localDateKey();
    const persisted = this._readPersistedWorkDayKey();
    // If the process slept past company midnight, persisted day is yesterday —
    // seed _localDayKey from disk so the first check performs a real reset.
    this._localDayKey = persisted || todayKey;
    this._maybeRolloverLocalDay();
    this._scheduleNextWorkDayRollover();
    // Backup only — _scheduleNextWorkDayRollover fires at company midnight.
    this._dayWatchInterval = setInterval(() => {
      this._maybeRolloverLocalDay();
    }, 60 * 1000);
    if (typeof this._dayWatchInterval.unref === 'function') {
      this._dayWatchInterval.unref();
    }
  }

  _getMainTrackerWindow() {
    try {
      // Prefer the real tracker window — on Windows other BrowserWindows
      // (debug/permission) can steal the first "visible" match and drop clock IPC.
      const main = this.mainWindow || global.mainWindow;
      if (main && !main.isDestroyed()) return main;

      const BrowserWindow = this.BrowserWindow || require('electron').BrowserWindow;
      const windows = BrowserWindow.getAllWindows();
      // Prefer a visible non-destroyed window; fall back to first live window.
      return (
        windows.find((w) => w && !w.isDestroyed() && w.isVisible() && !w.isMinimized()) ||
        windows.find((w) => w && !w.isDestroyed()) ||
        null
      );
    } catch (_) {
      return null;
    }
  }

  _installWindowShowHooks() {
    if (this._windowShowHooksInstalled) return;
    this._windowShowHooksInstalled = true;
    try {
      const BrowserWindow = this.BrowserWindow || require('electron').BrowserWindow;
      const hook = (win) => {
        if (!win || win.isDestroyed()) return;
        const push = () => {
          if (!this.isTracking || !this._timerInterval) return;
          this._pushRendererTick({ force: true });
        };
        win.on('show', push);
        win.on('restore', push);
        win.on('focus', push);
      };
      BrowserWindow.getAllWindows().forEach(hook);
      const { app } = require('electron');
      if (app && !app._trayShowHooked) {
        app._trayShowHooked = true;
        app.on('browser-window-created', (_e, win) => hook(win));
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * Push one tray tick to the renderer. One push per displayed second,
   * including while the window is minimized, so both clocks stay on the same second.
   */
  _pushRendererTick({ force = false, display, cumulativeDisplay, elapsed, cumulativeSeconds } = {}) {
    const live = this._resolveLiveClock();
    const elapsedSec = elapsed != null ? elapsed : live.elapsed;
    const cum =
      cumulativeSeconds != null ? cumulativeSeconds : live.cumulative;
    const disp = display != null ? display : this._formatElapsed(elapsedSec);
    const cumDisp =
      cumulativeDisplay != null ? cumulativeDisplay : this._formatElapsed(cum);

    const win = this._getMainTrackerWindow();
    if (!win || win.webContents.isDestroyed()) return;

    const now = Date.now();
    const sameSecond = cum === this._lastPushedCumulative;
    if (!force && sameSecond && now - (this._lastRendererPushAt || 0) < 900) return;

    this._lastRendererPushAt = now;
    this._lastPushedCumulative = cum;
    try {
      let sessionIdleSeconds = 0;
      try {
        sessionIdleSeconds =
          global.enhancedIdleMonitor?.getReportableSessionIdleSeconds?.() || 0;
      } catch (_) { /* idle monitor optional */ }
      win.webContents.send('tray-timer-tick', {
        display: disp,
        cumulativeDisplay: cumDisp,
        elapsed: elapsedSec,
        cumulativeSeconds: cum,
        sessionElapsedSeconds: elapsedSec,
        sessionIdleSeconds,
      });
    } catch (_) { /* ignore */ }
  }

  _getSessionElapsedSeconds() {
    const { elapsedSecondsSinceLocalMidnight } = require('../utils/today-time-log-stats');
    return elapsedSecondsSinceLocalMidnight(this._trackingStartTime);
  }

  /**
   * Closed-today + live. If Start recovered the idle-stopped row, strip that
   * session out of the Stop floor so 3h cannot paint as 6h (Hamza 29–30 Sep).
   */
  _resolveLiveClock(nowMs = Date.now()) {
    const {
      excludeOwnSessionFromClosedBase,
      elapsedSecondsExcludingSleep,
    } = require('../utils/sleep-aware-elapsed');
    const lastStopAt =
      global._lastExplicitStopEndIso ||
      global._stopEndTimeOverride ||
      global._lastStopEndAtMs ||
      null;
    const lastWakeMs = Number(global._lastWakeAtMs) || 0;
    const elapsed = elapsedSecondsExcludingSleep(
      this._trackingStartTime,
      nowMs,
      lastWakeMs,
    );
    const base = excludeOwnSessionFromClosedBase({
      closedBase: this._cumulativeBaseSeconds,
      sessionStart: this._trackingStartTime,
      lastStopAt,
    });
    const deducted = require('../utils/time-deductions').liveDeductionSeconds(
      global.trackingManager?.currentTimeLogId || global.currentTimeLogId || null,
    );
    return {
      elapsed,
      base,
      cumulative: Math.max(0, base + elapsed - deducted),
    };
  }

  /**
   * Repaint the menu-bar total after a screenshot deduction.
   * Does not stop or restart the timer — the next tick continues from here.
   */
  paintLiveTotal() {
    if (!this.tray || this.tray.isDestroyed?.()) return;
    const live = this._resolveLiveClock();
    const cumulativeDisplay = this._formatElapsed(live.cumulative);
    this._lastCumulativeSeconds = live.cumulative;
    try {
      this._setMenuBarTitle(cumulativeDisplay, true);
    } catch (_) { /* next tick paints it */ }
    this._pushRendererTick?.({
      force: true,
      display: this._formatElapsed(live.elapsed),
      cumulativeDisplay,
      elapsed: live.elapsed,
      cumulativeSeconds: live.cumulative,
    });
  }

  _hasLiveSession() {
    return !!(
      global.isTracking ||
      global.trackingManager?.isTracking ||
      global.currentTimeLogId ||
      global.trackingManager?.currentTimeLogId
    );
  }

  /**
   * Menu bar and main window must show the same clock. If Start is still
   * open, heal a false isTracking=false. If there is no session, kill the
   * orphan tray so it cannot run ahead of a Stopped window.
   */
  _ensureLiveSessionForTick() {
    if (this._hasLiveSession()) {
      if (!global.isTracking) {
        global.isTracking = true;
        if (global.trackingManager) global.trackingManager.isTracking = true;
        console.warn('⏱️ [TRAY] Healed isTracking — menu bar and app stay on the same live clock');
      }
      return true;
    }
    if (global.userExplicitlyStopped) return false;
    try {
      const cp = global.trackingManager?._readSessionCheckpoint?.();
      const id = cp?.timeLogId || cp?.time_log_id || cp?.id;
      if (!id) return false;
      global.isTracking = true;
      global.currentTimeLogId = id;
      if (cp.startTime || cp.start_time) {
        const start = cp.startTime || cp.start_time;
        global.sessionStartTime = start;
      }
      if (global.trackingManager) {
        global.trackingManager.isTracking = true;
        global.trackingManager.currentTimeLogId = id;
        if (cp.startTime || cp.start_time) {
          global.trackingManager.sessionStartTime = cp.startTime || cp.start_time;
        }
      }
      console.warn('⏱️ [TRAY] Healed live session from checkpoint — clock keeps running');
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * The awake clock spans timer restarts within one session: resume handlers
   * restart the timer exactly when tracking survived a sleep, and resetting
   * here would hide that nap.
   */
  _resetAwakeClockForSession() {
    const key = String(
      global.currentTimeLogId ||
        global.trackingManager?.currentTimeLogId ||
        this._trackingStartTime?.getTime?.() ||
        '',
    );
    if (key && key === this._awakeClockSessionKey) return;
    this._awakeClockSessionKey = key;
    this._sleepGapHold = false;
    require('../utils/sleep-aware-elapsed').resetAwakeClock();
  }

  /**
   * After a freeze the live clock (now − Start) spans the nap. Hold the clock —
   * no paint, no high-water — until this session is closed at the last
   * pre-nap tick (suspend may not have fired yet, or arrives after wake).
   * @returns {boolean} true while the clock must hold
   */
  _holdForSleepGap() {
    const awake = require('../utils/sleep-aware-elapsed').noteAwakeTick();
    if (awake.slept && !this._sleepGapHold && !global.isStopping) {
      this._sleepGapHold = true;
      console.warn(
        `😴 [TRAY] ${Math.round((Date.now() - awake.lastAwakeMs) / 1000)}s clock gap — ` +
          'machine slept; holding the clock and closing at last awake tick',
      );
      try {
        const p = global.trackingManager?.noteMachineSlept?.(awake.lastAwakeMs);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) { /* best-effort; the idle monitor also stops on the gap */ }
    }
    return this._sleepGapHold === true;
  }

  /**
   * Start the 1-second tray timer that updates the status bar title (macOS)
   * or tooltip (Windows/Linux)
   */
  startTrayTimer() {
    this.stopTrayTimer(); // clear any existing interval
    this._installWindowShowHooks();

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
    this._resetAwakeClockForSession();
    const initialHold = this._holdForSleepGap();

    // Set initial display based on actual elapsed time (not always 00:00:00)
    const initialLive = this._resolveLiveClock();
    const initialElapsed = initialLive.elapsed;
    const initialCumulative = initialLive.cumulative;
    const initialDisplay = this._formatElapsed(initialElapsed);
    const initialCumulativeDisplay = this._formatElapsed(initialCumulative);

    if (!initialHold && this.tray && !this.tray.isDestroyed()) {
      try {
        this._setMenuBarTitle(initialCumulativeDisplay, true);
      } catch (e) {
        console.error('❌ [TRAY] setTitle failed:', e?.message);
      }
    }

    let tickCount = 0;
    const tick = () => {
      try {
        if (!this.tray || this.tray.isDestroyed()) return;
        const sleptHold = this._holdForSleepGap();
        // Stop was clicked — the total is frozen at that instant. The tray is
        // only torn down in Phase 3, ~2s later, and every tick in between both
        // paints and raises the high-water that the next Start seeds its base
        // from. Offline that is the whole ~2s stop round-trip, billed once per
        // stop/start cycle and never rewound (the base is forward-only).
        if (global.isStopping) return;
        if (sleptHold) return;
        if (!this._ensureLiveSessionForTick()) {
          console.warn('⏱️ [TRAY] No live session — stopping orphan menu-bar clock');
          this.stopTrayTimer();
          return;
        }

        this._maybeRolloverLocalDay();
        const live = this._resolveLiveClock();
        const elapsed = live.elapsed;
        const display = this._formatElapsed(elapsed);
        const cumulativeSeconds = live.cumulative;
        const cumulativeDisplay = this._formatElapsed(cumulativeSeconds);
        this._lastCumulativeSeconds = cumulativeSeconds;
        // High-water tracks real live total only (never invents time).
        try {
          const { localDateKey } = require('../utils/today-time-log-stats');
          global._trayTodayHighWaterSeconds = cumulativeSeconds;
          global._trayTodayHighWaterDate = localDateKey();
        } catch (_) { /* ignore */ }

        // Only touches the menu bar when the shown text changes.
        this._setMenuBarTitle(cumulativeDisplay);
        const projectLabel = this._currentProjectName || 'No Project';
        const tooltip = `▶ Today: ${cumulativeDisplay} (session ${display}) — ${projectLabel}`;
        if (tooltip !== this._lastTrayTooltip) {
          this.tray.setToolTip(tooltip);
          this._lastTrayTooltip = tooltip;
        }

        this._pushRendererTick({
          display,
          cumulativeDisplay,
          elapsed,
          cumulativeSeconds,
        });

        // Log first few ticks for diagnostics
        tickCount++;
        if (tickCount <= 3) {
          const readBack = (process.platform === 'darwin' && typeof this.tray.getTitle === 'function')
            ? this.tray.getTitle() : '(n/a)';
          console.log(`⏱️ [TRAY] Tick #${tickCount}: set="${cumulativeDisplay}" (session ${display}) readBack="${readBack}" (project: ${projectLabel}) base=${live.base} rawBase=${this._cumulativeBaseSeconds}`);
        }
      } catch (e) {
        console.error('❌ [TRAY] Tick error:', e?.message);
      }
    };

    this._holdClockAwake();
    tick();
    // Do not unref. macOS coalesces an unref'd timer while the window is
    // minimized, so the menu bar sits still and then jumps 3–5 seconds.
    this._timerInterval = setInterval(tick, 1000);
    console.log('⏱️ [TRAY] Timer started');
  }

  _holdClockAwake() {
    try {
      const { powerSaveBlocker } = require('electron');
      if (
        this._clockBlockerId != null &&
        powerSaveBlocker.isStarted(this._clockBlockerId)
      ) {
        return;
      }
      this._clockBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    } catch (_) { /* clock still runs; it may jump if the OS naps the process */ }
  }

  _releaseClockAwake() {
    try {
      const { powerSaveBlocker } = require('electron');
      if (
        this._clockBlockerId != null &&
        powerSaveBlocker.isStarted(this._clockBlockerId)
      ) {
        powerSaveBlocker.stop(this._clockBlockerId);
      }
    } catch (_) { /* already stopped */ }
    this._clockBlockerId = null;
  }

  /**
   * Stop the 1-second tray timer and clear the title
   */
  stopTrayTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    this._releaseClockAwake();
    this._lastTrayTitle = null;
    this._lastTrayTooltip = null;
    this._lastPushedCumulative = -1;
    this._lastRendererPushAt = 0;
    // Switch to red stopped icon on Windows/Linux
    this._setStoppedIcon();

    if (this.tray && !this.tray.isDestroyed()) {
      this._setMenuBarTitle('', true);
      this.tray.setToolTip('⏹ Tavilo Time — Not Tracking');
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
        const live = this._resolveLiveClock();
        const todayTotal = this._formatElapsed(live.cumulative);
        const projectLabel = this._currentProjectName || 'No Project';
        menuItems.push({
          label: `${projectLabel}  ${todayTotal}`,
          enabled: false
        });
      } else {
        menuItems.push({
          label: 'Tavilo Time — Idle',
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

      menuItems.push({
        label: 'Open Web Dashboard',
        click: () => {
          try {
            const { shell } = require('electron');
            shell.openExternal('https://app.tavilo.ai/');
          } catch (e) {
            console.warn('⚠️ [TRAY] Failed to open web dashboard:', e?.message);
          }
        }
      });

      // ── Auto-start at login (default ON; user can toggle) ──
      let autoLaunchChecked = true;
      try {
        const { getAutoLaunchEnabled } = require('../utils/auto-launch');
        autoLaunchChecked = !!getAutoLaunchEnabled();
      } catch (_) {
        autoLaunchChecked = true;
      }
      menuItems.push({
        label: 'Start Tavilo Time at login',
        type: 'checkbox',
        checked: autoLaunchChecked,
        click: (menuItem) => {
          try {
            const { setAutoLaunchEnabled } = require('../utils/auto-launch');
            const result = setAutoLaunchEnabled(!!menuItem.checked);
            console.log(
              `🔔 [TRAY] Auto-launch ${result.enabled ? 'enabled' : 'disabled'}`,
              result.applied === false ? '(dev — applies when packaged)' : '',
            );
            this.updateMenu();
          } catch (err) {
            console.warn('⚠️ [TRAY] Failed to update auto-launch:', err?.message || err);
          }
        },
      });

      menuItems.push({
        label: 'Report an issue',
        click: () => {
          if (this.onShowWindow) this.onShowWindow();
          try {
            const { BrowserWindow } = require('electron');
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
              windows[0].webContents.send('open-report-issue');
            }
          } catch (err) {
            console.warn('⚠️ [TRAY] Could not open Report an issue:', err?.message || err);
          }
        },
      });

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
        label: 'Open Tavilo Time',
        click: () => this.onShowWindow?.()
      });

      // Windows/Linux: turn the "keep running or quit?" prompt on the window X
      // back on after someone ticked "Don't ask again".
      if (process.platform !== 'darwin') {
        const closePrompt = require('../core/close-prompt');
        menuItems.push({
          label: 'Ask before closing window',
          type: 'checkbox',
          checked: !closePrompt.isAskDisabled(),
          click: (item) => {
            closePrompt.setAskOnClose(item.checked);
            this.updateMenu();
          }
        });
      }

      menuItems.push({
        label: 'Quit Tavilo Time',
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
    // Lid-close overnight: Start must not carry yesterday's cumulative base.
    this._maybeRolloverLocalDay();

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
      const next = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      // A new Start replaces leftover jam. Same live session stays forward-only.
      if (extra.replaceCumulativeBase === true || !wasTracking) {
        this._cumulativeBaseSeconds = next;
      } else {
        this._cumulativeBaseSeconds = Math.max(
          Math.floor(Number(this._cumulativeBaseSeconds) || 0),
          next,
        );
      }
    }
    if (extra.projectList !== undefined) this._projectList = extra.projectList;

    // Resolve project name from cached list if only ID was provided
    if (!this._currentProjectName && this._selectedProjectId && this._projectList?.length) {
      const match = this._projectList.find(p => p.project_id === this._selectedProjectId);
      if (match) this._currentProjectName = match.name;
    }

    // Start or stop the live timer. A leftover isTracking=true (zombie / jam)
    // used to skip startTrayTimer — Start disabled, clock frozen (Aditya #1).
    if (isTracking && (extra.replaceCumulativeBase === true || !wasTracking || !this._timerInterval)) {
      this.startTrayTimer();
      if (!wasTracking) {
        const projLabel = this._currentProjectName || 'your project';
        this.showNotification('Tracking Started', `Now tracking time for ${projLabel}.`);
      } else if (!this._timerInterval) {
        console.log('⏱️ [TRAY] Tracking active but timer missing — restarting tray timer');
      }
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
      this._maybeRolloverLocalDay();
      const { computeTodayTimeLogSeconds } = require('../utils/today-time-log-stats');
      const userId = global.currentUserId || global.trackingManager?.currentSession?.user_id;
      const isTracking = !!(global.isTracking || global.trackingManager?.isTracking);
      const currentTimeLogId = isTracking
        ? (global.currentTimeLogId || global.trackingManager?.currentTimeLogId || null)
        : null;
      const agg = await computeTodayTimeLogSeconds(userId, currentTimeLogId, isTracking);
      const prevBase = Math.max(0, Math.floor(Number(this._cumulativeBaseSeconds) || 0));
      const nextBase = Math.max(0, Math.floor(Number(agg.completedClosedSeconds) || 0));
      const { reconcileForwardBase } = require('../utils/time-deductions');
      const reconciled = reconcileForwardBase(
        prevBase,
        nextBase,
        global._authorizedClosedDropSeconds,
      );
      global._authorizedClosedDropSeconds = reconciled.pending;
      this._cumulativeBaseSeconds = reconciled.base;
      console.log('⏱️ [TRAY] Cumulative base synced from DB+offline:', this._cumulativeBaseSeconds, 's');
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

    // CRITICAL: sleep freezes midnight timers. Force company day rollover now so
    // yesterday's 8h cannot stick when the user Starts later without quitting.
    try {
      this.ensureWorkDayRollover();
      this._scheduleNextWorkDayRollover();
    } catch (e) {
      console.warn('⚠️ [TRAY] Work-day check on resume failed:', e?.message || e);
    }

    // Use global.isTracking as ground truth (set in Phase 1 of stopTracking,
    // BEFORE the graceful shutdown that gets suspended by the OS).
    // The tray's own this.isTracking may still be stale (true) because
    // updateState() in Phase 3 hasn't run yet.
    const globalTracking = (typeof global !== 'undefined') && (global.isTracking === true);

    // Stop phantom ticks immediately — the 1s menu-bar delay used to keep
    // pushing "since midnight" into a stopped renderer after overnight sleep.
    if (!globalTracking) {
      this.isTracking = false;
      this.stopTrayTimer();
      this._trackingStartTime = null;
    }

    // Force re-sync after a short delay so macOS has fully restored the menu bar
    setTimeout(() => {
      try {
        if (!this.tray || this.tray.isDestroyed()) return;
        // Second pass — OS clock can settle after wake.
        this.ensureWorkDayRollover();
        if (!globalTracking) {
          console.log('⏱️ [TRAY] Force-clearing stale timer on resume (global.isTracking=false)');
          this.isTracking = false;
          this.stopTrayTimer();
          this._trackingStartTime = null;
          this.updateMenu();
        } else {
          // Tracking stayed active through sleep — restart interval ticks (they freeze in suspend).
          console.log('⏱️ [TRAY] Tracking still active after sleep — restarting tray timer');
          this.isTracking = true;
          this.startTrayTimer();
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

      if (!userPreferences.get('desktopNotifications')) return;

      // Only run the full check once
      if (fs.existsSync(flagFile)) {
        console.log('🔔 [TRAY] Notification permission already checked previously — skipping dialog');
        // Still send a silent welcome notification (works if allowed, harmless if not)
        try {
          new this.Notification({
            title: 'Tavilo Time',
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
          title: 'Tavilo Time',
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
   * macOS menu bar text next to the icon. Blank when the person turned
   * "Show timer in menu bar" off in Settings. force = repaint even if unchanged.
   */
  _setMenuBarTitle(text, force = false) {
    if (process.platform !== 'darwin') return;
    if (!this.tray || this.tray.isDestroyed?.() || typeof this.tray.setTitle !== 'function') return;
    const shown = text && userPreferences.get('showMenuBarTimer') ? text : '';
    if (!force && shown === this._lastTrayTitle) return;
    this.tray.setTitle(shown, { fontType: 'monospacedDigit' });
    this._lastTrayTitle = shown;
  }

  /** Settings changed the menu bar timer: show or clear it right away. */
  refreshMenuBarTitle() {
    if (this.isTracking) this.paintLiveTotal();
    else this._setMenuBarTitle('', true);
  }

  /**
   * Show notification
   */
  showNotification(title, body, options = {}) {
    // Settings → Notifications off hides everything except timer-stopped alerts.
    if (options.urgency !== 'critical' && !userPreferences.get('desktopNotifications')) {
      console.log(`🔕 [TRAY] Notification skipped (turned off in Settings): ${title}`);
      return;
    }
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