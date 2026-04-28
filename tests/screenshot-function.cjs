#!/usr/bin/env node

/**
 * Screenshot Function Test (Headless)
 * - Uses existing desktop-agent ScreenshotManager directly
 * - Forces capture via fallback (screenshot-desktop) if Electron modules are unavailable
 * - Saves to Supabase using service role key
 * - Verifies row exists in DB after capture
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function main() {
  console.log('🧪 Headless Screenshot Function Test');
  console.log('===================================');

  // 1) Load config and env (reuse existing config; no new feature code)
  const desktopAgentDir = path.join(__dirname, '..', 'desktop-agent');
  const configPath = path.join(desktopAgentDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error('❌ desktop-agent/config.json not found:', configPath);
    process.exit(1);
  }
  const agentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const SUPABASE_URL = process.env.TEST_SUPABASE_URL || agentConfig.supabase_url;
  let SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SERVICE_KEY) {
    try {
      SERVICE_KEY = execSync('security find-generic-password -a "$USER" -s TIMEFLOW_TEST_SUPABASE_SERVICE_KEY -w', { stdio: ['ignore','pipe','ignore'] }).toString().trim();
      console.log('🔐 Loaded service key from Keychain');
    } catch (e) {
      console.log('⚠️ Could not load service key from Keychain:', e.message);
    }
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ Missing Supabase configuration. Ensure TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_KEY are set or stored in Keychain.');
    process.exit(1);
  }

  // 2) Create Supabase service client
  const { createClient } = require('@supabase/supabase-js');
  const supabaseService = createClient(SUPABASE_URL, SERVICE_KEY);

  // 2a) Resolve user by email if provided (fallback to config user_id)
  let userId = agentConfig.user_id;
  const targetEmail = process.env.TEST_USER_EMAIL || '';
  if (targetEmail) {
    console.log('👤 Resolving user by email:', targetEmail);
    try {
      let found = null;
      let page = 1;
      const perPage = 1000;
      for (; page <= 5 && !found; page++) {
        const { data, error } = await supabaseService.auth.admin.listUsers({ page, perPage });
        if (error) throw new Error(`Admin listUsers error: ${error.message}`);
        const users = data?.users || [];
        found = users.find(u => (u.email || '').toLowerCase() === targetEmail.toLowerCase());
        if (users.length < perPage) break;
      }
      if (!found) {
        console.log('➕ Creating user via Admin API...');
        const randomPassword = Math.random().toString(36).slice(2) + 'Aa1!';
        const { data, error } = await supabaseService.auth.admin.createUser({
          email: targetEmail,
          password: randomPassword,
          email_confirm: true
        });
        if (error) throw new Error(`Admin createUser error: ${error.message}`);
        found = data?.user;
      }
      if (found?.id) {
        userId = found.id;
        console.log('✅ Using user id:', userId);
      }
    } catch (e) {
      console.error('❌ Failed to resolve/create user by email:', e.message);
      process.exit(1);
    }
  }
  if (!userId) {
    console.error('❌ Missing user_id – provide TEST_USER_EMAIL or ensure config has user_id');
    process.exit(1);
  }

  // 3) Prepare minimal configManager and electronModules to use existing ScreenshotManager
  const ScreenshotManager = require(path.join(desktopAgentDir, 'src', 'modules', 'screenshot-manager.js'));
  const configManager = {
    supabaseService,
    getConfig() {
      return {
        user_id: userId,
        currentTimeLogId: null,
        currentProjectId: null
      };
    }
  };

  // Provide minimal electronModules so manager falls back to screenshot-desktop
  const electronModules = { desktopCapturer: null, systemPreferences: null, screen: null };

  // Make supabase available globally for manager's direct save path
  global.supabaseService = supabaseService;

  // 4) Capture a screenshot
  const mgr = new ScreenshotManager(configManager, electronModules, /* syncManager */ null);
  // Ensure optional method exists (used by processScreenshot); no feature code changes
  if (typeof mgr.getFocusPercent !== 'function') {
    mgr.getFocusPercent = () => 0;
  }
  // mark start time for verification window
  const testStartISO = new Date().toISOString();

  // 4a) Verify capture works (no save)
  console.log('🚀 Capturing raw screenshot (no save)...');
  const raw = await mgr.captureRawScreenshot();
  if (!raw || raw === false || !raw.buffer || raw.buffer.length === 0) {
    console.error('❌ captureRawScreenshot() failed');
    process.exit(2);
  }
  console.log('✅ captureRawScreenshot() succeeded, bytes:', raw.buffer.length);

  // 4b) Capture and save via full path
  console.log('🚀 Capturing screenshot...');
  const result = await mgr.captureScreenshot();

  if (!result || result === false) {
    console.error('❌ captureScreenshot() returned false (likely missing OS screen permission).');
    process.exit(2);
  }

  // captureScreenshot() may not return filename; rely on DB verification
  console.log('✅ captureScreenshot() completed');

  // 5) Verify row saved in DB
  console.log('🔎 Verifying database insert...');
  const { data: rows, error } = await supabaseService
    .from('screenshots')
    .select('id, file_path, captured_at')
    .eq('user_id', userId)
    .gte('captured_at', testStartISO)
    .order('captured_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('❌ DB query error:', error.message);
    process.exit(3);
  }

  if (!rows || rows.length === 0) {
    console.error('❌ No recent screenshot row found in DB for user since', testStartISO);
    process.exit(4);
  }

  console.log('✅ Screenshot saved in DB:', rows[0]);
  console.log('\n🎉 Function test passed');
}

main().catch((e) => {
  console.error('❌ Test crashed:', e);
  process.exit(1);
});


