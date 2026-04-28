#!/usr/bin/env node

/**
 * SAFE APP STARTUP SCRIPT
 * 
 * Starts the desktop agent with proper error handling to prevent EPIPE crashes
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 STARTING DESKTOP AGENT WITH SAFE ERROR HANDLING');
console.log('================================================');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  if (error.code === 'EPIPE') {
    console.log('⚠️  EPIPE error caught and ignored');
    return;
  }
  console.error('💥 Uncaught exception:', error);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
});

// Handle EPIPE errors on stdout/stderr
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    console.log('⚠️  stdout EPIPE error ignored');
    return;
  }
  console.error('stdout error:', err);
});

process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') {
    console.log('⚠️  stderr EPIPE error ignored');
    return;
  }
  console.error('stderr error:', err);
});

// Start the electron app
function startApp() {
  console.log('🔧 Starting Electron app...');
  
  const electronPath = path.join(__dirname, 'node_modules', '.bin', 'electron');
  const appPath = '.';
  
  const electronProcess = spawn(electronPath, [appPath], {
    stdio: ['inherit', 'pipe', 'pipe'], // Use pipes instead of inherit to control output
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '0', // Disable excessive logging
      DEBUG_APP: '0', // Disable debug mode
      VERBOSE_LOGS: '0' // Disable verbose logs
    }
  });
  
  // Handle stdout with throttling
  let lastLogTime = 0;
  const LOG_THROTTLE = 1000; // 1 second throttle
  
  electronProcess.stdout.on('data', (data) => {
    const now = Date.now();
    if (now - lastLogTime > LOG_THROTTLE) {
      const message = data.toString().trim();
      if (message && !message.includes('move recorded')) {
        console.log('📱 App:', message);
        lastLogTime = now;
      }
    }
  });
  
  electronProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message && !message.includes('EPIPE')) {
      console.error('⚠️  App warning:', message);
    }
  });
  
  electronProcess.on('error', (error) => {
    if (error.code === 'EPIPE') {
      console.log('⚠️  Process EPIPE error ignored');
      return;
    }
    console.error('💥 Process error:', error);
  });
  
  electronProcess.on('close', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      console.log('✅ App closed gracefully');
    } else {
      console.log(`📱 App exited with code ${code}, signal ${signal}`);
      if (code !== 0 && code !== null) {
        console.log('🔄 App crashed, consider restarting...');
      }
    }
  });
  
  // Handle app startup
  setTimeout(() => {
    console.log('⏱️  App should be starting...');
    console.log('👀 Check for:');
    console.log('   - Electron window');
    console.log('   - System tray icon'); 
    console.log('   - Menu bar items');
    console.log('\n💡 If you see permission dialogs, approve them!');
  }, 3000);
  
  return electronProcess;
}

// Start the app
console.log('🎬 Initializing safe startup...');
const appProcess = startApp();

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (appProcess) {
    appProcess.kill('SIGTERM');
  }
  setTimeout(() => {
    process.exit(0);
  }, 2000);
});

console.log('✅ Safe startup script running');
console.log('📊 PID:', process.pid);
console.log('🔄 Press Ctrl+C to stop');
