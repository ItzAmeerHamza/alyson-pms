import { FullConfig } from '@playwright/test';
import { createTestSupabaseClient, TestData } from './utils/supabase';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

async function globalSetup(config: FullConfig): Promise<void> {
  console.log('🧪 Setting up global test environment...');

  const testRunId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`📋 Test Run ID: ${testRunId}`);

  // Create test directories
  const testResultsDir = path.join(__dirname, '../test-results');
  const screenshotsDir = path.join(testResultsDir, 'screenshots');
  
  await fs.mkdir(testResultsDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });

  // Initialize Supabase test client
  const supabase = createTestSupabaseClient(testRunId);

  try {
    let testUser;
    let testProjects;

    if (process.env.TEST_USE_EXISTING_USER === '1') {
      console.log('👤 Using existing desktop agent user from config (TEST_USE_EXISTING_USER=1)');
      const agentConfig = require('../desktop-agent/config.json');
      const existingUserId = agentConfig.user_id;
      if (!existingUserId) {
        throw new Error('TEST_USE_EXISTING_USER enabled but desktop-agent/config.json has no user_id');
      }
      testUser = {
        id: existingUserId,
        email: `existing-user-${testRunId}@example.com`,
        password: '',
        jwt: '',
        organizationId: `test-org-${testRunId}`
      };
      console.log('📁 Creating test projects (service role) ...');
      testProjects = await supabase.createTestProjects(testUser.id, testUser.organizationId);
    } else {
      const overrideEmail = process.env.TEST_USER_EMAIL;
      const overridePassword = process.env.TEST_USER_PASSWORD;
      if (overrideEmail && overridePassword) {
        console.log(`👤 Using provided test user: ${overrideEmail}`);
        const supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
        const supabaseAnonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Missing Supabase URL/Anon key env for override user');
        }
        const anonClient = createClient(supabaseUrl, supabaseAnonKey);
        const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({
          email: overrideEmail,
          password: overridePassword,
        });
        if (signInError || !sessionData?.session?.access_token || !sessionData.user) {
          throw new Error(`Failed to sign in override user: ${signInError?.message}`);
        }
        await supabase.setUserAuth(sessionData.session.access_token);
        testUser = {
          id: sessionData.user.id,
          email: overrideEmail,
          password: overridePassword,
          jwt: sessionData.session.access_token,
          organizationId: `test-org-${testRunId}`,
        } as any;
        console.log('📁 Creating test projects...');
        testProjects = await supabase.createTestProjects(testUser.id, testUser.organizationId);
      } else {
        console.log('👤 Creating test user and organization...');
        testUser = await supabase.createTestUser();
        
        console.log('📁 Creating test projects...');
        testProjects = await supabase.createTestProjects(testUser.id, testUser.organizationId);
      }
    }

    // Store test data for tests to access
    const testData: TestData = {
      user: testUser,
      projects: testProjects,
      organizationId: testUser.organizationId,
    };

    // Save test data to file for tests to access
    const testDataPath = path.join(testResultsDir, 'test-data.json');
    await fs.writeFile(testDataPath, JSON.stringify({
      testRunId,
      ...testData,
    }, null, 2));

    console.log('✅ Global test setup completed successfully');
    console.log(`   - Test user: ${testUser.email}`);
    console.log(`   - Organization: ${testUser.organizationId}`);
    console.log(`   - Projects: ${testProjects.map(p => p.name).join(', ')}`);

  } catch (error) {
    console.error('❌ Global test setup failed:', error);
    throw error;
  }
}

export default globalSetup;
