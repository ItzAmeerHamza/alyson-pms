/**
 * TEST DATABASE MANAGER MODULE
 * 
 * Centralized management of database testing and diagnostic functions
 * for the TimeFlow desktop agent.
 * 
 * Part of TimeFlow Desktop Agent Phase 7 refactoring
 */

class TestDatabaseManager {
  constructor(dependencies = {}) {
    this.ipcMain = dependencies.ipcMain;
    this.config = dependencies.config;
    this.crypto = dependencies.crypto || require('crypto');
    
    console.log('✅ TestDatabaseManager initialized');
  }

  /**
   * Register database test handlers
   */
  registerHandlers() {
    this.registerDatabaseConnectionTest();
    this.registerInputDetectionTest();
    
    console.log('✅ All test database handlers registered');
  }

  /**
   * Register comprehensive database connection test
   */
  registerDatabaseConnectionTest() {
    this.ipcMain.handle('test-database-connection', async () => {
      console.log('🧪 [IPC] Database test - checking RDS backend reachability...');
      const startTime = Date.now();
      
      try {
        const { isBackendRdsEnabled } = require('../utils/backend-rds-reads');
        const { checkBackendHealth } = require('../utils/backend-health');

        if (!isBackendRdsEnabled(this.config)) {
          console.log('❌ [IPC] Backend sync not configured');
          return { success: false, error: 'Missing BACKEND_API_URL / INTERNAL_API_KEY configuration' };
        }

        // Test 1: backend + database reachability
        console.log('📡 [IPC] Testing backend health endpoint...');
        const health = await checkBackendHealth(this.config);
        if (!health.ok) {
          console.log('❌ [IPC] Backend health check failed:', health.error || health.status);
          return { success: false, error: `Backend health check failed: ${health.error || health.status}` };
        }
        console.log('✅ [IPC] Backend connectivity passed');

        // The CREATE/UPDATE/DELETE round-trip and RLS probe wrote throwaway rows into
        // time_logs via Supabase. That is deliberately not reproduced against RDS —
        // time_logs is payroll data and there is no sandboxed write action.
        console.warn(
          '⚠️ [IPC] time_log write round-trip and RLS probe were Supabase-only — skipped',
        );

        const duration = Date.now() - startTime;
        console.log(`✅ [IPC] Database test passed in ${duration}ms`);
        
        return { 
          success: true, 
          message: 'RDS backend connection successful (time_doctor schema)',
          duration: duration,
          tests: {
            connectivity: 'passed',
            timeLogOperations: 'skipped', 
            rls: 'skipped'
          }
        };
        
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error('❌ [IPC] Database test failed:', error);
        return { 
          success: false, 
          error: error.message,
          duration: duration
        };
      }
    });
  }

  /**
   * Register input detection test
   */
  registerInputDetectionTest() {
    this.ipcMain.handle('test-input-detection', async () => {
      try {
        console.log('🧪 [DEBUG-TEST] Testing input detection systems...');
        
        const inputTests = {
          mouseTracking: typeof global.recordActivityForDisplay === 'function',
          keyboardTracking: typeof global.recordActivityForDisplay === 'function', 
          idleDetection: typeof global.getSystemIdleTime === 'function',
          activityStats: typeof global.activityStats === 'object' && global.activityStats !== null,
          powerMonitor: typeof global.powerMonitor === 'object' && global.powerMonitor !== null
        };
        
        const allWorking = Object.values(inputTests).every(test => test === true);
        
        console.log(`${allWorking ? '✅' : '⚠️'} [DEBUG-TEST] Input detection test completed`);
        return { 
          success: true, 
          allWorking, 
          systems: inputTests,
          message: allWorking ? 'All input systems operational' : 'Some input systems may need attention'
        };
      } catch (error) {
        console.error('❌ [DEBUG-TEST] Input detection test error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Initialize the test database manager
   */
  async initialize() {
    try {
      this.registerHandlers();
      console.log('🧪 TestDatabaseManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ TestDatabaseManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the test database manager
   */
  async shutdown() {
    try {
      console.log('🧪 TestDatabaseManager shutdown complete');
    } catch (error) {
      console.error('❌ TestDatabaseManager shutdown failed:', error);
    }
  }
}

module.exports = TestDatabaseManager;