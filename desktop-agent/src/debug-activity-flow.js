/**
 * Debug Activity Flow
 * Test function to verify activity tracking is working correctly
 */

function debugActivityFlow() {
  console.log('\n🔍 === ACTIVITY FLOW DEBUG === 🔍');
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  
  // Check global tracking state
  console.log('\n📊 TRACKING STATE:');
  console.log(`   global.isTracking: ${global.isTracking}`);
  console.log(`   global.isPaused: ${global.isPaused}`);
  console.log(`   global.currentTimeLogId: ${global.currentTimeLogId}`);
  console.log(`   global.currentProjectId: ${global.currentProjectId}`);
  
  // Check enhanced activity manager
  console.log('\n🎯 ENHANCED ACTIVITY MANAGER:');
  if (global.enhancedActivityManager) {
    console.log(`   exists: ✅`);
    console.log(`   isTracking: ${global.enhancedActivityManager.isTracking}`);
    console.log(`   betweenScreenshotsActivity:`, global.enhancedActivityManager.betweenScreenshotsActivity);
  } else {
    console.log(`   exists: ❌`);
  }
  
  // Check unified input manager
  console.log('\n⌨️ UNIFIED INPUT MANAGER:');
  if (global.globalInputManager) {
    console.log(`   exists: ✅`);
    const stats = global.globalInputManager.getStats ? global.globalInputManager.getStats() : global.globalInputManager.stats;
    console.log(`   stats:`, stats);
    console.log(`   isActive: ${global.globalInputManager.isActive}`);
  } else {
    console.log(`   exists: ❌`);
  }
  
  // Check various activity sources
  console.log('\n📈 ACTIVITY SOURCES:');
  console.log('1. global.betweenScreenshotsActivity:', global.betweenScreenshotsActivity);
  console.log('2. global.displayActivityStats:', global.displayActivityStats);
  console.log('3. global.activityStats:', global.activityStats);
  console.log('4. global.periodActivityStats:', global.periodActivityStats);
  
  // Test sync activity data
  console.log('\n🔄 TESTING SYNC ACTIVITY DATA...');
  if (global.syncActivityData) {
    const syncedData = global.syncActivityData();
    console.log('   Synced data:', syncedData);
  } else {
    console.log('   syncActivityData function not available ❌');
  }
  
  // Test screenshot manager
  console.log('\n📸 SCREENSHOT MANAGER:');
  if (global.screenshotManager) {
    console.log(`   exists: ✅`);
    console.log(`   dormantMode: ${global.screenshotManager.dormantMode}`);
    const activityData = global.screenshotManager.getCurrentActivityData();
    console.log(`   getCurrentActivityData():`, activityData);
  } else {
    console.log(`   exists: ❌`);
  }
  
  console.log('\n✅ === DEBUG COMPLETE === ✅\n');
}

// Function to simulate activity and test flow
function simulateActivityAndTest() {
  console.log('\n🎮 === SIMULATING ACTIVITY === 🎮');
  
  // Simulate some input events
  if (global.globalInputManager) {
    console.log('📍 Simulating 10 clicks, 50 keys, 100 moves...');
    
    // Directly update stats to simulate activity
    if (global.globalInputManager.stats) {
      global.globalInputManager.stats.mouseClicks = (global.globalInputManager.stats.mouseClicks || 0) + 10;
      global.globalInputManager.stats.keystrokes = (global.globalInputManager.stats.keystrokes || 0) + 50;
      global.globalInputManager.stats.mouseMovements = (global.globalInputManager.stats.mouseMovements || 0) + 100;
      global.globalInputManager.stats.lastActivity = Date.now();
    }
    
    console.log('✅ Activity simulated!');
  } else {
    console.log('❌ Cannot simulate - globalInputManager not available');
  }
  
  // Run debug flow after simulation
  setTimeout(() => {
    console.log('\n📊 Checking activity after simulation...');
    debugActivityFlow();
  }, 1000);
}

// Export functions for console use
if (typeof global !== 'undefined') {
  global.debugActivityFlow = debugActivityFlow;
  global.simulateActivityAndTest = simulateActivityAndTest;
  
  console.log('✅ Debug functions loaded:');
  console.log('   🔍 debugActivityFlow() - Debug current activity state');
  console.log('   🎮 simulateActivityAndTest() - Simulate activity and test');
}

module.exports = {
  debugActivityFlow,
  simulateActivityAndTest
};
