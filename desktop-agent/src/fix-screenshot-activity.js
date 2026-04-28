/**
 * Fix Screenshot Activity Data
 * Ensures activity data is properly passed to screenshots
 */

// Track last input stats for delta calculation
let lastInputStats = { mouseClicks: 0, keystrokes: 0, mouseMovements: 0 };

// Function to sync activity data for screenshots
function syncActivityDataForScreenshots() {
  console.log('🔧 [FIX-ACTIVITY] Syncing activity data for screenshots...');
try {
    // Create global betweenScreenshotsActivity if it doesn't exist
    if (!global.betweenScreenshotsActivity) {
      global.betweenScreenshotsActivity = {
        clicks: 0,
        keys: 0,
        moves: 0,
        lastUpdate: Date.now()
      };
    }
    
    // Try to get activity from various sources
    let totalClicks = 0;
    let totalKeys = 0;
    let totalMoves = 0;
    
    // Source 1: Enhanced Activity Manager
    if (global.enhancedActivityManager && global.enhancedActivityManager.betweenScreenshotsActivity) {
      const activity = global.enhancedActivityManager.betweenScreenshotsActivity;
      totalClicks = activity.clicks || 0;
      totalKeys = activity.keys || 0;
      totalMoves = activity.moves || 0;
      console.log('✅ [FIX-ACTIVITY] Got data from enhancedActivityManager:', { clicks: totalClicks, keys: totalKeys, moves: totalMoves });
    }
    
    // Source 2: Display Activity Stats
    if (global.displayActivityStats && totalClicks === 0) {
      totalClicks = global.displayActivityStats.clicks || totalClicks;
      totalKeys = global.displayActivityStats.keys || totalKeys;
      totalMoves = global.displayActivityStats.moves || totalMoves;
      console.log('✅ [FIX-ACTIVITY] Got data from displayActivityStats:', { clicks: totalClicks, keys: totalKeys, moves: totalMoves });
    }
    
    // Source 3: Activity Stats
    if (global.activityStats && totalClicks === 0) {
      totalClicks = global.activityStats.mouseClicks || totalClicks;
      totalKeys = global.activityStats.keystrokes || totalKeys;
      totalMoves = global.activityStats.mouseMovements || totalMoves;
      console.log('✅ [FIX-ACTIVITY] Got data from activityStats:', { clicks: totalClicks, keys: totalKeys, moves: totalMoves });
    }
    
    // Source 4: Period Activity Stats
    if (global.periodActivityStats && totalClicks === 0) {
      totalClicks = global.periodActivityStats.mouseClicks || totalClicks;
      totalKeys = global.periodActivityStats.keystrokes || totalKeys;
      totalMoves = global.periodActivityStats.mouseMovements || totalMoves;
      console.log('✅ [FIX-ACTIVITY] Got data from periodActivityStats:', { clicks: totalClicks, keys: totalKeys, moves: totalMoves });
    }
    
    // Source 5: UnifiedInputManager stats (last resort) - using delta calculation
    if (global.globalInputManager && totalClicks === 0) {
      const s = (global.globalInputManager.getStats && global.globalInputManager.getStats()) || global.globalInputManager.stats;
      if (s) {
        // Calculate deltas to avoid over-reporting cumulative stats
        const diffClicks = Math.max(0, (s.mouseClicks || 0) - (lastInputStats.mouseClicks || 0));
        const diffKeys = Math.max(0, (s.keystrokes || 0) - (lastInputStats.keystrokes || 0));
        const diffMoves = Math.max(0, (s.mouseMovements || 0) - (lastInputStats.mouseMovements || 0));
        
        totalClicks = diffClicks;
        totalKeys = diffKeys;
        totalMoves = diffMoves;
        
        // Update last stats for next delta calculation
        lastInputStats = { 
          mouseClicks: s.mouseClicks || 0, 
          keystrokes: s.keystrokes || 0, 
          mouseMovements: s.mouseMovements || 0 
        };
        
        console.log('✅ [FIX-ACTIVITY] Using delta from globalInputManager.stats:', { 
          clicks: totalClicks, 
          keys: totalKeys, 
          moves: totalMoves,
          cumulative: { clicks: s.mouseClicks, keys: s.keystrokes, moves: s.mouseMovements }
        });
      }
    }
    
    // Activity counters are kept in sync by the recording path (main.js + enhanced-activity-manager).
    // Periodic overwrite was causing cumulative values to bleed into per-screenshot counters
    // after a reset, because the source might not yet reflect the reset.
    // Now this function only LOGS for diagnostics without mutating counters.
    const currentBetween = global.betweenScreenshotsActivity;
    console.log('✅ [FIX-ACTIVITY] Activity data synced:', {
      between: { clicks: currentBetween.clicks, keys: currentBetween.keys, moves: currentBetween.moves },
      manager: { clicks: totalClicks, keys: totalKeys, moves: totalMoves }
    });
    
    return currentBetween;
  } catch (error) {
    console.error('❌ [FIX-ACTIVITY] Error syncing activity data:', error.message);
    return { clicks: 0, keys: 0, moves: 0 };
  }
}

// Function to force screenshot with activity data
async function forceScreenshotWithActivity() {
  try {
    console.log('📸 [FIX-ACTIVITY] Forcing screenshot with activity data...');
    
    // First sync the activity data
    const activityData = syncActivityDataForScreenshots();
    console.log('📊 [FIX-ACTIVITY] Current activity:', activityData);
    
    // Force screenshot capture
    if (global.screenshotManager && global.screenshotManager.captureScreenshot) {
      console.log('🎯 [FIX-ACTIVITY] Using global.screenshotManager...');
      await global.screenshotManager.captureScreenshot();
      console.log('✅ [FIX-ACTIVITY] Screenshot captured!');
      return true;
    }
    
    // Try enhanced screenshot manager (consolidated)
    if (global.enhancedScreenshotManager && global.enhancedScreenshotManager.captureScreenshot) {
      console.log('🎯 [FIX-ACTIVITY] Using enhancedScreenshotManager...');
      await global.enhancedScreenshotManager.captureScreenshot();
      console.log('✅ [FIX-ACTIVITY] Screenshot captured!');
      return true;
    }
    
    // Try consolidated screenshot manager
    if (global.consolidatedScreenshotManager && global.consolidatedScreenshotManager.captureScreenshot) {
      console.log('🎯 [FIX-ACTIVITY] Using consolidatedScreenshotManager...');
      await global.consolidatedScreenshotManager.captureScreenshot();
      console.log('✅ [FIX-ACTIVITY] Screenshot captured!');
      return true;
    }
    
    console.log('❌ [FIX-ACTIVITY] No screenshot capture method available');
    return false;
  } catch (error) {
    console.error('❌ [FIX-ACTIVITY] Error capturing screenshot:', error.message);
    return false;
  }
}

// Register managed intervals for activity sync
function registerActivitySyncIntervals() {
  console.log('🔄 [FIX-ACTIVITY] Registering activity sync intervals...');
  
  // Clean up any existing intervals first
  cleanupActivityFixIntervals();
  
  // Create intervals with cleanup tracking
  // CRITICAL FIX: Only run when tracking is active
  const activitySyncInterval = setInterval(() => {
    if (!global.isTracking) return; // Skip when not tracking
    syncActivityDataForScreenshots();
  }, 30000); // Sync every 30 seconds
  
  const trackingStateSyncInterval = setInterval(() => {
    if (!global.isTracking) return; // Skip when not tracking
    ensureTrackingStateSync();
  }, 10000); // Check every 10 seconds
  
  // Store intervals for cleanup
  if (!global.activityFixIntervals) {
    global.activityFixIntervals = [];
  }
  global.activityFixIntervals.push(activitySyncInterval, trackingStateSyncInterval);
  
  console.log('✅ [FIX-ACTIVITY] Activity sync intervals registered (30s activity sync, 10s state sync)');
}

// Ensure enhanced activity manager has correct tracking state
function ensureTrackingStateSync() {
  if (global.enhancedActivityManager && global.isTracking !== undefined) {
    global.enhancedActivityManager.setTrackingState(global.isTracking);
    console.log(`🔄 [FIX-ACTIVITY] Synced tracking state to enhancedActivityManager: ${global.isTracking}`);
  }
}

// Cleanup function for intervals
function cleanupActivityFixIntervals() {
  if (global.activityFixIntervals) {
    global.activityFixIntervals.forEach(interval => clearInterval(interval));
    global.activityFixIntervals = [];
    console.log('🧹 [FIX-ACTIVITY] Cleaned up activity fix intervals');
  }
}

// Initialize on load
registerActivitySyncIntervals();
ensureTrackingStateSync(); // Initial sync

// Register cleanup on app exit
if (process && process.on) {
  process.on('exit', cleanupActivityFixIntervals);
  process.on('SIGINT', cleanupActivityFixIntervals);
  process.on('SIGTERM', cleanupActivityFixIntervals);
}

// Export functions for console use
if (typeof global !== 'undefined') {
  global.syncActivityData = syncActivityDataForScreenshots;
  global.forceScreenshotWithActivity = forceScreenshotWithActivity;
  
  console.log('✅ Activity fix functions loaded:');
  console.log('   📊 syncActivityData() - Sync activity data');
  console.log('   📸 forceScreenshotWithActivity() - Capture with activity');
}

module.exports = {
  syncActivityDataForScreenshots,
  forceScreenshotWithActivity,
  registerActivitySyncIntervals,
  cleanupActivityFixIntervals
};

