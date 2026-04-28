#!/usr/bin/env node

/**
 * Electron Build Cleanup Script
 * Removes old Electron build artifacts while keeping the latest builds
 * Run after desktop-agent builds to prevent disk space bloat
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DESKTOP_AGENT_ROOT = path.resolve(__dirname, '..', 'desktop-agent');
const DIST_DIR = path.join(DESKTOP_AGENT_ROOT, 'dist');

function cleanupOldBuilds() {
  console.log('🧹 Cleaning up old Electron builds...\n');
  
  if (!fs.existsSync(DIST_DIR)) {
    console.log('✓ No dist directory found, nothing to clean.');
    return;
  }
  
  try {
    // Get size before cleanup
    const sizeBefore = execSync(`du -sh "${DIST_DIR}" 2>/dev/null || echo "0"`, {
      encoding: 'utf8',
    }).split('\t')[0];
    
    console.log(`📊 Current dist size: ${sizeBefore}`);
    
    // Remove unpacked directories (they're large and can be regenerated)
    const unpackedDirs = [
      'win-unpacked',
      'win-arm64-unpacked',
      'mac',
      'mac-arm64',
      'mac-universal',
      'linux-unpacked',
    ];
    
    let removedCount = 0;
    unpackedDirs.forEach(dir => {
      const dirPath = path.join(DIST_DIR, dir);
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`✓ Removed: ${dir}/`);
        removedCount++;
      }
    });
    
    // Clean .blockmap files (they can be regenerated)
    const blockmapFiles = fs.readdirSync(DIST_DIR)
      .filter(f => f.endsWith('.blockmap'));
    
    blockmapFiles.forEach(file => {
      fs.unlinkSync(path.join(DIST_DIR, file));
      console.log(`✓ Removed: ${file}`);
      removedCount++;
    });
    
    // Get size after cleanup
    const sizeAfter = execSync(`du -sh "${DIST_DIR}" 2>/dev/null || echo "0"`, {
      encoding: 'utf8',
    }).split('\t')[0];
    
    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Before: ${sizeBefore}`);
    console.log(`   After: ${sizeAfter}`);
    console.log(`   Items removed: ${removedCount}\n`);
    
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

function main() {
  cleanupOldBuilds();
  
  console.log('💡 Tip: Packaged installers (.dmg, .exe, .AppImage) are kept.');
  console.log('   They are uploaded to GitHub Releases and tracked in git.\n');
}

if (require.main === module) {
  main();
}

module.exports = { main };

