/**
 * StartupManager - Centralized application startup and initialization
 * Extracted from main.js to improve modularity and maintainability
 */

// Session recovery for database synchronization
const { startSessionHealthCheck } = require('../utils/session-recovery');

class StartupManager {
  constructor(electronModules, dependencies = {}) {
    this.electronModules = electronModules;
    this.supabaseService = dependencies.supabaseService;
    this.cleanupRegistry = dependencies.cleanupRegistry;
    this.wrappers = dependencies.wrappers;
    this.sessionManager = dependencies.sessionManager;
    
    console.log('✅ StartupManager initialized');
  }

  /**
   * Main app startup function - FULLY MODULAR VERSION
   * Orchestrates the initialization of all core systems
   * PERFORMANCE FIX: Window is shown FIRST, then other managers initialize
   */
  async startMainApplication() {
    console.log('🚀 [STARTUP-MANAGER] TimeFlow Desktop Agent starting...');
    console.log('🔍 [STARTUP-MANAGER] Platform:', process.platform);
    console.log('🔍 [STARTUP-MANAGER] Node version:', process.version);
    console.log('🔍 [STARTUP-MANAGER] Electron version:', process.versions.electron);
    
    try {
      // PERFORMANCE FIX: Load only critical managers first, show window immediately
      const AppLifecycleManager = require('./app-lifecycle-manager');
      const ConfigManager = require('./config-manager');
      
      // Initialize minimal configuration (fast path)
      global.configManager = new ConfigManager();
      await global.configManager.initialize();
      
      // CRITICAL: Create and show window FIRST before loading other managers
      console.log('🪟 [STARTUP-MANAGER] Creating window immediately...');
      const { app, BrowserWindow, screen, powerMonitor } = this.electronModules;
      global.appLifecycleManager = new AppLifecycleManager({ app, BrowserWindow, screen, powerMonitor }, global.configManager.config);
      await global.appLifecycleManager.initialize();
      global.mainWindow = global.appLifecycleManager.getMainWindow();
      console.log('✅ [STARTUP-MANAGER] Window visible - loading remaining systems...');
      
      // Send loading state to renderer
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('app-loading', { stage: 'managers' });
      }
      
      // NOW load the remaining managers (window is already visible)
      const ActivityManager = require('../activity/activity-manager');
      const { UrlCaptureManager } = require('../url/UrlCaptureManager.js');
      const BrowserUrlManager = require('../capture/browser-url-manager.wrapper');
      const EventManager = require('./event-manager');
      const MonitoringManager = require('../monitoring/monitoring-manager');
      const EnhancedScreenshotManager = require('../capture/enhanced-screenshot-manager');
      const DatabaseManager = require('../database/database-manager');
      const EnhancedActivityManager = require('../activity/enhanced-activity-manager');
      const EnhancedSyncManager = require('../sync/enhanced-sync-manager');
      const LiveMonitoringManager = require('../monitoring/live-monitoring-manager');
      const EnhancedAppDetector = require('../capture/enhanced-app-detector');
      const WindowUIManager = require('./window-ui-manager');
      const EnhancedIdleMonitor = require('../activity/enhanced-idle-monitor');
      const IPCEventMap = require('./ipc-event-map');
      const DataStatsManager = require('../ipc/data-stats-manager');
      const TrackingManager = require('./tracking-manager');
      
      // Create all manager instances (window already visible)
      console.log('🔧 [STARTUP-MANAGER] Creating remaining manager instances...');
      await this._createAllManagers({
        AppLifecycleManager,
        ActivityManager,
        UrlCaptureManager,
        BrowserUrlManager,
        EventManager,
        EnhancedScreenshotManager,
        MonitoringManager,
        DatabaseManager,
        EnhancedActivityManager,
        EnhancedSyncManager,
        LiveMonitoringManager,
        EnhancedAppDetector,
        WindowUIManager,
        EnhancedIdleMonitor,
        IPCEventMap,
        DataStatsManager,
        TrackingManager
      });
      console.log('✅ [STARTUP-MANAGER] All manager instances created');
      
      // Initialize all systems
      console.log('🔧 [STARTUP-MANAGER] Initializing all systems...');
      await this._initializeAllSystems();
      console.log('✅ [STARTUP-MANAGER] All systems initialized');
      
      // Setup final initialization tasks
      console.log('🔧 [STARTUP-MANAGER] Finalizing setup...');
      await this._finalizeSetup();
      console.log('✅ [STARTUP-MANAGER] Setup finalized');
      
      // Notify renderer that app is fully ready
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('app-ready', { timestamp: Date.now() });
      }
      
      console.log('✅ [STARTUP-MANAGER] All systems operational - full modular architecture active!');
      
      // Auto-trigger runtime activity test if --test-runtime flag is present
      if (process.argv.includes('--test-runtime')) {
        console.log('🧪 [AUTO-TEST] --test-runtime flag detected, will trigger test after 5 seconds...');
        setTimeout(async () => {
          try {
            const { simulateNormalActivity, simulateFraudulentActivity } = require('../../test-runtime-activity');
            const detector = global.antiCheatDetector;
            
            if (!detector) {
              console.error('❌ [AUTO-TEST] AntiCheatDetector not available');
              return;
            }
            
            console.log('🧪 [AUTO-TEST] Starting runtime activity test...');
            console.log('📝 [AUTO-TEST] Simulating normal activity...');
            simulateNormalActivity(detector);
            
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            console.log('🚨 [AUTO-TEST] Simulating fraudulent activity...');
            simulateFraudulentActivity(detector);
            
            console.log('⏳ [AUTO-TEST] Waiting for analysis cycles (20 seconds)...');
            await new Promise(resolve => setTimeout(resolve, 20000));
            
            const suspiciousActivities = detector.analyzeActivity();
            console.log(`✅ [AUTO-TEST] Test complete. Detected ${suspiciousActivities?.length || 0} suspicious activities`);
            if (suspiciousActivities && suspiciousActivities.length > 0) {
              suspiciousActivities.forEach((a, i) => {
                console.log(`   ${i + 1}. ${a.type} (${a.severity}) - Confidence: ${a.details?.confidence || 'N/A'}`);
              });
            }
          } catch (error) {
            console.error('❌ [AUTO-TEST] Failed to run test:', error);
          }
        }, 5000);
      }
      
    } catch (error) {
      console.error('❌ [STARTUP-MANAGER] Critical startup error:', error);
      throw error;
    }
  }

  /**
   * Create all manager instances
   * NOTE: AppLifecycleManager is already created in startMainApplication() for fast window display
   */
  async _createAllManagers(managers) {
    try {
      console.log('🔧 [STARTUP-MANAGER] Creating manager instances...');
      const { app, BrowserWindow, screen, powerMonitor, systemPreferences, ipcMain, desktopCapturer, Tray, Menu } = this.electronModules;
      
      // AppLifecycleManager already created in startMainApplication() for early window display
      // Skip: global.appLifecycleManager = new managers.AppLifecycleManager(...)
      global.activityManager = new managers.ActivityManager(global.configManager.config);
      global.eventManager = new managers.EventManager({ app, powerMonitor });
      global.enhancedScreenshotManager = new managers.EnhancedScreenshotManager(global.configManager.config, { BrowserWindow, desktopCapturer });
      
      // CRITICAL FIX: Initialize the enhanced screenshot manager with dependencies
      global.enhancedScreenshotManager.initialize({
        wrappers: global.wrappers,
        supabaseService: this.supabaseService,
        mainWindow: null, // Will be set when window is created
        systemPreferences: systemPreferences
      });
      console.log('✅ [SCREENSHOT] Enhanced screenshot manager initialized with dependencies');
      global.screenshotManager = global.enhancedScreenshotManager;
      // EnhancedIdleDetector removed - using EnhancedIdleMonitor only
      global.monitoringManager = new managers.MonitoringManager(global.configManager.config);
      global.databaseManager = new managers.DatabaseManager(global.configManager.config, this.supabaseService);
      global.enhancedActivityManager = new managers.EnhancedActivityManager(global.configManager.config);
      global.enhancedSyncManager = new managers.EnhancedSyncManager(global.configManager.config, this.supabaseService);

      // Create BrowserUrlManager for legacy compatibility
      global.browserUrlManager = new managers.BrowserUrlManager(global.configManager.config);

      // Create unified UrlCaptureManager and route normalized events to the sync queue
      const rc = (global.configManager && global.configManager.appSettings) || {};
      const urlPipelineEnabled = (process.env.URL_PIPELINE_V2_ENABLED !== 'false');
      global.urlCaptureManager = new managers.UrlCaptureManager({
        debugLogging: true,
        // FIXED: Reduced deduplication to allow URL events through
        debounceMs: Number(process.env.URL_TRACKING_DEBOUNCE_MS || rc.url_tracking_debounce_ms || 100), // Reduced from 180ms
        minSliceSec: Number(process.env.URL_TRACKING_MIN_SLICE_SEC || rc.url_tracking_min_slice_sec || 1), // Reduced from 4s to 1s
        maxEventsPerSec: Number(process.env.URL_TRACKING_MAX_EVENTS_PER_SEC || rc.url_tracking_max_events_per_sec || 3), // Increased from 2 to 3
        privacy: {
          domainOnly: (process.env.URL_TRACKING_DOMAIN_ONLY === 'true') || !!rc.url_tracking_domain_only,
          redactQueryHash: (process.env.URL_TRACKING_REDACT_QUERY_HASH !== 'false') && (rc.url_tracking_redact_query_hash !== false)
        },
        // For testing, disable internal filtering
        skipInternalUrls: false,
        enabled: urlPipelineEnabled
      });

      if (!urlPipelineEnabled) {
        try { console.warn(JSON.stringify({ category: 'URL', event: 'PIPELINE_DISABLED', ts: new Date().toISOString() })); } catch {}
      }

      // Store reference to 'this' for use in event handler
      const self = this;
      
      console.log('🔧 [STARTUP] Attaching URL event handler to UrlCaptureManager...');
      console.log('🔧 [STARTUP] UrlCaptureManager event listeners before:', global.urlCaptureManager.listenerCount('url'));
      
      // Attach single URL event listener (canonical)
      global.urlCaptureManager.on('url', async (evt) => {
        try {
console.log('🌐 [URL] EVENT RECEIVED IN STARTUP MANAGER:', { url: evt?.url, source: evt?.source, ts: evt?.ts });
        
        // Guard: drop oversized URLs to avoid DB trigger rejection (>2048 chars)
        const candidateUrl = evt && evt.url;
        if (candidateUrl && typeof candidateUrl === 'string' && candidateUrl.length > 2048) {
          try { console.warn(JSON.stringify({ category: 'URL', event: 'DROPPED_OVERSIZE_URL', len: candidateUrl.length })); } catch {}
          return;
        }
        // Cap title length to avoid oversized payloads (standardized to 512)
        const cappedTitle = (evt && typeof evt.title === 'string') ? (evt.title.length > 512 ? evt.title.slice(0, 512) : evt.title) : '';

        // Extract domain from URL if not provided
        let domain = evt && evt.domain;
        if (!domain && evt && evt.url) {
          try {
            domain = new URL(evt.url).hostname;
          } catch (e) {
            domain = null;
          }
        }

        const payload = {
          organization_id: null, // Will be set by database trigger
          user_id: (global.trackingManager && global.trackingManager.currentSession && global.trackingManager.currentSession.user_id)
            || global.currentUserId
            || (self.sessionManager && self.sessionManager.getUserId && self.sessionManager.getUserId())
            || null,
          device_id: null, // Will be set by database trigger
          time_log_id: global.trackingManager?.currentTimeLogId || global.currentTimeLogId || null,
          site_url: evt && (evt.url ?? null),
          domain: domain,
          title: cappedTitle ?? '',
          browser: (evt && (evt.browser || evt.source)) || 'unknown',
          confidence: 'high',
          privacy_flags: evt && evt.privacyFlags || null,
          started_at: new Date((evt && evt.ts) ?? Date.now()).toISOString(),
          ended_at: null // Will be closed by next URL or cleanup
        };
        
        console.log('🌐 [URL] PROCESSING PAYLOAD:', { domain: payload.domain, browser: payload.browser, hasUserId: !!payload.user_id });
        
        // Debug: Check available services
        console.log('🔍 [URL] DEBUG - Available services:', {
          enhancedSyncManager: !!global.enhancedSyncManager,
          enhancedSyncManagerAddToQueue: !!(global.enhancedSyncManager && global.enhancedSyncManager.addToQueue),
          supabaseService: !!global.supabaseService,
          supabaseServiceFrom: !!(global.supabaseService && typeof global.supabaseService.from === 'function'),
          trackingManager: !!global.trackingManager,
          currentTimeLogId: global.trackingManager?.currentTimeLogId || null
        });
        
        // Try to save via enhancedSyncManager first
        let queued = false;
        if (global.enhancedSyncManager && global.enhancedSyncManager.addToQueue) {
          console.log('🌐 [URL] Using enhancedSyncManager.addToQueue');
          try {
            const result = await global.enhancedSyncManager.addToQueue('urlLogs', [payload]);
            if (result) {
              queued = true;
console.log('🌐 [URL] Queued via enhancedSyncManager:', payload.domain);
            } else {
              console.log('⚠️ [URL] enhancedSyncManager.addToQueue returned false');
            }
          } catch (error) {
            console.log('⚠️ [URL] enhancedSyncManager.addToQueue error:', error.message);
          }
        }

        // Fallback to direct Supabase service ONLY if not queued
        if (!queued) {
          if (global.supabaseService && typeof global.supabaseService.from === 'function') {
            console.log('🌐 [URL] Using direct Supabase service');
            try {
              const appUrlPayload = {
                organization_id: null,
                user_id: payload.user_id,
                device_id: null,
                time_log_id: payload.time_log_id,
                site_url: payload.site_url,
                domain: payload.domain,
                title: payload.title,
                browser: payload.browser,
                confidence: 'high',
                privacy_flags: payload.privacy_flags,
                started_at: payload.started_at,
                ended_at: null
              };
              global.supabaseService.from('app_url_activity').insert([appUrlPayload]).then(({ error }) => {
                if (error) {
                  console.error('❌ [URL] Direct DB insert to app_url_activity failed:', error.message);
                } else {
                  console.log('✅ [URL] Direct DB insert to app_url_activity succeeded:', payload.domain);
                }
              });
            } catch (e) {
              console.error('❌ [URL] Direct DB insert error:', e.message);
            }
          } else {
            console.log('❌ [URL] No sync manager or Supabase service available');
            console.log('🌐 [URL] DEBUG - enhancedSyncManager exists:', !!global.enhancedSyncManager);
            console.log('🌐 [URL] DEBUG - supabaseService exists:', !!global.supabaseService);
          }
        }
        } catch (handlerError) {
          console.error('❌ [URL] Event handler error (startup-manager):', handlerError?.message || handlerError);
        }
      });
      
      // Mark primary URL handler as attached to prevent fallbacks from attaching duplicates
      try { global.primaryUrlEventHandlerAttached = true; } catch {}
      console.log('🔧 [STARTUP] URL event handler attached successfully!');
      console.log('🔧 [STARTUP] UrlCaptureManager event listeners after:', global.urlCaptureManager.listenerCount('url'));
      
      // Test if UrlCaptureManager is emitting events by checking its internal state
      console.log('🔧 [STARTUP] UrlCaptureManager created (dormant until tracking starts):', {
        isRunning: global.urlCaptureManager.isRunning,
        isPolling: global.urlCaptureManager.isPolling,
        hasAdapter: !!global.urlCaptureManager.adapter,
        eventEmitter: !!global.urlCaptureManager.emit
      });

      // CRITICAL FIX: Do NOT auto-start URL capture during app initialization
      // URL capture will start automatically when trackingManager.startTracking() is called
      console.log('🌐 [URL] UrlCaptureManager ready (will start when timer starts)');
      global.liveMonitoringManager = new managers.LiveMonitoringManager(global.configManager.config);
      global.enhancedAppDetector = new managers.EnhancedAppDetector(global.configManager.config);
      global.windowUIManager = new managers.WindowUIManager(global.configManager.config, { app, BrowserWindow, Tray, Menu });
      global.enhancedIdleMonitor = new managers.EnhancedIdleMonitor(global.configManager.config);
      global.ipcEventMap = new managers.IPCEventMap({ app, ipcMain });
      // Register centralized data/stats IPC handlers (today stats, screenshots, activity log, etc.)
      // Ensure we have proper config loaded
      const { loadConfig } = require('../../../load-config');
      const properConfig = global.configManager.config || loadConfig();
      
      console.log('🔍 [STARTUP] Config for DataStatsManager:', {
        hasSupabaseUrl: !!properConfig.supabase_url,
        hasSupabaseKey: !!properConfig.supabase_key,
        urlValue: properConfig.supabase_url
      });
      
      global.dataStatsManager = new managers.DataStatsManager({
        ipcMain,
        config: properConfig,
        appSettings: global.configManager.appSettings || {},
        supabaseService: this.supabaseService,
        global
      });
      global.trackingManager = new managers.TrackingManager(global.configManager.config, { 
        supabaseService: this.supabaseService,
        systemMonitor: global.systemMonitor
      });
      
      console.log('✅ [STARTUP-MANAGER] All managers created');
    } catch (error) {
      console.error('❌ [STARTUP-MANAGER] Error creating managers:', error);
      throw error;
    }
  }

  /**
   * Recover from crash by closing stale URL slices
   */
  async _recoverStaleUrlSlices() {
    try {
      if (!global.supabaseClient) {
        console.log('⚠️ [STARTUP] Skipping URL crash recovery - no Supabase client');
        return;
      }

      // Find open URL slices from before last known heartbeat
      const lastHeartbeat = global.lastHeartbeat || new Date(Date.now() - 3600000); // Default to 1 hour ago
      
      const { data: staleSlices, error } = await global.supabaseClient
        .from('app_url_activity')
        .select('id, user_id, started_at')
        .is('ended_at', null)
        .lt('started_at', lastHeartbeat.toISOString())
        .limit(100);

      if (error) {
        console.error('❌ [STARTUP] URL crash recovery query failed:', error);
        return;
      }

      if (!staleSlices || staleSlices.length === 0) {
        console.log('✅ [STARTUP] No stale URL slices to recover');
        return;
      }

      console.log(`🔧 [STARTUP] Found ${staleSlices.length} stale URL slices to close`);

      // Close each stale slice with the last heartbeat time (clamped to now if future)
      const now = new Date();
      for (const slice of staleSlices) {
        try {
          // Clamp ended_at to now if heartbeat is in the future (clock skew)
          const clampedEndTime = lastHeartbeat > now ? now : lastHeartbeat;
          
          const { error: updateError } = await global.supabaseClient
            .from('app_url_activity')
            .update({ 
              ended_at: clampedEndTime.toISOString()
            })
            .eq('id', slice.id)
            .eq('user_id', slice.user_id)
            .is('ended_at', null);

          if (updateError) {
            console.error(`❌ [STARTUP] Failed to close stale slice ${slice.id}:`, updateError);
          }
        } catch (e) {
          console.error(`❌ [STARTUP] Exception closing stale slice ${slice.id}:`, e);
        }
      }

      console.log('✅ [STARTUP] URL crash recovery completed');
    } catch (error) {
      console.error('❌ [STARTUP] URL crash recovery failed:', error);
      // Non-critical, continue startup
    }
  }

  /**
   * Initialize all systems in proper order
   */
  async _initializeAllSystems() {
    try {
      console.log('🔧 [STARTUP-MANAGER] Starting system initialization...');
      
      // FIXED: Initialize platform manager first for app detection
      console.log('🔧 [STARTUP-MANAGER] Initializing platform manager...');
      const PlatformManager = require('../../platform/platform-manager');
      global.platformManager = new PlatformManager();
      console.log('🔧 [STARTUP-MANAGER] Platform manager created, initializing platform...');
      global.platformManager.initializePlatform(); // CRITICAL: Initialize platform-specific modules
      console.log('✅ [STARTUP-MANAGER] Platform manager initialized and platform-specific modules loaded');
      
      // Initialize event system first
      global.eventManager.initialize();

      // Register data/stats IPC handlers BEFORE creating/loading the window to avoid renderer race conditions
      // This ensures channels like 'get-today-screenshots' are available when the UI boots
      await global.dataStatsManager.initialize();
      
      // AppLifecycleManager already initialized in startMainApplication() for early window display
      // Just get the reference to the already-created window
      const mainWindow = global.appLifecycleManager.getMainWindow();
      global.mainWindow = mainWindow;
      
      // CRITICAL FIX: Update EventHandlerManager's mainWindow reference
      // EventHandlerManager was constructed before window creation, so it has undefined mainWindow
      if (global.eventHandlerManager) {
        global.eventHandlerManager.mainWindow = mainWindow;
        console.log('✅ [STARTUP-MANAGER] Updated EventHandlerManager.mainWindow reference');
      }
      
      // Initialize dependencies for managers
      const activityStats = global.activityStats || {};
      const periodActivityStats = global.periodActivityStats || {};
      const loggingThrottle = global.loggingThrottle || {};
      const betweenScreenshotsActivity = global.betweenScreenshotsActivity || {};
      
      global.enhancedScreenshotManager.initialize({ 
        wrappers: this.wrappers || global.wrappers, 
        supabaseService: this.supabaseService, 
        mainWindow,
        systemPreferences: this.electronModules.systemPreferences 
      });
            // EnhancedIdleDetector initialization removed - using EnhancedIdleMonitor only
      global.databaseManager.initialize({ isTracking: false });
      
      // Crash recovery: close stale URL slices
      await this._recoverStaleUrlSlices();
      global.enhancedActivityManager.initialize({ 
        isTracking: false, 
        activityStats, 
        periodActivityStats, 
        loggingThrottle, 
        betweenScreenshotsActivity 
      });
      global.enhancedSyncManager.initialize({ isTracking: false });
      
      // Update enhancedSyncManager tracking state when tracking starts/stops
      if (global.trackingManager && global.trackingManager.on) {
        global.trackingManager.on('tracking-started', () => {
          if (global.enhancedSyncManager && global.enhancedSyncManager.setTrackingState) {
            global.enhancedSyncManager.setTrackingState(true);
            console.log('🔄 [STARTUP-MANAGER] Updated enhancedSyncManager tracking state: true');
          }
        });
        
        global.trackingManager.on('tracking-stopped', () => {
          if (global.enhancedSyncManager && global.enhancedSyncManager.setTrackingState) {
            global.enhancedSyncManager.setTrackingState(false);
            console.log('🔄 [STARTUP-MANAGER] Updated enhancedSyncManager tracking state: false');
          }
        });
      }
      global.liveMonitoringManager.initialize({ isTracking: false });
      global.enhancedAppDetector.initialize({ isTracking: false });
      // Ensure detector has correct user_id from loaded config for early runs
      try {
        if (global.enhancedAppDetector && global.configManager?.config?.user_id) {
          global.enhancedAppDetector.config = global.enhancedAppDetector.config || {};
          global.enhancedAppDetector.config.user_id = global.configManager.config.user_id;
          global.enhancedAppDetector.config.userId = global.configManager.config.user_id;
        }
      } catch {}
      global.windowUIManager.initialize();
      global.enhancedIdleMonitor.initialize({ isTracking: false });
      global.ipcEventMap.initialize();
      global.trackingManager.initialize({
        wrappers: this.wrappers,
        consolidationFixes: global.consolidationFixes,
        intervalManager: global.intervalManager,
        systemMonitor: global.systemMonitor,
        mainWindow: global.mainWindow,
        enhancedAppDetector: global.enhancedAppDetector  // 🔧 CRITICAL FIX: Pass app detector to tracking manager
      });
      
      // Optional QA aid: auto-start tracking after managers init when explicitly enabled via env
      try {
        if (process.env.AUTO_START_TRACKING === 'true') {
          let projectId = global.currentProjectId || null;
          if (!projectId) {
            try {
              const supabase = this.supabaseService || global.supabaseService || global.supabaseClient;
              const userId = global.currentUserId || global.configManager?.config?.user_id;
              if (supabase && userId) {
                const { data, error } = await supabase
                  .from('employee_project_assignments')
                  .select('project_id')
                  .eq('user_id', userId);
                if (!error && Array.isArray(data) && data.length > 0) {
                  const randomIndex = Math.floor(Math.random() * data.length);
                  projectId = data[randomIndex].project_id;
                  console.log('🎲 [STARTUP-MANAGER] Auto-selected random project for AUTO_START:', projectId);
                }
              }
            } catch (e) {
              console.log('⚠️ [STARTUP-MANAGER] Random project selection failed:', e?.message || e);
            }
          }
          if (!projectId) projectId = '00000000-0000-0000-0000-000000000001';
          setTimeout(async () => {
            if (!global.isTracking) {
              console.log('🎬 [STARTUP-MANAGER] AUTO_START_TRACKING enabled — starting tracking');
              try {
                const result = global.trackingManager?.startTracking
                  ? await global.trackingManager.startTracking(projectId)
                  : await global.startTracking?.(projectId);
                console.log('🎬 [STARTUP-MANAGER] AUTO_START_TRACKING result:', result?.success, 'timeLogId:', result?.timeLogId);
              } catch (e) {
                console.log('⚠️ [STARTUP-MANAGER] AUTO_START_TRACKING failed:', e.message);
              }
            }
          }, 1500);
        }
      } catch {}
      
      // Initialize monitoring manager with all systems
      global.monitoringManager.initialize({
        activityManager: global.activityManager,
        screenshotManager: global.enhancedScreenshotManager,
        enhancedIdleMonitor: global.enhancedIdleMonitor,
        browserUrlManager: global.browserUrlManager
      });
      
      console.log('✅ [STARTUP-MANAGER] All systems initialized');
    } catch (error) {
      console.error('❌ [STARTUP-MANAGER] Error initializing systems:', error);
      throw error;
    }
  }

  /**
   * Finalize setup tasks
   */
  async _finalizeSetup() {
    try {
      // Ensure system tray is created via ConfigUIManager (primary path)
      try {
        console.log('🔧 [STARTUP-MANAGER] Attempting to create system tray...');
        const ConfigUIManager = require('../utils/config-ui-manager');
        if (!global.configUIManager) {
          console.log('🔧 [STARTUP-MANAGER] Creating ConfigUIManager instance...');
          global.configUIManager = new ConfigUIManager({
            global,
            config: global.configManager.config,
            Tray: this.electronModules.Tray,
            Menu: this.electronModules.Menu,
            app: this.electronModules.app,
            Notification: this.electronModules.Notification,
            systemPreferences: this.electronModules.systemPreferences,
          });
          console.log('✅ [STARTUP-MANAGER] ConfigUIManager created');
        }
        // Provide mainWindow reference and create tray
        global.configUIManager.mainWindow = global.mainWindow || global.appLifecycleManager?.getMainWindow();
        if (typeof global.configUIManager.createTray === 'function') {
          console.log('🔧 [STARTUP-MANAGER] Calling createTray()...');
          global.configUIManager.createTray();
          console.log('✅ [STARTUP-MANAGER] createTray() completed');

          // Request notification permission on first launch
          if (global.trayManager && typeof global.trayManager.requestNotificationPermission === 'function') {
            global.trayManager.requestNotificationPermission();
          }
        } else {
          console.error('❌ [STARTUP-MANAGER] createTray is not a function!');
        }
      } catch (trayError) {
        console.error('❌ [STARTUP-MANAGER] Failed to create tray via ConfigUIManager:', trayError);
        console.error('❌ [STARTUP-MANAGER] Error stack:', trayError.stack);
      }
      
      // Clean up stale sessions
      if (this.sessionManager) {
        this.sessionManager.initialize({ supabaseService: this.supabaseService });
        await this.sessionManager.cleanupStaleActiveSessions();
      }
      
      // Sync app detector tracking state after tray+cleanup
      // The renderer may have started tracking before the app detector was initialized
      if (global.isTracking && global.enhancedAppDetector && !global.enhancedAppDetector.isTracking) {
        console.log('🔄 [STARTUP-MANAGER] Syncing app detector tracking state to true (renderer started early)');
        global.enhancedAppDetector.setTrackingState(true);
        if (global.enhancedAppDetector.startAppCapture) {
          global.enhancedAppDetector.startAppCapture();
        }
        setTimeout(() => {
          if (global.isTracking && global.enhancedAppDetector) {
            global.enhancedAppDetector.startRealTimeAppDetection?.();
          }
        }, 1000);
      }

      // Start comprehensive monitoring (or late-start subsystems if already running)
      await global.monitoringManager.startAllMonitoring();

      // RACE FIX: If tracking started before _finalizeSetup(), the idle monitor
      // may have been skipped. Force-start it now that the reference is wired.
      if (global.isTracking && global.enhancedIdleMonitor &&
          !global.enhancedIdleMonitor.idleMonitoringInterval) {
        console.log('🔧 [STARTUP-MANAGER] Force-starting idle monitor (tracking started before finalize)');
        global.enhancedIdleMonitor.setTrackingState(true);
        global.enhancedIdleMonitor.startIdleMonitoring();
      }

      // Start session health monitoring for database synchronization
      startSessionHealthCheck();
      
      // Check permissions via consolidated system monitor
      if (global.systemMonitor) {
        console.log('🔐 [STARTUP-MANAGER] Running consolidated permission check...');
        const healthCheck = await global.systemMonitor.performComprehensiveHealthCheck();
        console.log(`✅ [STARTUP-MANAGER] Health check completed: ${healthCheck.overall}`);
      } else {
        console.log('⚠️ [STARTUP-MANAGER] System monitor not available, skipping permission check');
      }
      
      // Do not auto-prompt Accessibility on startup.
      // Auto-prompts can loop on macOS when permission APIs are stale.
      // User can grant access from the explicit "System access" panel.
      if (process.platform === 'darwin') {
        try {
          const { systemPreferences } = require('electron');
          if (systemPreferences && typeof systemPreferences.isTrustedAccessibilityClient === 'function') {
            const accessibilityGranted = systemPreferences.isTrustedAccessibilityClient(false);
            if (!accessibilityGranted) {
              console.log('🔐 [STARTUP-MANAGER] Accessibility permission not yet detected (no auto-prompt)');
            } else {
              console.log('✅ [STARTUP-MANAGER] Accessibility permission already granted');
            }
          }
        } catch (e) {
          console.warn('⚠️ [STARTUP-MANAGER] Accessibility check failed:', e.message);
        }
      }
      
      // Setup memory monitoring
      if (typeof global.exposeMemoryAuditVariables === 'function') {
        global.exposeMemoryAuditVariables();
      }
      
      // Initialize AntiCheatDetector if enabled
      try {
        const appSettings = global.configManager?.config || {};
        const enableAntiCheat = appSettings.enable_anti_cheat !== false; // Default to true if not specified
        
        if (enableAntiCheat && !global.antiCheatDetector) {
          console.log('🛡️ [STARTUP-MANAGER] Initializing AntiCheatDetector...');
          const AntiCheatDetector = require('../activity/anti-cheat-detector');
          global.antiCheatDetector = new AntiCheatDetector(
            appSettings,
            global.enhancedSyncManager || global.syncManager
          );
          console.log('✅ [STARTUP-MANAGER] AntiCheatDetector initialized');
        } else if (!enableAntiCheat) {
          console.log('⚠️ [STARTUP-MANAGER] AntiCheatDetector disabled in settings');
        } else {
          console.log('ℹ️ [STARTUP-MANAGER] AntiCheatDetector already initialized');
        }
      } catch (error) {
        console.error('❌ [STARTUP-MANAGER] Failed to initialize AntiCheatDetector:', error);
      }
      
      // Remove duplicate URL handler attachment in finalize step (handled above)
      
      console.log('✅ [STARTUP-MANAGER] Setup finalized');
    } catch (error) {
      console.error('❌ [STARTUP-MANAGER] Error in finalization:', error);
      throw error;
    }
  }

  /**
   * Cleanup function for registry
   */
  shutdown() {
    try {
      console.log('🧹 [STARTUP-MANAGER] Shutting down...');
      
      // Shutdown all managers in reverse order
      const managersToShutdown = [
        'trackingManager',
        'ipcEventMap', 
        'enhancedIdleMonitor',
        'windowUIManager',
        'enhancedAppDetector',
        'liveMonitoringManager',
        'enhancedSyncManager',
        'enhancedActivityManager',
        'databaseManager',

        'enhancedScreenshotManager',
        'monitoringManager',
        'eventManager',
        'permissionManager',

        'activityManager',
        'appLifecycleManager',
        'configManager'
      ];
      
      managersToShutdown.forEach(managerName => {
        if (global[managerName] && typeof global[managerName].shutdown === 'function') {
          global[managerName].shutdown();
        }
      });
      
      console.log('✅ [STARTUP-MANAGER] Shutdown complete');
    } catch (error) {
      console.error('❌ [STARTUP-MANAGER] Error during shutdown:', error);
    }
  }
}

// Register with cleanup registry if available
if (typeof global !== 'undefined' && global.cleanupRegistry) {
  global.cleanupRegistry.register('startup-manager', () => {
    if (global.startupManager && global.startupManager.shutdown) {
      global.startupManager.shutdown();
    }
  });
}

module.exports = StartupManager;