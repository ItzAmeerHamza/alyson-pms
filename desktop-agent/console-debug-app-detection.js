// =============================================================================
// CONSOLE DEBUG SCRIPT FOR APP DETECTION
// =============================================================================
// 
// INSTRUCTIONS:
// 1. Open desktop agent
// 2. Press Cmd+Option+I to open Developer Tools  
// 3. Go to Console tab
// 4. Paste this entire script and press Enter
// 5. Results will show in the console
//
// =============================================================================

console.log('🔍 APP DETECTION DEBUG SCRIPT STARTING...\n');

async function debugAppDetection() {
  try {
    console.log('📡 Step 1: Checking IPC connectivity...');
    
    // Check if we can call IPC
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.ipcRenderer) {
      console.log('✅ IPC Renderer available');
      
      // Test basic IPC call
      try {
        const trackingStatus = await window.electronAPI.ipcRenderer.invoke('get-tracking-status');
        console.log('📊 Current tracking status:', trackingStatus);
        
        if (trackingStatus && trackingStatus.isTracking) {
          console.log('✅ Tracking is ACTIVE - app detection should be running');
        } else {
          console.log('⚠️ Tracking is NOT ACTIVE - this might be the issue');
        }
      } catch (error) {
        console.log('❌ Failed to get tracking status:', error.message);
      }
      
      // Test app detection IPC
      console.log('\n📡 Step 2: Testing app detection IPC...');
      try {
        const activeApp = await window.electronAPI.ipcRenderer.invoke('get-active-app');
        console.log('🔍 Active app result:', activeApp);
        
        if (activeApp && activeApp.name) {
          console.log('✅ App detection is working! Current app:', activeApp.name);
        } else {
          console.log('❌ App detection returned null/empty');
        }
      } catch (error) {
        console.log('❌ App detection IPC failed:', error.message);
      }
      
      // Check for app-detected event listeners
      console.log('\n📡 Step 3: Testing app-detected events...');
      
      // Add a temporary listener
      let eventReceived = false;
      const tempListener = (event, data) => {
        console.log('📱 [TEST] app-detected event received:', data);
        eventReceived = true;
      };
      
      window.electronAPI.ipcRenderer.on('app-detected', tempListener);
      
      // Wait a few seconds to see if events come through
      console.log('⏳ Waiting 5 seconds for app-detected events...');
      
      setTimeout(() => {
        window.electronAPI.ipcRenderer.removeListener('app-detected', tempListener);
        
        if (eventReceived) {
          console.log('✅ app-detected events are being received!');
        } else {
          console.log('❌ No app-detected events received in 5 seconds');
          console.log('💡 This suggests app detection is not running or not emitting events');
        }
        
        // Final analysis
        console.log('\n🔍 ANALYSIS:');
        console.log('If tracking is active but no app-detected events:');
        console.log('1. App detection may not be starting with tracking');
        console.log('2. App detection may be failing silently');
        console.log('3. Check main process console for errors');
        console.log('4. Try switching apps during testing');
        
      }, 5000);
      
    } else {
      console.log('❌ IPC Renderer not available - not running in Electron renderer');
    }
    
  } catch (error) {
    console.error('❌ Debug script failed:', error);
  }
}

// Also provide manual trigger functions
window.debugAppDetection = debugAppDetection;

window.manualAppTest = async function() {
  try {
    const result = await window.electronAPI.ipcRenderer.invoke('get-active-app');
    console.log('🔍 Manual app detection test result:', result);
    return result;
  } catch (error) {
    console.error('❌ Manual test failed:', error);
    return null;
  }
};

// Run the debug automatically
debugAppDetection();

console.log('\n💡 Additional functions available:');
console.log('- debugAppDetection() - Run full debug again');
console.log('- manualAppTest() - Test app detection manually');
