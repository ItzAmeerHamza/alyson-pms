/**
 * URL TRACKING DIAGNOSTIC SCRIPT
 * 
 * This script diagnoses why URLs are still showing as QUEUED instead of SAVED
 */

class URLTrackingDiagnostic {
  constructor() {
    this.issues = [];
    this.recommendations = [];
  }

  /**
   * Run comprehensive diagnostic
   */
  async runDiagnostic() {
    console.log('\n🔍 [URL-DIAGNOSTIC] Starting comprehensive URL tracking diagnostic...\n');

    // Check 1: Fix files loaded
    this.checkFixFilesLoaded();

    // Check 2: Global state
    this.checkGlobalState();

    // Check 3: URL processing systems
    this.checkURLProcessingSystems();

    // Check 4: Sync manager state
    this.checkSyncManagerState();

    // Check 5: Database connectivity
    await this.checkDatabaseConnectivity();

    // Check 6: Queue processing
    this.checkQueueProcessing();

    // Generate report
    this.generateDiagnosticReport();

    // Provide immediate fixes
    await this.attemptImmediateFixes();
  }

  /**
   * Check if fix files are loaded
   */
  checkFixFilesLoaded() {
    console.log('🔍 Checking fix files...');

    // Check if our fix objects exist
    const hasIntegrator = !!global.urlTrackingIntegrator;
    const hasSynchronizer = !!global.urlTrackingStateSynchronizer;
    const hasDebugger = !!global.urlTrackingDebugger;

    console.log(`   urlTrackingIntegrator: ${hasIntegrator}`);
    console.log(`   urlTrackingStateSynchronizer: ${hasSynchronizer}`);
    console.log(`   urlTrackingDebugger: ${hasDebugger}`);

    if (!hasIntegrator) {
      this.issues.push('URL tracking integrator not loaded');
      this.recommendations.push('Run: require("./src/integrate-url-tracking-fix")');
    }

    if (!hasSynchronizer) {
      this.issues.push('URL tracking state synchronizer not loaded');
    }

    if (!hasDebugger) {
      this.issues.push('URL tracking debugger not loaded');
    }
  }

  /**
   * Check global tracking state
   */
  checkGlobalState() {
    console.log('\n🔍 Checking global tracking state...');

    const state = {
      isTracking: global.isTracking,
      currentTimeLogId: global.currentTimeLogId,
      currentUserId: global.currentUserId,
      hasBackendApi: !!global.syncManager
    };

    console.log('   Global State:', JSON.stringify(state, null, 6));

    if (!state.isTracking) {
      this.issues.push('global.isTracking is false - tracking not active');
      this.recommendations.push('Start tracking in the UI or run global.startTracking()');
    }

    if (!state.currentTimeLogId) {
      this.issues.push('global.currentTimeLogId is missing');
      this.recommendations.push('Check if time log was created when tracking started');
    }

    if (!state.currentUserId) {
      this.issues.push('global.currentUserId is missing');
      this.recommendations.push('Ensure user is logged in properly');
    }

    if (!state.hasBackendApi) {
      this.issues.push('No sync manager available for backend writes');
      this.recommendations.push('Check sync manager / backend API initialization');
    }
  }

  /**
   * Check URL processing systems
   */
  checkURLProcessingSystems() {
    console.log('\n🔍 Checking URL processing systems...');

    const systems = {
      browserUrlManager: !!global.browserUrlManager,
      urlTracker: !!global.urlTracker,
      consolidatedUrlTracker: !!global.consolidatedUrlTracker
    };

    console.log('   URL Systems:', JSON.stringify(systems, null, 6));

    const systemCount = Object.values(systems).filter(Boolean).length;
    console.log(`   Total URL processing systems found: ${systemCount}`);

    if (systemCount === 0) {
      this.issues.push('No URL processing systems found');
      this.recommendations.push('Check if URL tracking modules are initialized');
    }

    // Check system states
    if (global.browserUrlManager) {
      console.log('   BrowserUrlManager state:');
      console.log(`     currentTimeLogId: ${global.browserUrlManager.currentTimeLogId}`);
      console.log(`     config.user_id: ${global.browserUrlManager.config?.user_id}`);
      console.log(`     syncManager: ${!!global.browserUrlManager.syncManager}`);
    }
  }

  /**
   * Check sync manager state
   */
  checkSyncManagerState() {
    console.log('\n🔍 Checking sync manager state...');

    const syncManagers = [];
    if (global.syncManager) syncManagers.push({ name: 'syncManager', instance: global.syncManager });
    if (global.enhancedSyncManager) syncManagers.push({ name: 'enhancedSyncManager', instance: global.enhancedSyncManager });

    console.log(`   Found ${syncManagers.length} sync managers`);

    syncManagers.forEach(({ name, instance }) => {
      console.log(`\n   ${name}:`);
      console.log(`     isOnline: ${instance.isOnline}`);
      console.log(`     queue exists: ${!!instance.queue}`);
      
      if (instance.queue) {
        const urlLogsCount = instance.queue.urlLogs?.length || 0;
        console.log(`     urlLogs in queue: ${urlLogsCount}`);
        
        if (urlLogsCount > 0) {
          console.log('     Recent URL logs in queue:');
          instance.queue.urlLogs.slice(-3).forEach((log, i) => {
            console.log(`       [${i}] ${log.logs?.[0]?.site_url || 'unknown'} (${log.timestamp})`);
          });
        }
      }
      
      console.log(`     backendApiUrl: ${instance.config?.backend_api_url || 'unset'}`);
    });

    if (syncManagers.length === 0) {
      this.issues.push('No sync managers found');
      this.recommendations.push('Check sync manager initialization');
    }
  }

  /**
   * Check database connectivity
   */
  async checkDatabaseConnectivity() {
    console.log('\n🔍 Checking database connectivity...');

    try {
      // RDS is only reachable through the NestJS API.
      const { checkBackendHealth } = require('./modules/utils/backend-health');
      const health = await checkBackendHealth(global.config);

      if (!health.ok) {
        const reason = health.error || (health.status ? `HTTP ${health.status}` : 'unreachable');
        this.issues.push(`Database connectivity error: ${reason}`);
        console.log(`   ❌ Database test failed: ${reason}`);
      } else {
        console.log('   ✅ Database connectivity OK');
      }

      // Test if we can insert (simulated)
      const testUrlLog = {
        user_id: global.currentUserId,
        time_log_id: global.currentTimeLogId,
        site_url: 'https://diagnostic-test.com',
        domain: 'diagnostic-test.com',
        title: 'Diagnostic Test',
        browser: 'Test Browser',
        timestamp: new Date().toISOString()
      };

      console.log('   Test URL log data:', JSON.stringify(testUrlLog, null, 6));

      if (!testUrlLog.user_id || !testUrlLog.time_log_id) {
        this.issues.push('Missing required fields for URL log insertion');
      }

    } catch (error) {
      this.issues.push(`Database test error: ${error.message}`);
      console.log(`   ❌ Database test exception: ${error.message}`);
    }
  }

  /**
   * Check queue processing
   */
  checkQueueProcessing() {
    console.log('\n🔍 Checking queue processing...');

    const syncManager = global.syncManager || global.enhancedSyncManager;
    
    if (!syncManager) {
      this.issues.push('No sync manager available for queue processing check');
      return;
    }

    // Check if sync is actively running
    const hasSyncInterval = !!syncManager.syncInterval;
    const isOnline = syncManager.isOnline;
    
    console.log(`   Sync interval active: ${hasSyncInterval}`);
    console.log(`   Is online: ${isOnline}`);

    if (!hasSyncInterval) {
      this.issues.push('Sync interval not active - queue not being processed');
      this.recommendations.push('Check if sync manager startSyncProcess() was called');
    }

    if (!isOnline) {
      this.issues.push('Sync manager reports offline - queue will not upload');
      this.recommendations.push('Check network connectivity');
    }
  }

  /**
   * Generate diagnostic report
   */
  generateDiagnosticReport() {
    console.log('\n📊 [URL-DIAGNOSTIC] ===== DIAGNOSTIC REPORT =====');
    
    if (this.issues.length === 0) {
      console.log('✅ No issues found - system appears to be working correctly');
    } else {
      console.log(`❌ Found ${this.issues.length} issues:`);
      this.issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`);
      });
    }

    if (this.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      this.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }

    console.log('\n📊 [URL-DIAGNOSTIC] ===== END REPORT =====\n');
  }

  /**
   * Attempt immediate fixes
   */
  async attemptImmediateFixes() {
    console.log('🔧 [URL-DIAGNOSTIC] Attempting immediate fixes...\n');

    // Fix 1: Force sync if queue has items
    const syncManager = global.syncManager || global.enhancedSyncManager;
    if (syncManager && syncManager.queue && syncManager.queue.urlLogs?.length > 0) {
      console.log('🔧 Found URLs in queue, forcing sync...');
      try {
        await syncManager.syncQueue();
        console.log('✅ Forced sync completed');
      } catch (error) {
        console.log('❌ Forced sync failed:', error.message);
      }
    }

    // Fix 2: Re-initialize sync if not running
    if (syncManager && !syncManager.syncInterval) {
      console.log('🔧 Sync interval not running, starting...');
      try {
        syncManager.startSyncProcess();
        console.log('✅ Sync process started');
      } catch (error) {
        console.log('❌ Failed to start sync process:', error.message);
      }
    }

    // Fix 3: Force state synchronization
    if (global.urlTrackingStateSynchronizer) {
      console.log('🔧 Forcing state synchronization...');
      global.urlTrackingStateSynchronizer.forceSynchronization();
    }

    // Fix 4: Test URL processing
    console.log('🔧 Testing URL processing with diagnostic URL...');
    if (global.testURLTracking) {
      await global.testURLTracking();
    }

    console.log('\n🔧 [URL-DIAGNOSTIC] Immediate fixes completed\n');
  }
}

// Export and create global function
global.diagnoseURLTracking = async () => {
  const diagnostic = new URLTrackingDiagnostic();
  await diagnostic.runDiagnostic();
};

// Auto-run if this file is executed directly
if (require.main === module) {
  global.diagnoseURLTracking();
}

module.exports = URLTrackingDiagnostic;
