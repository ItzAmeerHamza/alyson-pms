/**
 * Enhanced Screenshot Manager Module
 * Consolidates all screenshot-related functionality from main.js
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('../core/cleanup-registry');
const debugLogger = require('../utils/debug-logger');
const { debounce } = require('../utils/debounce');
const { createFeatureLogger } = require('../utils/logger');
const { resolveSupabaseClient } = require('../utils/session-recovery');
const { uploadScreenshotBuffer } = require('../utils/screenshot-storage');

const log = createFeatureLogger('SCREEN');

class EnhancedScreenshotManager {
  constructor(config, electronModules) {
    this.config = config;
    this.electronModules = electronModules;
    this.systemPreferences = electronModules?.systemPreferences || null;

    // Screenshot state
    this.screenshotInterval = null;
    this.screenshotTimeout = null;
    this.screenshotBuffer = null;
    this.screenshotsPaused = false;
    this.lastScreenshotBeforeSuspend = null;
    this.nextScreenshotTime = null;
    this.screenshotTimerInterval = null;
    this.mandatoryScreenshotInterval = null;
    this._captureInProgress = false;
    this._lastCaptureSuccessAt = 0;
    this._shuttingDown = false;
    // Backbone interval handle (setInterval for 10-min windows)
    this._windowInterval = null;

    // Tracking state
    this.isTracking = false;
    this.currentSession = null;
    this._trackingStartedAt = 0;
    this._consecutiveCaptureFailures = 0;

    // Constants
    this.SCREENSHOT_INTERVAL = 60; // seconds
    this.MANDATORY_SCREENSHOT_INTERVAL = 15 * 60 * 1000; // 15 minutes
    // Scheduling for 3 screenshots per 10-minute window
    this.windowDurationMs = 10 * 60 * 1000;
    this.windowShots = 3;
    this.windowStartTime = null;
    this.windowTimers = [];
    // Cache last non-zero activity to avoid UI flicker between timer updates
    this.lastNonZeroActivity = { clicks: 0, keys: 0, moves: 0 };
    // Dedupe + stall detection for activity rebroadcasts
    this._lastEmittedActivity = { clicks: -1, keys: -1, moves: -1 };
    this._lastActivityChangeAt = 0;
    this._lastStallLogAt = 0;

    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'enhancedScreenshotManager',
      cleanup: async () => this.cleanup()
    });
  }

  getConfiguredScreenshotIntervalMs() {
    const raw =
      this.config?.screenshot_interval_seconds ??
      this.config?.appSettings?.screenshot_interval_seconds ??
      this.config?.appSettings?.screenshot_interval;
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return 60 * 1000;
    // `screenshot_interval` may be persisted in milliseconds in some paths.
    const seconds = num >= 1000 ? Math.round(num / 1000) : num;
    return Math.max(10, seconds) * 1000;
  }

  resolveActiveUserId() {
    return (
      global.currentUserId ||
      this.currentSession?.user_id ||
      this.currentSession?.userId ||
      global.config?.user_id ||
      global.config?.USER_ID ||
      global.configManager?.config?.user_id ||
      global.configManager?.config?.USER_ID ||
      null
    );
  }

  /**
   * Unified public API for both manual and scheduled captures
   */
  async requestScreenshot(source = 'scheduled') {
    try {
      const requestId = `ss-req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      log.info({ step: 'REQUEST START', ctx: { source } });
      console.log(`[SCREENSHOT-REQUEST][${requestId}] Request start`, {
        source,
        isTracking: this.isTracking,
        hasSession: !!this.currentSession,
        paused: this.screenshotsPaused,
        shuttingDown: this._shuttingDown
      });
      try { global.currentCaptureSource = source; } catch { }
      log.debug({
        step: 'REQUEST STATE CHECK', ctx: {
          isTracking: this.isTracking,
          hasCurrentSession: !!this.currentSession,
          captureInProgress: this._captureInProgress,
          shuttingDown: this._shuttingDown
        }
      });

      // macOS permission pre-check: avoid triggering OS prompt by checking before capture
      if (process.platform === 'darwin' && !this.hasScreenRecordingPermission()) {
        log.warn({ step: 'REQUEST BLOCKED', message: 'macOS screen recording permission not granted - skipping to avoid OS prompt' });
        return { ok: false, skipped: true, reason: 'permission-denied', nextAllowedInMs: 0 };
      }

      // CRITICAL FIX: Early exit if shutting down to prevent race condition
      if (this._shuttingDown) {
        log.warn({ step: 'REQUEST BLOCKED', message: 'Screenshot system is shutting down' });
        return { ok: false, skipped: true, reason: 'shutting-down', nextAllowedInMs: 0 };
      }

      if (!this.isTracking || !this.currentSession) {
        log.warn({ step: 'REQUEST SKIPPED', message: 'Not tracking or no session' });
        return { ok: false, skipped: true, reason: 'not-initialized', nextAllowedInMs: 0 };
      }

      const nowMs = Date.now();
      
      // CRITICAL FIX v1.0.132: Hard minimum gap check BEFORE rate limiter
      // This prevents duplicate screenshots even if rate limiter was reset on restart
      const configuredIntervalMs = this.getConfiguredScreenshotIntervalMs();
      const MIN_GAP_MS = Math.max(30 * 1000, configuredIntervalMs - 5 * 1000);
      const lastScreenshotTime = global.lastScreenshotTime || 0;
      const timeSinceLastScreenshot = nowMs - lastScreenshotTime;
      
      if (lastScreenshotTime > 0 && timeSinceLastScreenshot < MIN_GAP_MS) {
        const waitTime = MIN_GAP_MS - timeSinceLastScreenshot;
        log.warn({ 
          step: 'HARD MIN GAP BLOCK', 
          message: `Screenshot blocked - only ${Math.round(timeSinceLastScreenshot / 1000)}s since last (need ${MIN_GAP_MS / 1000}s)`,
          ctx: { timeSinceLastScreenshot, waitTime, lastScreenshotTime: new Date(lastScreenshotTime).toISOString() }
        });
        console.log(`⏱️ [SCREENSHOT] Blocked - only ${Math.round(timeSinceLastScreenshot / 1000)}s since last screenshot (need 180s minimum)`);
        return { ok: false, skipped: true, reason: 'hard-min-gap', nextAllowedInMs: waitTime };
      }
      
      // For short fixed intervals (e.g. every 60s), don't apply the legacy 3/10m limiter.
      if (this._rateLimiter && configuredIntervalMs >= 3 * 60 * 1000) {
        const check = this._rateLimiter.canTake(nowMs);
        log.debug({ step: 'RATE LIMITER CHECK', ctx: check });
        if (!check.allowed) {
          log.warn({ step: 'RATE LIMIT SKIPPED', message: `Skip ${source}: ${check.reason}, next in ${Math.ceil(check.nextAllowedInMs / 1000)}s`, ctx: check });
          return { ok: false, skipped: true, reason: check.reason, nextAllowedInMs: check.nextAllowedInMs };
        }
      }

      if (this._captureInProgress) {
        log.warn({ step: 'SCREENSHOT SKIPPED', message: 'Capture: busy' });
        return { ok: false, skipped: true, reason: 'busy', nextAllowedInMs: 2000 };
      }

      log.info({ step: 'CALLING CAPTURE SCREENSHOT' });
      const ok = await this.captureScreenshot(false);
      console.log(`[SCREENSHOT-REQUEST][${requestId}] Request result`, { ok });
      log.debug({ step: 'CAPTURE SCREENSHOT RESULT', ctx: ok });

      if (ok) {
        log.info({ step: 'SCREENSHOT SUCCESSFUL' });
        return { ok: true, skipped: false, takenAt: Date.now(), source };
      }
      // captureScreenshot handles limiter recording; if false, it was blocked or failed
      log.warn({ step: 'SCREENSHOT FAILED OR BLOCKED' });
      return { ok: false, skipped: true, reason: 'blocked-or-busy', nextAllowedInMs: 0 };
    } catch (e) {
      log.error({ step: 'REQUEST SCREENSHOT ERROR', message: e.message, ctx: { stack: e.stack } });
      return { ok: false, skipped: false, error: e.message || 'unknown' };
    }
  }

  /**
   * Initialize with dependencies
   */
  initialize(dependencies) {
    // Prefer injected wrappers; fallback to global or consolidated wrappers
    this.wrappers = dependencies.wrappers || global.wrappers;
    if (!this.wrappers) {
      // No fallback needed - wrappers will be initialized by main.js or tracking manager
      log.info({ step: 'NO WRAPPERS PROVIDED, will use global when available' });
    }
    this.supabaseService = dependencies.supabaseService;
    this.mainWindow = dependencies.mainWindow;
    if (dependencies.systemPreferences) {
      this.systemPreferences = dependencies.systemPreferences;
    }
    // Start lightweight diagnostics heartbeat for visibility and self-heal
    this.startDiagnosticsHeartbeat();

    // Initialize limiter with policy: 3 per 10 minutes, min 180s gap.
    // Skip limiter for short fixed intervals to honor user screenshot settings.
    try {
      if (this.getConfiguredScreenshotIntervalMs() >= 3 * 60 * 1000) {
        const ScreenshotRateLimiter = require('../utils/screenshot-rate-limiter');
        this._rateLimiter = new ScreenshotRateLimiter({
          maxInWindow: 3,
          windowMs: 10 * 60 * 1000,
          minGapMs: 3 * 60 * 1000
        });
      } else {
        this._rateLimiter = null;
      }
    } catch (e) {
      log.warn({ step: 'RATE LIMITER INIT FAILED', message: e.message });
    }
  }

  /**
   * Start screenshot capture system.
   * Uses a setInterval backbone that fires every 10 minutes to schedule each window's shots.
   * This is inherently self-healing: even if a callback throws, the next interval tick fires.
   */
  startScreenshotCapture() {
    if (this.isTracking && this.currentSession) {
      this._shuttingDown = false;
      this.screenshotsPaused = false;
      console.log('✅ [SCREENSHOT] Shutdown/pause flags cleared - system ready');
    } else {
      console.log('⚠️ [SCREENSHOT] startScreenshotCapture called but not tracking - keeping flags');
    }

    this.startDiagnosticsHeartbeat();

    log.debug({ step: 'START SCREENSHOT CAPTURE' });
    log.debug({
      step: 'CURRENT STATE', ctx: {
        isTracking: this.isTracking,
        hasSession: !!this.currentSession,
        sessionId: this.currentSession?.id || 'none'
      }
    });

    // Idempotency: if the backbone interval is already running, don't duplicate it
    if (this._windowInterval) {
      log.warn({ step: 'WINDOW BACKBONE ALREADY ACTIVE', message: 'Skipping re-arm' });
      return;
    }

    // Clear any stale shot timers from a previous session
    this.clearWindowScheduling();

    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
    }

    // Only arm scheduler when actively tracking with a valid session
    if (!this.isTracking || !this.currentSession) {
      // Loud once-per-session notification if disabled via settings
      try {
        const enabled = this.config?.screenshots_enabled ?? this.config?.screenshotsEnabled ?? true;
        if (enabled === false) {
          log.warn({ step: 'SCREENSHOTS DISABLED BY CONFIG', message: 'Screenshots will not be scheduled' });
        }
      } catch { }
      log.warn({ step: 'NOT TRACKING YET', message: 'Deferring screenshot scheduling' });
      log.debug({
        step: 'STATE CHECK FAILED', ctx: {
          isTracking: this.isTracking,
          hasSession: !!this.currentSession
        }
      });
      return;
    }

    // On macOS, require Screen Recording permission before arming timers
    try {
      if (process.platform === 'darwin') {
        console.log('🔧 [MACOS-SCREENSHOT] Checking Screen Recording permission before starting timer...');
        const hasPerm = this.hasScreenRecordingPermission();
        console.log('🔧 [MACOS-SCREENSHOT] Permission check result:', hasPerm);
        log.debug({ step: 'MACOS SCREEN RECORDING PERMISSION', ctx: { hasPerm } });
        if (!hasPerm) {
          console.log('⚠️ [MACOS-SCREENSHOT] Permission check returned denied, but continuing scheduler start (runtime capture will verify).');
          log.warn({ step: 'SCREEN RECORDING PERMISSION CHECK UNRELIABLE', message: 'Screen permission probe returned denied; continuing scheduler and validating at capture time.' });
          try { this.mainWindow?.webContents.send('permissions-updated', { granted: false, type: 'screen' }); } catch { }
        }
        console.log('✅ [MACOS-SCREENSHOT] Permission granted! Screenshot timer will start...');
      }
    } catch (e) {
      console.log('⚠️ [MACOS-SCREENSHOT] Error during permission check:', e.message);
      log.warn({ step: 'PERMISSION CHECK FAILED', message: e.message });
    }

    const configuredIntervalMs = this.getConfiguredScreenshotIntervalMs();
    if (configuredIntervalMs <= 2 * 60 * 1000) {
      console.log(`🚀 [SCREENSHOT] Starting fixed-interval mode (${Math.round(configuredIntervalMs / 1000)}s)...`);
      // Use direct scheduler for short intervals (e.g. 60s) to honor settings.
      this.scheduleDirectScreenshot();
      return;
    }

    console.log('🚀 [SCREENSHOT] Starting setInterval backbone (10-min windows)...');
    log.info({
      step: 'STARTING SETINTERVAL BACKBONE', ctx: {
        session: this.currentSession?.id,
        tracking: this.isTracking,
        windowDurationMs: this.windowDurationMs
      }
    });

    // Permission/availability preflight (non-blocking)
    try {
      setTimeout(async () => {
        try {
          if (!this.wrappers?.captureScreenshot) {
            log.debug({ step: 'PERFLIGHT SKIPPED', message: 'Wrappers not yet available — will capture when timer fires' });
            return;
          }
          const preflightOk = await this.wrappers.captureScreenshot(true);
          log.debug({ step: 'PERFLIGHT RESULT', ctx: { preflightOk } });
          if (!preflightOk) {
            const hint = process.platform === 'darwin'
              ? 'Open System Settings → Privacy & Security → Screen Recording and enable Electron.'
              : 'Screenshot capture may be blocked. Check screen permissions.';
            log.warn({ step: 'PREFLIGHT FAILED', message: hint });
          }
        } catch (e) {
          log.error({ step: 'PERFLIGHT ERROR', message: e.message });
        }
      }, 1000);
    } catch (e) {
      log.warn({ step: 'COULD NOT SCHEDULE PREFLIGHT CHECK', message: e.message });
    }
    // Schedule the first window immediately
    this.scheduleWindowShots();

    // Backbone: fire every 10 minutes to start a new window.
    // setInterval is inherently self-healing — no chain to break.
    this._windowInterval = setInterval(() => {
      try {
        if (this._shuttingDown || !this.isTracking || !this.currentSession) {
          log.debug({ step: 'BACKBONE TICK SKIPPED', ctx: { shuttingDown: this._shuttingDown, tracking: this.isTracking } });
          return;
        }
        console.log('🔄 [SCREENSHOT] 10-minute window complete, scheduling new window...');
        log.info({ step: 'BACKBONE TICK - NEW WINDOW' });
        this.scheduleWindowShots();
      } catch (e) {
        log.error({ step: 'BACKBONE TICK ERROR', message: e.message });
      }
    }, this.windowDurationMs);
  }

  /**
   * Schedule 3 random screenshot shots within a single 10-minute window.
   * Called by the backbone interval on each tick (and once immediately on start).
   */
  scheduleWindowShots() {
    // Clear any lingering shot timers from the previous window
    if (this.windowTimers && this.windowTimers.length) {
      this.windowTimers.forEach(t => { if (t) clearTimeout(t); });
      this.windowTimers = [];
    }

    this.windowStartTime = Date.now();
    const minGapMs = 3 * 60 * 1000;
    const offsets = this.generateRandomOffsetsWithMinGap(this.windowDurationMs, this.windowShots, minGapMs);
    offsets.sort((a, b) => a - b);

    console.log('📅 [SCREENSHOT] Window start:', new Date(this.windowStartTime).toLocaleTimeString());
    console.log('📸 [SCREENSHOT] Scheduling 3 shots at:', offsets.map(ms => `${Math.round(ms / 1000 / 60)}m${Math.round((ms / 1000) % 60)}s`).join(', '));
    log.info({
      step: 'SCHEDULING 3 SHOTS AT OFFSETS', ctx: {
        offsets,
        offsetsFormatted: offsets.map(ms => Math.round(ms / 1000) + 's'),
        windowStart: new Date(this.windowStartTime).toLocaleTimeString()
      }
    });

    // CRITICAL FIX: Set nextScreenshotTime for UI display (first shot in window)
    if (offsets.length > 0) {
      this.nextScreenshotTime = new Date(Date.now() + offsets[0]);
      global.nextScreenshotTime = this.nextScreenshotTime;
      log.debug({ step: 'NEXT SCREENSHOT AT', ctx: { time: this.nextScreenshotTime.toLocaleTimeString() } });

      // Start timer updates for UI
      if (!this.screenshotTimerInterval) {
        this.startScreenshotTimerUpdates();
      }
      this.sendNextScreenshotUpdate();
    }

    // Record last success time for gap enforcement awareness
    const baseLastTs = global.lastScreenshotTime || 0;

    // Schedule three screenshots at those offsets (check min-gap at fire time)
    this.windowTimers = offsets.map((offset, idx) => setTimeout(async () => {
      // Mark this timer as fired so the heartbeat doesn't count stale references
      if (this.windowTimers) this.windowTimers[idx] = null;

      // CRITICAL FIX: Check tracking state, shutdown flag, and pause state before executing
      if (this._shuttingDown || this.screenshotsPaused || !this.isTracking || !this.currentSession || !global.isTracking) {
        log.warn({ step: 'WINDOW SHOT CANCELLED', ctx: { index: idx + 1, shuttingDown: this._shuttingDown, paused: this.screenshotsPaused, tracking: this.isTracking, globalTracking: global.isTracking } });
        console.log(`🛑 [SCREENSHOT] Timer ${idx + 1}/3 cancelled - ${this._shuttingDown ? 'shutting down' : this.screenshotsPaused ? 'paused (screen locked)' : 'tracking stopped'}`);
        return;
      }
      
      console.log(`📸 [SCREENSHOT] Timer ${idx + 1}/3 fired at ${new Date().toLocaleTimeString()}`);
      log.debug({
        step: 'EXECUTING WINDOW SHOT', ctx: {
          index: idx + 1,
          offset: Math.round(offset / 1000),
          scheduledFor: new Date(this.windowStartTime + offset).toLocaleTimeString(),
          actualTime: new Date().toLocaleTimeString()
        }
      });
      if (this.isTracking && this.currentSession) {
        // If last screenshot was taken less than min gap ago, skip early to avoid pointless request
        const nowMs = Date.now();
        const sinceLast = nowMs - (global.lastScreenshotTime || baseLastTs || 0);
        const minGapMs = 3 * 60 * 1000;
        if (sinceLast < minGapMs) {
          log.warn({ step: 'SKIPPING WINDOW SHOT', message: `Within min gap (${Math.round((minGapMs - sinceLast) / 1000)}s remaining)`, ctx: { index: idx + 1 } });
          // Reschedule this missed shot toward the end of the current window to preserve 3-per-window target
          const remainingMs = (this.windowStartTime + this.windowDurationMs) - nowMs;
          const retryDelay = Math.min(Math.max(minGapMs - sinceLast + 5000, 15000), Math.max(0, remainingMs - 5000));
          if (retryDelay > 0) {
            log.debug({ step: 'RE-QUEUING WINDOW SHOT', ctx: { index: idx + 1, retryDelay: Math.round(retryDelay / 1000) } });
            
            // FIX: Update nextScreenshotTime to reflect the retry time so UI shows correct countdown
            const retryTime = new Date(nowMs + retryDelay);
            this.nextScreenshotTime = retryTime;
            global.nextScreenshotTime = retryTime;
            log.debug({ step: 'NEXT SCREENSHOT AT (RETRY)', ctx: { time: retryTime.toLocaleTimeString(), delayMs: retryDelay } });
            this.sendNextScreenshotUpdate();
            
            this.windowTimers.push(setTimeout(async () => {
              // CRITICAL FIX: Check tracking state, shutdown, and pause on retry
              if (this._shuttingDown || this.screenshotsPaused || !this.isTracking || !this.currentSession || !global.isTracking) {
                log.warn({ step: 'RETRY SHOT CANCELLED', ctx: { shuttingDown: this._shuttingDown, paused: this.screenshotsPaused } });
                return;
              }
              
              // final safety check on retry
              const retrySince = Date.now() - (global.lastScreenshotTime || baseLastTs || 0);
              if (retrySince >= minGapMs && this.isTracking && this.currentSession) {
                const rr = await this.requestScreenshot('scheduled-retry');
                log.debug({ step: 'WINDOW RETRY RESULT', ctx: { index: idx + 1, result: rr } });
                this._updateNextScreenshotTimeAfterShot(idx, offsets);
              } else {
                log.warn({ step: 'RETRY SKIP FOR WINDOW SHOT', message: 'Still within gap or tracking off', ctx: { index: idx + 1 } });
              }
            }, retryDelay));
          } else {
            this._updateNextScreenshotTimeAfterShot(idx, offsets);
          }
        } else {
          const result = await this.requestScreenshot('scheduled');
          log.debug({ step: 'WINDOW SHOT RESULT', ctx: { index: idx + 1, result } });
          this._updateNextScreenshotTimeAfterShot(idx, offsets);
        }
      } else {
        log.warn({ step: 'WINDOW SHOT CANCELLED', message: 'Tracking stopped', ctx: { index: idx + 1 } });
      }
    }, offset));

    log.info({ step: '3 SHOTS SCHEDULED WITHIN A 10-MINUTE WINDOW', ctx: { duration: this.windowDurationMs / 1000 } });
    log.debug({ step: 'NEXT WINDOW STARTS AT', ctx: { time: new Date(Date.now() + this.windowDurationMs).toLocaleTimeString() } });
  }

  /**
   * Update nextScreenshotTime after a shot fires (or is skipped).
   * Points to the next shot in the current window, or estimates next window.
   */
  _updateNextScreenshotTimeAfterShot(idx, offsets) {
    const minGapMs = 3 * 60 * 1000;
    if (idx < offsets.length - 1) {
      const nextOffset = offsets[idx + 1];
      const nextTime = new Date(this.windowStartTime + nextOffset);
      if (nextTime.getTime() > Date.now()) {
        this.nextScreenshotTime = nextTime;
        global.nextScreenshotTime = nextTime;
        this.sendNextScreenshotUpdate();
        return;
      }
    }
    const nextWindowTime = new Date(this.windowStartTime + this.windowDurationMs + minGapMs);
    this.nextScreenshotTime = nextWindowTime;
    global.nextScreenshotTime = this.nextScreenshotTime;
    this.sendNextScreenshotUpdate();
  }

  /**
   * Stop screenshot capture system
   */
  stopScreenshotCapture() {
    this._shuttingDown = true;
    console.log('🛑 [SCREENSHOT] Shutdown flag set - blocking all captures');
    log.debug({ step: 'SHUTDOWN FLAG SET' });

    // Stop the backbone interval first
    if (this._windowInterval) {
      clearInterval(this._windowInterval);
      this._windowInterval = null;
    }

    if (this.screenshotInterval) {
      clearTimeout(this.screenshotInterval);
      this.screenshotInterval = null;
    }

    if (this.screenshotTimeout) {
      clearTimeout(this.screenshotTimeout);
      this.screenshotTimeout = null;
    }

    this.clearWindowScheduling();
    this.stopDiagnosticsHeartbeat();
  }

  /**
   * Diagnostics heartbeat: logs state and self-heals scheduling if needed
   */
  startDiagnosticsHeartbeat() {
    if (this._diagInterval) {
      clearInterval(this._diagInterval);
    }
    // PERFORMANCE FIX: Reduced from 15s to 60s - heartbeat is only for self-healing diagnostics
    this._diagInterval = setInterval(() => {
      try {
        // Respect global stop state — never re-arm anything during or after a stop
        if (!global.isTracking || global.isStopping || global.isShuttingDown) return;

        // Detect and fix state desyncs where global tracking/session is set
        // but this manager hasn't been updated yet (alternate start paths)
        if (global.isTracking && global.currentSession && (!this.isTracking || !this.currentSession)) {
          log.debug({ step: 'STATE DESYNC DETECTED', message: 'Adopting global tracking/session' });
          try {
            this.updateTrackingState(true, global.currentSession);
          } catch (e) {
            log.warn({ step: 'FAILED TO ADOPT GLOBAL STATE', message: e.message });
          }
        }

        if (this.isTracking && this.currentSession) {
          const timersActive = this.windowTimers ? this.windowTimers.filter(t => t !== null).length : 0;
          const sinceLastScreenshot = global.lastScreenshotTime ? Date.now() - global.lastScreenshotTime : 0;
          log.debug({
            step: 'HEARTBEAT', ctx: {
              timersActive,
              backboneActive: !!this._windowInterval,
              nextScreenshotTime: this.nextScreenshotTime,
              secondsToNext: this.calculateSecondsToNextScreenshot(),
              paused: this.screenshotsPaused,
              sinceLastScreenshotMs: Math.round(sinceLastScreenshot),
              consecutiveFailures: this._consecutiveCaptureFailures
            }
          });
          this.ensureNextScreenshotTimer();
        }
      } catch (e) {
        log.warn({ step: 'HEARTBEAT ERROR', message: e.message });
      }
    }, 30000); // Check every 30s for faster recovery from stuck states
  }

  stopDiagnosticsHeartbeat() {
    if (this._diagInterval) {
      clearInterval(this._diagInterval);
      this._diagInterval = null;
    }
  }

  /**
   * Check macOS Screen Recording permission
   */
  hasScreenRecordingPermission() {
    try {
      if (process.platform !== 'darwin') return true;

      // CRITICAL DEBUG: Log permission check details
      console.log('🔍 [MACOS-PERMISSION] Checking Screen Recording permission...');
      console.log('🔍 [MACOS-PERMISSION] systemPreferences available:', !!this.systemPreferences);
      console.log('🔍 [MACOS-PERMISSION] getMediaAccessStatus available:', typeof this.systemPreferences?.getMediaAccessStatus);

      // Use centralized permission status first (includes robust mapping/fallbacks).
      try {
        const { getScreenStatus } = require('../../system/permissions-check');
        const status = getScreenStatus();
        if (status === 'authorized') {
          console.log('🔍 [MACOS-PERMISSION] Centralized status: authorized');
          return true;
        }
      } catch (_) {}

      if (this.systemPreferences && typeof this.systemPreferences.getMediaAccessStatus === 'function') {
        const status = this.systemPreferences.getMediaAccessStatus('screen');
        console.log('🔍 [MACOS-PERMISSION] Permission status:', status);
        const granted = status === 'granted' || status === 'authorized' || status === 'limited';
        console.log('🔍 [MACOS-PERMISSION] Permission granted?', granted);
        return granted;
      }

      console.log('🔍 [MACOS-PERMISSION] API unavailable, assuming granted');
      return true; // assume true if API unavailable
    } catch (e) {
      console.log('🔍 [MACOS-PERMISSION] Error checking permission:', e.message);
      log.warn({ step: 'ERROR CHECKING SCREEN PERMISSION', message: e.message });
      return true; // do not hard-block if check failed
    }
  }

  clearWindowScheduling() {
    if (this.windowTimers && this.windowTimers.length) {
      this.windowTimers.forEach(t => { if (t) clearTimeout(t); });
      this.windowTimers = [];
    }
  }

  /**
   * Schedule random screenshot using consolidated system
   */
  scheduleRandomScreenshot() {
    if (this.wrappers && this.wrappers.scheduleRandomScreenshot) {
      try {
        // Delegate scheduling to consolidated wrapper
        this.wrappers.scheduleRandomScreenshot();
        // Sync local timer reference from global so UI countdown works
        if (global.nextScreenshotTime instanceof Date) {
          this.nextScreenshotTime = global.nextScreenshotTime;
        } else if (global.nextScreenshotTime) {
          try { this.nextScreenshotTime = new Date(global.nextScreenshotTime); } catch { }
        }
        // If delegate didn't set a valid timer, fall back to direct scheduling
        if (!this.nextScreenshotTime) {
          log.warn({ step: 'WRAPPER DID NOT SET NEXT SCREENSHOT TIME', message: 'Falling back to direct scheduling' });
          this.scheduleDirectScreenshot();
          return;
        }
        // Start periodic timer updates if not already running
        if (!this.screenshotTimerInterval) {
          this.startScreenshotTimerUpdates();
        }
        // Emit an immediate update
        this.sendNextScreenshotUpdate();
        return;
      } catch (e) {
        log.warn({ step: 'SCHEDULE RANDOM SCREENSHOT WRAPPER FAILED', message: e.message });
      }
    } else {
      log.warn({ step: 'WRAPPERS NOT AVAILABLE FOR SCREENSHOT SCHEDULING' });
    }

    // 🚨 FALLBACK: Direct screenshot scheduling when wrappers fail
    log.debug({ step: 'USING FALLBACK DIRECT SCREENSHOT SCHEDULING' });
    this.scheduleDirectScreenshot();
  }

  /**
   * Fallback direct screenshot scheduling (when wrappers aren't available)
   */
  scheduleDirectScreenshot() {
    // CRITICAL FIX: Don't schedule if not tracking
    if (!this.isTracking || !this.currentSession) {
      log.warn({ step: 'NOT SCHEDULING - TRACKING INACTIVE' });
      return;
    }
    
    // If backbone scheduling is active, don't duplicate local timers.
    if (this._windowInterval) {
      log.warn({ step: 'BACKBONE ACTIVE', message: 'Skipping direct scheduling to prevent duplicates' });
      if (!this.screenshotTimerInterval) {
        this.startScreenshotTimerUpdates();
        this.sendNextScreenshotUpdate();
      }
      return;
    }
    
    try {
      if (Array.isArray(this.windowTimers) && this.windowTimers.length > 0) {
        log.warn({ step: 'WINDOW TIMERS ACTIVE', message: 'Skipping direct scheduling to prevent duplicates' });
        // Ensure UI countdown still updates
        if (!this.screenshotTimerInterval) {
          this.startScreenshotTimerUpdates();
          this.sendNextScreenshotUpdate();
        }
        return;
      }
    } catch { }

    // Clear any existing timer
    if (this.screenshotInterval) {
      clearTimeout(this.screenshotInterval);
      this.screenshotInterval = null;
    }

    // Fixed schedule based on configured screenshot interval.
    const interval = this.getConfiguredScreenshotIntervalMs();

    // Set next screenshot time
    this.nextScreenshotTime = new Date(Date.now() + interval);
    global.nextScreenshotTime = this.nextScreenshotTime;

    log.debug({ step: 'NEXT SCREENSHOT IN', ctx: { minutes: Math.round(interval / 1000 / 60), time: this.nextScreenshotTime.toLocaleTimeString() } });

    // Schedule the screenshot
    this.screenshotInterval = setTimeout(async () => {
      log.debug({ step: 'EXECUTING SCHEDULED SCREENSHOT' });
      
      // CRITICAL FIX: Check if tracking is still active, not shutting down, not paused
      if (this._shuttingDown || this.screenshotsPaused || !this.isTracking || !this.currentSession || !global.isTracking) {
        log.warn({ step: 'SCREENSHOT LOOP ABORTED', ctx: { shuttingDown: this._shuttingDown, paused: this.screenshotsPaused, tracking: this.isTracking } });
        return; // Don't reschedule
      }
      
      try {
        const canTake = await this.canTakeScreenshot();
        if (canTake) {
          await this.captureScreenshot(false);
        } else {
          log.warn({ step: 'SCREENSHOT NOT ALLOWED, RESCHEDULING' });
        }
      } catch (error) {
        log.error({ step: 'SCREENSHOT CAPTURE FAILED', message: error });
      }

      // CRITICAL FIX: Only reschedule if tracking is still active
      if (this.isTracking && this.currentSession) {
        this.scheduleDirectScreenshot();
      } else {
        log.warn({ step: 'NOT RESCHEDULING - TRACKING STOPPED' });
      }
    }, interval);

    // Start periodic timer updates if not already running
    if (!this.screenshotTimerInterval) {
      this.startScreenshotTimerUpdates();
    }
    // Emit an immediate update
    this.sendNextScreenshotUpdate();
  }

  /**
   * Capture screenshot
   */
  async captureScreenshot(isHealthCheck = false) {
    // Log entry point for ALL platforms
    console.log('🎯 [SCREENSHOT-ENTRY] captureScreenshot() called, platform:', process.platform, 'isHealthCheck:', isHealthCheck);


    log.debug({ step: 'CAPTURE SCREENSHOT', ctx: { isHealthCheck } });
    log.debug({ step: 'WINDOWS SCREENSHOT CAPTURE STARTING' });

    // CRITICAL FIX: Global debounce to prevent burst screenshots from multiple recovery mechanisms
    // This prevents the issue where 5+ screenshots are captured within milliseconds when system wakes
    const MIN_CAPTURE_INTERVAL_MS = 30000; // 30 seconds minimum between screenshots
    const now = Date.now();
    if (!isHealthCheck && global._lastScreenshotAttempt && (now - global._lastScreenshotAttempt) < MIN_CAPTURE_INTERVAL_MS) {
      const timeSinceLast = now - global._lastScreenshotAttempt;
      log.warn({ step: 'SCREENSHOT DEBOUNCED', message: `Only ${timeSinceLast}ms since last attempt (min: ${MIN_CAPTURE_INTERVAL_MS}ms)` });
      console.log(`🛑 [SCREENSHOT] Debounced - only ${Math.round(timeSinceLast/1000)}s since last attempt (min: 30s)`);
      return false;
    }
    // Update timestamp for debounce tracking (do this early to prevent race conditions)
    if (!isHealthCheck) {
      global._lastScreenshotAttempt = now;
    }

    // CRITICAL FIX: Check shutdown flag first to prevent race condition
    if (this._shuttingDown && !isHealthCheck) {
      log.warn({ step: 'SCREENSHOT BLOCKED - SHUTTING DOWN' });
      console.log('🛑 [SCREENSHOT] Blocked - system is shutting down');
      return false;
    }

    // CRITICAL FIX: Check if screenshots are paused (e.g. screen locked, display sleep)
    if (this.screenshotsPaused && !isHealthCheck) {
      log.warn({ step: 'SCREENSHOT BLOCKED - PAUSED (screen locked or display sleep)' });
      console.log('🛑 [SCREENSHOT] Blocked - screenshots paused (screen locked/display sleep)');
      return false;
    }

    // CRITICAL FIX: Early exit if tracking stopped (unless health check)
    // Check both local and global tracking state for redundancy
    if (!isHealthCheck) {
      if (!this.isTracking || !this.currentSession || !global.isTracking) {
        log.warn({ step: 'SCREENSHOT BLOCKED - TRACKING NOT ACTIVE', ctx: {
          localTracking: this.isTracking,
          globalTracking: global.isTracking,
          hasSession: !!this.currentSession
        }});
        console.log('🛑 [SCREENSHOT] Blocked - tracking not active (local:', this.isTracking, 'global:', global.isTracking, ')');
        return false;
      }
    }

    // CRITICAL: For Windows, use dedicated capture module
    if (process.platform === 'win32') {
      try {
        const { captureScreenshot: winCapture } = require('../../platform/windows/screenshot-capture');
        const result = await winCapture();

        if (result && result.success && result.buffer) {
          log.info({ step: 'CAPTURED VIA WINDOWS', ctx: { method: result.method, size: result.buffer.length } });

          // CRITICAL FIX: Ensure screenshot is saved to database
          let saved = false;

          // Try consolidated wrapper first
          if (this.wrappers && this.wrappers.processScreenshot) {
            try {
              await this.wrappers.processScreenshot(result.buffer);
              saved = true;
              log.info({ step: 'SAVED_VIA_WRAPPER' });
              console.log('✅ [WINDOWS] Screenshot saved via wrapper');
            } catch (e) {
              log.warn({ step: 'WRAPPER_SAVE_FAILED', message: e.message });
            }
          }

          // Try screenshot manager
          if (!saved && global.screenshotManager && global.screenshotManager.saveScreenshot) {
            try {
              const screenshotData = await global.screenshotManager.saveScreenshot(result.buffer);
              if (screenshotData) {
                saved = true;
                log.info({ step: 'SAVED_VIA_SCREENSHOT_MANAGER' });
                console.log('✅ [WINDOWS] Screenshot saved via screenshot manager');
              }
            } catch (e) {
              log.warn({ step: 'SCREENSHOT_MANAGER_SAVE_FAILED', message: e.message });
            }
          }

          // Direct save as last resort
          if (!saved) {
            try {
              const supabase = resolveSupabaseClient();
              const userId = this.resolveActiveUserId();

              // ENHANCED LOGGING: Log upload attempt details
              log.info({
                step: 'ATTEMPTING_DIRECT_UPLOAD',
                ctx: {
                  hasSupabase: !!supabase,
                  hasUserId: !!userId,
                  userId: userId,
                  bufferSize: result.buffer?.length,
                  hasTimeLog: !!global.currentTimeLogId
                }
              });
              console.log(`📤 [SCREENSHOT-UPLOAD] Attempting direct upload - Buffer: ${result.buffer?.length} bytes, User: ${userId}`);

              if (supabase && userId) {
                const capturedAt = new Date().toISOString();

                let activityData = { clicks: 0, keys: 0, moves: 0 };

                try {
                  if (!global.betweenScreenshotsActivity) {
                    global.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
                  }
                  if (global.enhancedActivityManager && !global.enhancedActivityManager.betweenScreenshotsActivity) {
                    global.enhancedActivityManager.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
                  }

                  // Read from preferred source
                  if (global.enhancedActivityManager?.betweenScreenshotsActivity) {
                    const activity = global.enhancedActivityManager.betweenScreenshotsActivity;
                    activityData.clicks = activity.clicks || 0;
                    activityData.keys = activity.keys || 0;
                    activityData.moves = activity.moves || 0;
                  } else if (global.betweenScreenshotsActivity) {
                    activityData.clicks = global.betweenScreenshotsActivity.clicks || 0;
                    activityData.keys = global.betweenScreenshotsActivity.keys || 0;
                    activityData.moves = global.betweenScreenshotsActivity.moves || 0;
                  }

                  // DELTA SAFETY NET: Detect cumulative counters that weren't reset.
                  // Use displayActivityStats (session-cumulative) to compute deltas as a fallback.
                  // Normal per-screenshot values for a 3-min interval shouldn't exceed ~2000 total events.
                  const MAX_REASONABLE_PER_SCREENSHOT = 2000;
                  const rawTotal = activityData.clicks + activityData.keys + activityData.moves;
                  if (rawTotal > MAX_REASONABLE_PER_SCREENSHOT && global.displayActivityStats) {
                    // Counters look cumulative — compute delta from last snapshot
                    if (!global._lastScreenshotCumulativeSnapshot) {
                      global._lastScreenshotCumulativeSnapshot = { clicks: 0, keys: 0, moves: 0 };
                    }
                    const snap = global._lastScreenshotCumulativeSnapshot;
                    const ds = global.displayActivityStats;
                    const deltaClicks = Math.max(0, (ds.clicks || 0) - (snap.clicks || 0));
                    const deltaKeys = Math.max(0, (ds.keys || 0) - (snap.keys || 0));
                    const deltaMoves = Math.max(0, (ds.moves || 0) - (snap.moves || 0));
                    console.log(`⚠️ [SCREENSHOT-ACTIVITY] Cumulative detected (total=${rawTotal}), using delta: C:${deltaClicks} K:${deltaKeys} M:${deltaMoves}`);
                    activityData = { clicks: deltaClicks, keys: deltaKeys, moves: deltaMoves };
                  }

                  // Snapshot cumulative counters for next delta calculation
                  if (global.displayActivityStats) {
                    global._lastScreenshotCumulativeSnapshot = {
                      clicks: global.displayActivityStats.clicks || 0,
                      keys: global.displayActivityStats.keys || 0,
                      moves: global.displayActivityStats.moves || 0,
                    };
                  }

                  // Fallback: if activity is still zero, try delta from displayActivityStats
                  if (activityData.clicks === 0 && activityData.keys === 0 && activityData.moves === 0) {
                    const snap = global._lastScreenshotCumulativeSnapshot;
                    if (snap && (snap.clicks > 0 || snap.keys > 0 || snap.moves > 0)) {
                      console.log(`⚠️ [SCREENSHOT-ACTIVITY] Zero counters but cumulative stats exist — user may have been active`);
                    }
                  }

                  console.log(`📸 [SCREENSHOT-ACTIVITY] C:${activityData.clicks} K:${activityData.keys} M:${activityData.moves}`);
                } catch (err) {
                  console.error(`❌ [SCREENSHOT-ACTIVITY] Failed to get activity data:`, err.message);
                }
// Calculate focus percentage using weighted tiered formula
                const keyboardWeight = 2;
                const clickWeight = 1.5;
                const moveWeight = 0.1;
                const weightedActivity = (activityData.keys * keyboardWeight) + (activityData.clicks * clickWeight) + (activityData.moves * moveWeight);
                
                // Continuous tiered formula - coefficients ensure smooth transitions at boundaries
                let focusPercent = 0;
                if (weightedActivity === 0) {
                  focusPercent = 0;
                } else if (weightedActivity < 5) {
                  focusPercent = Math.min(25, weightedActivity * 5);
                } else if (weightedActivity < 20) {
                  // Coefficient 7/3 ensures continuity: 25 + 15*(7/3) = 60 at w=20
                  focusPercent = Math.min(60, 25 + (weightedActivity - 5) * (7/3));
                } else if (weightedActivity < 50) {
                  // Coefficient 5/6 ensures continuity: 60 + 30*(5/6) = 85 at w=50
                  focusPercent = Math.min(85, 60 + (weightedActivity - 20) * (5/6));
                } else {
                  focusPercent = Math.min(100, 85 + (weightedActivity - 50) * 0.3);
                }
                const activityPercent = focusPercent;


                // Get current app and window info
                let appName = null;
                let windowTitle = null;
try {
                  if (global.platformManager?.detectActiveApplication) {
                    // FIX: Add 5 second timeout to prevent app detection from blocking screenshot upload
                    const APP_DETECT_TIMEOUT = 5000;
                    const timeoutPromise = new Promise((_, reject) => 
                      setTimeout(() => reject(new Error('App detection timeout')), APP_DETECT_TIMEOUT)
                    );
                    const appData = await Promise.race([
                      global.platformManager.detectActiveApplication(),
                      timeoutPromise
                    ]).catch(e => {
                      console.warn(`⚠️ [SCREENSHOT-APP] App detection timed out or failed: ${e.message}`);
                      return null;
                    });
                    if (appData) {
                      appName = appData.appName || appData.name || null;
                      windowTitle = appData.windowTitle || appData.title || null;
                    }
                  }
                } catch (err) {
                  console.error(`⚠️ [SCREENSHOT-APP] Failed to get app data:`, err.message);
                }
const uploadResult = await uploadScreenshotBuffer({
                  supabase,
                  buffer: result.buffer,
                  userId,
                  capturedAt,
                  timeLogId: global.currentTimeLogId || null,
                  clicks: activityData.clicks,
                  keys: activityData.keys,
                  moves: activityData.moves,
                  activityPercent: activityPercent,
                  focusPercent: focusPercent,
                  appName: appName,
                  windowTitle: windowTitle,
                  agentVersion: global.agentVersion || null // Add agent version tracking (v1.0.124+)
                });
if (uploadResult?.id) {
                  saved = true;
                  log.info({ step: 'SAVED_STORAGE', ctx: { id: uploadResult.id } });
                  console.log(`✅ [SCREENSHOT-UPLOAD] SUCCESS! Screenshot uploaded: ${uploadResult.id}`);
                  console.log(`📊 [SCREENSHOT-UPLOAD] Uploaded with activity: C:${activityData.clicks} K:${activityData.keys} M:${activityData.moves} Focus:${focusPercent}%`);
                  if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('screenshot-saved', {
                      row_id: uploadResult.id,
                      captured_at: capturedAt
                    });
                  }
                } else if (uploadResult?.error) {
                  log.error({ step: 'DIRECT_SAVE_ERROR', message: uploadResult.error });
                  console.error(`❌ [SCREENSHOT-UPLOAD] FAILED: ${uploadResult.error}`);
                } else {
                  log.error({ step: 'DIRECT_SAVE_ERROR', message: 'Unknown upload failure', uploadResult });
                  console.error(`❌ [SCREENSHOT-UPLOAD] FAILED: Unknown error`, uploadResult);
                }
              } else {
                log.error({
                  step: 'MISSING_DEPENDENCIES', ctx: {
                    hasSupabase: !!supabase,
                    hasUserId: !!userId,
                    hasTimeLog: !!global.currentTimeLogId
                  }
                });
                console.error(`❌ [SCREENSHOT-UPLOAD] Missing dependencies - Supabase: ${!!supabase}, UserId: ${!!userId}`);
              }
            } catch (e) {
              log.error({ step: 'DIRECT_SAVE_EXCEPTION', message: e.message, stack: e.stack });
              console.error(`❌ [SCREENSHOT-UPLOAD] Exception:`, e.message);
            }
          }

          if (saved) {
            // ALWAYS reset activity counters — regardless of isHealthCheck
            this._forceActivityReset();

            if (!isHealthCheck) {
              try { this.onScreenshotSuccess(activityPercent); } catch (_) {}
            }

            this._lastCaptureSuccessAt = Date.now();
            this._consecutiveCaptureFailures = 0;
            this.activitySinceLastScreenshot = { clicks: 0, keystrokes: 0, mouseMovements: 0 };

            return true;
          } else {
            this._consecutiveCaptureFailures = (this._consecutiveCaptureFailures || 0) + 1;
            global.consecutiveScreenshotFailures = this._consecutiveCaptureFailures;
            log.error({ step: 'SCREENSHOT_NOT_SAVED', message: 'All save methods failed', ctx: { consecutiveFailures: this._consecutiveCaptureFailures } });
            console.error(`❌ [SCREENSHOT] Save failed (${this._consecutiveCaptureFailures} consecutive failures)`);
            if (this._consecutiveCaptureFailures >= 3 && this.isTracking && !this._shuttingDown) {
              log.warn({ step: 'FORCE RESTART AFTER 3 FAILURES', message: 'Restarting screenshot scheduler due to consecutive failures' });
              console.log('🚨 [SCREENSHOT] 3 consecutive failures - force restarting scheduler');
              this.stopScreenshotCapture();
              setTimeout(() => {
                if (this.isTracking && !this._shuttingDown) {
                  this._consecutiveCaptureFailures = 0;
                  this._shuttingDown = false;
                  this.startScreenshotCapture();
                }
              }, 15000);
            }
            return false;
          }
        }
      } catch (winError) {
        this._consecutiveCaptureFailures = (this._consecutiveCaptureFailures || 0) + 1;
        global.consecutiveScreenshotFailures = this._consecutiveCaptureFailures;
        log.error({ step: 'WINDOWS CAPTURE FAILED', message: winError.message, ctx: { consecutiveFailures: this._consecutiveCaptureFailures } });
        console.error(`❌ [SCREENSHOT] Windows capture exception (${this._consecutiveCaptureFailures} consecutive failures):`, winError.message);
      }
      return false;
    }

    // CRITICAL: For macOS, use dedicated capture module
    if (process.platform === 'darwin') {
      try {
        const { captureScreenshot: macCapture } = require('../../platform/macos/screenshot-capture');
        const result = await macCapture();

        if (result && result.success && result.buffer) {
          log.info({ step: 'CAPTURED VIA MACOS', ctx: { method: result.method, size: result.buffer.length } });
          console.log('📸 [MACOS] Screenshot captured successfully');

          // CRITICAL FIX: Ensure screenshot is saved to database
          let saved = false;


          // Try consolidated wrapper first
          if (this.wrappers && this.wrappers.processScreenshot) {
            try {
              await this.wrappers.processScreenshot(result.buffer);
              saved = true;
              log.info({ step: 'SAVED_VIA_WRAPPER' });
              console.log('✅ [MACOS] Screenshot saved via wrapper');
            } catch (e) {
              log.warn({ step: 'WRAPPER_SAVE_FAILED', message: e.message });
            }
          }

          // Try screenshot manager
          if (!saved && global.screenshotManager && global.screenshotManager.saveScreenshot) {
            try {
              const screenshotData = await global.screenshotManager.saveScreenshot(result.buffer);
              if (screenshotData) {
                saved = true;
                log.info({ step: 'SAVED_VIA_SCREENSHOT_MANAGER' });
                console.log('✅ [MACOS] Screenshot saved via screenshot manager');
              }
            } catch (e) {
              log.warn({ step: 'SCREENSHOT_MANAGER_SAVE_FAILED', message: e.message });
            }
          }

          // Direct save as last resort
          if (!saved) {
            try {
              const supabase = resolveSupabaseClient();
              const userId = this.resolveActiveUserId();

              // ENHANCED LOGGING: Log upload attempt details
              log.info({
                step: 'ATTEMPTING_DIRECT_UPLOAD',
                ctx: {
                  hasSupabase: !!supabase,
                  hasUserId: !!userId,
                  userId: userId,
                  bufferSize: result.buffer?.length,
                  hasTimeLog: !!global.currentTimeLogId
                }
              });
              console.log(`📤 [SCREENSHOT-UPLOAD] Attempting direct upload - Buffer: ${result.buffer?.length} bytes, User: ${userId}`);

              if (supabase && userId) {
                const capturedAt = new Date().toISOString();

                let activityData = { clicks: 0, keys: 0, moves: 0 };

                try {
                  if (!global.betweenScreenshotsActivity) {
                    global.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
                  }
                  if (global.enhancedActivityManager && !global.enhancedActivityManager.betweenScreenshotsActivity) {
                    global.enhancedActivityManager.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
                  }

                  if (global.enhancedActivityManager?.betweenScreenshotsActivity) {
                    const activity = global.enhancedActivityManager.betweenScreenshotsActivity;
                    activityData.clicks = activity.clicks || 0;
                    activityData.keys = activity.keys || 0;
                    activityData.moves = activity.moves || 0;
                  } else if (global.betweenScreenshotsActivity) {
                    activityData.clicks = global.betweenScreenshotsActivity.clicks || 0;
                    activityData.keys = global.betweenScreenshotsActivity.keys || 0;
                    activityData.moves = global.betweenScreenshotsActivity.moves || 0;
                  }

                  const MAX_REASONABLE_PER_SCREENSHOT = 2000;
                  const rawTotal = activityData.clicks + activityData.keys + activityData.moves;
                  if (rawTotal > MAX_REASONABLE_PER_SCREENSHOT && global.displayActivityStats) {
                    if (!global._lastScreenshotCumulativeSnapshot) {
                      global._lastScreenshotCumulativeSnapshot = { clicks: 0, keys: 0, moves: 0 };
                    }
                    const snap = global._lastScreenshotCumulativeSnapshot;
                    const ds = global.displayActivityStats;
                    const deltaClicks = Math.max(0, (ds.clicks || 0) - (snap.clicks || 0));
                    const deltaKeys = Math.max(0, (ds.keys || 0) - (snap.keys || 0));
                    const deltaMoves = Math.max(0, (ds.moves || 0) - (snap.moves || 0));
                    console.log(`⚠️ [SCREENSHOT-ACTIVITY] Cumulative detected (total=${rawTotal}), using delta: C:${deltaClicks} K:${deltaKeys} M:${deltaMoves}`);
                    activityData = { clicks: deltaClicks, keys: deltaKeys, moves: deltaMoves };
                  }

                  if (global.displayActivityStats) {
                    global._lastScreenshotCumulativeSnapshot = {
                      clicks: global.displayActivityStats.clicks || 0,
                      keys: global.displayActivityStats.keys || 0,
                      moves: global.displayActivityStats.moves || 0,
                    };
                  }

                  if (activityData.clicks === 0 && activityData.keys === 0 && activityData.moves === 0) {
                    const snap = global._lastScreenshotCumulativeSnapshot;
                    if (snap && (snap.clicks > 0 || snap.keys > 0 || snap.moves > 0)) {
                      console.log(`⚠️ [SCREENSHOT-ACTIVITY] Zero counters but cumulative stats exist`);
                    }
                  }

                  console.log(`📸 [SCREENSHOT-ACTIVITY] C:${activityData.clicks} K:${activityData.keys} M:${activityData.moves}`);
                } catch (err) {
                  console.error(`❌ [SCREENSHOT-ACTIVITY] Failed to get activity data:`, err.message);
                }

                const keyboardWeight = 2;
                const clickWeight = 1.5;
                const moveWeight = 0.1;
                const weightedActivity = (activityData.keys * keyboardWeight) + (activityData.clicks * clickWeight) + (activityData.moves * moveWeight);
                
                let focusPercent = 0;
                if (weightedActivity === 0) {
                  focusPercent = 0;
                } else if (weightedActivity < 5) {
                  focusPercent = Math.min(25, weightedActivity * 5);
                } else if (weightedActivity < 20) {
                  focusPercent = Math.min(60, 25 + (weightedActivity - 5) * (7/3));
                } else if (weightedActivity < 50) {
                  focusPercent = Math.min(85, 60 + (weightedActivity - 20) * (5/6));
                } else {
                  focusPercent = Math.min(100, 85 + (weightedActivity - 50) * 0.3);
                }
                const activityPercent = focusPercent;


                // Get current app and window info
                let appName = null;
                let windowTitle = null;
try {
                  if (global.platformManager?.detectActiveApplication) {
                    // FIX: Add 5 second timeout to prevent app detection from blocking screenshot upload
                    const APP_DETECT_TIMEOUT = 5000;
                    const timeoutPromise = new Promise((_, reject) => 
                      setTimeout(() => reject(new Error('App detection timeout')), APP_DETECT_TIMEOUT)
                    );
                    const appData = await Promise.race([
                      global.platformManager.detectActiveApplication(),
                      timeoutPromise
                    ]).catch(e => {
                      console.warn(`⚠️ [SCREENSHOT-APP] App detection timed out or failed: ${e.message}`);
                      return null;
                    });
                    if (appData) {
                      appName = appData.appName || appData.name || null;
                      windowTitle = appData.windowTitle || appData.title || null;
                    }
                  }
                } catch (err) {
                  console.error(`⚠️ [SCREENSHOT-APP] Failed to get app data:`, err.message);
                }
const uploadResult = await uploadScreenshotBuffer({
                  supabase,
                  buffer: result.buffer,
                  userId,
                  capturedAt,
                  timeLogId: global.currentTimeLogId || null,
                  clicks: activityData.clicks,
                  keys: activityData.keys,
                  moves: activityData.moves,
                  activityPercent: activityPercent,
                  focusPercent: focusPercent,
                  appName: appName,
                  windowTitle: windowTitle,
                  agentVersion: global.agentVersion || null // Add agent version tracking (v1.0.124+)
                });
if (uploadResult?.id) {
                  saved = true;
                  log.info({ step: 'SAVED_STORAGE', ctx: { id: uploadResult.id } });
                  console.log(`✅ [SCREENSHOT-UPLOAD] SUCCESS! Screenshot uploaded: ${uploadResult.id}`);
                  console.log(`📊 [SCREENSHOT-UPLOAD] Uploaded with activity: C:${activityData.clicks} K:${activityData.keys} M:${activityData.moves} Focus:${focusPercent}%`);

                  if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('screenshot-saved', {
                      row_id: uploadResult.id,
                      captured_at: capturedAt
                    });
                  }
                } else if (uploadResult?.error) {
                  log.error({ step: 'DIRECT_SAVE_ERROR', message: uploadResult.error });
                  console.error(`❌ [SCREENSHOT-UPLOAD] FAILED: ${uploadResult.error}`);
                } else {
                  log.error({ step: 'DIRECT_SAVE_ERROR', message: 'Unknown upload failure', uploadResult });
                  console.error(`❌ [SCREENSHOT-UPLOAD] FAILED: Unknown error`, uploadResult);
                }
              } else {
                log.error({
                  step: 'MISSING_DEPENDENCIES', ctx: {
                    hasSupabase: !!supabase,
                    hasUserId: !!userId,
                    hasTimeLog: !!global.currentTimeLogId
                  }
                });
                console.error(`❌ [SCREENSHOT-UPLOAD] Missing dependencies - Supabase: ${!!supabase}, UserId: ${!!userId}`);
              }
            } catch (e) {
              log.error({ step: 'DIRECT_SAVE_EXCEPTION', message: e.message, stack: e.stack });
              console.error(`❌ [SCREENSHOT-UPLOAD] Exception:`, e.message);
            }
          }

          if (saved) {
            this._forceActivityReset();

            if (!isHealthCheck) {
              try { this.onScreenshotSuccess(activityPercent); } catch (_) {}
            }

            this._lastCaptureSuccessAt = Date.now();
            this.activitySinceLastScreenshot = { clicks: 0, keystrokes: 0, mouseMovements: 0 };

            return true;
          } else {
            log.error({ step: 'SCREENSHOT_NOT_SAVED', message: 'All save methods failed' });
            return false;
          }
        }
      } catch (macError) {
        log.error({ step: 'MACOS CAPTURE FAILED', message: macError.message });
      }
      return false;
    }

    // Performance monitoring
    let perfTimer = null;
    try {
      if (global.performanceMonitor) {
        perfTimer = global.performanceMonitor.trackScreenshotCapture();
      }
    } catch { }

    try {
      const nowStart = Date.now();
      const captureId = `cap-${nowStart}-${Math.floor(Math.random() * 1000000)}`;
      try {
        global.currentCaptureId = captureId;
        if (!global.currentCaptureSource) global.currentCaptureSource = isHealthCheck ? 'health' : 'unknown';
      } catch { }

      // Anti-bounce for non-health captures: skip if last success < 5s ago
      if (!isHealthCheck && this._lastCaptureSuccessAt && (nowStart - this._lastCaptureSuccessAt) < 5000) {
        log.warn({ step: 'SKIP CAPTURE (ANTI-BOUNCE)', ctx: { captureId, source: global.currentCaptureSource, timeSinceLast: Math.round((nowStart - this._lastCaptureSuccessAt) / 1000) } });
        return false;
      }
      // Centralized rate limit checks (min gap + rolling window)
      if (!isHealthCheck && this._rateLimiter) {
        const nowMs = Date.now();
        const rl = this._rateLimiter.canTake(nowMs);
        if (!rl.allowed) {
          log.warn({ step: 'SKIP CAPTURE (RATE LIMIT)', ctx: { reason: rl.reason, nextAllowedInMs: Math.ceil(rl.nextAllowedInMs / 1000) } });
          return false;
        }
      }

      // Prevent overlapping captures
      if (this._captureInProgress && !isHealthCheck) {
        log.warn({ step: 'CAPTURE SKIPPED', message: 'Capture already running' });
        return false;
      }
      this._captureInProgress = true;
      log.info({ step: 'TRIGGERING CAPTURE PIPELINE', ctx: { captureId, source: global.currentCaptureSource } });

      // Self-heal wrappers if missing at call time
      if (!this.wrappers) {
        this.wrappers = global.wrappers || this.wrappers;
        if (this.wrappers) {
          log.info({ step: 'WRAPPERS RECOVERED FROM GLOBAL AT CAPTURE TIME' });
        }
      }

      // Delegate to consolidated wrapper which already handles processing
      // Wrap in timeout to prevent a hung native capture from blocking all future screenshots
      const CAPTURE_TIMEOUT_MS = 30000;
      if (this.wrappers && this.wrappers.captureScreenshot) {
        if (process.platform === 'darwin') {
          console.log('📸 [MACOS] Using wrappers.captureScreenshot()');
        }
        const ok = await Promise.race([
          this.wrappers.captureScreenshot(isHealthCheck),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Screenshot capture timed out after 30s')), CAPTURE_TIMEOUT_MS))
        ]);
        if (process.platform === 'darwin') {
          console.log('📸 [MACOS] Wrapper result:', ok);
        }
        if (ok && !isHealthCheck) {
          try { this.onScreenshotSuccess(); } catch { }
          try { this._rateLimiter && this._rateLimiter.record(Date.now()); } catch { }
          this._lastCaptureSuccessAt = Date.now();
          this._consecutiveCaptureFailures = 0;
          global.consecutiveScreenshotFailures = 0;
          log.info({ step: 'CAPTURE END', ctx: { captureId, ok: true, path: 'wrapper' } });
        } else {
          if (!isHealthCheck) {
            this._consecutiveCaptureFailures++;
            global.consecutiveScreenshotFailures = this._consecutiveCaptureFailures;
          }
          log.info({ step: 'CAPTURE END', ctx: { captureId, ok: !!ok, path: 'wrapper', consecutiveFailures: this._consecutiveCaptureFailures } });
        }
        return ok;
      }
      // Last-resort: Fall back to native screenshot-desktop module
      try {
        if (process.platform === 'darwin') {
          console.log('📸 [MACOS] No wrappers, trying direct screenshot-desktop fallback');
        }
        const screenshot = require('screenshot-desktop');
        const buffer = await Promise.race([
          screenshot({ format: 'png' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Direct screenshot timed out after 30s')), CAPTURE_TIMEOUT_MS))
        ]);
        if (buffer && buffer.length > 0) {
          log.info({ step: 'CAPTURE END (DIRECT)', ctx: { captureId, ok: true, size: buffer.length } });
          if (!isHealthCheck) {
            try { this.onScreenshotSuccess(); } catch { }
            try { this._rateLimiter && this._rateLimiter.record(Date.now()); } catch { }
            this._lastCaptureSuccessAt = Date.now();
          }
          return true;
        }
      } catch (directErr) {
        log.error({ step: 'DIRECT SCREENSHOT FAILED', error: directErr.message });
      }

      log.warn({ step: 'NO SCREENSHOT CAPTURE METHOD AVAILABLE' });
      return false;
    } catch (error) {
      log.error({ step: 'CAPTURE SCREENSHOT FAILED', message: error.message });
      return false;
    } finally {
      this._captureInProgress = false;

      // End performance monitoring
      try {
        if (global.performanceMonitor && perfTimer) {
          global.performanceMonitor.endTimer(perfTimer);
        }
      } catch { }
    }
  }

  /**
   * Process screenshot buffer directly to avoid double processing
   */
  async processScreenshotBuffer(buffer) {
    try {
      log.debug({ step: 'PROCESSING SCREENSHOT BUFFER DIRECTLY' });

      // Create screenshot data object similar to screenshot manager
      const timestamp = new Date().toISOString();
      const filename = `screenshot-${timestamp.replace(/[:.]/g, '-')}.png`;

      const screenshotData = {
        filename: filename,
        timestamp: timestamp,
        buffer: buffer,
        size: buffer.length,
        user_id: this.currentSession?.user_id,
        time_log_id: this.currentSession?.id,
        project_id: this.currentSession?.project_id
      };

      log.info({ step: 'ENHANCED MANAGER DIRECT PROCESSING', ctx: { filename, size: buffer.length } });

      // Prefer consolidated screenshot manager's processing if available
      try {
        if (global.modules?.screenshotManager && typeof global.modules.screenshotManager.processScreenshot === 'function') {
          return await global.modules.screenshotManager.processScreenshot.bind(global.modules.screenshotManager)(buffer);
        }
      } catch { }
      // Otherwise, no-op false to avoid undefined method errors
      return false;

    } catch (error) {
      log.error({ step: 'FAILED TO PROCESS SCREENSHOT BUFFER', message: error.message });
      return false;
    }
  }

  /**
   * Get platform-specific screenshot options
   */
  getPlatformScreenshotOptions() {
    const platform = process.platform;

    switch (platform) {
      case 'darwin': // macOS
        return {
          displayId: 0, // Primary display
          format: 'png'
        };

      case 'win32': // Windows
        return {
          format: 'png',
          screen: 0 // Primary screen
        };

      case 'linux': // Linux
        return {
          format: 'png',
          screen: ':0.0' // Default X11 display
        };

      default:
        return {
          format: 'png'
        };
    }
  }

  /**
   * Generate random offsets with minimum gap between them
   * FIX: First screenshot now also respects minGapMs from window start
   */
  generateRandomOffsetsWithMinGap(windowDurationMs, numShots, minGapMs) {
    const offsets = [];
    // FIX: Include minimum gap for FIRST shot too (from window start)
    const totalMinGaps = numShots * minGapMs;

    // Ensure window is large enough for all shots with minimum gaps
    if (totalMinGaps >= windowDurationMs) {
      log.warn({ step: 'WINDOW TOO SMALL FOR SCREENSHOTS', message: `Window too small for ${numShots} shots with ${minGapMs / 1000 / 60}min gaps` });
      // Fallback: distribute evenly with minimum gap from start
      const interval = windowDurationMs / numShots;
      return Array.from({ length: numShots }, (_, i) => minGapMs + i * interval + Math.random() * (interval * 0.3));
    }

    // Available time after accounting for minimum gaps (including first shot)
    const availableTime = windowDurationMs - totalMinGaps;

    // Generate random positions within available segments
    // FIX: Start with minimum gap from window start
    let currentOffset = minGapMs;
    for (let i = 0; i < numShots; i++) {
      // Add random time within this segment
      const segmentSize = availableTime / numShots;
      const randomWithinSegment = Math.random() * segmentSize;
      currentOffset += randomWithinSegment;
      offsets.push(currentOffset);

      // Add minimum gap for next shot (except for last shot)
      if (i < numShots - 1) {
        currentOffset += minGapMs;
      }
    }

    log.info({ step: 'GENERATED OFFSETS WITH MIN GAPS', ctx: { minGap: minGapMs / 1000 / 60, offsets } });

    return offsets;
  }

  /**
   * Check screenshot stop conditions
   */
  checkScreenshotStopConditions() {
    // Check if tracking has stopped
    if (!this.isTracking) {
      debugLogger.guard('screenshot', 'Screenshot blocked - tracking stopped', {
        isTracking: this.isTracking,
        hasSession: !!this.currentSession,
        paused: this.screenshotsPaused
      });
      return 'tracking_stopped';
    }

    // Check if session ended
    if (!this.currentSession) {
      debugLogger.guard('screenshot', 'Screenshot blocked - no session', {
        isTracking: this.isTracking,
        hasSession: !!this.currentSession,
        sessionId: this.currentSession?.id || 'none'
      });
      return 'no_session';
    }

    // Check if screenshots are paused
    if (this.screenshotsPaused) {
      debugLogger.guard('screenshot', 'Screenshot blocked - paused', {
        isTracking: this.isTracking,
        hasSession: !!this.currentSession,
        paused: this.screenshotsPaused
      });
      return 'paused';
    }

    return null; // No stop conditions
  }

  /**
   * Get screenshot stop reason
   */
  getScreenshotStopReason() {
    const stopCondition = this.checkScreenshotStopConditions();

    switch (stopCondition) {
      case 'tracking_stopped':
        return 'Tracking has been stopped';
      case 'no_session':
        return 'No active tracking session';
      case 'paused':
        return 'Screenshots are paused';
      default:
        return null;
    }
  }

  /**
   * Check if screenshot can be taken
   */
  canTakeScreenshot(isHealthCheck = false) {
    log.debug({ step: 'CAN TAKE SCREENSHOT', ctx: { isHealthCheck, isTracking: this.isTracking, hasSession: !!this.currentSession, screenshotsPaused: this.screenshotsPaused } });

    // Health checks can always be taken
    if (isHealthCheck) {
      log.info({ step: 'HEALTH CHECK ALLOWED' });
      return true;
    }

    // Check stop conditions
    const stopCondition = this.checkScreenshotStopConditions();
    if (stopCondition) {
      log.warn({ step: 'CANNOT TAKE SCREENSHOT', message: this.getScreenshotStopReason() });
      log.debug({
        step: 'STOP CONDITION DETAILS', ctx: {
          stopCondition,
          isTracking: this.isTracking,
          hasSession: !!this.currentSession,
          screenshotsPaused: this.screenshotsPaused
        }
      });
      return false;
    }

    log.info({ step: 'SCREENSHOT ALLOWED' });
    return true;
  }

  /**
   * Calculate seconds to next screenshot
   */
  calculateSecondsToNextScreenshot() {
    if (!this.nextScreenshotTime) {
      return 0;
    }

    const now = Date.now();
    const secondsUntilNext = Math.max(0, Math.ceil((this.nextScreenshotTime - now) / 1000));
    return secondsUntilNext;
  }

  /**
   * Send screenshot timer update to renderer
   */
  sendNextScreenshotUpdate() {
    // CRITICAL FIX: Only send updates when tracking is active
    if (!this.isTracking) {
      return;
    }
    // Ensure we always have a next schedule; if missing, arm one now
    if (!this.nextScreenshotTime) {
      this.ensureNextScreenshotTimer();
      if (!this.nextScreenshotTime) {
        // As a last resort, set a short direct timer so UI has a concrete countdown
        log.warn({ step: 'NO NEXT SCREENSHOT TIME AVAILABLE', message: 'arming 3 min emergency timer' });
        this.scheduleDirectScreenshot();
      }
    }

    let secondsUntilNext = this.calculateSecondsToNextScreenshot();
    
    // FIX: When timer shows 0:00 (expired), reschedule to prevent UI stuck at 0:00
    if (secondsUntilNext === 0 && this.nextScreenshotTime && this.nextScreenshotTime.getTime() <= Date.now()) {
      log.warn({ step: 'TIMER EXPIRED (0:00)', message: 'Rescheduling screenshot timer' });
      // Clear old timer and reschedule
      this.ensureNextScreenshotTimer();
      // Recalculate after reschedule
      secondsUntilNext = this.calculateSecondsToNextScreenshot();
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        // CRITICAL FIX: Check idle state FIRST before processing activity
        const idleSeconds = global.unifiedInputManager?.getIdleTime?.() || 0;
        const IDLE_THRESHOLD = global.enhancedIdleMonitor?.IDLE_THRESHOLD || 60;
        const isIdle = idleSeconds > IDLE_THRESHOLD;
        
        // Get current activity data
        log.debug({ step: 'RAW GLOBAL ACTIVITY', ctx: global.betweenScreenshotsActivity });
        let activityData = {
          clicks: global.betweenScreenshotsActivity?.clicks || 0,
          keys: global.betweenScreenshotsActivity?.keys || 0,
          moves: global.betweenScreenshotsActivity?.moves || 0
        };

        // CRITICAL FIX: When idle, always show zeros instead of cached/accumulated values
        // This ensures the Activity Monitor accurately reflects current state
        if (isIdle) {
          activityData = { clicks: 0, keys: 0, moves: 0 };
          // Clear the cache too so it doesn't reappear after idle ends
          this.lastNonZeroActivity = { clicks: 0, keys: 0, moves: 0 };
        } else {
          // Only preserve/use cached values when NOT idle
          const hasNonZero = (activityData.clicks + activityData.keys + activityData.moves) > 0;
          if (hasNonZero) {
            this.lastNonZeroActivity = { ...activityData };
          } else if ((this.lastNonZeroActivity.clicks + this.lastNonZeroActivity.keys + this.lastNonZeroActivity.moves) > 0) {
            activityData = { ...this.lastNonZeroActivity };
          }
        }

        // Detect activity changes to avoid rebroadcasting identical counts
        const now = Date.now();
        const activityChanged = (
          activityData.clicks !== this._lastEmittedActivity.clicks ||
          activityData.keys !== this._lastEmittedActivity.keys ||
          activityData.moves !== this._lastEmittedActivity.moves
        );
        if (activityChanged) {
          this._lastEmittedActivity = { ...activityData };
          this._lastActivityChangeAt = now;
        }

        // Lightweight stall detection using lastUpdate if available
        try {
          const lastUpdateTs = global.betweenScreenshotsActivity?.lastUpdate || this._lastActivityChangeAt || now;
          const stalledMs = now - lastUpdateTs;
          // Log stall at most once per minute
          if (stalledMs > 60000 && now - (this._lastStallLogAt || 0) > 60000) {
            this._lastStallLogAt = now;
            log.warn({ step: 'ACTIVITY COUNTERS UNCHANGED', message: 'Possible sensor stall or user idle', ctx: { stalledMs: Math.round(stalledMs / 1000) } });
          }
        } catch { }

        // Always send timer countdown, include activity only when changed to reduce UI churn
        const timerPayload = {
          secondsUntilNext: secondsUntilNext,
          nextScreenshotTime: this.nextScreenshotTime,
          timestamp: now
        };
        if (activityChanged) {
          timerPayload.activitySinceLastScreenshot = activityData;
        }
        this.mainWindow.webContents.send('next-screenshot-update', timerPayload);
        // Also emit a mirrored screenshot-update via enhancedSyncManager (renderer may listen to this)
        try {
          global.enhancedSyncManager?.batchScreenshotUpdate({
            nextScreenshotTime: this.nextScreenshotTime,
            secondsUntilNext: secondsUntilNext,
            screenshotInterval: this.SCREENSHOT_INTERVAL,
            timestamp: now,
            // Only attach activity when there is an actual change
            ...(activityChanged ? { activitySinceLastScreenshot: activityData } : {})
          });

          // CRITICAL: Also send activity-update with properly named properties for UI only on change
          if (activityChanged) {
            global.enhancedSyncManager?.batchActivityUpdate({
              mouseClicks: activityData.clicks || 0,
              keystrokes: activityData.keys || 0,
              mouseMovements: activityData.moves || 0,
              timestamp: now
            });
          }
        } catch { }

        // Reduce log spam: only log when activity changed
        if (activityChanged) {
          log.debug({ step: 'TIMER UPDATE SENT WITH ACTIVITY DATA', ctx: activityData });
        } else {
          log.debug({ step: 'TIMER UPDATE SENT (ACTIVITY UNCHANGED)' });
        }
      } catch (error) {
        log.warn({ step: 'FAILED TO SEND TIMER UPDATE', message: error.message });
      }
    }
  }

  /**
   * Get default screenshot data
   */
  getDefaultScreenshotData() {
    return {
      nextScreenshotTime: this.nextScreenshotTime || null,
      secondsUntilNext: this.calculateSecondsToNextScreenshot(),
      screenshotInterval: this.SCREENSHOT_INTERVAL,
      timestamp: Date.now()
    };
  }

  /**
   * Start screenshot timer updates
   */
  startScreenshotTimerUpdates() {
    if (this.screenshotTimerInterval) {
      clearInterval(this.screenshotTimerInterval);
    }

    // Send timer updates every 5 seconds
    this.screenshotTimerInterval = setInterval(() => {
      this.sendNextScreenshotUpdate();
    }, 5000);

    log.info({ step: 'TIMER UPDATES STARTED' });
  }

  /**
   * Stop screenshot timer updates
   */
  stopScreenshotTimerUpdates() {
    if (this.screenshotTimerInterval) {
      clearInterval(this.screenshotTimerInterval);
      this.screenshotTimerInterval = null;
      log.info({ step: 'TIMER UPDATES STOPPED' });
    }
  }

  /**
   * Ensure next screenshot timer is set
   */
  ensureNextScreenshotTimer() {
    // If backbone scheduling is active, don't arm random/direct timers - just estimate nextScreenshotTime
    if (this._windowInterval) {
      if (this.isTracking && this.currentSession && (!this.nextScreenshotTime || this.nextScreenshotTime.getTime() < Date.now())) {
        // Window scheduling is active but nextScreenshotTime is missing or stale
        // Estimate based on remaining window time
        const windowRemaining = this.windowStartTime ? 
          (this.windowStartTime + this.windowDurationMs) - Date.now() : 0;
        
        if (windowRemaining > 0) {
          const estimatedNext = Math.max(30000, windowRemaining / 3);
          this.nextScreenshotTime = new Date(Date.now() + estimatedNext);
          global.nextScreenshotTime = this.nextScreenshotTime;
          log.debug({ step: 'WINDOW ACTIVE - ESTIMATED NEXT SCREENSHOT', ctx: { seconds: Math.round(estimatedNext/1000) } });
        } else {
          // Window should restart soon, set a short placeholder
          this.nextScreenshotTime = new Date(Date.now() + 60000);
          global.nextScreenshotTime = this.nextScreenshotTime;
          log.debug({ step: 'WINDOW ENDING SOON - PLACEHOLDER SET', ctx: { seconds: 60 } });
        }
        this.sendNextScreenshotUpdate();
      }
      return; // Don't fall through to scheduleRandomScreenshot
    }
    
    if (this.isTracking && this.currentSession && !this.nextScreenshotTime) {
      log.warn({ step: 'NO NEXT SCREENSHOT TIME SET, SCHEDULING IMMEDIATELY' });
      this.scheduleRandomScreenshot();
    }

    if (this.nextScreenshotTime && this.nextScreenshotTime.getTime() < Date.now()) {
      log.warn({ step: 'NEXT SCREENSHOT TIME IS IN THE PAST, RESCHEDULING' });
      this.scheduleRandomScreenshot();
    }
  }

  // REMOVED: Mandatory screenshot monitoring - window-based 3-per-10-min logic is the single source
  // checkMandatoryScreenshot() - removed
  // startMandatoryScreenshotMonitoring() - removed

  /**
   * Stop mandatory screenshot monitoring (no-op, kept for compatibility)
   */
  stopMandatoryScreenshotMonitoring() {
    // No-op - mandatory monitoring removed, window-based scheduling is the single source
    if (this.mandatoryScreenshotInterval) {
      clearInterval(this.mandatoryScreenshotInterval);
      this.mandatoryScreenshotInterval = null;
    }
  }

  /**
   * Pause screenshots (e.g., when screen is locked)
   */
  pauseScreenshotsOnly() {
    log.info({ step: 'PAUSING SCREENSHOTS ONLY' });
    this.screenshotsPaused = true;
    this.lastScreenshotBeforeSuspend = this.nextScreenshotTime;
  }

  /**
   * Resume screenshots (with macOS TCC permission gate after wake)
   */
  async resumeScreenshotsOnly() {
    log.info({ step: 'RESUMING SCREENSHOTS' });
    this.screenshotsPaused = false;

    // Give macOS time to restore TCC permission cache after sleep/wake
    if (process.platform === 'darwin') {
      log.info({ step: 'WAITING FOR MACOS TCC RESTORE AFTER WAKE' });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify screen recording permission before scheduling
      if (!this.hasScreenRecordingPermission()) {
        log.warn({ step: 'SCREEN RECORDING PERMISSION NOT READY AFTER WAKE' });
        // Retry up to 3 times with increasing delay (2s, 4s, 6s)
        for (let i = 0; i < 3; i++) {
          await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
          if (this.hasScreenRecordingPermission()) {
            log.info({ step: 'SCREEN RECORDING PERMISSION RESTORED', ctx: { attemptNumber: i + 1 } });
            break;
          }
        }
        if (!this.hasScreenRecordingPermission()) {
          log.error({ step: 'SCREEN RECORDING PERMISSION STILL NOT AVAILABLE AFTER WAKE - SKIPPING SCHEDULE' });
          return; // Don't schedule -- avoid triggering macOS permission prompt
        }
      } else {
        log.info({ step: 'SCREEN RECORDING PERMISSION CONFIRMED AFTER WAKE' });
      }
    }

    // Resume screenshot scheduling
    this.scheduleRandomScreenshot();
  }

  /**
   * Debug screenshot timer
   */
  debugScreenshotTimer() {
    log.debug({ step: 'SCREENSHOT TIMER STATUS' });
    log.debug({ step: '  - nextScreenshotTime:', ctx: { value: this.nextScreenshotTime } });
    log.debug({ step: '  - isTracking:', ctx: { value: this.isTracking } });
    log.debug({ step: '  - currentSession:', ctx: { value: !!this.currentSession } });
    log.debug({ step: '  - screenshotsPaused:', ctx: { value: this.screenshotsPaused } });
    log.debug({ step: '  - screenshotInterval:', ctx: { value: !!this.screenshotInterval } });
  }

  /**
   * Force screenshot timer recovery
   */
  forceScreenshotTimerRecovery() {
    log.info({ step: 'FORCING SCREENSHOT TIMER RECOVERY' });

    if (this.isTracking && this.currentSession) {
      log.info({ step: 'RESTARTING SCREENSHOT SYSTEM' });
      this.stopScreenshotCapture();
      setTimeout(() => {
        this.startScreenshotCapture();
      }, 1000);
    } else {
      log.warn({ step: 'NOT TRACKING - SKIPPING RECOVERY' });
    }
  }

  /**
   * Update tracking state
   */
  updateTrackingState(isTracking, currentSession) {
    log.debug({
      step: 'UPDATE TRACKING STATE', ctx: {
        isTracking,
        hasSession: !!currentSession,
        sessionId: currentSession?.id || 'none',
        previousTracking: this.isTracking
      }
    });

    this.isTracking = isTracking;
    this.currentSession = currentSession;

    // CRITICAL FIX: Reset shutdown flag when tracking starts
    if (this.isTracking && this.currentSession) {
      this._shuttingDown = false;
      this._trackingStartedAt = Date.now();
      console.log('✅ [SCREENSHOT] Shutdown flag cleared via updateTrackingState');
      
      // CRITICAL FIX: Initialize activity counters on tracking start
      // This ensures betweenScreenshotsActivity is always available for screenshot capture
      if (!global.betweenScreenshotsActivity) {
        global.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
        console.log('✅ [SCREENSHOT] Initialized global.betweenScreenshotsActivity on tracking start');
      }
      if (global.enhancedActivityManager && !global.enhancedActivityManager.betweenScreenshotsActivity) {
        global.enhancedActivityManager.betweenScreenshotsActivity = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };
        console.log('✅ [SCREENSHOT] Initialized enhancedActivityManager.betweenScreenshotsActivity on tracking start');
      }
    }

    // When tracking toggles on with a valid session, (re)arm the screenshot systems
    if (this.isTracking && this.currentSession) {
      // CRITICAL: Reset pause/shutdown flags so screenshots work after lock/unlock cycle
      this.screenshotsPaused = false;
      this._shuttingDown = false;
      log.info({ step: 'STARTING SCREENSHOT SYSTEMS - TRACKING ACTIVE WITH SESSION' });
      // Idempotent starts (internally clear existing intervals first)
      this.startScreenshotCapture();
      this.startScreenshotTimerUpdates();
      // REMOVED: startMandatoryScreenshotMonitoring() - window-based 3-per-10-min is single source
      this.ensureNextScreenshotTimer();
      this.sendNextScreenshotUpdate();

      // Safety net: if no window timers are active after a short grace period,
      // attempt a recovery (but do NOT fire an immediate capture - the recovery will schedule properly)
      setTimeout(() => {
        try {
          const timersActive = (this.windowTimers && this.windowTimers.length) || 0;
          if (!timersActive) {
            log.warn({ step: 'NO SCHEDULED TIMERS DETECTED AFTER START', message: 'Attempting recovery' });
            this.forceScreenshotTimerRecovery();
            // REMOVED: Redundant immediate capture call that caused burst screenshots
            // The recovery already restarts screenshot scheduling which will capture at the right time
            // Old code: setTimeout(() => { this.captureScreenshot(false); }, 1500);
          }
        } catch (e) {
          log.warn({ step: 'RECOVERY CHECK FAILED', message: e.message });
        }
      }, 15000); // 15s after tracking start
    } else {
      log.debug({ step: 'STOPPING SCREENSHOT SYSTEMS - TRACKING INACTIVE' });
      // Fully stop when not tracking
      this.stopScreenshotCapture();
      this.stopScreenshotTimerUpdates();
      this.stopMandatoryScreenshotMonitoring();
    }

    // Update global references for compatibility
    global.nextScreenshotTime = this.nextScreenshotTime;

    log.debug({
      step: 'UPDATE TRACKING STATE COMPLETED', ctx: {
        isTracking: this.isTracking,
        hasSession: !!this.currentSession,
        windowTimersActive: this.windowTimers?.length || 0
      }
    });
  }

  /**
   * Start automatic capture regardless of current gating (for diagnostics only)
   * Used by force-start-monitoring debug handler.
   */
  startAutomaticCapture() {
    log.debug({ step: 'START AUTOMATIC CAPTURE' });
    // Do not create mock sessions. Only operate when a real session is active.
    if (!this.isTracking || !this.currentSession) {
      log.warn({ step: 'SKIPPING AUTOMATIC CAPTURE - NO ACTIVE SESSION' });
      return;
    }
    this.startScreenshotCapture();
    this.startScreenshotTimerUpdates();
    // REMOVED: startMandatoryScreenshotMonitoring() - window-based 3-per-10-min is single source
    this.ensureNextScreenshotTimer();
    this.sendNextScreenshotUpdate();
  }

  /**
   * Clean screenshot history
   */
  cleanScreenshotHistory() {
    log.info({ step: 'CLEANING SCREENSHOT HISTORY' });

    // Clear any stored screenshot buffers
    this.screenshotBuffer = null;

    // Reset timing variables
    this.lastScreenshotBeforeSuspend = null;

    log.info({ step: 'SCREENSHOT HISTORY CLEANED' });
  }

  /**
   * Ensure screenshot system starts
   */
  ensureScreenshotSystemStarts() {
    log.info({ step: 'ENSURING SCREENSHOT SYSTEM STARTS' });

    let attemptSuccess = false;

    // Method 1: Try using wrappers
    if (this.wrappers && this.wrappers.scheduleRandomScreenshot) {
      log.info({ step: 'METHOD 1: USING WRAPPERS.SCHEDULERANDOMSCREENSHOT' });
      try {
        this.wrappers.scheduleRandomScreenshot();
        attemptSuccess = true;
        log.info({ step: 'METHOD 1: SUCCESS' });
      } catch (error) {
        log.warn({ step: 'METHOD 1: ERROR', message: error.message });
      }
    } else {
      log.warn({ step: 'METHOD 1: WRAPPERS.SCHEDULERANDOMSCREENSHOT NOT AVAILABLE' });
    }

    // Method 2: Try direct scheduling
    if (!attemptSuccess) {
      log.info({ step: 'METHOD 2: USING DIRECT SCHEDULERANDOMSCREENSHOT' });
      try {
        this.scheduleRandomScreenshot();
        attemptSuccess = true;
        log.info({ step: 'METHOD 2: SUCCESS' });
      } catch (error) {
        log.warn({ step: 'METHOD 2: ERROR', message: error.message });
      }
    }

    if (attemptSuccess) {
      log.info({ step: 'SCREENSHOT SYSTEM RECOVERY SUCCESSFUL' });
    } else {
      log.warn({ step: 'ALL SCREENSHOT RECOVERY METHODS FAILED' });
    }
  }

  /**
   * Bulletproof activity counter reset — called directly after every screenshot save.
   * Resets all known activity counter locations without logging verbosely.
   */
  _forceActivityReset() {
    const now = Date.now();
    try {
      if (global.betweenScreenshotsActivity) {
        global.betweenScreenshotsActivity.clicks = 0;
        global.betweenScreenshotsActivity.keys = 0;
        global.betweenScreenshotsActivity.moves = 0;
        global.betweenScreenshotsActivity.lastUpdate = now;
      }
    } catch (_) {}
    try {
      if (global.enhancedActivityManager?.betweenScreenshotsActivity) {
        global.enhancedActivityManager.betweenScreenshotsActivity.clicks = 0;
        global.enhancedActivityManager.betweenScreenshotsActivity.keys = 0;
        global.enhancedActivityManager.betweenScreenshotsActivity.moves = 0;
        global.enhancedActivityManager.betweenScreenshotsActivity.lastUpdate = now;
      }
    } catch (_) {}
    try {
      if (global.enhancedActivityManager?.resetActivityForScreenshot) {
        global.enhancedActivityManager.resetActivityForScreenshot();
      }
    } catch (_) {}
  }

  /**
   * Reset activity for screenshot metadata
   */
  resetActivityForScreenshot() {
    console.log(`🔄 [ACTIVITY-RESET] Resetting activity counters after screenshot`);
// Log BEFORE reset
    console.log(`🔍 [ACTIVITY-RESET] BEFORE reset:`, {
      betweenScreenshotsActivity: global.betweenScreenshotsActivity ? { ...global.betweenScreenshotsActivity } : null,
      displayActivityStats: global.displayActivityStats ? { clicks: global.displayActivityStats.clicks, keys: global.displayActivityStats.keys, moves: global.displayActivityStats.moves, totalClicks: global.displayActivityStats.totalClicks, totalKeys: global.displayActivityStats.totalKeys, totalMoves: global.displayActivityStats.totalMoves } : null,
      enhancedActivityManager: global.enhancedActivityManager?.betweenScreenshotsActivity ? { ...global.enhancedActivityManager.betweenScreenshotsActivity } : null
    });

    // Reset betweenScreenshotsActivity (per-screenshot counters)
    if (global.betweenScreenshotsActivity) {
      global.betweenScreenshotsActivity.clicks = 0;
      global.betweenScreenshotsActivity.keys = 0;
      global.betweenScreenshotsActivity.moves = 0;
      global.betweenScreenshotsActivity.lastUpdate = Date.now();
    }

    // CRITICAL FIX: DON'T reset displayActivityStats.clicks/keys/moves
    // These should match totalClicks/totalKeys/totalMoves (cumulative session counters)
    // Only betweenScreenshotsActivity gets reset (per-screenshot deltas)
    console.log(`🔄 [ACTIVITY-RESET] Preserved displayActivityStats cumulative counters: C:${global.displayActivityStats?.clicks || 0} (total:${global.displayActivityStats?.totalClicks || 0}) K:${global.displayActivityStats?.keys || 0} M:${global.displayActivityStats?.moves || 0}`);

    // Also reset the manager-owned structure if available to keep them in sync
    try {
      if (global.enhancedActivityManager && global.enhancedActivityManager.betweenScreenshotsActivity) {
        global.enhancedActivityManager.betweenScreenshotsActivity.clicks = 0;
        global.enhancedActivityManager.betweenScreenshotsActivity.keys = 0;
        global.enhancedActivityManager.betweenScreenshotsActivity.moves = 0;
        global.enhancedActivityManager.betweenScreenshotsActivity.lastUpdate = Date.now();
      }
    } catch { }

    // Log AFTER reset
    console.log(`✅ [ACTIVITY-RESET] AFTER reset - per-screenshot counters should be zero, totals preserved`);
  }

  /**
   * Handle screenshot success
   */
  onScreenshotSuccess(activityPercent = null) {
    global.screenshotSuccesses = (global.screenshotSuccesses || 0) + 1;

    if (activityPercent !== null && global.enhancedIdleMonitor?.onScreenshotActivity) {
      try {
        global.enhancedIdleMonitor.onScreenshotActivity(activityPercent);
      } catch (_) {}
    }

    this.resetActivityForScreenshot();
    this.lastNonZeroActivity = { clicks: 0, keys: 0, moves: 0 };

    // Update last screenshot time — sync to both globals so the main.js
    // watchdog can detect "no screenshot in 15 min" correctly.
    global.lastScreenshotTime = Date.now();
    global.lastSuccessfulScreenshotTime = global.lastScreenshotTime;
    global.consecutiveScreenshotFailures = 0;
    this._lastCaptureSuccessAt = global.lastScreenshotTime;
  }

  /**
   * Get screenshot status
   */
  getScreenshotStatus() {
    // Note: Removed canTakeScreenshot() call to prevent log spam on every status poll
    // For status display, we derive canTake from existing state without re-checking permissions
    const canTake = this.isTracking && !!this.currentSession && !this.screenshotsPaused;
    return {
      isActive: !!this.screenshotInterval,
      isPaused: this.screenshotsPaused,
      nextScreenshotTime: this.nextScreenshotTime,
      secondsUntilNext: this.calculateSecondsToNextScreenshot(),
      canTakeScreenshot: canTake,
      isTracking: this.isTracking,
      hasSession: !!this.currentSession
    };
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    log.info({ step: 'CLEANING UP ENHANCED SCREENSHOT MANAGER' });

    this.stopScreenshotCapture();
    this.stopScreenshotTimerUpdates();
    this.stopMandatoryScreenshotMonitoring();
    this.stopDiagnosticsHeartbeat();
    this.cleanScreenshotHistory();
  }
}

module.exports = EnhancedScreenshotManager;