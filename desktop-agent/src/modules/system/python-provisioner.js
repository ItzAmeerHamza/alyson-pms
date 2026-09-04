/**
 * Python Auto-Provisioner
 *
 * Ensures Python is available for input detection at runtime.
 * - Windows: Downloads Python embeddable if bundled version is missing
 * - macOS: Verifies bundled/system Python3 and PyObjC. Packaged apps never pip-install.
 * - Linux: Verifies system Python3 availability
 *
 * Called during startup BEFORE input detection is initialized.
 * Startup, session restore, and Start Tracking can race this — one in-flight
 * ensurePython is shared so overlapping pip/python probes cannot freeze the UI.
 */

const path = require('path');
const fs = require('fs');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/** Shared across instances so `new PythonProvisioner()` cannot overlap work. */
let _ensureInFlight = null;
let _lastReadyStatus = null;

/**
 * pip is only allowed in known unpackaged (dev) Electron.
 * Unknown / packaged / tests: never pip — 120s PyObjC installs freeze the Mac UI.
 */
function shouldAllowPipInstall(isPackaged) {
  return isPackaged === false;
}

function readIsPackaged() {
  try {
    const { app } = require('electron');
    if (app && typeof app.isPackaged === 'boolean') return app.isPackaged;
  } catch (_) {
    // electron missing (unit tests) — treat as packaged so pip cannot run
  }
  return true;
}

// Windows embeddable Python config
const PYTHON_VERSION = '3.11.9';
const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;

class PythonProvisioner {
  constructor() {
    this.platform = process.platform;
    this.provisioned = false;
    this.status = { ready: false, pythonPath: null, message: '', errors: [] };
    this._allowDownload = false;
  }

  /**
   * Main entry point: ensure Python is available and working
   * Returns { ready: boolean, pythonPath: string|null, message: string, errors: string[] }
   */
  async ensurePython(options = {}) {
    if (_lastReadyStatus && _lastReadyStatus.ready) {
      return _lastReadyStatus;
    }
    if (_ensureInFlight) {
      const inFlight = await _ensureInFlight;
      if (options.allowDownload === true && !(inFlight && inFlight.ready)) {
        return this._ensurePythonUncached(options);
      }
      return inFlight;
    }
    _ensureInFlight = this._ensurePythonUncached(options);
    try {
      return await _ensureInFlight;
    } finally {
      _ensureInFlight = null;
    }
  }

  async _ensurePythonUncached(options = {}) {
    console.log(`🐍 [PYTHON-PROVISION] Checking Python availability on ${this.platform}...`);
    this._allowDownload = options.allowDownload === true;

    try {
      if (this.platform === 'win32') {
        return await this._ensureWindowsPython();
      } else if (this.platform === 'darwin') {
        return await this._ensureMacOSPython();
      } else {
        return await this._ensureLinuxPython();
      }
    } catch (error) {
      console.error(`❌ [PYTHON-PROVISION] Unexpected error:`, error.message);
      this.status = { ready: false, pythonPath: null, message: error.message, errors: [error.message] };
      return this.status;
    }
  }

  // =========== WINDOWS ===========

  async _ensureWindowsPython() {
    const { app } = require('electron');
    const isPackaged = app && app.isPackaged;

    // Step 1: Check bundled Python (extraResources puts it in Resources dir)
    if (isPackaged) {
      const resourcesBase = process.resourcesPath || path.join(app.getAppPath(), '..');
      const appPath = app.getAppPath();
      const unpackedBase = appPath.replace(/app\.asar$/, 'app.asar.unpacked');

      // Check all possible bundled locations
      const candidates = [
        path.join(resourcesBase, 'python-windows', 'python.exe'),        // extraResources (new)
        path.join(unpackedBase, 'python-windows', 'python.exe'),          // asarUnpack (legacy)
      ];

      console.log(`🔍 [PYTHON-PROVISION] Checking ${candidates.length} bundled Python paths on Windows...`);
      for (const bundledPython of candidates) {
        if (fs.existsSync(bundledPython)) {
          console.log(`✅ [PYTHON-PROVISION] Bundled Python found: ${bundledPython}`);
          return this._success(bundledPython, 'Bundled Python available');
        }
      }

      console.warn(`⚠️ [PYTHON-PROVISION] Bundled Python missing — checked:\n  ${candidates.join('\n  ')}`);

      // Step 2: Check previously auto-downloaded Python in AppData
      const downloadDir = path.join(app.getPath('userData'), 'python-windows');
      const downloadedPython = path.join(downloadDir, 'python.exe');

      if (fs.existsSync(downloadedPython)) {
        const verified = await this._verifyPython(downloadedPython);
        if (verified) {
          console.log(`✅ [PYTHON-PROVISION] Previously downloaded Python found: ${downloadedPython}`);
          return this._success(downloadedPython, 'Downloaded Python available');
        }
      }

      // Step 3: Try to auto-download as last resort (never during app boot).
      if (this._allowDownload) {
        console.log(`📥 [PYTHON-PROVISION] Downloading Python ${PYTHON_VERSION} embeddable...`);
        const downloaded = await this._downloadWindowsPython(downloadDir);
        if (downloaded && fs.existsSync(downloadedPython)) {
          const verified = await this._verifyPython(downloadedPython);
          if (verified) {
            return this._success(downloadedPython, `Downloaded Python ${PYTHON_VERSION} successfully`);
          }
        }
      } else {
        console.log('🐍 [PYTHON-PROVISION] Skipping Python download on startup (will retry when tracking starts)');
      }
    } else {
      // Development mode: check local bundled
      const devBundled = path.join(__dirname, '..', '..', '..', 'python-windows', 'python.exe');
      if (fs.existsSync(devBundled)) {
        return this._success(devBundled, 'Dev bundled Python available');
      }
    }

    // Step 3: Fall back to system Python
    const systemPython = await this._findSystemPython([
      'python', 'python3', 'py',
      'C:\\Python311\\python.exe', 'C:\\Python312\\python.exe', 'C:\\Python313\\python.exe',
    ]);

    if (systemPython) {
      return this._success(systemPython, 'System Python available');
    }

    return this._fail('No Python found. Bundled Python missing and system Python not installed.',
      ['Bundled Python not in build', 'System Python not found', 'Auto-download may have failed']);
  }

  async _downloadWindowsPython(targetDir) {
    try {
      const https = require('https');
      const http = require('http');

      // Create target directory
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const zipPath = path.join(targetDir, 'python-embed.zip');

      // Download the zip file
      console.log(`📥 [PYTHON-PROVISION] Downloading from: ${PYTHON_ZIP_URL}`);
      await this._downloadFile(PYTHON_ZIP_URL, zipPath);

      if (!fs.existsSync(zipPath)) {
        console.error(`❌ [PYTHON-PROVISION] Download failed - file not created`);
        return false;
      }

      const fileSize = fs.statSync(zipPath).size;
      console.log(`📦 [PYTHON-PROVISION] Downloaded ${Math.round(fileSize / 1024 / 1024)}MB, extracting...`);

      // Extract using PowerShell (available on all Windows 10+)
      await execAsync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`,
        { timeout: 60000 }
      );

      // Clean up zip
      try { fs.unlinkSync(zipPath); } catch (_) {}

      console.log(`✅ [PYTHON-PROVISION] Extracted Python to: ${targetDir}`);

      // Store provisioning info
      global.pythonDiagnostics = global.pythonDiagnostics || {};
      global.pythonDiagnostics.autoProvisioned = true;
      global.pythonDiagnostics.provisionedPath = targetDir;
      global.pythonDiagnostics.provisionedVersion = PYTHON_VERSION;
      global.pythonDiagnostics.provisionedAt = new Date().toISOString();

      return true;
    } catch (error) {
      console.error(`❌ [PYTHON-PROVISION] Download/extract failed:`, error.message);
      this.status.errors.push(`Download failed: ${error.message}`);

      global.pythonDiagnostics = global.pythonDiagnostics || {};
      global.pythonDiagnostics.autoProvisionError = error.message;

      return false;
    }
  }

  _downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const file = fs.createWriteStream(destPath);
      let redirectCount = 0;

      const doRequest = (requestUrl) => {
        https.get(requestUrl, { timeout: 30000 }, (response) => {
          // Handle redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            redirectCount++;
            if (redirectCount > 5) {
              reject(new Error('Too many redirects'));
              return;
            }
            doRequest(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }

          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch (_) {}
          reject(err);
        });
      };

      doRequest(url);
    });
  }

  // =========== macOS ===========

  async _ensureMacOSPython() {
    const { app } = require('electron');
    const isPackaged = readIsPackaged();

    // Determine arch subdirectory: arm64 or x64
    const archDir = process.arch === 'arm64' ? 'arm64' : 'x64';
    console.log(`🐍 [PYTHON-PROVISION] Runtime arch: ${process.arch} → looking for ${archDir} bundle`);

    // Step 1: Check arch-specific bundled Python
    // Production: extraResources places python-macos/ in the app's Resources directory
    // Dev: python-macos/ is in the desktop-agent project root
    if (isPackaged) {
      // In production, extraResources end up in:
      //   macOS:   MyApp.app/Contents/Resources/python-macos/
      //   or via process.resourcesPath
      const resourcesBase = process.resourcesPath || path.join(app.getAppPath(), '..', '..');

      // New layout (multi-arch): python-macos/{arm64,x64}/python/bin/python3
      const archBundled = path.join(resourcesBase, 'python-macos', archDir, 'python', 'bin', 'python3');
      // Legacy layout (single-arch, pre-v1.0.154): python-macos/python/bin/python3
      const legacyBundled = path.join(resourcesBase, 'python-macos', 'python', 'bin', 'python3');
      // Also check inside app.asar.unpacked (in case older build used files/asarUnpack)
      const unpackedBase = app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked');
      const asarArchBundled = path.join(unpackedBase, 'python-macos', archDir, 'python', 'bin', 'python3');
      const asarLegacyBundled = path.join(unpackedBase, 'python-macos', 'python', 'bin', 'python3');

      const candidates = [archBundled, legacyBundled, asarArchBundled, asarLegacyBundled];
      console.log(`🔍 [PYTHON-PROVISION] Checking ${candidates.length} bundled Python paths...`);

      for (const bundledPython of candidates) {
        if (fs.existsSync(bundledPython)) {
          console.log(`✅ [PYTHON-PROVISION] Bundled Python found: ${bundledPython}`);
          const hasPyObjC = await this._checkPyObjC(bundledPython);
          if (hasPyObjC) {
            return this._success(bundledPython, `Bundled Python (${archDir}) with PyObjC available`);
          }
          console.warn(`⚠️ [PYTHON-PROVISION] Bundled Python exists but PyObjC missing`);
          return this._success(bundledPython, `Bundled Python (${archDir}) without PyObjC (reduced functionality)`);
        }
      }

      console.warn(`⚠️ [PYTHON-PROVISION] Bundled Python missing — checked:\n  ${candidates.join('\n  ')}`);
    } else {
      // Development mode: check local bundled (desktop-agent/python-macos/)
      const devBase = path.join(__dirname, '..', '..', '..');
      const devArchBundled = path.join(devBase, 'python-macos', archDir, 'python', 'bin', 'python3');
      const devLegacyBundled = path.join(devBase, 'python-macos', 'python', 'bin', 'python3');

      for (const bundledPython of [devArchBundled, devLegacyBundled]) {
        if (fs.existsSync(bundledPython)) {
          console.log(`✅ [PYTHON-PROVISION] Dev bundled Python found: ${bundledPython}`);
          const hasPyObjC = await this._checkPyObjC(bundledPython);
          if (hasPyObjC) {
            return this._success(bundledPython, `Dev bundled Python (${archDir}) with PyObjC`);
          }
          return this._success(bundledPython, `Dev bundled Python (${archDir}) without PyObjC (reduced functionality)`);
        }
      }
    }

    // Step 2: Fall back to system Python
    console.warn(`⚠️ [PYTHON-PROVISION] Bundled Python not available, trying system Python as fallback...`);
    return this._ensureMacOSSystemPythonFallback();
  }

  /**
   * System Python fallback — used when bundled Python isn't found.
   * Tries system Python paths + PyObjC via bundled libs or pip.
   */
  async _ensureMacOSSystemPythonFallback() {
    const pythonPaths = ['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3', 'python3'];
    const pythonExe = await this._findSystemPython(pythonPaths);

    if (!pythonExe) {
      return this._fail('Python3 not found on macOS', ['No bundled Python', 'No python3 in standard paths']);
    }

    // Check if system Python has PyObjC
    const pyobjcAvailable = await this._checkPyObjC(pythonExe);
    if (pyobjcAvailable) {
      console.log(`✅ [PYTHON-PROVISION] System Python ready with PyObjC: ${pythonExe}`);
      return this._success(pythonExe, 'System Python3 with PyObjC available (fallback)');
    }

    // Check bundled python-libs
    const { app } = require('electron');
    const isPackaged = readIsPackaged();
    let bundledLibsPath;

    if (isPackaged) {
      const appPath = app.getAppPath();
      const unpackedBase = appPath.replace(/app\.asar$/, 'app.asar.unpacked');
      bundledLibsPath = path.join(unpackedBase, 'python-libs');
    } else {
      bundledLibsPath = path.join(__dirname, '..', '..', '..', 'python-libs');
    }

    if (fs.existsSync(bundledLibsPath)) {
      const bundledWorks = await this._checkPyObjCWithPath(pythonExe, bundledLibsPath);
      if (bundledWorks) {
        console.log(`✅ [PYTHON-PROVISION] Bundled PyObjC libs work: ${bundledLibsPath}`);
        return this._success(pythonExe, 'System Python3 with bundled PyObjC (fallback)');
      }
      console.warn(`⚠️ [PYTHON-PROVISION] Bundled PyObjC libs failed import test`);
    }

    // Packaged apps: never pip-install PyObjC. It takes up to 120s, usually
    // fails (PEP 668 / no write), and overlapping runs freeze the Electron UI.
    if (!shouldAllowPipInstall(isPackaged)) {
      console.warn(`⚠️ [PYTHON-PROVISION] Skipping pip install (packaged Mac) — input monitor may have reduced functionality`);
      return this._success(pythonExe, 'Python3 available but PyObjC missing (reduced functionality)');
    }

    // Dev only: try pip install as last resort
    console.log(`📥 [PYTHON-PROVISION] Attempting pip install of PyObjC...`);
    const installed = await this._pipInstallPyObjC(pythonExe);

    if (installed) {
      const worksNow = await this._checkPyObjC(pythonExe);
      if (worksNow) {
        return this._success(pythonExe, 'Installed PyObjC via pip (fallback)');
      }
    }

    console.warn(`⚠️ [PYTHON-PROVISION] PyObjC not available - input monitor may have reduced functionality`);
    return this._success(pythonExe, 'Python3 available but PyObjC missing (reduced functionality)');
  }

  async _checkPyObjC(pythonExe) {
    try {
      await execAsync(`"${pythonExe}" -c "from Quartz import CGEventTapCreate; print('ok')"`, { timeout: 10000 });
      return true;
    } catch (_) {
      return false;
    }
  }

  async _checkPyObjCWithPath(pythonExe, libPath) {
    try {
      const env = { ...process.env, PYTHONPATH: libPath };
      await execAsync(`"${pythonExe}" -c "from Quartz import CGEventTapCreate; print('ok')"`, { timeout: 10000, env });
      return true;
    } catch (_) {
      return false;
    }
  }

  async _pipInstallPyObjC(pythonExe) {
    if (!shouldAllowPipInstall(readIsPackaged())) {
      console.warn(`⚠️ [PYTHON-PROVISION] Skipping pip install (packaged or unknown runtime)`);
      return false;
    }
    try {
      // Install to user site-packages so no sudo needed
      await execAsync(
        `"${pythonExe}" -m pip install --user pyobjc-core pyobjc-framework-Cocoa pyobjc-framework-Quartz 2>&1`,
        { timeout: 120000 }
      );
      console.log(`✅ [PYTHON-PROVISION] PyObjC installed via pip`);

      global.pythonDiagnostics = global.pythonDiagnostics || {};
      global.pythonDiagnostics.pipInstalled = true;
      global.pythonDiagnostics.pipInstalledAt = new Date().toISOString();

      return true;
    } catch (error) {
      console.warn(`⚠️ [PYTHON-PROVISION] pip install failed:`, error.message?.substring(0, 200));
      this.status.errors.push(`pip install failed: ${error.message?.substring(0, 200)}`);

      global.pythonDiagnostics = global.pythonDiagnostics || {};
      global.pythonDiagnostics.pipInstallError = error.message?.substring(0, 300);

      return false;
    }
  }

  // =========== Linux ===========

  async _ensureLinuxPython() {
    const pythonExe = await this._findSystemPython(['/usr/bin/python3', '/usr/bin/python', 'python3', 'python']);

    if (pythonExe) {
      return this._success(pythonExe, 'System Python3 available');
    }

    return this._fail('Python3 not found on Linux', ['No python3 in /usr/bin or PATH']);
  }

  // =========== Shared Helpers ===========

  async _findSystemPython(paths) {
    for (const p of paths) {
      try {
        if (!p || p.trim() === '') continue;
        const { stdout } = await execAsync(`"${p}" --version`, { timeout: 5000 });
        if (stdout.includes('Python')) {
          return p;
        }
      } catch (_) {
        // Try next
      }
    }
    return null;
  }

  async _verifyPython(pythonPath) {
    try {
      const { stdout } = await execAsync(`"${pythonPath}" --version`, { timeout: 5000 });
      return stdout.includes('Python');
    } catch (_) {
      return false;
    }
  }

  _success(pythonPath, message) {
    console.log(`✅ [PYTHON-PROVISION] ${message}`);
    this.status = { ready: true, pythonPath, message, errors: this.status.errors };
    this.provisioned = true;
    _lastReadyStatus = this.status;

    // Store in global diagnostics
    global.pythonDiagnostics = global.pythonDiagnostics || {};
    global.pythonDiagnostics.provisionerResult = 'success';
    global.pythonDiagnostics.foundPath = pythonPath;

    // Populate Python version (one-shot, non-blocking, diagnostic only)
    execAsync(`"${pythonPath}" --version`, { timeout: 5000 })
      .then(({ stdout, stderr }) => {
        const versionStr = (stdout || stderr || '').trim();
        global.pythonDiagnostics.version = versionStr || 'unknown';
        console.log(`🐍 [PYTHON-PROVISION] Version: ${global.pythonDiagnostics.version}`);
      })
      .catch(() => {
        global.pythonDiagnostics.version = 'unknown';
      });

    return this.status;
  }

  _fail(message, errors = []) {
    console.error(`❌ [PYTHON-PROVISION] ${message}`);
    this.status = { ready: false, pythonPath: null, message, errors: [...this.status.errors, ...errors] };

    // Store in global diagnostics
    global.pythonDiagnostics = global.pythonDiagnostics || {};
    global.pythonDiagnostics.provisionerResult = 'failed';
    global.pythonDiagnostics.provisionerErrors = this.status.errors;

    return this.status;
  }
}

PythonProvisioner.shouldAllowPipInstall = shouldAllowPipInstall;
PythonProvisioner.readIsPackaged = readIsPackaged;
PythonProvisioner.resetForTests = () => {
  _ensureInFlight = null;
  _lastReadyStatus = null;
};

module.exports = PythonProvisioner;
