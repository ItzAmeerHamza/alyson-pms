#!/usr/bin/env node

/**
 * Get Web Admin Session Script
 * Helps the desktop agent get the user's session from the web admin
 */

console.log('🔗 [WEB-ADMIN-SESSION] Getting user session from web admin...');

// Load configuration
let config;
try {
  const { loadConfig } = require('./load-config');
  config = loadConfig();
  console.log('✅ [WEB-ADMIN-SESSION] Configuration loaded successfully');
} catch (error) {
  console.error('❌ [WEB-ADMIN-SESSION] Configuration loading failed:', error.message);
  process.exit(1);
}

// Create Supabase client with service role key to check all users
try {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(config.supabase_url, config.supabase_service_key);
  
  console.log('🔧 [WEB-ADMIN-SESSION] Supabase service client created successfully');
  
  // Check what users exist in the database
  console.log('🔍 [WEB-ADMIN-SESSION] Checking for active users in database...');
  
  // Get all active users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, full_name, role, is_active')
    .eq('is_active', true)
    .limit(10);
  
  if (usersError) {
    console.error('❌ [WEB-ADMIN-SESSION] Failed to get users:', usersError.message);
  } else {
    console.log('👥 [WEB-ADMIN-SESSION] Found active users:');
    users.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.full_name || user.email} (${user.role}) - ID: ${user.id}`);
    });
    
    // Get project assignments for the first user as an example
    if (users.length > 0) {
      const firstUser = users[0];
      console.log(`\n🔍 [WEB-ADMIN-SESSION] Getting project assignments for user: ${firstUser.email}`);
      
      const { data: assignments, error: assignmentsError } = await supabase
        .from('employee_project_assignments')
        .select(`
          id,
          project_id,
          projects:project_id (
            id,
            name,
            description
          )
        `)
        .eq('user_id', firstUser.id);
      
      if (assignmentsError) {
        console.error('❌ [WEB-ADMIN-SESSION] Failed to get project assignments:', assignmentsError.message);
      } else {
        console.log(`📋 [WEB-ADMIN-SESSION] Project assignments for ${firstUser.email}:`);
        if (assignments && assignments.length > 0) {
          assignments.forEach((assignment, index) => {
            console.log(`   ${index + 1}. ${assignment.projects.name} (ID: ${assignment.project_id})`);
          });
        } else {
          console.log('   No project assignments found - this explains why only "Default Project" shows!');
        }
      }
    }
  }
  
} catch (error) {
  console.error('❌ [WEB-ADMIN-SESSION] Error:', error.message);
}

console.log('🔗 [WEB-ADMIN-SESSION] Session check completed');



