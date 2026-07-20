const path = require('path');
const crypto = require('crypto');
const debugLogger = require('./utils/debug-logger');
const { execSync } = require('child_process');
const cleanupRegistry = require('./core/cleanup-registry');
const { logger } = require('./utils/logger');
const { uploadScreenshotBuffer } = require('./utils/screenshot-storage');

/**
 * Screenshot-triggered Input Analyzer
 * Collects input events between screenshots instead of real-time monitoring
 */
class ScreenshotInputAnalyzer {
  constructor() {
    this.inputBuffer = [];
    this.lastScreenshotTime = 0;
    this.activityStats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      lastActivityTime: 0
    };
  }
  
  // Record input event (called by input managers)
  recordInputEvent(type, data) {
    this.inputBuffer.push({ 
      type, 
      data, 
      timestamp: Date.now() 
    });
    
    // Update activity stats
    switch(type) {
      case 'click':
        this.activityStats.mouseClicks++;
        break;
      case 'key':
        this.activityStats.keystrokes++;
        break;
      case 'move':
        this.activityStats.mouseMovements++;
        break;
    }
    
    this.activityStats.lastActivityTime = Date.now();
  }
  
  // Analyze input when screenshot is taken
  analyzeInputForScreenshot() {
    const now = Date.now();
    const timeSinceLastScreenshot = now - this.lastScreenshotTime;
    
    const analysis = {
      mouseClicks: this.activityStats.mouseClicks,
      keystrokes: this.activityStats.keystrokes,
      mouseMovements: this.activityStats.mouseMovements,
      activityPercentage: this.calculateActivityPercentage(timeSinceLastScreenshot),
      isActive: this.inputBuffer.length > 0,
      timeSinceLastScreenshot: Math.round(timeSinceLastScreenshot / 1000),
      totalEvents: this.inputBuffer.length
    };
    
    // Clear buffer after analysis
    this.inputBuffer = [];
    
    // Reset activity stats
    this.activityStats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      lastActivityTime: this.activityStats.lastActivityTime
    };
    
    this.lastScreenshotTime = now;
    
    console.log('📊 [INPUT-ANALYSIS] Screenshot input analysis:', analysis);
    
    return analysis;
  }
  
  // Calculate activity percentage based on time since last screenshot
  calculateActivityPercentage(timeSinceLastScreenshot) {
    if (timeSinceLastScreenshot === 0) return 0;
    
    const totalEvents = this.inputBuffer.length;
    const timeInMinutes = timeSinceLastScreenshot / (1000 * 60);
    
    // Activity score: clicks (15), keys (10), moves (2)
    const activityScore = (this.activityStats.mouseClicks * 15) + 
                         (this.activityStats.keystrokes * 10) + 
                         (this.activityStats.mouseMovements * 2);
    
    // Normalize to percentage (0-100)
    const normalizedScore = Math.min(100, Math.round((activityScore / 100) * 100));
    
    return normalizedScore;
  }
  
  // Get current activity stats without clearing
  getCurrentActivityStats() {
    return { ...this.activityStats };
  }
  
  // Clear all buffers (for cleanup)
  clearBuffers() {
    this.inputBuffer = [];
    this.activityStats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      lastActivityTime: 0
    };
  }
}

class ScreenshotManager {
  constructor(configManager, electronModules, syncManager) {
    this.configManager = configManager;
    this.electronModules = electronModules;
    this.syncManager = syncManager;
    
    // Screenshot state
    this.dormantMode = false; // CRITICAL FIX: Initialize dormantMode - manager starts active
    this.screenshotsPaused = false;
    this.consecutiveScreenshotFailures = 0;
    this.lastSuccessfulScreenshotTime = 0;
    this.screenshotFailureStart = null;
    this.screenshotBuffer = null;
    
    // Input analyzer integration
    this.inputAnalyzer = new ScreenshotInputAnalyzer();
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'screenshotManager',
      cleanup: async () => this.cleanup()
    });
    
    console.log('✅ ScreenshotManager initialized with input analyzer');
  }

  /**
   * Start screenshot scheduling when tracking begins
   */
  startTracking() {
    // CRITICAL FIX: Only return if already active (NOT dormant AND interval exists)
    // If dormant (stopped), we SHOULD continue to restart tracking
    if (!this.dormantMode && this.screenshotInterval) {
      console.log('⏭️ [SCREENSHOT-MANAGER] Already tracking - skipping startTracking()');
      return; // Already active
    }
    
    console.log('🚀 [SCREENSHOT-MANAGER-DEBUG] startTracking() called - dormantMode:', this.dormantMode, 'screenshotInterval:', !!this.screenshotInterval);
    
    console.log('🚀 [SCREENSHOT-MANAGER] Starting screenshot scheduling...');
    this.dormantMode = false;
    // Screenshot scheduling will be handled by the consolidated wrapper functions
    console.log('✅ [SCREENSHOT-MANAGER] Screenshot scheduling ready');
  }

  /**
   * Stop screenshot scheduling when tracking ends
   */
  stopTracking() {
    if (this.dormantMode && !this.screenshotInterval) return; // Already stopped
    
    console.log('🛑 [SCREENSHOT-MANAGER] Stopping screenshot scheduling...');
    this.dormantMode = true;
    
    // Clear any active intervals
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }
    if (this.screenshotTimeout) {
      clearTimeout(this.screenshotTimeout);
      this.screenshotTimeout = null;
    }
    
    console.log('✅ [SCREENSHOT-MANAGER] Screenshot scheduling stopped');
  }

  async captureScreenshot() {
    debugLogger.ss2('Screenshot capture started', {
      platform: process.platform,
      paused: this.screenshotsPaused
    });

    // CRITICAL FIX: Global debounce to prevent burst screenshots
    const MIN_CAPTURE_INTERVAL_MS = 30000; // 30 seconds minimum between screenshots
    const now = Date.now();
    if (global._lastScreenshotAttempt && (now - global._lastScreenshotAttempt) < MIN_CAPTURE_INTERVAL_MS) {
      console.log(`🛑 [SCREENSHOT-MANAGER] Debounced - only ${Math.round((now - global._lastScreenshotAttempt)/1000)}s since last attempt`);
      return false;
    }
    global._lastScreenshotAttempt = now;

    // CRITICAL FIX: Early exit if tracking stopped
    if (this.dormantMode || !global.isTracking) {
      console.log('⏭️ [SCREENSHOT] Blocked - tracking is not active');
      return false;
    }

    if (this.screenshotsPaused) {
      console.log('⏭️ Skipping screenshot - screenshots are paused (screen locked)');
      return false;
    }

    try {
      const captureModule = process.platform === 'darwin'
        ? require('../platform/macos/screenshot-capture')
        : require('../platform/windows/screenshot-capture');
      const result = await captureModule.captureScreenshot();

      if (!result || !result.success || !result.buffer || result.buffer.length === 0) {
        throw new Error(result && result.error ? result.error : 'No screenshot buffer returned');
      }

      const img = result.buffer;
      const captureMethod = result.method || 'unknown';

      debugLogger.ss3('Screenshot capture success', {
        bufferSize: img.length,
        bufferSizeMB: Math.round(img.length / 1024 / 1024 * 100) / 100,
        format: 'png',
        method: captureMethod
      });

      await this.processScreenshot(img);

      const inputAnalysis = this.inputAnalyzer.analyzeInputForScreenshot();
      console.log('📊 [SCREENSHOT] Input analysis completed:', {
        activityPercentage: inputAnalysis.activityPercentage,
        isActive: inputAnalysis.isActive,
        events: inputAnalysis.totalEvents,
        timeSinceLastScreenshot: inputAnalysis.timeSinceLastScreenshot
      });

      this.consecutiveScreenshotFailures = 0;
      this.lastSuccessfulScreenshotTime = Date.now();
      this.screenshotFailureStart = null;

      return {
        buffer: img,
        screenshotData: {
          timestamp: Date.now(),
          size: img.length,
          format: 'png',
          method: captureMethod
        }
      };
    } catch (error) {
      debugLogger.ss3('Screenshot capture error', {
        error: error.message,
        stack: error.stack?.split('\n')[0] || 'No stack',
        consecutiveFailures: this.consecutiveScreenshotFailures + 1
      });

      console.error('❌ Screenshot capture failed:', error);
      this.handleScreenshotFailure(error);
      return false;
    }
  }

  /**
   * Capture a screenshot without processing or saving (for health checks)
   */
  async captureRawScreenshot() {
    const { desktopCapturer, systemPreferences } = this.electronModules;
    try {
      const hasPermission = await this.checkPlatformPermissions();
      let img = null;

      try {
        if (hasPermission && desktopCapturer) {
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1920, height: 1080 }
          });
          if (sources && sources.length > 0) {
            img = sources[0].thumbnail.toPNG();
            this.screenshotBuffer = img;
          } else {
            throw new Error('No screen sources available');
          }
        } else {
          throw new Error('desktopCapturer unavailable or permission denied');
        }
      } catch (electronError) {
        const platformOptions = this.getPlatformScreenshotOptions();
        img = await this.screenshot({
          format: 'png',
          quality: this.getScreenshotQuality(),
          ...platformOptions
        });
        this.screenshotBuffer = img;
      }

      if (!img || img.length === 0) {
        throw new Error('Invalid screenshot buffer');
      }

      return { buffer: img };
    } catch (error) {
      console.error('❌ Raw screenshot capture failed:', error);
      return false;
    } finally {
      this.screenshotBuffer = null;
    }
  }

  async processScreenshot(buffer) {
    const config = this.configManager.getConfig();
    
    // PRIVACY GUARD: Apply redaction/blur if enabled, regardless of capture source
    if (config.screenshotRedaction?.enabled && typeof this.applyRedaction === 'function') {
      console.log('🔒 [SCREENSHOT] Applying redaction/blur per config');
      try {
        buffer = await this.applyRedaction(buffer, config.screenshotRedaction);
      } catch (redactError) {
        console.error('❌ [SCREENSHOT] Redaction failed:', redactError.message);
        // Continue with unredacted image rather than failing entirely
      }
    }
    
    // Generate correlation ID for tracking
    const corrId = `${config.currentTimeLogId || global.currentTimeLogId || 'no-session'}-${Date.now()}`;
    console.log(`📸 [SCREENSHOT_CAPTURED] corrId:${corrId} bytes:${buffer.length} fileSize:${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
    
    // 🔧 ACTIVITY SYNC: Now handled by fix-activity-sync.js module
    // Sync runs automatically every 5 seconds and on activity recording
    // No need to call here - preserves per-screenshot accuracy
    
    // CRITICAL FIX: Get activity data from main process before screenshot is saved
    const currentActivity = this.getCurrentActivityData();
    
    // Log current activity and tracking state for debugging
    console.log(`📸 [ACTIVITY-CAPTURE] Current activity before screenshot:`, currentActivity);
    console.log(`📸 [TRACKING-STATE] global.isTracking: ${global.isTracking}, enhancedActivityManager.isTracking: ${global.enhancedActivityManager?.isTracking}`);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot-${timestamp}.png`;
    
    // 🧠 Optimization: Move heavy base64 conversion to setImmediate to avoid main thread blocking
    const base64Data = await new Promise(resolve => {
      setImmediate(() => {
        try {
          // 🧠 Before: Blocking 200-800ms on main thread | After: Non-blocking via setImmediate
          const base64 = buffer.toString('base64');
          resolve(base64);
        } catch (error) {
          console.error('❌ Failed to convert buffer to base64:', error);
          resolve('');
        }
      });
    });
    
    // FIXED: Capture app context when taking screenshot
    let appContext = { app_name: null, window_title: null, url: null };
    try {
      // Detect active application
      const activeApp = await global.enhancedAppDetector?.detectActiveApplication();
      if (activeApp && activeApp.name) {
        appContext.app_name = activeApp.name;
        appContext.window_title = activeApp.title || null;
        
        // If it's a browser, try to get URL
        const isBrowser = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Brave'].some(browser => 
          activeApp.name.toLowerCase().includes(browser.toLowerCase())
        );
        
        if (isBrowser && global.browserUrlManager?.detectBrowserUrl) {
          try {
            const urlData = await global.browserUrlManager.detectBrowserUrl();
            if (urlData && urlData.url) {
              appContext.url = urlData.url;
              appContext.window_title = urlData.title || appContext.window_title;
            }
          } catch (urlError) {
            console.log(`🔍 [SCREENSHOT] URL detection failed for ${activeApp.name}:`, urlError.message);
          }
        }
        
        console.log(`🔍 [SCREENSHOT] App context captured: ${appContext.app_name} | URL: ${appContext.url || 'none'}`);
      }
    } catch (error) {
      console.log(`⚠️ [SCREENSHOT] App context capture failed:`, error.message);
    }

    // Create screenshot data object with activity data
    const capturedAtUTC = new Date().toISOString();
    
    // 🔧 FOCUS FIX: Calculate focus before creating screenshot data with safety check
    const focusPercent = (typeof this.getFocusPercent === 'function') ? this.getFocusPercent() : 0;
    console.log(`🎯 [SCREENSHOT-SAVE] Focus calculation result: ${focusPercent}%`);
    
    const screenshotData = {
      user_id: config.user_id,
      filename: filename,
      file_data: base64Data,
      captured_at: capturedAtUTC,
      timestamp: capturedAtUTC, // Ensure compatibility with database
      blur_applied: this.isBlurEnabled(),
      // CRITICAL FIX: Include activity data with screenshot
      mouse_clicks: currentActivity.clicks,
      keystrokes: currentActivity.keys,
      mouse_movements: currentActivity.moves,
      activity_percent: this.calculateActivityPercent(currentActivity),
      // Include focus percent for UI parity
      focus_percent: focusPercent,
      time_log_id: config.currentTimeLogId || global.currentTimeLogId || null,
      project_id: config.currentProjectId || global.currentProjectId || null,
      // FIXED: Include app context in screenshot data
      app_name: appContext.app_name,
      window_title: appContext.window_title,
      url: appContext.url,
      agent_version: global.agentVersion || null, // Add agent version tracking (v1.0.124+)
      device_info: {
        platform: process.platform,
        screen_resolution: this.getScreenResolution()
      },
      correlation_id: corrId // Add correlation ID for tracking
    };
    
    // [SS4] Pre-save payload
    debugLogger.ss4('Screenshot pre-save payload', {
      sessionId: screenshotData.time_log_id,
      projectId: config.currentProjectId || global.currentProjectId,
      userId: screenshotData.user_id,
      timestamp: capturedAtUTC,
      activityPercent: screenshotData.activity_percent,
      clicks: currentActivity.clicks,
      keys: currentActivity.keys,
      moves: currentActivity.moves,
      filename: filename,
      correlationId: corrId
    });
    
    console.log(`📸 [DB_INSERT_REQUEST] corrId:${corrId} userId:${config.user_id} timeLogId:${screenshotData.time_log_id} captured_atUTC:${capturedAtUTC} captureId:${global.currentCaptureId} source:${global.currentCaptureSource}`);
    console.log(`📸 [SCREENSHOT-SAVE] Activity data: C:${currentActivity.clicks} K:${currentActivity.keys} M:${currentActivity.moves} | Activity%: ${screenshotData.activity_percent}% | Focus%: ${screenshotData.focus_percent}%`);
    
    // Save to database directly
    console.log(`🔍 [SYNC-DEBUG] local syncManager exists: ${!!this.syncManager}`);
    console.log(`🔍 [SYNC-DEBUG] global.enhancedSyncManager exists: ${!!global.enhancedSyncManager}`);
    console.log(`🔍 [SYNC-DEBUG] Attempting direct database save...`);
    
    try {
      const result = await this.saveScreenshotToDatabase(screenshotData);
      if (result.success) {
        // [SS5] DB write result - success
        debugLogger.ss5('Screenshot DB write success', {
          rowId: result.id,
          correlationId: corrId,
          filename: filename
        });
        
        console.log(`📸 ✅ Screenshot saved directly to database: ${filename} (ID: ${result.id})`);
        
        // CRITICAL FIX: Reset activity counters after successful save
        this.resetActivityCounters();
        
        // Notify renderer about new screenshot
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
          global.mainWindow.webContents.send('screenshot-saved', {
            correlation_id: corrId,
            row_id: result.id,
            captured_at: screenshotData.captured_at
          });
        }
        
        return screenshotData;
      } else {
        // [SS5] DB write result - error
        debugLogger.ss5('Screenshot DB write error', {
          error: result.error,
          correlationId: corrId,
          filename: filename
        });
        
        console.error(`❌ [SYNC-DEBUG] Direct database save failed:`, result.error);
      }
    } catch (error) {
      // [SS5] DB write result - error (exception)
      debugLogger.ss5('Screenshot DB write exception', {
        error: error.message,
        correlationId: corrId,
        filename: filename
      });
      
      console.error(`❌ [SYNC-DEBUG] Direct database save error:`, error.message);
    }
    
    // Fallback to sync managers if direct save fails
    if (global.enhancedSyncManager && global.enhancedSyncManager.addToQueue) {
      console.log(`🔍 [SYNC-DEBUG] Using enhanced sync manager fallback...`);
      try {
        await global.enhancedSyncManager.addToQueue('screenshots', screenshotData);
        console.log(`📸 Screenshot queued for enhanced sync: ${filename}`);
        
        // Still reset activity counters even for queued screenshots
        this.resetActivityCounters();
        
        return screenshotData;
      } catch (error) {
        console.error(`❌ [SYNC-DEBUG] Enhanced sync manager failed:`, error.message);
      }
    }
    
    if (this.syncManager) {
      console.log(`🔍 [SYNC-DEBUG] Using local sync manager fallback...`);
      try {
        await this.syncManager.addToQueue('screenshots', screenshotData);
        console.log(`📸 Screenshot queued for sync: ${filename}`);
        
        // Still reset activity counters even for queued screenshots  
        this.resetActivityCounters();
        
      } catch (error) {
        console.error(`❌ [SYNC-DEBUG] Failed to queue screenshot:`, error.message);
      }
    } else {
      console.log(`⚠️ [SYNC-DEBUG] All save methods failed - screenshot won't be saved!`);
      console.log(`⚠️ [SYNC-DEBUG] Activity counters will NOT be reset due to save failure`);
    }
    
    return screenshotData;
  }
  
  /**
   * Save screenshot directly to database
   */
  async saveScreenshotToDatabase(screenshotData) {
    try {
      console.log(`📸 [DB-SAVE] Starting direct database save... captureId:${global.currentCaptureId} source:${global.currentCaptureSource}`);

      // CRITICAL FIX: Get activity data from global state
      const activityData = this.getCurrentActivityData();
      console.log(`📊 [DB-SAVE-ACTIVITY] Attaching activity data: C:${activityData.clicks} K:${activityData.keys} M:${activityData.moves}`);

      const uploadResult = await uploadScreenshotBuffer({
        buffer: Buffer.from(screenshotData.file_data, 'base64'),
        userId: screenshotData.user_id,
        capturedAt: screenshotData.captured_at,
        timeLogId: screenshotData.time_log_id,
        activityPercent: screenshotData.activity_percent,
        focusPercent: screenshotData.focus_percent || 0,
        // CRITICAL: Pass activity data to database
        clicks: activityData.clicks || 0,
        keys: activityData.keys || 0,
        moves: activityData.moves || 0,
        appName: screenshotData.app_name,
        windowTitle: screenshotData.window_title,
        agentVersion: global.agentVersion || null // Add agent version tracking (v1.0.124+)
      });

      if (uploadResult?.error) {
        console.error(`❌ [DB-SAVE] Direct save failed:`, uploadResult.error);
        return { success: false, error: uploadResult.error };
      }

      console.log(`✅ [DB-SAVE] Screenshot saved successfully with ID: ${uploadResult.id} captureId:${global.currentCaptureId} source:${global.currentCaptureSource}`);
      console.log(`📊 [DB-SAVE-ACTIVITY] Saved with activity: C:${activityData.clicks} K:${activityData.keys} M:${activityData.moves}`);
      
      // CRITICAL: Reset activity counters after successful save
      this.resetActivityCounters();
      
      return { success: true, id: uploadResult.id };
      
    } catch (error) {
      console.error(`❌ [DB-SAVE] Unexpected error:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current activity data from main process
   */
  getCurrentActivityData() {
    // Check idle state but ALWAYS read accumulated activity first
    const idleSeconds = global.unifiedInputManager?.getIdleTime?.() || 0;
    const idleStatus = global.enhancedIdleMonitor?.getIdleStatus?.();
    const IDLE_THRESHOLD = global.enhancedIdleMonitor?.IDLE_THRESHOLD || 60;
    const isIdle = (idleStatus?.isIdle) || (idleSeconds > IDLE_THRESHOLD);
    
    // FIXED: Always read accumulated activity - don't skip based on idle state
    let result = { clicks: 0, keys: 0, moves: 0 };
    
    if (typeof global !== 'undefined') {
      // Try EnhancedActivityManager.betweenScreenshotsActivity first (preferred source)
      if (global.enhancedActivityManager?.betweenScreenshotsActivity) {
        const activity = global.enhancedActivityManager.betweenScreenshotsActivity;
        result = {
          clicks: activity.clicks || 0,
          keys: activity.keys || 0,
          moves: activity.moves || 0
        };
        console.log(`📸 [ACTIVITY-READ] Reading from enhancedActivityManager: C:${result.clicks} K:${result.keys} M:${result.moves}`);
      } else if (global.betweenScreenshotsActivity) {
      // Fallback to global.betweenScreenshotsActivity
        const activity = global.betweenScreenshotsActivity;
        result = {
          clicks: activity.clicks || 0,
          keys: activity.keys || 0,
          moves: activity.moves || 0
        };
        console.log(`📸 [ACTIVITY-READ] Reading from global.betweenScreenshotsActivity: C:${result.clicks} K:${result.keys} M:${result.moves}`);
      } else if (global.displayActivityStats) {
        // Last resort: displayActivityStats
        result = {
          clicks: global.displayActivityStats.clicks || 0,
          keys: global.displayActivityStats.keys || 0,
          moves: global.displayActivityStats.moves || 0
        };
        console.warn(`⚠️ [ACTIVITY-READ] Using displayActivityStats fallback: C:${result.clicks} K:${result.keys} M:${result.moves}`);
      }
    }
    
    const hasActivity = (result.clicks + result.keys + result.moves) > 0;
    
    if (isIdle && !hasActivity) {
      return { clicks: 0, keys: 0, moves: 0 };
    }

    // Delta safety net: detect cumulative counters that weren't reset
    const MAX_REASONABLE = 2000;
    const rawTotal = result.clicks + result.keys + result.moves;
    if (rawTotal > MAX_REASONABLE && global.displayActivityStats) {
      if (!global._lastScreenshotCumulativeSnapshot) {
        global._lastScreenshotCumulativeSnapshot = { clicks: 0, keys: 0, moves: 0 };
      }
      const snap = global._lastScreenshotCumulativeSnapshot;
      const ds = global.displayActivityStats;
      result = {
        clicks: Math.max(0, (ds.clicks || 0) - (snap.clicks || 0)),
        keys: Math.max(0, (ds.keys || 0) - (snap.keys || 0)),
        moves: Math.max(0, (ds.moves || 0) - (snap.moves || 0)),
      };
      console.log(`⚠️ [ACTIVITY-READ] Cumulative detected (${rawTotal}), using delta: C:${result.clicks} K:${result.keys} M:${result.moves}`);
    }

    if (global.displayActivityStats) {
      global._lastScreenshotCumulativeSnapshot = {
        clicks: global.displayActivityStats.clicks || 0,
        keys: global.displayActivityStats.keys || 0,
        moves: global.displayActivityStats.moves || 0,
      };
    }
    
    return result;
  }
  
  /**
   * Calculate activity percentage based on activity counts
   */
  calculateActivityPercent(activity) {
    // 🔧 ENHANCED FIX: Use multiple data sources for better accuracy
    const clicks = activity.clicks || global.betweenScreenshotsActivity?.clicks || global.displayActivityStats?.clicks || 0;
    const keys = activity.keys || global.betweenScreenshotsActivity?.keys || global.displayActivityStats?.keys || 0;
    const moves = activity.moves || global.betweenScreenshotsActivity?.moves || global.displayActivityStats?.moves || 0;
    
    const totalActivity = clicks + keys + moves;
    
    console.log('🔍 [ACTIVITY-DEBUG] Activity calculation:', { clicks, keys, moves, totalActivity });
    
    // Basic calculation: more activity = higher percentage
    // This is a simplified version - you may want to adjust the formula
    if (totalActivity === 0) return 0;
    if (totalActivity < 10) return Math.min(20, totalActivity * 2);
    if (totalActivity < 50) return Math.min(50, 20 + (totalActivity - 10));
    if (totalActivity < 100) return Math.min(80, 50 + ((totalActivity - 50) * 0.6));
    return Math.min(100, 80 + ((totalActivity - 100) * 0.2));
  }

  /**
   * Calculate focus percentage based on recent activity
   * Focus is determined by sustained keyboard/mouse activity
   */
  getFocusPercent() {
    // 🔧 CRITICAL FIX: Add function entry logging to debug execution
    console.log('🚀 [FOCUS-DEBUG] getFocusPercent() function called!');
    console.log('🚀 [FOCUS-DEBUG] Function context:', {
      hasGlobal: typeof global !== 'undefined',
      hasDisplayActivityStats: !!global.displayActivityStats,
      hasBetweenScreenshotsActivity: !!global.betweenScreenshotsActivity,
      hasPeriodActivityStats: !!global.periodActivityStats
    });
    
    try {
      // 🔧 CRITICAL FIX: Get current activity data using the same method as screenshot capture
      const currentActivity = this.getCurrentActivityData();
      
      // Get activity from multiple sources for better accuracy
      const betweenScreenshotsActivity = global.betweenScreenshotsActivity || { clicks: 0, keys: 0, moves: 0 };
      const periodActivityStats = global.periodActivityStats || { clicks: 0, keystrokes: 0, moves: 0 };
      const displayActivityStats = global.displayActivityStats || { clicks: 0, keys: 0, moves: 0 };
      
      // 🔧 CRITICAL FIX: Use currentActivity first (most reliable), then fallbacks
      const recentClicks = currentActivity.clicks || displayActivityStats.clicks || betweenScreenshotsActivity.clicks || periodActivityStats.clicks || 0;
      const recentKeys = currentActivity.keys || displayActivityStats.keys || betweenScreenshotsActivity.keys || periodActivityStats.keystrokes || 0;
      const recentMoves = currentActivity.moves || displayActivityStats.moves || betweenScreenshotsActivity.moves || periodActivityStats.moves || 0;
      
      // 🔧 DEBUG: Log what activity data we're getting
      console.log('🔍 [FOCUS-DEBUG] Activity data for focus calculation:', {
        betweenScreenshots: betweenScreenshotsActivity,
        periodStats: periodActivityStats,
        displayStats: displayActivityStats,
        recentClicks, recentKeys, recentMoves
      });
      
      // Focus calculation: keyboard activity weighted higher than mouse
      const keyboardWeight = 2;
      const clickWeight = 1.5;
      const moveWeight = 0.1;
      
      const weightedActivity = (recentKeys * keyboardWeight) + (recentClicks * clickWeight) + (recentMoves * moveWeight);
      
      console.log('🔍 [FOCUS-DEBUG] Weighted activity calculation:', {
        recentClicks, recentKeys, recentMoves,
        weightedActivity,
        keyboardWeight, clickWeight, moveWeight
      });
      
      // Convert to percentage (0-100)
      let focusPercent = 0;
      if (weightedActivity === 0) {
        focusPercent = 0;
      } else if (weightedActivity < 5) {
        focusPercent = Math.min(25, weightedActivity * 5);
      } else if (weightedActivity < 20) {
        focusPercent = Math.min(60, 25 + (weightedActivity - 5) * 2.3);
      } else if (weightedActivity < 50) {
        focusPercent = Math.min(85, 60 + (weightedActivity - 20) * 0.83);
      } else {
        focusPercent = Math.min(100, 85 + (weightedActivity - 50) * 0.3);
      }
      
      console.log('🎯 [FOCUS-DEBUG] Final focus calculation result:', {
        weightedActivity,
        focusPercent,
        calculation: `${recentKeys}×${keyboardWeight} + ${recentClicks}×${clickWeight} + ${recentMoves}×${moveWeight} = ${weightedActivity} → ${focusPercent}%`
      });
      
      // 🔧 CRITICAL FIX: If focus is still 0 but we have activity, use activity percentage as backup
      if (focusPercent === 0 && (recentClicks > 0 || recentKeys > 0 || recentMoves > 0)) {
        const backupFocus = Math.min(100, Math.max(25, weightedActivity * 2));
        console.log(`🚨 [FOCUS-FIX] Using backup focus calculation: ${backupFocus}% (was 0% with activity: C:${recentClicks} K:${recentKeys} M:${recentMoves})`);
        return backupFocus;
      }
      
      return focusPercent;
    } catch (error) {
      console.log('⚠️ [SCREENSHOT-MANAGER] Error calculating focus percent:', error.message);
      console.log('⚠️ [FOCUS-DEBUG] Error stack:', error.stack);
      // 🔧 CRITICAL FIX: Use displayActivityStats as fallback (most reliable)
      return this.calculateActivityPercent(global.displayActivityStats || { clicks: 0, keys: 0, moves: 0 });
    }
  }

  /**
   * Reset activity counters after successful screenshot save
   * 🔧 CRITICAL FIX: Don't reset displayActivityStats to preserve data for focus calculation
   */
  resetActivityCounters() {
    console.log('🔄 [SCREENSHOT-MANAGER] Resetting activity counters after screenshot save');
    
    // Log BEFORE reset for debugging
    console.log(`📊 [ACTIVITY-RESET] BEFORE reset - betweenScreenshots: C:${global.betweenScreenshotsActivity?.clicks || 0} K:${global.betweenScreenshotsActivity?.keys || 0} M:${global.betweenScreenshotsActivity?.moves || 0}`);
    
    // CRITICAL FIX: Call EnhancedActivityManager's proper reset method to keep internal and global state synchronized
    // This ensures both this.betweenScreenshotsActivity and global.betweenScreenshotsActivity are reset together
    if (global.enhancedActivityManager?.resetActivityForScreenshot) {
      console.log('🔧 [STATE-SYNC] Calling EnhancedActivityManager.resetActivityForScreenshot() for proper state sync');
      global.enhancedActivityManager.resetActivityForScreenshot();
    } else {
      // Fallback: Direct reset only if manager doesn't exist
      console.log('⚠️ [STATE-SYNC] EnhancedActivityManager not available, using fallback direct reset');
      if (global.betweenScreenshotsActivity) {
        global.betweenScreenshotsActivity.clicks = 0;
        global.betweenScreenshotsActivity.keys = 0;
        global.betweenScreenshotsActivity.moves = 0;
        global.betweenScreenshotsActivity.lastUpdate = Date.now();
      }
    }
    
    console.log('✅ [SCREENSHOT-MANAGER] Activity counters reset to zero');
    console.log(`📊 [ACTIVITY-RESET] AFTER reset - displayActivityStats (preserved): C:${global.displayActivityStats?.clicks || 0} K:${global.displayActivityStats?.keys || 0} M:${global.displayActivityStats?.moves || 0}`);
    
    // Also call activity processing manager reset for comprehensive coverage
    if (global.activityProcessingManager && global.activityProcessingManager.resetActivityForScreenshot) {
      global.activityProcessingManager.resetActivityForScreenshot();
    }
  }

  /**
   * Connect input manager to record events
   * This replaces real-time input monitoring with screenshot-triggered analysis
   */
  connectInputManager(inputManager) {
    if (!inputManager || !this.inputAnalyzer) return;
    
    // Listen for input events from the input manager
    inputManager.on('mouseClick', (data) => {
      this.recordInputEvent('click', data);
    });
    
    inputManager.on('keyPress', (data) => {
      this.recordInputEvent('key', data);
    });
    
    inputManager.on('mouseMovement', (data) => {
      this.recordInputEvent('move', data);
    });
    
    console.log('🔗 [INPUT] Input manager connected to screenshot manager');
  }
  


  /**
   * Record input event from external input managers
   * This replaces real-time input monitoring with screenshot-triggered analysis
   */
  recordInputEvent(type, data) {
    if (this.inputAnalyzer) {
      this.inputAnalyzer.recordInputEvent(type, data);
    }
  }
  
  /**
   * Get current input activity stats without clearing
   */
  getCurrentInputStats() {
    return this.inputAnalyzer ? this.inputAnalyzer.getCurrentActivityStats() : null;
  }

  async checkPlatformPermissions() {
    const { systemPreferences } = this.electronModules;
    
    if (process.platform === 'darwin') {
      try {
        // Only check permissions if systemPreferences is available
        if (systemPreferences && typeof systemPreferences.getMediaAccessStatus === 'function') {
          const permission = systemPreferences.getMediaAccessStatus('screen');
          console.log('🔒 [SCREENSHOT-MANAGER] Screen recording permission:', permission);
          return permission === 'granted';
        } else {
          console.log('⚠️ [SCREENSHOT-MANAGER] systemPreferences not available, assuming permission granted for testing');
          return true; // Allow fallback to screenshot-desktop library
        }
      } catch (error) {
        console.warn('⚠️ Could not check screen recording permission:', error);
        console.log('🔄 [SCREENSHOT-MANAGER] Falling back to screenshot-desktop library test');
        return true; // Allow fallback to screenshot-desktop library
      }
    }
    
    if (process.platform === 'win32') {
      try {
        // Windows-specific permission and capability checks
        console.log('🔒 [SCREENSHOT-MANAGER] Checking Windows screenshot capabilities...');
        
        // Test if we can access screen information via PowerShell
        const { exec } = require('child_process');
        const testScript = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Win32 {
              [DllImport("user32.dll")]
              public static extern IntPtr GetDC(IntPtr hWnd);
              [DllImport("gdi32.dll")]
              public static extern int GetDeviceCaps(IntPtr hdc, int nIndex);
              [DllImport("user32.dll")]
              public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
            }
"@
          try {
            $dc = [Win32]::GetDC([IntPtr]::Zero)
            $width = [Win32]::GetDeviceCaps($dc, 8)  # HORZRES
            $height = [Win32]::GetDeviceCaps($dc, 10) # VERTRES
            [Win32]::ReleaseDC([IntPtr]::Zero, $dc)
            Write-Output "SUCCESS:$width:$height"
          } catch {
            Write-Output "ERROR:$($_.Exception.Message)"
          }
        `;
        
        const result = await new Promise((resolve) => {
          exec(`powershell -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -Command "${testScript}"`, {
            encoding: 'utf8',
            windowsHide: true,
            shell: true,
            timeout: 5000
          }, (error, stdout, stderr) => {
            if (error) {
              console.log('⚠️ [SCREENSHOT-MANAGER] Windows capability test failed:', error.message);
              resolve('ERROR:PowerShell execution failed');
            } else {
              resolve(stdout.trim());
            }
          });
        });
        
        if (result.startsWith('SUCCESS:')) {
          const [, width, height] = result.split(':');
          console.log(`✅ [SCREENSHOT-MANAGER] Windows screen access confirmed: ${width}x${height}`);
          return true;
        } else {
          console.log('⚠️ [SCREENSHOT-MANAGER] Windows screen access test failed:', result);
          console.log('🔄 [SCREENSHOT-MANAGER] Will attempt fallback methods');
          return true; // Still allow fallback attempts
        }
      } catch (error) {
        console.warn('⚠️ [SCREENSHOT-MANAGER] Windows permission check failed:', error.message);
        console.log('🔄 [SCREENSHOT-MANAGER] Falling back to screenshot-desktop library');
        return true; // Allow fallback to screenshot-desktop library
      }
    }
    
    // Assume permission granted on other platforms
    return true;
  }

  getPlatformScreenshotOptions() {
    switch (process.platform) {
      case 'darwin':
        return { 
          format: 'png',
          quality: this.getScreenshotQuality()
        };
      case 'win32':
        return { 
          format: 'png',
          quality: this.getScreenshotQuality(),
          screen: 0, // Primary screen
          // Windows-specific options for better compatibility
          timeout: 10000, // 10 second timeout
          retries: 2 // Retry up to 2 times
        };
      case 'linux':
        return { 
          format: 'png',
          quality: this.getScreenshotQuality()
        };
      default:
        return {};
    }
  }

  getScreenshotQuality() {
    const appSettings = this.getAppSettings();
    return appSettings?.screenshot_quality || 80;
  }

  isBlurEnabled() {
    const appSettings = this.getAppSettings();
    return appSettings?.blur_screenshots || false;
  }

  getScreenResolution() {
    const { screen } = this.electronModules;
    if (screen) {
      const primaryDisplay = screen.getPrimaryDisplay();
      return `${primaryDisplay.workAreaSize.width}x${primaryDisplay.workAreaSize.height}`;
    }
    return 'unknown';
  }

  getAppSettings() {
    // This should be injected or accessed through a settings manager
    // For now, return defaults
    return {
      screenshot_quality: 80,
      blur_screenshots: false,
      // Test mode default: 2 minutes
      screenshot_interval_seconds: 120
    };
  }

  handleScreenshotFailure(error) {
    this.consecutiveScreenshotFailures++;
    
    if (this.consecutiveScreenshotFailures === 1) {
      this.screenshotFailureStart = Date.now();
    }
    
    console.error(`❌ Screenshot failure #${this.consecutiveScreenshotFailures}:`, error.message);
    
    // Windows-specific error diagnostics
    if (process.platform === 'win32') {
      console.log('🔍 [SCREENSHOT-MANAGER] Windows screenshot diagnostics:');
      console.log('  - Error:', error.message);
      console.log('  - Stack:', error.stack?.substring(0, 200) + '...');
      console.log('  - DesktopCapturer available:', !!this.electronModules.desktopCapturer);
      console.log('  - SystemPreferences available:', !!this.electronModules.systemPreferences);
      console.log('  - Consecutive failures:', this.consecutiveScreenshotFailures);
      
      // Provide specific troubleshooting guidance
      if (error.message.includes('permission') || error.message.includes('access')) {
        console.log('💡 [SCREENSHOT-MANAGER] Windows troubleshooting:');
        console.log('  1. Check if Windows Defender is blocking the app');
        console.log('  2. Try running as administrator');
        console.log('  3. Check Windows privacy settings for screen capture');
        console.log('  4. Ensure no other screen recording software is interfering');
      } else if (error.message.includes('timeout') || error.message.includes('failed after')) {
        console.log('💡 [SCREENSHOT-MANAGER] Windows timeout troubleshooting:');
        console.log('  1. Check if graphics drivers are up to date');
        console.log('  2. Try reducing screenshot quality in settings');
        console.log('  3. Close other screen recording applications');
        console.log('  4. Restart the application');
      } else if (error.message.includes('Invalid screenshot buffer') || error.message.includes('Empty screenshot')) {
        console.log('💡 [SCREENSHOT-MANAGER] Windows buffer troubleshooting:');
        console.log('  1. Check if screen resolution is supported');
        console.log('  2. Try changing display scaling settings');
        console.log('  3. Close applications that might be blocking screen capture');
        console.log('  4. Restart Windows Explorer (explorer.exe)');
      }
    }
    
    if (this.consecutiveScreenshotFailures >= this.MAX_SCREENSHOT_FAILURES) {
      console.error('🚨 Maximum screenshot failures reached - stopping screenshot capture');
      console.error('🚨 Failure details:', {
        consecutiveFailures: this.consecutiveScreenshotFailures,
        failureStart: new Date(this.screenshotFailureStart).toISOString(),
        lastError: error.message,
        platform: process.platform
      });
      this.stopScreenshotCapture();
    }
  }

  scheduleRandomScreenshot() {
    // CRITICAL FIX: Don't schedule if dormant or not tracking
    if (this.dormantMode || !global.isTracking) {
      console.log('🛑 [SCREENSHOT] Not scheduling - dormant or tracking stopped');
      return;
    }
    
    if (this.screenshotInterval) {
      clearTimeout(this.screenshotInterval);
    }
    
    const appSettings = this.getAppSettings();
    const baseInterval = (appSettings.screenshot_interval_seconds || 30) * 1000;
    
    // Add randomization (±20%)
    const randomOffset = (Math.random() - 0.5) * 0.4 * baseInterval;
    const actualInterval = Math.max(baseInterval + randomOffset, 5000); // Minimum 5 seconds
    
    const nextShotTime = Date.now() + actualInterval;
    
    this.screenshotInterval = setTimeout(async () => {
      // CRITICAL FIX: Check if tracking is still active before capture
      if (this.dormantMode || !global.isTracking) {
        console.log('⏭️ [SCREENSHOT] Skipping - tracking stopped');
        return; // Don't reschedule
      }
      
      await this.captureScreenshot();
      
      // CRITICAL FIX: Only reschedule if still tracking
      if (!this.dormantMode && global.isTracking) {
        this.scheduleRandomScreenshot(); // Schedule next screenshot
      } else {
        console.log('🛑 [SCREENSHOT] Not rescheduling - tracking stopped');
      }
    }, actualInterval);
    
    // [SS1] Scheduled next shot
    debugLogger.ss1('Screenshot scheduled', {
      intervalMs: actualInterval,
      intervalSec: Math.round(actualInterval / 1000),
      nextShotAt: new Date(nextShotTime).toISOString(),
      baseInterval: baseInterval,
      randomOffset: randomOffset
    });
    
    console.log(`⏰ Next screenshot scheduled in ${Math.round(actualInterval / 1000)}s`);
  }

  startScreenshotCapture() {
    console.log('📸 Starting screenshot capture...');
    this.scheduleRandomScreenshot();
  }

  stopScreenshotCapture() {
    console.log('📸 Stopping screenshot capture...');
    
    if (this.screenshotInterval) {
      clearTimeout(this.screenshotInterval);
      this.screenshotInterval = null;
    }
    
    if (this.screenshotTimeout) {
      clearTimeout(this.screenshotTimeout);
      this.screenshotTimeout = null;
    }
    
    // Clean up buffer
    this.screenshotBuffer = null;
  }

  pauseScreenshots() {
    console.log('📸 Pausing screenshots (screen locked)');
    this.screenshotsPaused = true;
    
    if (this.screenshotInterval) {
      clearTimeout(this.screenshotInterval);
      this.screenshotInterval = null;
    }
  }

  resumeScreenshots() {
    console.log('📸 Resuming screenshots (screen unlocked)');
    this.screenshotsPaused = false;
    this.scheduleRandomScreenshot();
  }

  getStatus() {
    return {
      isActive: !!this.screenshotInterval,
      isPaused: this.screenshotsPaused,
      consecutiveFailures: this.consecutiveScreenshotFailures,
      lastSuccessTime: this.lastSuccessfulScreenshotTime,
      bufferSize: this.screenshotBuffer?.length || 0
    };
  }

  cleanup() {
    this.stopScreenshotCapture();
    this.screenshotBuffer = null;
    console.log('✅ Screenshot manager cleaned up');
  }

  /**
   * Multi-display support hook
   * Default: returns primary/main display only
   * Future: can be extended to support multiple displays based on config
   * @param {Array} sources - Array of screen sources from desktopCapturer
   * @returns {Array} Array of selected screen sources
   */
  getTargetScreens(sources) {
    // Default: primary display only (first in array)
    // Future config can select multiple displays or specific display by index
    if (!sources || sources.length === 0) {
      return [];
    }
    
    // Return main display only
    return [sources[0]];
  }
}

module.exports = ScreenshotManager; 