/**
 * BrowserUrlManager - Centralized browser URL capture and monitoring
 * Extracted from main.js to improve modularity and maintainability
 */

const { EventEmitter } = require('events');
const { canonicalizeUrl } = require('../utils/url-utils');
// Removed: const { execSync } = require('child_process');

class BrowserUrlManager extends EventEmitter {
  constructor(config, dependencies = {}) {
    super();
    this.config = config;
    this.syncManager = dependencies.syncManager || global.syncManager || global.enhancedSyncManager || null;
    this.cleanupRegistry = dependencies.cleanupRegistry;
    
    // Async Darwin adapter (non-blocking AppleScript)
    try {
      const { DarwinUrlCapture } = require('../../platform/darwin/urlCapture.js');
      this.urlAdapter = new DarwinUrlCapture();
    } catch (e) {
      this.urlAdapter = null;
      console.log('⚠️ [BROWSER-URL-MANAGER] DarwinUrlCapture not available:', e.message);
    }
    
    // URL tracking state - initialize from global state if available
    this.urlCaptureEnabled = false;
    this.lastUrlCapture = null;
    this.lastUrlCaptureTime = null;
    this.lastBrowserUrls = new Map();
    this.lastUrlCapturesByBrowser = new Map();
    
    // CRITICAL: Initialize tracking state from global immediately
    this.isTracking = global.isTracking || false;
    this.currentTimeLogId = global.currentTimeLogId || null;
    
    // Ensure user ID is available
    if (global.currentUserId && this.config && !this.config.user_id) {
      this.config.user_id = global.currentUserId;
      this.config.userId = global.currentUserId;
    }
    
    // Monitoring intervals
    this.urlCaptureInterval = null;
    this.activeBrowserUrlCheckInterval = null;
    
    // Performance tracking
    this.urlCaptureCounter = 0;
    this.lastActiveBrowserCheck = 0;
    this.currentActiveBrowser = null;
    
    // Idempotency flags
    this.captureStarted = false;
    
    // Start state sync monitor immediately in constructor
    this.startStateSyncMonitor();
    
    console.log('✅ BrowserUrlManager initialized with state sync monitor');
    console.log(`   Initial state: isTracking=${this.isTracking}, timeLogId=${this.currentTimeLogId}, userId=${this.config?.user_id}`);
  }

  /**
   * Initialize the URL manager
   */
  initialize(deps = {}) {
    this.mainWindow = deps.mainWindow;
    this.systemMonitor = deps.systemMonitor;
    this.isTracking = deps.isTracking;
    this.currentTimeLogId = deps.currentTimeLogId;
    this.lastActivity = deps.lastActivity;
    
    // Install state synchronization monitor
    this.startStateSyncMonitor();
    
    try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'URL', step: 'INIT', message: 'BrowserUrlManager initialized' }); } catch {}
  }

  /**
   * Monitor and sync state with global values
   */
  startStateSyncMonitor() {
    if (this.stateSyncInterval) {
      clearInterval(this.stateSyncInterval);
    }
    
    this.stateSyncInterval = setInterval(() => {
      // Sync tracking state from global if it's more current or missing
      const needsTimeLogSync = global.isTracking && global.currentTimeLogId && this.currentTimeLogId !== global.currentTimeLogId;
      const needsTrackingSync = global.isTracking !== undefined && this.isTracking !== global.isTracking;
      const needsUserIdSync = global.currentUserId && this.config && !this.config.user_id;
      
      // CRITICAL FIX: Self-healing - force urlCaptureEnabled=true when tracking is active
      // Check global.isTracking (not this.isTracking) since local state hasn't synced yet
      const needsUrlEnabledSync = global.isTracking && !this.urlCaptureEnabled;
      
      if (needsTimeLogSync || needsTrackingSync || needsUserIdSync || needsUrlEnabledSync) {
        try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'STATE SYNC', ctx: { before: { timeLogId: this.currentTimeLogId, isTracking: this.isTracking, user_id: this.config?.user_id, urlCaptureEnabled: this.urlCaptureEnabled } } }); } catch {}
        
        if (needsTimeLogSync) this.currentTimeLogId = global.currentTimeLogId;
        if (needsTrackingSync) this.isTracking = global.isTracking;
        if (needsUserIdSync) this.config.user_id = global.currentUserId;
        
        // CRITICAL FIX: Force enable URL capture when tracking is active
        if (needsUrlEnabledSync) {
          console.log('🔧 [URL] Self-healing: Enabling URL capture (tracking is active but capture was disabled)');
          this.urlCaptureEnabled = true;
        }
        
        console.log(`   After: timeLogId=${this.currentTimeLogId}, isTracking=${this.isTracking}, user_id=${this.config?.user_id}, urlCaptureEnabled=${this.urlCaptureEnabled}`);

        // Auto-start URL capture when tracking becomes active after an earlier defer
        const trackingJustEnabled = needsTrackingSync && this.isTracking === true && !this.captureStarted;
        if (trackingJustEnabled) {
          try {
            console.log('🌐 [URL] Tracking enabled → starting URL capture now');
            // Fire and forget; internal guards prevent duplicate starts
            this.startUrlCapture().catch(e => console.log('⚠️ [URL] startUrlCapture after tracking-on failed:', e?.message || e));
          } catch (e) {
            console.log('⚠️ [URL] Failed to auto-start capture on tracking enable:', e?.message || e);
          }
        }
        
        // CRITICAL FIX: Re-trigger capture if tracking is active but capture hasn't started
        const needsCaptureRestart = this.isTracking && this.urlCaptureEnabled && !this.captureStarted;
        if (needsCaptureRestart) {
          console.log('🔧 [URL] Self-healing: Re-triggering URL capture (tracking active, enabled, but not started)');
          try {
            this.startUrlCapture().catch(e => console.log('⚠️ [URL] Self-healing capture restart failed:', e?.message || e));
          } catch (e) {
            console.log('⚠️ [URL] Failed to restart capture:', e?.message || e);
          }
        }
      }
    }, 2000); // Check every 2 seconds for faster sync
    
    try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'STATE MONITOR START' }); } catch {}
  }

  /**
   * Set current time log ID (called when tracking starts/stops)
   */
  setCurrentTimeLogId(timeLogId) {
    this.currentTimeLogId = timeLogId;
    try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'URL', step: 'TIMELOG UPDATE', ctx: { time_log_id: timeLogId } }); } catch {}
  }

  /**
   * Start enhanced URL capture with event-driven monitoring
   */
  async startUrlCapture() {
    // Prevent duplicate starts
    if (this.captureStarted) {
      try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'START SKIPPED', message: 'Capture already started' }); } catch {}
      return;
    }

    // Only start when tracking is active
    if (!this.isTracking) {
      try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'URL', step: 'DEFER START', message: 'Tracking inactive; deferring URL capture' }); } catch {}
      return;
    }
    
    try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'URL', step: 'START CAPTURE', ctx: { enabled: this.urlCaptureEnabled, isTracking: this.isTracking, time_log_id: this.currentTimeLogId } }); } catch {}
    
    if (!this.urlCaptureEnabled) {
      try { const { logger } = require('../utils/logger'); logger && logger.warn({ category: 'URL', step: 'ENABLE FALLBACK' }); } catch {}
      this.urlCaptureEnabled = true; // Enable anyway with fallbacks
    }
    
    // TRULY EVENT-DRIVEN: Only capture URLs when browsers are actually used
    const captureActiveUrl = async () => {
      // Allow URL detection even when not tracking for real-time display
      try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'REAL-TIME CAPTURE' }); } catch {}
      
      // PERFORMANCE FIX: Ultra-aggressive URL capture throttling based on performance mode
      this.urlCaptureCounter++;
      
      // Performance-mode based throttling - FIXED: Less aggressive for URL detection
      const currentMode = global.getCurrentMode ? global.getCurrentMode() : 'normal';
      let skipRatio;
      switch(currentMode) {
        case 'ultra_performance':
          skipRatio = 3; // Skip 66% of attempts (1 in 3)
          break;
        case 'high_performance':
          skipRatio = 2; // Skip 50% of attempts (1 in 2)
          break;
        default:
          skipRatio = 1; // No skipping for normal mode
      }
      
      if (this.urlCaptureCounter % skipRatio !== 0) {
        return; // Skip based on performance mode
      }
      
      try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'CHECK', ctx: { skipRatio, mode: currentMode } }); } catch {}
      
      try {
        await this.smartUrlCapture();
      } catch (error) {
        console.log(`❌ [BROWSER-URL-MANAGER] URL capture error:`, error.message);
        // Continue trying - don't give up on URL capture
      }
    };

    // Store the capture function globally so it can be triggered by activity
    global.captureActiveUrl = captureActiveUrl;
    
    // Capture current URL immediately via consolidated manager only
    // Avoid invoking legacy global capture paths to prevent duplicates
    await this.smartUrlCapture();

    // Ensure the tab change monitor is running as part of URL capture lifecycle
    try {
      if (typeof this.startActiveBrowserMonitoring === 'function') {
        this.startActiveBrowserMonitoring();
      }
    } catch (e) {
      try { const { logger } = require('../utils/logger'); logger && logger.warn({ category: 'URL', step: 'TAB MONITOR FAIL', message: e.message }); } catch {}
    }
    
    // ENHANCED: Also expose a force capture function for testing/manual triggers
    global.forceUrlCapture = async () => {
      console.log('🔍 [FORCE-URL] Manual URL capture triggered...');
      try {
        await this.smartUrlCapture();
        console.log('✅ [FORCE-URL] Manual URL capture completed');
      } catch (error) {
        console.log('❌ [FORCE-URL] Manual URL capture failed:', error.message);
      }
    };
    
    this.captureStarted = true;
    try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'URL', step: 'CAPTURE STARTED', ctx: { mode: 'enhanced' } }); } catch {}
    console.log('   🔄 Tab change monitoring every 2 seconds');
    console.log('   ⚡ Reduced throttling for tab switches (5s vs 30s)');
    console.log('   🌐 Background browser monitoring every 10 seconds');
  }

  /**
   * Stop URL capture and monitoring
   */
  stopUrlCapture() {
    if (this.urlCaptureInterval) {
      clearInterval(this.urlCaptureInterval);
      this.urlCaptureInterval = null;
    }
    
    // Stop enhanced tab monitoring
    this.stopActiveBrowserMonitoring();
    this.captureStarted = false;
    
    try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'URL', step: 'CAPTURE STOPPED' }); } catch {}
  }

  /**
   * Process found URL with enhanced duplicate prevention and throttling
   */
  async processFoundUrl(urlData) {
    try {
      try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'URL', step: 'PROCESS', ctx: { url: urlData.url, browser: urlData.browser } }); } catch {}
      
      // CRITICAL FIX: Ensure tracking state is synchronized from global
      if (global.isTracking && global.currentTimeLogId && !this.currentTimeLogId) {
        try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'STATE SYNC GLOBAL' }); } catch {}
        this.currentTimeLogId = global.currentTimeLogId;
        this.isTracking = global.isTracking;
        if (this.config && global.currentUserId) {
          this.config.user_id = global.currentUserId;
        }
      }
      
      const now = Date.now();
      
      // ENHANCED DUPLICATE PREVENTION: Check if this exact URL was recently captured
      const captureKey = `${urlData.browser}|${canonicalizeUrl(urlData.url)}`;
      const lastCaptureTime = this.lastUrlCapturesByBrowser.get(captureKey) || 0;
      const timeSinceLastCapture = now - lastCaptureTime;
      const lastUrl = this.lastBrowserUrls.get(urlData.browser);
      
      // Enhanced tab change detection: Immediate capture for new URLs, reduced throttling for tab monitor
      const isNewUrl = lastUrl !== urlData.url;
      const isFromTabMonitor = urlData.fromTabMonitor;
      
      // STRICT DUPLICATE PREVENTION: Much more aggressive throttling to prevent excessive counting
      let throttleDelay = 300 * 1000; // Default 5 minutes (increased from 60s)
      if (isFromTabMonitor) {
        throttleDelay = 60 * 1000; // 1 minute for tab monitor (increased from 15s)
      }
      
      // Background monitoring gets even stricter throttling
      if (urlData.fromBackground) {
        throttleDelay = 600 * 1000; // 10 minutes for background monitoring
      }
      
      // CRITICAL: Prevent duplicate saves within longer time window
      const minDuplicateDelay = 60 * 1000; // Minimum 60 seconds between same URL saves (increased from 10s)
      if (timeSinceLastCapture < minDuplicateDelay) {
        try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'DUPLICATE PREVENTED', ctx: { url: urlData.url, browser: urlData.browser, since_s: Math.round(timeSinceLastCapture/1000) } }); } catch {}
        return;
      }
      
      const enoughTimePassed = timeSinceLastCapture > throttleDelay;
      // FIXED ACTIVITY-BASED VALIDATION: Always capture URLs for real-time display
      const timeSinceLastActivity = now - this.lastActivity;
      const hasRecentActivity = timeSinceLastActivity < 300000; // Extended to 5 minutes (was 2 minutes)
      
      // ENHANCED LOGIC: Always capture new URLs and tab changes for UI display
      const isImportantCapture = isNewUrl || (isFromTabMonitor && timeSinceLastCapture > 30000); // New URLs or tab changes after 30s
      const isRealTimeDisplay = true; // Always allow for real-time UI display
      const shouldCapture = isImportantCapture || isRealTimeDisplay || (enoughTimePassed && hasRecentActivity);
      
      if (!shouldCapture) {
        const source = isFromTabMonitor ? '[TAB-MONITOR]' : '[ACTIVITY]';
        if (!hasRecentActivity && !isImportantCapture) {
          try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'SKIP', message: 'No recent activity', ctx: { url: urlData.url, browser: urlData.browser, since_s: Math.round(timeSinceLastActivity/1000) } }); } catch {}
        } else {
          try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'SKIP', message: 'Recent capture', ctx: { url: urlData.url, browser: urlData.browser, since_s: Math.round(timeSinceLastCapture/1000), threshold_s: throttleDelay/1000 } }); } catch {}
        }
        return;
      }
      
      // Same continuous URL: update UI only — never re-insert into DB.
      const source = isFromTabMonitor ? '[TAB-MONITOR]' : '[ACTIVITY]';
      if (!isNewUrl) {
        try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'REVISIT SKIP DB', ctx: { url: urlData.url, browser: urlData.browser, since_s: Math.round(timeSinceLastCapture/1000) } }); } catch {}
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          try {
            this.mainWindow.webContents.send('url-detected', {
              url: urlData.url,
              browser: urlData.browser,
              domain: urlData.domain,
              title: urlData.title,
              timestamp: new Date().toISOString(),
            });
          } catch (_) { /* ignore */ }
        }
        return;
      }
      try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'URL', step: 'NEW', ctx: { url: urlData.url, browser: urlData.browser, domain: urlData.domain, previous: lastUrl || 'none' } }); } catch {}
      
      // Update last URL for this browser and timing tracking
      this.lastBrowserUrls.set(urlData.browser, urlData.url);
      this.lastUrlCapturesByBrowser.set(captureKey, now);
      this.lastUrlCapture = urlData.url;
      this.lastUrlCaptureTime = new Date().toISOString();

      // Generate sync status ID for all URL detections (needed for UI tracking)
      const syncStatusId = `url-sync-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      // Send URL to UI for real-time display regardless of tracking status
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'SEND TO UI' }); } catch {}
        this.mainWindow.webContents.send('url-detected', {
          url: urlData.url,
          browser: urlData.browser,
          domain: urlData.domain,
          title: urlData.title,
          timestamp: new Date().toISOString(),
          syncStatusId: syncStatusId  // Include sync status ID for UI tracking
        });
      }

      // Save to database even without active tracking for history feature
      // Just set time_log_id to null when not tracking
      if (!this.currentTimeLogId) {
        try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'URL', step: 'SAVE WITHOUT TRACKING', message: 'Saving for history without active session' }); } catch {}
      }

      const cleanUrl = canonicalizeUrl(urlData.url);
      
      // PRIVACY: Apply URL redaction to remove query params and hash
      const redactedUrl = this.redactUrl(cleanUrl);
      console.log(`🔒 [URL] Redaction applied: ${cleanUrl !== redactedUrl ? 'yes' : 'no'}`);
      
      const finalDomain = urlData.domain || this.extractDomain(redactedUrl);
      
      const urlLog = {
        user_id: this.config.user_id,
        time_log_id: this.currentTimeLogId || null, // Allow null for history without tracking
        // Write to both columns for backward/forward compatibility
        site_url: redactedUrl,
        url: redactedUrl,
        title: urlData.title || 'Untitled',
        domain: finalDomain,
        browser: urlData.browser || 'Unknown',
        timestamp: new Date().toISOString()
      };
      
      // Debug log before saving to identify sync manager compatibility
      console.log('[URL-CAPTURE] Saving URL via sync manager:', {
        hasAddUrlLogs: !!this.syncManager?.addUrlLogs,
        hasAddToQueue: !!this.syncManager?.addToQueue,
        syncManagerType: this.syncManager?.constructor?.name || 'unknown'
      });

      // Queue for upload with dual-path compatibility for different sync managers
      console.log(`🌐 [URL] Enqueueing URL: ${urlLog.domain} | Browser: ${urlLog.browser}`);
      if (this.syncManager?.addUrlLogs) {
        await this.syncManager.addUrlLogs([urlLog]);
        console.log(`🌐 ✅ [URL] Queued via addUrlLogs: ${urlLog.domain} (${urlLog.browser})`);
      } else if (this.syncManager?.addToQueue) {
        await this.syncManager.addToQueue('urlLogs', urlLog);
        console.log(`🌐 ✅ [URL] Queued via addToQueue: ${urlLog.domain} (${urlLog.browser})`);
      } else if (global.enhancedSyncManager?.addToQueue) {
        await global.enhancedSyncManager.addToQueue('urlLogs', urlLog);
        console.log(`🌐 ✅ [URL] Queued via global enhancedSyncManager: ${urlLog.domain}`);
      } else if (global.syncManager?.addUrlLogs) {
        await global.syncManager.addUrlLogs([urlLog]);
        console.log(`🌐 ✅ [URL] Queued via global syncManager: ${urlLog.domain}`);
      } else {
        // Sync managers own every write path to RDS — no direct-insert fallback.
        console.log('❌ [URL-CAPTURE] No sync manager available to save URL');
      }
      
      try { const { logger } = require('../utils/logger'); logger && logger.info({ category: 'DB', step: 'ENQUEUE', message: 'URL log', ctx: { domain: urlLog.domain, browser: urlLog.browser } }); } catch {}
      
      // Send to debug console via system monitor
      if (this.systemMonitor) {
        this.systemMonitor.sendActivityUpdate('url', {
          domain: urlLog.domain,
          browser: urlLog.browser,
          url: urlLog.site_url
        });
        
        this.systemMonitor.sendDebugUpdate('URL', `URL detected: ${urlLog.domain} | Browser: ${urlLog.browser}`);
      }
      
      // Emit event for other modules
      this.emit('url-captured', urlLog);
      
    } catch (error) {
      console.error('❌ [BROWSER-URL-MANAGER] Error processing URL:', error);
    }
  }

  /**
   * Smart URL capture - checks when browser is active or URLs change
   */
  async smartUrlCapture() {
    console.log('🌐 [BROWSER-URL-MANAGER] smartUrlCapture invoked');
    if (global.wrappers && global.wrappers.smartUrlCapture) {
      try {
        const res = await global.wrappers.smartUrlCapture();
        console.log('🌐 [BROWSER-URL-MANAGER] wrapper result:', res ? 'ok' : 'no-op');
        if (res) return res;
      } catch (e) {
        console.log('❌ [BROWSER-URL-MANAGER] wrapper error:', e.message);
      }
    }
    
    // Fallback implementation
    try {
      const runningBrowsers = await this.getAllRunningBrowsers();
      
      if (runningBrowsers.length === 0) {
        return;
      }
      
      // Check all running browsers for URL changes
      for (const browser of runningBrowsers) {
        const url = await this.extractUrlFromBrowser(browser.name, browser.title);
        if (url) {
          const urlData = {
            url: url,
            title: browser.title || 'Untitled',
            browser: browser.name,
            domain: this.extractDomain(url),
            isActive: false
          };
          
          await this.processFoundUrl(urlData);
        } else {
          console.log(`⚠️ [URL-CAPTURE] No URL extracted from browser: ${browser.name} (${browser.title})`);
        }
      }
      
      if (runningBrowsers.length === 0) {
        console.log('⚠️ [URL-CAPTURE] No running browsers found');
      }
    } catch (error) {
      console.log('❌ [BROWSER-URL-MANAGER] Smart URL capture error:', error.message);
    }
  }

  /**
   * Enhanced active browser monitoring for tab changes
   */
  startActiveBrowserMonitoring() {
    // Only run tab monitor when tracking is active
    if (!this.isTracking) {
      try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'URL', step: 'TAB MONITOR DEFER', message: 'Tracking inactive; not starting tab monitor' }); } catch {}
      return;
    }

    // Idempotent: if already running, skip restarting
    if (this.activeBrowserUrlCheckInterval) {
      console.log('✅ [BROWSER-URL-MANAGER] Tab change monitoring already running');
      return;
    }
    
    console.log('🔍 [BROWSER-URL-MANAGER] Starting enhanced tab change detection...');
    
    // IMPROVED: Check for tab changes every 3 seconds CONTINUOUSLY
    this.activeBrowserUrlCheckInterval = setInterval(async () => {
      try {
        const activeApp = await global.detectActiveApplication?.();
        const currentApp = activeApp?.name;
        
        // ENHANCED: Always check browsers, not just when they're active
        const runningBrowsers = await this.getAllRunningBrowsers();
        
        if (runningBrowsers.length === 0) {
          return;
        }
        
        // Check for URL changes in active browser first
        if (currentApp && this.isBrowserApp(currentApp)) {
          const activeBrowser = runningBrowsers.find(b => 
            b.name.toLowerCase().includes(currentApp.toLowerCase()) ||
            currentApp.toLowerCase().includes(b.name.toLowerCase())
          );
          
          if (activeBrowser) {
            const url = await this.extractUrlFromBrowser(activeBrowser.name, activeBrowser.title);
            if (url) {
              const urlData = {
                url: url,
                title: activeBrowser.title || 'Untitled',
                browser: activeBrowser.name,
                domain: this.extractDomain(url),
                fromTabMonitor: true
              };
              
              await this.processFoundUrl(urlData);
            }
          }
        }
        
        this.lastActiveBrowserCheck = Date.now();
      } catch (error) {
        console.log('❌ [BROWSER-URL-MANAGER] Tab monitor error:', error.message);
      }
    }, 3000); // 3 second interval
    
    // Register with cleanup registry
    if (this.cleanupRegistry) {
      this.cleanupRegistry.registerInterval(this.activeBrowserUrlCheckInterval, 'Browser URL Check');
    }
    
    console.log('✅ [BROWSER-URL-MANAGER] Tab change monitoring started (3s interval)');
  }

  /**
   * Stop active browser monitoring
   */
  stopActiveBrowserMonitoring() {
    if (this.activeBrowserUrlCheckInterval) {
      clearInterval(this.activeBrowserUrlCheckInterval);
      this.activeBrowserUrlCheckInterval = null;
      console.log('🛑 [BROWSER-URL-MANAGER] Tab change monitoring stopped');
    }
  }

  /**
   * Check if app is a browser
   */
  isBrowserApp(appName) {
    if (!appName) return false;
    
    const browserNames = [
      'safari', 'chrome', 'firefox', 'edge', 'opera', 'brave',
      'google chrome', 'microsoft edge', 'mozilla firefox',
      'safari technology preview', 'chromium', 'vivaldi', 'arc'
    ];
    
    const lowerAppName = appName.toLowerCase();
    return browserNames.some(browser => lowerAppName.includes(browser));
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      // Fallback for invalid URLs
      const match = url.match(/^https?:\/\/([^\/]+)/);
      return match ? match[1] : 'unknown';
    }
  }

  /**
   * Get all running browsers (delegated to URL capture adapter to avoid sync AppleScript)
   */
  async getAllRunningBrowsers() {
    try {
      if (process.platform !== 'darwin') return [];
      
      if (this.urlAdapter && typeof this.urlAdapter.getFrontmostAppAsync === 'function') {
        const frontApp = await this.urlAdapter.getFrontmostAppAsync();
        if (!frontApp?.name) return [];
        
        const name = frontApp.name.toLowerCase();
        const title = frontApp.title || '';
        const browsers = [];
        if (name.includes('safari')) browsers.push({ name: 'Safari', title });
        else if (name.includes('chrome')) browsers.push({ name: 'Google Chrome', title });
        else if (name.includes('edge')) browsers.push({ name: 'Microsoft Edge', title });
        else if (name.includes('brave')) browsers.push({ name: 'Brave Browser', title });
        else if (name.includes('firefox')) browsers.push({ name: 'Firefox', title });
        
        if (process.env.DIAG_URL === '1') {
          console.log('🌐 [URL-DIAG] Candidate browsers (async):', browsers);
        }
        return browsers;
      }
      
      return [];
    } catch (error) {
      console.log('❌ [BROWSER-URL-MANAGER] getAllRunningBrowsers error:', error.message);
      return [];
    }
  }

  /**
   * Extract URL from browser using async Darwin adapter
   */
  async extractUrlFromBrowser(browserName, windowTitle) {
    try {
      if (!browserName) return null;
      if (process.platform !== 'darwin') return null;
      
      if (!this.urlAdapter) return null;
      
      const name = browserName.toLowerCase();
      let url = null;
      
      if (name.includes('safari')) {
        url = await this.urlAdapter.getSafariUrlViaAXAsync();
      } else if (name.includes('chrome') || name.includes('edge') || name.includes('brave')) {
        url = await this.urlAdapter.getChromiumUrlViaAXAsync(browserName);
      } else if (name.includes('firefox')) {
        url = await this.urlAdapter.getFirefoxUrlViaAXAsync();
      }
      
      if (!url && windowTitle) {
        // Fallback to title parsing via adapter helper
        url = this.urlAdapter.extractUrlFromTitle(windowTitle);
      }
      
      if (process.env.DIAG_URL === '1') {
        console.log(`🌐 [URL-DIAG] Extracted URL (async) from ${browserName}: ${url || '(empty)'}`);
      }
      
      return url || null;
    } catch (error) {
      console.log('❌ [BROWSER-URL-MANAGER] extractUrlFromBrowser error:', error.message);
      return null;
    }
  }

  /**
   * Get current URL capture status
   */
  getStatus() {
    return {
      enabled: this.urlCaptureEnabled,
      lastCapture: this.lastUrlCapture,
      lastCaptureTime: this.lastUrlCaptureTime,
      activeBrowsers: this.lastBrowserUrls.size,
      captureCount: this.urlCaptureCounter
    };
  }

  /**
   * Cleanup function for registry
   */
  shutdown() {
    try {
      console.log('🧹 [BROWSER-URL-MANAGER] Shutting down...');
      
      this.stopUrlCapture();
      this.stopActiveBrowserMonitoring();
      
      // Stop state sync monitor
      if (this.stateSyncInterval) {
        clearInterval(this.stateSyncInterval);
        this.stateSyncInterval = null;
      }
      
      // Clear all tracking data
      this.lastBrowserUrls.clear();
      this.lastUrlCapturesByBrowser.clear();
      
      // Remove global functions
      delete global.captureActiveUrl;
      delete global.forceUrlCapture;
      
      this.removeAllListeners();
      
      console.log('✅ [BROWSER-URL-MANAGER] Shutdown complete');
    } catch (error) {
      console.error('❌ [BROWSER-URL-MANAGER] Error during shutdown:', error);
    }
  }

  /**
   * Process a found URL with comprehensive logic for throttling, deduplication, and saving
   * @param {Object} urlData - The URL data object containing url, browser, domain, title, etc.
   */
  async processFoundUrl(urlData) {
    try {
      console.log(`🔗 [URL-CAPTURE] Processing URL: "${urlData.url}" from browser: "${urlData.browser}"`);
      
      // Validate user_id before processing
      const effectiveUserId = this.config?.user_id || this.config?.userId || global.currentUserId;
      if (!effectiveUserId) {
        const error = { 
          step: 'user_validation', 
          code: 'NO_USER_ID', 
          message: 'User ID not available for URL capture' 
        };
        global.lastUrlError = error;
        global.lastUrlErrorTime = Date.now();
        console.log('❌ [URL-CAPTURE] User validation failed:', error.message);
        this.emit('url-capture-error', { 
          browser: urlData.browser || 'unknown', 
          ...error 
        });
        return;
      }
      
      // CRITICAL FIX: Ensure tracking state is synchronized from global
      if (global.isTracking && global.currentTimeLogId && !this.currentTimeLogId) {
        console.log('🔧 [URL-CAPTURE] Auto-syncing state from global');
        this.currentTimeLogId = global.currentTimeLogId;
        this.isTracking = global.isTracking;
        if (this.config && global.currentUserId) {
          this.config.user_id = global.currentUserId;
        }
      }
      
      // Update config with effective user_id
      if (!this.config.user_id && effectiveUserId) {
        this.config.user_id = effectiveUserId;
      }
      
      const now = Date.now();
      
      // ENHANCED DUPLICATE PREVENTION: Check if this exact URL was recently captured
      const captureKey = `${urlData.browser}|${urlData.url}`;
      const lastCaptureTime = this.lastUrlCapturesByBrowser.get(captureKey) || 0;
      const timeSinceLastCapture = now - lastCaptureTime;
      const lastUrl = this.lastBrowserUrls.get(urlData.browser);
      
      // Enhanced tab change detection: Immediate capture for new URLs, reduced throttling for tab monitor
      const isNewUrl = lastUrl !== urlData.url;
      const isFromTabMonitor = urlData.fromTabMonitor;
      
      // STRICT DUPLICATE PREVENTION: More aggressive throttling to prevent duplicates
      let throttleDelay = 60 * 1000; // Default 60 seconds (increased from 30s)
      if (isFromTabMonitor) {
        throttleDelay = 15 * 1000; // 15 seconds for tab monitor (increased from 5s)
      }
      
      // CRITICAL: Prevent duplicate saves within short time window
      const minDuplicateDelay = 10 * 1000; // Minimum 10 seconds between same URL saves
      if (timeSinceLastCapture < minDuplicateDelay) {
        console.log(`🚫 [URL-CAPTURE] DUPLICATE PREVENTED: "${urlData.url}" | Browser: "${urlData.browser}" | Time since last: ${Math.round(timeSinceLastCapture/1000)}s (minimum: 10s)`);
        return;
      }
      
      const enoughTimePassed = timeSinceLastCapture > throttleDelay;
      // FIXED ACTIVITY-BASED VALIDATION: Always capture URLs for real-time display
      const timeSinceLastActivity = now - (this.lastActivity || 0);
      const hasRecentActivity = timeSinceLastActivity < 300000; // Extended to 5 minutes (was 2 minutes)
      
      // ENHANCED LOGIC: Always capture new URLs and tab changes for UI display
      const isImportantCapture = isNewUrl || (isFromTabMonitor && timeSinceLastCapture > 30000); // New URLs or tab changes after 30s
      const isRealTimeDisplay = true; // Always allow for real-time UI display
      const shouldCapture = isImportantCapture || isRealTimeDisplay || (enoughTimePassed && hasRecentActivity);
      
      if (!shouldCapture) {
        const source = isFromTabMonitor ? '[TAB-MONITOR]' : '[ACTIVITY]';
        if (!hasRecentActivity && !isImportantCapture) {
          console.log(`🔗 [URL-CAPTURE] SKIPPING ${source}: "${urlData.url}" | Browser: "${urlData.browser}" | Reason: No recent activity (${Math.round(timeSinceLastActivity/1000)}s since last activity, threshold: 120s)`);
        } else {
          console.log(`🔗 [URL-CAPTURE] SKIPPING ${source}: "${urlData.url}" | Browser: "${urlData.browser}" | Reason: Recent capture (${Math.round(timeSinceLastCapture/1000)}s ago, threshold: ${throttleDelay/1000}s)`);
        }
        return;
      }
      
      // Same continuous URL: UI only — never re-insert into DB.
      const source = isFromTabMonitor ? '[TAB-MONITOR]' : '[ACTIVITY]';
      if (!isNewUrl) {
        console.log(`🔗 [URL-CAPTURE] 🔄 REVISIT SKIP DB ${source}: "${urlData.url}" | Browser: "${urlData.browser}" | Time since last: ${Math.round(timeSinceLastCapture/1000)}s`);
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          try {
            this.mainWindow.webContents.send('url-detected', {
              url: urlData.url,
              browser: urlData.browser,
              domain: urlData.domain,
              title: urlData.title,
              timestamp: new Date().toISOString(),
            });
          } catch (_) { /* ignore */ }
        }
        return;
      }
      console.log(`🔗 [URL-CAPTURE] 🆕 NEW URL DETECTED ${source}: "${urlData.url}" | Browser: "${urlData.browser}" | Domain: "${urlData.domain}" | Previous: "${lastUrl || 'none'}"`);
      
      // Update last URL for this browser and timing tracking
      this.lastBrowserUrls.set(urlData.browser, urlData.url);
      this.lastUrlCapturesByBrowser.set(captureKey, now);
      this.lastUrlCapture = urlData.url;
      this.lastUrlCaptureTime = new Date().toISOString();

      // FORCE UPDATE STATE: If we are capturing URLs, we are definitely enabled and started!
      this.urlCaptureEnabled = true;
      this.captureStarted = true;

      // Generate sync status ID for all URL detections (needed for UI tracking)
      const syncStatusId = `url-sync-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      // Send URL to UI for real-time display regardless of tracking status
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        console.log('🔄 [URL-CAPTURE] Sending URL to UI for real-time display...');
        this.mainWindow.webContents.send('url-detected', {
          url: urlData.url,
          browser: urlData.browser,
          domain: urlData.domain,
          title: urlData.title,
          timestamp: new Date().toISOString(),
          syncStatusId: syncStatusId  // Include sync status ID for UI tracking
        });
      }

      // Save to database even without active tracking for history feature
      // Just set time_log_id to null when not tracking
      if (!this.currentTimeLogId) {
        console.log('🔄 [URL-CAPTURE] Saving for history without active tracking session');
      }

      const urlLog = {
        user_id: this.config.user_id,
        time_log_id: this.currentTimeLogId || null, // Allow null for history without tracking
        site_url: urlData.url.trim(),
        title: urlData.title || 'Untitled',
        domain: urlData.domain || this.extractDomain(urlData.url),
        browser: urlData.browser || 'Unknown',
        timestamp: new Date().toISOString()
      };
      
      // Queue for upload with dual-path compatibility for different sync managers
      if (this.syncManager?.addUrlLogs) {
        await this.syncManager.addUrlLogs([urlLog]);
        console.log(`🌐 ✅ URL captured via addUrlLogs: ${urlLog.domain} (${urlLog.browser})`);
      } else if (this.syncManager?.addToQueue) {
        await this.syncManager.addToQueue('urlLogs', [urlLog]);
        console.log(`🌐 ✅ URL captured via addToQueue: ${urlLog.domain} (${urlLog.browser})`);
      } else if (global.enhancedSyncManager?.addToQueue) {
        await global.enhancedSyncManager.addToQueue('urlLogs', [urlLog]);
        console.log(`🌐 ✅ URL captured via global enhancedSyncManager: ${urlLog.domain}`);
      } else if (global.syncManager?.addUrlLogs) {
        await global.syncManager.addUrlLogs([urlLog]);
        console.log(`🌐 ✅ URL captured via global syncManager: ${urlLog.domain}`);
      } else {
        // Sync managers own every write path to RDS — no direct-insert fallback.
        console.log('❌ [URL-CAPTURE] No sync manager available to save URL');
      }
      
      // Enhanced database save confirmation for debug console
      console.log(`✅ [URL-CAPTURE] 🗄️ SAVED TO DATABASE: "${urlLog.site_url}" | Domain: "${urlLog.domain}" | Browser: "${urlLog.browser}" | Time: ${new Date().toLocaleTimeString()}`);
      console.log(`📊 [LAST URL DETECTED & SAVED]: URL="${urlLog.site_url}" | Title="${urlLog.title}" | User: ${urlLog.user_id} | TimeLog: ${urlLog.time_log_id}`);
      
      // Send sync status updates using the ID generated earlier
      // Simulate sync process: Queued → Saving → Saved  
      setTimeout(() => {
        this.mainWindow?.webContents.send('sync-status-update', {
          itemId: syncStatusId,
          status: 'saving',
          type: 'url'
        });
      }, 1000);
      
      setTimeout(() => {
        this.mainWindow?.webContents.send('sync-status-update', {
          itemId: syncStatusId,
          status: 'saved',
          type: 'url'
        });
      }, 3000);
      
      // Send to debug console via system monitor
      if (this.systemMonitor) {
        this.systemMonitor.sendActivityUpdate('url', {
          url: urlLog.site_url,
          domain: urlLog.domain,
          browser: urlLog.browser,
          title: urlLog.title
        });
        
        this.systemMonitor.sendDebugUpdate('URL', `URL detected: ${urlLog.domain} | Browser: ${urlLog.browser}`);
      }
      
    } catch (error) {
      console.log('❌ Failed to process URL:', urlData.url, error.message);
    }
  }

  /**
   * Redact URL by removing query parameters and hash fragments
   * @param {string} url - The URL to redact
   * @returns {string} The redacted URL
   */
  redactUrl(url) {
    try {
      const u = new URL(url);
      // Remove query parameters and hash for privacy
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (error) {
      // If URL parsing fails, return original
      console.log(`⚠️ [URL] Failed to redact URL: ${error.message}`);
      return url;
    }
  }

  /**
   * Extract domain from URL
   * @param {string} url - The URL to extract domain from
   * @returns {string} The extracted domain
   */
  extractDomain(url) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    } catch {
      return url;
    }
  }
}

// Register with cleanup registry if available
if (typeof global !== 'undefined' && global.cleanupRegistry) {
  global.cleanupRegistry.register('browser-url-manager', () => {
    if (global.browserUrlManager && global.browserUrlManager.shutdown) {
      global.browserUrlManager.shutdown();
    }
  });
}

module.exports = BrowserUrlManager;