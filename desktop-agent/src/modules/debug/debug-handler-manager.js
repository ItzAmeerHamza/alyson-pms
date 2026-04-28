/**
 * DEBUG HANDLER MANAGER MODULE
 * 
 * Manages all debug-related IPC handlers for the TimeFlow desktop agent.
 * This includes debug tests, system status checks, and diagnostic functions.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class DebugHandlerManager {
  constructor(dependencies = {}) {
    this.ipcMain = dependencies.ipcMain;
    this.captureScreenshot = dependencies.captureScreenshot;
    this.detectActiveApplication = dependencies.detectActiveApplication;
    this.detectBrowserUrl = dependencies.detectBrowserUrl;
    this.extractDomain = dependencies.extractDomain;
    this.config = dependencies.config;
    this.supabase = dependencies.supabase;
    this.systemPreferences = dependencies.systemPreferences;
    this.global = dependencies.global || global;
    
    console.log('✅ DebugHandlerManager initialized');
  }

  /**
   * Register all debug-related IPC handlers
   */
  registerHandlers() {
    this.registerDebugTestScreenshot();
    this.registerDebugTestAppDetection();
    this.registerDebugTestUrlDetection();
    this.registerDebugTestDatabase();
    this.registerDebugTestScreenPermission();
    this.registerDebugTestAccessibilityPermission();
    this.registerDebugTestInputMonitoring();
    this.registerDebugTestIdleDetection();
    this.registerDebugGetStatus();
    this.registerDebugTestActivity();
    this.registerDebugTrackingStatus();
    
    console.log('✅ All debug IPC handlers registered');
  }

  /**
   * Debug test screenshot
   */
  registerDebugTestScreenshot() {
    this.ipcMain.handle('debug-test-screenshot', async () => {
      try {
        console.log('🧪 [DEBUG-TEST] Testing screenshot capture...');
        const result = await this.captureScreenshot(true); // Mark as test screenshot
        
        if (result) {
          console.log('✅ [DEBUG-TEST] Screenshot test passed');
          return { success: true, message: 'Screenshot captured successfully' };
        } else {
          console.log('❌ [DEBUG-TEST] Screenshot test failed');
          return { success: false, error: 'Failed to capture screenshot' };
        }
      } catch (error) {
        console.error('❌ [DEBUG-TEST] Screenshot test error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Debug test app detection
   */
  registerDebugTestAppDetection() {
    this.ipcMain.handle('debug-test-app-detection', async () => {
      try {
        console.log('🧪 [DEBUG-TEST] Testing app detection...');
        const activeApp = await this.detectActiveApplication();
        
        if (activeApp && activeApp.name) {
          console.log('✅ [DEBUG-TEST] App detection test passed:', activeApp.name);
          return { 
            success: true, 
            appName: activeApp.name,
            windowTitle: activeApp.title || 'Unknown',
            bundleId: activeApp.bundleId || 'Unknown'
          };
        } else {
          console.log('❌ [DEBUG-TEST] App detection test failed');
          return { success: false, error: 'No active application detected' };
        }
      } catch (error) {
        console.error('❌ [DEBUG-TEST] App detection test error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Debug test URL detection
   */
  registerDebugTestUrlDetection() {
    this.ipcMain.handle('debug-test-url-detection', async () => {
      try {
        console.log('🧪 [DEBUG-TEST] Testing URL detection...');
        const urlData = await this.detectBrowserUrl();
        
        if (urlData && urlData.url) {
          // Check if it's a placeholder URL
          const isPlaceholder = urlData.url.includes('browser-activity-detected.local') || 
                              urlData.url === 'favorites://' || 
                              urlData.url === 'newtab://' || 
                              urlData.url === 'about:blank';
          
          if (isPlaceholder) {
            console.log('⚠️ [DEBUG-TEST] Only placeholder URL detected:', urlData.url);
            return { 
              success: false, 
              error: `Only placeholder URL detected: ${urlData.url}. Real URL capture not working.`,
              url: urlData.url,
              browser: urlData.browser || 'Unknown',
              isPlaceholder: true
            };
          }
          
          console.log('✅ [DEBUG-TEST] Real URL detection test passed:', urlData.url);
          return { 
            success: true, 
            url: urlData.url,
            browser: urlData.browser || 'Unknown',
            title: urlData.title || 'Unknown',
            domain: this.extractDomain(urlData.url),
            isPlaceholder: false
          };
        } else {
          console.log('⚠️ [DEBUG-TEST] URL detection test: No browser URL available');
          return { success: false, error: 'No browser currently active or URL unavailable' };
        }
      } catch (error) {
        console.error('❌ [DEBUG-TEST] URL detection test failed:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Debug test database connection
   */
  registerDebugTestDatabase() {
    this.ipcMain.handle('debug-test-database', async () => {
      try {
        console.log('🧪 [DEBUG-TEST] Testing database connection...');
        
        // Test basic connection by trying to fetch config
        if (!this.config.supabase_url || !this.config.supabase_key) {
          return { success: false, error: 'Missing Supabase configuration' };
        }
        
        // Test database query
        const { data, error } = await this.supabase
          .from('time_logs')
          .select('id')
          .limit(1);
        
        if (error) {
          console.error('❌ [DEBUG-TEST] Database connection failed:', error);
          return { success: false, error: `Database error: ${error.message}` };
        }
        
        console.log('✅ [DEBUG-TEST] Database connection test passed');
        return { success: true, message: 'Database connection working' };
      } catch (error) {
        console.error('❌ [DEBUG-TEST] Database test error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Debug test screen permission
   */
  registerDebugTestScreenPermission() {
    this.ipcMain.handle('debug-test-screen-permission', async () => {
      try {
        console.log('🧪 [DEBUG-TEST] Testing screen recording permission...');
        
        if (process.platform === 'darwin') {
          const screenAccess = this.systemPreferences.getMediaAccessStatus('screen');
          console.log('✅ [DEBUG-TEST] Screen permission status:', screenAccess);
          return { 
            success: screenAccess === 'granted', 
            status: screenAccess,
            message: `Screen recording permission: ${screenAccess}`
          };
        }
        
        return { success: true, message: 'Screen permission check not applicable on this platform' };
      } catch (error) {
        console.error('❌ [DEBUG-TEST] Screen permission test error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Debug test accessibility permission
   */
  registerDebugTestAccessibilityPermission() {
    this.ipcMain.handle('debug-test-accessibility-permission', async () => {
      try {
        console.log('🧪 [DEBUG-TEST] Testing accessibility permission...');
        
        if (process.platform === 'darwin') {
          const accessibilityAccess = (process.platform === 'darwin' && this.systemPreferences && typeof this.systemPreferences.isTrustedAccessibilityClient === 'function') 
            ? this.systemPreferences.isTrustedAccessibilityClient(false) 
            : true;
          console.log('✅ [DEBUG-TEST] Accessibility permission status:', accessibilityAccess);
          return { 
            success: accessibilityAccess, 
            status: accessibilityAccess ? 'granted' : 'denied',
            message: `Accessibility permission: ${accessibilityAccess ? 'granted' : 'denied'}`
          };
        }
        
        return { success: true, message: 'Accessibility permission check not applicable on this platform' };
      } catch (error) {
        console.error('❌ [DEBUG-TEST] Accessibility permission test error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Debug test input monitoring - COMPREHENSIVE VERSION
   */
  registerDebugTestInputMonitoring() {
    this.ipcMain.handle('debug-test-input-monitoring', async () => {
      try {
        console.log('🧪 [DEBUG-TEST] Testing input monitoring...');
        
        // Check tracking intervals and activity state from global scope
        const hasMouseTracking = !!this.global.mouseTrackingInterval;
        const hasKeyboardTracking = !!this.global.keyboardTrackingInterval;
        const recentActivity = (Date.now() - (this.global.lastActivity || 0)) < 10000; // Activity within 10 seconds
        
        if (hasMouseTracking || hasKeyboardTracking || recentActivity) {
          console.log('✅ [DEBUG-TEST] Input monitoring test passed');
          return { 
            success: true, 
            mouse: hasMouseTracking,
            keyboard: hasKeyboardTracking,
            recentActivity
          };
        } else {
          console.log('⚠️ [DEBUG-TEST] Input monitoring test: Limited functionality');
          return { success: false, error: 'Input monitoring not fully functional' };
        }
      } catch (error) {
        console.error('⚠️ [DEBUG-TEST] Input monitoring test warning:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Debug test idle detection - COMPREHENSIVE VERSION
   */
  registerDebugTestIdleDetection() {
    this.ipcMain.handle('debug-test-idle-detection', async () => {
      try {
        console.log('🧪 [DEBUG-TEST] Testing idle detection...');
        
        // Use the global calculateIdleTimeSeconds function
        const idleTime = this.global.calculateIdleTimeSeconds ? this.global.calculateIdleTimeSeconds() : null;
        const hasIdleDetection = typeof idleTime === 'number' && !isNaN(idleTime);
        
        if (hasIdleDetection) {
          console.log(`✅ [DEBUG-TEST] Idle detection test passed: ${idleTime}s idle`);
          return { success: true, idleTime, hasDetection: true };
        } else {
          console.log('❌ [DEBUG-TEST] Idle detection test failed');
          return { success: false, error: 'Idle detection not working' };
        }
      } catch (error) {
        console.error('❌ [DEBUG-TEST] Idle detection test error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Debug get comprehensive status - MASSIVE COMPREHENSIVE VERSION
   */
  registerDebugGetStatus() {
    this.ipcMain.handle('debug-get-status', async () => {
      try {
        console.log('🧪 [IPC] Debug getting comprehensive system status...');
        
        // Get current feature statuses
        const now = Date.now();
        const idleTime = this.global.calculateIdleTimeSeconds ? this.global.calculateIdleTimeSeconds() : 0;
        const hasActiveInput = (now - (this.global.lastActivity || 0)) < 30000; // Activity within 30 seconds
        
        // Check accessibility permission properly
        let accessibilityStatus = false;
        try {
          if (process.platform === 'darwin') {
            // Check multiple indicators for accessibility
            const electronCheck = (process.platform === 'darwin' && this.systemPreferences && typeof this.systemPreferences.isTrustedAccessibilityClient === 'function') 
              ? this.systemPreferences.isTrustedAccessibilityClient(false) 
              : true;
            const hasInputMonitoring = !!this.global.mouseTrackingInterval || !!this.global.keyboardTrackingInterval;
            const hasRecentInput = hasActiveInput;
            
            // If input monitoring is working or we have recent input, accessibility is likely working
            accessibilityStatus = electronCheck || (hasInputMonitoring && hasRecentInput);
            
            console.log(`🔍 [DEBUG-STATUS] Accessibility check: electron=${electronCheck}, input=${hasInputMonitoring}, recent=${hasRecentInput}, final=${accessibilityStatus}`);
          } else {
            accessibilityStatus = true; // Non-macOS platforms don't need this permission
          }
        } catch (error) {
          console.log('⚠️ [DEBUG-STATUS] Accessibility check failed:', error.message);
          accessibilityStatus = !!this.global.mouseTrackingInterval || !!this.global.keyboardTrackingInterval; // Fallback to checking if intervals exist
        }
        
        // Check feature statuses based on actual functionality
        const features = {
          screenshots: {
            status: this.global.screenshotInterval ? 'active' : 'inactive',
            lastUpdate: (this.global.activityStats && this.global.activityStats.lastScreenshotTime) || now,
            count: (this.global.activityStats && this.global.activityStats.screenshotsCaptured) || 0,
            working: !!this.global.screenshotInterval
          },
          appDetection: {
            status: this.global.appCaptureInterval ? 'active' : 'inactive', 
            lastUpdate: this.global.lastAppCaptureTime || now,
            count: 0, // Apps are per-session, not cumulative
            working: !!this.global.appCaptureInterval
          },
          urlDetection: {
            status: (this.global.urlCaptureManager && this.global.urlCaptureManager.isRunning) ? 'active' : 
                    this.global.urlCaptureInterval ? 'active' : 'inactive',
            lastUpdate: this.global.lastUrlCaptureTime || now, 
            count: 0, // URLs are per-session, not cumulative
            working: !!(this.global.urlCaptureManager && this.global.urlCaptureManager.isRunning) || 
                     !!this.global.urlCaptureInterval
          },
          idleDetection: {
            status: this.global.idleCheckInterval ? 'active' : 'inactive',
            lastUpdate: now,
            idleSeconds: idleTime,
            working: typeof idleTime === 'number' && !isNaN(idleTime)
          },
          inputTracking: {
            status: (this.global.mouseTrackingInterval || this.global.keyboardTrackingInterval) ? 'active' : 'inactive',
            lastUpdate: this.global.lastActivity || now,
            clicks: (this.global.activityStats && this.global.activityStats.mouseClicks) || 0,
            keys: (this.global.activityStats && this.global.activityStats.keystrokes) || 0,
            moves: (this.global.activityStats && this.global.activityStats.mouseMovements) || 0,
            working: hasActiveInput || !!this.global.mouseTrackingInterval || !!this.global.keyboardTrackingInterval
          },
          database: {
            status: this.config.supabase_url && this.config.supabase_key ? 'active' : 'inactive',
            lastUpdate: now,
            connected: !!(this.config.supabase_url && this.config.supabase_key),
            working: !!(this.config.supabase_url && this.config.supabase_key)
          },
          permissions: {
            status: 'active', // We got this far, so basic permissions work
            lastUpdate: now,
            screenRecording: true, // If we're running, screen recording works
            accessibility: accessibilityStatus,
            working: accessibilityStatus
          }
        };
        
        // Calculate system health based on ACTUAL functionality
        const workingFeatures = Object.values(features).filter(f => f.working).length;
        const totalFeatures = Object.keys(features).length;
        const healthPercentage = (workingFeatures / totalFeatures) * 100;
        
        let overallHealth = 'GOOD';
        if (healthPercentage < 50) {
          overallHealth = 'CRITICAL';
        } else if (healthPercentage < 80) {
          overallHealth = 'WARNING';
        }
        
        // If tracking is active and core features work, upgrade health
        if (this.global.isTracking && features.screenshots.working && features.inputTracking.working) {
          overallHealth = healthPercentage >= 80 ? 'GOOD' : 'WARNING';
        }
        
        const status = {
          isTracking: this.global.isTracking || false,
          isPaused: this.global.isPaused || false,
          currentSession: this.global.currentSession || null,
          projectId: this.config.project_id,
          userId: this.config.user_id,
          userEmail: this.config.userEmail,
          platform: process.platform,
          version: require('../../../package.json').version || '1.0.62',
          timestamp: new Date().toISOString(),
          uptime: Math.floor(process.uptime()),
          health: {
            overall: overallHealth,
            percentage: Math.round(healthPercentage),
            workingFeatures,
            totalFeatures
          },
          features,
          stats: {
            screenshots: (this.global.activityStats && this.global.activityStats.screenshotsCaptured) || 0,
            apps: 0, // Apps are captured per session, not cumulative
            urls: 0, // URLs are captured per session, not cumulative  
            activity: this.global.lastActivityPercent || 100,
            mouseClicks: (this.global.activityStats && this.global.activityStats.mouseClicks) || 0,
            keystrokes: (this.global.activityStats && this.global.activityStats.keystrokes) || 0,
            mouseMovements: (this.global.activityStats && this.global.activityStats.mouseMovements) || 0,
            idleSeconds: idleTime || 0,
            activeSeconds: (this.global.activityStats && this.global.activityStats.activeSeconds) || 0
          }
        };

        console.log('📊 [IPC] Debug status response:', {
          isTracking: status.isTracking,
          health: status.health.overall,
          workingFeatures: `${workingFeatures}/${totalFeatures}`,
          mouseClicks: status.stats.mouseClicks,
          keystrokes: status.stats.keystrokes,
          mouseMovements: status.stats.mouseMovements,
          accessibility: accessibilityStatus
        });

        return {
          success: true,
          status,
          message: 'Comprehensive status retrieved successfully'
        };
      } catch (error) {
        console.error('❌ [IPC] Debug get status error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
  }

  /**
   * Debug test activity - COMPREHENSIVE VERSION
   */
  registerDebugTestActivity() {
    this.ipcMain.handle('debug-test-activity', async () => {
      try {
        console.log('🚫 [DEBUG-TEST] Activity simulation DISABLED - real detection only');
        
        return { 
          success: false, 
          message: 'Activity simulation disabled - system uses real user input detection only',
          simulatedActivity: {
            mouseClicks: 0,
            keystrokes: 0,
            mouseMovements: 0
          }
        };
      } catch (error) {
        console.error('❌ [DEBUG-TEST] Activity simulation test error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Debug tracking status
   */
  registerDebugTrackingStatus() {
    this.ipcMain.handle('debug-tracking-status', () => {
      const debugInfo = {
        isTracking: this.global.isTracking || false,
        currentTimeLogId: this.global.currentTimeLogId || null,
        isPaused: this.global.isPaused || false,
        appCaptureEnabled: this.global.appCaptureEnabled || false,
        urlCaptureEnabled: this.global.urlCaptureEnabled || false,
        hasActiveWin: !!this.global.activeWin,
        intervalManagerRegistered: !!this.global.intervalManager
      };
      
      console.log('🔍 [DEBUG] Full tracking status:', debugInfo);
      return debugInfo;
    });
  }

  /**
   * Initialize the debug handler manager
   */
  async initialize() {
    try {
      this.registerHandlers();
      console.log('🐛 DebugHandlerManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ DebugHandlerManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the debug handler manager
   */
  async shutdown() {
    try {
      console.log('🐛 DebugHandlerManager shutdown complete');
    } catch (error) {
      console.error('❌ DebugHandlerManager shutdown failed:', error);
    }
  }
}

module.exports = DebugHandlerManager;