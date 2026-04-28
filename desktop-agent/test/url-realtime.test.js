/**
 * URL Realtime Test
 * Verifies that inserts via url_logs VIEW stream properly via app_url_activity TABLE
 */

const { createClient } = require('@supabase/supabase-js');

// Test configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TEST_USER_ID = process.env.TEST_USER_ID;

async function testUrlRealtime() {
  if (!SUPABASE_ANON_KEY || !TEST_USER_ID) {
    console.error('❌ Missing required environment variables: VITE_SUPABASE_ANON_KEY, TEST_USER_ID');
    process.exit(1);
  }

  console.log('🧪 Starting URL Realtime Test...');
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Track events received
  let eventsReceived = 0;
  let testPassed = false;
  
  // Subscribe to app_url_activity table (not the view)
  const channel = supabase
    .channel('url-activity-test')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'app_url_activity',
        filter: `user_id=eq.${TEST_USER_ID}`
      },
      (payload) => {
        console.log('✅ Realtime event received:', {
          id: payload.new.id,
          url: payload.new.site_url,
          domain: payload.new.domain,
          started_at: payload.new.started_at
        });
        eventsReceived++;
        testPassed = true;
      }
    )
    .subscribe((status) => {
      console.log('📡 Subscription status:', status);
    });

  // Wait for subscription to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Insert via url_logs VIEW (simulating legacy agent)
  const testUrl = `https://test-${Date.now()}.example.com/page`;
  console.log('📝 Inserting test URL via url_logs view:', testUrl);
  
  const { data, error } = await supabase
    .from('url_logs')
    .insert({
      user_id: TEST_USER_ID,
      url: testUrl,
      site_url: testUrl,
      title: 'Realtime Test Page',
      domain: 'example.com',
      browser: 'test-browser',
      timestamp: new Date().toISOString()
    })
    .select();

  if (error) {
    console.error('❌ Insert failed:', error);
    await channel.unsubscribe();
    process.exit(1);
  }

  console.log('✅ Insert successful:', data?.[0]?.id);

  // Wait for realtime event
  console.log('⏳ Waiting for realtime event (5 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Cleanup
  await channel.unsubscribe();

  // Report results
  console.log('\n📊 Test Results:');
  console.log(`Events received: ${eventsReceived}`);
  console.log(`Test status: ${testPassed ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (!testPassed) {
    console.log('\n⚠️  Troubleshooting:');
    console.log('1. Ensure Realtime is enabled for app_url_activity table');
    console.log('2. Check RLS policies allow the test user');
    console.log('3. Verify the user_id filter matches your test user');
  }

  process.exit(testPassed ? 0 : 1);
}

// Run the test
testUrlRealtime().catch(console.error);
