#!/usr/bin/env node

/**
 * Force show window script - sends IPC command to running TimeFlow app
 */

const { exec } = require('child_process');

// Function to send IPC command to show window
function forceShowWindow() {
  console.log('🔧 [FORCE-SHOW] Sending show-window command to running TimeFlow app...');
  
  // Try to send IPC command to the running app
  const script = `
    tell application "System Events"
      tell application process "Electron"
        -- Try to show any hidden windows
        try
          set frontmost to true
          if (count of windows) > 0 then
            set visible of window 1 to true
            set frontmost of window 1 to true
          end if
        end try
      end tell
    end tell
  `;
  
  exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ [FORCE-SHOW] AppleScript failed:', error.message);
      
      // Fallback: Try to restart the app with window forced
      console.log('🔄 [FORCE-SHOW] Attempting app restart with forced window...');
      
      // Kill and restart
      exec('pkill -f "Electron"', (killError) => {
        if (killError) {
          console.error('❌ [FORCE-SHOW] Failed to kill app:', killError.message);
          return;
        }
        
        console.log('✅ [FORCE-SHOW] App killed, restarting with forced window...');
        
        setTimeout(() => {
          exec('cd /Users/mohammedabdulfattah/time-flow-admin/desktop-agent && FORCE_SHOW_WINDOW=true npm run start', (startError) => {
            if (startError) {
              console.error('❌ [FORCE-SHOW] Failed to restart app:', startError.message);
            } else {
              console.log('✅ [FORCE-SHOW] App restarted with forced window');
            }
          });
        }, 2000);
      });
      
    } else {
      console.log('✅ [FORCE-SHOW] AppleScript executed successfully');
      if (stdout) console.log('📄 [FORCE-SHOW] Output:', stdout);
    }
  });
}

// Run if called directly
if (require.main === module) {
  forceShowWindow();
}

module.exports = { forceShowWindow };
