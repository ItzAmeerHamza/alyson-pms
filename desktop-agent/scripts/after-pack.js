const { execSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • removing FinderInfo/fileprovider detritus (macOS 26 fix)`);

  const script = path.join(os.tmpdir(), 'eb-clean-xattr.py');
  fs.writeFileSync(script, `
import subprocess, os, sys
app = sys.argv[1]
count = 0
for root, dirs, files in os.walk(app):
    for name in list(dirs) + list(files) + ['']:
        p = os.path.join(root, name) if name else root
        for attr in ['com.apple.FinderInfo', 'com.apple.fileprovider.fpfs#P']:
            r = subprocess.run(['xattr', '-d', attr, p], capture_output=True)
            if r.returncode == 0:
                count += 1
print(f'Removed {count} detritus xattrs')
`);

  try {
    const result = execFileSync('python3', [script, appPath], { encoding: 'utf8', timeout: 120000 });
    console.log(`  • ${result.trim()}`);
  } catch (e) {
    console.warn(`  ⚠ cleanup: ${e.message}`);
  }

  const helperPath = path.join(appPath, 'Contents', 'Resources', 'helpers', 'macos-input-helper');
  if (fs.existsSync(helperPath)) {
    try {
      fs.chmodSync(helperPath, 0o755);
      // Prefer the stable CI identity so Accessibility grants on this helper persist.
      // Do not use --options runtime here — main app is not hardened-runtime signed.
      const signIdentity =
        process.env.CSC_NAME ||
        process.env.APPLE_IDENTITY ||
        'Alyson PM Code Signing';
      try {
        execSync(`codesign --force --sign "${signIdentity}" "${helperPath}"`, {
          stdio: 'inherit',
          timeout: 60000,
        });
        console.log(`  • signed macos-input-helper (${signIdentity})`);
      } catch (primaryErr) {
        execSync(`codesign --force --sign - "${helperPath}"`, { stdio: 'inherit', timeout: 60000 });
        console.log('  • signed macos-input-helper (ad-hoc fallback)');
      }
    } catch (e) {
      console.warn(`  ⚠ could not codesign macos-input-helper: ${e.message}`);
    }
  } else {
    console.warn('  ⚠ macos-input-helper missing from Resources/helpers — clicks/keys will be 0 in installed builds');
  }
};
