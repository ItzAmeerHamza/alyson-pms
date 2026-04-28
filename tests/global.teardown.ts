import { FullConfig } from '@playwright/test';
import { createTestSupabaseClient } from './utils/supabase';
import fs from 'fs/promises';
import path from 'path';

async function globalTeardown(config: FullConfig): Promise<void> {
  console.log('🧹 Starting global test cleanup...');

  try {
    // Read test data
    const testDataPath = path.join(__dirname, '../test-results/test-data.json');
    const testDataExists = await fs.access(testDataPath).then(() => true).catch(() => false);
    
    if (!testDataExists) {
      console.log('⚠️  No test data found, skipping cleanup');
      return;
    }

    const testDataRaw = await fs.readFile(testDataPath, 'utf8');
    const testData = JSON.parse(testDataRaw);

    if (!testData.testRunId) {
      console.log('⚠️  Invalid test data, skipping cleanup');
      return;
    }

    console.log(`📋 Cleaning up test run: ${testData.testRunId}`);

    // Initialize Supabase client for cleanup
    const supabase = createTestSupabaseClient(testData.testRunId);
    
    // Perform cleanup
    await supabase.cleanup();
    
    console.log('✅ Global test cleanup completed successfully');

  } catch (error) {
    console.error('❌ Global test cleanup failed:', error);
    // Don't throw - cleanup failures shouldn't fail the build
  }
}

export default globalTeardown;
