#!/usr/bin/env node
/**
 * Download Python 3.11 embeddable (amd64) into python-windows/ for Windows packaging.
 * Same behavior as bundle-python-windows.ps1 — works on macOS/Linux/Windows (no PowerShell required).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

const DESKTOP_AGENT = path.join(__dirname, '..');
const PYTHON_WINDOWS = path.join(DESKTOP_AGENT, 'python-windows');
const PYTHON_EXE = path.join(PYTHON_WINDOWS, 'python.exe');
const PYTHON_VERSION = '3.11.9';
const ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;

function downloadOnce(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.part';
    const file = fs.createWriteStream(tmp);
    const req = https.get(url, { headers: { 'User-Agent': 'alyson-desktop-build' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        file.close(() => fs.unlink(tmp, () => {}));
        const next = res.headers.location;
        if (!next) {
          reject(new Error('Redirect without Location'));
          return;
        }
        const abs = next.startsWith('http') ? next : new URL(next, url).href;
        downloadOnce(abs, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close(() => fs.unlink(tmp, () => {}));
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          fs.renameSync(tmp, dest);
          resolve();
        });
      });
    });
    req.on('error', (e) => {
      try {
        file.close();
        fs.unlinkSync(tmp);
      } catch (_) {}
      reject(e);
    });
  });
}

function extractZip(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  // Windows 10+ and macOS/Linux: bsdtar / GNU tar often support zip
  try {
    execSync(`tar -xf "${zipPath}" -C "${outDir}"`, { stdio: 'inherit' });
    return;
  } catch (_) {
    /* fall through */
  }
  try {
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: 'inherit' });
    return;
  } catch (e) {
    throw new Error(
      'Could not extract zip (tried tar -xf and unzip). Install unzip or use Windows with PowerShell.',
      { cause: e }
    );
  }
}

async function main() {
  if (fs.existsSync(PYTHON_EXE)) {
    console.log('[OK] Python embeddable already in python-windows (python.exe present)');
    console.log('    To re-download, delete python-windows/python.exe first');
    process.exit(0);
  }

  const tmpZip = path.join(os.tmpdir(), `python-${PYTHON_VERSION}-embed-amd64.zip`);
  console.log('[DOWNLOAD]', ZIP_URL);
  await downloadOnce(ZIP_URL, tmpZip);
  console.log('[OK] Download complete');

  console.log('[EXTRACT]', PYTHON_WINDOWS);
  extractZip(tmpZip, PYTHON_WINDOWS);
  try {
    fs.unlinkSync(tmpZip);
  } catch (_) {}

  if (!fs.existsSync(PYTHON_EXE)) {
    console.error('[ERROR] python.exe not found after extraction');
    process.exit(1);
  }
  console.log('[OK] Python embeddable bundled successfully');
  process.exit(0);
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
