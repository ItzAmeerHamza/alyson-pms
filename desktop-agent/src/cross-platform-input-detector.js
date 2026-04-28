/**
 * CROSS-PLATFORM REAL INPUT DETECTOR
 * Based on ChatGPT solution but adapted for Electron
 * Uses native OS APIs for real input detection instead of simulation
 */

const { EventEmitter } = require('events');
const { exec, spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const debugLogger = require('./modules/utils/debug-logger');
const { logger } = require('./modules/utils/logger');

// Resolve a resource path that may live inside app.asar; if so, point to app.asar.unpacked
function resolveAsarUnpacked(resourcePath) {
  if (typeof resourcePath !== 'string') return resourcePath;
  
  // In production, __dirname will contain app.asar
  // We need to replace it with app.asar.unpacked for Python scripts
  if (resourcePath.includes('app.asar')) {
    const unpackedPath = resourcePath.replace('app.asar', 'app.asar.unpacked');
    console.log('🔧 [ASAR] Resolved unpacked path:', unpackedPath);
    return unpackedPath;
  }
  
  // If we're in production but app.asar isn't in the path yet,
  // check if we need to add the unpacked suffix
  const app = require('electron').app || require('@electron/remote').app;
  const isPackaged = app && app.isPackaged;
  
  if (isPackaged && !resourcePath.includes('app.asar')) {
    // Get app path and construct unpacked path
    const appPath = app.getAppPath();
    if (appPath.includes('app.asar')) {
      const basePath = appPath.replace('app.asar', 'app.asar.unpacked');
      const relativePath = path.relative(appPath, resourcePath);
      const unpackedPath = path.join(basePath, relativePath);
      console.log('🔧 [ASAR] Constructed unpacked path:', unpackedPath);
      return unpackedPath;
    }
  }
  
  return resourcePath;
}

class CrossPlatformInputDetector extends EventEmitter {
  constructor() {
    super();
    this.isActive = false;
    this.platform = process.platform;
    this.activityMap = new Set();
    this.stats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      lastActivity: Date.now()
    };
    this.monitors = [];
    this.startTime = Date.now();
    
    this.pythonFailureCount = 0;
    this.pythonMaxRetries = 4;
    this.pythonBackoffDelays = [5000, 15000, 45000, 120000]; // 5s, 15s, 45s, 2min
    this.pythonDisabled = false;
    this.pythonStableTimer = null;
    
    this.fallbackActive = {
      macOS: false,
      windows: false,
      linux: false
    };
    
    this.pythonProcess = null;
    
    console.log(`🌍 Cross-Platform Input Detector initialized for ${this.platform}`);
  }

  async start(electronModules = {}) {
    if (this.isActive) {
      console.log('⚠️ Input detector already active');
      return;
    }

    this.electronModules = electronModules;
    this.isActive = true;

    console.log('🚀 Starting Cross-Platform Input Detector...');

    try {
      switch (this.platform) {
        case 'darwin': // macOS
          await this.startMacOSDetection();
          break;
        case 'win32': // Windows
          await this.startWindowsDetection();
          break;
        case 'linux': // Linux
          await this.startLinuxDetection();
          break;
        default:
          console.error('❌ Unsupported platform:', this.platform);
          return;
      }

      // Start activity tracking and reporting
      this.startActivityTracking();
      console.log('✅ Cross-Platform Input Detector started successfully');
    } catch (error) {
      console.error('❌ Failed to start input detector:', error);
      this.isActive = false;
    }
  }

  async startMacOSDetection() {
    console.log('🍎 Initializing macOS input detection...');

    // Method 1: Use native Swift helper with NSEvent (requires Accessibility permission)
    // This replaces the old Python/CGEventTap approach that required Input Monitoring permission
    await this.startNativeMacOSInputMonitor();

    // Method 2: Electron PowerMonitor enhancement (minimal usage)
    if (this.electronModules.powerMonitor) {
      this.startElectronPowerMonitorDetection();
    }
  }

  async startNativeMacOSInputMonitor() {
    try {
      console.log('🍎 Starting native macOS input monitor (Swift/Accessibility)...');

      // Locate the compiled Swift helper binary
      let app = null;
      try {
        // In some dev setups Electron can be running in "Node mode" (ELECTRON_RUN_AS_NODE),
        // where `require('electron').app` is unavailable. We still want input capture.
        const electron = require('electron');
        app = electron && electron.app ? electron.app : null;
      } catch {
        app = null;
      }
      const isPackaged = !!(app && app.isPackaged);
      let helperPath;

      if (isPackaged) {
        // In production: binary is in extraResources
        helperPath = path.join(process.resourcesPath, 'helpers', 'macos-input-helper');
      } else {
        // In development: binary is compiled into desktop-agent/helpers/
        // __dirname is desktop-agent/src/, so go one level up
        helperPath = path.join(__dirname, '..', 'helpers', 'macos-input-helper');
      }

      console.log(`📍 [SWIFT] Helper path: "${helperPath}"`);
      console.log(`📍 [SWIFT] Helper exists? ${fs.existsSync(helperPath)}`);

      if (!fs.existsSync(helperPath)) {
        console.error(`❌ [SWIFT] Helper binary not found at: ${helperPath}`);

        // Dev convenience: auto-build the helper if Swift toolchain exists.
        // In production the helper must be shipped via extraResources.
        if (!isPackaged) {
          try {
            const buildScript = path.join(__dirname, '..', 'scripts', 'build-swift-helper.sh');
            console.log(`🔧 [SWIFT] Attempting to build helper via: "${buildScript}"`);
            if (fs.existsSync(buildScript)) {
              await new Promise((resolve, reject) => {
                execFile('bash', [buildScript], { cwd: path.join(__dirname, '..') }, (err, stdout, stderr) => {
                  if (stdout) console.log(stdout.toString().trim());
                  if (stderr) console.warn(stderr.toString().trim().substring(0, 500));
                  if (err) return reject(err);
                  resolve(null);
                });
              });
              console.log(`📍 [SWIFT] Helper exists after build? ${fs.existsSync(helperPath)}`);
            } else {
              console.warn('⚠️ [SWIFT] Build script not found; skipping auto-build');
            }
          } catch (e) {
            console.warn('⚠️ [SWIFT] Auto-build failed; clicks/keystrokes will stay at 0 unless helper is built manually.', e?.message || e);
          }
        }

        if (!fs.existsSync(helperPath)) {
          console.log('⚠️ [SWIFT] Falling back to Electron PowerMonitor for activity detection (no click/keystroke counts).');
          this.startElectronPowerMonitorDetection();
          return;
        }
      }

      // Spawn the Swift helper process
      const helperProcess = spawn(helperPath, [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env: process.env
      });
      console.log(`✅ [SWIFT] Helper process started (PID: ${helperProcess.pid})`);

      // Store process reference for cleanup (reuse existing pythonProcess field for compat)
      this.pythonProcess = helperProcess;

      // Process stdout — same JSON format as old Python script
      let isProcessingData = false;

      helperProcess.stdout.on('data', (data) => {
        if (!this.isActive || global.isTracking === false || global.isStopping === true) {
          return;
        }
        if (isProcessingData) return;
        isProcessingData = true;

        setImmediate(() => {
          try {
            const lines = data.toString().split('\n').filter(line => line.trim());
            const processBatch = (batchStart = 0) => {
              const batchSize = 5;
              const batchEnd = Math.min(batchStart + batchSize, lines.length);
              for (let i = batchStart; i < batchEnd; i++) {
                try {
                  const event = JSON.parse(lines[i]);
                  this.handleExternalPythonEvent(event);
                } catch (error) {
                  if (!this.lastHelperLogTime || Date.now() - this.lastHelperLogTime > 5000) {
                    console.log('📝 Swift helper output (throttled):', lines[i]);
                    this.lastHelperLogTime = Date.now();
                  }
                }
              }
              if (batchEnd < lines.length) {
                process.nextTick(() => processBatch(batchEnd));
              } else {
                isProcessingData = false;
              }
            };
            processBatch();
          } catch (error) {
            console.error('❌ Error processing Swift helper data:', error);
            isProcessingData = false;
          }
        });
      });

      helperProcess.stderr.on('data', (data) => {
        const errorStr = data.toString().trim();
        if (errorStr) {
          console.warn('⚠️ [Swift helper stderr]:', errorStr.substring(0, 200));
        }
      });

      helperProcess.on('error', (error) => {
        console.error('❌ Failed to spawn Swift helper:', error.message);
        this._handlePythonFailure(null, `swift spawn error: ${error.message}`);
      });

      helperProcess.on('exit', (code) => {
        console.log(`🍎 Swift helper exited with code: ${code}`);

        if (this.pythonDisabled) {
          console.log('⏹️  [SWIFT] Monitor disabled - NOT restarting');
          return;
        }

        if (code === 2) {
          this.pythonDisabled = true;
          console.log('🔒 [SWIFT] Accessibility permission denied (exit code 2) — NOT retrying');
          if (!global.pythonDiagnostics) global.pythonDiagnostics = {};
          global.pythonDiagnostics.permissionDenied = true;
          return;
        }

        if (code !== 0 && this.isActive) {
          if (this.pythonStableTimer) {
            clearTimeout(this.pythonStableTimer);
            this.pythonStableTimer = null;
          }
          this._handlePythonFailure(null, `swift exit code: ${code}`);
        }
      });

      this.monitors.push(helperProcess);
      console.log('✅ Native macOS input monitor started (Swift/Accessibility)');
      
      // Reset failure count after 10 minutes of stable operation
      if (this.pythonStableTimer) clearTimeout(this.pythonStableTimer);
      this.pythonStableTimer = setTimeout(() => {
        if (this.pythonFailureCount > 0) {
          console.log(`✅ [SWIFT] Stable for 10min — resetting failure count (was ${this.pythonFailureCount})`);
          this.pythonFailureCount = 0;
        }
      }, 10 * 60 * 1000);
    } catch (error) {
      console.error('❌ Failed to start native macOS input monitor:', error);
    }
  }



  async startExternalPythonMonitor(scriptPath) {
    try {
      console.log('🐍 Starting external Python monitor...');
      // Determine the Python executable based on platform
      let pythonExecutable = null;
      
      // PRIORITY: Use Python path from auto-provisioner if available
      if (global.provisionedPythonPath) {
        console.log(`🐍 [PYTHON] Using provisioned Python path: ${global.provisionedPythonPath}`);
        pythonExecutable = global.provisionedPythonPath;
      } else if (process.platform === 'win32') {
        // Windows: CRITICAL FIX v1.0.137 - Try bundled Python FIRST, then fall back to system Python
        const { app } = require('electron');
        const isPackaged = app && app.isPackaged;
        
        // Build comprehensive Python paths list for Windows
        const userProfile = process.env.USERPROFILE || '';
        const localAppData = process.env.LOCALAPPDATA || '';
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        
        const comprehensiveWindowsPaths = [
          // Standard commands (if in PATH)
          'python', 'python3', 'py',
          
          // System-wide installs (C:\PythonXX)
          'C:\\Python38\\python.exe',
          'C:\\Python39\\python.exe',
          'C:\\Python310\\python.exe',
          'C:\\Python311\\python.exe',
          'C:\\Python312\\python.exe',
          'C:\\Python313\\python.exe',
          
          // User-local installs (most common for new Python installs)
          path.join(localAppData, 'Programs', 'Python', 'Python38', 'python.exe'),
          path.join(localAppData, 'Programs', 'Python', 'Python39', 'python.exe'),
          path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
          path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
          path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
          path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
          
          // Program Files installs
          path.join(programFiles, 'Python38', 'python.exe'),
          path.join(programFiles, 'Python39', 'python.exe'),
          path.join(programFiles, 'Python310', 'python.exe'),
          path.join(programFiles, 'Python311', 'python.exe'),
          path.join(programFiles, 'Python312', 'python.exe'),
          path.join(programFiles, 'Python313', 'python.exe'),
          path.join(programFilesX86, 'Python38', 'python.exe'),
          path.join(programFilesX86, 'Python39', 'python.exe'),
          path.join(programFilesX86, 'Python310', 'python.exe'),
          
          // Chocolatey installs
          'C:\\ProgramData\\chocolatey\\lib\\python3\\tools\\python.exe',
          'C:\\ProgramData\\chocolatey\\bin\\python.exe',
          'C:\\tools\\python3\\python.exe',
          
          // Scoop installs
          path.join(userProfile, 'scoop', 'apps', 'python', 'current', 'python.exe'),
          path.join(userProfile, 'scoop', 'shims', 'python.exe'),
          
          // Anaconda/Miniconda
          path.join(userProfile, 'anaconda3', 'python.exe'),
          path.join(userProfile, 'miniconda3', 'python.exe'),
          path.join(userProfile, 'Anaconda3', 'python.exe'),
          path.join(userProfile, 'Miniconda3', 'python.exe'),
          'C:\\ProgramData\\Anaconda3\\python.exe',
          'C:\\ProgramData\\Miniconda3\\python.exe',
          path.join(localAppData, 'anaconda3', 'python.exe'),
          path.join(localAppData, 'miniconda3', 'python.exe'),
          path.join(localAppData, 'Continuum', 'anaconda3', 'python.exe'),
          path.join(localAppData, 'Continuum', 'miniconda3', 'python.exe'),
          
          // pyenv-win
          path.join(userProfile, '.pyenv', 'pyenv-win', 'shims', 'python.exe'),
          path.join(userProfile, '.pyenv', 'pyenv-win', 'versions', '3.11.0', 'python.exe'),
          path.join(userProfile, '.pyenv', 'pyenv-win', 'versions', '3.12.0', 'python.exe'),
          path.join(userProfile, '.pyenv', 'pyenv-win', 'versions', '3.10.0', 'python.exe'),
          
          // WinPython (portable)
          'C:\\WinPython\\python-3.11.0.amd64\\python.exe',
          'C:\\WinPython\\python-3.10.0.amd64\\python.exe',
        ].filter(p => p && !p.includes('WindowsApps')); // Skip Microsoft Store stub
        
        if (isPackaged) {
          // In production, use bundled Python from app.asar.unpacked
          const appPath = app.getAppPath();
          const unpackedBase = appPath.replace(/app\.asar$/, 'app.asar.unpacked');
          const bundledPython = path.join(unpackedBase, 'python-windows', 'python.exe');
          
          console.log(`🔧 [PYTHON-WIN] Checking for bundled Python at: ${bundledPython}`);
          
          if (fs.existsSync(bundledPython)) {
            pythonExecutable = bundledPython;
            console.log(`✅ [PYTHON-WIN] Using bundled Python: ${bundledPython}`);
          } else {
            console.warn(`⚠️ [PYTHON-WIN] Bundled Python not found at: ${bundledPython}`);
            // Fall back to system Python with comprehensive path list
            console.log(`🔍 [PYTHON-WIN] Searching ${comprehensiveWindowsPaths.length} possible Python locations...`);
            pythonExecutable = await this.findWorkingPython(comprehensiveWindowsPaths);
          }
        } else {
          // In development, check for local bundled Python first, then system Python
          const devBundledPython = path.join(__dirname, '..', 'python-windows', 'python.exe');
          
          if (fs.existsSync(devBundledPython)) {
            pythonExecutable = devBundledPython;
            console.log(`✅ [PYTHON-WIN] Using dev bundled Python: ${devBundledPython}`);
          } else {
            console.log(`🔍 [PYTHON-WIN] Searching ${comprehensiveWindowsPaths.length} possible Python locations...`);
            pythonExecutable = await this.findWorkingPython(comprehensiveWindowsPaths);
          }
        }
      } else if (process.platform === 'linux') {
        // Linux: Common Python paths
        pythonExecutable = await this.findWorkingPython(['/usr/bin/python3', '/usr/bin/python', 'python3', 'python']);
      } else {
        // macOS: Default paths
        pythonExecutable = await this.findWorkingPython(['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3', 'python3']);
      }
      
      if (!pythonExecutable) {
        console.warn('⚠️ Could not find working Python installation, falling back to Electron PowerMonitor');
        this.startElectronPowerMonitorDetection();
        return;
      }
      
      console.log(`📍 Using Python executable: ${pythonExecutable}`);
      // Run external Python script directly from system Python
      // Fix path handling for Windows with spaces
      const normalizedScriptPath = path.resolve(scriptPath);
      const scriptDir = path.dirname(normalizedScriptPath);
      
      console.log(`📂 Script path: "${normalizedScriptPath}"`);
      console.log(`📂 Working directory: "${scriptDir}"`);
      console.log(`📂 Script is readable: ${fs.existsSync(normalizedScriptPath)}`);
      
      if (!fs.existsSync(normalizedScriptPath)) {
        console.error(`❌ [PYTHON] Script not found at: ${normalizedScriptPath}`);
        console.log('⚠️ Falling back to Electron PowerMonitor');
        this.startElectronPowerMonitorDetection();
        return;
      }
      
      // CRITICAL FIX v1.0.143: Use execFile for Windows paths with spaces
      // execFile() bypasses shell entirely and passes arguments directly to the executable
      // This is the most reliable method for paths containing spaces on Windows
      console.log(`🚀 [PYTHON] Launching Python process...`);
      console.log(`   Python: "${pythonExecutable}"`);
      console.log(`   Script: "${normalizedScriptPath}"`);
      
      // Determine if we're using a bundled standalone Python (has its own PyObjC)
      // Bundled Python paths contain 'python-macos' or 'python-windows'
      const isBundledPython = pythonExecutable &&
        (pythonExecutable.includes('python-macos') || pythonExecutable.includes('python-windows'));
      
      const { app } = require('electron');
      const isPackaged = app && app.isPackaged;
      let pythonLibPath = '';
      
      if (isBundledPython) {
        // Bundled standalone Python already has PyObjC — do NOT add python-libs to
        // PYTHONPATH as it can cause circular-import conflicts between Python versions.
        console.log(`✅ [PYTHON] Using bundled standalone Python — no external PYTHONPATH needed`);
      } else if (isPackaged) {
        // System Python fallback in production — use bundled libraries from app.asar.unpacked
        const appPath = app.getAppPath();
        const unpackedBase = appPath.replace(/app\.asar$/, 'app.asar.unpacked');
        const bundledLibsPath = path.join(unpackedBase, 'python-libs');
        
        if (fs.existsSync(bundledLibsPath)) {
          pythonLibPath = bundledLibsPath;
          console.log(`✅ [PYTHON] Using bundled Python libraries: ${pythonLibPath}`);
        } else {
          console.warn(`⚠️ [PYTHON] Bundled libraries not found at: ${bundledLibsPath}`);
        }
      } else {
        // In development, check for local python-libs directory (only for system Python)
        const devLibsPath = path.join(__dirname, '..', 'python-libs');
        if (fs.existsSync(devLibsPath)) {
          pythonLibPath = devLibsPath;
          console.log(`✅ [PYTHON] Using development Python libraries: ${pythonLibPath}`);
        }
      }
      
      // Prepare environment
      const pythonEnv = { 
        ...process.env,
        PYTHONPATH: pythonLibPath ? pythonLibPath + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : '') : (process.env.PYTHONPATH || ''),
        // Use system Python environment, not Electron's
        PATH: process.platform === 'win32' 
          ? process.env.PATH 
          : '/usr/bin:/usr/local/bin:/opt/homebrew/bin:' + (process.env.PATH || '')
      };
      
      // CRITICAL FIX v1.0.143: Use execFile on Windows to properly handle paths with spaces
      // execFile() does NOT use shell, so paths are passed directly to the OS
      // This fixes: 'C:\Program' is not recognized error
      let pythonProcess;
      
      if (process.platform === 'win32') {
        // Windows: Use execFile which handles paths with spaces correctly
        // execFile bypasses cmd.exe entirely
        pythonProcess = execFile(pythonExecutable, [normalizedScriptPath], {
          cwd: scriptDir,
          env: pythonEnv,
          windowsHide: true,  // Prevent console window flash
          maxBuffer: 10 * 1024 * 1024  // 10MB buffer for stdout
        });
        
        // execFile returns ChildProcess, same as spawn
        console.log(`✅ [PYTHON-WIN] Process started with execFile (PID: ${pythonProcess.pid})`);
      } else {
        // macOS/Linux: Use spawn which works fine
        pythonProcess = spawn(pythonExecutable, [normalizedScriptPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
          env: pythonEnv,
          cwd: scriptDir
        });
        console.log(`✅ [PYTHON] Process started with spawn (PID: ${pythonProcess.pid})`);
      }

      // CRITICAL FIX: Store Python process reference for proper cleanup on stop
      this.pythonProcess = pythonProcess;

      // 🧠 Optimization: Add processing flag to prevent queue overflow
      let isProcessingPythonData = false;
      
      pythonProcess.stdout.on('data', (data) => {
// CRITICAL FIX H7: Stop processing immediately when detector is stopped
        // This prevents buffered Python stdout from being processed after stop
        // Check both local and global state as safety net
        if (!this.isActive || global.isTracking === false || global.isStopping === true) {
          return;
        }
        
        // 🧠 Optimization: Skip processing if already busy to prevent main thread blocking
        if (isProcessingPythonData) {
          return;
        }
        
        isProcessingPythonData = true;
        
        // 🧠 Optimization: Move JSON parsing to setImmediate to avoid blocking on every input event
        setImmediate(() => {
          try {
            const lines = data.toString().split('\n').filter(line => line.trim());
            
            // 🧠 Optimization: Process lines in batches using process.nextTick to prevent blocking
            const processBatch = (batchStart = 0) => {
              const batchSize = 5; // Process 5 lines at a time
              const batchEnd = Math.min(batchStart + batchSize, lines.length);
              
              for (let i = batchStart; i < batchEnd; i++) {
                try {
                  // 🧠 Before: JSON.parse() blocking on every input | After: Batched non-blocking processing
                  const event = JSON.parse(lines[i]);
                  this.handleExternalPythonEvent(event);
                } catch (error) {
                  // Throttle external Python output logging to prevent spam
                  if (!this.lastPythonLogTime || Date.now() - this.lastPythonLogTime > 5000) {
                    console.log('📝 External Python output (throttled):', lines[i]);
                    this.lastPythonLogTime = Date.now();
                  }
                }
              }
              
              if (batchEnd < lines.length) {
                // Process next batch on next tick
                process.nextTick(() => processBatch(batchEnd));
              } else {
                isProcessingPythonData = false;
              }
            };
            
            processBatch();
          } catch (error) {
            console.error('❌ Error processing Python data:', error);
            isProcessingPythonData = false;
          }
        });
      });

      pythonProcess.stderr.on('data', (data) => {
        const errorStr = data.toString().trim();
        
        // BUG 6 FIX: Only log and trigger fallback for actual errors, not warnings/debug
        // Python libraries often write warnings/info to stderr - don't treat as failures
        const isRealError = errorStr.toLowerCase().includes('error') ||
                           errorStr.toLowerCase().includes('exception') ||
                           errorStr.toLowerCase().includes('traceback') ||
                           errorStr.toLowerCase().includes('failed') ||
                           errorStr.toLowerCase().includes('critical');
        
        if (errorStr && isRealError) {
          console.warn('⚠️ [Python stderr ERROR]:', errorStr.substring(0, 200));
          
          // Store stderr errors in diagnostics for troubleshooting
          if (!global.pythonDiagnostics) global.pythonDiagnostics = {};
          if (!global.pythonDiagnostics.stderrErrors) global.pythonDiagnostics.stderrErrors = [];
          // Keep last 10 errors to avoid memory bloat
          if (global.pythonDiagnostics.stderrErrors.length >= 10) global.pythonDiagnostics.stderrErrors.shift();
          global.pythonDiagnostics.stderrErrors.push({
            timestamp: new Date().toISOString(),
            message: errorStr.substring(0, 300)
          });
          
// Only start fallback once, not for every stderr message
          if (!this._fallbackStarted) {
            this._fallbackStarted = true;
            console.log('🔄 [Python] Starting fallback detection due to Python error');
            
            if (process.platform === 'win32') {
              this.startWindowsFallbackDetection();
            } else if (process.platform === 'linux') {
              this.startLinuxFallbackDetection();
            } else if (process.platform === 'darwin') {
              // macOS: Accessibility permission gate ensures Swift helper works
              console.log('⚠️ [DARWIN] Input monitor error on macOS — Accessibility permission may be missing');
            }
          }
        } else if (errorStr) {
          // Log non-error stderr as debug (warnings, deprecation notices, etc.)
          console.log('📝 [Input monitor stderr info]:', errorStr.substring(0, 100));
}
      });

      pythonProcess.on('error', (error) => {
        console.error('❌ Failed to spawn Python process:', error.message);
        
        if (!global.pythonDiagnostics) global.pythonDiagnostics = {};
        if (!global.pythonDiagnostics.spawnErrors) global.pythonDiagnostics.spawnErrors = [];
        global.pythonDiagnostics.spawnErrors.push({
          timestamp: new Date().toISOString(),
          error: error.message,
          code: error.code || 'unknown'
        });
        
        this._handlePythonFailure(scriptPath, `spawn error: ${error.message}`);
      });

      pythonProcess.on('exit', (code) => {
        console.log(`🐍 External Python monitor exited with code: ${code}`);
        
        if (!global.pythonDiagnostics) global.pythonDiagnostics = {};
        if (!global.pythonDiagnostics.exitCodes) global.pythonDiagnostics.exitCodes = [];
        if (global.pythonDiagnostics.exitCodes.length >= 5) global.pythonDiagnostics.exitCodes.shift();
        global.pythonDiagnostics.exitCodes.push({
          timestamp: new Date().toISOString(),
          code: code
        });
        
        if (this.pythonDisabled) {
          console.log('⏹️  [PYTHON] Monitor disabled - NOT restarting');
          return;
        }

        if (code === 2) {
          this.pythonDisabled = true;
          console.log('🔒 [INPUT] Accessibility permission denied (exit code 2) — NOT retrying');
          if (!global.pythonDiagnostics) global.pythonDiagnostics = {};
          global.pythonDiagnostics.permissionDenied = true;
          return;
        }
        
        if (code !== 0 && this.isActive) {
          // Clear the stable-run timer since Python just crashed
          if (this.pythonStableTimer) {
            clearTimeout(this.pythonStableTimer);
            this.pythonStableTimer = null;
          }
          this._handlePythonFailure(scriptPath, `exit code: ${code}`);
        }
      });

      this.monitors.push(pythonProcess);
      console.log('✅ External Python monitor started');
      
      // Reset failure count after 10 minutes of stable operation
      if (this.pythonStableTimer) clearTimeout(this.pythonStableTimer);
      this.pythonStableTimer = setTimeout(() => {
        if (this.pythonFailureCount > 0) {
          console.log(`✅ [PYTHON] Stable for 10min — resetting failure count (was ${this.pythonFailureCount})`);
          this.pythonFailureCount = 0;
        }
      }, 10 * 60 * 1000);
    } catch (error) {
      console.error('❌ Failed to start external Python monitor:', error);
    }
  }

  _handlePythonFailure(scriptPath, reason) {
    this.pythonFailureCount++;
    const attempt = this.pythonFailureCount;
    const maxRetries = this.pythonMaxRetries;

    console.log(`⚠️ [PYTHON] Failure #${attempt}/${maxRetries} — ${reason}`);

    if (attempt >= maxRetries) {
      this.pythonDisabled = true;
      console.log(`❌ [PYTHON] All ${maxRetries} retries exhausted — stopping timer and notifying user`);

      // Stop the tracking timer
      try {
        global.stopTracking?.('input_detection_failed');
      } catch (e) {
        console.error('❌ [PYTHON] Error stopping tracking:', e.message);
      }

      // Show restart popup
      try {
        const { dialog, app } = require('electron');
        const BrowserWindow = require('electron').BrowserWindow;
        const parentWindow = BrowserWindow.getAllWindows()[0] || null;
        dialog.showMessageBox(parentWindow, {
          type: 'error',
          title: 'Input Detection Failed',
          message: 'Input detection failed. Please restart the app.',
          detail: `The input monitor could not start after ${maxRetries} attempts. Activity tracking has been stopped to prevent incorrect data.`,
          buttons: ['Restart', 'Close'],
          defaultId: 0
        }).then(({ response }) => {
          if (response === 0) {
            app.relaunch();
            app.exit(0);
          }
        }).catch(() => {});
      } catch (e) {
        console.error('❌ [PYTHON] Error showing dialog:', e.message);
      }
      return;
    }

    const delay = this.pythonBackoffDelays[attempt - 1] || 120000;
    console.log(`🔄 [INPUT] Retry ${attempt}/${maxRetries} in ${delay / 1000}s...`);
    setTimeout(() => {
      if (!this.pythonDisabled && this.isActive) {
        if (scriptPath) {
          this.startExternalPythonMonitor(scriptPath);
        } else if (process.platform === 'darwin') {
          this.startNativeMacOSInputMonitor();
        }
      }
    }, delay);
  }

  handleExternalPythonEvent(event) {
    const now = Date.now();

    switch (event.type) {
      case 'click':
        // CRITICAL FIX: Only emit event, don't call recordActivity
        // recordActivity is already called by the event handler in input-manager.js
        // Calling both causes DOUBLE COUNTING of activity
        this.emit('mouseClick', { 
          method: `platform-external_python_${event.platform || 'macos'}`, 
          timestamp: now,
          ...event 
        });
        break;
      case 'key':
// CRITICAL FIX: Only emit event, don't call recordActivity
        this.emit('keyPress', { 
          method: `platform-external_python_${event.platform || 'macos'}`, 
          timestamp: now,
          ...event 
        });
        break;
      case 'move':
        // Throttle moves: emit at most once per second instead of random 10% sampling
        if (!this._lastMoveEmit || now - this._lastMoveEmit >= 1000) {
          this._lastMoveEmit = now;
          this.emit('mouseMovement', { 
            method: `platform-external_python_${event.platform || 'macos'}`, 
            timestamp: now,
            ...event 
          });
        }
        break;
      case 'activity_summary':
        // Route summary to structured logger under INPUT feature
        logger.info({ category: 'INPUT', step: 'EXTERNAL SUMMARY', message: `${event.activity_percent}% (${event.active_seconds}/60s)`, ctx: { platform: event.platform } });
        break;
      case 'idle':
        this.emit('idle');
        break;
      case 'started':
        console.log(`✅ External Python input detection started successfully on ${event.platform}`);
        break;
      case 'init':
        console.log(`🎯 External Python monitor initializing on ${event.platform}: ${event.message}`);
        break;
      case 'warning':
        console.log(`⚠️ [INPUT] Warning (${event.platform}): ${event.message}`);
        break;
      case 'error':
        console.log(`❌ External Python error (${event.platform}): ${event.message}`);
        break;
      case 'permission_denied':
        console.log(`🔒 [INPUT] Accessibility permission denied: ${event.message}`);
        if (!global.pythonDiagnostics) global.pythonDiagnostics = {};
        global.pythonDiagnostics.permissionDenied = true;
        this.pythonDisabled = true;
        break;
      case 'stopped':
        console.log(`🛑 External Python monitor stopped on ${event.platform}`);
        break;
      default:
        // REDUCE LOG SPAM: Only log unknown events occasionally
        if (Math.random() < 0.05) {
          console.log(`📝 External Python event (${event.platform}):`, event.type);
        }
    }
  }

  // startMacOSAppleScriptFallback() — REMOVED
  // This method polled osascript every 200ms (300 calls/min) and silently failed when
  // Automation permission was denied (-1743). The Accessibility permission gate in
  // permissions-check.js now ensures the Swift helper has the permission it needs before starting,
  // making this fallback unnecessary. See: system/permissions-check.js → ensureMacOSAccessibilityPermission()

  startElectronPowerMonitorDetection() {
    const { powerMonitor } = this.electronModules;
    
    if (powerMonitor && powerMonitor.on) {
      console.log('⚡ Starting Electron PowerMonitor detection...');
      
      // Clean up existing listeners to prevent memory leaks
      this.cleanupPowerMonitorListeners();
      
      // Store listener reference for cleanup
      this.powerMonitorListeners = {
        userActivity: () => {
          if (!this.isActive) return;
          
          const now = Date.now();
          const timeSinceLastActivity = now - this.stats.lastActivity;
          
          // REMOVED: Fake activity generation from power monitor events
          // Power monitor events should NOT generate fake mouse movements
          // if (timeSinceLastActivity > 5000) {
          //   this.recordActivity('mouseMovement', now, { method: 'powermonitor_basic_activity' });
          // }
        }
      };
      
      powerMonitor.on('user-activity', this.powerMonitorListeners.userActivity);
      
      console.log('✅ Electron PowerMonitor detection active');
    }
  }

  cleanupPowerMonitorListeners() {
    if (this.powerMonitorListeners && this.electronModules?.powerMonitor) {
      const { powerMonitor } = this.electronModules;
      powerMonitor.removeListener('user-activity', this.powerMonitorListeners.userActivity);
      this.powerMonitorListeners = null;
    }
  }

  async startWindowsDetection() {
    console.log('🪟 Starting Windows input detection...');
    
    // Try external Python script for Windows
    const externalScript = resolveAsarUnpacked(path.join(__dirname, 'external_input_monitor_windows.py'));
    await this.startExternalPythonMonitor(externalScript);
    
    // PERFORMANCE FIX: Windows fallback is NO LONGER started unconditionally
    // It will only be activated when Python monitor fails (see startExternalPythonMonitor error handlers)
    // This prevents duplicate 500ms polling when Python is working correctly
    // Old code: this.startWindowsFallbackDetection();
  }

  async startLinuxDetection() {
    console.log('🐧 Starting Linux input detection...');
    
    // Use external Python script for Linux
    const externalScript = resolveAsarUnpacked(path.join(__dirname, 'external_input_monitor_linux.py'));
    await this.startExternalPythonMonitor(externalScript);
  }

  recordActivity(type, timestamp, details = {}) {
    // CRITICAL FIX: Check idle state BEFORE recording any activity
    // This prevents synthetic activity from AppleScript/fallback detection during idle
    try {
      const { powerMonitor } = this.electronModules || {};
      if (powerMonitor && typeof powerMonitor.getSystemIdleTime === 'function') {
        const systemIdleSeconds = powerMonitor.getSystemIdleTime();
        // If system is idle > 30 seconds, this activity is likely synthetic (polling, etc)
        if (systemIdleSeconds > 30) {
          // Throttle logging to reduce spam
          if (!this._lastIdleDropLog || Date.now() - this._lastIdleDropLog > 10000) {
            console.log(`🧍 [IDLE-GATE] Dropped ${type} from ${details.method} - system idle ${systemIdleSeconds}s`);
            this._lastIdleDropLog = Date.now();
          }
          return;
        }
      }
    } catch (_) {}
    
    this.activityMap.add(Math.floor(timestamp / 1000));
    this.stats.lastActivity = timestamp;

    switch (type) {
      case 'mouseClick':
        this.stats.mouseClicks++;
        
        // [IN2] Mouse click (detailed platform data)
        debugLogger.in2('Mouse click (platform)', {
          button: details.button || 'left',
          method: details.method,
          total: this.stats.mouseClicks,
          throttled: false,
          platform: this.platform,
          details: details.details || {}
        });
        
        // Reduce spam: only emit detailed per-event logs when DEBUG_INPUT=1
        if (process.env.DEBUG_INPUT === '1') {
          logger.debug({ category: 'INPUT', step: 'EVENT', message: 'CLICK', ctx: { method: details.method, total: this.stats.mouseClicks } });
        }
        this.emit('mouseClick', {
          timestamp,
          total: this.stats.mouseClicks,
          method: details.method
        });
        break;
        
      case 'keyPress':
        this.stats.keystrokes++;
        
        // [IN3] Key press (detailed platform data)
        debugLogger.in3('Key press (platform)', {
          keycode: details.details?.keycode || 'unknown',
          modifiers: details.details?.modifiers || 'none',
          method: details.method,
          total: this.stats.keystrokes,
          platform: this.platform
        });
        
        // Reduce spam: only emit detailed per-event logs when DEBUG_INPUT=1
        if (process.env.DEBUG_INPUT === '1') {
          logger.debug({ category: 'INPUT', step: 'EVENT', message: 'KEY', ctx: { method: details.method, total: this.stats.keystrokes } });
        }
        this.emit('keyPress', {
          timestamp,
          total: this.stats.keystrokes,
          method: details.method
        });
        break;
        
      case 'mouseMovement':
        this.stats.mouseMovements++;
        
        // [IN1] Mouse move (throttled, detailed platform data)
        const shouldLogMove = this.stats.mouseMovements % 100 === 0; // Throttle to every 100 moves
        if (shouldLogMove) {
          debugLogger.in1('Mouse move (platform)', {
            dx: details.details?.dx || 'unknown',
            dy: details.details?.dy || 'unknown',
            method: details.method,
            total: this.stats.mouseMovements,
            throttled: true,
            platform: this.platform,
            distance: details.distance || 'unknown'
          });
        }
        
        // Reduce spam: only emit detailed per-event logs when DEBUG_INPUT=1
        if (process.env.DEBUG_INPUT === '1' && this.stats.mouseMovements % 250 === 0) {
          logger.debug({ category: 'INPUT', step: 'EVENT', message: 'MOVE', ctx: { method: details.method, total: this.stats.mouseMovements } });
        }
        this.emit('mouseMovement', {
          timestamp,
          total: this.stats.mouseMovements,
          method: details.method
        });
        break;
    }
  }

  startActivityTracking() {
    // PERFORMANCE OPTIMIZATION: Track activity summary logs to reduce console output
    this.activityLogCount = 0;
    
    setInterval(() => {
      if (!this.isActive) return;
      
      const now = Math.floor(Date.now() / 1000);
      
      // PERFORMANCE OPTIMIZATION: Use more efficient filtering with early termination
      // Only check activities within the last 60 seconds to reduce processing time
      const cutoffTime = now - 60;
      const pastMinute = [];
      for (const activityTime of this.activityMap) {
        if (activityTime >= cutoffTime) {
          pastMinute.push(activityTime);
        }
      }
      
      // MEMORY FIX: Trim activityMap to only keep entries from the last 60 seconds
      // Without this, the Set grows unbounded over hours of usage
      if (this.activityMap.size > pastMinute.length + 10) {
        this.activityMap.clear();
        for (const t of pastMinute) {
          this.activityMap.add(t);
        }
      }
      
      const activityPercent = (pastMinute.length / 60) * 100;
      
      // [IN4] Accumulator tick
      debugLogger.in4('Activity accumulator tick', {
        kpm: Math.round((this.stats.keystrokes / (Date.now() - this.startTime || 1)) * 60000), // Keys per minute
        cpm: Math.round((this.stats.mouseClicks / (Date.now() - this.startTime || 1)) * 60000), // Clicks per minute
        movementPx: this.stats.mouseMovements, // Approximate movement count
        activityPercent: activityPercent.toFixed(1),
        activeSeconds: pastMinute.length,
        isIdle: pastMinute.length === 0
      });

      if (pastMinute.length === 0) {
        // PERFORMANCE OPTIMIZATION: Only log idle status every 3rd minute to reduce console spam
        if (this.activityLogCount % 3 === 0) {
          console.log('😴 User idle for 1+ minute (throttled logging)');
        }
        this.emit('idle', { timestamp: Date.now() });
      } else {
        // PERFORMANCE OPTIMIZATION: Only log detailed activity every 2nd minute during active periods
        if (this.activityLogCount % 2 === 0) {
          console.log(`📊 Activity: ${activityPercent.toFixed(1)}% (${pastMinute.length}/60 seconds active) [throttled]`);
        }
        this.emit('activity', { 
          timestamp: Date.now(),
          activityPercent,
          activeSeconds: pastMinute.length
        });
      }
      
      this.activityLogCount++;
    }, 90000); // PERFORMANCE OPTIMIZATION: Increased from 60s to 90s for better efficiency
  }

  async stop() {
    this.isActive = false;
    
    // ============================================================
    // CRITICAL FIX: Remove event listeners and destroy streams FIRST
    // This prevents ghost logs from buffered data after stop
    // ============================================================
    if (this.pythonProcess) {
      console.log('🧹 [STOP] Removing Python process event listeners and destroying streams...');
      
      // Remove all event listeners to stop processing immediately
      try {
        this.pythonProcess.stdout.removeAllListeners('data');
        this.pythonProcess.stderr.removeAllListeners('data');
        this.pythonProcess.removeAllListeners('exit');
        this.pythonProcess.removeAllListeners('error');
        console.log('✅ [STOP] Event listeners removed');
      } catch (e) {
        console.log('⚠️ [STOP] Error removing listeners:', e.message);
      }
      
      // Destroy streams to prevent any buffered data from being processed
      try {
        if (this.pythonProcess.stdout) {
          this.pythonProcess.stdout.destroy();
        }
        if (this.pythonProcess.stderr) {
          this.pythonProcess.stderr.destroy();
        }
        console.log('✅ [STOP] Streams destroyed');
      } catch (e) {
        console.log('⚠️ [STOP] Error destroying streams:', e.message);
      }
      
      // CRITICAL FIX v1.0.136: Force-kill pythonProcess directly (not just via monitors array)
      // This ensures the Python input monitor is terminated on Windows restart
      // PERF FIX: Use async exec instead of blocking execSync to avoid freezing UI for 4+ seconds
      try {
        const pid = this.pythonProcess.pid;
        if (pid) {
          console.log('🔪 [STOP] Killing Python process directly, PID:', pid);
          if (process.platform === 'win32') {
            await new Promise((resolve) => {
              const { exec } = require('child_process');
              exec(`taskkill /F /T /PID ${pid}`, { timeout: 3000 }, (err) => {
                if (err) {
                  console.log('⚠️ [STOP] taskkill returned (process may be dead):', err.message);
                } else {
                  console.log('✅ [STOP] Python process killed via taskkill');
                }
                resolve(); // Always resolve - process may already be dead
              });
            });
          } else {
            this.pythonProcess.kill('SIGTERM');
            setTimeout(() => {
              try { this.pythonProcess?.kill('SIGKILL'); } catch {}
            }, 100);
            console.log('✅ [STOP] Python process killed via SIGTERM');
          }
        }
      } catch (e) {
        console.log('⚠️ [STOP] Error killing Python process:', e.message);
      }
    }
    
    // ============================================================
    // Kill processes - SYNC for Windows, SIGTERM for macOS/Linux
    // ============================================================
    this.monitors.forEach(monitor => {
      if (typeof monitor === 'number') {
        clearInterval(monitor);
      } else if (monitor.kill) {
        try {
          if (process.platform === 'win32') {
            // WINDOWS: Use async exec to kill process without blocking UI
            // Previous execSync blocked Electron main process for 2+ seconds per call
            console.log('🔪 [WINDOWS] Force killing input monitor process (ASYNC):', monitor.pid);
            try {
              const { exec } = require('child_process');
              exec(`taskkill /F /T /PID ${monitor.pid}`, { timeout: 3000 }, (err) => {
                if (err) {
                  console.log('⚠️ [WINDOWS] Process may already be terminated or kill timed out');
                } else {
                  console.log('✅ [WINDOWS] Input monitor process killed');
                }
              });
            } catch (e) {
              // Process may already be dead or timeout - acceptable
              console.log('⚠️ [WINDOWS] Process may already be terminated or kill timed out');
            }
          } else {
            // macOS/Linux: SIGTERM (sync) with SIGKILL fallback
            console.log('🔪 [UNIX] Killing input monitor process with SIGTERM:', monitor.pid);
            monitor.kill('SIGTERM');
            // Give 100ms then force SIGKILL if still running
            setTimeout(() => {
              try { 
                monitor.kill('SIGKILL'); 
                console.log('💀 [UNIX] Sent SIGKILL fallback');
              } catch (e) {
                // Process already dead - OK
              }
            }, 100);
            console.log('✅ [UNIX] Input monitor process terminated');
          }
        } catch (error) {
          console.error('❌ Failed to kill input monitor process:', error);
          // Fallback: try default kill
          try {
            monitor.kill();
          } catch {}
        }
      }
    });
    
    this.monitors = [];
    
    // Clear Python process reference
    this.pythonProcess = null;
    
    // Clean up PowerMonitor listeners to prevent memory leaks
    this.cleanupPowerMonitorListeners();
    
    // PERFORMANCE FIX: Reset fallback flags to allow restart
    this.fallbackActive = {
      macOS: false,
      windows: false,
      linux: false
    };
    
    // Reset Python failure tracking for potential restart
    this.pythonFailureCount = 0;
    this.pythonDisabled = false;
    if (this.pythonStableTimer) {
      clearTimeout(this.pythonStableTimer);
      this.pythonStableTimer = null;
    }
    
    console.log('🛑 Cross-Platform Input Detector stopped');
  }

  getStats() {
    return { ...this.stats };
  }

  getActivityPercent() {
    const now = Math.floor(Date.now() / 1000);
    const pastMinute = Array.from(this.activityMap).filter(t => now - t < 60);
    return (pastMinute.length / 60) * 100;
  }

  async findWorkingPython(pythonPaths) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Store diagnostic info for error reporting
    const diagnosticResults = [];
    
    for (const pythonPath of pythonPaths) {
      try {
        // Skip empty paths
        if (!pythonPath || pythonPath.trim() === '') {
          continue;
        }
        
        // Check if file exists first (for absolute paths)
        const isAbsolutePath = path.isAbsolute(pythonPath);
        if (isAbsolutePath && !fs.existsSync(pythonPath)) {
          diagnosticResults.push({ path: pythonPath, status: 'not_found', error: 'File does not exist' });
          continue;
        }
        
        const { stdout } = await execAsync(`"${pythonPath}" --version`, { timeout: 5000 });
        if (stdout.includes('Python')) {
          console.log(`✅ Found working Python: ${pythonPath} (${stdout.trim()})`);
          diagnosticResults.push({ path: pythonPath, status: 'success', version: stdout.trim() });
          
          // Store diagnostic info globally for error popup
          global.pythonDiagnostics = {
            foundPath: pythonPath,
            version: stdout.trim(),
            checkedPaths: diagnosticResults,
            timestamp: new Date().toISOString()
          };
          
          return pythonPath;
        }
      } catch (error) {
        // This Python path doesn't work, log and try next
        const errorMsg = error.message || 'Unknown error';
        diagnosticResults.push({ path: pythonPath, status: 'failed', error: errorMsg.substring(0, 100) });
      }
    }
    
    // No Python found - store diagnostic info for error reporting
    console.log(`❌ [PYTHON] No working Python found. Checked ${diagnosticResults.length} paths.`);
    global.pythonDiagnostics = {
      foundPath: null,
      version: null,
      checkedPaths: diagnosticResults,
      timestamp: new Date().toISOString()
    };
    
    console.log('⚠️ Could not find working Python installation');
    return null;
  }

  startWindowsFallbackDetection() {
    // PERFORMANCE FIX: Prevent duplicate fallback monitors
    if (this.fallbackActive.windows) {
      console.log('⚠️ Windows fallback already active, skipping duplicate start');
      return;
    }
    this.fallbackActive.windows = true;
    
    console.log('🪟 Starting Windows fallback detection (minimal - no synthetic activity)...');
    const { powerMonitor } = this.electronModules;
    
    if (powerMonitor && powerMonitor.on) {
      // CRITICAL FIX: Windows fallback NO LONGER generates synthetic clicks/keys
      // This was causing false activity during idle periods
      // Real input detection should come from Python external monitor only
      
      // Only use PowerMonitor to update lastActivity timestamp for idle tracking
      // Do NOT generate synthetic click/key events from PowerMonitor
      let windowsActivityHandler = () => {
        if (!this.isActive) return;
        // REMOVED: All synthetic activity generation
        // PowerMonitor doesn't know if user clicked or typed
        // Only update internal timestamp, don't emit fake events
        this.stats.lastActivity = Date.now();
      };
      
      powerMonitor.on('user-activity', windowsActivityHandler);
      
      // REMOVED: Idle time polling that generated synthetic clicks/keys
      // The idle delta detection was creating false positives
      // Real activity detection happens via Python external monitor
      
      console.log('✅ Windows fallback active (idle timer only, no synthetic activity)');
    } else {
      console.log('❌ PowerMonitor not available for Windows fallback');
    }
  }

  startLinuxFallbackDetection() {
    // PERFORMANCE FIX: Prevent duplicate fallback monitors
    if (this.fallbackActive.linux) {
      console.log('⚠️ Linux fallback already active, skipping duplicate start');
      return;
    }
    this.fallbackActive.linux = true;
    
    console.log('🐧 Starting Linux fallback detection (using xdotool check)...');
    
    const { exec } = require('child_process');
    const { powerMonitor } = this.electronModules;
    
    // Try to use xdotool for Linux input detection
    exec('which xdotool', (error, stdout) => {
      if (!error && stdout.trim()) {
        console.log('✅ xdotool found, using for Linux input detection');
        
        let lastMousePos = null;
        const xdotoolInterval = setInterval(() => {
          if (!this.isActive) {
            clearInterval(xdotoolInterval);
            return;
          }
          
          // Get mouse position
          exec('xdotool getmouselocation --shell', (err, out) => {
            if (!err && out) {
              const x = parseInt(out.match(/X=(\d+)/)?.[1] || 0);
              const y = parseInt(out.match(/Y=(\d+)/)?.[1] || 0);
              
              if (lastMousePos) {
                const distance = Math.sqrt(
                  Math.pow(x - lastMousePos.x, 2) + 
                  Math.pow(y - lastMousePos.y, 2)
                );
                
                if (distance > 5) {
                  this.recordActivity('mouseMovement', Date.now(), { 
                    method: 'linux_xdotool', 
                    distance 
                  });
                  
                  // REMOVED: Random fake click generation from mouse movement
                  // if (distance > 50 && Math.random() < 0.2) {
                  //   this.recordActivity('mouseClick', Date.now(), { 
                  //     method: 'linux_xdotool_estimated' 
                  //   });
                  // }
                }
              }
              
              lastMousePos = { x, y };
            }
          });
        }, 500); // Check every 500ms
        
        this.monitors.push(xdotoolInterval);
      } else {
        console.log('⚠️ xdotool not found, install with: sudo apt-get install xdotool');
        
        // Final fallback: Use PowerMonitor only (but don't generate fake activity)
        if (powerMonitor && powerMonitor.on) {
          let linuxActivityHandler = () => {
            if (!this.isActive) return;
            
            // REMOVED: All fake activity generation from Linux fallback
            // const now = Date.now();
            // this.recordActivity('mouseMovement', now, { method: 'linux_fallback_powermonitor' });
            // Random fake clicks and keys removed
            // if (Math.random() < 0.1) {
            //   this.recordActivity('mouseClick', now, { method: 'linux_fallback_estimated' });
            // }
            // if (Math.random() < 0.15) {
            //   this.recordActivity('keyPress', now, { method: 'linux_fallback_estimated' });
            // }
          };
          
          powerMonitor.on('user-activity', linuxActivityHandler);
          
          console.log('✅ Linux PowerMonitor fallback active (fake activity generation disabled)');
        }
      }
    });
  }
}

module.exports = CrossPlatformInputDetector; 