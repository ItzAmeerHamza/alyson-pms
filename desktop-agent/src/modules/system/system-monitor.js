/**
 * CENTRALIZED SYSTEM MONITOR
 * Single source of truth for all health checks, debug console, and system status
 * All components should use this instead of implementing their own monitoring
 */

class SystemMonitor {
  constructor() {
    this.debugWindow = null;
    this.mainWindow = null;
    
    // Centralized state tracking
    this.systemState = {
      isTracking: false,
      isPaused: false,
      currentTimeLogId: null,
      currentProjectId: null,
      sessionStartTime: null,
      
      // Feature status
      features: {
        screenshots: { status: 'inactive', lastUpdate: null, count: 0, failures: 0 },
        appDetection: { status: 'inactive', lastUpdate: null, count: 0, failures: 0 },
        urlDetection: { status: 'inactive', lastUpdate: null, count: 0, failures: 0 },
        idleDetection: { status: 'inactive', lastUpdate: null, idleSeconds: 0 },
        inputTracking: { status: 'inactive', lastUpdate: null, clicks: 0, keys: 0, moves: 0 },
        database: { status: 'unknown', lastUpdate: null, connected: false },
        permissions: { status: 'unknown', lastUpdate: null, screenRecording: false }
      },
      
      // Health metrics
      health: {
        overall: 'unknown',
        lastCheck: null,
        issues: [],
        warnings: []
      },
      
      // Performance metrics
      performance: {
        cpuUsage: 0,
        memoryUsage: 0,
        networkStatus: 'unknown',
        lastResourceCheck: null
      }
    };
    
    // Event listeners registry
    this.eventListeners = new Map();
    
    // Debug log buffer for console
    this.debugLogs = [];
    this.MAX_DEBUG_LOGS = 1000;

    // Permission prompt guardrails (avoid repeated alert loops)
    this.permissionPromptInProgress = false;
    this.lastPermissionPromptAt = 0;
    this.permissionPromptCooldownMs = 10 * 60 * 1000; // 10 minutes
    
    console.log('🔬 [SYSTEM-MONITOR] Centralized System Monitor initialized');
  }
  
  // === WINDOW REGISTRATION ===
  registerDebugWindow(debugWindow) {
    this.debugWindow = debugWindow;
    console.log('🔬 [SYSTEM-MONITOR] Debug window registered');
    
    // Send initial status when debug window connects
    setTimeout(() => {
      this.sendDebugUpdate('SYSTEM', '🔬 Debug Console v2.0 connected to System Monitor');
      this.sendInitialStatus();
    }, 500);
  }
  
  registerMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
    console.log('🔬 [SYSTEM-MONITOR] Main window registered');
  }
  
  // === CENTRALIZED DEBUG COMMUNICATION ===
  sendDebugUpdate(type, message, data = {}) {
    const logEntry = {
      type,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    
    // Store in buffer
    this.debugLogs.push(logEntry);
    if (this.debugLogs.length > this.MAX_DEBUG_LOGS) {
      this.debugLogs.shift(); // Remove oldest
    }
    
    // Send to debug window
    if (this.debugWindow && !this.debugWindow.isDestroyed()) {
      try {
        this.debugWindow.webContents.send('debug-log', logEntry);
      } catch (error) {
        // Ignore errors if debug window is not ready
      }
    }
    
    console.log(`📊 [${type}] ${message}`);
  }
  
  sendActivityUpdate(activityType, activityData = {}) {
    const updateData = {
      type: activityType,
      ...activityData,
      timestamp: new Date().toISOString()
    };
    
    // Update internal state based on activity type
    this.updateFeatureStatus(activityType, activityData);
    
    // Send to debug window
    if (this.debugWindow && !this.debugWindow.isDestroyed()) {
      try {
        this.debugWindow.webContents.send('activity-update', updateData);
      } catch (error) {
        // Ignore errors if debug window is not ready
      }
    }
    
    // Send to main window for dashboard updates
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('activity-update', updateData);
      } catch (error) {
        // Ignore errors if main window is not ready
      }
    }
  }
  
  // === CENTRALIZED FEATURE STATUS TRACKING ===
  updateFeatureStatus(featureName, data = {}) {
    const now = Date.now();
    
    switch (featureName) {
      case 'screenshot':
        this.systemState.features.screenshots.status = 'active';
        this.systemState.features.screenshots.lastUpdate = now;
        this.systemState.features.screenshots.count++;
        break;
        
      case 'app':
        this.systemState.features.appDetection.status = 'active';
        this.systemState.features.appDetection.lastUpdate = now;
        this.systemState.features.appDetection.count++;
        break;
        
      case 'url':
        this.systemState.features.urlDetection.status = 'active';
        this.systemState.features.urlDetection.lastUpdate = now;
        this.systemState.features.urlDetection.count++;
        break;
        
      case 'idle':
        this.systemState.features.idleDetection.status = 'active';
        this.systemState.features.idleDetection.lastUpdate = now;
        this.systemState.features.idleDetection.idleSeconds = data.idleSeconds || 0;
        break;
        
      case 'activity':
        this.systemState.features.inputTracking.status = 'active';
        this.systemState.features.inputTracking.lastUpdate = now;
        this.systemState.features.inputTracking.clicks = data.mouseClicks || 0;
        this.systemState.features.inputTracking.keys = data.keystrokes || 0;
        this.systemState.features.inputTracking.moves = data.mouseMovements || 0;
        break;
    }
  }
  
  // === CENTRALIZED HEALTH CHECKS ===
  async performComprehensiveHealthCheck() {
    console.log('🏥 [SYSTEM-MONITOR] Starting comprehensive health check...');
    
    const healthResults = {
      overall: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {},
      issues: [],
      warnings: [],
      canStartTimer: true
    };
    
    try {
      // 1. Permission checks
      healthResults.checks.permissions = await this.checkPermissions();
      
      // 2. Database connectivity
      healthResults.checks.database = await this.checkDatabaseConnectivity();
      
      // 3. Core functionality tests
      healthResults.checks.screenshot = await this.checkScreenshotCapability();
      healthResults.checks.appDetection = await this.checkAppDetection();
      healthResults.checks.urlDetection = await this.checkUrlDetection();
      healthResults.checks.idleDetection = await this.checkIdleDetection();
      healthResults.checks.inputDetection = await this.checkInputDetection();
      
      // 4. System resources
      healthResults.checks.resources = await this.checkSystemResources();
      
    // Analyze results
      const { overall, issues, warnings, canStartTimer } = this.analyzeHealthResults(healthResults.checks);
      healthResults.overall = overall;
      healthResults.issues = issues;
      healthResults.warnings = warnings;
      healthResults.canStartTimer = canStartTimer;
      
      // Update internal state
      this.systemState.health = {
        overall: healthResults.overall,
        lastCheck: Date.now(),
        issues: healthResults.issues,
        warnings: healthResults.warnings
      };
      
      // Send updates to debug console
      this.sendDebugUpdate('HEALTH', `Health check completed: ${healthResults.overall.toUpperCase()}`);
      this.sendDebugUpdate('HEALTH', `✅ ${Object.keys(healthResults.checks).filter(k => healthResults.checks[k].status === 'pass').length} checks passed`);
      if (healthResults.issues.length > 0) {
        this.sendDebugUpdate('HEALTH', `❌ ${healthResults.issues.length} critical issues found`);
      }
      if (healthResults.warnings.length > 0) {
        this.sendDebugUpdate('HEALTH', `⚠️ ${healthResults.warnings.length} warnings found`);
      }
      
      return healthResults;
      
    } catch (error) {
      console.error('❌ [SYSTEM-MONITOR] Health check failed:', error);
      healthResults.overall = 'critical';
      healthResults.issues.push(`Health check system failure: ${error.message}`);
      healthResults.canStartTimer = false;
      
      this.sendDebugUpdate('ERROR', `Health check system failure: ${error.message}`);
      
      return healthResults;
    }
  }
  
  // === INDIVIDUAL CHECK METHODS ===
  async checkPermissions() {
    try {
      // Use our cross-platform permission system
      const { getScreenStatus, getAccessibilityAuthorized } = require('../../system/permissions-check');
      
      let screenStatus = getScreenStatus();
      let screenRecordingGranted = screenStatus === 'authorized';
      const accessibilityStatus = getAccessibilityAuthorized();
      // Input Monitoring no longer required — Accessibility covers input detection
      const inputMonitoringStatus = accessibilityStatus;
      const platform = process.platform;
      
      // Fallback probe for macOS false negatives:
      // If API says denied but an actual screenshot succeeds, treat Screen Recording as granted.
      let screenProbeSucceeded = false;
      if (platform === 'darwin' && !screenRecordingGranted) {
        try {
          const screenshot = require('screenshot-desktop');
          const probe = await Promise.race([
            screenshot({ format: 'png' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('probe-timeout')), 3000))
          ]);
          if (probe && probe.length > 0) {
            screenProbeSucceeded = true;
            screenRecordingGranted = true;
            screenStatus = 'authorized';
          }
        } catch (_) {
          // Keep original status when probe fails
        }
      }
      
      const allGranted = screenRecordingGranted && accessibilityStatus && inputMonitoringStatus;
      // On macOS, allow tracking with warning if screen recording works but accessibility is not yet detected.
      const allowWithWarning = platform === 'darwin' && screenRecordingGranted && !accessibilityStatus;
      const status = allGranted ? 'pass' : (allowWithWarning ? 'warn' : 'fail');
      
      // Update internal state
      this.systemState.features.permissions.screenRecording = screenRecordingGranted;
      this.systemState.features.permissions.accessibility = accessibilityStatus;
      this.systemState.features.permissions.inputMonitoring = inputMonitoringStatus;
      this.systemState.features.permissions.status = (allGranted || allowWithWarning) ? 'active' : 'inactive';
      this.systemState.features.permissions.lastUpdate = Date.now();
      
      console.log(`[HEALTH-CHECK] ${platform.toUpperCase()} Permissions: Screen=${screenStatus}, Accessibility=${accessibilityStatus}, InputMonitoring=${inputMonitoringStatus}`);
      
      return {
        status,
        details: {
          screenRecording: screenRecordingGranted,
          accessibility: accessibilityStatus,
          inputMonitoring: inputMonitoringStatus,
          platform: platform,
          screenStatus: screenStatus,
          screenProbeSucceeded
        },
        message: allGranted
          ? `All ${platform} permissions granted`
          : allowWithWarning
            ? `${platform} screen recording verified; accessibility still needed for full activity tracking`
            : `${platform} system permissions required`,
        requiresUserAction: !allGranted,
        fixAction: allGranted ? null : 'Open system settings to grant permissions'
      };
    } catch (error) {
      console.error('[HEALTH-CHECK] Permission check failed:', error);
      return {
        status: 'fail', 
        details: { error: error.message, platform: process.platform },
        message: `Permission check failed: ${error.message}`,
        requiresUserAction: true,
        fixAction: 'Check system permissions manually'
      };
    }
  }
  
  async checkDatabaseConnectivity() {
    try {
      // Use global.config (set by load-config.js in main.js) with env-config.js fallback
      let config = global.config;
      if (!config || !(config.api_base_url || config.backend_api_url)) {
        try {
          config = require('../../../env-config.js');
        } catch (requireErr) {
          console.log('[HEALTH-CHECK] Could not load env-config.js:', requireErr.message);
          config = {};
        }
      }

      // RDS is reachable only through the NestJS API, so its /health endpoint is the
      // single honest signal for "can we persist payroll data right now".
      const { resolveApiBase, checkBackendHealth } = require('../utils/backend-health');
      const apiBase = resolveApiBase(config);
      const urlPreview = apiBase ? apiBase.substring(0, 30) + '...' : 'missing';

      const health = await checkBackendHealth(config, 5000);
      const isConnected = !!health.ok;

      this.systemState.features.database.connected = isConnected;
      this.systemState.features.database.status = isConnected ? 'active' : 'inactive';
      this.systemState.features.database.lastUpdate = Date.now();

      if (isConnected) {
        return {
          status: 'pass',
          details: {
            connectivity: 'verified',
            httpStatus: health.status,
            url: urlPreview
          },
          message: 'Database configuration and connectivity verified'
        };
      }

      // PAYROLL CRITICAL: network/DB outages must never block the timer.
      // Tracking continues offline and syncs when connectivity returns.
      const failure = health.error || (health.status ? `HTTP ${health.status}` : 'unreachable');
      return {
        status: 'warn',
        details: {
          connectivity: 'failed',
          error: failure,
          url: urlPreview
        },
        message: `Database configured but connectivity test failed: ${failure}`
      };
    } catch (error) {
      // Never fail-closed on connectivity exceptions — offline tracking is required for payroll.
      return {
        status: 'warn',
        details: { error: error.message },
        message: `Database check failed: ${error.message}`
      };
    }
  }
  
  async checkScreenshotCapability() {
    try {
      let canCapture = false;
      let method = 'unknown';
      let sourcesFound = 0;

      // On Windows, desktopCapturer.getSources() can trigger a DXGI native crash
      // before the main window exists. Skip the probe if no BrowserWindow is open yet;
      // the real screenshot path (screenshot-desktop) does not depend on DXGI.
      const { BrowserWindow } = require('electron');
      const hasWindow = BrowserWindow.getAllWindows().length > 0;

      if (hasWindow) {
        try {
          const { desktopCapturer } = require('electron');
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1, height: 1 }
          });
          if (Array.isArray(sources)) {
            sourcesFound = sources.length;
            if (sources.length > 0) {
              canCapture = true;
              method = 'electron';
            }
          }
        } catch (_) {
          canCapture = true;
          method = 'assumed';
        }
      } else {
        canCapture = true;
        method = 'deferred';
      }

      return {
        status: 'pass',
        details: {
          method: method,
          sourcesFound: sourcesFound,
          captureWorking: canCapture
        },
        message: canCapture ? 'Screenshot capture available' : 'Screenshot capability assumed based on permissions'
      };
    } catch (error) {
      return {
        status: 'fail',
        details: { error: error.message },
        message: `Screenshot test failed: ${error.message}`
      };
    }
  }
  
  async checkAppDetection() {
    try {
      // Test basic app detection capability
      const hasActiveWin = process.platform === 'darwin' || process.platform === 'win32';
      
      return {
        status: hasActiveWin ? 'pass' : 'warn',
        details: {
          platform: process.platform,
          supported: hasActiveWin
        },
        message: hasActiveWin ? 'App detection supported' : 'App detection limited on this platform'
      };
    } catch (error) {
      return {
        status: 'fail',
        details: { error: error.message },
        message: `App detection test failed: ${error.message}`
      };
    }
  }
  
  async checkUrlDetection() {
    try {
      // Test URL detection capability  
      const hasUrlSupport = process.platform === 'darwin' || process.platform === 'win32';
      
      return {
        status: hasUrlSupport ? 'pass' : 'warn',
        details: {
          platform: process.platform,
          supported: hasUrlSupport
        },
        message: hasUrlSupport ? 'URL detection supported' : 'URL detection limited on this platform'
      };
    } catch (error) {
      return {
        status: 'fail',
        details: { error: error.message },
        message: `URL detection test failed: ${error.message}`
      };
    }
  }
  
  async checkIdleDetection() {
    try {
      const { powerMonitor } = require('electron');
      const hasIdleDetection = powerMonitor && typeof powerMonitor.getSystemIdleTime === 'function';
      
      return {
        status: hasIdleDetection ? 'pass' : 'warn',
        details: {
          powerMonitorAvailable: !!powerMonitor,
          idleTimeFunction: hasIdleDetection
        },
        message: hasIdleDetection ? 'Idle detection available' : 'Idle detection limited'
      };
    } catch (error) {
      return {
        status: 'fail',
        details: { error: error.message },
        message: `Idle detection test failed: ${error.message}`
      };
    }
  }
  
  async checkInputDetection() {
    const platform = process.platform;
    
    try {
      // Check environment variable for simulated failure (testing)
      if (process.env.SIMULATE_INPUT_FAILURE === 'true') {
        console.log('[HEALTH-CHECK] ⚠️ SIMULATING input detection failure for testing');
        return {
          status: 'fail',
          details: { 
            platform,
            simulated: true,
            error: 'SIMULATED INPUT FAILURE'
          },
          message: 'Input detection not working (simulated failure)',
          requiresUserAction: true,
          fixAction: 'Accessibility permission is required to track activity'
        };
      }
      
      // Check if the cross-platform input detector exists and can be loaded
      let detectorAvailable = false;
      let pythonAvailable = false;
      
      try {
        const CrossPlatformInputDetector = require('../../cross-platform-input-detector.js');
        detectorAvailable = !!CrossPlatformInputDetector;
        
        // Check if Python is available
        // Priority: 1) provisioner result  2) bundled path  3) auto-downloaded path  4) system Python
        const provisionerOk = global.pythonDiagnostics?.provisionerResult === 'success' && global.pythonDiagnostics?.foundPath;
        if (provisionerOk) {
          // Provisioner already confirmed Python is ready — trust it
          const provPath = global.pythonDiagnostics.foundPath;
          const fs = require('fs');
          if (fs.existsSync(provPath)) {
            pythonAvailable = true;
            console.log(`[HEALTH-CHECK] ✅ Python available (provisioner confirmed): ${provPath}`);
          } else {
            console.log(`[HEALTH-CHECK] ⚠️ Provisioner path missing on disk: ${provPath}`);
          }
        }

        if (!pythonAvailable && platform === 'win32') {
          // Windows: Check bundled, then auto-downloaded, then system
          const { app } = require('electron');
          const path = require('path');
          const fs = require('fs');
          
          const appPath = app.getAppPath();
          const unpackedBase = appPath.replace(/app\.asar$/, 'app.asar.unpacked');
          const bundledPython = path.join(unpackedBase, 'python-windows', 'python.exe');
          // Also check auto-downloaded path in AppData
          const autoDownloaded = path.join(app.getPath('userData'), 'python-windows', 'python.exe');
          
          console.log(`[HEALTH-CHECK] Checking bundled Python at: ${bundledPython}`);
          
          if (fs.existsSync(bundledPython)) {
            pythonAvailable = true;
            console.log(`[HEALTH-CHECK] ✅ Bundled Python found at: ${bundledPython}`);
          } else if (fs.existsSync(autoDownloaded)) {
            pythonAvailable = true;
            console.log(`[HEALTH-CHECK] ✅ Auto-downloaded Python found at: ${autoDownloaded}`);
          } else {
            console.log(`[HEALTH-CHECK] ⚠️ Bundled/downloaded Python not found, checking system Python...`);
            // Fallback: check system Python
            const { exec } = require('child_process');
            await new Promise((resolve) => {
              exec('python --version', { timeout: 5000 }, (error, stdout, stderr) => {
                pythonAvailable = !error && (stdout.includes('Python') || stderr.includes('Python'));
                if (pythonAvailable) {
                  console.log(`[HEALTH-CHECK] ✅ System Python found`);
                } else {
                  console.log(`[HEALTH-CHECK] ❌ No Python found (bundled, downloaded, or system)`);
                }
                resolve();
              });
            });
          }
        } else if (!pythonAvailable && (platform === 'darwin' || platform === 'linux')) {
          // macOS/Linux: Check system Python
          const { exec } = require('child_process');
          const pythonCmd = 'python3 --version';
          
          await new Promise((resolve) => {
            exec(pythonCmd, { timeout: 5000 }, (error, stdout, stderr) => {
              pythonAvailable = !error && (stdout.includes('Python') || stderr.includes('Python'));
              resolve();
            });
          });
        }
      } catch (loadError) {
        console.log('[HEALTH-CHECK] Input detector not loadable:', loadError.message);
      }
      
      // Check if globalInputManager exists and is active
      const hasGlobalInputManager = !!global.globalInputManager;
      const inputManagerActive = global.globalInputManager?.isActive || false;
      
      // Check if we have activity data (proof that input detection is working)
      const displayStats = global.displayActivityStats || {};
      const hasActivityData = (displayStats.clicks > 0 || displayStats.keys > 0 || displayStats.moves > 0);
      
      // Determine overall status
      // On Windows, Python is required for real input detection
      let inputWorking = false;
      let message = '';
      
      if (platform === 'win32') {
        // Windows requires Python for input detection
        if (!pythonAvailable) {
          message = 'Python not installed - required for input detection on Windows';
          inputWorking = false;
        } else if (!detectorAvailable) {
          message = 'Input detector module not available';
          inputWorking = false;
        } else {
          // Python available, detector available - assume working
          inputWorking = true;
          message = 'Input detection available (Python monitor)';
        }
      } else if (platform === 'darwin') {
        // macOS - only Accessibility permission needed (Input Monitoring no longer required)
        const { getAccessibilityAuthorized } = require('../../system/permissions-check');
        const accessibilityGranted = getAccessibilityAuthorized();
        // Swift helper binary handles input detection — no Python needed on macOS
        inputWorking = accessibilityGranted;
        if (!accessibilityGranted) {
          message = 'Accessibility permission required (System Settings > Privacy & Security > Accessibility)';
        } else {
          message = 'Input detection available (Swift/Accessibility)';
        }
      } else {
        // Linux
        inputWorking = pythonAvailable && detectorAvailable;
        message = inputWorking ? 'Input detection available' : 'Python required for input detection';
      }
      
      console.log(`[HEALTH-CHECK] Input detection: ${inputWorking ? '✅ PASS' : '❌ FAIL'} - ${message}`);
      
      const status = (platform === 'darwin' && !inputWorking) ? 'warn' : (inputWorking ? 'pass' : 'fail');
      return {
        status,
        details: {
          platform,
          pythonAvailable,
          detectorAvailable,
          hasGlobalInputManager,
          inputManagerActive,
          hasActivityData
        },
        message,
        requiresUserAction: !inputWorking,
        fixAction: !inputWorking ? 'Install Python or check system configuration for input monitoring' : null
      };
    } catch (error) {
      console.error('[HEALTH-CHECK] Input detection check failed:', error);
      return {
        status: 'fail',
        details: { error: error.message, platform },
        message: `Input detection check failed: ${error.message}`,
        requiresUserAction: true,
        fixAction: 'Check input monitoring configuration'
      };
    }
  }
  
  async checkSystemResources() {
    try {
      const os = require('os');
      const process = require('process');
      
      const memoryUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const cpuCount = os.cpus().length;
      
      const memoryUsagePercent = ((memoryUsage.heapUsed / totalMemory) * 100);
      const systemMemoryUsagePercent = ((totalMemory - freeMemory) / totalMemory) * 100;
      
      // Update performance metrics
      this.systemState.performance.memoryUsage = systemMemoryUsagePercent;
      this.systemState.performance.lastResourceCheck = Date.now();
      
      const isHealthy = memoryUsagePercent < 80 && systemMemoryUsagePercent < 90;
      
      return {
        status: isHealthy ? 'pass' : 'warn',
        details: {
          cpuCount,
          memoryUsagePercent: Math.round(memoryUsagePercent * 100) / 100,
          systemMemoryUsagePercent: Math.round(systemMemoryUsagePercent * 100) / 100,
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
          totalMemory: Math.round(totalMemory / 1024 / 1024 / 1024) + ' GB'
        },
        message: isHealthy ? 'System resources healthy' : 'High resource usage detected'
      };
    } catch (error) {
      return {
        status: 'fail',
        details: { error: error.message },
        message: `Resource check failed: ${error.message}`
      };
    }
  }
  
  // === HEALTH ANALYSIS ===
  analyzeHealthResults(checks) {
    const issues = [];
    const warnings = [];
    let canStartTimer = true;
    
    // Analyze each check
    const platform = process.platform;
    Object.entries(checks).forEach(([checkName, result]) => {
      if (result.status === 'fail') {
        // On Windows, inputDetection failure is a WARNING not critical.
        // Python-based input detection is optional on Windows — the app can still
        // track screenshots, apps, URLs, and idle time. Activity % may be lower
        // but it's far better than blocking all tracking entirely.
        if (checkName === 'inputDetection' && platform === 'win32') {
          warnings.push(`${checkName}: ${result.message} (non-blocking on Windows)`);
          console.log(`⚠️ [HEALTH] Input detection failed on Windows — downgraded to warning (tracking allowed)`);
          return; // Don't block timer
        }

        issues.push(`${checkName}: ${result.message}`);
        
        // Critical failures that prevent timer start.
        // Database/network must NEVER block — employees keep tracking offline.
        if (['permissions', 'screenshot', 'inputDetection'].includes(checkName)) {
          canStartTimer = false;
        }
      } else if (result.status === 'warn' || result.status === 'warning') {
        warnings.push(`${checkName}: ${result.message}`);
      }
    });
    
    // Determine overall health
    let overall;
    if (issues.length > 0) {
      overall = issues.some(issue => ['permissions', 'database', 'screenshot'].some(critical => issue.includes(critical))) ? 'critical' : 'unhealthy';
    } else if (warnings.length > 0) {
      overall = 'healthy_with_warnings';
    } else {
      overall = 'healthy';
    }
    
    return { overall, issues, warnings, canStartTimer };
  }
  
  // === PERMISSION POPUP TRIGGER ===
  async triggerPermissionPopup(permissionResult) {
    try {
      // macOS-only permission popup flow
      if (process.platform !== 'darwin') {
        return;
      }

      // Don't open duplicate dialogs
      if (this.permissionPromptInProgress) {
        process.stderr.write('[PERMISSION-GATE] Popup already in progress, skipping\n');
        return;
      }

      // Cooldown to avoid repetitive alerts
      const now = Date.now();
      if (now - this.lastPermissionPromptAt < this.permissionPromptCooldownMs) {
        process.stderr.write('[PERMISSION-GATE] Popup in cooldown window, skipping\n');
        return;
      }

      // Re-check before showing popup; skip if already granted
      const latest = await this.checkPermissions();
      if (latest?.status === 'pass') {
        process.stderr.write('[PERMISSION-GATE] Permissions already granted, no popup needed\n');
        return;
      }

      this.permissionPromptInProgress = true;
      this.lastPermissionPromptAt = now;

      // Log silently to avoid EPIPE errors
      process.stderr.write('[PERMISSION-GATE] Triggering permission popup\n');
      
      // Use the consolidated permission system
      const { ensureMacPermissions } = require('../../system/permissions-check');
      
      // Show the permission popup dialog
      await ensureMacPermissions();
      
      process.stderr.write('[PERMISSION-GATE] Permission popup completed\n');
    } catch (error) {
      process.stderr.write(`[PERMISSION-GATE] Permission popup failed: ${error.message}\n`);
    } finally {
      this.permissionPromptInProgress = false;
    }
  }
  
  // === TRACKING STATE MANAGEMENT ===
  updateTrackingState(updates) {
    Object.assign(this.systemState, updates);
    
    // Send tracking state updates to debug console
    if (updates.isTracking !== undefined) {
      const status = updates.isTracking ? '🟢 ACTIVE' : '⭕ STOPPED';
      this.sendDebugUpdate('TRACKING', `Status changed: ${status}`);
      
      if (updates.isTracking) {
        this.sendDebugUpdate('TRACKING', `Session ID: ${updates.currentTimeLogId || 'unknown'}`);
        this.sendDebugUpdate('TRACKING', `Project ID: ${updates.currentProjectId || 'unknown'}`);
      }
    }
  }
  
  // === SYSTEM STATUS REPORTING ===
  getSystemStatus() {
    return {
      ...this.systemState,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
  
  sendInitialStatus() {
    const status = this.getSystemStatus();
    
    this.sendDebugUpdate('SYSTEM', `📊 Tracking: ${status.isTracking ? '🟢 Active' : '⭕ Stopped'}`);
    this.sendDebugUpdate('SYSTEM', `💻 Platform: ${process.platform}`);
    this.sendDebugUpdate('SYSTEM', `🔄 Uptime: ${Math.round(status.uptime)}s`);
    this.sendDebugUpdate('SYSTEM', `🏥 Health: ${status.health.overall.toUpperCase()}`);
    
    // Send feature status
    Object.entries(status.features).forEach(([featureName, feature]) => {
      const statusIcon = feature.status === 'active' ? '✅' : '⭕';
      this.sendDebugUpdate('FEATURE', `${statusIcon} ${featureName}: ${feature.status}`);
    });
  }
  
  // === EVENT SYSTEM ===
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(callback);
  }
  
  emit(eventName, data) {
    if (this.eventListeners.has(eventName)) {
      this.eventListeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${eventName}:`, error);
        }
      });
    }
  }
  
  // === FEATURE FAILURE TRACKING ===
  reportFeatureFailure(featureName, error) {
    if (this.systemState.features[featureName]) {
      this.systemState.features[featureName].failures++;
      this.systemState.features[featureName].lastFailure = {
        timestamp: Date.now(),
        error: error.message
      };
    }
    
    this.sendDebugUpdate('ERROR', `${featureName} failure: ${error.message}`);
    this.systemState.health.issues.push(`${featureName}: ${error.message}`);
  }
  
  // === PERIODIC HEALTH MONITORING ===
  startPeriodicHealthCheck(intervalMs = 300000) { // 5 minutes default
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.performComprehensiveHealthCheck();
      this.emit('health-check-completed', health);
    }, intervalMs);
    
    console.log(`🏥 [SYSTEM-MONITOR] Periodic health checks started (every ${intervalMs/1000}s)`);
  }
  
  stopPeriodicHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('🏥 [SYSTEM-MONITOR] Periodic health checks stopped');
    }
  }
  
  // === PERMISSION MONITORING DURING ACTIVE TRACKING ===
  
  /**
   * Start continuous permission monitoring during active tracking
   * Checks every 2 minutes for permission revocation
   */
  startPermissionMonitoring() {
    if (this.permissionMonitorInterval) {
      console.log('🔒 [PERMISSION-MONITOR] Already running, skipping duplicate start');
      return;
    }
    
    const PERMISSION_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
    
    console.log('🔒 [PERMISSION-MONITOR] Starting permission monitoring (checking every 2 minutes)');
    
    this.permissionMonitorInterval = setInterval(async () => {
      // Only check if tracking is active
      if (!global.isTracking) {
        console.log('🔒 [PERMISSION-MONITOR] Tracking not active, skipping check');
        return;
      }
      
      try {
        const permissions = await this.checkPermissions();
        
        if (permissions.status === 'fail') {
          console.warn('🚨 [PERMISSION-MONITOR] Permissions revoked during active tracking!', permissions.details);
          
          // Pause tracking due to permission revocation
          await this.handlePermissionRevocation(permissions);
        } else {
          console.log('✅ [PERMISSION-MONITOR] Permissions still valid');
        }
      } catch (error) {
        console.error('❌ [PERMISSION-MONITOR] Error during permission check:', error);
      }
    }, PERMISSION_CHECK_INTERVAL);
    
    // Register with cleanup if available
    if (global.cleanupRegistry) {
      global.cleanupRegistry.register('permission-monitor', () => this.stopPermissionMonitoring());
    }
  }
  
  /**
   * Stop permission monitoring
   */
  stopPermissionMonitoring() {
    if (this.permissionMonitorInterval) {
      clearInterval(this.permissionMonitorInterval);
      this.permissionMonitorInterval = null;
      console.log('🔒 [PERMISSION-MONITOR] Permission monitoring stopped');
    }
  }
  
  /**
   * Handle permission revocation during active tracking
   * Pauses timer and notifies user
   */
  async handlePermissionRevocation(permissionResult) {
    console.log('🚨 [PERMISSION-MONITOR] Handling permission revocation...');
    
    try {
      // Pause tracking instead of stopping (preserves session)
      if (global.trackingManager && global.trackingManager.pauseTracking) {
        await global.trackingManager.pauseTracking('permissions_revoked');
        console.log('⏸️ [PERMISSION-MONITOR] Timer paused due to permission revocation');
      } else if (typeof global.stopTracking === 'function') {
        await global.stopTracking('permissions_revoked', 'Permissions were revoked');
        console.log('🛑 [PERMISSION-MONITOR] Timer stopped due to permission revocation');
      }
      
      // Notify UI about permission revocation
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('permissions-revoked', {
          details: permissionResult.details,
          message: 'Permissions were revoked. Timer paused.',
          timestamp: new Date().toISOString()
        });
      }
      
      // Show system notification
      try {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: 'Permissions Required',
            body: 'Timer paused - please re-enable permissions in System Settings',
            silent: false
          });
          notification.show();
        }
      } catch (notifError) {
        console.warn('⚠️ [PERMISSION-MONITOR] Could not show notification:', notifError.message);
      }
      
      // Trigger permission popup to guide user
      await this.triggerPermissionPopup(permissionResult);
      
    } catch (error) {
      console.error('❌ [PERMISSION-MONITOR] Error handling permission revocation:', error);
    }
  }
}

// Export singleton instance
const systemMonitor = new SystemMonitor();
module.exports = systemMonitor; 