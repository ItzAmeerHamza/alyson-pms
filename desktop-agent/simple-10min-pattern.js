/**
 * SIMPLE 10-MINUTE 3-SCREENSHOT PATTERN
 * Copy this ENTIRE code and paste into your desktop agent DevTools console
 */

async function start10MinutePattern() {
  console.log('🚀 Starting 10-minute 3-screenshot pattern...');
  
  try {
    // Step 1: Initialize screenshot system
    console.log('📸 Step 1: Initializing screenshot system...');
    
    const { initializeConsolidatedScreenshots } = require('./src/fixes/consolidate-screenshots');
    await initializeConsolidatedScreenshots(
      global.configManager || { getConfig: () => ({}) },
      { 
        desktopCapturer: require('electron').desktopCapturer, 
        systemPreferences: require('electron').systemPreferences,
        screen: require('electron').screen
      },
      global.enhancedSyncManager
    );
    
    console.log('✅ Screenshot system ready');
    
    // Step 2: Create pattern scheduler
    console.log('📸 Step 2: Creating 10-minute pattern...');
    
    global.tenMinutePattern = {
      active: false,
      timers: [],
      windowTimer: null,
      
      // Generate 3 random times within 10 minutes with 3+ minute gaps
      generateTimes() {
        const times = [];
        
        // First screenshot: 0-4 minutes
        times.push(Math.random() * 4 * 60 * 1000);
        
        // Second screenshot: first + 3 to 7 minutes  
        const secondMin = Math.max(times[0] + 3 * 60 * 1000, 3 * 60 * 1000);
        const secondMax = 7 * 60 * 1000;
        times.push(secondMin + Math.random() * (secondMax - secondMin));
        
        // Third screenshot: second + 3 to 10 minutes
        const thirdMin = Math.max(times[1] + 3 * 60 * 1000, 6 * 60 * 1000);
        const thirdMax = 10 * 60 * 1000;
        times.push(thirdMin + Math.random() * (thirdMax - thirdMin));
        
        return times.sort((a, b) => a - b);
      },
      
      // Start new 10-minute window
      scheduleWindow() {
        this.clearTimers();
        
        const times = this.generateTimes();
        console.log(`📸 [10MIN] New window: ${times.map(t => Math.round(t/60000)).join('m, ')}m`);
        
        // Schedule 3 screenshots
        this.timers = times.map((time, i) => {
          return setTimeout(async () => {
            console.log(`📸 [10MIN] Shot ${i+1}/3 at +${Math.round(time/60000)}min`);
            
            try {
              const { captureScreenshotSafe } = require('./src/fixes/consolidate-screenshots');
              const result = await captureScreenshotSafe(false);
              console.log(`📸 [10MIN] Shot ${i+1}/3: ${result ? '✅ Success' : '❌ Failed'}`);
            } catch (error) {
              console.error(`❌ [10MIN] Shot ${i+1}/3 error:`, error.message);
            }
          }, time);
        });
        
        // Schedule next window in 10 minutes
        this.windowTimer = setTimeout(() => {
          if (this.active) {
            console.log('🔄 [10MIN] Starting next window...');
            this.scheduleWindow();
          }
        }, 10 * 60 * 1000);
      },
      
      // Start the pattern
      start() {
        if (this.active) {
          console.log('⚠️ [10MIN] Pattern already running');
          return;
        }
        
        this.active = true;
        console.log('✅ [10MIN] Starting 10-minute 3-screenshot pattern');
        this.scheduleWindow();
      },
      
      // Stop the pattern
      stop() {
        this.active = false;
        this.clearTimers();
        console.log('🛑 [10MIN] Pattern stopped');
      },
      
      // Clear all timers
      clearTimers() {
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers = [];
        if (this.windowTimer) {
          clearTimeout(this.windowTimer);
          this.windowTimer = null;
        }
      },
      
      // Get status
      status() {
        return {
          active: this.active,
          scheduledShots: this.timers.length,
          message: this.active ? '📸 Pattern running - 3 shots every 10 minutes' : '⏹️ Pattern stopped'
        };
      }
    };
    
    // Step 3: Start the pattern
    console.log('🎬 Step 3: Starting pattern...');
    global.tenMinutePattern.start();
    
    console.log('🎉 SUCCESS! 10-minute 3-screenshot pattern is now active!');
    console.log('📸 Pattern: 3 random screenshots every 10 minutes with 3+ minute gaps');
    console.log('');
    console.log('🔧 To control the pattern:');
    console.log('  - Check status: global.tenMinutePattern.status()');
    console.log('  - Stop pattern: global.tenMinutePattern.stop()');
    console.log('  - Restart pattern: global.tenMinutePattern.start()');
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to start 10-minute pattern:', error.message);
    console.error('💡 Make sure your desktop agent is running and tracking is active');
    return false;
  }
}

// Auto-start the pattern
console.log('📸 APPLYING 10-MINUTE 3-SCREENSHOT PATTERN...');
start10MinutePattern();


