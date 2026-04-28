#!/usr/bin/env node

/**
 * URL Detection Migration Script
 * Run this to completely replace old URL detection with the new unified system
 * 
 * Usage: node migrate-url-detection.js
 */

const { completeUrlIntegration } = require('./src/fixes/complete-url-integration');

console.log(`
╔════════════════════════════════════════════════════════════╗
║         URL Detection System Migration Tool                ║
║                                                            ║
║  This will:                                                ║
║  • Remove ALL old URL detection code                       ║
║  • Install the new unified system                          ║
║  • Update all references and integrations                  ║
║  • Ensure ZERO code duplication                           ║
╚════════════════════════════════════════════════════════════╝
`);

// Ask for confirmation
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Do you want to proceed? (yes/no): ', async (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    console.log('\nStarting migration...\n');
    
    try {
      await completeUrlIntegration();
      
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                  Migration Complete! 🎉                    ║
║                                                            ║
║  All old URL detection code has been removed.              ║
║  The new unified system is now in place.                   ║
║                                                            ║
║  Please:                                                   ║
║  1. Review the changes                                     ║
║  2. Run tests: npm test -- --testPathPattern=url          ║
║  3. Test URL detection in your browsers                    ║
╚════════════════════════════════════════════════════════════╝
`);
    } catch (error) {
      console.error('\n❌ Migration failed:', error.message);
      console.error('Please check the error and try again.');
    }
  } else {
    console.log('\nMigration cancelled.');
  }
  
  rl.close();
});

