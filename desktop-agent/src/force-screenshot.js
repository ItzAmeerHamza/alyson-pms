/**
 * Force Screenshot Capture Script
 * Forces an immediate screenshot capture and updates the scheduling logic
 * to capture 3 screenshots per 10 minutes with minimum 3-minute gap
 */

// Force immediate screenshot capture
async function forceImmediateScreenshot() {
  try {
    console.log('🎯 [FORCE-SCREENSHOT] Attempting to force immediate screenshot capture...');
    
    // Method 1: Enhanced screenshot manager (primary)
    if (global.enhancedScreenshotManager && global.enhancedScreenshotManager.captureScreenshot) {
      console.log('📸 [FORCE-SCREENSHOT] Using enhancedScreenshotManager...');
      const result = await global.enhancedScreenshotManager.captureScreenshot();
      console.log('✅ [FORCE-SCREENSHOT] Screenshot captured via enhanced manager!');
      return true;
    }
    
    // Method 2: Consolidated screenshot manager
    if (global.consolidatedScreenshotManager && global.consolidatedScreenshotManager.captureScreenshot) {
      console.log('📸 [FORCE-SCREENSHOT] Using consolidatedScreenshotManager...');
      await global.consolidatedScreenshotManager.captureScreenshot();
      console.log('✅ [FORCE-SCREENSHOT] Screenshot captured via consolidated manager!');
      return true;
    }
    
    // Method 3: Try through global screenshot manager if available
    if (global.screenshotManager && global.screenshotManager.captureScreenshot) {
      console.log('🔄 [FORCE-SCREENSHOT] Trying global screenshot manager...');
      await global.screenshotManager.captureScreenshot();
      console.log('✅ [FORCE-SCREENSHOT] Screenshot captured via global manager!');
      return true;
    }
    
    // Method 3: Try through wrappers
    if (global.wrappers && global.wrappers.captureScreenshot) {
      console.log('🔄 [FORCE-SCREENSHOT] Trying wrappers...');
      await global.wrappers.captureScreenshot();
      console.log('✅ [FORCE-SCREENSHOT] Screenshot captured via wrappers!');
      return true;
    }
    
    console.log('❌ [FORCE-SCREENSHOT] No screenshot capture method available');
    return false;
  } catch (error) {
    console.error('❌ [FORCE-SCREENSHOT] Error capturing screenshot:', error.message);
    return false;
  }
}

// Update screenshot scheduling logic for 3 per 10 minutes
function updateScreenshotScheduling() {
  console.log('⚙️ [SCREENSHOT-CONFIG] Updating to 3 screenshots per 10 minutes...');
  
  // Update configuration
  const targetIntervalSeconds = 200; // ~3.33 minutes (200 seconds) for 3 shots in 10 min
  const minGapSeconds = 180; // 3 minutes minimum gap
  
  // Update global settings if available
  if (global.appSettings) {
    global.appSettings.screenshot_interval_seconds = targetIntervalSeconds;
    console.log('✅ [SCREENSHOT-CONFIG] Updated global settings');
  }
  
  // Update configuration data manager if available
  if (global.configurationDataManager && global.configurationDataManager.appSettings) {
    global.configurationDataManager.appSettings.screenshot_interval_seconds = targetIntervalSeconds;
    console.log('✅ [SCREENSHOT-CONFIG] Updated configuration data manager');
  }
  
  // Update the enhanced screenshot manager to use 3-per-10min logic
  if (global.enhancedScreenshotManager) {
    global.enhancedScreenshotManager.SCREENSHOT_INTERVAL = targetIntervalSeconds;
    global.enhancedScreenshotManager.windowDurationMs = 10 * 60 * 1000; // 10 minutes
    global.enhancedScreenshotManager.windowShots = 3;
    console.log('✅ [SCREENSHOT-CONFIG] Updated enhanced screenshot manager');
  }
  
  // Restart screenshot scheduling with new timing
  restartScreenshotScheduling(targetIntervalSeconds, minGapSeconds);
}

// Restart screenshot scheduling with new timing
function restartScreenshotScheduling(intervalSeconds, minGapSeconds) {
  console.log('🔄 [SCREENSHOT-SCHEDULE] Restarting with new timing...');
  
  try {
    // Clear existing timers
    if (global.screenshotInterval) {
      clearTimeout(global.screenshotInterval);
      global.screenshotInterval = null;
    }
    
    // Use the 3-per-10min logic (no dependency on removed consolidate-screenshots module)
    const scheduleTimed3Per10Min = () => {
      const now = Date.now();
      const windowStart = global.screenshot3Per10MinWindow || now;
      const windowElapsed = now - windowStart;
      const shotsInWindow = global.screenshot3Per10MinCount || 0;
      
      // Reset window if 10 minutes passed
      if (windowElapsed > 10 * 60 * 1000) {
        global.screenshot3Per10MinWindow = now;
        global.screenshot3Per10MinCount = 0;
        console.log('🔄 [SCREENSHOT-SCHEDULE] New 10-minute window started');
      }
      
      // Check if we can take another shot
      if (global.screenshot3Per10MinCount < 3) {
        // Calculate next shot time with minimum gap
        const lastShotTime = global.lastScreenshotTime || 0;
        const timeSinceLastShot = now - lastShotTime;
        
        let nextDelay;
        if (timeSinceLastShot < minGapSeconds * 1000) {
          // Wait for minimum gap
          nextDelay = (minGapSeconds * 1000) - timeSinceLastShot;
        } else {
          // Distribute remaining shots evenly in the window
          const remainingTime = (10 * 60 * 1000) - windowElapsed;
          const remainingShots = 3 - shotsInWindow;
          nextDelay = Math.max(5000, remainingTime / remainingShots);
        }
        
        console.log(`📸 [SCREENSHOT-SCHEDULE] Next shot in ${Math.round(nextDelay / 1000)}s (${shotsInWindow + 1}/3 in window)`);
        
        global.screenshotInterval = setTimeout(async () => {
          await forceImmediateScreenshot();
          global.screenshot3Per10MinCount = (global.screenshot3Per10MinCount || 0) + 1;
          global.lastScreenshotTime = Date.now();
          scheduleTimed3Per10Min(); // Schedule next
        }, nextDelay);
      } else {
        // Wait for next window
        const waitTime = (10 * 60 * 1000) - windowElapsed;
        console.log(`⏳ [SCREENSHOT-SCHEDULE] Window complete, waiting ${Math.round(waitTime / 1000)}s for next window`);
        
        global.screenshotInterval = setTimeout(() => {
          global.screenshot3Per10MinWindow = Date.now();
          global.screenshot3Per10MinCount = 0;
          scheduleTimed3Per10Min();
        }, waitTime);
      }
    };
    
    // Start the new scheduling
    scheduleTimed3Per10Min();
    
    console.log('✅ [SCREENSHOT-SCHEDULE] New scheduling started: 3 per 10 min, min 3 min gap');
  } catch (error) {
    console.error('❌ [SCREENSHOT-SCHEDULE] Error restarting:', error.message);
  }
}

// Export functions for use in console
if (typeof global !== 'undefined') {
  global.forceScreenshot = forceImmediateScreenshot;
  global.updateScreenshotTiming = updateScreenshotScheduling;
  
  console.log('✅ Screenshot control functions loaded:');
  console.log('   📸 forceScreenshot() - Capture screenshot immediately');
  console.log('   ⚙️ updateScreenshotTiming() - Set to 3 per 10 min with 3 min gap');
}

module.exports = {
  forceImmediateScreenshot,
  updateScreenshotScheduling,
  restartScreenshotScheduling
};

