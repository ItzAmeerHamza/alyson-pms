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
};
