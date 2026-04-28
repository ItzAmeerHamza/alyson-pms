#!/usr/bin/env node

/**
 * IMPLEMENT 10-MINUTE 3-SCREENSHOT PATTERN
 * 
 * Pattern: 3 random screenshots within 10 minutes, with at least 3-minute gaps
 * Example: Screenshot at 2min, 6min, 9min within each 10-minute window
 */

const path = require('path');

class TenMinuteScreenshotScheduler {
  constructor() {
    this.windowDurationMs = 10 * 60 * 1000; // 10 minutes
    this.shotCount = 3; // 3 screenshots per window
    this.minGapMs = 3 * 60 * 1000; // 3 minutes minimum gap
    
    this.windowTimers = [];
    this.windowEndTimer = null;
    this.currentWindowStart = null;
    this.isActive = false;
  }

  /**
   * Generate 3 random offsets within 10 minutes with minimum 3-minute gaps
   */
  generateRandomOffsetsWithMinGap(windowDuration, shotCount, minGap) {
    const offsets = [];
    const maxOffset = windowDuration - minGap; // Leave room for the gap
    
    // Generate first offset (0 to 4 minutes)
    const firstOffset = Math.random() * (4 * 60 * 1000);
    offsets.push(firstOffset);
    
    // Generate second offset (first + 3min to 7 minutes)
    const secondMin = Math.max(firstOffset + minGap, 3 * 60 * 1000);
    const secondMax = Math.min(7 * 60 * 1000, windowDuration - minGap);
    const secondOffset = secondMin + Math.random() * (secondMax - secondMin);
    offsets.push(secondOffset);
    
    // Generate third offset (second + 3min to 10 minutes)
    const thirdMin = Math.max(secondOffset + minGap, 6 * 60 * 1000);
    const thirdMax = windowDuration;
    const thirdOffset = thirdMin + Math.random() * (thirdMax - thirdMin);
    offsets.push(thirdOffset);
    
    return offsets.sort((a, b) => a - b);
  }

  /**
   * Start the 10-minute window scheduling
   */
  startScheduling() {
    if (this.isActive) {
      console.log('📸 [10MIN-SCHEDULER] Already active, stopping previous schedule');
      this.stopScheduling();
    }

    console.log('🚀 [10MIN-SCHEDULER] Starting 3-screenshots-per-10-minutes pattern');
    this.isActive = true;
    this.scheduleNextWindow();
  }

  /**
   * Schedule the next 10-minute window
   */
  scheduleNextWindow() {
    this.clearCurrentWindow();
    this.currentWindowStart = Date.now();
    
    // Generate 3 random offsets with minimum gaps
    const offsets = this.generateRandomOffsetsWithMinGap(
      this.windowDurationMs, 
      this.shotCount, 
      this.minGapMs
    );
    
    console.log(`📸 [10MIN-SCHEDULER] New 10-minute window starting`);
    console.log(`📸 [10MIN-SCHEDULER] Screenshots scheduled at: ${offsets.map(o => `${Math.round(o/60000)}m${Math.round((o%60000)/1000)}s`).join(', ')}`);
    
    // Schedule the 3 screenshots
    this.windowTimers = offsets.map((offset, index) => {
      return setTimeout(async () => {
        const timeInWindow = Math.round(offset / 60000 * 10) / 10;
        console.log(`📸 [10MIN-SCHEDULER] 🔔 Screenshot ${index + 1}/3 triggered at ${timeInWindow}min into window`);
        
        try {
          await this.captureScreenshot();
          console.log(`✅ [10MIN-SCHEDULER] Screenshot ${index + 1}/3 completed successfully`);
        } catch (error) {
          console.error(`❌ [10MIN-SCHEDULER] Screenshot ${index + 1}/3 failed:`, error.message);
        }
      }, offset);
    });

    // Schedule next window to start after current window ends
    this.windowEndTimer = setTimeout(() => {
      if (this.isActive) {
        console.log('🔄 [10MIN-SCHEDULER] 10-minute window completed, starting next window');
        this.scheduleNextWindow();
      }
    }, this.windowDurationMs);
  }

  /**
   * Capture screenshot using the consolidated system
   */
  async captureScreenshot() {
    try {
      // Try to use global enhanced screenshot manager first
      if (global.enhancedScreenshotManager && global.enhancedScreenshotManager.captureScreenshot) {
        console.log('📸 [10MIN-SCHEDULER] Using global enhanced screenshot manager');
        return await global.enhancedScreenshotManager.captureScreenshot(false);
      }
      
      // Fallback to consolidated screenshots
      const { captureScreenshotSafe } = require('./src/fixes/consolidate-screenshots');
      console.log('📸 [10MIN-SCHEDULER] Using consolidated screenshot system');
      return await captureScreenshotSafe(false);
      
    } catch (error) {
      console.error('❌ [10MIN-SCHEDULER] Screenshot capture failed:', error.message);
      return false;
    }
  }

  /**
   * Clear current window timers
   */
  clearCurrentWindow() {
    this.windowTimers.forEach(timer => clearTimeout(timer));
    this.windowTimers = [];
    
    if (this.windowEndTimer) {
      clearTimeout(this.windowEndTimer);
      this.windowEndTimer = null;
    }
  }

  /**
   * Stop scheduling
   */
  stopScheduling() {
    console.log('🛑 [10MIN-SCHEDULER] Stopping screenshot scheduling');
    this.isActive = false;
    this.clearCurrentWindow();
  }

  /**
   * Get status information
   */
  getStatus() {
    const now = Date.now();
    const timeInCurrentWindow = this.currentWindowStart ? now - this.currentWindowStart : 0;
    const remainingInWindow = this.windowDurationMs - timeInCurrentWindow;
    
    return {
      isActive: this.isActive,
      windowProgress: this.currentWindowStart ? `${Math.round(timeInCurrentWindow/60000)}/${Math.round(this.windowDurationMs/60000)} minutes` : 'Not started',
      remainingTime: this.isActive ? `${Math.round(remainingInWindow/60000)} minutes` : 'Stopped',
      scheduledShots: this.windowTimers.length,
      nextWindowIn: this.isActive ? remainingInWindow : 0
    };
  }
}

// Test the pattern
async function testTenMinutePattern() {
  console.log('🧪 [TEST] Testing 10-minute 3-screenshot pattern...');
  
  const scheduler = new TenMinuteScreenshotScheduler();
  
  // Show a few example schedules
  for (let i = 0; i < 3; i++) {
    const offsets = scheduler.generateRandomOffsetsWithMinGap(
      10 * 60 * 1000, // 10 minutes
      3, // 3 shots
      3 * 60 * 1000 // 3 minute gaps
    );
    
    console.log(`Example ${i + 1}: Screenshots at ${offsets.map(o => `${Math.round(o/60000)}m${Math.round((o%60000)/1000)}s`).join(', ')}`);
    
    // Verify gaps
    for (let j = 1; j < offsets.length; j++) {
      const gap = (offsets[j] - offsets[j-1]) / 60000;
      console.log(`  Gap ${j}: ${gap.toFixed(1)} minutes ${gap >= 3 ? '✅' : '❌'}`);
    }
  }
  
  return scheduler;
}

// Integration function for main.js
function integrateIntoMainJs() {
  return `
// === 10-MINUTE 3-SCREENSHOT PATTERN INTEGRATION ===
// Add this to main.js to implement the pattern

const TenMinuteScreenshotScheduler = class {
  constructor() {
    this.windowDurationMs = 10 * 60 * 1000; // 10 minutes
    this.shotCount = 3; // 3 screenshots per window
    this.minGapMs = 3 * 60 * 1000; // 3 minutes minimum gap
    this.windowTimers = [];
    this.windowEndTimer = null;
    this.isActive = false;
  }

  generateRandomOffsetsWithMinGap(windowDuration, shotCount, minGap) {
    const offsets = [];
    
    // Generate first offset (0 to 4 minutes)
    const firstOffset = Math.random() * (4 * 60 * 1000);
    offsets.push(firstOffset);
    
    // Generate second offset (first + 3min to 7 minutes)
    const secondMin = Math.max(firstOffset + minGap, 3 * 60 * 1000);
    const secondMax = Math.min(7 * 60 * 1000, windowDuration - minGap);
    const secondOffset = secondMin + Math.random() * (secondMax - secondMin);
    offsets.push(secondOffset);
    
    // Generate third offset (second + 3min to 10 minutes)
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
    
    console.log(\`📸 [SCREENSHOT] 10-min window: shots at \${offsets.map(o => Math.round(o/60000)).join('m, ')}m\`);
    
    this.windowTimers = offsets.map((offset, i) => setTimeout(async () => {
      console.log(\`📸 [SCREENSHOT] Shot \${i+1}/3 at +\${Math.round(offset/60000)}m\`);
      await captureScreenshot();
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
};

// Create global scheduler instance
global.tenMinuteScheduler = new TenMinuteScreenshotScheduler();

// Replace enhanced screenshot manager's startScreenshotCapture method
if (global.enhancedScreenshotManager) {
  global.enhancedScreenshotManager.startScreenshotCapture = () => {
    console.log('📸 [SCREENSHOT] Starting 10-minute 3-shot pattern');
    global.tenMinuteScheduler.startScheduling();
  };
  
  global.enhancedScreenshotManager.stopScreenshotCapture = () => {
    console.log('📸 [SCREENSHOT] Stopping 10-minute pattern');
    global.tenMinuteScheduler.stopScheduling();
  };
}
`;
}

async function main() {
  console.log('📸 10-MINUTE 3-SCREENSHOT PATTERN IMPLEMENTATION');
  console.log('===============================================');
  
  const scheduler = await testTenMinutePattern();
  
  console.log('\n🔧 To implement this pattern:');
  console.log('1. Run: node -e "require(\'./implement-10min-3screenshot-pattern.js\').implement()"');
  console.log('2. Or integrate the code into your main.js');
  
  // Generate integration code
  const integrationCode = integrateIntoMainJs();
  require('fs').writeFileSync('10min-pattern-integration.txt', integrationCode);
  console.log('\n📄 Integration code saved to: 10min-pattern-integration.txt');
  
  return scheduler;
}

// Export functions for use
module.exports = {
  TenMinuteScreenshotScheduler,
  testTenMinutePattern,
  integrateIntoMainJs,
  
  // Quick implementation function
  implement: async function() {
    console.log('🚀 Implementing 10-minute 3-screenshot pattern...');
    
    try {
      // Initialize consolidated screenshots first
      const { initializeConsolidatedScreenshots } = require('./src/fixes/consolidate-screenshots');
      
      const mockConfig = {
        getConfig: () => ({ user_id: 'test', currentTimeLogId: 'test', currentProjectId: 'test' }),
        supabaseService: null
      };
      
      await initializeConsolidatedScreenshots(mockConfig, {}, null);
      
      // Create and start scheduler
      const scheduler = new TenMinuteScreenshotScheduler();
      
      console.log('📸 Starting 10-minute pattern (will run 3 test cycles)...');
      scheduler.startScheduling();
      
      // Stop after 30 minutes for testing
      setTimeout(() => {
        scheduler.stopScheduling();
        console.log('✅ Test completed - 10-minute pattern working!');
      }, 30 * 60 * 1000);
      
      return scheduler;
    } catch (error) {
      console.error('❌ Implementation failed:', error.message);
      return null;
    }
  }
};

if (require.main === module) {
  main().catch(console.error);
}


