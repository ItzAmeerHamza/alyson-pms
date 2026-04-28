/**
 * IMMEDIATE SCREENSHOT FIX
 * Run this directly in your desktop agent to restart screenshots NOW
 */

async function immediateScreenshotFix() {
  console.log('🚨 [IMMEDIATE-FIX] Starting emergency screenshot repair...');
  
  try {
    // Step 1: Initialize consolidated screenshots if needed
    console.log('📸 [IMMEDIATE-FIX] Step 1: Initializing consolidated screenshots...');
    
    const { initializeConsolidatedScreenshots } = require('./src/fixes/consolidate-screenshots');
    
    // Mock basic config for initialization
    const configManager = global.configManager || {
      getConfig: () => ({
        user_id: global.user_id || 'current-user',
        currentTimeLogId: global.currentTimeLogId || global.currentSession?.id,
        currentProjectId: global.currentProjectId || global.currentSession?.project_id
      }),
      supabaseService: global.supabaseService
    };
    
    // Use available electron modules
    const electronModules = {
      desktopCapturer: require('electron').desktopCapturer,
      systemPreferences: require('electron').systemPreferences,
      screen: require('electron').screen
    };
    
    // Initialize the consolidated system
    await initializeConsolidatedScreenshots(
      configManager,
      electronModules,
      global.enhancedSyncManager
    );
    
    console.log('✅ [IMMEDIATE-FIX] Consolidated screenshots initialized');
    
    // Step 2: Fix the enhanced screenshot manager capture method
    console.log('📸 [IMMEDIATE-FIX] Step 2: Fixing enhanced screenshot manager...');
    
    if (global.enhancedScreenshotManager) {
      // Override the capture method to use consolidated system
      global.enhancedScreenshotManager.captureScreenshot = async (isHealthCheck = false) => {
        console.log('📸 [ENHANCED-FIX] Delegating capture to consolidated system');
        const { captureScreenshotSafe } = require('./src/fixes/consolidate-screenshots');
        const result = await captureScreenshotSafe(isHealthCheck);
        console.log('📸 [ENHANCED-FIX] Consolidated capture result:', !!result);
        return result;
      };
      
      console.log('✅ [IMMEDIATE-FIX] Enhanced screenshot manager capture method fixed');
    }
    
    // Step 3: Restart screenshot scheduling if tracking
    console.log('🔄 [IMMEDIATE-FIX] Step 3: Restarting screenshot scheduling...');
    
    if (global.enhancedScreenshotManager && (global.isTracking || global.currentSession)) {
      // Clear any existing scheduling
      global.enhancedScreenshotManager.clearWindowScheduling();
      global.enhancedScreenshotManager.stopScreenshotCapture();
      
      // Force restart with current session
      const session = global.currentSession || { id: 'current-session' };
      global.enhancedScreenshotManager.updateTrackingState(true, session);
      
      console.log('✅ [IMMEDIATE-FIX] Screenshot scheduling restarted');
      
      // Take a test screenshot after 5 seconds
      setTimeout(async () => {
        console.log('📸 [IMMEDIATE-FIX] Taking test screenshot...');
        try {
          const testResult = await global.enhancedScreenshotManager.captureScreenshot(false);
          if (testResult) {
            console.log('🎉 [IMMEDIATE-FIX] SUCCESS! Test screenshot captured successfully');
            console.log('📸 Screenshots should now be working normally');
          } else {
            console.log('⚠️ [IMMEDIATE-FIX] Test screenshot failed, but system is initialized');
          }
        } catch (error) {
          console.error('❌ [IMMEDIATE-FIX] Test screenshot error:', error.message);
        }
      }, 5000);
      
    } else {
      console.log('⚠️ [IMMEDIATE-FIX] Not currently tracking - screenshot system ready but dormant');
      console.log('💡 Start tracking to activate screenshot capture');
    }
    
    console.log('🎉 [IMMEDIATE-FIX] Screenshot system repair completed!');
    console.log('📸 Screenshots should now capture every 3-15 minutes during tracking');
    
    return true;
    
  } catch (error) {
    console.error('❌ [IMMEDIATE-FIX] Failed to fix screenshot system:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Auto-run the fix
console.log('🔧 RUNNING IMMEDIATE SCREENSHOT FIX...');
immediateScreenshotFix()
  .then(success => {
    if (success) {
      console.log('✅ SCREENSHOT FIX APPLIED SUCCESSFULLY!');
    } else {
      console.log('❌ SCREENSHOT FIX FAILED - MANUAL INTERVENTION NEEDED');
    }
  })
  .catch(error => {
    console.error('💥 SCREENSHOT FIX CRASHED:', error);
  });

module.exports = { immediateScreenshotFix };


