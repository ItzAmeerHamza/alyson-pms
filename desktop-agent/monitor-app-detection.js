/**
 * Real-time app detection monitor
 * Watch the logs for 30 seconds to see what apps are detected
 */

console.log('🔍 Monitoring app detection in real-time...\n');
console.log('Instructions:');
console.log('1. This script will show detected apps as they happen');
console.log('2. SWITCH between Cursor, Edge, Chrome, etc.');
console.log('3. Watch the detected app names change\n');
console.log('═══════════════════════════════════════════════════════\n');

let detectionCount = 0;
let lastApp = null;

// Simulate what the real app does
const appDetection = require('./src/platform/windows/app-detection');

async function monitorDetection() {
  try {
    const result = await appDetection.detectActiveApp();
    detectionCount++;
    
    const appKey = `${result.appName}|${result.windowTitle}`;
    if (appKey !== lastApp) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] 🎯 APP CHANGED:`);
      console.log(`   App: ${result.appName}`);
      console.log(`   Window: ${result.windowTitle}`);
      console.log(`   Method: ${result.method}`);
      console.log(`   Is Browser: ${result.isBrowser || false}`);
      console.log();
      lastApp = appKey;
    } else {
      // Same app, just show a dot
      process.stdout.write('.');
    }
  } catch (error) {
    console.error('Detection error:', error.message);
  }
}

// Run detection every 3 seconds for 30 seconds
const interval = setInterval(monitorDetection, 3000);

setTimeout(() => {
  clearInterval(interval);
  console.log(`\n\n═══════════════════════════════════════════════════════`);
  console.log(`✅ Monitoring complete! ${detectionCount} detections`);
  console.log(`\nNow switch to a different app and run this again to verify!`);
  process.exit(0);
}, 30000);

// Initial detection
monitorDetection();









