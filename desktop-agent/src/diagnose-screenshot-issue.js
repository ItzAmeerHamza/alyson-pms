#!/usr/bin/env node

/**
 * Diagnostic script for screenshot capture issues on macOS
 * Usage: Run this in the desktop agent console or via node
 */

function diagnoseScreenshotIssue() {
  console.log('\n🔍 ===== SCREENSHOT DIAGNOSTIC REPORT =====\n');
  
  // Check if enhanced screenshot manager exists
  console.log('1️⃣ Enhanced Screenshot Manager Status:');
  if (global.enhancedScreenshotManager) {
    const manager = global.enhancedScreenshotManager;
    console.log('✅ Enhanced Screenshot Manager exists');
    console.log('   - Tracking:', manager.isTracking);
    console.log('   - Has Session:', !!manager.currentSession);
    console.log('   - Session ID:', manager.currentSession?.id || 'none');
    console.log('   - Backbone Interval Active:', !!manager._windowInterval);
    console.log('   - Window Start Time:', manager.windowStartTime ? new Date(manager.windowStartTime).toLocaleTimeString() : 'none');
    console.log('   - Active Window Timers:', manager.windowTimers?.length || 0);
    console.log('   - Next Screenshot Time:', manager.nextScreenshotTime ? new Date(manager.nextScreenshotTime).toLocaleTimeString() : 'none');
    console.log('   - Screenshots Paused:', manager.screenshotsPaused);
  } else {
    console.log('❌ Enhanced Screenshot Manager NOT FOUND');
  }
  
  console.log('\n2️⃣ Global Screenshot State:');
  console.log('   - Last Screenshot Time:', global.lastScreenshotTime ? new Date(global.lastScreenshotTime).toLocaleTimeString() : 'none');
  console.log('   - Time Since Last:', global.lastScreenshotTime ? Math.round((Date.now() - global.lastScreenshotTime) / 1000) + 's' : 'N/A');
  console.log('   - Next Screenshot Time:', global.nextScreenshotTime ? new Date(global.nextScreenshotTime).toLocaleTimeString() : 'none');
  
  console.log('\n3️⃣ Rate Limiter Status:');
  if (global.enhancedScreenshotManager?._rateLimiter) {
    const limiter = global.enhancedScreenshotManager._rateLimiter;
    console.log('✅ Rate limiter exists');
    console.log('   - Max per Window:', limiter.maxInWindow || 3);
    console.log('   - Window Duration:', (limiter.windowMs || 600000) / 1000 + 's');
    console.log('   - Min Gap:', (limiter.minGapMs || 180000) / 1000 + 's');
    console.log('   - Window Start:', limiter.windowStart ? new Date(limiter.windowStart).toLocaleTimeString() : 'none');
    console.log('   - Shots This Window:', limiter.shotsThisWindow || 0);
    console.log('   - Last Shot Time:', limiter.lastShotTime ? new Date(limiter.lastShotTime).toLocaleTimeString() : 'none');
  } else {
    console.log('⚠️ Rate limiter not found');
  }
  
  console.log('\n4️⃣ App Settings:');
  const settings = global.appSettings || global.configManager?.appSettings || {};
  console.log('   - Screenshot Interval:', settings.screenshot_interval_seconds || 'not set');
  console.log('   - Idle Threshold:', settings.idle_threshold_seconds || 'not set');
  console.log('   - Track URLs:', settings.track_urls !== false);
  console.log('   - Track Apps:', settings.track_applications !== false);
  
  console.log('\n5️⃣ Platform & Permissions:');
  console.log('   - Platform:', process.platform);
  if (process.platform === 'darwin') {
    try {
      if (global.enhancedScreenshotManager?.hasScreenRecordingPermission) {
        const hasPerm = global.enhancedScreenshotManager.hasScreenRecordingPermission();
        console.log('   - Screen Recording Permission:', hasPerm ? '✅ Granted' : '❌ DENIED');
      } else {
        console.log('   - Screen Recording Permission: ⚠️ Cannot check');
      }
    } catch (e) {
      console.log('   - Screen Recording Permission Error:', e.message);
    }
  }
  
  console.log('\n6️⃣ Session & Tracking:');
  if (global.trackingManager) {
    console.log('✅ Tracking manager exists');
    console.log('   - Is Tracking:', global.trackingManager.isTracking);
    console.log('   - Current Session:', global.trackingManager.currentSession?.id || 'none');
    console.log('   - Current Project:', global.trackingManager.currentProject?.name || 'none');
  } else {
    console.log('❌ Tracking manager NOT FOUND');
  }
  
  console.log('\n7️⃣ Recent Activity:');
  if (global.enhancedActivityManager?.activityStats) {
    const stats = global.enhancedActivityManager.activityStats;
    console.log('   - Clicks:', stats.clicks || 0);
    console.log('   - Keys:', stats.keys || 0);
    console.log('   - Mouse Moves:', stats.moves || 0);
    console.log('   - Last Activity:', stats.lastActivityTime ? new Date(stats.lastActivityTime).toLocaleTimeString() : 'none');
  } else {
    console.log('   - Activity stats not available');
  }
  
  console.log('\n8️⃣ Diagnostic Recommendations:');
  
  const issues = [];
  const fixes = [];
  
  if (!global.enhancedScreenshotManager) {
    issues.push('Enhanced Screenshot Manager not initialized');
    fixes.push('Restart the desktop agent');
  }
  
  if (global.enhancedScreenshotManager && !global.enhancedScreenshotManager.isTracking) {
    issues.push('Tracking is not active');
    fixes.push('Start tracking from the dashboard');
  }
  
  if (global.enhancedScreenshotManager && !global.enhancedScreenshotManager.currentSession) {
    issues.push('No active session');
    fixes.push('Create a new tracking session');
  }
  
  if (global.enhancedScreenshotManager && !global.enhancedScreenshotManager._windowInterval) {
    issues.push('Backbone interval is not active');
    fixes.push('Run: global.enhancedScreenshotManager.startScreenshotCapture()');
  }

  if (global.enhancedScreenshotManager?.windowTimers?.length === 0 && !global.enhancedScreenshotManager?._windowInterval) {
    issues.push('No screenshot timers scheduled');
    fixes.push('Run: global.enhancedScreenshotManager.forceScreenshotTimerRecovery()');
  }
  
  if (process.platform === 'darwin') {
    try {
      if (global.enhancedScreenshotManager?.hasScreenRecordingPermission) {
        const hasPerm = global.enhancedScreenshotManager.hasScreenRecordingPermission();
        if (!hasPerm) {
          issues.push('Screen Recording permission denied');
          fixes.push('Go to System Settings → Privacy & Security → Screen Recording');
          fixes.push('Enable the desktop agent app and restart');
        }
      }
    } catch (e) {
      // Ignore permission check errors
    }
  }
  
  if (issues.length === 0) {
    console.log('✅ No obvious issues detected');
    console.log('\nIf screenshots are still not capturing properly:');
    console.log('1. Check the console logs for errors');
    console.log('2. Verify network connectivity to Supabase');
    console.log('3. Check if screenshot storage bucket is accessible');
    console.log('4. Try: global.enhancedScreenshotManager.requestScreenshot("manual-test")');
  } else {
    console.log('⚠️ Issues Found:');
    issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
    console.log('\n💡 Suggested Fixes:');
    fixes.forEach((fix, i) => console.log(`   ${i + 1}. ${fix}`));
  }
  
  console.log('\n🔧 Quick Fix Commands:');
  console.log('   Force immediate screenshot:');
  console.log('   > global.enhancedScreenshotManager.requestScreenshot("manual-force")');
  console.log('');
  console.log('   Restart screenshot scheduling:');
  console.log('   > global.enhancedScreenshotManager.startScreenshotCapture()');
  console.log('');
  console.log('   Force timer recovery:');
  console.log('   > global.enhancedScreenshotManager.forceScreenshotTimerRecovery()');
  console.log('');
  console.log('   Check rate limiter status:');
  console.log('   > global.enhancedScreenshotManager._rateLimiter?.getStatus()');
  
  console.log('\n========================================\n');
}

// Export for use in both Node and Electron console
if (typeof module !== 'undefined' && module.exports) {
  module.exports = diagnoseScreenshotIssue;
}

// Auto-run if executed directly or pasted in console
if (typeof global !== 'undefined') {
  global.diagnoseScreenshotIssue = diagnoseScreenshotIssue;
  console.log('✅ Diagnostic function loaded. Run: diagnoseScreenshotIssue()');
}

// If running as a script (not imported)
if (require.main === module) {
  diagnoseScreenshotIssue();
}

