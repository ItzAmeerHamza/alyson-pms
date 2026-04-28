/**
 * Enhanced App Detector Module
 * Handles application detection and tracking across platforms
 * Extracted from main.js for modular architecture
 */

const { execSync } = require('child_process');
const cleanupRegistry = require('../core/cleanup-registry');
const { logger } = require('../utils/logger');

class EnhancedAppDetector {
  constructor(config) {
    this.config = config;
    this.appCaptureInterval = null;
    this.realTimeAppInterval = null;
    this.lastDetectedApp = null;
    this.lastActiveApp = null;
    this.lastDuplicateAppLogTime = 0;
    this.isTracking = false;
    this.dwellState = null; // { key, appName, windowTitle, stable, sameCount, startMono, lastSavedMono, saved }
    // Read dwell threshold from env (fallback 10s). We keep existing config path too.
    const { DEFAULTS } = require('../utils/app-detection-constants');
    this.dwellThresholdMs = this.config?.dwell_threshold_ms || DEFAULTS.DWELL_MS;
    this.minSaveGapMs = DEFAULTS.MIN_SAVE_GAP_MS;
    this.maxRecordMs = DEFAULTS.MAX_RECORD_MS;
    this.stabilizeBrowser = DEFAULTS.STABILIZE_BROWSER;
    this.stabilizeDefault = DEFAULTS.STABILIZE_DEFAULT;
    
    // 🔧 CRITICAL FIX: Add deduplication tracking to prevent multiple saves
    this.lastSaveByKey = new Map(); // key -> { timestamp, appName, title }
    this.saveDeduplicationWindow = 5000; // 5 second deduplication window
    
    // 🔧 FIX: Track previous app entry for duration calculation
    this.previousAppEntry = null; // { id, appName, windowTitle, startedAt }
    
    // IPC coalescing to reduce UI chatter
    this.lastSentApp = null;
    this.lastSentTitle = null;
    this.heartbeatCounter = 0;
    this.heartbeatSampleRate = process.env.DEBUG_APP ? 1 : 3; // Send every 3rd heartbeat unless debugging
    
    // Transient app tracking (apps that didn't reach dwell threshold)
    this.transientApps = [];
    this.enableTransientTracking = process.env.APP_DETECT_TRACK_TRANSIENT !== 'false';
    this.transientFlushInterval = Number(process.env.APP_DETECT_TRANSIENT_FLUSH_MS) || 60000; // Flush every minute
    this.lastTransientFlush = Date.now();
    
    // Low-priority scheduling jitter
    this.scheduleJitter = Number(process.env.APP_DETECT_SCHEDULE_JITTER_MS) || 200; // ±200ms jitter
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'enhancedAppDetector',
      cleanup: async () => this.shutdown()
    });
  }

  initialize({ isTracking = false } = {}) {
    this.isTracking = isTracking;
    
    // [I] DEBUG_APP: Log initialization
    if (process.env.DEBUG_APP) {
      console.log('[I] AppDetector:init - Enhanced App Detector initialized:', {
        isTracking,
        config: {
          user_id: this.config?.user_id,
          app_capture_interval_seconds: this.config?.app_capture_interval_seconds,
          platform: process.platform
        }
      });
    }
    
    logger.info({ category: 'APP_DETECTION', step: 'INIT', message: 'Enhanced App Detector initialized' });
  }

  setTrackingState(tracking) {
    this.isTracking = tracking;
    try {
      // Ensure a real user_id is present once tracking is enabled
      if (this.isTracking) {
        const globalUid = global.currentUserId || (global.config && global.config.user_id) || null;
        if (globalUid && (!this.config || !this.config.user_id || this.config.user_id === 'default-user')) {
          this.config = this.config || {};
          this.config.user_id = globalUid;
          this.config.userId = globalUid;
          if (process.env.DEBUG_APP) {
            console.log('[I] AppDetector:init - user_id synchronized from globals:', { user_id: this.config.user_id });
          }
        }
      }
    } catch {}
  }

  // === ACTIVE APPLICATION DETECTION ===
  
  async detectActiveApplication() {
    const startTime = Date.now();
    // Perf: start timer for app enumeration
    let perfTimer = null;
    try {
      if (global.performanceMonitor) {
        perfTimer = global.performanceMonitor.trackAppEnumeration();
      }
    } catch {}
    
    // Check permissions before attempting detection (macOS)
    if (process.platform === 'darwin') {
      const permissionResult = await this.checkMacOSPermissions();
      
      // 🔧 FIX: Only require Accessibility permission for app detection
      // Screen Recording is only needed for screenshots, not app detection
      if (!permissionResult.accessibility) {
        // [J] DEBUG_APP: Log permission failure
        if (process.env.DEBUG_APP) {
          console.log('[J] AppDetector:tick - Permission check failed:', permissionResult);
        }
        
        this.showPermissionWarning(permissionResult);
        return null; // Return null but degrade gracefully
      }
      
      // Warn about missing Screen Recording but don't block app detection
      if (!permissionResult.screenRecording) {
        // Only show warning once every 5 minutes
        if (!this.lastScreenRecordingWarning || (Date.now() - this.lastScreenRecordingWarning) > 300000) {
          console.log('⚠️ [APP-DETECTOR] Screen Recording permission missing - screenshots may not work');
          this.lastScreenRecordingWarning = Date.now();
        }
      }
    }
    
    // Ensure awaited detection to avoid race conditions
    // 🔧 CRITICAL FIX: Use cached detection to reduce process spawning
    const { detectActiveApp: cachedDetectActiveApp } = require('./cached-app-detection');
    const result = await cachedDetectActiveApp();
    const endTime = Date.now();
    
    // [J] DEBUG_APP: Log detection tick
    if (process.env.DEBUG_APP) {
      console.log('[J] AppDetector:tick - Raw app detection result:', {
        name: result?.name || result?.appName || null,
        title: result?.title || result?.windowTitle || null,
        bundleId: result?.bundleId || null,
        platform: result?.platform || process.platform,
        detectionTime: `${endTime - startTime}ms`,
        timestamp: new Date().toISOString(),
        isTracking: this.isTracking
      });
    }
    
    try {
      if (global.performanceMonitor && perfTimer) {
        global.performanceMonitor.endTimer(perfTimer);
      }
    } catch {}
    return result;
  }

  // === APP CAPTURE FUNCTIONS ===
  
  startAppCapture() {
    logger.info({ category: 'APP_DETECTION', step: 'CAPTURE START', message: 'startAppCapture() called' });
    
    // 🔧 PERFORMANCE FIX: Don't start periodic capture if real-time detection will be used
    // Real-time detection handles everything - dwell tracking, UI updates, app switches
    // Having both is redundant and wastes CPU with duplicate native calls
    console.log('🔍 [APP-DETECTION] Periodic capture requested, will defer to real-time detection');
    
    if (this.appCaptureInterval) {
      clearInterval(this.appCaptureInterval);
      this.appCaptureInterval = null;
    }
    
    // Skip periodic capture entirely - real-time detection handles everything
    // The startRealTimeAppDetection() method is called separately and is sufficient
    logger.info({ category: 'APP_DETECTION', step: 'CAPTURE SKIP', message: 'Deferring to real-time detection (PERFORMANCE FIX)' });
    return; // Don't create periodic interval - real-time is sufficient
    
    // [I] DEBUG_APP: Log app capture start
    if (process.env.DEBUG_APP) {
      const effUid = this.config?.user_id || global.currentUserId || (global.config && global.config.user_id) || null;
      console.log('[I] AppDetector:init - Starting app capture with config:', {
        interval: this.config?.app_capture_interval_seconds || 10,
        isTracking: this.isTracking,
        userId: effUid
      });
    }
    
    const intervalSeconds = this.config?.app_capture_interval_seconds || 10;
    logger.info({ category: 'APP_DETECTION', step: 'CAPTURE INTERVAL', message: `${intervalSeconds}s` });
    
    // 🔧 FIX: Reduce periodic capture frequency when real-time detection is active
    // This prevents conflicts between the two detection methods
    const effectiveInterval = this.realTimeAppInterval ? Math.max(intervalSeconds * 2, 15) : intervalSeconds;
    
    if (this.realTimeAppInterval && effectiveInterval !== intervalSeconds) {
      console.log(`🔧 [APP-DETECTION] Real-time detection active - reducing periodic capture to ${effectiveInterval}s to prevent conflicts`);
    }
    
    this.appCaptureInterval = setInterval(async () => {
      if (!this.isTracking) {
        logger.debug({ category: 'APP_DETECTION', step: 'CAPTURE SKIP', message: 'not tracking' });
        return;
      }
      
      // PERFORMANCE FIX: Skip periodic capture when real-time detection is active
      // This prevents duplicate detection calls that waste CPU
      if (this.realTimeAppInterval) {
        logger.debug({ category: 'APP_DETECTION', step: 'CAPTURE SKIP', message: 'real-time active, skipping periodic' });
        return;
      }
      
      try {
        const activeApp = await this.detectActiveApplication();
        
        if (activeApp && (activeApp.name || activeApp.appName)) {
          const appName = activeApp.name || activeApp.appName;
          const windowTitle = activeApp.title || activeApp.windowTitle || '';
          
          // Previously skipped Electron; for diagnostics and broader coverage, allow Electron-based apps
          // to be captured as many modern apps are Electron. We will only filter our own agent elsewhere.
          
          // Establish current time for calculations/logging
          const now = Date.now();

          // Log Apple apps specifically
          if (activeApp.bundleId && activeApp.bundleId.startsWith('com.apple.')) {
            logger.debug({ category: 'APP_CAPTURE', step: 'APPLE', ctx: { appName, windowTitle, bundleId: activeApp.bundleId, timeSinceLastCapture: now - (this.lastAppCaptureTime || 0) } });
          }
          
          // Check if app has changed or significant time has passed (30 seconds)
          const timeSinceLastCapture = now - (this.lastAppCaptureTime || 0);
          const isAppSwitch = this.lastActiveApp !== appName;
          const shouldCaptureAgain = timeSinceLastCapture > 30000; // 30 seconds
          
          if (isAppSwitch || shouldCaptureAgain) {
            if (process.env.DEBUG_APP) { logger.debug({ category: 'APP_CAPTURE', step: 'ACTIVE', ctx: { appName, windowTitle, isAppSwitch, timeSinceLastCapture } }); }
            
            // [DEBUG] Log UI-only capture
            if (process.env.DEBUG_APP) {
              console.log('[APP-CAPTURE] UI update triggered for:', appName, 'window:', windowTitle);
            }
            
            // 🔧 FIX: REMOVED database save - only update UI for status/heartbeat
            // The 10s capture interval is for UI updates only, not persistence
            // All persistence happens through the dwell-based real-time detection
            
            // Only update tracking state and UI - NO DATABASE SAVE
            this.lastActiveApp = appName;
            this.lastAppCaptureTime = now;
            
            if (process.env.DEBUG_APP) {
              console.log('[APP-CAPTURE] UI-only update (no DB save):', { appName, windowTitle });
            }

            // Real-time UI update to renderer (dashboard header + list)
            if (global.mainWindow && !global.mainWindow.isDestroyed()) {
              try {
                global.mainWindow.webContents.send('app-detected', {
                  name: appName,
                  title: windowTitle,
                  timestamp: new Date().toISOString(),
                  type: 'capture-ui-only',  // Changed to indicate UI-only
                  // Include telemetry data
                  method: activeApp.method,
                  platform: activeApp.platform,
                  isBrowser: activeApp.isBrowser,
                  waylandLimited: activeApp.waylandLimited,
                  elevated: activeApp.elevated
                });
              } catch (e) {
                logger.warn({ category: 'APP_CAPTURE', step: 'UI UPDATE ERROR', message: e.message });
              }
            }
          }
        }
      } catch (error) {
        logger.error({ category: 'APP_CAPTURE', step: 'DETECTION ERROR', message: error.message });
      }
    }, this.config?.app_capture_interval_seconds * 1000 || 30000); // PERFORMANCE FIX: 30s instead of 10s
    
    cleanupRegistry.registerInterval(this.appCaptureInterval, 'App Capture');
    logger.info({ category: 'APP_CAPTURE', step: 'STARTED', message: '30s intervals (PERFORMANCE FIX)' });
  }

  stopAppCapture() {
    if (this.appCaptureInterval) {
      clearInterval(this.appCaptureInterval);
      this.appCaptureInterval = null;
      this.lastActiveApp = null;
      logger.info({ category: 'APP_CAPTURE', step: 'STOPPED' });
    }
  }

  // === REAL-TIME APP DETECTION ===
  
  startRealTimeAppDetection() {
    if (this.realTimeAppInterval) {
      clearInterval(this.realTimeAppInterval);
    }
    
    logger.info({ category: 'APP_DETECTION', step: 'REALTIME START', ctx: {
      isTracking: this.isTracking,
      hasConfig: !!this.config,
      userId: this.config?.user_id,
      hasDetectMethod: typeof this.detectActiveApplication === 'function'
    }});
    
    const { monotonicNow } = require('../utils/monotonic-clock');
    const { normalizeTitle, isBrowserApp } = require('../utils/title-normalizer');
    const { IGNORED_APP_TITLES, IGNORED_APP_NAMES } = require('../utils/app-detection-constants');

    // Function to run detection with optional jitter
    const runDetectionWithJitter = async () => {
      // FREEZE FIX: Skip detection entirely when tracking is inactive or shutting down.
      // Prevents expensive PowerShell/tasklist spawns when they serve no purpose.
      if (!global.isTracking || global.isShuttingDown || global.isStopping) {
        return;
      }
      // Skip app detection when screen is locked (prevents "loginwindow" entries)
      if (global.isScreenLocked) {
        return;
      }

      if (process.env.DEBUG_APP) {
        logger.debug({ category: 'APP_DETECTION', step: 'REALTIME TICK', message: new Date().toISOString() });
      }
      const __tickStart = Date.now();
      // Allow UI-only detection even when not tracking; saving is gated elsewhere
      
      try {
        const activeApp = await this.detectActiveApplication();
        if (process.env.DEBUG_APP) {
          logger.debug({ category: 'APP_DETECTION', step: 'REALTIME RESULT', ctx: {
            appName: activeApp?.name,
            appTitle: activeApp?.title,
            lastActive: this.lastActiveApp,
            isNewApp: activeApp?.name && this.lastActiveApp !== activeApp?.name
          }});
        }
        
        if (activeApp && (activeApp.name || activeApp.appName || activeApp.bundleId)) {
          const appName = activeApp.name || activeApp.appName || activeApp.bundleId || 'Unknown';
          const rawTitle = activeApp.title || activeApp.windowTitle || '';
          const title = normalizeTitle(rawTitle, appName) || '';
          const key = `${appName}|${title}`;
          const monoNow = monotonicNow();

          // Ignore known noise
          if (IGNORED_APP_TITLES.has(key) || IGNORED_APP_NAMES.some(re => re.test(String(appName)))) {
            return;
          }

          // Idle-aware gating
          const isIdle = !!global.enhancedIdleMonitor?.getIdleStatus?.().isIdle;
          const trackingOn = !!global.isTracking && !!global.currentUserId && !!global.currentTimeLogId;

          if (process.env.DEBUG_APP && Math.random() < 0.05) { // Sample 1 in 20 debug logs
            console.log('[DWELL-DEBUG] Enter tick', {
              key,
              isIdle,
              trackingOn
            });
          }

          // On switch → flush previous if met
          if (!this.dwellState || this.dwellState.key !== key) {
            await this._maybeFlushCurrentIfMet(monoNow);
            this.dwellState = {
              key,
              appName,
              windowTitle: title,
              stable: false,
              sameCount: 0,
              startMono: null,
              lastSavedMono: 0,
              saved: false,
            };
            this.lastActiveApp = appName;
            this.lastAppCaptureTime = Date.now();

            // UI update (coalesced - only send when app/title actually changes)
            try {
              if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                const appKey = `${appName}|${title}`;
                const lastKey = `${this.lastSentApp}|${this.lastSentTitle}`;
                
                if (appKey !== lastKey) {
                  const { safeIpcSend } = require('../ipc/ipc-backpressure');
                  safeIpcSend(global.mainWindow, 'app-detected', {
                    name: appName,
                    title,
                    timestamp: new Date().toISOString(),
                    type: 'switch',
                    // Include telemetry data
                    method: activeApp.method,
                    platform: activeApp.platform,
                    isBrowser: activeApp.isBrowser,
                    waylandLimited: activeApp.waylandLimited,
                    elevated: activeApp.elevated
                  });
                  
                  this.lastSentApp = appName;
                  this.lastSentTitle = title;
                }
              }
            } catch {}
            // Do not return; allow stabilization to proceed in the same tick
          }

          // Same key path: stabilization then accumulate
          const requiredSamples = isBrowserApp(appName) ? this.stabilizeBrowser : this.stabilizeDefault;
          if (!this.dwellState.stable) {
            this.dwellState.sameCount += 1;
            if (this.dwellState.sameCount >= requiredSamples) {
              this.dwellState.stable = true;
              // 🔧 CRITICAL FIX: For single-sample apps (requiredSamples: 1), save IMMEDIATELY
              // Single-sample apps don't need dwell time for first save - just confirmation of detection
              // This ensures apps like WhatsApp, Notebook, etc. are saved within ~5-10 seconds
              if (requiredSamples === 1) {
                // Start dwell accumulation for potential re-saves
                this.dwellState.startMono = monoNow;
                
                const isFirstSave = !this.dwellState.lastSavedMono || this.dwellState.lastSavedMono === 0;
                const gapOk = isFirstSave || (monoNow - (this.dwellState.lastSavedMono || 0)) >= this.minSaveGapMs;
                
                // 🔧 CRITICAL FIX: Add deduplication check
                const isDuplicate = this._isDuplicateSave(key, appName, title);
                
                // For single-sample apps: save immediately on first detection (isFirstSave)
                // or after gap period for re-saves - NO dwell threshold check for first save!
                if (isFirstSave && !isDuplicate) {
                  logger.info({ category: 'APP_DETECTION', step: 'SINGLE-SAMPLE SAVE', ctx: { key, requiredSamples, isFirstSave: true } });
                  await this._saveDwellApp(appName, title, Date.now());
                  this.dwellState.lastSavedMono = monoNow;
                  this.dwellState.saved = true;
                  this._recordSave(key, appName, title); // Record successful save
                  console.log(`✅ [APP-DWELL] Single-sample app saved immediately: ${appName}`);
                } else if (gapOk && !isDuplicate && !this.dwellState.saved) {
                  // Re-save after gap period if not already saved this session
                  logger.info({ category: 'APP_DETECTION', step: 'SINGLE-SAMPLE RE-SAVE', ctx: { key, gapOk } });
                  await this._saveDwellApp(appName, title, Date.now());
                  this.dwellState.lastSavedMono = monoNow;
                  this.dwellState.saved = true;
                  this._recordSave(key, appName, title);
                } else if (isDuplicate) {
                  logger.debug({ category: 'APP_DETECTION', step: 'DWELL SKIPPED', message: 'Duplicate save prevented', ctx: { key, appName, title } });
                }
              } else {
                // For multi-sample apps, use the traditional approach
                this.dwellState.startMono = monoNow;
                logger.info({ category: 'APP_DETECTION', step: 'DWELL START', ctx: { key, requiredSamples } });
              }
            }
            if (process.env.DEBUG_APP && Math.random() < 0.1) { // Sample 1 in 10 stabilization logs
              console.log('[DWELL-DEBUG] Stabilizing', {
                key,
                sameCount: this.dwellState.sameCount,
                requiredSamples,
                isBrowser: isBrowserApp(appName)
              });
            }
          }

          if (!this.dwellState.stable) return; // not yet stabilized
          if (isIdle || !trackingOn) {
            // Do not accumulate while idle or tracking off; but allow flush if already met earlier
            await this._maybeFlushCurrentIfMet(monoNow);
            if (process.env.DEBUG_APP) {
              console.log('[DWELL-DEBUG] Gated (idle or tracking off)', {
                key,
                isIdle,
                trackingOn
              });
            }
            return;
          }

          // 🔧 CRITICAL FIX: Fix elapsed time calculation - was always 0 for new apps!
          const startTime = this.dwellState.startMono;
          if (!startTime) {
            // If startMono is not set, we can't calculate elapsed time yet
            if (process.env.DEBUG_APP) {
              console.log('[DWELL-DEBUG] No start time yet', { key, startMono: startTime });
            }
            return; // Wait for next cycle when startMono is set
          }
          const elapsed = monoNow - startTime;
          const reached = elapsed >= this.dwellThresholdMs;
          // Allow initial save without enforcing min gap
          const isFirstSave = !this.dwellState.lastSavedMono || this.dwellState.lastSavedMono === 0;
          const gapOk = isFirstSave || (monoNow - (this.dwellState.lastSavedMono || 0)) >= this.minSaveGapMs;
          const capReached = elapsed >= this.maxRecordMs;

          // 🔧 ENHANCED DEBUG: More detailed dwell logging
          if (process.env.DEBUG_APP) {
            console.log('[DWELL-DEBUG] Tick', {
              key,
              startMono: startTime,
              monoNow,
              elapsed: Math.floor(elapsed),
              threshold: this.dwellThresholdMs,
              reached,
              gapOk,
              isFirstSave,
              capReached,
              appName,
              requiredSamples
            });
          }

          if ((reached && gapOk) || capReached) {
            // 🔧 CRITICAL FIX: Add deduplication check
            const isDuplicate = this._isDuplicateSave(key, appName, title);
            
            if (!isDuplicate) {
              // RACE CONDITION FIX: Record the save BEFORE the async _saveDwellApp call.
              // When active-win times out, multiple callers resolve from cached-app-detection.js
              // simultaneously. If we record after await, all callers pass _isDuplicateSave
              // before any of them record, causing 6x duplicate saves. Recording first ensures
              // only the first caller passes the dedup check.
              this._recordSave(key, appName, title);
              this.dwellState.lastSavedMono = monoNow;
              this.dwellState.saved = true;
              
              logger.info({ category: 'APP_DETECTION', step: 'DWELL REACHED', ctx: { key, elapsed: Math.floor(elapsed), threshold: this.dwellThresholdMs, gapOk, capReached } });
              await this._saveDwellApp(appName, title, Date.now());
              
              if (capReached) {
                // roll record
                this.dwellState.startMono = monoNow;
                this.dwellState.sameCount = requiredSamples; // already stable
              }
            } else {
              logger.debug({ category: 'APP_DETECTION', step: 'DWELL SKIPPED', message: 'Duplicate save prevented', ctx: { key, elapsed: Math.floor(elapsed), appName, title } });
            }
          }
        }
      } catch (error) {
        logger.error({ category: 'APP_DETECTION', step: 'REALTIME ERROR', message: error.message });
      }
      // Emit lightweight heartbeat for UI/diagnostics (sampled to reduce chatter)
      try {
        this.heartbeatCounter++;
        const shouldSendHeartbeat = (this.heartbeatCounter % this.heartbeatSampleRate) === 0;
        
        if (shouldSendHeartbeat) {
          const hbElapsed = (this.dwellState && this.dwellState.startMono)
            ? (monotonicNow() - this.dwellState.startMono)
            : 0;
          if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            const { safeIpcSend } = require('../ipc/ipc-backpressure');
            safeIpcSend(global.mainWindow, 'appDetection:heartbeat', {
              timestamp: Date.now(),
              elapsedMs: Math.max(0, Math.floor(hbElapsed || 0)),
              thresholdMs: this.dwellThresholdMs,
              // Telemetry summary
              method: activeApp?.method || 'none',
              platform: activeApp?.platform || process.platform,
              isBrowser: activeApp?.isBrowser || false,
              waylandLimited: activeApp?.waylandLimited || false,
              elevated: activeApp?.elevated || false,
              cached: activeApp?.method === 'cached'
            });
          }
        }
      } catch {}
      // Performance guardrail: rolling median warning when >10ms (sampled) + adaptive throttling
      try {
        this.__tickDurations = this.__tickDurations || [];
        const dur = Date.now() - __tickStart;
        this.__tickDurations.push(dur);
        if (this.__tickDurations.length > 60) this.__tickDurations.shift();
        if (this.__tickDurations.length >= 20) {
          const sorted = [...this.__tickDurations].sort((a,b)=>a-b);
          const mid = Math.floor(sorted.length/2);
          const median = sorted.length % 2 ? sorted[mid] : Math.floor((sorted[mid-1]+sorted[mid])/2);
          
          if (median > 10) {
            // Adaptive throttling when performance degrades
            if (!this.__performanceThrottled) {
              this.__performanceThrottled = true;
              this.heartbeatSampleRate = Math.max(this.heartbeatSampleRate * 2, 6); // Reduce heartbeat frequency
              
              // Increase platform manager cache TTL
              if (global.platformManager?.cache) {
                global.platformManager.cache.cacheMs = Math.min(global.platformManager.cache.cacheMs * 1.5, 3000);
              }
              
              if (Math.random() < 0.05) {
                console.warn(`⚠️ [DWELL-PERF] Median tick=${median}ms, enabling adaptive throttling`);
              }
            }
          } else if (median <= 8 && this.__performanceThrottled) {
            // Restore normal performance when recovered
            this.__performanceThrottled = false;
            this.heartbeatSampleRate = process.env.DEBUG_APP ? 1 : 3;
            
            if (global.platformManager?.cache) {
              global.platformManager.cache.cacheMs = Number(process.env.APP_DETECT_CACHE_MS) || 1800;
            }
            
            if (process.env.DEBUG_APP) {
              console.log('✅ [DWELL-PERF] Performance recovered, disabling throttling');
            }
          }
        }
      } catch {}
    };
    
    // 🔧 FIX: 5-second interval for responsive app detection
    // Apps should be captured within ~5-10 seconds of use
    // AppleScript detection takes 300-450ms but this is acceptable for accurate tracking
    const baseInterval = 5000; // 5 seconds - responsive app detection
    
    // Initial run with random jitter
    const initialJitter = Math.random() * this.scheduleJitter * 2 - this.scheduleJitter; // ±jitter
    setTimeout(() => {
      runDetectionWithJitter();
      
      // Then set up regular interval
      this.realTimeAppInterval = setInterval(() => {
        // Add jitter to smooth CPU spikes
        const jitter = Math.random() * this.scheduleJitter * 2 - this.scheduleJitter; // ±jitter
        setTimeout(() => runDetectionWithJitter(), Math.max(0, jitter));
      }, baseInterval);
      
      cleanupRegistry.registerInterval(this.realTimeAppInterval, 'Real-time App Detection');
    }, Math.max(0, initialJitter));
    
    console.log('✅ [REALTIME-APP] Real-time app detection interval created with jitter (±' + this.scheduleJitter + 'ms)');
    logger.info({ category: 'APP_DETECTION', step: 'REALTIME STARTED', message: '5s intervals (responsive detection)' });
  }

  async handleRealTimeAppSwitch(appName, windowTitle, activeApp = {}) {
    try {
      // Log app switch event
      console.log(`📱 [APP-SWITCH] New active app: "${appName}" | Window: "${windowTitle}"`);
      
      // Update UI with new app (DB save handled by dwell logic)
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('app-detected', {
          name: appName,
          title: windowTitle,
          timestamp: new Date().toISOString(),
          type: 'switch',
          // Include telemetry data if available
          method: activeApp.method,
          platform: activeApp.platform,
          isBrowser: activeApp.isBrowser,
          waylandLimited: activeApp.waylandLimited,
          elevated: activeApp.elevated
        });
      }
      
      // Do NOT trigger screenshots on app switch to preserve 3-per-10min policy
      // Enable only for diagnostics via DIAG_APP_SWITCH_SCREENSHOT=true
      if (process.env.DIAG_APP_SWITCH_SCREENSHOT === 'true' && global.enhancedScreenshotManager) {
        console.log('📸 [APP-SWITCH][DIAG] Triggering screenshot for app switch');
        setTimeout(() => {
          global.enhancedScreenshotManager.captureScreenshot(false);
        }, 1000);
      }
      
    } catch (error) {
      console.error('❌ [APP-SWITCH] Failed handling app switch:', error.message);
    }
  }

  stopRealTimeAppDetection() {
    if (this.realTimeAppInterval) {
      clearInterval(this.realTimeAppInterval);
      this.realTimeAppInterval = null;
      this.lastDetectedApp = null;
      console.log('✅ [REALTIME-APP] Real-time app detection stopped');
    }
  }

  // === UTILITY FUNCTIONS ===
  
  /**
   * 🔧 CRITICAL FIX: Check if this app save would be a duplicate
   * Prevents multiple saves of the same app within the deduplication window
   */
  _isDuplicateSave(key, appName, title) {
    const now = Date.now();
    const lastSave = this.lastSaveByKey.get(key);
    
    if (!lastSave) {
      return false; // First save for this key
    }
    
    const timeSinceLastSave = now - lastSave.timestamp;
    const isDuplicate = timeSinceLastSave < this.saveDeduplicationWindow;
    
    if (isDuplicate && process.env.DEBUG_APP) {
      console.log(`[DWELL-DEDUP] Skipping duplicate save for ${key}: ${timeSinceLastSave}ms < ${this.saveDeduplicationWindow}ms`);
    }
    
    return isDuplicate;
  }
  
  /**
   * 🔧 CRITICAL FIX: Record a successful save to prevent duplicates
   */
  _recordSave(key, appName, title) {
    this.lastSaveByKey.set(key, {
      timestamp: Date.now(),
      appName,
      title
    });
    
    // Clean up old entries to prevent memory leaks
    if (this.lastSaveByKey.size > 100) {
      const cutoff = Date.now() - (this.saveDeduplicationWindow * 2);
      for (const [oldKey, entry] of this.lastSaveByKey.entries()) {
        if (entry.timestamp < cutoff) {
          this.lastSaveByKey.delete(oldKey);
        }
      }
    }
  }
  
  shouldLogDuplicateApp() {
    // Log duplicate apps every 5 minutes
    return Date.now() - this.lastDuplicateAppLogTime > 5 * 60 * 1000;
  }

  /**
   * Wait for Supabase client to be available
   * Returns the client when ready or null if timeout
   */
  async waitForSupabase(timeoutMs = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      // Check for any available Supabase client
      const client = global.supabaseService || global.supabase || global.supabaseClient;
      
      if (client && typeof client.from === 'function') {
        return client;
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null; // Timeout reached
  }

  // === HEALTH CHECK FUNCTIONS ===
  
  getHealthStatus() {
    const now = Date.now();
    const status = {
      isTracking: this.isTracking,
      hasPeriodicInterval: !!this.appCaptureInterval,
      hasRealTimeInterval: !!this.realTimeAppInterval,
      lastAppCaptureTime: this.lastAppCaptureTime ? now - this.lastAppCaptureTime : null,
      lastActiveApp: this.lastActiveApp,
      dwellState: this.dwellState ? {
        key: this.dwellState.key,
        elapsed: this.dwellState.startMono ? (require('../utils/monotonic-clock').monotonicNow() - this.dwellState.startMono) : null,
        stable: this.dwellState.stable,
        saved: this.dwellState.saved
      } : null,
      performance: {
        throttled: this.__performanceThrottled || false,
        heartbeatSampleRate: this.heartbeatSampleRate,
        medianTickDuration: this.__tickDurations ? this.__tickDurations.sort((a,b) => a-b)[Math.floor(this.__tickDurations.length/2)] : null
      }
    };
    
    return status;
  }
  
  // === TEST FUNCTIONS ===
  
  async testPlatformAppCapture() {
    console.log('🧪 [APP-TEST] Testing platform app capture...');
    
    try {
      const result = await this.detectActiveApplication();
      
      if (result) {
        console.log('✅ [APP-TEST] App capture test successful:', {
          name: result.name,
          title: result.title,
          platform: process.platform
        });
        return result;
      } else {
        console.log('❌ [APP-TEST] App capture test failed - no active app detected');
        return null;
      }
    } catch (error) {
      console.log('❌ [APP-TEST] App capture test error:', error.message);
      return null;
    }
  }

  // === PERMISSION CHECKING ===
  
  async checkMacOSPermissions() {
    try {
      let accessibility = false;
      let screenRecording = false;
      
      // 🔧 FIX: Use osascript-based permission check (more reliable than systemPreferences)
      // Check accessibility permission using osascript
      try {
        const { execSync } = require('child_process');
        execSync('/usr/bin/osascript -e "tell application \\"System Events\\" to get name of first process"', {
          encoding: 'utf8',
          timeout: 2000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        accessibility = true;
      } catch (error) {
        // Check if it's really a permission issue
        if (error.message && (error.message.includes('not allowed') || error.message.includes('assistive'))) {
          accessibility = false;
        } else {
          // Other errors might not be permission-related, check with Electron API
          if (global.systemPreferences?.isTrustedAccessibilityClient) {
            accessibility = global.systemPreferences.isTrustedAccessibilityClient(false);
          } else {
            // If we can't verify and it's not clearly a permission error, assume we have permission
            // This avoids false warnings when AppleScript fails for other reasons
            accessibility = true;
          }
        }
      }
      
      // Only use Electron API as additional verification if we think we don't have permission
      if (!accessibility && global.systemPreferences?.isTrustedAccessibilityClient) {
        accessibility = global.systemPreferences.isTrustedAccessibilityClient(false);
      }
      
      // Check screen recording permission (if Electron API available)
      if (global.systemPreferences?.getMediaAccessStatus) {
        screenRecording = global.systemPreferences.getMediaAccessStatus('screen') === 'granted';
      } else {
        // For now, assume screen recording is available if we can't check
        // This prevents blocking app detection when Electron APIs aren't available
        screenRecording = true;
      }
      
      return { accessibility, screenRecording };
    } catch (error) {
      console.error('❌ [APP-DETECTOR] Permission check error:', error.message);
      return { accessibility: false, screenRecording: false };
    }
  }
  
  showPermissionWarning(permissionResult) {
    // Throttle warnings to avoid spam
    const now = Date.now();
    if (this.lastPermissionWarning && (now - this.lastPermissionWarning) < 30000) {
      return; // Don't show again within 30 seconds
    }
    this.lastPermissionWarning = now;
    
    let warningMessage = '';
    const missingPermissions = [];
    
    // 🔧 FIX: Only warn about missing Accessibility permission for app detection
    // Screen Recording warnings are handled separately
    if (!permissionResult.accessibility) {
      missingPermissions.push('Accessibility');
    }
    
    if (missingPermissions.length > 0) {
      warningMessage = `App Detection requires ${missingPermissions.join(' and ')} permission${missingPermissions.length > 1 ? 's' : ''}`;
      
      console.log('🔒 [APP-DETECTOR] Permission warning:', warningMessage);
      
      // Send to renderer for UI banner/toast
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('app-detection-permission-warning', {
          message: warningMessage,
          missingPermissions,
          actionText: 'Open System Settings',
          action: 'open-accessibility-settings'
        });
      }
      
      // Show tray notification
      if (global.showTrayNotification) {
        global.showTrayNotification(
          `Enable ${missingPermissions.join(' & ')} for App Detection`, 
          'warning'
        );
      }
    }
  }

  async _saveDwellApp(appName, windowTitle, timestampMs) {
    // Auto-sync tracking state from global if desynced (e.g. renderer started tracking
    // before the app detector's setTrackingState was called)
    if (!this.isTracking && global.isTracking && !global.isStopping) {
      console.log('🔄 [DWELL] Auto-syncing tracking state from global (was false, global is true)');
      this.isTracking = true;
    }

    if (!global.isTracking || global.isStopping) {
      console.log('⚠️ [DWELL] Skipping save - tracking stopped or stopping');
      return;
    }
    
    try {
      const userId = (this.config && (this.config.user_id || this.config.userId)) || global.currentUserId || (global.config && global.config.user_id) || null;
      if (!userId) {
        console.log('⚠️ [DWELL] Skipping save - no user_id');
        return;
      }
      
      // Skip Electron | No Window
      if (appName && appName.toLowerCase() === 'electron' && (!windowTitle || windowTitle === 'No Window')) {
        console.log('⚠️ [DWELL] Skipping Electron | No Window');
        return;
      }
      
      // Skip saving "Unknown" apps (detection failure) - new in v1.0.124+
      // Includes "Desktop Activity" which is the v1.0.124+ fallback from cached-app-detection
      if (appName === 'Unknown' || appName === 'Unknown Application' || appName === 'Desktop Activity') {
        console.log('⚠️ [DWELL] Skipping detection failure app:', appName);
        return;
      }
      
      const startedAt = new Date(timestampMs || Date.now()).toISOString();
      
      // 🔧 FIX: Close previous app entry with ended_at and duration_seconds
      await this._closePreviousAppEntry(startedAt);
      
      // Use started_at instead of timestamp for proper duration tracking
      const log = {
        user_id: userId,
        time_log_id: global.currentTimeLogId,
        app_name: appName,
        window_title: windowTitle,
        started_at: startedAt, // FIXED: Use started_at column
        capture_method: 'dwell',
        agent_version: global.agentVersion || null // Add agent version tracking (v1.0.124+)
      };
      
      let savedEntryId = null;
      
      
      if (global.syncManager) {
        await global.syncManager.addAppLogs([log]);
        console.log('✅ [DWELL] App saved via sync manager:', appName);
      } else if (global.enhancedSyncManager?.addToQueue) {
        await global.enhancedSyncManager.addToQueue('appLogs', [log]);
        console.log('✅ [DWELL] App queued via enhanced sync manager:', appName);
      } else {
        const supabaseClient = await this.waitForSupabase();
        if (supabaseClient) {
          const { data, error } = await supabaseClient.from('app_logs').insert(log).select('id');
          if (error) {
            // Handle network errors gracefully
            if (error.message && (error.message.includes('fetch failed') || 
                                  error.message.includes('network') || 
                                  error.message.includes('timeout'))) {
              // Queue for later sync
              if (global.offlineQueue && global.offlineQueue.appLogs) {
                global.offlineQueue.appLogs.push(log);
                console.log('📴 [DWELL] App queued for offline sync:', appName);
              } else {
                console.log('📴 [DWELL] Network issue - app data may be lost:', appName);
              }
            } else {
              // Non-network errors should still be logged
              console.error('❌ [DWELL] DB error:', error.message);
            }
          } else {
            savedEntryId = data?.[0]?.id || null;
            console.log('✅ [DWELL] App saved directly to DB:', appName, savedEntryId ? `(id: ${savedEntryId})` : '');
          }
        } else {
          console.log('⚠️ [DWELL] Supabase not ready; skipping');
        }
      }
      
      // 🔧 FIX: Track current entry for duration calculation on next app switch
      this.previousAppEntry = {
        id: savedEntryId,
        appName,
        windowTitle,
        startedAt: timestampMs || Date.now()
      };
      
    } catch (error) {
      console.error('❌ [DWELL] Save error:', error.message);
    }
  }
  
  /**
   * 🔧 FIX: Close previous app entry with ended_at and duration_seconds
   * Called when a new app becomes active
   */
  async _closePreviousAppEntry(endedAt) {
    try {
      if (!this.previousAppEntry || !this.previousAppEntry.startedAt) {
        return; // No previous entry to close
      }
      
      const startTime = this.previousAppEntry.startedAt;
      const endTime = new Date(endedAt).getTime();
      const durationMs = endTime - startTime;
      const durationSeconds = Math.round(durationMs / 1000);
      
      // Only update if we have a valid duration
      if (durationSeconds <= 0) {
        console.log('⚠️ [DWELL] Skipping close - invalid duration:', durationSeconds);
        return;
      }
      
      // Update via direct DB if we have the entry ID
      // CRITICAL FIX: Only update ended_at - duration_seconds is a computed column
      if (this.previousAppEntry.id) {
        const supabaseClient = await this.waitForSupabase();
        if (supabaseClient) {
          const { error } = await supabaseClient
            .from('app_logs')
            .update({
              ended_at: endedAt
              // duration_seconds is computed by DB from started_at and ended_at
            })
            .eq('id', this.previousAppEntry.id);
          
          if (error) {
            console.warn('⚠️ [DWELL] Failed to close previous app entry:', error.message);
          } else {
            console.log(`✅ [DWELL] Closed previous app: ${this.previousAppEntry.appName} (${durationSeconds}s)`);
          }
        }
      } else {
        // If no ID, try to update based on user_id, app_name, and started_at
        const supabaseClient = await this.waitForSupabase();
        const userId = (this.config && (this.config.user_id || this.config.userId)) || global.currentUserId || null;
        
        if (supabaseClient && userId) {
          const previousStartedAt = new Date(this.previousAppEntry.startedAt).toISOString();
          // CRITICAL FIX: Only update ended_at - duration_seconds is a computed column
          const { error } = await supabaseClient
            .from('app_logs')
            .update({
              ended_at: endedAt
              // duration_seconds is computed by DB from started_at and ended_at
            })
            .eq('user_id', userId)
            .eq('app_name', this.previousAppEntry.appName)
            .eq('started_at', previousStartedAt)
            .is('ended_at', null);
          
          if (error) {
            console.warn('⚠️ [DWELL] Failed to close previous app entry (fallback):', error.message);
          } else {
            console.log(`✅ [DWELL] Closed previous app (fallback): ${this.previousAppEntry.appName} (${durationSeconds}s)`);
          }
        }
      }
      
      // Clear the previous entry
      this.previousAppEntry = null;
      
    } catch (error) {
      console.error('❌ [DWELL] Close previous entry error:', error.message);
    }
  }

  async _maybeFlushCurrentIfMet(monoNow) {
    try {
      if (!this.dwellState) return;
      
      // 🔧 CRITICAL FIX: Construct the key from dwellState to avoid undefined variable
      const key = `${this.dwellState.appName}|${this.dwellState.windowTitle}`;
      
      // If stable but didn't reach dwell threshold, save as transient
      if (this.dwellState.stable && this.enableTransientTracking) {
        const start = this.dwellState.startMono || monoNow;
        const elapsed = monoNow - start;
        
        // 🔧 IMPROVED: Save as transient if < dwell threshold and > 500ms (reduced from 1s to catch more apps)
        // Only save if we haven't already saved this app recently
        if (elapsed < this.dwellThresholdMs && elapsed > 500 && !this.dwellState.saved) {
          // 🔧 CRITICAL FIX: Add deduplication check for transient saves
          const isDuplicate = this._isDuplicateSave(key, this.dwellState.appName, this.dwellState.windowTitle);
          
          if (!isDuplicate) {
            try {
              await this._saveDwellApp(this.dwellState.appName, this.dwellState.windowTitle, Date.now());
              this.dwellState.lastSavedMono = monoNow;
              this.dwellState.saved = true;
              this._recordSave(key, this.dwellState.appName, this.dwellState.windowTitle); // Record successful save
              console.log(`✅ [DWELL] Single-sample app saved immediately: ${this.dwellState.appName} (${Math.round(elapsed)}ms)`);
            } catch (error) {
              console.error(`❌ [DWELL] Failed to save single-sample app ${this.dwellState.appName}:`, error.message);
            }
          } else if (process.env.DEBUG_APP) {
            console.log(`[DWELL-DEDUP] Skipping transient save for ${key}: duplicate within dedup window`);
          }
        }
      }
      
      // Check if we should flush transient apps
      if (this.enableTransientTracking && (Date.now() - this.lastTransientFlush) > this.transientFlushInterval) {
        await this._flushTransientApps();
      }
      
      if (!this.dwellState.stable) return;
      
      const start = this.dwellState.startMono || monoNow;
      const elapsed = monoNow - start;
      if (elapsed >= this.dwellThresholdMs) {
        const gapOk = (monoNow - (this.dwellState.lastSavedMono || 0)) >= this.minSaveGapMs;
        if (gapOk) {
          await this._saveDwellApp(this.dwellState.appName, this.dwellState.windowTitle, Date.now());
          this.dwellState.lastSavedMono = monoNow;
          this.dwellState.saved = true;
        }
      }
      
      // 🔧 IMPROVED: Flush if we've been stable for a while but haven't saved
      // This catches apps that stay active but don't reach dwell threshold
      if (this.dwellState.stable && !this.dwellState.saved && elapsed > 5000) {
        // 🔧 CRITICAL FIX: Add deduplication check for flush saves
        const isDuplicate = this._isDuplicateSave(key, this.dwellState.appName, this.dwellState.windowTitle);
        
        if (!isDuplicate) {
          try {
            await this._saveDwellApp(this.dwellState.appName, this.dwellState.windowTitle, Date.now());
            this.dwellState.lastSavedMono = monoNow;
            this.dwellState.saved = true;
            this._recordSave(key, this.dwellState.appName, this.dwellState.windowTitle); // Record successful save
            console.log(`✅ [DWELL] App saved via flush: ${this.dwellState.appName} (${Math.round(elapsed)}ms)`);
          } catch (error) {
            console.error(`❌ [DWELL] Failed to save app via flush ${this.dwellState.appName}:`, error.message);
          }
        } else if (process.env.DEBUG_APP) {
          console.log(`[DWELL-DEDUP] Skipping flush save for ${key}: duplicate within dedup window`);
        }
      }
    } catch (e) {
      logger.warn({ category: 'APP_DETECTION', step: 'DWELL FLUSH WARN', message: e?.message || String(e) });
    }
  }

  async _flushTransientApps() {
    if (!this.transientApps.length) return;
    
    try {
      // Log transient apps for analytics (but don't save to main app_logs)
      logger.info({ 
        category: 'APP_DETECTION', 
        step: 'TRANSIENT_FLUSH', 
        ctx: { 
          count: this.transientApps.length,
          apps: this.transientApps.map(a => ({ 
            app: a.appName, 
            duration: Math.round(a.duration / 1000) + 's' 
          }))
        }
      });
      
      // Could save to a separate table or analytics system if needed
      // For now, just log for visibility
      
      // Clear the queue
      this.transientApps = [];
      this.lastTransientFlush = Date.now();
    } catch (e) {
      logger.warn({ category: 'APP_DETECTION', step: 'TRANSIENT_FLUSH_ERROR', message: e?.message });
    }
  }

  async _flushOnStop() {
    try {
      const { monotonicNow } = require('../utils/monotonic-clock');
      const now = monotonicNow();
      if (!this.dwellState || !this.dwellState.stable) return;
      const start = this.dwellState.startMono || now;
      const elapsed = now - start;
      const cutoff = Math.floor(this.dwellThresholdMs * 0.8);
      if (elapsed >= cutoff) {
        await this._maybeFlushCurrentIfMet(now);
      }
      
      // 🔧 FIX: Close the current app entry when tracking stops
      if (this.previousAppEntry) {
        const endedAt = new Date().toISOString();
        await this._closePreviousAppEntry(endedAt);
        console.log('✅ [DWELL] Closed current app entry on tracking stop');
      }
      
      // Also flush any remaining transient apps on stop
      if (this.enableTransientTracking && this.transientApps.length > 0) {
        await this._flushTransientApps();
      }
    } catch {}
  }

  shutdown() {
    // Attempt to flush any near-threshold dwell before stopping
    try { this._flushOnStop(); } catch {}
    this.stopAppCapture();
    this.stopRealTimeAppDetection();
    console.log('🖥️ [ENHANCED-APP-DETECTOR] Shutdown complete');
  }
  
  // Debug command for console
  debugAppDetection() {
    console.log('🔍 [APP-DETECTION DEBUG] Current Status:');
    console.log('  Tracking:', this.isTracking);
    console.log('  Periodic Interval:', !!this.appCaptureInterval);
    console.log('  Real-time Interval:', !!this.realTimeAppInterval);
    console.log('  Last Active App:', this.lastActiveApp);
    console.log('  Last Capture Time:', this.lastAppCaptureTime ? new Date(this.lastAppCaptureTime).toISOString() : 'Never');
    
    if (this.dwellState) {
      console.log('  Dwell State:', {
        key: this.dwellState.key,
        stable: this.dwellState.stable,
        saved: this.dwellState.saved
      });
    }
    
    // Test detection
    this.detectActiveApplication().then(result => {
      console.log('  Current App Detection:', result);
    }).catch(error => {
      console.log('  Detection Error:', error.message);
    });
  }
}

module.exports = EnhancedAppDetector;