// Direct URL pipeline smoke test (no UI)
// - Creates a short time_log for the existing desktop agent user
// - Invokes BrowserUrlManager.processFoundUrl to save a URL
// - Verifies the row exists in url_logs

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const agentConfig = require(path.join(__dirname, '../desktop-agent/config.json'));
  const supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL || agentConfig.supabase_url;
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || agentConfig.supabase_key;
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('❌ Missing Supabase URL or anon key');
    process.exit(1);
  }
  if (!serviceKey) {
    console.error('❌ Missing TEST_SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const service = createClient(supabaseUrl, serviceKey);

  const userId = agentConfig.user_id;
  if (!userId) {
    console.error('❌ desktop-agent/config.json has no user_id');
    process.exit(1);
  }

  // Create a short time_log session
  const sessionInsert = {
    user_id: userId,
    start_time: new Date().toISOString(),
    end_time: new Date(new Date().getTime() + 60 * 1000).toISOString(),
    status: 'active'
  };
  const { data: timeLogs, error: tlErr } = await service.from('time_logs').insert(sessionInsert).select('id').limit(1);
  if (tlErr) {
    console.error('❌ Failed to create time_log:', tlErr.message);
    process.exit(1);
  }
  const timeLogId = timeLogs && timeLogs[0] && (timeLogs[0].id || timeLogs[0].time_log_id || timeLogs[0].ID);
  if (!timeLogId) {
    console.error('❌ Could not obtain time_log_id');
    process.exit(1);
  }
  console.log('🕒 Created test time_log:', timeLogId);

  // Prepare BrowserUrlManager with a syncManager that writes directly to DB
  const BrowserUrlManager = require(path.join(__dirname, '../desktop-agent/src/modules/capture/browser-url-manager.js'));
  const manager = new BrowserUrlManager({ user_id: userId }, {
    syncManager: {
      addUrlLogs: async (logs) => {
        const { error } = await service.from('url_logs').insert(logs);
        if (error) throw new Error(error.message);
      }
    }
  });
  manager.currentTimeLogId = String(timeLogId);
  manager.isTracking = true;

  const testUrl = process.env.TEST_URL || 'https://github.com/timeflow-ai/url-pipeline-test';
  const payload = {
    url: testUrl,
    title: 'URL Pipeline Smoke',
    browser: 'Chrome',
    domain: 'github.com',
  };

  console.log('🔗 Saving URL via BrowserUrlManager.processFoundUrl:', payload.url);
  await manager.processFoundUrl(payload);

  // Verify from database
  await new Promise((r) => setTimeout(r, 1000));
  const { data: rows, error: qErr } = await service
    .from('url_logs')
    .select('id, url, site_url, domain, time_log_id, user_id, timestamp')
    .eq('user_id', userId)
    .or('url.eq.' + testUrl + ',site_url.eq.' + testUrl)
    .order('timestamp', { ascending: false })
    .limit(1);
  if (qErr) {
    console.error('❌ Query error:', qErr.message);
    process.exit(1);
  }

  if (rows && rows.length > 0) {
    const row = rows[0];
    console.log('✅ URL saved:', row.domain, row.url || row.site_url, 'time_log_id:', row.time_log_id);
    process.exit(0);
  } else {
    console.error('❌ URL not found in url_logs');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('❌ Unexpected error:', e.message);
  process.exit(1);
});


