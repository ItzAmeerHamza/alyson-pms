#!/usr/bin/env node

/**
 * Fix script for screenshot capture issues on macOS
 * This script diagnoses and fixes common screenshot capture problems
 */

async function fixScreenshotCapture() {
  console.log('\n🔧 ===== SCREENSHOT CAPTURE FIX =====\n');
  
  // Step 1: Verify Enhanced Screenshot Manager exists
  if (!global.enhancedScreenshotManager) {
    console.log('❌ Enhanced Screenshot Manager not found!');
    console.log('💡 This usually means the app is not fully initialized.');
    console.log('   Please restart the desktop agent.');
    return;
  }
  
  const manager = global.enhancedScreenshotManager;
  console.log('✅ Enhanced Screenshot Manager found');
  
  // Step 2: Check tracking state
  console.log('\n📊 Checking tracking state...');
  if (!manager.isTracking) {
    console.log('⚠️ Tracking is not active');
    console.log('💡 Please start tracking from the dashboard first');
    return;
  }
  console.log('✅ Tracking is active');
  
  if (!manager.currentSession) {
    console.log('⚠️ No active session');
    console.log('💡 Session may not have been created properly');
    return;
  }
  console.log('✅ Active session:', manager.currentSession.id);
  
  // Step 3: Check permissions (macOS only)
  if (process.platform === 'darwin') {
    console.log('\n🔒 Checking macOS permissions...');
    try {
      if (manager.hasScreenRecordingPermission) {
        const hasPerm = manager.hasScreenRecordingPermission();
        if (!hasPerm) {
          console.log('❌ Screen Recording permission DENIED!');
          console.log('💡 Fix:');
          console.log('   1. Open System Settings');
          console.log('   2. Go to Privacy & Security → Screen Recording');
          console.log('   3. Enable the desktop agent app');
          console.log('   4. Restart the app');
          return;
        }
        console.log('✅ Screen Recording permission granted');
      }
    } catch (e) {
      console.log('⚠️ Could not check permissions:', e.message);
    }
  }
  
  // Step 4: Check rate limiter
  console.log('\n⏱️ Checking rate limiter...');
  if (manager._rateLimiter) {
    const limiter = manager._rateLimiter;
    console.log('   Current window start:', limiter.windowStart ? new Date(limiter.windowStart).toLocaleTimeString() : 'none');
    console.log('   Shots this window:', limiter.shotsThisWindow || 0, '/ 3');
    console.log('   Last shot time:', limiter.lastShotTime ? new Date(limiter.lastShotTime).toLocaleTimeString() : 'none');
    
    // Check if we're blocked by rate limiter
    if (limiter.shotsThisWindow >= 3) {
      const windowElapsed = Date.now() - (limiter.windowStart || 0);
      if (windowElapsed < (10 * 60 * 1000)) {
        console.log('⚠️ Rate limiter: 3 screenshots already taken in this 10-minute window');
        console.log('   Next window starts in:', Math.ceil((10 * 60 * 1000 - windowElapsed) / 1000), 'seconds');
      }
    }
  } else {
    console.log('⚠️ Rate limiter not initialized');
  }
  
  // Step 5: Check window scheduling
  console.log('\n⏰ Checking window scheduling...');
  console.log('   Backbone interval active:', !!manager._windowInterval);
  console.log('   Window start time:', manager.windowStartTime ? new Date(manager.windowStartTime).toLocaleTimeString() : 'none');
  console.log('   Active window timers:', manager.windowTimers?.length || 0);
  console.log('   Next screenshot time:', manager.nextScreenshotTime ? new Date(manager.nextScreenshotTime).toLocaleTimeString() : 'none');
  
  // Step 6: Identify and fix issues
  console.log('\n🔍 Diagnosing issues...');
  
  let needsFix = false;
  
  // Check if window scheduling is supposed to be active but has no timers
  if (manager._windowInterval && (!manager.windowTimers || manager.windowTimers.length === 0)) {
    console.log('❌ Issue: Backbone active but no shot timers scheduled!');
    needsFix = true;
  }
  
  // Check if window scheduling is not active at all
  if (!manager._windowInterval) {
    console.log('❌ Issue: Backbone interval is not active!');
    needsFix = true;
  }
  
  if (!needsFix) {
    console.log('✅ No issues detected with scheduling system');
    console.log('\n💡 Screenshots should be captured automatically.');
    console.log('   Expected pattern: 3 screenshots per 10 minutes, minimum 3-minute gap between shots');
    
    // Check when the next screenshot is scheduled
    if (manager.nextScreenshotTime) {
      const timeUntilNext = manager.nextScreenshotTime.getTime() - Date.now();
      if (timeUntilNext > 0) {
        console.log(`\n⏰ Next screenshot scheduled in ${Math.ceil(timeUntilNext / 1000)} seconds`);
        console.log(`   at ${manager.nextScreenshotTime.toLocaleTimeString()}`);
      } else {
        console.log('⚠️ Next screenshot time is in the past!');
        needsFix = true;
      }
    }
  }
  
  // Step 7: Apply fixes if needed
  if (needsFix) {
    console.log('\n🔧 Applying fixes...');
    
    try {
      // Clear any existing scheduling
      console.log('   1. Clearing existing timers...');
      manager.stopScreenshotCapture();
      
      // Restart screenshot capture
      console.log('   2. Restarting screenshot capture system...');
      manager.startScreenshotCapture();
      
      console.log('✅ Screenshot capture system restarted!');
      
      // Verify timers are now active
      setTimeout(() => {
        console.log('\n✅ Verification:');
        console.log('   Backbone interval active:', !!manager._windowInterval);
        console.log('   Active window timers:', manager.windowTimers?.length || 0);
        console.log('   Next screenshot:', manager.nextScreenshotTime ? new Date(manager.nextScreenshotTime).toLocaleTimeString() : 'none');

        if (manager.windowTimers?.length > 0 || manager._windowInterval) {
          console.log('\n🎉 Success! Screenshot capture is now working.');
          console.log('   You should see 3 screenshots in the next 10 minutes.');
        } else {
          console.log('\n⚠️ Timers still not active after restart.');
          console.log('💡 Try running a manual capture to test:');
          console.log('   global.enhancedScreenshotManager.requestScreenshot("manual-test")');
        }
      }, 2000);
      
    } catch (error) {
      console.log('❌ Error applying fixes:', error.message);
      console.log('\n💡 Manual recovery:');
      console.log('   1. Stop tracking');
      console.log('   2. Restart the desktop agent');
      console.log('   3. Start tracking again');
    }
  }
  
  // Step 8: Test with a manual capture
  console.log('\n🧪 Testing manual screenshot capture...');
  try {
    const result = await manager.requestScreenshot('diagnostics-test');
    if (result?.ok) {
      console.log('✅ Manual screenshot capture successful!');
      console.log('   Screenshot was taken and should be uploaded to the server.');
    } else if (result?.skipped) {
      console.log('⚠️ Screenshot was skipped:', result.reason);
      if (result.reason === 'rate-limited') {
        console.log('   This is expected if 3 screenshots were already taken in the last 10 minutes.');
        console.log('   Shots this window:', manager._rateLimiter?.shotsThisWindow || 0, '/ 3');
      }
    } else {
      console.log('⚠️ Manual screenshot capture failed');
      console.log('   Result:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('❌ Error testing screenshot:', error.message);
  }
  
  console.log('\n========================================\n');
}

// Export for use in both Node and Electron console
if (typeof module !== 'undefined' && module.exports) {
  module.exports = fixScreenshotCapture;
}

// Auto-run if executed directly or pasted in console
if (typeof global !== 'undefined') {
  global.fixScreenshotCapture = fixScreenshotCapture;
  console.log('✅ Fix function loaded. Run: fixScreenshotCapture()');
}

// If running as a script (not imported)
if (require.main === module) {
  fixScreenshotCapture().catch(console.error);
}

