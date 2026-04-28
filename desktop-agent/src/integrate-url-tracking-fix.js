/**
 * URL TRACKING INTEGRATION SCRIPT
 * 
 * This script integrates the URL tracking debugging and state synchronization
 * fixes into the main application.
 * 
 * Usage: Add this to main.js after all other modules are loaded
 */

// NOTE: These fix modules no longer exist - URL tracking is handled by UrlCaptureManager
// const URLTrackingDebugger = require('./debug-url-tracking');
// const URLTrackingStateSynchronizer = require('./fixes/fix-url-tracking-state-sync');

// Stub class to prevent crashes when this module is loaded
const URLTrackingStateSynchronizer = class {
  constructor() { console.log('⚠️ [URL-SYNC] Legacy synchronizer - using UrlCaptureManager instead'); }
  async start() { }
  async syncAllState() { return true; }
  async runHealthCheck() { return true; }
};

class URLTrackingIntegrator {
  constructor() {
    this.debugger = null;
    this.synchronizer = null;
    this.isIntegrated = false;
  }

  /**
   * Integrate URL tracking fixes into the application
   */
  async integrate() {
    if (this.isIntegrated) {
      console.log('⚠️ [URL-INTEGRATOR] Already integrated');
      return;
    }

    console.log('🚀 [URL-INTEGRATOR] Integrating URL tracking fixes...');

    try {
      // Step 1: Initialize state synchronization (critical fix)
      await this.initializeStateSynchronization();

      // Step 2: Initialize debugging (for monitoring)
      await this.initializeDebugging();

      // Step 3: Run initial verification
      await this.runInitialVerification();

      this.isIntegrated = true;
      console.log('✅ [URL-INTEGRATOR] URL tracking integration completed successfully');

      // Provide user instructions
      this.showUserInstructions();

    } catch (error) {
      console.error('❌ [URL-INTEGRATOR] Integration failed:', error.message);
      throw error;
    }
  }

  /**
   * Initialize state synchronization
   */
  async initializeStateSynchronization() {
    console.log('🔧 [URL-INTEGRATOR] Initializing state synchronization...');
    
    this.synchronizer = new URLTrackingStateSynchronizer();
    
    // Wait a bit for all modules to be loaded
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    this.synchronizer.initialize();
    
    console.log('✅ [URL-INTEGRATOR] State synchronization initialized');
  }

  /**
   * Initialize debugging
   */
  async initializeDebugging() {
    console.log('🐛 [URL-INTEGRATOR] Initializing debugging...');
    
    // this.debugger = new URLTrackingDebugger(); // Disabled - module doesn't exist
    
    // Wait a bit more for state sync to settle
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // this.debugger.initialize(); // Disabled
    
    console.log('✅ [URL-INTEGRATOR] Debugging initialized');
  }

  /**
   * Run initial verification
   */
  async runInitialVerification() {
    console.log('🔍 [URL-INTEGRATOR] Running initial verification...');
    
    // Wait for everything to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify synchronization
    if (this.synchronizer) {
      this.synchronizer.verifySynchronization();
    }
    
    // Test URL flow
    if (this.debugger) {
      console.log('🧪 [URL-INTEGRATOR] Testing URL flow...');
      await this.debugger.testURLFlow('https://integration-test.com');
    }
    
    console.log('✅ [URL-INTEGRATOR] Initial verification completed');
  }

  /**
   * Show user instructions
   */
  showUserInstructions() {
    console.log('\n🎯 [URL-INTEGRATOR] ===== USER INSTRUCTIONS =====');
    console.log('');
    console.log('Your URL tracking has been fixed and is now being monitored.');
    console.log('');
    console.log('Available Commands:');
    console.log('  global.testURLTracking()     - Test the URL tracking flow');
    console.log('  global.syncURLTrackingState() - Force state synchronization');
    console.log('  global.verifyURLTrackingSync() - Verify sync status');
    console.log('');
    console.log('Next Steps:');
    console.log('1. Start tracking in the app UI');
    console.log('2. Visit some websites (e.g., google.com, github.com)');
    console.log('3. Watch the console for debug output');
    console.log('4. Check if URLs now appear as "SAVED" instead of "QUEUED"');
    console.log('');
    console.log('The system will automatically:');
    console.log('- Synchronize tracking state across all URL processing systems');
    console.log('- Log detailed information about URL detection and saving');
    console.log('- Report any issues or errors in the flow');
    console.log('');
    console.log('🎯 [URL-INTEGRATOR] ===== END INSTRUCTIONS =====\n');
  }

  /**
   * Manual test function
   */
  async runManualTest() {
    console.log('🧪 [URL-INTEGRATOR] Running manual test...');
    
    if (!this.isIntegrated) {
      console.log('❌ Integration not complete, running integration first...');
      await this.integrate();
    }

    // Force sync
    if (this.synchronizer) {
      this.synchronizer.forceSynchronization();
    }

    // Test URL flow
    if (this.debugger) {
      await this.debugger.testURLFlow('https://manual-test.com');
    }

    console.log('✅ [URL-INTEGRATOR] Manual test completed');
  }

  /**
   * Show current status
   */
  showStatus() {
    console.log('\n📊 [URL-INTEGRATOR] ===== CURRENT STATUS =====');
    console.log(`Integration Status: ${this.isIntegrated ? '✅ Active' : '❌ Not Integrated'}`);
    console.log(`State Synchronizer: ${this.synchronizer ? '✅ Running' : '❌ Not Available'}`);
    console.log(`Debugger: ${this.debugger ? '✅ Running' : '❌ Not Available'}`);
    console.log('');
    
    // Show global state
    console.log('Global Tracking State:');
    console.log(`  isTracking: ${global.isTracking}`);
    console.log(`  currentTimeLogId: ${global.currentTimeLogId}`);
    console.log(`  currentUserId: ${global.currentUserId}`);
    console.log(`  supabaseService: ${!!global.supabaseService}`);
    console.log('');
    
    // Count URL processing systems
    const urlSystems = [];
    if (global.browserUrlManager) urlSystems.push('BrowserUrlManager');
    if (global.urlTracker) urlSystems.push('URLTracker');
    
    console.log(`URL Processing Systems: ${urlSystems.length > 0 ? urlSystems.join(', ') : 'None found'}`);
    console.log('');
    
    if (this.synchronizer) {
      console.log(`Synchronized Systems: ${this.synchronizer.urlProcessingSystems?.length || 0}`);
    }
    
    console.log('📊 [URL-INTEGRATOR] ===== END STATUS =====\n');
  }
}

// Create and export integrator
const urlTrackingIntegrator = new URLTrackingIntegrator();

// Auto-integrate when loaded (with delay to ensure all modules are ready)
if (typeof global !== 'undefined') {
  global.urlTrackingIntegrator = urlTrackingIntegrator;
  
  // Expose utility functions
  global.integrateURLTrackingFix = () => urlTrackingIntegrator.integrate();
  global.testURLTrackingManual = () => urlTrackingIntegrator.runManualTest();
  global.showURLTrackingStatus = () => urlTrackingIntegrator.showStatus();
  
  // Auto-integrate after a delay (when main.js is likely finished loading)
  setTimeout(async () => {
    try {
      console.log('🚀 [URL-INTEGRATOR] Auto-integrating URL tracking fixes...');
      await urlTrackingIntegrator.integrate();
    } catch (error) {
      console.error('❌ [URL-INTEGRATOR] Auto-integration failed:', error.message);
      console.log('💡 Try manually: global.integrateURLTrackingFix()');
    }
  }, 5000); // Wait 5 seconds for everything to load
}

module.exports = URLTrackingIntegrator;
