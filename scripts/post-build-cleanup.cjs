#!/usr/bin/env node

/**
 * Post-Build Cleanup Script
 * Automatically removes unnecessary build artifacts after builds
 * Run this after npm run build to clean up temporary files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Directories and files to clean
const CLEANUP_TARGETS = {
  // Temporary build files
  tempFiles: [
    'timeflow-web-ready.tar.gz',
    'desktop-agent/test-screenshot.png',
    'desktop-agent/agent-logs.txt',
    'desktop-agent/url-capture-live-test.txt',
  ],
  
  // Diagnostic files
  diagnosticPatterns: [
    'desktop-agent/*diagnostic*.json',
    '*diagnostic*.json',
  ],
  
  // Old build artifacts (keep only latest)
  buildDirs: [
    // Note: We don't auto-delete dist/ as it might be needed for deployment
    // Manual cleanup recommended for these
  ],
};

function deleteFile(filePath) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      console.log(`✓ Deleted: ${filePath}`);
      return true;
    } catch (error) {
      console.warn(`⚠ Could not delete ${filePath}: ${error.message}`);
      return false;
    }
  }
  return false;
}

function deletePattern(pattern) {
  const fullPattern = path.join(PROJECT_ROOT, pattern);
  try {
    // Use glob to find matching files
    const { execSync } = require('child_process');
    const files = execSync(
      `find . -path "./node_modules" -prune -o -path "${pattern}" -type f -print 2>/dev/null || true`,
      {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(f => f.trim());
    
    files.forEach(file => {
      if (file && fs.existsSync(path.join(PROJECT_ROOT, file))) {
        fs.unlinkSync(path.join(PROJECT_ROOT, file));
        console.log(`✓ Deleted: ${file}`);
      }
    });
    
    return files.length;
  } catch (error) {
    console.warn(`⚠ Could not process pattern ${pattern}: ${error.message}`);
    return 0;
  }
}

function checkLargeFiles() {
  console.log('\n📊 Checking for large files (>10MB)...');
  try {
    const largeFiles = execSync(
      'find . -type f -size +10M ! -path "./node_modules/*" ! -path "./.git/*" ! -path "*/node_modules/*" 2>/dev/null || true',
      { cwd: PROJECT_ROOT, encoding: 'utf8' }
    )
      .split('\n')
      .filter(f => f.trim());
    
    if (largeFiles.length > 0) {
      console.warn('⚠ Found large files that might need attention:');
      largeFiles.forEach(file => {
        try {
          const stat = fs.statSync(path.join(PROJECT_ROOT, file));
          const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
          console.warn(`  - ${file} (${sizeMB}MB)`);
        } catch (e) {
          // File might have been deleted, ignore
        }
      });
    } else {
      console.log('✓ No large files found');
    }
  } catch (error) {
    console.warn('Could not check for large files:', error.message);
  }
}

function main() {
  console.log('🧹 Running post-build cleanup...\n');
  
  let cleanedCount = 0;
  
  // Clean temporary files
  console.log('Cleaning temporary files...');
  CLEANUP_TARGETS.tempFiles.forEach(file => {
    if (deleteFile(file)) cleanedCount++;
  });
  
  // Clean diagnostic files
  console.log('\nCleaning diagnostic files...');
  CLEANUP_TARGETS.diagnosticPatterns.forEach(pattern => {
    cleanedCount += deletePattern(pattern);
  });
  
  // Check for large files
  checkLargeFiles();
  
  console.log(`\n✓ Cleanup complete! Removed ${cleanedCount} files.`);
  console.log('\n💡 Tip: Run "npm run clean:all" to remove all build artifacts.\n');
}

if (require.main === module) {
  main();
}

module.exports = { main };

