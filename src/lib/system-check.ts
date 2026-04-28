import { supabase } from '@/integrations/supabase/client';

export interface SystemCheckResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
}

/**
 * Test database connectivity by attempting basic operations
 */
export async function testDatabaseConnectivity(): Promise<SystemCheckResult> {
  try {
    console.log('🔍 Testing database connectivity...');
    
    // Test basic query
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      console.error('❌ Database connectivity test failed:', error);
      return {
        success: false,
        error: `Database connectivity failed: ${error.message}`
      };
    }

    console.log('✅ Database connectivity test passed');
    return {
      success: true,
      message: 'Database connection successful'
    };
  } catch (error) {
    console.error('❌ Database connectivity error:', error);
    return {
      success: false,
      error: `Connection error: ${(error as Error).message}`
    };
  }
}

/**
 * Test full database operations by creating test entries
 */
export async function testDatabaseOperations(): Promise<SystemCheckResult> {
  try {
    console.log('🔍 Testing database operations...');
    
    const testEntry = {
      check_type: 'system_initialization',
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
      test_data: {
        screenshot_test: false,
        app_test: false,
        url_test: false,
        input_test: false
      },
      status: 'testing',
      completed_at: new Date().toISOString()
    };

    // Insert test entry
    const { data, error } = await supabase
      .from('system_checks')
      .insert(testEntry)
      .select('id')
      .single();

    if (error) {
      console.error('❌ Database operations test failed:', error);
      return {
        success: false,
        error: `Database operations failed: ${error.message}`
      };
    }

    // Verify we can read it back
    const { data: readData, error: readError } = await supabase
      .from('system_checks')
      .select('*')
      .eq('id', data.id)
      .single();

    if (readError) {
      console.error('❌ Database read verification failed:', readError);
      return {
        success: false,
        error: `Database read verification failed: ${readError.message}`
      };
    }

    console.log('✅ Database operations test passed:', data.id);
    return {
      success: true,
      message: 'Database operations test completed successfully',
      data: { test_id: data.id }
    };
  } catch (error) {
    console.error('❌ Database operations error:', error);
    return {
      success: false,
      error: `Internal error: ${(error as Error).message}`
    };
  }
}

/**
 * Test app log functionality
 */
export async function testAppLogOperations(): Promise<SystemCheckResult> {
  try {
    console.log('🔍 Testing app log operations...');
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        success: false,
        error: 'User authentication required for app log testing'
      };
    }

    const appLogEntry = {
      user_id: user.id,
      app_name: 'System Check Test App',
      window_title: 'System Check Test Window',
      timestamp: new Date().toISOString(),
      notes: 'SYSTEM_CHECK_TEST_ENTRY'
    };

    // Insert test app log
    const { data, error } = await supabase
      .from('app_logs')
      .insert(appLogEntry)
      .select('id')
      .single();

    if (error) {
      console.error('❌ App log test failed:', error);
      return {
        success: false,
        error: `App log test failed: ${error.message}`
      };
    }

    console.log('✅ App log test passed:', data.id);
    return {
      success: true,
      message: 'App log test completed successfully',
      data: { app_log_id: data.id }
    };
  } catch (error) {
    console.error('❌ App log test error:', error);
    return {
      success: false,
      error: `Internal error: ${(error as Error).message}`
    };
  }
}

/**
 * Test URL log functionality
 */
export async function testUrlLogOperations(): Promise<SystemCheckResult> {
  try {
    console.log('🔍 Testing URL log operations...');
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        success: false,
        error: 'User authentication required for URL log testing'
      };
    }

    const urlLogEntry = {
      user_id: user.id,
      site_url: 'https://system-check-test.example.com',
      title: 'System Check Test URL',
      timestamp: new Date().toISOString(),
      notes: 'SYSTEM_CHECK_TEST_ENTRY'
    };

    // Insert test URL log
    const { data, error } = await supabase
      .from('url_logs')
      .insert(urlLogEntry)
      .select('id')
      .single();

    if (error) {
      console.error('❌ URL log test failed:', error);
      return {
        success: false,
        error: `URL log test failed: ${error.message}`
      };
    }

    console.log('✅ URL log test passed:', data.id);
    return {
      success: true,
      message: 'URL log test completed successfully',
      data: { url_log_id: data.id }
    };
  } catch (error) {
    console.error('❌ URL log test error:', error);
    return {
      success: false,
      error: `Internal error: ${(error as Error).message}`
    };
  }
}

/**
 * Clean up test entries from database
 */
export async function cleanupTestEntries(): Promise<SystemCheckResult> {
  try {
    console.log('🧹 Cleaning up test entries...');
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        success: false,
        error: 'User authentication required for cleanup'
      };
    }

    // Clean up test entries from various tables
    const cleanupPromises = [
      supabase.from('system_checks').delete().eq('check_type', 'system_initialization'),
      supabase.from('app_logs').delete().eq('notes', 'SYSTEM_CHECK_TEST_ENTRY').eq('user_id', user.id),
      supabase.from('url_logs').delete().eq('notes', 'SYSTEM_CHECK_TEST_ENTRY').eq('user_id', user.id)
    ];

    const results = await Promise.allSettled(cleanupPromises);
    
    let cleanedCount = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && !result.value.error) {
        cleanedCount++;
      } else if (result.status === 'rejected') {
        console.warn(`Cleanup warning for table ${index}:`, result.reason);
      }
    });

    console.log(`✅ Cleanup completed: ${cleanedCount} tables processed`);
    return {
      success: true,
      message: `Cleanup completed: ${cleanedCount} test entries removed`
    };
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return {
      success: false,
      error: `Cleanup error: ${(error as Error).message}`
    };
  }
} 