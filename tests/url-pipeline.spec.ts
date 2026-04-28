import { test, expect } from '@playwright/test';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

test.describe('URL pipeline (direct, no UI) @urls @db', () => {
  test('should save a URL log via BrowserUrlManager.processFoundUrl()', async () => {
    const agentConfig = require(path.join(__dirname, '../desktop-agent/config.json'));

    const supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL || agentConfig.supabase_url;
    const serviceKey = process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(supabaseUrl, 'Supabase URL must be provided').toBeTruthy();
    expect(serviceKey, 'Service role key must be provided').toBeTruthy();

    const service = createClient(supabaseUrl as string, serviceKey as string);
    let userId = (agentConfig.user_id as string) || '';
    // Allow override via TEST_USER_ID or TEST_USER_EMAIL
    const overrideUserId = process.env.TEST_USER_ID;
    const overrideEmail = process.env.TEST_USER_EMAIL;
    if (overrideUserId) {
      userId = overrideUserId;
    } else if (overrideEmail) {
      const { data: userRow, error: userErr } = await service
        .from('users')
        .select('id')
        .eq('email', overrideEmail)
        .single();
      expect(userErr, `Could not resolve user by email ${overrideEmail}`).toBeNull();
      userId = userRow?.id as string;
    }
    expect(userId, 'User id must be resolvable (config or TEST_USER_ID/TEST_USER_EMAIL)').toBeTruthy();

    // Create a short time log to attach URL to
    const sessionInsert = {
      user_id: userId,
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 60_000).toISOString(),
      status: 'active',
    };
    const { data: tlData, error: tlErr } = await service
      .from('time_logs')
      .insert(sessionInsert)
      .select('id')
      .limit(1);
    expect(tlErr).toBeNull();
    const timeLogId = tlData && tlData[0] && (tlData[0].id || tlData[0].time_log_id);
    expect(timeLogId).toBeTruthy();

    // Prepare BrowserUrlManager with a syncManager that writes directly
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BrowserUrlManager = require('../desktop-agent/src/modules/capture/browser-url-manager.js');
    const manager = new BrowserUrlManager({ user_id: userId }, {
      syncManager: {
        addUrlLogs: async (logs: any[]) => {
          const { error } = await service.from('url_logs').insert(logs);
          if (error) throw new Error(error.message);
        }
      }
    });
    manager.currentTimeLogId = String(timeLogId);
    manager.isTracking = true;

    const testUrl = process.env.TEST_URL || 'https://github.com/timeflow-ai/url-pipeline-test';
    await manager.processFoundUrl({
      url: testUrl,
      title: 'URL Pipeline Direct',
      browser: 'Chrome',
      domain: 'github.com',
    });

    // Verify DB row exists
    await new Promise((r) => setTimeout(r, 1000));
    const { data, error } = await service
      .from('url_logs')
      .select('id, url, site_url, user_id, time_log_id')
      .eq('user_id', userId)
      .or('url.eq.' + testUrl + ',site_url.eq.' + testUrl)
      .order('timestamp', { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(data && data.length).toBeGreaterThan(0);
  });
});


