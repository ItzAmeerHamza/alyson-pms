#!/usr/bin/env node

/**
 * Force Show Main Window Script
 * Sends IPC command to running TimeFlow desktop agent to show the main window
 */

const { exec } = require('child_process');

console.log('🔧 [FORCE-SHOW] Attempting to force TimeFlow main window to show...');

// Function to send IPC command to show window
function forceShowMainWindow() {
  console.log('🔧 [FORCE-SHOW] Sending show-window command to running TimeFlow app...');
  
  // Try to send IPC command to show window
  try {
    // Use AppleScript to send keystroke to Electron app
    const appleScript = `
      tell application "System Events"
        tell process "Electron"
          set frontmost to true
          key code 31 using {command down, shift down}
        end tell
      end tell
    `;
    
    exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
      if (error) {
        console.log('⚠️ [FORCE-SHOW] AppleScript failed, trying alternative method...');
        // Alternative: try to focus the app
        exec('open -a "Electron"', (openError) => {
          if (openError) {
            console.log('❌ [FORCE-SHOW] Could not open Electron app');
          } else {
            console.log('✅ [FORCE-SHOW] Electron app opened');
          }
        });
      } else {
        console.log('✅ [FORCE-SHOW] AppleScript executed successfully');
      }
    });
  } catch (error) {
    console.error('❌ [FORCE-SHOW] Error:', error.message);
  }
}

// Execute the function
forceShowMainWindow();

module.exports = { forceShowMainWindow };


