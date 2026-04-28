/**
 * Test Mode IPC Handlers
 * Provides testing hooks for E2E test automation
 * Only enabled when TEST_MODE=1 environment variable is set
 */

class TestModeHandlers {
  constructor(ipcMain, dependencies = {}) {
    this.ipcMain = ipcMain;
    this.deps = dependencies;
    this.isTestMode = process.env.TEST_MODE === '1';
    this.testRunId = process.env.TEST_RUN_ID || `test-${Date.now()}`;
    
    if (this.isTestMode) {
      console.log('🧪 [TEST-MODE] Test mode enabled');
      console.log('📋 [TEST-MODE] Test Run ID:', this.testRunId);
      this.registerTestHandlers();
    }
  }

  registerTestHandlers() {
    console.log('🧪 [TEST-MODE] Registering test IPC handlers...');

    // Get current application state
    this.ipcMain.handle('test:getState', async () => {
      try {
        return {
          isTracking: global.isTracking || false,
          isPaused: global.isPaused || false,
          currentSession: global.currentSession || null,
          currentTimeLogId: global.currentTimeLogId || null,
          currentProjectId: global.currentProjectId || null,
          offlineQueueSizes: this.getOfflineQueueSizes(),
          testRunId: this.testRunId,
        };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error getting state:', error);
        return { error: error.message };
      }
    });

    // Force idle state for specified duration
    this.ipcMain.handle('test:forceIdle', async (event, ms) => {
      try {
        console.log(`🧪 [TEST-MODE] Forcing idle for ${ms}ms`);
        
        // Set idle state
        if (global.setIdleState) {
          global.setIdleState(true);
        }
        
        // Trigger idle detection logic
        if (global.handleIdleDetection) {
          await global.handleIdleDetection(ms);
        }
        
        // If ms is 0, reset to active
        if (ms === 0) {
          if (global.setIdleState) {
            global.setIdleState(false);
          }
          console.log('🧪 [TEST-MODE] Reset to active state');
        }
        
        return { success: true, idleDuration: ms };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error forcing idle:', error);
        return { success: false, error: error.message };
      }
    });

    // Trigger screenshot capture immediately
    this.ipcMain.handle('test:snapNow', async () => {
      try {
        console.log('🧪 [TEST-MODE] Triggering immediate screenshot');
        
        let screenshotResult = null;
        
        // Try different screenshot capture methods
        if (global.captureScreenshot) {
          screenshotResult = await global.captureScreenshot();
        } else if (global.screenshotManager && global.screenshotManager.captureScreenshot) {
          screenshotResult = await global.screenshotManager.captureScreenshot();
        } else {
          console.warn('⚠️ [TEST-MODE] No screenshot capture method available');
        }
        
        return { 
          success: true, 
          screenshot: screenshotResult,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error capturing screenshot:', error);
        return { success: false, error: error.message };
      }
    });

    // Simulate app focus change
    this.ipcMain.handle('test:focusApp', async (event, { name, title }) => {
      try {
        console.log(`🧪 [TEST-MODE] Simulating app focus: ${name} - ${title}`);
        
        // Create mock app data
        const mockAppData = {
          name: name,
          title: title,
          bundleId: `com.test.${name.toLowerCase()}`,
          timestamp: new Date().toISOString(),
          pid: Math.floor(Math.random() * 10000),
        };
        
        // Trigger app detection logic
        if (global.handleAppFocus) {
          await global.handleAppFocus(mockAppData);
        }
        
        // Add to offline queue or database
        if (global.offlineQueue && global.offlineQueue.appLogs) {
          global.offlineQueue.appLogs.push({
            user_id: global.config?.user_id || 'test-user',
            time_log_id: global.currentTimeLogId,
            app_name: name,
            window_title: title,
            app_path: mockAppData.bundleId,
            timestamp: mockAppData.timestamp,
          });
        }
        
        return { success: true, appData: mockAppData };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error simulating app focus:', error);
        return { success: false, error: error.message };
      }
    });

    // Simulate URL navigation
    this.ipcMain.handle('test:focusUrl', async (event, url) => {
      try {
        console.log(`🧪 [TEST-MODE] Simulating URL focus: ${url}`);
        
        const urlObj = new URL(url);
        const mockUrlData = {
          url: url,
          title: `Test Page - ${urlObj.hostname}`,
          domain: urlObj.hostname,
          browser: 'Test Browser',
          timestamp: new Date().toISOString(),
        };
        
        // Determine productivity tag based on domain
        const productivityTag = this.getProductivityTag(urlObj.hostname);
        mockUrlData.productivity_tag = productivityTag;
        
        // Trigger URL detection logic
        if (global.handleUrlFocus) {
          await global.handleUrlFocus(mockUrlData);
        }
        
        // Add to offline queue or database
        if (global.offlineQueue && global.offlineQueue.urlLogs) {
          global.offlineQueue.urlLogs.push({
            user_id: global.config?.user_id || 'test-user',
            time_log_id: global.currentTimeLogId,
            ...mockUrlData,
          });
        }
        
        return { success: true, urlData: mockUrlData };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error simulating URL focus:', error);
        return { success: false, error: error.message };
      }
    });

    // Simulate offline mode
    this.ipcMain.handle('test:offline', async () => {
      try {
        console.log('🧪 [TEST-MODE] Simulating offline mode');
        
        // Set offline state
        if (global.setOfflineState) {
          global.setOfflineState(true);
        }
        
        // Disable sync manager
        if (global.syncManager && global.syncManager.pause) {
          global.syncManager.pause();
        }
        
        global.isOffline = true;
        
        return { success: true, mode: 'offline' };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error setting offline mode:', error);
        return { success: false, error: error.message };
      }
    });

    // Simulate online mode and trigger sync
    this.ipcMain.handle('test:online', async () => {
      try {
        console.log('🧪 [TEST-MODE] Simulating online mode and triggering sync');
        
        // Set online state
        if (global.setOfflineState) {
          global.setOfflineState(false);
        }
        
        global.isOffline = false;
        
        // Resume sync manager and trigger sync
        if (global.syncManager) {
          if (global.syncManager.resume) {
            global.syncManager.resume();
          }
          if (global.syncManager.syncAll) {
            await global.syncManager.syncAll();
          }
        }
        
        // Trigger manual sync if available
        if (global.triggerSync) {
          await global.triggerSync();
        }
        
        return { 
          success: true, 
          mode: 'online',
          syncTriggered: true,
          queueSizes: this.getOfflineQueueSizes()
        };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error setting online mode:', error);
        return { success: false, error: error.message };
      }
    });

    // Clear offline queues
    this.ipcMain.handle('test:clearQueues', async () => {
      try {
        console.log('🧪 [TEST-MODE] Clearing offline queues');
        
        if (global.offlineQueue) {
          global.offlineQueue.timeLogs = [];
          global.offlineQueue.screenshots = [];
          global.offlineQueue.appLogs = [];
          global.offlineQueue.urlLogs = [];
          global.offlineQueue.activities = [];
          global.offlineQueue.idleLogs = [];
        }
        
        return { 
          success: true, 
          clearedQueues: true,
          queueSizes: this.getOfflineQueueSizes()
        };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error clearing queues:', error);
        return { success: false, error: error.message };
      }
    });

    // Set current project
    this.ipcMain.handle('test:setProject', async (event, projectId) => {
      try {
        console.log(`🧪 [TEST-MODE] Setting current project: ${projectId}`);
        
        global.currentProjectId = projectId;
        
        return { success: true, projectId: projectId };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error setting project:', error);
        return { success: false, error: error.message };
      }
    });

    // Additional comprehensive testing hooks

    // Emit activity events (keystrokes, clicks, mouse movement)
    this.ipcMain.handle('test:emitActivity', async (event, { kpm, cpm, move, intervalMs = 1000 }) => {
      try {
        console.log(`🧪 [TEST-MODE] Emitting activity: KPM=${kpm}, CPM=${cpm}, Move=${move}`);
        
        // Generate activity events
        if (global.activityManager && global.activityManager.recordActivity) {
          for (let i = 0; i < Math.ceil(intervalMs / 1000); i++) {
            await global.activityManager.recordActivity({
              keystrokes: Math.floor(kpm / 60) || 0,
              clicks: Math.floor(cpm / 60) || 0,
              mouseMovement: move || 0,
              timestamp: new Date()
            });
          }
        }
        
        return { success: true, activity: { kpm, cpm, move, intervalMs } };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error emitting activity:', error);
        return { success: false, error: error.message };
      }
    });

    // Capture screenshot with specific hash for duplicate testing
    this.ipcMain.handle('test:snapWithHash', async (event, hash) => {
      try {
        console.log(`🧪 [TEST-MODE] Capturing screenshot with hash: ${hash}`);
        
        let result = { success: true, testHash: hash };
        
        // Try screenshot capture
        if (global.captureScreenshot) {
          const screenshotResult = await global.captureScreenshot();
          result.screenshot = screenshotResult;
        }
        
        return result;
      } catch (error) {
        console.error('❌ [TEST-MODE] Error capturing screenshot with hash:', error);
        return { success: false, error: error.message };
      }
    });

    // Mark content as sensitive for privacy testing
    this.ipcMain.handle('test:markSensitive', async (event, sensitive = true) => {
      try {
        console.log(`🧪 [TEST-MODE] Marking content as sensitive: ${sensitive}`);
        
        global.testSensitiveContent = sensitive;
        
        return { success: true, sensitive };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error marking sensitive:', error);
        return { success: false, error: error.message };
      }
    });

    // Emit anti-cheat signals
    this.ipcMain.handle('test:emitAntiCheat', async (event, { type, confidence }) => {
      try {
        console.log(`🧪 [TEST-MODE] Emitting anti-cheat signal: ${type} (${confidence}%)`);
        
        const alert = {
          type,
          confidence,
          sessionId: global.currentTimeLogId,
          timestamp: new Date().toISOString(),
          testRunId: this.testRunId
        };
        
        // Store alert globally for UI to pick up
        global.testAntiCheatAlert = alert;
        
        return { success: true, alert };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error emitting anti-cheat:', error);
        return { success: false, error: error.message };
      }
    });

    // Set system permissions for testing
    this.ipcMain.handle('test:setPermissions', async (event, { screenRecording, inputMonitoring }) => {
      try {
        console.log(`🧪 [TEST-MODE] Setting permissions: Screen=${screenRecording}, Input=${inputMonitoring}`);
        
        global.testPermissions = { screenRecording, inputMonitoring };
        
        return { success: true, permissions: { screenRecording, inputMonitoring } };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error setting permissions:', error);
        return { success: false, error: error.message };
      }
    });

    // Simulate network failure during sync
    this.ipcMain.handle('test:setNetworkState', async (event, { online, failureType = null }) => {
      try {
        console.log(`🧪 [TEST-MODE] Setting network state: online=${online}, failure=${failureType}`);
        
        global.testNetworkState = { online, failureType };
        
        return { success: true, networkState: { online, failureType } };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error setting network state:', error);
        return { success: false, error: error.message };
      }
    });

    // Emit reporting signal
    this.ipcMain.handle('test:emitReportingSignal', async (event, signalType) => {
      try {
        console.log(`🧪 [TEST-MODE] Emitting reporting signal: ${signalType}`);
        
        const signal = {
          type: signalType,
          timestamp: new Date().toISOString(),
          testRunId: this.testRunId
        };
        
        global.testReportingSignal = signal;
        
        return { success: true, signal };
      } catch (error) {
        console.error('❌ [TEST-MODE] Error emitting reporting signal:', error);
        return { success: false, error: error.message };
      }
    });

    console.log('✅ [TEST-MODE] Test handlers registered successfully (including comprehensive coverage hooks)');
  }

  getOfflineQueueSizes() {
    if (!global.offlineQueue) {
      return { error: 'Offline queue not available' };
    }
    
    return {
      timeLogs: global.offlineQueue.timeLogs?.length || 0,
      screenshots: global.offlineQueue.screenshots?.length || 0,
      appLogs: global.offlineQueue.appLogs?.length || 0,
      urlLogs: global.offlineQueue.urlLogs?.length || 0,
      activities: global.offlineQueue.activities?.length || 0,
      idleLogs: global.offlineQueue.idleLogs?.length || 0,
    };
  }

  getProductivityTag(domain) {
    // Simple productivity categorization for testing
    const productiveDomains = [
      'stackoverflow.com',
      'github.com',
      'docs.microsoft.com',
      'developer.mozilla.org',
      'aws.amazon.com',
      'ebdaadt.com',
    ];
    
    const unproductiveDomains = [
      'youtube.com',
      'facebook.com',
      'twitter.com',
      'instagram.com',
      'tiktok.com',
      'netflix.com',
    ];
    
    if (productiveDomains.some(d => domain.includes(d))) {
      return 'productive';
    }
    
    if (unproductiveDomains.some(d => domain.includes(d))) {
      return 'unproductive';
    }
    
    return 'neutral';
  }
}

module.exports = TestModeHandlers;
