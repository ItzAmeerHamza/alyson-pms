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
    this.supabaseService = dependencies.supabaseService;
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
      console.log('🧪 [IPC] REAL Database test - testing ACTUAL failing operations...');
      const startTime = Date.now();
      
      try {
        // Check config first
        if (!this.config.supabase_url || !this.config.supabase_key) {
          console.log('❌ [IPC] Missing Supabase configuration');
          return { success: false, error: 'Missing Supabase configuration' };
        }
        
        console.log('📋 [IPC] Config check passed');
        console.log('📊 [IPC] URL:', this.config.supabase_url);
        console.log('📊 [IPC] Key length:', this.config.supabase_key.length);
        
        // Test 1: REAL Network connectivity with same timeout settings
        console.log('📡 [IPC] Testing connectivity with REAL timeout settings (60s)...');
        try {
          const connectResponse = await fetch(`${this.config.supabase_url}/rest/v1/`, {
            method: 'GET',
            headers: {
              'apikey': this.config.supabase_key,
              'Authorization': `Bearer ${this.config.supabase_key}`,
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(60000) // 60 second timeout like production
          });
          
          console.log('📡 [IPC] Network response status:', connectResponse.status);
          
          if (!connectResponse.ok) {
            console.log('❌ [IPC] Network connectivity failed:', connectResponse.status);
            return { success: false, error: `Network error: ${connectResponse.status}` };
          }
          
          console.log('✅ [IPC] Network connectivity passed');
          
        } catch (networkError) {
          console.log('❌ [IPC] Network connectivity test failed:', networkError.message);
          return { success: false, error: `Network connectivity failed: ${networkError.message}` };
        }
        
        // Test 2: ACTUAL TIME LOG OPERATIONS (test exact failing functions)
        console.log('🕐 [IPC] Testing REAL time log operations (CREATE + UPDATE like ending tracking)...');
        try {
          // Test the EXACT same operation that fails when ending tracking
          const testTimeLogId = this.crypto.randomUUID();
          const testTimeLog = {
            id: testTimeLogId,
            user_id: this.config.user_id,
            project_id: this.config.project_id || '00000000-0000-0000-0000-000000000000',
            start_time: new Date().toISOString(),
            status: 'active',
            created_at: new Date().toISOString()
          };
          
          // Test CREATE operation
          const { error: insertError } = await this.supabaseService
            .from('time_logs')
            .insert(testTimeLog);
            
          if (insertError) {
            console.log('❌ [IPC] Time log CREATE failed:', insertError.message);
            return { success: false, error: `Time log creation failed: ${insertError.message}` };
          }
          
          // Test UPDATE operation (THIS IS WHAT FAILS IN REAL USAGE)
          const { error: updateError } = await this.supabaseService
            .from('time_logs')
            .update({
              end_time: new Date().toISOString(),
              status: 'completed'
            })
            .eq('id', testTimeLogId);
            
          if (updateError) {
            console.log('❌ [IPC] Time log UPDATE failed:', updateError.message);
            return { success: false, error: `Time log update failed: ${updateError.message}` };
          }
          
          // Test DELETE (cleanup)
          const { error: deleteError } = await this.supabaseService
            .from('time_logs')
            .delete()
            .eq('id', testTimeLogId);
            
          if (deleteError) {
            console.log('⚠️ [IPC] Time log cleanup failed:', deleteError.message);
            // Don't fail the test for cleanup issues
          }
          
          console.log('✅ [IPC] Time log operations test passed');
          
        } catch (timeLogError) {
          console.log('❌ [IPC] Time log operations test failed:', timeLogError.message);
          return { success: false, error: `Time log operations failed: ${timeLogError.message}` };
        }
        
        // Test 3: Row Level Security (RLS) test
        console.log('🔒 [IPC] Testing Row Level Security...');
        try {
          const { data: testData, error: rlsError } = await this.supabaseService
            .from('time_logs')
            .select('id')
            .eq('user_id', this.config.user_id)
            .limit(1);
            
          if (rlsError && rlsError.code === 'PGRST116') {
            console.log('❌ [IPC] RLS test failed - permission denied:', rlsError.message);
            return { success: false, error: `RLS permission denied: ${rlsError.message}` };
          }
          
          console.log('✅ [IPC] RLS test passed');
          
        } catch (rlsTestError) {
          console.log('❌ [IPC] RLS test failed:', rlsTestError.message);
          return { success: false, error: `RLS test failed: ${rlsTestError.message}` };
        }
        
        const duration = Date.now() - startTime;
        console.log(`✅ [IPC] Complete database test passed in ${duration}ms`);
        
        return { 
          success: true, 
          message: 'All database operations working correctly',
          duration: duration,
          tests: {
            connectivity: 'passed',
            timeLogOperations: 'passed', 
            rls: 'passed'
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