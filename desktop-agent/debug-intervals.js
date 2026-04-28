// Debug script to test custom intervals
console.log('🔍 DEBUGGING CUSTOM INTERVALS');
console.log('===============================');

// Test before loading custom fix
const intervalsOriginal = require('./config/intervals');
console.log('BEFORE custom fix:');
console.log('  Current mode:', intervalsOriginal.getCurrentMode());
console.log('  Idle check:', intervalsOriginal.getInterval('IDLE_CHECK'));
console.log('  URL capture:', intervalsOriginal.getInterval('URL_CAPTURE_THROTTLE'));
console.log('  Sync retry:', intervalsOriginal.getInterval('SYNC_RETRY'));

// Load custom fix
console.log('\n🚀 Loading custom fix...');
require('./custom-performance-fix');

// Test after loading custom fix
console.log('\nAFTER custom fix:');
console.log('  Current mode:', intervalsOriginal.getCurrentMode());
console.log('  Idle check:', intervalsOriginal.getInterval('IDLE_CHECK'));
console.log('  URL capture:', intervalsOriginal.getInterval('URL_CAPTURE_THROTTLE'));
console.log('  Sync retry:', intervalsOriginal.getInterval('SYNC_RETRY'));

// Direct function test
console.log('\n🧪 DIRECT FUNCTION TEST:');
try {
  console.log('  Calling setPerformanceMode(custom_performance)...');
  const result = intervalsOriginal.setPerformanceMode('custom_performance');
  console.log('  Result:', result);
  
  console.log('  New current mode:', intervalsOriginal.getCurrentMode());
  console.log('  New idle check:', intervalsOriginal.getInterval('IDLE_CHECK'), 'ms');
  console.log('  New URL capture:', intervalsOriginal.getInterval('URL_CAPTURE_THROTTLE'), 'ms');
  console.log('  New sync retry:', intervalsOriginal.getInterval('SYNC_RETRY'), 'ms');
} catch (error) {
  console.error('Error:', error.message);
}
