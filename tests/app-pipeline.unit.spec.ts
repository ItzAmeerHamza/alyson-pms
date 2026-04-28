import { test, expect } from '@playwright/test';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Unit-style, no global setup; run with playwright.unit.config.ts
test('app log direct insert for m_Afatah@me.com (no UI, no global setup)', async () => {
  const agentConfig = require(path.join(__dirname, '../desktop-agent/config.json'));

  const supabaseUrl = process.env.TEST_SUPABASE_URL || agentConfig.supabase_url;
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(supabaseUrl, 'Supabase URL must be provided').toBeTruthy();
  expect(serviceKey, 'Service role key must be provided').toBeTruthy();

  const service = createClient(supabaseUrl as string, serviceKey as string);

  const email = process.env.TEST_USER_EMAIL || 'm_Afatah@me.com';
  const { data: userRow, error: userErr } = await service
    .from('users')
    .select('id')
    .eq('email', email)
    .single();
  expect(userErr, `Could not resolve user by email ${email}`).toBeNull();
  const userId = userRow!.id as string;

  const { data: tlData, error: tlErr } = await service
    .from('time_logs')
    .insert({
      user_id: userId,
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 60_000).toISOString(),
      status: 'active'
    })
    .select('id')
    .limit(1);
  expect(tlErr).toBeNull();
  const timeLogId = tlData && tlData[0] && (tlData[0].id || tlData[0].time_log_id);
  expect(timeLogId).toBeTruthy();

  const appLog = {
    user_id: userId,
    time_log_id: String(timeLogId),
    app_name: 'Notebook',
    window_title: 'Test Note',
    app_path: 'com.apple.Notes',
    timestamp: new Date().toISOString(),
  } as any;

  const { error: insErr } = await service.from('app_logs').insert(appLog);
  expect(insErr).toBeNull();

  const { data, error } = await service
    .from('app_logs')
    .select('id, app_name, user_id')
    .eq('user_id', userId)
    .eq('app_name', 'Notebook')
    .order('timestamp', { ascending: false })
    .limit(1);

  expect(error).toBeNull();
  expect(data && data.length).toBeGreaterThan(0);
});


