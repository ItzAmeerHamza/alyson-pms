/**
 * INTERVAL CONFIGURATION MANAGER MODULE
 * 
 * Manages interval registration and configuration for the TimeFlow desktop agent.
 * This includes idle checking, tab monitoring, and background browser checks.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class IntervalConfigurationManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.Date = dependencies.Date || Date;
    this.Math = dependencies.Math || Math;
    this.setTimeout = dependencies.setTimeout || setTimeout;
    
    // Dependencies
    this.intervalManager = dependencies.intervalManager;
    this.getSystemIdleTime = dependencies.getSystemIdleTime;
    this.appSettings = dependencies.appSettings;
    this.mainWindow = dependencies.mainWindow;
    this.logIdlePeriod = dependencies.logIdlePeriod;
    this.isTracking = dependencies.isTracking;
    this.currentTimeLogId = dependencies.currentTimeLogId;
    this.config = dependencies.config;
    this.syncManager = dependencies.syncManager;
    this.getTodayAppCount = dependencies.getTodayAppCount;
    this.isBrowserApp = dependencies.isBrowserApp;
    this.extractUrlFromBrowser = dependencies.extractUrlFromBrowser;
    this.extractDomain = dependencies.extractDomain;
    this.processFoundUrl = dependencies.processFoundUrl;
    this.smartUrlCapture = dependencies.smartUrlCapture;
    this.activeWin = dependencies.activeWin;
    
    // State variables
    this.idleStart = null;
    
    console.log('✅ IntervalConfigurationManager initialized');
  }

  /**
   * Register idle check callback
   */
  registerIdleCheck() {
    if (!this.intervalManager) {
      this.console.log('⚠️ IntervalManager not available for idle check registration');
      return;
    }

    const ENABLE_INTERVAL_IDLE_CHECK = false; // Prefer enhanced idle monitor; avoid duplicate idle checks

    if (!ENABLE_INTERVAL_IDLE_CHECK) {
      this.console.log('🚫 [INTERVALS] IDLE_CHECK disabled to avoid duplicate idle detection');
      return;
    }

    this.intervalManager.register('IDLE_CHECK', () => {
      try {
        const idleTimeMs = this.getSystemIdleTime();
        const idleTimeSeconds = this.Math.floor(idleTimeMs / 1000);
        const idleDetectSeconds =
          this.appSettings?.idle_detection_threshold_seconds ||
          this.appSettings?.idle_threshold_seconds ||
          60;
        const isIdle = idleTimeSeconds >= idleDetectSeconds;
        
        // Handle idle state changes
        if (!isIdle && this.idleStart !== null) {
          // User became active
          const idleEnd = this.Date.now();
          const idleDuration = idleEnd - this.idleStart;
          const idleDurationSeconds = this.Math.floor(idleDuration / 1000);
          
          this.logIdlePeriod(this.idleStart, idleEnd, idleDurationSeconds);
          this.idleStart = null;
          
          this.mainWindow?.webContents.send('idle-status-changed', { 
            isIdle: false, 
            idleDuration: idleDurationSeconds,
            resumed: true
          });
        } else if (isIdle && this.idleStart === null) {
          // User became idle
          this.idleStart = this.Date.now() - idleTimeMs;
          
          this.mainWindow?.webContents.send('idle-status-changed', { 
            isIdle: true, 
            idleSince: this.idleStart,
            idleSeconds: idleTimeSeconds
          });
        }
        
        return { isIdle, duration: idleTimeMs, timestamp: this.Date.now() };
      } catch (error) {
        return { isIdle: false, duration: 0 };
      }
    });

    this.console.log('✅ [INTERVALS] Idle check callback registered');
  }

  /**
   * Register tab monitoring callback
   */
  registerTabMonitoring() {
    if (!this.intervalManager) {
      this.console.log('⚠️ IntervalManager not available for tab monitoring registration');
      return;
    }

    this.intervalManager.register('TAB_MONITORING', async () => {
      try {
        // 🔍 DEBUG: Log tracking status every time this runs
        this.console.log('🔍 [TAB_MONITORING] Check:', { 
          isTracking: this.isTracking, 
          currentTimeLogId: this.currentTimeLogId, 
          hasActiveWin: !!this.activeWin?.sync() 
        });
        
        const activeWindowInfo = this.activeWin?.sync();
        if (activeWindowInfo && this.isTracking && this.currentTimeLogId) {
          const appName = activeWindowInfo.owner.name;
          
          // CRITICAL: Double-check we have a valid time log
          if (!this.currentTimeLogId) {
            this.console.log('⚠️ [TAB_MONITORING] No active time log - skipping app capture');
            return;
          }
          
          // Do NOT save apps here. Centralized dwell writer handles persistence.
          this.console.log(`📱 [OPTIMIZED] Skipping app save in TAB_MONITORING (centralized dwell writer)`);
          
          // UI-only: emit a lightweight app-detected event without sync status
          // CRITICAL FIX: Filter out placeholder app detections
          const isPlaceholder = (
            appName.toLowerCase() === 'windows desktop' ||
            (activeWindowInfo.title || '').toLowerCase() === 'no active application detected'
          );
          
          if (!isPlaceholder) {
            this.mainWindow?.webContents.send('app-detected', {
              name: appName,
              title: activeWindowInfo.title || 'Unknown',
              timestamp: new this.Date().toISOString(),
              type: 'tab-monitor'
            });
          }
          
          // Update today's app count
          const todayAppCount = await this.getTodayAppCount();
          this.mainWindow?.webContents.send('today-app-count', todayAppCount);
          
          // FIXED: Proper URL extraction for browsers
          let extractedUrl = null;
          if (this.isBrowserApp(appName)) {
            this.console.log(`🔍 [TAB-MONITOR] Browser detected: ${appName}, extracting URL...`);
            try {
              extractedUrl = await this.extractUrlFromBrowser(appName, activeWindowInfo.title);
              if (extractedUrl) {
                this.console.log(`✅ [TAB-MONITOR] URL extracted: ${extractedUrl}`);
                
                // Process the URL like the legacy system does
                const urlData = {
                  url: extractedUrl,
                  title: activeWindowInfo.title || 'Untitled',
                  browser: appName,
                  domain: this.extractDomain(extractedUrl),
                  isActive: true,
                  fromTabMonitor: true
                };
                
                // Process URL (this handles throttling and database storage)
                await this.processFoundUrl(urlData);
              } else {
                this.console.log(`⚠️ [TAB-MONITOR] No URL extracted from ${appName}`);
              }
            } catch (urlError) {
              this.console.log(`❌ [TAB-MONITOR] URL extraction failed for ${appName}:`, urlError.message);
            }
          }
          
          return {
            app: appName,
            url: extractedUrl,
            title: activeWindowInfo.title
          };
        }
        
        return { app: 'Unknown', url: null };
      } catch (error) {
        this.console.error('❌ [TAB_MONITORING] Error:', error.message);
        return { app: 'Unknown', url: null };
      }
    });

    this.console.log('✅ [INTERVALS] Tab monitoring callback registered');
  }

  /**
   * Register background browser check
   */
  registerBackgroundBrowserCheck() {
    if (!this.intervalManager) {
      this.console.log('⚠️ IntervalManager not available for background browser check registration');
      return;
    }

    this.intervalManager.register('BACKGROUND_BROWSER_CHECK', async () => {
      try {
        this.console.log('🔍 [BACKGROUND_BROWSER_CHECK] Running URL detection...');
        await this.smartUrlCapture();
        return { status: 'completed' };
      } catch (error) {
        this.console.error('❌ [BACKGROUND_BROWSER_CHECK] Error:', error.message);
        return { status: 'error', error: error.message };
      }
    });

    this.console.log('✅ [INTERVALS] Background browser check registered');
  }

  /**
   * Register all interval callbacks
   */
  registerAllIntervalCallbacks() {
    this.console.log('🔧 [INTERVALS] Registering all interval callbacks...');
    
    this.registerIdleCheck();
    this.registerTabMonitoring();
    this.registerBackgroundBrowserCheck();
    
    this.console.log('✅ [INTERVALS] All interval callbacks registered');
  }

  /**
   * Get interval registration status
   */
  getIntervalStatus() {
    return {
      intervalManagerAvailable: !!this.intervalManager,
      idleStart: this.idleStart,
      currentIdleDuration: this.idleStart ? this.Date.now() - this.idleStart : 0,
      trackingActive: !!this.isTracking,
      currentTimeLogId: this.currentTimeLogId
    };
  }

  /**
   * Initialize the interval configuration manager
   */
  async initialize() {
    try {
      this.registerAllIntervalCallbacks();
      console.log('⏰ IntervalConfigurationManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ IntervalConfigurationManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the interval configuration manager
   */
  async shutdown() {
    try {
      console.log('⏰ IntervalConfigurationManager shutdown complete');
    } catch (error) {
      console.error('❌ IntervalConfigurationManager shutdown failed:', error);
    }
  }
}

module.exports = IntervalConfigurationManager;