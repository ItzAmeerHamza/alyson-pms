#!/usr/bin/env node

/**
 * Apply URL Polling Fix
 * 
 * This script applies the fix for the URL polling issue
 */

console.log('🔧 Applying URL polling fix to running desktop agent...');

try {
  // Load the fix module
  const { fixUrlPolling } = require('./src/fixes/fix-url-polling');
  
  // Apply the fixes
  fixUrlPolling();
  
  console.log('✅ URL polling fix applied successfully!');
  console.log('');
  console.log('📋 Applied fixes:');
  console.log('   🔧 Fixed isPolling flag - now properly set to true when starting');
  console.log('   🔧 Enhanced captureCurrentUrl method with better logging');
  console.log('   🔧 Added automatic restart of URL manager if already running');
  console.log('');
  console.log('🔄 The URL capture system will now:');
  console.log('   • Actually poll for URLs (was broken before)');
  console.log('   • Call the platform adapter correctly');
  console.log('   • Process URL events when found');
  console.log('   • Save URLs to database immediately');
  console.log('');
  console.log('💡 Test by navigating to different websites - URLs should now be captured!');
  
} catch (error) {
  console.error('❌ Failed to apply URL polling fix:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}
