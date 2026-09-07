/**
 * JavaScript wrapper for UrlCaptureManager
 * This file bridges the TypeScript implementation for Node.js runtime
 */

const EventEmitter = require('events');
const { noteMeetingContext } = require('../../lib/meeting-context');

/**
 * How long the browser must be out of focus before an open visit is closed.
 *
 * Long enough that checking Slack or an IDE does not split one visit into
 * several rows; short enough that a real departure is not billed as browsing.
 * The recorded end is backdated to when focus was actually lost, so this only
 * controls fragmentation — never the accuracy of the duration itself.
 */
const URL_VISIT_GRACE_MS = 90 * 1000;

class UrlCaptureManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      debugLogging: config.debugLogging || (process.env.URL_DEBUG_LOGGING === 'true'),
      debounceMs: config.debounceMs || 250,
      minSliceSec: config.minSliceSec || 5,
      maxEventsPerSec: config.maxEventsPerSec || 1,
      privacy: config.privacy || {},
      skipInternalUrls: config.skipInternalUrls !== false,
      enabled: config.enabled !== false,
      maxUrlLength: config.maxUrlLength || 2048,

      // Performance toggles
      diagRateLimitPerMin: Number(process.env.URL_DIAG_RATE_LIMIT_PER_MIN || 120),
      minPollMsActive: Number(process.env.URL_TRACKING_MIN_POLL_MS_ACTIVE || 120000),
      minPollMsWayland: Number(process.env.URL_TRACKING_MIN_POLL_MS_WAYLAND || 15000),
      pollMsIdle: Number(process.env.URL_TRACKING_POLL_MS_IDLE || 180000),
      workerYieldMs: Number(process.env.URL_WORKER_YIELD_MS || 8),
      maxPerTick: Number(process.env.URL_MAX_PER_TICK || 1),
      redactPipelineConcurrency: Number(process.env.URL_REDACT_PIPELINE_CONCURRENCY || 1)
    };

    this.isRunning = false;
    this.isPolling = false;  // FIX: Add missing isPolling flag
    this.windowStates = new Map();
    this.eventCount = 0;
    this.suppressedCount = 0;
    this.oversizeDrops = 0;
    this.internalDrops = 0;
    this.sourceCounts = {};
    this.closeReasons = { idle: 0, shutdown: 0, change: 0 };

    // Platform-specific capture adapter
    this.adapter = null;

    // Debounce timers
    this.debounceTimers = new Map();

    // Adaptive polling state - matches steady-state after CPU budget backoff
    this.pollDelay = 60000;
    this.lastResult = null;

    // Status tracking
    this.lastUrlCapture = null;
    this.lastUrlCaptureTime = 0;

    // Performance optimizations
    this.domainCache = new Map(); // LRU cache for domain extraction
    this.maxCacheSize = 256;
    this.adaptiveCacheSize = 256; // Adaptive cache sizing
    this.cacheHitCount = 0;
    this.cacheMissCount = 0;
    this.lastCacheAdjust = Date.now();

    this.uiElementCache = new Map(); // Cache UI elements by windowId
    this.lastErrorTime = new Map(); // Track errors for backoff
    this.diagLastEmit = new Map(); // Rate limit diagnostics
    this.eventsThisTick = 0;
    this.nextTickTimer = null;

    // Platform resolver backoff
    this.resolverBackoff = new Map(); // resolver -> backoffUntil timestamp
    this.concurrentResolvers = new Set(); // Track active resolvers

    // CPU budget watchdog
    this.cpuBudget = {
      windowMs: 5000, // 5 second window
      maxMs: Number(process.env.URL_TRACKING_CPU_BUDGET_MS || 500),
      measurements: [],
      backoffActive: false,
      originalPollDelay: this.pollDelay,
      consecutiveOverBudget: 0 // Track consecutive over-budget ticks for exponential backoff
    };

    // Global diagnostic budget
    this.globalDiagCount = 0;
    this.globalDiagWindow = Date.now();
    this.globalDiagLimit = 400; // 400 per minute globally
  }

  start() {
if (!this.config.enabled) {
      if (this.config.debugLogging) {
        console.log('[URL] UrlCaptureManager disabled via config');
      }
      return;
    }

    // CRITICAL FIX: Allow restart - polling loop is always running and checks tracking state
    if (this.isRunning) {
      // Already running - polling loop will automatically resume when tracking becomes active
      if (this.config.debugLogging) {
        console.log('[URL] UrlCaptureManager already running (polling continues automatically)');
      }
      return;
    }

    this.isRunning = true;
    this.isPolling = true;  // FIX: Enable polling when starting

    // Initialize platform-specific adapter
    try {
      const platform = process.platform;
      if (platform === 'darwin') {
        console.log('[URL] Initializing macOS URL Capture (DarwinUrlCapture)');
        const { DarwinUrlCapture } = require('../../platform/darwin/urlCapture.js');
        this.adapter = new DarwinUrlCapture();
        console.log('[URL] DarwinUrlCapture initialized:', !!this.adapter);
        console.log('[URL] Adapter methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.adapter)).filter(m => m !== 'constructor').slice(0, 5).join(', '));
        console.log('[URL] Detection: AppleScript → Safari/Chrome/Firefox');
      } else if (platform === 'win32') {
        console.log('[URL] Initializing Windows URL Capture Fast Edition (active-win + CDP)');

        // Use FAST adapter with active-win (native API, ~10ms response time)
        const { WindowsUrlCaptureFast } = require('../../platform/win32/windows-url-capture-fast.js');
        this.adapter = new WindowsUrlCaptureFast();
        console.log('[URL] Windows URL Capture Fast initialized successfully');
        console.log('[URL] Detection methods: active-win (~10ms) → title parse → CDP (optional)');

        // Start the adapter
        try {
          if (this.adapter && typeof this.adapter.start === 'function') {
            this.adapterStop = this.adapter.start((event) => {
              if (event && event.url) {
                console.log('[URL-V2] Detected:', {
                  url: event.url.substring(0, 60) + '...',
                  browser: event.browser,
                  method: event.method
                });
                this.emitUrlEvent(event, 'windows-v2-adapter');
              }
            });
            console.log('[URL] Windows adapter started with event handler');
          }
        } catch (e) {
          console.log('⚠️ [URL] Adapter.start threw, will rely on polling getCurrentUrl:', e.message);
        }
      } else if (platform === 'linux') {
        const { LinuxUrlCapture } = require('../../platform/linux/urlCapture.js');
        this.adapter = new LinuxUrlCapture();
      } else {
        console.warn(`[URL] Unsupported platform: ${platform}`);
        return;
      }

      // Set up adaptive polling interval
      const adaptivePoll = () => {
        // CRITICAL FIX: Check tracking state before capturing
        const trackingManager = global.trackingManager;
        const isTracking = trackingManager?.isTracking ?? false;
        const hasTimeLog = trackingManager?.currentTimeLogId != null;

        // CRITICAL FIX: Keep polling loop running but skip capture when inactive
        // This allows polling to automatically resume when tracking starts again
        if (!this.isPolling) {
          // Only stop completely if explicitly stopped via stop()
          if (this.pollInterval) {
            clearTimeout(this.pollInterval);
            this.pollInterval = null;
          }
          return;
        }

        // Skip URL capture when tracking is inactive, but keep polling loop alive
        if (!isTracking || !hasTimeLog) {
          // Reset session keys so the same URL can open a new visit on next start
          for (const state of this.windowStates.values()) {
            state.lastUrl = null;
            state.lastUrlTime = 0;
          }
          let inactiveDelay = 15000;
          try {
            const { getUrlPollDelayMs } = require('../utils/power-profile');
            inactiveDelay = getUrlPollDelayMs();
          } catch (_) {}
          this.pollInterval = setTimeout(adaptivePoll, inactiveDelay);
          return;
        }

        // Screen locked: do not spawn AppleScript (sessions stay open; time_logs untouched)
        if (global.isScreenLocked) {
          let lockedDelay = 60000;
          try {
            const { getUrlPollDelayMs } = require('../utils/power-profile');
            lockedDelay = getUrlPollDelayMs();
          } catch (_) {}
          this.pollInterval = setTimeout(adaptivePoll, lockedDelay);
          return;
        }

        // Poll for URL changes (only when tracking is active)
        if (this.isPolling) {
          // 🔧 FIX: Gate debug logging behind DEBUG_URL environment variable
          if (process.env.DEBUG_URL) {
            console.log('[URL] DEBUG: Polling for URL...');
          }

          try {
            this.captureCurrentUrl();

            // Adjust poll delay based on activity (with performance caps)
            // CRITICAL: Only adjust when CPU budget backoff is NOT active.
            // Otherwise the adaptive logic overwrites the exponential backoff delay,
            // making CPU budget enforcement ineffective.
            if (!this.cpuBudget.backoffActive) {
              try {
                const { getUrlPollDelayMs } = require('../utils/power-profile');
                this.pollDelay = getUrlPollDelayMs();
              } catch (_) {
                const isIdle = global.enhancedIdleMonitor?.isIdle || false;
                const hasActiveBrowser = this.lastResult?.browser && this.lastResult?.url;
                const isLinuxWayland = this.lastResult?.platform === 'wayland';

                if (isIdle || !hasActiveBrowser) {
                  this.pollDelay = Math.max(
                    isLinuxWayland ? 3000 : this.config.pollMsIdle,
                    isLinuxWayland ? this.config.minPollMsWayland : this.config.minPollMsActive
                  );
                } else {
                  this.pollDelay = Math.max(
                    isLinuxWayland ? this.config.minPollMsWayland : this.config.minPollMsActive,
                    5000
                  );
                }
              }
            }

            // Schedule next poll
            this.pollInterval = setTimeout(adaptivePoll, this.pollDelay + Math.floor(Math.random() * 3000));
          } catch (error) {
            console.error('[URL] Error during adaptive polling:', error);
            this.pollInterval = null; // Stop polling on error
            this.isPolling = false;  // FIX: Reset polling flag on error
          }
        }
      };

      // Start polling — stagger away from app-detect tick to avoid stacked AppleScript
      let initialDelay = 100;
      try {
        const { getUrlPollStaggerMs } = require('../utils/power-profile');
        initialDelay = getUrlPollStaggerMs();
      } catch (_) { /* keep 100ms */ }
      this.pollInterval = setTimeout(adaptivePoll, initialDelay);

      if (this.config.debugLogging) {
        console.log(`[URL] UrlCaptureManager started on ${platform}`);
      }
    } catch (error) {
      console.error('[URL] Failed to initialize platform adapter:', error);
      this.isRunning = false;
      this.isPolling = false;  // FIX: Reset polling flag on error
    }
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.isPolling = false;  // FIX: Stop polling when stopping

    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }

    // FREEZE FIX: Clear any pending nextTick timer to prevent post-stop event emission
    if (this.nextTickTimer) {
      clearImmediate(this.nextTickTimer);
      this.nextTickTimer = null;
    }

    // FREEZE FIX: Clear concurrent resolvers to prevent blocking on restart
    if (this.concurrentResolvers) {
      this.concurrentResolvers.clear();
    }

    // Windows cleanup (not needed anymore since we removed adapter.start())
    // Keeping check for backwards compatibility but it should always be null now
    if (this.windowsStopFn && typeof this.windowsStopFn === 'function') {
      console.log('[URL] Stopping Windows URL capture (legacy)...');
      this.windowsStopFn();
      this.windowsStopFn = null;
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Clear window states
    this.windowStates.clear();

    if (this.config.debugLogging) {
      console.log('[URL] UrlCaptureManager stopped');
    }
  }

  async captureCurrentUrl() {
// CRITICAL FIX: Check tracking state before capturing
    if (!this.isRunning) {
      return;
    }

    // CRITICAL FIX: Only capture URLs when tracking is actually active and screen is not locked
    const trackingManager = global.trackingManager;
    const isTracking = trackingManager?.isTracking ?? false;
    const hasTimeLog = trackingManager?.currentTimeLogId != null;

    // Skip URL capture when screen is locked (prevents lock-screen URL entries)
    if (global.isScreenLocked) {
      if (process.env.DEBUG_URL) {
        console.log('🔒 [URL] Skipped: screen is locked');
      }
      return;
    }

    if (!isTracking || !hasTimeLog) {
      if (process.platform === 'darwin' && process.env.DEBUG_URL) {
        console.log('🔧 [MACOS-URL] Skipped: tracking inactive', { isTracking, hasTimeLog });
      }
      if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
        console.log('[WIN.URL.POLL] skipped reason=tracking_inactive', { isTracking, hasTimeLog });
      }
      return;
    }

    // Platform-specific logging
    if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
      console.log('[WIN.URL.POLL] start platform=win32 adapter=' + (this.adapter?.constructor?.name || 'none'));
    }
    if (process.platform === 'darwin' && process.env.DEBUG_URL) {
      console.log('🔧 [MACOS-URL] captureCurrentUrl called, adapter:', this.adapter?.constructor?.name);
    }

    if (!this.adapter) {
      if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
        console.log('[WIN.URL.POLL] skipped reason=no_adapter', { adapter: !!this.adapter });
      }
      if (process.platform === 'darwin' && process.env.DEBUG_URL) {
        console.log('🔧 [MACOS-URL] Skipped: adapter=' + !!this.adapter);
      }
      return;
    }

    // CRITICAL: Windows session gate with comprehensive userId fallbacks
    if (process.platform === 'win32') {
      // FIXED: Check for userId in ALL possible locations for maximum compatibility
      const session = global.sessionManager?.getCurrentSession() || global.currentSession;
      const userId = 
        session?.user?.id || 
        session?.user_id || 
        global.currentUserId || 
        this.config?.user_id ||
        global.config?.user_id ||
        global.configManager?.config?.user_id ||
        global.trackingManager?.config?.user_id ||
        global.enhancedAppDetector?.config?.user_id;
      const hasSession = !!userId;

      if (process.env.LOG_URL_VERBOSE === 'true') {
        console.log('[WIN.AUTH.GATE]', {
          session: hasSession ? 'present' : 'missing',
          userId: userId || 'null',
          skipped: !hasSession,
          sources: {
            sessionUserId: session?.user?.id,
            sessionUserIdFlat: session?.user_id,
            globalUserId: global.currentUserId,
            configUserId: this.config?.user_id,
            globalConfigUserId: global.config?.user_id,
            configManagerUserId: global.configManager?.config?.user_id,
            trackingManagerUserId: global.trackingManager?.config?.user_id
          }
        });
      }

      if (!hasSession) {
        // Skip capture but don't log as error - session might not be ready yet
        // Log only on first skip to help debug
        if (!this._urlSessionSkipLogged) {
          console.log('⚠️ [URL] Windows URL capture skipped - no userId found. Will retry when session is ready.');
          this._urlSessionSkipLogged = true;
        }
        return;
      } else {
        // Reset the skip log flag when session is found
        this._urlSessionSkipLogged = false;
      }
    }

    // Check CPU budget before starting work
    if (this.shouldSkipForCpuBudget()) {
      return;
    }

    // Check resolver concurrency limit (max 1 per platform)
    const resolverKey = this.adapter.constructor.name;
    if (this.concurrentResolvers.has(resolverKey)) {
      this.emitGatedDiag('concurrent_resolver_skip', { adapter: resolverKey });
      return;
    }

    const startTime = Date.now();
    let hasTimeout = false;
    let result = null;

    // Define timeoutMs at function scope so it's available in catch block
    // PERF FIX: Reduced Windows timeout from 15s to 5s now that active-win (~10ms)
    // is the primary method instead of PowerShell (~4-5s). UIA is disabled by default.
    // If active-win + title parsing can't resolve in 5s, something is very wrong.
    const timeoutMs = process.env.URL_RESOLVER_TIMEOUT_MS ?
      parseInt(process.env.URL_RESOLVER_TIMEOUT_MS) :
      (process.platform === 'win32' ? 5000 :
        process.platform === 'linux' ? 2000 :
          2000); // macOS: Chrome AppleScript is ~800ms; 500ms used to abort every poll

    // Perf: start timer
    let perfTimer = null;
    try {
      if (global.performanceMonitor) {
        perfTimer = global.performanceMonitor.trackUrlPoll();
      }
    } catch { }

    try {
      this.concurrentResolvers.add(resolverKey);

      if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
        console.log('[WIN.URL.ADAPTER.CALL] Calling adapter.getCurrentUrl()...');
      }
      if (process.platform === 'darwin' && process.env.DEBUG_URL) {
        console.log('🔧 [MACOS-URL] Calling adapter.getCurrentUrl()...');
      }

      const capturePromise = this.adapter.getCurrentUrl();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          hasTimeout = true;
          reject(new Error('Resolver timeout'));
        }, timeoutMs); // OS-aware watchdog
      });

      result = await Promise.race([capturePromise, timeoutPromise]);
// Platform-specific adapter result logging
      if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
        if (result && result.url) {
          console.log('[WIN.URL.ADAPTER.RESULT]', {
            url: result.url,
            title: result.title,
            browser: result.browser || result.source,
            source: result.source
          });
        } else {
          console.log('[WIN.URL.ADAPTER.RESULT] undefined - no URL found');
        }
      }
      // "No browser open" is the steady state for most of a working day, and it
      // was printing several lines every poll — URL logging was 18% of all log
      // volume, almost entirely this. Log a result whenever there is one; log the
      // empty case only on the transition into it.
      if (result && result.url) {
        // Back on a browser — the visit continues, so cancel any pending close.
        this._loggedEmptyUrl = false;
        this._urlAwaySince = null;
        if (process.platform === 'darwin' && process.env.DEBUG_URL) {
          console.log('🔧 [MACOS-URL] Result:', {
            url: result.url?.substring(0, 60),
            browser: result.browser,
            title: result.title?.substring(0, 40)
          });
        }
      } else {
        // No browser in front. A url_logs row otherwise stays open until a
        // DIFFERENT url arrives, so leaving the browser left the last visit
        // accruing until the next browsing session — one row reached 33.9 hours.
        //
        // Closing on the first empty poll would bound that, but it also splits a
        // visit every time someone alt-tabs for a few seconds. So: wait out a
        // grace period, then close and BACKDATE the end to when the browser
        // actually lost focus. Brief switches stay one visit; genuine departures
        // end where they really ended.
        const now = Date.now();
        if (!this._urlAwaySince) this._urlAwaySince = now;

        if (!this._loggedEmptyUrl) {
          this._loggedEmptyUrl = true;
          console.log('[URL] No browser URL — quiet until one appears');
        }

        const awayMs = now - this._urlAwaySince;
        if (awayMs >= URL_VISIT_GRACE_MS && !this._urlVisitClosed) {
          this._urlVisitClosed = true;
          try {
            const { closeOpenUrlLogs, isBackendTimeLogsEnabled, isLikelyOffline } =
              require('../utils/backend-time-logs');
            const userId = global.currentUserId || global.config?.user_id;
            if (userId && isBackendTimeLogsEnabled(global.config) && !isLikelyOffline()) {
              await closeOpenUrlLogs(
                { user_id: userId, ended_at: new Date(this._urlAwaySince).toISOString() },
                global.config,
              );
              console.log(
                `[URL] Closed open visit at ${new Date(this._urlAwaySince).toISOString()} (browser away ${Math.round(awayMs / 1000)}s)`,
              );
            }
          } catch (closeErr) {
            console.warn('⚠️ [URL] Could not close open visit:', closeErr?.message || closeErr);
          }
        }
      }
      if (result && result.url) this._urlVisitClosed = false;
      this.lastResult = result; // Store for adaptive polling

      // Track video-meeting presence from the live (unfiltered) poll result so the
      // screenshot activity floor still applies when the meeting is backgrounded.
      // Meeting URLs are dropped from URL *logging* downstream, but must still count here.
      if (result && (result.url || result.title)) {
        try {
          noteMeetingContext({
            appName: result.browser || result.source || null,
            windowTitle: result.title || null,
            url: result.url || null,
          });
        } catch (_) {}
      }

      if (result && result.url) {
        if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
          console.log('[WIN.URL.SAVE.REQUEST]', {
            url: result.url,
            ts: result.ts || result.timestamp || Date.now(),
            app: result.app || result.browser
          });
        }

        // Check per-tick budget before processing
        const tickStartTime = Date.now();
        if (tickStartTime - startTime < this.config.workerYieldMs) {
          this.processUrlEvent(result);
        } else {
          // Defer to next tick
          setImmediate(() => this.processUrlEvent(result));
        }
      } else {
      }

      // Clear any backoff on success
      if (result && this.resolverBackoff.has('primary')) {
        this.resolverBackoff.delete('primary');
      }

    } catch (error) {
      const elapsed = Date.now() - startTime;
// Set backoff for failing resolvers
      if (hasTimeout || elapsed > timeoutMs) {
        const backoffUntil = Date.now() + (hasTimeout ? 5000 : 2000);
        this.resolverBackoff.set('primary', backoffUntil);
        this.emitGatedDiag('resolver_timeout', {
          adapter: this.adapter.constructor.name,
          elapsed,
          hasTimeout
        });
      }

      // Rate-limited error logging
      this.emitGatedDiag('capture_error', {
        message: error.message,
        adapter: this.adapter?.constructor?.name || 'unknown'
      });
    } finally {
      this.concurrentResolvers.delete(resolverKey);

      // Record CPU budget measurement
      const totalElapsed = Date.now() - startTime;
      this.recordCpuMeasurement(totalElapsed);
      // Perf: end timer
      try {
        if (global.performanceMonitor && perfTimer) {
          global.performanceMonitor.endTimer(perfTimer);
        }
      } catch { }
    }

    // Yield to event loop if exceeded budget
    const totalElapsed = Date.now() - startTime;
    if (this.config.workerYieldMs > 0 && totalElapsed > this.config.workerYieldMs) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  // CPU Budget Monitoring
  shouldSkipForCpuBudget() {
    const now = Date.now();

    // Clean old measurements
    this.cpuBudget.measurements = this.cpuBudget.measurements.filter(
      m => now - m.timestamp < this.cpuBudget.windowMs
    );

    // Calculate total CPU time in window
    const totalCpu = this.cpuBudget.measurements.reduce((sum, m) => sum + m.duration, 0);

    if (totalCpu > this.cpuBudget.maxMs) {
      this.cpuBudget.consecutiveOverBudget++;
      if (!this.cpuBudget.backoffActive) {
        this.cpuBudget.backoffActive = true;
        this.cpuBudget.originalPollDelay = this.pollDelay;
      }

      // PERF FIX: More aggressive backoff tiers to prevent system hangs
      // Tier 1: 2x-4x over budget → gentle backoff (cap 10s)
      // Tier 2: 4x-8x over budget → moderate backoff (cap 20s)
      // Tier 3: 8x+ over budget → aggressive backoff (cap 30s)
      const overBudgetRatio = totalCpu / this.cpuBudget.maxMs;
      let maxBackoffMs;
      if (overBudgetRatio > 8) {
        maxBackoffMs = 30000; // Severely over budget — back way off
      } else if (overBudgetRatio > 4) {
        maxBackoffMs = 20000; // Significantly over budget
      } else {
        maxBackoffMs = 10000; // Mildly over budget
      }

      const backoffMultiplier = Math.min(this.cpuBudget.consecutiveOverBudget, 5); // max 2^5 = 32x
      this.pollDelay = Math.min(
        this.cpuBudget.originalPollDelay * Math.pow(2, backoffMultiplier),
        maxBackoffMs
      );
      this.emitGatedDiag('cpu_budget_backoff', {
        totalCpu,
        maxCpu: this.cpuBudget.maxMs,
        overBudgetRatio: Number(overBudgetRatio.toFixed(1)),
        newPollDelay: this.pollDelay
      });
      return true; // ACTUALLY SKIP this capture tick when over budget
    } else if (this.cpuBudget.backoffActive && totalCpu < this.cpuBudget.maxMs * 0.3) {
      // PERF FIX: Recover only when CPU drops to 30% of limit (was 50%)
      // This prevents the rapid backoff→recover→backoff oscillation pattern
      // that was causing intermittent hangs
      this.cpuBudget.backoffActive = false;
      this.cpuBudget.consecutiveOverBudget = 0;
      this.pollDelay = this.cpuBudget.originalPollDelay;
      this.emitGatedDiag('cpu_budget_recover', {
        totalCpu,
        restoredPollDelay: this.pollDelay
      });
    }

    return false;
  }

  recordCpuMeasurement(duration) {
    this.cpuBudget.measurements.push({
      timestamp: Date.now(),
      duration: duration
    });
  }

  // Rate-limited diagnostic emission with global budget
  emitGatedDiag(type, data) {
    const now = Date.now();

    // Reset global counter every minute
    if (now - this.globalDiagWindow >= 60000) {
      this.globalDiagWindow = now;
      this.globalDiagCount = 0;
    }

    // Check global budget first
    if (this.globalDiagCount >= this.globalDiagLimit) {
      // Emit suppression notice once per minute
      if (this.globalDiagCount === this.globalDiagLimit) {
        this.globalDiagCount++;
        if (this.config.debugLogging) {
          console.log('[URL] DIAG_SUPPRESSED: global budget exceeded');
        }
        this.emit('diagnostic', {
          type: 'diag_suppressed',
          data: { globalLimit: this.globalDiagLimit },
          timestamp: now
        });
      }
      return;
    }

    // Check per-type rate limit
    const lastEmit = this.diagLastEmit.get(type) || 0;
    const minInterval = 60000 / this.config.diagRateLimitPerMin; // Convert to ms

    if (now - lastEmit >= minInterval) {
      this.diagLastEmit.set(type, now);
      this.globalDiagCount++;

      if (this.config.debugLogging) {
        console.log(`[URL] DIAG:${type}`, data);
      }

      // Emit structured diagnostic event
      this.emit('diagnostic', { type, data, timestamp: now });
    }
  }

  processUrlEvent(event) {
const now = Date.now();
    const windowId = event.windowId || 'default';

    // Check if URL is too long
    if (event.url && event.url.length > this.config.maxUrlLength) {
      this.oversizeDrops++;
      if (this.config.debugLogging) {
        console.log('[URL] OVERSIZE_DROP:', event.url.length);
      }
      return;
    }

    // Check if URL is internal
    if (this.config.skipInternalUrls && this.isInternalUrl(event.url)) {
this.internalDrops++;
      if (this.config.debugLogging) {
        console.log('[URL] INTERNAL_FILTER:', event.url);
      }
      return;
    }

    // Check incognito/private mode
    if (event.privacyFlags?.incognito && this.config.privacy.blockIncognito !== false) {
      if (this.config.debugLogging) {
        console.log('[URL] INCOGNITO_BLOCK:', event.url);
      }
      this.internalDrops++;
      return;
    }

    // 🔧 FIX: Filter out non-browser web apps (chat, email, etc.) accessed via browser
    if (event.title) {
      const nonBrowserWebAppPatterns = [
        /^cliq\b/i, /^slack\b/i, /^discord\b/i, /^whatsapp\b/i,
        /^telegram\b/i, /^signal\b/i, /^skype\b/i, /^messenger\b/i,
        /^mattermost\b/i, /^rocket\.chat\b/i, /^hangouts\b/i,
        /\bmicrosoft teams\b/i, /\bgoogle chat\b/i, /\bgoogle meet\b/i,
        /\bzoom meeting\b/i,
        /\bzoho mail\b/i, /\byahoo mail\b/i, /\bprotonmail\b/i,
        /\boutlook\b.*\b(inbox|mail|calendar)\b/i,
        /\binbox\b.*\bzoho\b/i, /\binbox\b.*\bgmail\b/i,
      ];
      const titleForFilter = event.title.trim();
      const isWebApp = nonBrowserWebAppPatterns.some(p => p.test(titleForFilter));
      if (isWebApp) {
        // PERF FIX: Only log the first block per title to reduce log spam.
        // Apps like Cliq trigger this on every poll cycle (every 2.5s)
        if (this._lastBlockedWebApp !== titleForFilter) {
          this._lastBlockedWebApp = titleForFilter;
          console.log(`[URL] WEB_APP_FILTER: Blocked: "${event.title}"`);
        }
        this.internalDrops++;
        return;
      }
    }

    // Apply privacy settings BEFORE deduplication
    let processedUrl = event.url;
    let siteUrl = event.site_url || event.url;

    // Force domain-only for incognito if policy allows capture
    const forceDomainOnly = this.config.privacy.domainOnly ||
      (event.privacyFlags?.incognito && this.config.privacy.incognitoDomainOnly);

    // Apply redaction and PII filtering (optimized single parse)
    let parseTimer = null;
    try { if (global.performanceMonitor) { parseTimer = global.performanceMonitor.trackUrlParse(); } } catch { }
    if (this.config.privacy.redactQueryHash || this.config.privacy.redactPII !== false) {
      const urlParsed = this.parseUrlOnce(processedUrl);

      if (urlParsed.obj) {
        let urlChanged = false;

        // Filter PII params even if redactQueryHash is false
        if (urlParsed.hasQuery && this.config.privacy.redactPII !== false) {
          const piiParams = ['email', 'token', 'auth', 'code', 'key', 'password', 'pwd', 'session', 'api_key', 'apikey', 'access_token'];
          const params = new URLSearchParams(urlParsed.obj.search);

          for (const [key, value] of params) {
            if (piiParams.some(pii => key.toLowerCase().includes(pii))) {
              params.set(key, '[REDACTED]');
              urlChanged = true;
            }
          }

          if (urlChanged) {
            urlParsed.obj.search = params.toString();
          }
        }

        // Full redaction if enabled
        if (this.config.privacy.redactQueryHash) {
          if (urlParsed.hasQuery || urlParsed.hasHash) {
            urlParsed.obj.search = '';
            urlParsed.obj.hash = '';
            urlChanged = true;
          }
        }

        if (urlChanged) {
          processedUrl = urlParsed.obj.toString();
        }

        // Apply same logic to siteUrl (if different)
        if (siteUrl && siteUrl !== processedUrl) {
          const siteUrlParsed = this.parseUrlOnce(siteUrl);
          if (siteUrlParsed.obj) {
            let siteUrlChanged = false;

            if (siteUrlParsed.hasQuery && this.config.privacy.redactPII !== false) {
              const params = new URLSearchParams(siteUrlParsed.obj.search);
              const piiParams = ['email', 'token', 'auth', 'code', 'key', 'password', 'pwd', 'session', 'api_key', 'apikey', 'access_token'];
              for (const [key, value] of params) {
                if (piiParams.some(pii => key.toLowerCase().includes(pii))) {
                  params.set(key, '[REDACTED]');
                  siteUrlChanged = true;
                }
              }
              if (siteUrlChanged) {
                siteUrlParsed.obj.search = params.toString();
              }
            }

            if (this.config.privacy.redactQueryHash && (siteUrlParsed.hasQuery || siteUrlParsed.hasHash)) {
              siteUrlParsed.obj.search = '';
              siteUrlParsed.obj.hash = '';
              siteUrlChanged = true;
            }

            if (siteUrlChanged) {
              siteUrl = siteUrlParsed.obj.toString();
            }
          }
        }
      }
    }
    try { if (global.performanceMonitor && parseTimer) { global.performanceMonitor.endTimer(parseTimer); } } catch { }

    if (forceDomainOnly) {
      processedUrl = 'https://' + this.extractDomain(event.url);
      siteUrl = null;
    }

    // Get or create window state
    let state = this.windowStates.get(windowId);
    if (!state) {
      state = {
        lastUrl: null,
        lastUrlTime: 0, // FIXED: Track when last URL was seen
        lastEmitTime: 0,
        sliceStartTime: 0,
        pendingEvent: null
      };
      this.windowStates.set(windowId, state);
    }

    // Session model: same URL stays one visit — never re-emit until the URL changes
    if (state.lastUrl === processedUrl) {
      state.lastUrlTime = now;
      this.suppressedCount++;
      return;
    }

    // Update last URL tracking
    state.lastUrl = processedUrl;
    state.lastUrlTime = now;

    // Clear existing debounce timer
    if (this.debounceTimers.has(windowId)) {
      clearTimeout(this.debounceTimers.get(windowId));
      this.debounceTimers.delete(windowId);
    }

    // Create normalized event
    const normalizedEvent = {
      url: processedUrl,
      site_url: siteUrl,
      title: event.title || '',
      domain: this.extractDomain(event.url),
      browser: event.browser || event.source || 'unknown',
      windowId: windowId,
      source: event.source || 'unknown',
      confidence: event.confidence || 'low',
      privacy: this.config.privacy,
      privacyFlags: event.privacyFlags,
      ts: now
    };

    // Compact payload - remove undefined/null values
    const compactEvent = this.compactPayload(normalizedEvent);
    // Apply debounce
    const debounceTimer = setTimeout(() => {
      this.debounceTimers.delete(windowId);
      this.emitUrlEvent(compactEvent, state);
    }, this.config.debounceMs);

    this.debounceTimers.set(windowId, debounceTimer);
    state.pendingEvent = compactEvent;
  }

  emitUrlEvent(event, state) {
    const now = Date.now();

    // Check per-tick limit
    if (this.eventsThisTick >= this.config.maxPerTick) {
      if (this.config.debugLogging) {
        console.log('[URL] PER_TICK_SUPPRESS:', event.url);
      }
      this.suppressedCount++;

      // Schedule for next tick
      if (!this.nextTickTimer) {
        this.nextTickTimer = setImmediate(() => {
          this.eventsThisTick = 0;
          this.nextTickTimer = null;
          this.emitUrlEvent(event, state);
        });
      }
      return;
    }

    // TEMPORARILY DISABLED: Check min slice duration - FIXED: Allow all URLs through for testing
    if (false && state.lastEmitTime > 0) { // DISABLED: Allow all URLs through
      const timeSinceLastEmit = now - state.lastEmitTime;
      const minSliceMs = Math.min(this.config.minSliceSec * 1000, 1000); // Cap at 1 second
      if (timeSinceLastEmit < minSliceMs) {
        this.emitGatedDiag('min_slice_suppress', {
          url: event.url,
          timeSinceLastEmit,
          minRequired: minSliceMs
        });
        this.suppressedCount++;
        return;
      }
    }

    // Check rate limit
    if (state.lastEmitTime > 0) {
      const timeSinceLastEmit = now - state.lastEmitTime;
      if (timeSinceLastEmit < (1000 / this.config.maxEventsPerSec)) {
        this.emitGatedDiag('rate_limit_suppress', { url: event.url });
        this.suppressedCount++;
        return;
      }
    }

    // Update state
    const hadPreviousUrl = state.lastUrl !== null;
    state.lastUrl = event.url;
    state.lastEmitTime = now;
    if (state.sliceStartTime === 0) {
      state.sliceStartTime = now;
    }

    // Track source
    this.sourceCounts[event.source] = (this.sourceCounts[event.source] || 0) + 1;

    // Track close reason (when new URL closes previous)
    if (hadPreviousUrl) {
      this.closeReasons.change++;
    }

    // Emit event
    this.eventCount++;
    this.eventsThisTick++;

    if (this.config.debugLogging) {
      console.log('[URL] EMIT:', event.url, event.source);
    }

    // Update status tracking
    this.lastUrlCapture = event.url;
    this.lastUrlCaptureTime = new Date().toISOString();
this.emit('url', event);
  }

  isInternalUrl(url) {
    if (!url) return false;

    // Check for file extensions (file paths masquerading as URLs)
    const fileExtensions = /\.(md|txt|pdf|doc|docx|js|ts|json|xml|yaml|yml|html|css|jsx|tsx|py|java|cpp|c|h|hpp|rs|go|rb|php|swift|kt|sql|sh|bat|ps1|exe|dmg|zip|tar|gz|rar|7z|png|jpg|jpeg|gif|svg|ico|mp4|mp3|wav|avi|mov|csv|xls|xlsx|ppt|pptx)$/i;
    if (fileExtensions.test(url)) {
      if (this.config.debugLogging) {
        console.log('[URL] BLOCKED: File path detected:', url);
      }
      return true;
    }

    const urlLower = url.toLowerCase();

    // Protocol patterns - must be at start of URL
    // CRITICAL FIX: Use startsWith() instead of includes() to prevent false positives
    // (e.g., "blob:" was matching "bitbucket.org")
    const protocolPatterns = [
      'file://',
      'chrome://',
      'chrome-extension://',
      'about:',
      'edge://',
      'brave://',
      'vivaldi://',
      'moz-extension://',
      'view-source:',
      'data:', // Data URLs
      'blob:'  // Blob URLs
    ];

    for (const pattern of protocolPatterns) {
      if (urlLower.startsWith(pattern)) {
        if (this.config.debugLogging) {
          console.log('[URL] BLOCKED: Internal protocol detected:', pattern);
        }
        return true;
      }
    }

    // Domain/host patterns - check within URL context
    // Use proper URL parsing to avoid false positives
    const hostPatterns = ['localhost', '127.0.0.1', '[::1]'];
    for (const pattern of hostPatterns) {
      // Check if pattern appears as actual host (after protocol or with slashes/ports)
      if (urlLower.includes('://' + pattern) || 
          urlLower.includes('/' + pattern + '/') ||
          urlLower.includes('/' + pattern + ':')) {
        if (this.config.debugLogging) {
          console.log('[URL] BLOCKED: Localhost/internal host detected:', pattern);
        }
        return true;
      }
    }

    return false;
  }

  extractDomain(url) {
    // Check cache first
    if (this.domainCache.has(url)) {
      const cached = this.domainCache.get(url);
      // Move to end for LRU
      this.domainCache.delete(url);
      this.domainCache.set(url, cached);
      this.cacheHitCount++;
      this.checkAdaptiveCacheSize();
      return cached;
    }

    this.cacheMissCount++;

    let domain;
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname.toLowerCase();
    } catch {
      domain = 'unknown';
    }

    // Add to cache with LRU eviction
    if (this.domainCache.size >= this.adaptiveCacheSize) {
      const firstKey = this.domainCache.keys().next().value;
      this.domainCache.delete(firstKey);
    }
    this.domainCache.set(url, domain);
    this.checkAdaptiveCacheSize();

    return domain;
  }

  // Adaptive cache sizing based on hit/miss ratio
  checkAdaptiveCacheSize() {
    const now = Date.now();
    if (now - this.lastCacheAdjust < 120000) { // Check every 2 minutes
      return;
    }

    const total = this.cacheHitCount + this.cacheMissCount;
    if (total < 50) { // Need sufficient data
      return;
    }

    const hitRate = this.cacheHitCount / total;
    let newSize = this.adaptiveCacheSize;

    if (hitRate < 0.2 && this.adaptiveCacheSize > 128) {
      // Hit rate too low, shrink cache
      newSize = 128;
      this.emitGatedDiag('cache_shrink', { hitRate, oldSize: this.adaptiveCacheSize, newSize });
    } else if (hitRate > 0.6 && this.adaptiveCacheSize < 256) {
      // Hit rate high, grow cache
      newSize = 256;
      this.emitGatedDiag('cache_grow', { hitRate, oldSize: this.adaptiveCacheSize, newSize });
    }

    if (newSize !== this.adaptiveCacheSize) {
      this.adaptiveCacheSize = newSize;
      // Trim cache if it's now too large
      while (this.domainCache.size > this.adaptiveCacheSize) {
        const firstKey = this.domainCache.keys().next().value;
        this.domainCache.delete(firstKey);
      }
    }

    // Reset counters for next window
    this.cacheHitCount = 0;
    this.cacheMissCount = 0;
    this.lastCacheAdjust = now;
  }

  // Cold-start cache purge on user/display changes
  purgeColdStartCaches() {
    // Keep domain/URL parse cache, purge UI element caches
    this.uiElementCache.clear();

    // Clear platform-specific caches if available
    if (this.adapter && typeof this.adapter.clearCaches === 'function') {
      this.adapter.clearCaches();
    }

    this.emitGatedDiag('cold_start_purge', {
      preservedDomainCache: this.domainCache.size,
      clearedUIElements: true
    });
  }

  // Optimized URL parsing for privacy processing
  parseUrlOnce(url) {
    const cacheKey = `parse:${url}`;
    if (this.domainCache.has(cacheKey)) {
      const cached = this.domainCache.get(cacheKey);
      this.domainCache.delete(cacheKey);
      this.domainCache.set(cacheKey, cached);
      return cached;
    }

    let result;
    try {
      const urlObj = new URL(url);
      result = {
        obj: urlObj,
        domain: urlObj.hostname.toLowerCase(),
        hasQuery: urlObj.search.length > 0,
        hasHash: urlObj.hash.length > 0
      };
    } catch {
      result = {
        obj: null,
        domain: 'unknown',
        hasQuery: false,
        hasHash: false
      };
    }

    // Cache with LRU eviction
    if (this.domainCache.size >= this.maxCacheSize) {
      const firstKey = this.domainCache.keys().next().value;
      this.domainCache.delete(firstKey);
    }
    this.domainCache.set(cacheKey, result);

    return result;
  }

  // Add a method to get stats
  getStats() {
    return {
      eventCount: this.eventCount,
      suppressedCount: this.suppressedCount,
      oversizeDrops: this.oversizeDrops,
      internalDrops: this.internalDrops,
      sourceCounts: this.sourceCounts,
      closeReasons: this.closeReasons,
      pollDelay: this.pollDelay,
      windowCount: this.windowStates.size
    };
  }

  // Track close-only events (idle/shutdown)
  trackCloseOnly(reason) {
    if (reason && this.closeReasons[reason] !== undefined) {
      this.closeReasons[reason]++;
    }
  }

  // Compact payload by removing undefined/null/empty values
  compactPayload(obj) {
    const compact = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          if (value.length > 0) compact[key] = value;
        } else if (typeof value === 'object') {
          const compactNested = this.compactPayload(value);
          if (Object.keys(compactNested).length > 0) {
            compact[key] = compactNested;
          }
        } else if (value !== '') {
          compact[key] = value;
        }
      }
    }
    return compact;
  }

  // Get health status for System Health panel with SLOs
  getHealthStatus() {
    const stats = this.getStats();
    const now = Date.now();

    const resolverTelemetry = typeof this.adapter?.getResolverTelemetry === 'function'
      ? this.adapter.getResolverTelemetry()
      : null;
    const resolverSummary = resolverTelemetry?.summary || null;
    const resolverDetails = resolverTelemetry?.resolvers || null;

    // Calculate SLO metrics
    const total = stats.eventCount + stats.suppressedCount;
    const suppressRate = total > 0 ? stats.suppressedCount / total : 0;

    // Calculate resolver success ratio
    const totalSources = Object.values(stats.sourceCounts).reduce((sum, count) => sum + count, 0);
    const fallbackCount = stats.sourceCounts['title-parse'] || 0;
    const resolverSuccessRate = totalSources > 0 ? (totalSources - fallbackCount) / totalSources : 0;

    // Calculate CPU usage percentage in current window
    this.cpuBudget.measurements = this.cpuBudget.measurements.filter(
      m => now - m.timestamp < this.cpuBudget.windowMs
    );
    const totalCpu = this.cpuBudget.measurements.reduce((sum, m) => sum + m.duration, 0);
    const cpuUsagePercent = (totalCpu / this.cpuBudget.windowMs) * 100;

    // Calculate cache hit rate
    const cacheTotal = this.cacheHitCount + this.cacheMissCount;
    const cacheHitRate = cacheTotal > 0 ? this.cacheHitCount / cacheTotal : 0;

    // Calculate backoff time share
    const backoffCount = this.resolverBackoff.size;
    const activeBackoffs = Array.from(this.resolverBackoff.values()).filter(time => time > now).length;
    const backoffShare = backoffCount > 0 ? activeBackoffs / backoffCount : 0;

    const health = {
      status: 'healthy',
      badges: [],
      metrics: {
        // Legacy metrics
        captureRate: stats.eventCount > 0 ?
          (stats.eventCount / (stats.eventCount + stats.suppressedCount) * 100).toFixed(1) + '%' : '0%',
        activeWindows: stats.windowCount,
        pollDelay: stats.pollDelay + 'ms',
        incognitoDropped: stats.internalDrops,
        resolvers: resolverDetails,
        resolverSummary,

        // SLO Metrics
        slo: {
          cpuUsagePercent: Number(cpuUsagePercent.toFixed(1)),
          cpuTarget: process.platform === 'darwin' ? '< 2% active, < 0.5% idle' : '< 3% active, < 1% idle',
          cpuStatus: cpuUsagePercent < (this.isRunning ? 2.0 : 0.5) ? 'good' : 'warning',

          resolverSuccessRate: Number((resolverSuccessRate * 100).toFixed(1)),
          resolverTarget: process.platform === 'darwin' ? '> 90%' : '> 70%',
          resolverStatus: resolverSuccessRate > (process.platform === 'darwin' ? 0.9 : 0.7) ? 'good' : 'warning',

          suppressionRate: Number((suppressRate * 100).toFixed(1)),
          suppressionTarget: '< 80%',
          suppressionStatus: suppressRate < 0.8 ? 'good' : 'warning',

          cacheHitRate: Number((cacheHitRate * 100).toFixed(1)),
          cacheTarget: '> 50%',
          cacheStatus: cacheHitRate > 0.5 ? 'good' : 'info',

          backoffShare: Number((backoffShare * 100).toFixed(1)),
          backoffTarget: '< 10%',
          backoffStatus: backoffShare < 0.1 ? 'good' : 'warning'
        }
      }
    };

    // Status determination based on SLOs
    let hasWarnings = false;

    // CPU budget enforcement badge
    if (this.cpuBudget.backoffActive) {
      health.badges.push({
        type: 'warning',
        text: 'CPU Budget Active',
        tooltip: `Polling reduced to ${stats.pollDelay}ms due to high CPU usage`
      });
      hasWarnings = true;
    }

    // Check macOS Accessibility
    if (process.platform === 'darwin' && this.lastResult) {
      if (this.lastResult.confidence === 'low') {
        health.badges.push({
          type: 'warning',
          text: 'macOS Accessibility missing (fallback)',
          tooltip: 'Grant Accessibility permission for better URL detection'
        });
        hasWarnings = true;
      }
    }

    // Check Linux Wayland
    if (process.platform === 'linux' && this.lastResult?.platform === 'wayland') {
      health.badges.push({
        type: 'info',
        text: 'Linux Wayland fallback active',
        tooltip: 'URL detection limited on Wayland, using title parsing'
      });
    }

    // SLO-based badges
    if (health.metrics.slo.cpuStatus === 'warning') {
      health.badges.push({
        type: 'warning',
        text: 'High CPU Usage',
        tooltip: `CPU usage ${health.metrics.slo.cpuUsagePercent}% exceeds target`
      });
      hasWarnings = true;
    }

    if (health.metrics.slo.resolverStatus === 'warning') {
      health.badges.push({
        type: 'warning',
        text: 'Low Resolver Success',
        tooltip: `Resolver success ${health.metrics.slo.resolverSuccessRate}% below target`
      });
      hasWarnings = true;
    }

    if (health.metrics.slo.backoffStatus === 'warning') {
      health.badges.push({
        type: 'warning',
        text: 'Resolver Backoffs',
        tooltip: `${health.metrics.slo.backoffShare}% of resolvers in backoff state`
      });
      hasWarnings = true;
    }

    if (health.metrics.slo.suppressionStatus === 'warning') {
      health.badges.push({
        type: 'warning',
        text: 'High Suppression',
        tooltip: `${health.metrics.slo.suppressionRate}% of events suppressed by timing controls`
      });
      hasWarnings = true;
    }

    // Global diagnostic suppression
    if (this.globalDiagCount >= this.globalDiagLimit * 0.8) {
      health.badges.push({
        type: 'info',
        text: 'Diagnostic Limit',
        tooltip: `Approaching diagnostic rate limit (${this.globalDiagCount}/${this.globalDiagLimit} per minute)`
      });
    }

    // Set overall status
    if (hasWarnings) {
      health.status = 'degraded';
    }

    return health;
  }
}

module.exports = { UrlCaptureManager };
