import { test, expect } from '@playwright/test';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

test.describe('App pipeline (direct, no UI) @apps @db', () => {
  test('should save an app log for the target user (Notebook)', async () => {
    const agentConfig = require(path.join(__dirname, '../desktop-agent/config.json'));

    const supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL || agentConfig.supabase_url;
    const serviceKey = process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(supabaseUrl, 'Supabase URL must be provided').toBeTruthy();
    expect(serviceKey, 'Service role key must be provided').toBeTruthy();

    const service = createClient(supabaseUrl as string, serviceKey as string);

    // Resolve user by email if provided; otherwise fallback to agent config user_id
    const targetEmail = process.env.TEST_USER_EMAIL || 'm_Afatah@me.com';
    let userId = (agentConfig.user_id as string) || '';
    if (targetEmail) {
      const { data: userRow, error: userErr } = await service
        .from('users')
        .select('id')
        .eq('email', targetEmail)
        .single();
      expect(userErr, `Could not resolve user by email ${targetEmail}`).toBeNull();
      userId = (userRow?.id as string) || userId;
    }
    expect(userId, 'User id must be resolvable (config or TEST_USER_EMAIL)').toBeTruthy();

    // Create a short time log to attach App event to
    const sessionInsert = {
      user_id: userId,
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 60_000).toISOString(),
      status: 'active',
    } as any;
    const { data: tlData, error: tlErr } = await service
      .from('time_logs')
      .insert(sessionInsert)
      .select('id')
      .limit(1);
    expect(tlErr).toBeNull();
    const timeLogId = tlData && tlData[0] && (tlData[0].id || tlData[0].time_log_id);
    expect(timeLogId).toBeTruthy();

    // Direct app log insert using the same shape as the agent
    const appName = process.env.TEST_APP_NAME || 'Notebook';
    const appTitle = process.env.TEST_APP_TITLE || 'Test Note';
    const appPath = process.env.TEST_APP_BUNDLE || 'com.apple.Notes';

    const appLog = {
      user_id: userId,
      time_log_id: String(timeLogId),
      app_name: appName,
      window_title: appTitle,
      app_path: appPath,
      timestamp: new Date().toISOString(),
    } as any;

    const { error: appErr } = await service.from('app_logs').insert(appLog);
    expect(appErr).toBeNull();

    // Verify DB row exists
    await new Promise((r) => setTimeout(r, 1000));
    const { data, error } = await service
      .from('app_logs')
      .select('id, app_name, window_title, user_id, time_log_id')
      .eq('user_id', userId)
      .eq('app_name', appName)
      .order('timestamp', { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(data && data.length).toBeGreaterThan(0);
  });
});


