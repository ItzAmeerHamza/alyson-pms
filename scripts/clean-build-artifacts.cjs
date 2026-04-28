#!/usr/bin/env node

/**
 * Clean Build Artifacts Script
 * Removes all build outputs and temporary files
 * Run with: npm run clean
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const BUILD_DIRS = [
  'dist',
  'build',
  'desktop-agent/dist',
  'backend/dist',
  '.parcel-cache',
  '.cache',
];

const TEMP_FILES = [
  'timeflow-web-ready.tar.gz',
  'desktop-agent/test-screenshot.png',
  'desktop-agent/agent-logs.txt',
  'desktop-agent/url-capture-live-test.txt',
];

function deleteDirectory(dir) {
  const fullPath = path.join(PROJECT_ROOT, dir);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`✓ Removed directory: ${dir}`);
      return true;
    } catch (error) {
      console.warn(`⚠ Could not remove ${dir}: ${error.message}`);
      return false;
    }
  }
  return false;
}

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

function getDirectorySize(dir) {
  const fullPath = path.join(PROJECT_ROOT, dir);
  if (!fs.existsSync(fullPath)) return 0;
  
  try {
    const output = execSync(`du -sh "${fullPath}" 2>/dev/null || echo "0"`, {
      encoding: 'utf8',
    });
    return output.split('\t')[0];
  } catch {
    return 'unknown';
  }
}

function main() {
  console.log('🧹 Cleaning build artifacts...\n');
  
  // Show sizes before cleanup
  console.log('📊 Current sizes:');
  BUILD_DIRS.forEach(dir => {
    const size = getDirectorySize(dir);
    if (size !== 0) {
      console.log(`  ${dir}: ${size}`);
    }
  });
  
  console.log('\nRemoving build directories...');
  let removedDirs = 0;
  BUILD_DIRS.forEach(dir => {
    if (deleteDirectory(dir)) removedDirs++;
  });
  
  console.log('\nRemoving temporary files...');
  let removedFiles = 0;
  TEMP_FILES.forEach(file => {
    if (deleteFile(file)) removedFiles++;
  });
  
  // Clean diagnostic files
  console.log('\nRemoving diagnostic files...');
  try {
    const diagnosticFiles = execSync(
      'find . -name "*diagnostic*.json" -type f ! -path "./node_modules/*" ! -path "./.git/*" 2>/dev/null || true',
      { cwd: PROJECT_ROOT, encoding: 'utf8' }
    )
      .split('\n')
      .filter(f => f.trim());
    
    diagnosticFiles.forEach(file => {
      if (file && fs.existsSync(path.join(PROJECT_ROOT, file))) {
        fs.unlinkSync(path.join(PROJECT_ROOT, file));
        console.log(`✓ Deleted: ${file}`);
        removedFiles++;
      }
    });
  } catch (error) {
    console.warn('Could not clean diagnostic files:', error.message);
  }
  
  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Directories removed: ${removedDirs}`);
  console.log(`   Files removed: ${removedFiles}\n`);
  console.log('💡 Run your build command to regenerate outputs.\n');
}

if (require.main === module) {
  main();
}

module.exports = { main };

