/**
 * Inject Screenshot Fix into Running App
 * Run this script to force an immediate screenshot and update timing
 */

console.log('💉 Injecting screenshot fix into running app...');

// Load the force screenshot module
require('./src/force-screenshot.js');

// Wait a moment for the functions to register
setTimeout(() => {
  console.log('\n📸 === SCREENSHOT CONTROL READY ===');
  console.log('Available functions:');
  console.log('  1. forceScreenshot() - Capture screenshot immediately');
  console.log('  2. updateScreenshotTiming() - Set to 3 per 10 min with 3 min gap');
  console.log('\n🎯 Forcing immediate screenshot in 2 seconds...');
  
  // Force immediate screenshot
  setTimeout(async () => {
    if (global.forceScreenshot) {
      await global.forceScreenshot();
      
      console.log('\n⚙️ Updating screenshot timing to 3 per 10 minutes...');
      if (global.updateScreenshotTiming) {
        global.updateScreenshotTiming();
      }
    } else {
      console.error('❌ Screenshot functions not loaded!');
    }
  }, 2000);
}, 1000);

