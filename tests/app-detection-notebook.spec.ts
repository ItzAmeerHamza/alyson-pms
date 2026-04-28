import { test, expect } from '@playwright/test';
import { ElectronTestApp } from './utils/electron';
import { SupabaseTestClient } from './utils/supabase';
import * as fs from 'fs/promises';
import * as path from 'path';

// Minimal login helper to reuse across tests
async function handleLoginIfNeeded(electronApp: ElectronTestApp, testData: any) {
  try {
    const isLoginVisible = await electronApp.isVisible('#loginForm');
    if (isLoginVisible) {
      await electronApp.page?.fill('#loginEmail', testData.user.email);
      await electronApp.page?.fill('#loginPassword', testData.user.password || 'TestPassword123!');
      await electronApp.page?.click('button[type="submit"]');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  } catch (error: any) {
    console.log('⚠️ Login check error (non-fatal):', error.message);
  }
}

interface TestContext {
  electronApp: ElectronTestApp;
  supabaseTestClient: SupabaseTestClient;
  testUserClient: any;
  hooks: any;
  testData: any;
  testRunId: string;
}

test.describe('App Detection save for specific user (Notebook)', () => {
  let context: TestContext;

  test.beforeAll(async () => {
    // Load test data produced by global.setup
    const testDataPath = path.join(__dirname, '../test-results/test-data.json');
    const testDataRaw = await fs.readFile(testDataPath, 'utf8');
    const testData = JSON.parse(testDataRaw);

    // Launch desktop agent in test mode
    const testRunId = process.env.TEST_RUN_ID || 'notebook-app-test';
    const electronApp = new ElectronTestApp(testRunId);
    const { page, hooks } = await electronApp.launch();

    // Supabase client using test config
    const supabaseTestClient = new SupabaseTestClient(testRunId);
    await supabaseTestClient.setUserAuth(testData.user.jwt);
    const testUserClient = supabaseTestClient.createUserClient(testData.user.id);

    context = {
      electronApp,
      supabaseTestClient,
      testUserClient,
      hooks,
      testData,
      testRunId
    };

    await page.waitForLoadState('domcontentloaded');
    try {
      await electronApp.waitForSelector('[data-testid="main-layout"]', 5000);
    } catch {
      await electronApp.waitForSelector('body', 5000);
    }

    await handleLoginIfNeeded(electronApp, testData);

    // Ensure tracking is started (use first available project)
    try {
      const { data: projects } = await context.testUserClient.from('projects').select('*').limit(1);
      if (projects && projects.length > 0) {
        await context.hooks.startTracking(projects[0].id);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (e) {
      console.log('⚠️ Unable to start tracking (non-fatal for this test):', (e as Error).message);
    }
  });

  test.afterAll(async () => {
    if (context?.electronApp) {
      await context.electronApp.close();
    }
  });

  test('should create an app_log when Notebook is focused and saved to DB', async () => {
    const targetAppName = 'Notebook';
    const targetTitle = 'Test Note';

    const startIso = new Date().toISOString();

    // Simulate focusing the app via test hook (event-driven path)
    await context.hooks.focusApp(targetAppName, targetTitle);

    // Poll Supabase for the saved record (allow pipeline time)
    const maxAttempts = 10; // ~10s total
    let found = false;
    let lastLogs: any[] | null = null;
    for (let i = 0; i < maxAttempts && !found; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data, error } = await context.supabaseTestClient['serviceClient']
        .from('app_logs')
        .select('*')
        .eq('user_id', context.testData.user.id)
        .eq('app_name', targetAppName)
        .gte('timestamp', startIso)
        .order('timestamp', { ascending: false })
        .limit(3);
      if (error) {
        console.log('⚠️ Query error (retrying):', error.message);
      }
      lastLogs = data || [];
      found = !!(lastLogs && lastLogs.length > 0);
    }

    expect(found).toBe(true);
    if (lastLogs && lastLogs.length > 0) {
      expect(lastLogs[0].app_name).toBe(targetAppName);
    }
  });
});


