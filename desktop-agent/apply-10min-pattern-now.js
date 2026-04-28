#!/usr/bin/env node

/**
 * APPLY 10-MINUTE 3-SCREENSHOT PATTERN NOW
 * This script immediately applies the 10-minute pattern to your running desktop agent
 */

const { TenMinuteScreenshotScheduler } = require('./implement-10min-3screenshot-pattern.js');

async function applyPatternNow() {
  console.log('🚀 [APPLY-NOW] Applying 10-minute 3-screenshot pattern...');
  
  try {
    // Step 1: Initialize consolidated screenshots
    console.log('📸 [APPLY-NOW] Step 1: Initializing screenshot system...');
    
    const { initializeConsolidatedScreenshots } = require('./src/fixes/consolidate-screenshots');
    
    // Use realistic config for actual implementation
    const configManager = {
      getConfig: () => ({
        user_id: process.env.USER || 'current-user',
        currentTimeLogId: 'session-' + Date.now(),
        currentProjectId: 'project-' + Date.now()
      }),
      supabaseService: null // Will be set by actual app
    };
    
    const electronModules = {
      desktopCapturer: null, // Will fallback to screenshot-desktop
      systemPreferences: null,
      screen: null
    };
    
    await initializeConsolidatedScreenshots(configManager, electronModules, null);
    console.log('✅ [APPLY-NOW] Screenshot system initialized');
    
    // Step 2: Create and configure scheduler
    console.log('📸 [APPLY-NOW] Step 2: Setting up 10-minute scheduler...');
    
    const scheduler = new TenMinuteScreenshotScheduler();
    
    // Override capture method to use our system
    scheduler.captureScreenshot = async function() {
      try {
        console.log('📸 [10MIN-PATTERN] Capturing screenshot...');
        const { captureScreenshotSafe } = require('./src/fixes/consolidate-screenshots');
        const result = await captureScreenshotSafe(false);
        
        if (result) {
          console.log('✅ [10MIN-PATTERN] Screenshot captured successfully');
          return true;
        } else {
          console.log('⚠️ [10MIN-PATTERN] Screenshot capture returned false');
          return false;
        }
      } catch (error) {
        console.error('❌ [10MIN-PATTERN] Screenshot capture failed:', error.message);
        return false;
      }
    };
    
    console.log('✅ [APPLY-NOW] Scheduler configured');
    
    // Step 3: Start the pattern
    console.log('🎬 [APPLY-NOW] Step 3: Starting 10-minute pattern...');
    
    scheduler.startScheduling();
    
    console.log('🎉 [APPLY-NOW] 10-minute 3-screenshot pattern is now ACTIVE!');
    console.log('📸 Pattern: 3 random screenshots every 10 minutes with 3+ minute gaps');
    
    // Show next few windows as preview
    console.log('\n📅 Preview of next 3 windows:');
    for (let i = 0; i < 3; i++) {
      const offsets = scheduler.generateRandomOffsetsWithMinGap(
        10 * 60 * 1000, 3, 3 * 60 * 1000
      );
      console.log(`Window ${i + 1}: Screenshots at ${offsets.map(o => `${Math.round(o/60000)}m${Math.round((o%60000)/1000)}s`).join(', ')}`);
    }
    
    // Status monitoring
    console.log('\n📊 Pattern Status:');
    setInterval(() => {
      const status = scheduler.getStatus();
      console.log(`📸 [STATUS] ${status.windowProgress} | Remaining: ${status.remainingTime} | Active shots: ${status.scheduledShots}`);
    }, 60000); // Every minute
    
    // Keep running
    console.log('\n⏰ Pattern will continue running... Press Ctrl+C to stop');
    
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 [APPLY-NOW] Shutting down pattern...');
      scheduler.stopScheduling();
      process.exit(0);
    });
    
    return scheduler;
    
  } catch (error) {
    console.error('❌ [APPLY-NOW] Failed to apply pattern:', error.message);
    console.error('Stack:', error.stack);
    return null;
  }
}

// Generate console command for immediate use
function generateConsoleCommand() {
  return `
// === PASTE THIS INTO YOUR DESKTOP AGENT CONSOLE ===
// This will immediately start the 10-minute 3-screenshot pattern

async function startTenMinutePattern() {
  console.log('🚀 Starting 10-minute 3-screenshot pattern...');
  
  try {
    // Initialize consolidated screenshots
    const { initializeConsolidatedScreenshots } = require('./src/fixes/consolidate-screenshots');
    await initializeConsolidatedScreenshots(
      global.configManager || { getConfig: () => ({}) },
      { desktopCapturer: require('electron').desktopCapturer, systemPreferences: require('electron').systemPreferences },
      global.enhancedSyncManager
    );
    
    // Create scheduler class inline
    class TenMinuteScheduler {
      constructor() {
        this.windowDurationMs = 10 * 60 * 1000;
        this.shotCount = 3;
        this.minGapMs = 3 * 60 * 1000;
        this.windowTimers = [];
        this.windowEndTimer = null;
        this.isActive = false;
      }
      
      generateRandomOffsetsWithMinGap(windowDuration, shotCount, minGap) {
        const offsets = [];
        const firstOffset = Math.random() * (4 * 60 * 1000);
        offsets.push(firstOffset);
        
        const secondMin = Math.max(firstOffset + minGap, 3 * 60 * 1000);
        const secondMax = Math.min(7 * 60 * 1000, windowDuration - minGap);
        const secondOffset = secondMin + Math.random() * (secondMax - secondMin);
        offsets.push(secondOffset);
        
        const thirdMin = Math.max(secondOffset + minGap, 6 * 60 * 1000);
        const thirdMax = windowDuration;
        const thirdOffset = thirdMin + Math.random() * (thirdMax - thirdMin);
        offsets.push(thirdOffset);
        
        return offsets.sort((a, b) => a - b);
      }
      
      startScheduling() {
        if (this.isActive) this.stopScheduling();
        this.isActive = true;
        this.scheduleNextWindow();
      }
      
      scheduleNextWindow() {
        this.clearCurrentWindow();
        const offsets = this.generateRandomOffsetsWithMinGap(this.windowDurationMs, this.shotCount, this.minGapMs);
        
        console.log(\`📸 [10MIN-PATTERN] New window: shots at \${offsets.map(o => Math.round(o/60000)).join('m, ')}m\`);
        
        this.windowTimers = offsets.map((offset, i) => setTimeout(async () => {
          console.log(\`📸 [10MIN-PATTERN] Shot \${i+1}/3 at +\${Math.round(offset/60000)}min\`);
          try {
            const { captureScreenshotSafe } = require('./src/fixes/consolidate-screenshots');
            const result = await captureScreenshotSafe(false);
            console.log(\`📸 [10MIN-PATTERN] Shot \${i+1}/3 result: \${result ? '✅' : '❌'}\`);
          } catch (e) {
            console.error(\`❌ [10MIN-PATTERN] Shot \${i+1}/3 failed:\`, e.message);
          }
        }, offset));
        
        this.windowEndTimer = setTimeout(() => {
          if (this.isActive) this.scheduleNextWindow();
        }, this.windowDurationMs);
      }
      
      stopScheduling() {
        this.isActive = false;
        this.clearCurrentWindow();
      }
      
      clearCurrentWindow() {
        this.windowTimers.forEach(t => clearTimeout(t));
        this.windowTimers = [];
        if (this.windowEndTimer) clearTimeout(this.windowEndTimer);
      }
    }
    
    // Create and start scheduler
    global.tenMinuteScheduler = new TenMinuteScheduler();
    global.tenMinuteScheduler.startScheduling();
    
    console.log('🎉 10-minute 3-screenshot pattern started!');
    console.log('📸 Will take 3 screenshots every 10 minutes with 3+ minute gaps');
    
    return true;
  } catch (error) {
    console.error('❌ Pattern failed:', error.message);
    return false;
  }
}

// Start the pattern
startTenMinutePattern();
`;
}

async function main() {
  console.log('📸 APPLYING 10-MINUTE 3-SCREENSHOT PATTERN');
  console.log('==========================================');
  
  // Generate console command
  const consoleCommand = generateConsoleCommand();
  require('fs').writeFileSync('console-10min-pattern.txt', consoleCommand);
  
  console.log('📄 Console command saved to: console-10min-pattern.txt');
  console.log('\n🚨 CHOOSE YOUR APPLICATION METHOD:');
  console.log('\n1. 🔴 APPLY NOW (Background Process):');
  console.log('   This script will run the pattern in the background');
  console.log('\n2. 🟡 COPY TO CONSOLE (Recommended):');
  console.log('   Copy console-10min-pattern.txt into your desktop agent DevTools');
  console.log('\n3. 🟢 AUTO-START (5 seconds):');
  console.log('   Script will auto-start in 5 seconds...');
  
  // Countdown
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`\r⏱️  Auto-start in ${i} seconds... (Ctrl+C to cancel)`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n\n🚀 AUTO-STARTING 10-MINUTE PATTERN...');
  await applyPatternNow();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { applyPatternNow, generateConsoleCommand };


