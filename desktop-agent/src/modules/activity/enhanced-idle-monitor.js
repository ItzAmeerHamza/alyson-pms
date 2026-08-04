/**
 * Enhanced Idle Monitor Module
 * Handles idle detection, monitoring, and auto-stop functionality
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('../core/cleanup-registry');

class EnhancedIdleMonitor {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.deps = dependencies;
    this.idleMonitoringInterval = null;
    this.currentIdleStartTime = null;
    this.idleThresholdExceeded = false;
    this.wasIdleLastCheck = false;
    this.isTracking = false;
    this._idleSessionTimeout = null;
    this._consecutiveZeroActivityShots = 0;
    /** End timestamp of the last idle chunk persisted to idle_logs (ms). */
    this._lastIdleCheckpointTime = null;
    /** Last time we saw a real keystroke or click (ms). Used when OS idle is unreliable. */
    this._lastInputActivityAt = null;
    this._lastSeenKeystrokesForIdle = 0;
    this._lastSeenClicksForIdle = 0;
    /** Last time activity was above low threshold (keys, clicks, or screenshot %). */
    this._lastHighActivityAt = null;
    
    // Phantom-activity detection: tracks periods with mouse moves but zero
    // keystrokes/clicks — the signature of mouse jitter / desk vibration
    // that fools getSystemIdleTime() on Windows.
    this._phantomIdleStartTime = null;
    this._lastSeenKeystrokes = 0;
    this._lastSeenClicks = 0;
    const defaultPhantomIdleMinutes =
      process.env.NODE_ENV === 'production'
        ? 10
        : 60; // Dev/test: avoid unexpected auto-stops while validating uploads
    this.PHANTOM_IDLE_THRESHOLD_MS =
      (this.config?.phantom_idle_minutes || global?.appSettings?.phantom_idle_minutes || defaultPhantomIdleMinutes) * 60 * 1000;
    
    // Idle logging: OS idle only (any keyboard/mouse/trackpad resets it).
    // Default 5 minutes so reading/scrolling is not counted as idle.
    // Override with idle_detection_threshold_seconds / app settings / env.
    const appSettings = this.config?.appSettings || global?.appSettings || {};
    const envDetectionSeconds = Number(process.env.IDLE_DETECTION_THRESHOLD_SECONDS);
    const detectionSeconds =
      (envDetectionSeconds > 0 ? envDetectionSeconds : null) ??
      this.config?.idle_detection_threshold_seconds ??
      appSettings.idle_detection_threshold_seconds ??
      this.config?.diagnostic_idle_threshold_seconds ??
      300; // 5 minutes
    const checkpointSeconds =
      this.config?.idle_checkpoint_interval_seconds ??
      appSettings.idle_checkpoint_interval_seconds ??
      30;

    this.IDLE_CHECK_INTERVAL = Math.max(15000, checkpointSeconds * 1000);
    this.MIN_IDLE_CHUNK_MS = 5000; // ignore sub-5s slices (clock jitter)
    this.IDLE_THRESHOLD = detectionSeconds;
    this.LOW_ACTIVITY_PERCENT =
      this.config?.idle_low_activity_percent ??
      appSettings.idle_low_activity_percent ??
      appSettings.low_activity_threshold ??
      30;
    this.IDLE_SESSION_THRESHOLD = (this.config?.diagnostic_idle_session_ms || 1200000);
    
    // Auto-stop threshold in minutes.
    // idle_threshold_seconds is for detection sensitivity, NOT auto-stop.
    let idleThresholdMinutes = 10;
    
    if (this.config?.idle_threshold_minutes) {
      idleThresholdMinutes = this.config.idle_threshold_minutes;
    } else if (global?.appSettings?.max_idle_time_seconds) {
      idleThresholdMinutes = Math.max(2, Math.floor(global.appSettings.max_idle_time_seconds / 60));
    }
    
    this.config = {
      ...this.config,
      auto_stop_on_idle: this.config?.auto_stop_on_idle ?? true,
      idle_threshold_minutes: idleThresholdMinutes
    };
    
    this.AUTO_STOP_THRESHOLD = idleThresholdMinutes * 60;

    // Idle-confirmation prompt.
    // Policy (product):
    //   1) OS idle for 10 straight minutes → show "still working?" with a 1-min timer
    //   2) If that timer finishes with NO click on "I'm working" → stop and deduct
    //      exactly 10 minutes from tracked time (ONLY authorized deduction)
    //   3) Non-effective (idle/low activity) is DISPLAY ONLY — never reduces the
    //      main tracked clock except via (2)
    //   4) "I'm working" → keep tracking (no cut); "On break" → stop now (no 10m cut)
    //   5) Never cut/stop if the prompt UI was not actually shown
    //   6) Sleep / screen lock must NOT stop tracking (Windows/macOS) — continuous clock
    this._idlePromptActive = false;
    this._idlePromptShown = false; // true only after UI successfully displayed
    this._idlePromptTimeout = null;
    this._idlePromptIdleStart = null;
    this._idlePromptManager = null;
    const envCountdownSeconds = Number(process.env.IDLE_PROMPT_COUNTDOWN_SECONDS);
    const promptCountdownSeconds =
      (envCountdownSeconds > 0 ? envCountdownSeconds : null) ??
      this.config?.idle_prompt_countdown_seconds ??
      60;
    this.IDLE_PROMPT_COUNTDOWN_MS = promptCountdownSeconds * 1000;
    // Default: the prompt appears only after 10 straight minutes of no keyboard
    // or mouse input, then gives a 60s countdown before tracking stops. The idle
    // measure (OS idle time) is continuous — ANY input resets it to zero — so a
    // user who is idle for a while and then works again never sees the prompt;
    // it fires solely on an unbroken 10-minute idle stretch. This is intentionally
    // decoupled from the (often much smaller) workspace idle-detection setting.
    // Override with config.idle_prompt_minutes.
    // IDLE_PROMPT_THRESHOLD_SECONDS env is a testing shortcut to fire it sooner.
    const DEFAULT_IDLE_PROMPT_MINUTES = 10;
    const envThresholdSeconds = Number(process.env.IDLE_PROMPT_THRESHOLD_SECONDS);
    const promptMinutes =
      this.config?.idle_prompt_minutes ?? DEFAULT_IDLE_PROMPT_MINUTES;
    this.IDLE_PROMPT_THRESHOLD_MS =
      envThresholdSeconds > 0 ? envThresholdSeconds * 1000 : promptMinutes * 60 * 1000;

    cleanupRegistry.registerResource({
      name: 'enhancedIdleMonitor',
      cleanup: async () => this.shutdown()
    });
  }

  initialize({ isTracking = false } = {}) {
    this.isTracking = isTracking;
    console.log('🧍 [ENHANCED-IDLE-MONITOR] Initialized');
  }

  setTrackingState(tracking) {
    this.isTracking = tracking;
  }

  _isValidUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || '').trim(),
    );
  }

  _resolveTimeLogId() {
    const candidates = [
      global.currentTimeLogId,
      global.trackingManager?.currentTimeLogId,
      global.currentSession?.time_log_id,
      global.currentSession?.id,
    ];
    for (const candidate of candidates) {
      if (this._isValidUuid(candidate)) return candidate;
    }
    return null;
  }

  _resolveUserId() {
    const { normalizeTenantUserId } = require('../utils/tenant-user-id');
    const raw =
      global.currentUserId ||
      global.sessionManager?.getUserId?.() ||
      global.currentSession?.user_id ||
      this.config?.user_id ||
      global.config?.user_id ||
      global.config?.USER_ID ||
      null;
    return normalizeTenantUserId(raw);
  }

  /**
   * Screenshot activity no longer starts idle periods.
   * Idle is OS-only (see _getEffectiveIdleSeconds); keep this as a no-op hook
   * so callers do not need to change.
   */
  async _ensureIdleLoggedFromScreenshot() {
    // Intentionally empty — low screenshot activity must not inflate IDLE.
  }

  recordActivity(_source) {
    this._markHighActivity();
  }

  _queueIdleLog(idleData) {
    if (!global.offlineQueue) {
      global.offlineQueue = {
        screenshots: [],
        activities: [],
        timeLogs: [],
        appLogs: [],
        urlLogs: [],
        idleLogs: [],
        fraudAlerts: [],
      };
    }
    if (!global.offlineQueue.idleLogs) {
      global.offlineQueue.idleLogs = [];
    }
    global.offlineQueue.idleLogs.push({
      ...idleData,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    });
    global.enhancedSyncManager?.processQueueItem?.('idleLogs', idleData).catch(() => {});
  }

  // === IDLE MONITORING FUNCTIONS ===
  
  startIdleMonitoring() {
    if (this.idleMonitoringInterval) {
      clearInterval(this.idleMonitoringInterval);
    }

    this.isTracking = true;
    
    console.log('🧍 [IDLE-MONITOR] Starting idle monitoring...');
    console.log(
      `🧍 [IDLE-MONITOR] Idle logging: OS idle only, starts after ${this.IDLE_THRESHOLD}s (${Math.round(this.IDLE_THRESHOLD / 60)} min), check every ${this.IDLE_CHECK_INTERVAL / 1000}s`,
    );
    console.log(`🧍 [IDLE-MONITOR] Auto-stop prompt: ${this.config.idle_threshold_minutes} min OS idle, ${Math.floor(this.PHANTOM_IDLE_THRESHOLD_MS / 60000)} min phantom idle`);
    
    this._lastSeenKeystrokes = global.unifiedInputManager?.stats?.keystrokes || 0;
    this._lastSeenClicks = global.unifiedInputManager?.stats?.mouseClicks || 0;
    this._phantomIdleStartTime = null;
    const stats = global.unifiedInputManager?.stats;
    this._lastSeenKeystrokesForIdle = stats?.keystrokes || 0;
    this._lastSeenClicksForIdle = stats?.mouseClicks || 0;
    const now = Date.now();
    if (!this._lastInputActivityAt || !this._lastHighActivityAt) {
      this._lastInputActivityAt = now;
      this._lastHighActivityAt = now;
    }
    
    // Check idle state on a fixed interval
    this.idleMonitoringInterval = setInterval(async () => {
      if (!this.isTracking || !global.isTracking) return;
      try {
        await this._evaluateIdleState();
      } catch (error) {
        console.log('❌ [IDLE-MONITOR] Error checking idle state:', error.message);
      }
    }, this.IDLE_CHECK_INTERVAL);
    
    cleanupRegistry.registerInterval(this.idleMonitoringInterval, 'Idle Monitoring');
    console.log('✅ [IDLE-MONITOR] Idle monitoring started');
  }

  async stopIdleMonitoring() {
    // CRITICAL FIX: Set isTracking to false to prevent any stray interval ticks
    this.isTracking = false;

    // Dismiss any open idle-confirmation prompt (tracking is ending anyway).
    if (this._idlePromptTimeout) {
      clearTimeout(this._idlePromptTimeout);
      this._idlePromptTimeout = null;
    }
    this._idlePromptActive = false;
    this._idlePromptIdleStart = null;
    try {
      this._idlePromptManager?.hide();
    } catch (_) {}

    // Clear pending markSessionAsIdle timeout
    if (this._idleSessionTimeout) {
      clearTimeout(this._idleSessionTimeout);
      this._idleSessionTimeout = null;
    }
    
    if (this.idleMonitoringInterval) {
      clearInterval(this.idleMonitoringInterval);
      this.idleMonitoringInterval = null;
      
      // Flush any unlogged idle time when tracking stops while user is still idle.
      if (this.currentIdleStartTime && this.wasIdleLastCheck) {
        await this._flushIdleCheckpoint();
      }
      
      this.currentIdleStartTime = null;
      this._lastIdleCheckpointTime = null;
      this.wasIdleLastCheck = false;
      console.log('🛑 [IDLE-MONITOR] Idle monitoring stopped');
    }
  }

  /**
   * Seconds since the last real keystroke or mouse click.
   * Matches screenshot "0 keys / 0 clicks" better than OS idle on Mac/Windows.
   */
  _getInputIdleSeconds() {
    const stats = global.unifiedInputManager?.stats;
    if (!stats) return 0;

    const currentKeys = stats.keystrokes || 0;
    const currentClicks = stats.mouseClicks || 0;
    const now = Date.now();

    if (
      currentKeys > this._lastSeenKeystrokesForIdle ||
      currentClicks > this._lastSeenClicksForIdle
    ) {
      this._markHighActivity(now);
      this._lastSeenKeystrokesForIdle = currentKeys;
      this._lastSeenClicksForIdle = currentClicks;
    }

    if (!this._lastInputActivityAt) {
      this._lastInputActivityAt = now;
    }

    return Math.max(0, Math.floor((now - this._lastInputActivityAt) / 1000));
  }

  _getLowActivityIdleSeconds() {
    if (!this._lastHighActivityAt) return 0;
    return Math.max(0, Math.floor((Date.now() - this._lastHighActivityAt) / 1000));
  }

  _markHighActivity(at = Date.now()) {
    this._lastHighActivityAt = at;
    this._lastInputActivityAt = at;
  }

  /**
   * Idle for logging / dashboard: OS idle only.
   * Any keyboard, click, or mouse/trackpad movement resets OS idle — so reading
   * with scroll/mouse move is not counted. Keys/clicks-only and screenshot %
   * are kept for diagnostics but do not start idle periods.
   */
  _getEffectiveIdleSeconds() {
    const os = global.unifiedInputManager?.getIdleTime?.() || 0;
    const input = this._getInputIdleSeconds();
    const lowActivity = this._getLowActivityIdleSeconds();
    return {
      effective: os,
      os,
      input,
      lowActivity,
    };
  }

  /**
   * Core idle loop — OS idle ≥ threshold starts an idle period for idle_logs.
   */
  async _evaluateIdleState() {
    const { effective: idleSeconds, os, input, lowActivity } = this._getEffectiveIdleSeconds();
    const isIdle = idleSeconds >= this.IDLE_THRESHOLD;

    if (isIdle && !this.wasIdleLastCheck) {
      console.log(
        `⏸️ [IDLE-MONITOR] Idle started (os=${os}s ≥ ${this.IDLE_THRESHOLD}s; input=${input}s low%=${lowActivity}s ignored for logging)`,
      );
      this.currentIdleStartTime = Date.now() - idleSeconds * 1000;
      this._lastIdleCheckpointTime = null;
      this.wasIdleLastCheck = true;

      (async () => {
        try {
          await new Promise((r) => setTimeout(r, 300));
          if (global.urlCaptureManager?.trackCloseOnly) {
            global.urlCaptureManager.trackCloseOnly('idle');
          }
        } catch {}
      })();
    }

    if (!isIdle && this.wasIdleLastCheck) {
      // Input resumed. If the confirmation prompt is showing, resuming keyboard/
      // mouse activity counts as "I'm working" and the idle time is kept as
      // worked time (not logged as idle).
      if (this._idlePromptActive) {
        this._resolveIdlePrompt('working');
      } else {
        console.log('▶️ [IDLE-MONITOR] User became active');
        // A short idle period that ended on its own — persist it as idle.
        await this._flushIdleCheckpoint();
        this.currentIdleStartTime = null;
        this._lastIdleCheckpointTime = null;
        this.wasIdleLastCheck = false;
        this.idleThresholdExceeded = false;
        this._phantomIdleStartTime = null;
        const resumeStats = global.unifiedInputManager?.stats;
        this._lastSeenKeystrokes = resumeStats?.keystrokes || 0;
        this._lastSeenClicks = resumeStats?.mouseClicks || 0;
        this._lastSeenKeystrokesForIdle = resumeStats?.keystrokes || 0;
        this._lastSeenClicksForIdle = resumeStats?.mouseClicks || 0;
        this._markHighActivity();
        if (global.enhancedPermissionManager?.recoverScreenshotPermissions) {
          await global.enhancedPermissionManager.recoverScreenshotPermissions();
        }
      }
    }

    // Instead of silently auto-stopping when idle, surface a confirmation prompt.
    try {
      this._evaluateIdlePrompt(os, input);
    } catch (e) {
      console.log('❌ [IDLE-PROMPT] evaluate error:', e.message);
    }

    global.enhancedActivityManager?.updateIdleStatus(isIdle, idleSeconds);
  }

  /**
   * Lazily create the idle-confirmation popup manager.
   */
  _getIdlePromptManager() {
    if (!this._idlePromptManager) {
      const IdlePromptManager = require('../../idle-prompt-manager');
      this._idlePromptManager = new IdlePromptManager();
      global.idlePromptManager = this._idlePromptManager;
    }
    return this._idlePromptManager;
  }

  /**
   * Show the idle-confirmation prompt once the user has had no keyboard/mouse
   * input (mouse movement alone does not count) for the prompt threshold.
   */
  _evaluateIdlePrompt(osIdleSeconds = 0, _inputIdleSeconds = 0) {
    // Honor the existing config switch — if idle auto-stop is disabled, never
    // interrupt the user at all.
    if (this.config?.auto_stop_on_idle === false) return;
    if (this._idlePromptActive) return;
    if (!this.isTracking || !global.isTracking) return;

    // Only interrupt when the user has genuinely not touched the machine. OS idle
    // (powerMonitor.getSystemIdleTime) resets on ANY input — keyboard, clicks,
    // mouse movement, scroll, trackpad — so an actively-working user (even one who
    // is only reading and moving the mouse) is never prompted. We deliberately do
    // NOT use the keystroke/click-only idle here: that ignores mouse movement and
    // would falsely flag someone reviewing screenshots or reading as idle.
    const noInputSeconds = Number(osIdleSeconds) || 0;
    if (noInputSeconds * 1000 >= this.IDLE_PROMPT_THRESHOLD_MS) {
      this._showIdlePrompt(noInputSeconds);
    }
  }

  _showIdlePrompt(noInputSeconds) {
    if (this._idlePromptActive) return;
    this._idlePromptActive = true;
    this._idlePromptShown = false;
    this._idlePromptIdleStart =
      this.currentIdleStartTime || Date.now() - Math.round(noInputSeconds * 1000);

    const countdownSeconds = Math.round(this.IDLE_PROMPT_COUNTDOWN_MS / 1000);
    console.log(
      `🟡 [IDLE-PROMPT] No keyboard/mouse input for ~${Math.floor(noInputSeconds / 60)}m — showing "still working?" prompt (${countdownSeconds}s countdown)`,
    );

    let shown = false;
    try {
      this._getIdlePromptManager().show(countdownSeconds, (choice) =>
        this._resolveIdlePrompt(choice),
      );
      shown = true;
      this._idlePromptShown = true;
    } catch (e) {
      console.log('❌ [IDLE-PROMPT] Failed to show prompt:', e.message);
    }

    if (!shown) {
      // Do NOT silently cut 10 minutes or stop — user never saw the timer.
      // Clear the flag so the next idle-check can retry showing the prompt.
      console.warn(
        '⚠️ [IDLE-PROMPT] Prompt UI unavailable — continuing tracking without cut; will retry on next idle check',
      );
      this._idlePromptActive = false;
      this._idlePromptShown = false;
      this._idlePromptIdleStart = null;
      return;
    }

    if (this._idlePromptTimeout) clearTimeout(this._idlePromptTimeout);
    this._idlePromptTimeout = setTimeout(() => {
      this._idlePromptTimeout = null;
      if (this._idlePromptActive) {
        console.log(
          '⏱️ [IDLE-PROMPT] 1-min timer completed with no "I\'m working" — applying authorized 10m cut + stop',
        );
        this._resolveIdlePrompt('timeout');
      }
    }, this.IDLE_PROMPT_COUNTDOWN_MS);
  }

  _resolveIdlePrompt(choice) {
    if (!this._idlePromptActive) return;
    const promptWasShown = this._idlePromptShown;
    this._idlePromptActive = false;
    this._idlePromptShown = false;
    if (this._idlePromptTimeout) {
      clearTimeout(this._idlePromptTimeout);
      this._idlePromptTimeout = null;
    }
    try {
      this._idlePromptManager?.hide();
    } catch (_) {}

    if (choice === 'working') {
      console.log('✅ [IDLE-PROMPT] User is working — continuing tracking (no cut)');
      this._idlePromptIdleStart = null;
      this._discardCurrentIdleAndResume();
      return;
    }

    if (choice === 'break') {
      // User saw the prompt and chose to stop — end at now (no 10m cut).
      console.log('🛑 [IDLE-PROMPT] User on break — stopping tracking at now (no 10m cut)');
      this._idlePromptIdleStart = null;
      global.stopTracking?.('on_break', null, {});
      return;
    }

    // choice === 'timeout': ONLY authorized tracked-time deduction — and only if
    // the employee actually saw the alert and did not click "I'm working".
    if (!promptWasShown) {
      console.warn(
        '⚠️ [IDLE-PROMPT] Timeout without a shown prompt — continuing tracking (no cut, no stop)',
      );
      this._idlePromptIdleStart = null;
      this._discardCurrentIdleAndResume();
      return;
    }

    console.log('🛑 [IDLE-PROMPT] No "I\'m working" after shown alert — cutting 10m and stopping');
    this._stopForIdle('idle_timeout', { allowCut: true });
  }

  /**
   * User confirmed they are working: forget the pending idle period (so it is
   * counted as worked time and never logged as idle) and reset counters so the
   * prompt does not immediately re-fire.
   */
  _discardCurrentIdleAndResume() {
    if (this._idleSessionTimeout) {
      clearTimeout(this._idleSessionTimeout);
      this._idleSessionTimeout = null;
    }
    this.currentIdleStartTime = null;
    this._lastIdleCheckpointTime = null;
    this.wasIdleLastCheck = false;
    this.idleThresholdExceeded = false;
    this._phantomIdleStartTime = null;
    const stats = global.unifiedInputManager?.stats || {};
    this._lastSeenKeystrokes = stats.keystrokes || 0;
    this._lastSeenClicks = stats.mouseClicks || 0;
    this._lastSeenKeystrokesForIdle = stats.keystrokes || 0;
    this._lastSeenClicksForIdle = stats.mouseClicks || 0;
    this._markHighActivity();
  }

  /**
   * Stop tracking after the idle prompt's 1-min timer completed unanswered.
   * ONLY authorized deduction: when allowCut is true (prompt was shown and the
   * 1-min timer finished unanswered), end the session at now − 10 minutes and stop.
   * If allowCut is false, stop at now with no cut.
   * After tracking has stopped, nothing else may cut time further.
   *
   * @param {string} reason
   * @param {{ allowCut?: boolean }} [options]
   */
  _stopForIdle(reason, options = {}) {
    const allowCut = options.allowCut === true;
    this._idlePromptIdleStart = null;

    if (!allowCut) {
      console.log(
        `🛑 [IDLE-PROMPT] Stopping without time cut (${reason}) — prompt cut not authorized`,
      );
      global._idlePromptTimeCutSeconds = 0;
      global.stopTracking?.(reason, null, {});
      return;
    }

    const cutMs = this.IDLE_PROMPT_THRESHOLD_MS || 10 * 60 * 1000;
    let endMs = Date.now() - cutMs;

    // Never end before the current session started.
    const sessionStartRaw =
      global.trackingManager?.sessionStartTime ||
      global.currentSession?.start_time ||
      null;
    if (sessionStartRaw) {
      const sessionStartMs = new Date(sessionStartRaw).getTime();
      if (Number.isFinite(sessionStartMs) && endMs < sessionStartMs) {
        endMs = sessionStartMs;
      }
    }

    const endTimeOverride = new Date(endMs).toISOString();
    const timeCutSeconds = Math.round(cutMs / 1000);
    console.log(
      `⏱️ [IDLE-PROMPT] Alert unanswered — cutting ${Math.round(cutMs / 60000)}m and stopping → ${endTimeOverride} (${reason})`,
    );
    global._idlePromptTimeCutSeconds = timeCutSeconds;
    global.stopTracking?.(reason, null, {
      endTimeOverride,
      timeCutSeconds,
      authorizedIdleCut: true,
    });
  }

  /**
   * Persist idle time accumulated since the last checkpoint (or idle start).
   * Called while the user is still idle so Pulse shows idle without requiring input.
   */
  async _flushIdleCheckpoint(endTime = Date.now()) {
    if (!this.currentIdleStartTime || !this.wasIdleLastCheck) return;

    const startTime = this._lastIdleCheckpointTime ?? this.currentIdleStartTime;
    const duration = endTime - startTime;
    if (duration < this.MIN_IDLE_CHUNK_MS) return;

    await this.logIdlePeriod(startTime, endTime, duration);
    this._lastIdleCheckpointTime = endTime;
  }

  async logIdlePeriod(startTime, endTime, duration) {
    try {
      const durationSeconds = Math.round(duration / 1000);
      const durationMinutes = Math.floor(duration / 60000);
      console.log(`📊 [IDLE-LOG] Recording idle period: ${durationSeconds}s (${durationMinutes}m)`);
      
      const userId = this._resolveUserId();
      const timeLogId = this._resolveTimeLogId();

      if (!userId) {
        console.warn('⚠️ [IDLE-LOG] No valid tenant user_id, skipping idle log');
        return;
      }
      
      const organizationId =
        global.currentOrganizationId ||
        this.config?.organization_id ||
        global.config?.organization_id ||
        null;

      const idleData = {
        user_id: userId,
        time_log_id: timeLogId,
        organization_id: organizationId,
        idle_start: new Date(startTime).toISOString(),
        idle_end: new Date(endTime).toISOString(),
        duration_seconds: durationSeconds,
        duration_minutes: durationMinutes,
      };

      const { isBackendTimeLogsEnabled, insertIdleLog } = require('../utils/backend-time-logs');
      const cfg = this.config || global.config;

      const persistIdleLog = async (payload) => {
        if (isBackendTimeLogsEnabled(cfg)) {
          await insertIdleLog(payload, cfg);
          console.log('✅ [IDLE-LOG] Idle period saved via backend RDS');
          return;
        }

        const row = { ...payload };
        delete row.duration_minutes;
        delete row.organization_id;
        const { error } = await global.supabaseService.from('idle_logs').insert(row);
        if (error) throw new Error(error.message);
        console.log('✅ [IDLE-LOG] Idle period saved to idle_logs table');
      };

      try {
        await persistIdleLog(idleData);
      } catch (firstError) {
        const message = firstError?.message || String(firstError);
        if (idleData.time_log_id) {
          console.warn(
            '⚠️ [IDLE-LOG] Insert with time_log_id failed, retrying without FK:',
            message,
          );
          await persistIdleLog({ ...idleData, time_log_id: null });
        } else {
          throw firstError;
        }
      }
      
      global.safeSendToRenderer?.('idle-period-logged', {
        duration: durationSeconds,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ [IDLE-LOG] Error logging idle period:', error?.message || error);
      try {
        const userId = this._resolveUserId();
        if (userId) {
          this._queueIdleLog({
            user_id: userId,
            time_log_id: this._resolveTimeLogId(),
            organization_id:
              global.currentOrganizationId ||
              this.config?.organization_id ||
              global.config?.organization_id ||
              null,
            idle_start: new Date(startTime).toISOString(),
            idle_end: new Date(endTime).toISOString(),
            duration_seconds: Math.round(duration / 1000),
          });
        }
      } catch (queueError) {
        console.error('❌ [IDLE-LOG] Failed to queue idle log:', queueError?.message || queueError);
      }
    }
  }

  markSessionAsIdle() {
    if (this.idleThresholdExceeded) return;

    console.log('⏸️ [IDLE-SESSION] Marking session as idle due to inactivity');
    this.idleThresholdExceeded = true;

    // NOTE: Tracking is never stopped silently here. Idle now surfaces the
    // idle-confirmation prompt (see _evaluateIdlePrompt), which is the single
    // path that can stop tracking on idle — and only after the user chooses
    // "On break" or does not respond to the countdown. This method just marks
    // session state and notifies the UI.

    // Notify UI
    global.safeSendToRenderer?.('session-idle', {
      reason: 'idle_timeout',
      timestamp: new Date().toISOString()
    });
  }

  // === AUTO-STOP FUNCTIONALITY ===

  /**
   * Called by the screenshot module after each capture so the idle monitor can
   * track consecutive zero-activity screenshots as a fallback when
   * unifiedInputManager is unavailable.
   */
  onScreenshotActivity(activityPercent) {
    const pct = Number(activityPercent);
    if (!Number.isFinite(pct)) return;

    if (!global.isTracking) return;
    this.isTracking = true;

    if (pct >= this.LOW_ACTIVITY_PERCENT) {
      this._consecutiveZeroActivityShots = 0;
      this._markHighActivity();
    } else {
      if (pct === 0) {
        this._consecutiveZeroActivityShots++;
      } else {
        this._consecutiveZeroActivityShots = 0;
      }
    }

    this._evaluateIdleState()
      .then(() => {
        if (pct < this.LOW_ACTIVITY_PERCENT) {
          return this._ensureIdleLoggedFromScreenshot();
        }
        return undefined;
      })
      .catch((err) => {
        console.log('❌ [IDLE-MONITOR] Screenshot idle evaluate error:', err.message);
      });
  }

  checkAutoStopConditions() {
    try {
      const inputManagerAvailable = !!global.unifiedInputManager;
      const idleSeconds = global.unifiedInputManager?.getIdleTime() || 0;
      const idleMinutes = Math.floor(idleSeconds / 60);

      // Primary path: OS-level idle time exceeds threshold
      if (inputManagerAvailable && this.config.auto_stop_on_idle && idleMinutes >= this.config.idle_threshold_minutes) {
        console.log(`⏸️ [AUTO-STOP] Stopping: ${idleMinutes} min idle (threshold: ${this.config.idle_threshold_minutes} min)`);
        return {
          shouldStop: true,
          reason: 'idle_timeout',
          details: `Idle for ${idleMinutes} minutes`
        };
      }

      // Secondary path: phantom activity detection.
      // On Windows, getSystemIdleTime() resets to 0 on any mouse pixel movement
      // (desk vibration, optical jitter). Real work produces keystrokes and/or
      // clicks. If neither occurs for PHANTOM_IDLE_THRESHOLD_MS, the user left.
      if (inputManagerAvailable && this.config.auto_stop_on_idle) {
        const stats = global.unifiedInputManager?.stats;
        const currentKeys = stats?.keystrokes || 0;
        const currentClicks = stats?.mouseClicks || 0;
        const now = Date.now();

        if (currentKeys > this._lastSeenKeystrokes || currentClicks > this._lastSeenClicks) {
          this._phantomIdleStartTime = null;
          this._lastSeenKeystrokes = currentKeys;
          this._lastSeenClicks = currentClicks;
        } else {
          if (!this._phantomIdleStartTime) {
            this._phantomIdleStartTime = now;
          }
          const phantomIdleMs = now - this._phantomIdleStartTime;
          const phantomIdleMin = Math.floor(phantomIdleMs / 60000);

          if (phantomIdleMs >= this.PHANTOM_IDLE_THRESHOLD_MS) {
            console.log(`⏸️ [AUTO-STOP] Phantom idle: ${phantomIdleMin} min with zero keystrokes/clicks (mouse jitter only). Threshold: ${Math.floor(this.PHANTOM_IDLE_THRESHOLD_MS / 60000)} min`);
            this._phantomIdleStartTime = null;
            return {
              shouldStop: true,
              reason: 'phantom_idle',
              details: `No keystrokes or clicks for ${phantomIdleMin} minutes despite mouse movement`
            };
          } else if (phantomIdleMs > 120000 && phantomIdleMs % 60000 < this.IDLE_CHECK_INTERVAL) {
            console.log(`⚠️ [IDLE-MONITOR] Phantom activity: ${phantomIdleMin}m with no keys/clicks. Auto-stop in ${Math.floor((this.PHANTOM_IDLE_THRESHOLD_MS - phantomIdleMs) / 60000)}m`);
          }
        }
      }

      // Fallback path: input manager unavailable — count zero-activity screenshots
      const zeroShotAutoStopLimit = 20;
      if (!inputManagerAvailable && this.config.auto_stop_on_idle && this._consecutiveZeroActivityShots >= zeroShotAutoStopLimit) {
        console.log(`⏸️ [AUTO-STOP] Fallback: ${this._consecutiveZeroActivityShots} consecutive zero-activity shots (input manager unavailable)`);
        this._consecutiveZeroActivityShots = 0;
        return {
          shouldStop: true,
          reason: 'idle_timeout',
          details: `${zeroShotAutoStopLimit}+ consecutive zero-activity screenshots with no input manager`
        };
      }
      
      return { shouldStop: false };
    } catch (error) {
      console.log('❌ [AUTO-STOP] Error checking conditions:', error.message);
      return { shouldStop: false };
    }
  }

  // === UTILITY FUNCTIONS ===
  
  getIdleStatus() {
    const { effective: idleSeconds, os, input, lowActivity } = this._getEffectiveIdleSeconds();
    const isIdle = idleSeconds >= this.IDLE_THRESHOLD;
    return {
      isIdle,
      idleSeconds,
      osIdleSeconds: os,
      inputIdleSeconds: input,
      lowActivityIdleSeconds: lowActivity,
      idleMinutes: Math.floor(idleSeconds / 60),
      currentIdleStartTime: this.currentIdleStartTime,
      wasIdleLastCheck: this.wasIdleLastCheck
    };
  }

  resetIdleState() {
    this.currentIdleStartTime = null;
    this._lastIdleCheckpointTime = null;
    this._lastInputActivityAt = null;
    this._lastHighActivityAt = null;
    this._lastSeenKeystrokesForIdle = global.unifiedInputManager?.stats?.keystrokes || 0;
    this._lastSeenClicksForIdle = global.unifiedInputManager?.stats?.mouseClicks || 0;
    this.wasIdleLastCheck = false;
    this.idleThresholdExceeded = false;
    this._phantomIdleStartTime = null;
    this._lastSeenKeystrokes = global.unifiedInputManager?.stats?.keystrokes || 0;
    this._lastSeenClicks = global.unifiedInputManager?.stats?.mouseClicks || 0;
    console.log('🔄 [IDLE-MONITOR] Idle state reset');
  }

  async shutdown() {
    await this.stopIdleMonitoring();
    console.log('🧍 [ENHANCED-IDLE-MONITOR] Shutdown complete');
  }
}

module.exports = EnhancedIdleMonitor;