#!/usr/bin/env node

const { exec } = require('child_process');
const { BrowserWindow } = require('electron');

/**
 * Force show TimeFlow window - Emergency window recovery script
 */
function forceShowTimeFlowWindow() {
  console.log('🔧 [FORCE-SHOW] Attempting to force TimeFlow window to show...');
  
  // Get all BrowserWindow instances
  const windows = BrowserWindow.getAllWindows();
  
  if (windows.length === 0) {
    console.log('❌ [FORCE-SHOW] No Electron windows found');
    return;
  }
  
  console.log(`🪟 [FORCE-SHOW] Found ${windows.length} windows`);
  
  windows.forEach((window, index) => {
    if (window && !window.isDestroyed()) {
      console.log(`🔧 [FORCE-SHOW] Processing window ${index + 1}:`);
      console.log(`  - Title: ${window.getTitle()}`);
      console.log(`  - Visible: ${window.isVisible()}`);
      console.log(`  - Minimized: ${window.isMinimized()}`);
      
      // Force show each window
      try {
        window.show();
        window.focus();
        window.center();
        window.setAlwaysOnTop(true);
        setTimeout(() => window.setAlwaysOnTop(false), 1000);
        
        console.log(`✅ [FORCE-SHOW] Window ${index + 1} forced to show`);
      } catch (error) {
        console.error(`❌ [FORCE-SHOW] Failed to show window ${index + 1}:`, error.message);
      }
    }
  });
}

// Run the force show function
if (require.main === module) {
  forceShowTimeFlowWindow();
}

module.exports = { forceShowTimeFlowWindow };
