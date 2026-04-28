/**
 * Ensures `dist/` points to a directory outside iCloud/File Provider scope.
 *
 * On macOS 26+, ~/Documents is managed by iCloudDriveFileProvider which
 * stamps every new directory with com.apple.FinderInfo and
 * com.apple.fileprovider.fpfs#P extended attributes.  Apple's codesign
 * rejects these as "resource fork / Finder information / similar detritus".
 *
 * Fix: symlink dist → /tmp/eb-dist so the build happens outside the
 * File Provider's watch scope.  On non-macOS platforms this is a no-op.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distPath = path.join(__dirname, '..', 'dist');
const safeDist = '/tmp/eb-dist';

if (process.platform !== 'darwin') {
  process.exit(0);
}

try {
  const stat = fs.lstatSync(distPath);
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(distPath);
    if (target === safeDist) {
      fs.mkdirSync(safeDist, { recursive: true });
      process.exit(0);
    }
    fs.unlinkSync(distPath);
  } else if (stat.isDirectory()) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

fs.mkdirSync(safeDist, { recursive: true });
fs.symlinkSync(safeDist, distPath);
console.log(`  • dist → ${safeDist} (macOS codesign fix)`);
