/**
 * CONFIGURATION & UI UTILITIES MANAGER MODULE
 * 
 * Manages configuration and UI-related utility functions for the Alyson PM desktop agent.
 * This includes settings fetching, tray creation, and UI initialization.
 * 
 * Part of Alyson PM Desktop Agent modular refactoring
 */

class ConfigUIManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.require = dependencies.require || require;
    this.config = dependencies.config;
    this.appSettings = dependencies.appSettings;
    this.mainWindow = dependencies.mainWindow;
    this.Tray = dependencies.Tray;
    this.Menu = dependencies.Menu;
    this.app = dependencies.app;
    this.Notification = dependencies.Notification;
    this.systemPreferences = dependencies.systemPreferences;
    
    console.log('✅ ConfigUIManager initialized');
  }

  /**
   * Push the current application settings to the renderer.
   *
   * Remote overrides came from the Supabase `get_app_settings` RPC and have no RDS
   * action behind /sync/desktop-action, so the locally configured values stand as-is
   * rather than being silently replaced by fabricated "server" values.
   */
  async fetchSettings() {
    try {
      this.console.log(
        '⚠️ [CONFIG-UI] Remote app settings unavailable (no RDS equivalent) — using local settings',
      );

      // Update UI with current settings
      this.mainWindow?.webContents.send('settings-updated', this.appSettings);

    } catch (error) {
      this.console.error('❌ Failed to fetch settings:', error);
    }
  }

  /**
   * Create and initialize system tray
   */
  createTray() {
    // Initialize TrayManager module
    const TrayManager = this.require('../ui/tray-manager');
    this.global.trayManager = new TrayManager({ 
      Tray: this.Tray, 
      Menu: this.Menu, 
      app: this.app, 
      Notification: this.Notification 
    });
    
    // Set additional dependencies
    this.global.trayManager.config = this.config;
    this.global.trayManager.systemPreferences = this.systemPreferences;
    
    // Initialize callbacks
    this.global.trayManager.initialize({
      onStartTracking: async (projectId) => {
        if (!this.config.project_id && !projectId) {
          if (this.mainWindow) {
            this.mainWindow.focus();
            this.global.safeSendToRenderer('show-project-selection-required', null);
          }
          new this.Notification({
            title: 'Project Selection Required',
            body: 'Please open the Alyson PM app and select a project before starting tracking from the menu bar.'
          }).show();
          return;
        }
        await this.global.startTracking(projectId || this.config.project_id);
      },
      onStopTracking: () => this.global.stopTracking(),
      onPauseTracking: () => this.global.pauseTracking('manual'),
      onResumeTracking: () => this.global.resumeTracking(),
      onShowWindow: () => {
        if (this.mainWindow) {
          if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore();
          }
          this.mainWindow.show();
          this.mainWindow.focus();
          if (process.platform === 'darwin') {
            this.app.focus();
          }
        }
      },
      onQuit: () => {
        global.isQuitting = true;
        this.app.quit();
      },
      onSelectProject: async (projectId) => {
        if (!projectId) {
          // No project id provided — show window for manual selection
          if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
            this.global.safeSendToRenderer('navigate-to-time-tracker', null);
          }
          return;
        }
        // If tracking, stop & restart with the new project
        if (this.global.isTracking) {
          console.log(`📁 [CONFIG-UI] Switching project to ${projectId} (stop then start)`);
          await this.global.stopTracking('manual', 'Switching project');
          await this.global.startTracking(projectId);
        } else {
          // Just remember the selection for next start
          if (this.config) this.config.project_id = projectId;
          this.global.currentProjectId = projectId;
        }
      },
      onDebugConsole: () => this.global.createDebugWindow(),
      onCheckAccessibility: async () => {
        let hasPermission = true;
        
        if (process.platform === 'darwin') {
          // Check if systemPreferences is available and has the method
          if (this.systemPreferences && typeof this.systemPreferences.isTrustedAccessibilityClient === 'function') {
            hasPermission = this.systemPreferences.isTrustedAccessibilityClient(false);
          } else {
            console.warn('⚠️ systemPreferences.isTrustedAccessibilityClient not available');
            hasPermission = true; // Assume granted if API not available
          }
        }
        
        if (hasPermission) {
          this.global.showTrayNotification('✅ Accessibility permission is granted and working', 'success');
        } else {
          this.global.showTrayNotification('❌ Accessibility permission required - starting simple setup...', 'warning');
          setTimeout(async () => {
            this.global.showTrayNotification('Use "Check Permissions..." for system setup', 'info');
          }, 1000);
        }
      },
      onSetupAccessibility: () => this.global.showTrayNotification('Use "Check Permissions..." for setup', 'info'),
      onCheckAllPermissions: async () => {
        try {
          // Use health check system instead of direct permission check
          if (this.global.systemMonitor) {
            this.global.showTrayNotification('🔒 Running system health check...', 'info');
            const health = await this.global.systemMonitor.performComprehensiveHealthCheck();
            
            if (health.canStartTimer) {
              this.global.showTrayNotification('✅ All systems ready!', 'success');
            } else {
              this.global.showTrayNotification(`❌ Issues found: ${health.issues.join(', ')}`, 'error');
            }
          } else {
            this.global.showTrayNotification('❌ System monitor not available', 'error');
          }
        } catch (error) {
          console.error('[tray] Manual system check failed:', error);
          this.global.showTrayNotification('❌ System check failed', 'error');
        }
      },
      onOpenAccessibilitySettings: () => {
        const { shell } = this.require('electron');
        const platform = process.platform;
        
        if (platform === 'darwin') {
          shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        } else if (platform === 'win32') {
          shell.openExternal('ms-settings:easeofaccess');
        } else if (platform === 'linux') {
          // Try to open common Linux accessibility settings
          shell.openExternal('gnome-control-center universal-access') // GNOME
            .catch(() => shell.openExternal('systemsettings5 kcm_accessibility')) // KDE
            .catch(() => shell.openExternal('https://wiki.gnome.org/Accessibility')); // Fallback to documentation
        }
      },
      onEnableFeatures: async () => {
        this.global.permissionDialogShown = false;
        await this.global.checkMacScreenPermissions();
      },
      onTestScreenCapture: async () => {
        try {
          // Prefer consolidated enhancedScreenshotManager when available
          if (this.global.enhancedScreenshotManager && typeof this.global.enhancedScreenshotManager.captureScreenshot === 'function') {
            const ok = await this.global.enhancedScreenshotManager.captureScreenshot(true);
            new this.Notification({
              title: 'Test Screen Capture',
              body: ok ? 'Screenshot test succeeded' : 'Screenshot test failed'
            }).show();
            return;
          }
          // Fallback to wrapper if available
          if (this.global.wrappers && typeof this.global.wrappers.captureScreenshot === 'function') {
            const ok = await this.global.wrappers.captureScreenshot(true);
            new this.Notification({ title: 'Test Screen Capture', body: ok ? 'Screenshot test succeeded' : 'Screenshot test failed' }).show();
            return;
          }
          // Final fallback: attempt direct screenshot-desktop
          const screenshot = this.require('screenshot-desktop');
          const img = await screenshot({ format: 'png' }).catch(() => null);
          new this.Notification({
            title: 'Test Screen Capture',
            body: img && img.length > 0 ? 'Screenshot test succeeded (fallback)' : 'Screenshot test failed (fallback)'
          }).show();
        } catch (e) {
          new this.Notification({ title: 'Test Screen Capture', body: 'Error: ' + (e?.message || 'unknown') }).show();
        }
      }
    });
    
    // Create the tray
    console.log('🔧 [CONFIG-UI] Creating system tray...');
    try {
      this.global.trayManager.create();
      console.log('✅ [CONFIG-UI] System tray created successfully');

      void (async () => {
        try {
          if (this.global.isTracking && typeof this.global.trayManager.ensureCumulativeBaseFromDb === 'function') {
            await this.global.trayManager.ensureCumulativeBaseFromDb();
          }
        } catch (e) {
          console.warn('⚠️ [CONFIG-UI] ensureCumulativeBaseFromDb:', e?.message || e);
        }
        // RACE FIX: TrayManager was recreated; if tracking already started, sync state after DB base load.
        this.global.trayManager.updateState(
          this.global.isTracking,
          this.global.isPaused,
          {
            projectName: this.global.currentSession?.projectName || null,
            projectId: this.global.currentProjectId || null,
            startTime: this.global.sessionStartTime || null
          }
        );
        this.global.trayManager.currentSession = this.global.currentSession;
        this.global.tray = this.global.trayManager.tray;
        this._fetchProjectListForTray();
        if (!this.global.tray) {
          console.error('❌ [CONFIG-UI] Tray object is null after creation!');
        } else {
          console.log('✅ [CONFIG-UI] Tray reference stored:', !!this.global.tray);
        }
      })();
    } catch (error) {
      console.error('❌ [CONFIG-UI] Failed to create tray:', error);
      console.error('❌ [CONFIG-UI] Error stack:', error.stack);
    }
  }

  /**
   * Update tray menu with throttling
   */
  updateTrayMenuThrottled() {
    if (this.global.trayManager) {
      // Update TrayManager state with extended info
      this.global.trayManager.updateState(
        this.global.isTracking,
        this.global.isPaused,
        {
          projectName: this.global.currentSession?.projectName || null,
          projectId: this.global.currentProjectId || null,
          startTime: this.global.sessionStartTime || null
        }
      );
      this.global.trayManager.currentSession = this.global.sessionManager ? 
        this.global.sessionManager.getCurrentSession() : this.global.currentSession;
      this.global.trayManager.config = this.config;
      
      // If we have an existing throttle function, use it
      if (this.global.trayUpdateTimeout) {
        clearTimeout(this.global.trayUpdateTimeout);
      }
      
      this.global.trayUpdateTimeout = setTimeout(() => {
        this.global.trayManager.updateMenu();
      }, 500); // 500ms throttle
    }
  }

  /**
   * Fetch the user's project list and cache it on the tray manager
   */
  async _fetchProjectListForTray() {
    try {
      const userId = this.global.currentUserId || this.config?.user_id;
      if (!userId) {
        console.log('⚠️ [CONFIG-UI] Cannot fetch projects for tray — missing userId');
        return;
      }
      const { listUserProjects } = require('./backend-time-logs');
      const assignments = await listUserProjects(userId, this.config);
      if (!Array.isArray(assignments)) {
        console.warn('⚠️ [CONFIG-UI] Failed to fetch projects for tray: unexpected response');
        return;
      }
      const projects = assignments.map(a => ({
        project_id: a.project_id || a.projects?.id,
        name: a.name || a.projects?.name || 'Unknown Project'
      }));
      if (this.global.trayManager) {
        this.global.trayManager.setProjectList(projects);
        // Pre-select current project if one is active
        if (this.global.currentProjectId) {
          this.global.trayManager._selectedProjectId = this.global.currentProjectId;
          const match = projects.find(p => p.project_id === this.global.currentProjectId);
          if (match) this.global.trayManager._currentProjectName = match.name;
        }
      }
      console.log(`📁 [CONFIG-UI] Cached ${projects.length} projects on tray`);
    } catch (e) {
      console.warn('⚠️ [CONFIG-UI] _fetchProjectListForTray error:', e?.message);
    }
  }

  /**
   * Update tray menu immediately
   */
  updateTrayMenu() {
    // Delegate to TrayManager
    if (this.global.trayManager) {
      this.global.trayManager.updateMenu();
    }
  }

  /**
   * Get current application settings
   */
  getAppSettings() {
    return this.appSettings || {
      screenshot_interval_seconds: 30,
      idle_threshold_seconds: 60,
      idle_detection_threshold_seconds: 60,
      idle_checkpoint_interval_seconds: 60,
      blur_screenshots: false,
      track_urls: true,
      track_applications: true,
      auto_start_tracking: false,
      max_idle_time_seconds: 2400,
      screenshot_quality: 80,
      notification_frequency_seconds: 120,
      enable_anti_cheat: true,
      suspicious_activity_threshold: 10,
      pattern_detection_window_minutes: 15,
      minimum_mouse_distance: 50,
      keyboard_diversity_threshold: 5,
      max_laptop_closed_hours: 1
    };
  }

  /**
   * Update application settings
   */
  updateAppSettings(newSettings) {
    this.appSettings = { ...this.appSettings, ...newSettings };
    
    // Notify UI of settings change
    this.mainWindow?.webContents.send('settings-updated', this.appSettings);
    
    this.console.log('⚙️ Application settings updated:', Object.keys(newSettings));
  }

  /**
   * Initialize configuration and UI components
   */
  async initializeConfigUI() {
    try {
      // Fetch settings from server
      await this.fetchSettings();
      
      // Create system tray
      this.createTray();
      
      this.console.log('⚙️ Configuration and UI components initialized');
    } catch (error) {
      this.console.error('❌ Failed to initialize config/UI components:', error);
    }
  }

  /**
   * Initialize the config UI manager
   */
  async initialize() {
    try {
      console.log('⚙️ ConfigUIManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ ConfigUIManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the config UI manager
   */
  async shutdown() {
    try {
      // Clear any pending tray updates
      if (this.global.trayUpdateTimeout) {
        clearTimeout(this.global.trayUpdateTimeout);
        this.global.trayUpdateTimeout = null;
      }
      
      console.log('⚙️ ConfigUIManager shutdown complete');
    } catch (error) {
      console.error('❌ ConfigUIManager shutdown failed:', error);
    }
  }
}

module.exports = ConfigUIManager;