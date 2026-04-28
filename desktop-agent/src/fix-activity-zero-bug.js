/**
 * Fix for activity showing zero (clicks, moves) on macOS
 * Root cause: Field name mismatch between activity structures
 */

function fixActivityZeroBug() {
  console.log('\n🔧 ===== FIXING ACTIVITY ZERO BUG =====\n');
  
  // Check current state
  console.log('📊 Current Activity Data:');
  
  if (global.displayActivityStats) {
    console.log('  displayActivityStats:', {
      clicks: global.displayActivityStats.clicks,
      keys: global.displayActivityStats.keys,
      moves: global.displayActivityStats.moves,
      totalClicks: global.displayActivityStats.totalClicks,
      totalKeys: global.displayActivityStats.totalKeys,
      totalMoves: global.displayActivityStats.totalMoves,
      sessionClicks: global.displayActivityStats.sessionClicks,
      sessionKeys: global.displayActivityStats.sessionKeys,
      sessionMoves: global.displayActivityStats.sessionMoves
    });
  }
  
  if (global.enhancedActivityManager?.betweenScreenshotsActivity) {
    console.log('  enhancedActivityManager.betweenScreenshotsActivity:', {
      clicks: global.enhancedActivityManager.betweenScreenshotsActivity.clicks,
      keys: global.enhancedActivityManager.betweenScreenshotsActivity.keys,
      moves: global.enhancedActivityManager.betweenScreenshotsActivity.moves
    });
  }
  
  // THE FIX: Sync the correct fields
  console.log('\n🔧 Applying fix...');
  
  if (global.displayActivityStats) {
    // Map totalClicks -> clicks, totalMoves -> moves for screenshot compatibility
    const fixed = {
      clicks: global.displayActivityStats.totalClicks || global.displayActivityStats.sessionClicks || 0,
      keys: global.displayActivityStats.totalKeys || global.displayActivityStats.sessionKeys || 0,
      moves: global.displayActivityStats.totalMoves || global.displayActivityStats.sessionMoves || 0
    };
    
    console.log('  Mapping fields:', fixed);
    
    // Update the fields that screenshots read from
    global.displayActivityStats.clicks = fixed.clicks;
    global.displayActivityStats.keys = fixed.keys;
    global.displayActivityStats.moves = fixed.moves;
    global.displayActivityStats.lastUpdate = Date.now();
    
    console.log('✅ Fixed displayActivityStats');
  }
  
  // Also ensure enhancedActivityManager has the data
  if (global.enhancedActivityManager && global.displayActivityStats) {
    if (!global.enhancedActivityManager.betweenScreenshotsActivity) {
      global.enhancedActivityManager.betweenScreenshotsActivity = {
        clicks: 0,
        keys: 0,
        moves: 0,
        lastUpdate: Date.now()
      };
    }
    
    // Sync from displayActivityStats if betweenScreenshotsActivity is empty
    if (global.enhancedActivityManager.betweenScreenshotsActivity.clicks === 0 &&
        global.enhancedActivityManager.betweenScreenshotsActivity.moves === 0) {
      global.enhancedActivityManager.betweenScreenshotsActivity.clicks = global.displayActivityStats.clicks;
      global.enhancedActivityManager.betweenScreenshotsActivity.keys = global.displayActivityStats.keys;
      global.enhancedActivityManager.betweenScreenshotsActivity.moves = global.displayActivityStats.moves;
      global.enhancedActivityManager.betweenScreenshotsActivity.lastUpdate = Date.now();
      
      console.log('✅ Synced to enhancedActivityManager.betweenScreenshotsActivity');
    }
  }
  
  // Verify the fix
  console.log('\n✅ Verification:');
  console.log('  displayActivityStats:', {
    clicks: global.displayActivityStats?.clicks,
    keys: global.displayActivityStats?.keys,
    moves: global.displayActivityStats?.moves
  });
  
  if (global.enhancedActivityManager?.betweenScreenshotsActivity) {
    console.log('  betweenScreenshotsActivity:', {
      clicks: global.enhancedActivityManager.betweenScreenshotsActivity.clicks,
      keys: global.enhancedActivityManager.betweenScreenshotsActivity.keys,
      moves: global.enhancedActivityManager.betweenScreenshotsActivity.moves
    });
  }
  
  console.log('\n🎉 Fix applied! Activity data should now display correctly.');
  console.log('   Next screenshot should show non-zero clicks and moves.\n');
}

// Auto-install the fix in the activity recording flow
function installActivityFixPatch() {
  console.log('🔧 Installing activity fix patch...');
  
  // Patch the recordEnhancedActivity function if it exists
  if (global.enhancedActivityManager && global.enhancedActivityManager.recordEnhancedActivity) {
    const originalRecord = global.enhancedActivityManager.recordEnhancedActivity.bind(global.enhancedActivityManager);
    
    global.enhancedActivityManager.recordEnhancedActivity = function(type, method, details = {}) {
      // Call original
      originalRecord(type, method, details);
      
      // CRITICAL FIX: Also update the clicks/keys/moves fields (not just totalClicks)
      if (global.displayActivityStats) {
        if (type === 'click') {
          global.displayActivityStats.clicks = global.displayActivityStats.totalClicks || global.displayActivityStats.sessionClicks || 0;
        } else if (type === 'key') {
          global.displayActivityStats.keys = global.displayActivityStats.totalKeys || global.displayActivityStats.sessionKeys || 0;
        } else if (type === 'move') {
          global.displayActivityStats.moves = global.displayActivityStats.totalMoves || global.displayActivityStats.sessionMoves || 0;
        }
      }
    };
    
    console.log('✅ Patched recordEnhancedActivity');
  }
  
  // Patch the recordActivity function in ActivityManager if it exists
  if (global.activityManager && global.activityManager.recordActivity) {
    const originalRecord = global.activityManager.recordActivity.bind(global.activityManager);
    
    global.activityManager.recordActivity = function(type, method, details = {}) {
      // Call original
      originalRecord(type, method, details);
      
      // CRITICAL FIX: Sync total fields to simple fields
      if (global.displayActivityStats) {
        global.displayActivityStats.clicks = global.displayActivityStats.totalClicks || global.displayActivityStats.sessionClicks || 0;
        global.displayActivityStats.keys = global.displayActivityStats.totalKeys || global.displayActivityStats.sessionKeys || 0;
        global.displayActivityStats.moves = global.displayActivityStats.totalMoves || global.displayActivityStats.sessionMoves || 0;
        global.displayActivityStats.lastUpdate = Date.now();
      }
    };
    
    console.log('✅ Patched recordActivity');
  }
  
  console.log('✅ Activity fix patch installed!\n');
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fixActivityZeroBug, installActivityFixPatch };
}

if (typeof global !== 'undefined') {
  global.fixActivityZeroBug = fixActivityZeroBug;
  global.installActivityFixPatch = installActivityFixPatch;
  console.log('✅ Activity fix functions loaded.');
  console.log('   Run: fixActivityZeroBug()');
  console.log('   Or:  installActivityFixPatch() (permanent fix)');
}

