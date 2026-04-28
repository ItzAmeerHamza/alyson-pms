/**
 * Script to trigger comprehensive AI analysis for all users
 * Analyzes today's screenshots for each user
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: VITE_SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeAllUsersToday() {
  console.log('🧠 Starting comprehensive AI analysis for all users (today\'s screenshots)...\n');
  console.log(`🔗 Supabase URL: ${supabaseUrl}`);
  console.log(`🔑 Using API key: ${supabaseServiceKey?.substring(0, 20)}...`);
  console.log('');

  try {
    // Get all active users (excluding test/demo accounts)
    console.log('📥 Fetching users from database...');
    
    // First, try getting all users to see if the filter is the issue
    const { data: allUsers, error: allError } = await supabase
      .from('users')
      .select('id, email, full_name');
    
    console.log(`Total users in database: ${allUsers?.length || 0}`);
    if (allUsers && allUsers.length > 0) {
      console.log(`Sample emails: ${allUsers.slice(0, 3).map(u => u.email).join(', ')}`);
    }
    
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name')
      .not('email', 'ilike', '%@example.com%')
      .order('full_name');

    console.log(`Raw query result: users=${users?.length || 0}, error=${usersError?.message || 'none'}`);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    if (!users || users.length === 0) {
      console.log('⚠️  No users found to analyze');
      return;
    }

    console.log(`📊 Found ${users.length} users to analyze\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ user: string; error: string }> = [];

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = today.toISOString();

    // Process each user
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`[${i + 1}/${users.length}] Analyzing ${user.full_name} (${user.email})...`);

      try {
        // Check if user has screenshots from today
        const { count, error: countError } = await supabase
          .from('screenshots')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('captured_at', startOfDay);

        if (countError) {
          throw new Error(`Failed to count screenshots: ${countError.message}`);
        }

        if (!count || count === 0) {
          console.log(`  ⏭️  Skipping (no screenshots today)\n`);
          continue;
        }

        console.log(`  📸 Found ${count} screenshot(s) from today`);

        // Trigger comprehensive analysis
        const { data, error } = await supabase.functions.invoke('comprehensive-employee-analysis', {
          body: {
            user_id: user.id,
            generate_ai_summary: true
          }
        });

        if (error) {
          throw new Error(error.message || 'Analysis failed');
        }

        console.log(`  ✅ Analysis complete`);
        if (data?.productivity_score !== undefined) {
          console.log(`  📈 Productivity Score: ${data.productivity_score}%`);
        }
        console.log('');

        successCount++;

        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        console.error(`  ❌ Error: ${error.message}\n`);
        errorCount++;
        errors.push({
          user: `${user.full_name} (${user.email})`,
          error: error.message
        });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 ANALYSIS SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`⏭️  Skipped: ${users.length - successCount - errorCount}`);

    if (errors.length > 0) {
      console.log('\n❌ ERRORS:');
      errors.forEach(({ user, error }) => {
        console.log(`  - ${user}: ${error}`);
      });
    }

    console.log('\n✨ Analysis complete! Check the AI Insights page for results.');

  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the script
analyzeAllUsersToday().catch(console.error);
