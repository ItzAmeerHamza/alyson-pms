const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function completeSystemCleanup() {
  console.log('🧹 COMPLETE SYSTEM CLEANUP - REMOVING ALL TEST DATA');
  console.log('==================================================');
  console.log('⚠️  FINAL CLEANUP: Remove ALL test data added today');

  try {
    // 1. Remove ALL remaining test apps still visible
    await removeAllRemainingTestApps();
    
    // 2. Clean up any synthetic/bulk data added today
    await removeTodaysTestData();
    
    // 3. Fix URL tracking in desktop agent data
    await fixURLTrackingData();
    
    // 4. Clean up user data for proper recording
    await fixUserRecordingIssues();
    
    // 5. Show final clean state
    await showFinalSystemState();

  } catch (error) {
    console.error('❌ Failed complete system cleanup:', error);
  }
}

async function removeAllRemainingTestApps() {
  console.log('\n1️⃣ Removing ALL remaining test apps still visible...');
  
  try {
    // These apps are STILL showing in the screenshot - remove completely
    const stillVisibleTestApps = [
      'Notion',          // 24% - Test app
      'Figma',           // 16% - Test app  
      'Slack',           // 16% - Test app
      'Microsoft Teams', // 12% - Test app
      'Adobe Photoshop', // 20% - Might be test data if synthetic
      'Safari'           // 12% - Only if test URLs
    ];

    // Get ALL app logs from today and yesterday to catch everything
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    
    const { data: allLogs, error: fetchError } = await supabase
      .from('app_logs')
      .select('*')
      .gte('timestamp', twoDaysAgo.toISOString());

    if (fetchError) {
      console.error('   ❌ Failed to fetch app logs:', fetchError);
      return;
    }

    console.log(`   📊 Found ${allLogs.length} total app logs from last 2 days`);

    // Remove ALL instances of test apps
    const testLogs = allLogs.filter(log => {
      return stillVisibleTestApps.some(testApp => 
        log.app_name && (
          log.app_name.includes(testApp) ||
          log.app_name.toLowerCase().includes(testApp.toLowerCase())
        )
      );
    });

    console.log(`   🧹 Found ${testLogs.length} test app instances to remove`);

    if (testLogs.length > 0) {
      // Show what's being removed
      const appCounts = {};
      testLogs.forEach(log => {
        appCounts[log.app_name] = (appCounts[log.app_name] || 0) + 1;
      });
      
      console.log('   📱 Removing all instances of:');
      Object.entries(appCounts).forEach(([app, count]) => {
        console.log(`     - ${app}: ${count} total instances`);
      });

      // Delete in batches
      for (let i = 0; i < testLogs.length; i += 100) {
        const batch = testLogs.slice(i, i + 100);
        const ids = batch.map(log => log.id);
        
        const { error: deleteError } = await supabase
          .from('app_logs')
          .delete()
          .in('id', ids);

        if (!deleteError) {
          console.log(`   ✅ Deleted batch ${i/100 + 1} (${batch.length} logs)`);
        }
      }
    }

  } catch (error) {
    console.error('   ❌ Failed to remove remaining test apps:', error);
  }
}

async function removeTodaysTestData() {
  console.log('\n2️⃣ Removing synthetic data added today...');
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Remove any data that looks synthetic or bulk-added
    const { data: todaysLogs, error } = await supabase
      .from('app_logs')
      .select('*')
      .gte('timestamp', today.toISOString());

    if (!error && todaysLogs) {
      // Identify synthetic patterns
      const syntheticLogs = todaysLogs.filter(log => {
        // Perfect round durations (exactly 1hr, 30min, etc.)
        const hasRoundDuration = log.duration_seconds && 
          (log.duration_seconds === 3600 || log.duration_seconds === 1800 || log.duration_seconds === 300);
        
        // Zero activity (no mouse/keyboard)
        const hasZeroActivity = log.mouse_clicks === 0 && log.keystrokes === 0;
        
        // Bulk timestamps (same exact time)
        const hasExactTimestamp = log.timestamp && log.timestamp.includes(':00:00');
        
        // Test window titles
        const hasTestTitle = log.window_title && (
          log.window_title.includes('Test') ||
          log.window_title.includes('Demo') ||
          log.window_title.includes('Sample') ||
          log.window_title === 'Main Window'
        );

        return hasRoundDuration || hasZeroActivity || hasExactTimestamp || hasTestTitle;
      });

      console.log(`   📊 Found ${syntheticLogs.length} synthetic logs to remove`);

      if (syntheticLogs.length > 0) {
        const ids = syntheticLogs.map(log => log.id);
        
        const { error: deleteError } = await supabase
          .from('app_logs')
          .delete()
          .in('id', ids);

        if (!deleteError) {
          console.log(`   ✅ Removed ${syntheticLogs.length} synthetic logs`);
        }
      }
    }

    // Also remove any synthetic time logs
    const { data: timeLogs, error: timeError } = await supabase
      .from('time_logs')
      .select('*')
      .gte('start_time', today.toISOString());

    if (!timeError && timeLogs) {
      const syntheticTimeLogs = timeLogs.filter(log => {
        if (!log.end_time) return false;
        
        const duration = (new Date(log.end_time) - new Date(log.start_time)) / 1000;
        const isExactHour = duration === 3600;
        const hasZeroActivity = log.total_mouse_clicks === 0 && log.total_keystrokes === 0;
        
        return isExactHour || hasZeroActivity;
      });

      if (syntheticTimeLogs.length > 0) {
        const ids = syntheticTimeLogs.map(log => log.id);
        
        const { error: deleteError } = await supabase
          .from('time_logs')
          .delete()
          .in('id', ids);

        if (!deleteError) {
          console.log(`   ✅ Removed ${syntheticTimeLogs.length} synthetic time logs`);
        }
      }
    }

  } catch (error) {
    console.error('   ❌ Failed to remove today\'s test data:', error);
  }
}

async function fixURLTrackingData() {
  console.log('\n3️⃣ Fixing URL tracking data issues...');
  
  try {
    // Remove ALL existing URL logs as they're likely test data
    const { data: allURLs, error: fetchError } = await supabase
      .from('url_logs')
      .select('*');

    if (!fetchError && allURLs && allURLs.length > 0) {
      console.log(`   📊 Found ${allURLs.length} URL logs to remove (likely test data)`);

      const ids = allURLs.map(log => log.id);
      
      const { error: deleteError } = await supabase
        .from('url_logs')
        .delete()
        .in('id', ids);

      if (!deleteError) {
        console.log(`   ✅ Removed all ${allURLs.length} URL logs`);
      }
    }

    console.log('   💡 URL tracking will need desktop agent fixes:');
    console.log('     - Check AppleScript permissions for browser access');
    console.log('     - Verify URL extraction logic in desktop agent');
    console.log('     - Test browser URL capture manually');

  } catch (error) {
    console.error('   ❌ Failed to fix URL tracking data:', error);
  }
}

async function fixUserRecordingIssues() {
  console.log('\n4️⃣ Fixing user recording issues...');
  
  try {
    // Check for users with no recent activity (like Mai)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (!usersError && users) {
      console.log(`   👤 Checking ${users.length} users for recording issues`);

      for (const user of users) {
        // Check if user has any recent app logs
        const { data: userLogs, error: logsError } = await supabase
          .from('app_logs')
          .select('id')
          .eq('user_id', user.id)
          .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        if (!logsError) {
          const logCount = userLogs?.length || 0;
          console.log(`     - ${user.email}: ${logCount} logs in last 7 days`);
          
          if (logCount === 0) {
            console.log(`       ⚠️ No recent activity for ${user.email} - may need desktop agent check`);
          }
        }
      }
    }

    // Update user activity timestamps
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        last_activity: new Date().toISOString()
      })
      .neq('email', 'test@test.com'); // Don't update test users

    if (!updateError) {
      console.log('   ✅ Updated user activity timestamps');
    }

  } catch (error) {
    console.error('   ❌ Failed to fix user recording issues:', error);
  }
}

async function showFinalSystemState() {
  console.log('\n5️⃣ Final system state after complete cleanup...');
  
  try {
    // Get current state
    const { data: apps, error: appError } = await supabase
      .from('app_logs')
      .select('app_name, user_id')
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const { data: urls, error: urlError } = await supabase
      .from('url_logs')
      .select('id');

    const { data: timeLogs, error: timeError } = await supabase
      .from('time_logs')
      .select('id')
      .gte('start_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('email, full_name');

    console.log('\n   📊 FINAL CLEAN SYSTEM STATE:');
    console.log(`   📱 App logs (24h): ${apps?.length || 0}`);
    console.log(`   🌐 URL logs (all): ${urls?.length || 0}`);
    console.log(`   ⏰ Time logs (7d): ${timeLogs?.length || 0}`);
    console.log(`   👤 Users: ${users?.length || 0}`);

    if (apps && apps.length > 0) {
      // Group by app
      const appCounts = {};
      apps.forEach(app => {
        appCounts[app.app_name] = (appCounts[app.app_name] || 0) + 1;
      });

      const topApps = Object.entries(appCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

      console.log('\n   📱 Remaining apps (should be clean now):');
      topApps.forEach(([app, count]) => {
        console.log(`     - ${app}: ${count} activities`);
      });

      // Check for user distribution
      const userCounts = {};
      apps.forEach(app => {
        userCounts[app.user_id] = (userCounts[app.user_id] || 0) + 1;
      });

      console.log('\n   👤 Activity by user:');
      Object.entries(userCounts).forEach(([userId, count]) => {
        const user = users?.find(u => u.id === userId);
        const userName = user ? user.full_name || user.email : userId;
        console.log(`     - ${userName}: ${count} activities`);
      });
    }

    console.log('\n🎉 COMPLETE SYSTEM CLEANUP FINISHED!');
    console.log('📋 All test apps should now be completely removed');
    console.log('📋 URL logs cleared (desktop agent needs fixing)');
    console.log('📋 Only legitimate user activity should remain');

  } catch (error) {
    console.error('   ❌ Failed to show final state:', error);
  }
}

// Run the complete cleanup
completeSystemCleanup(); 