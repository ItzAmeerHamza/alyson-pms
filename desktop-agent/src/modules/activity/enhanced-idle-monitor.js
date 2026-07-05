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
    
    // Constants — idle detection starts after 1 minute of no input (configurable).
    const appSettings = this.config?.appSettings || global?.appSettings || {};
    const detectionSeconds =
      this.config?.idle_detection_threshold_seconds ??
      appSettings.idle_detection_threshold_seconds ??
      this.config?.diagnostic_idle_threshold_seconds ??
      60;
    const checkpointSeconds =
      this.config?.idle_checkpoint_interval_seconds ??
      appSettings.idle_checkpoint_interval_seconds ??
      60;

    this.IDLE_CHECK_INTERVAL = Math.max(15000, checkpointSeconds * 1000);
    this.MIN_IDLE_CHUNK_MS = 5000; // ignore sub-5s slices (clock jitter)
    this.IDLE_THRESHOLD = detectionSeconds;
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

  // === IDLE MONITORING FUNCTIONS ===
  
  startIdleMonitoring() {
    if (this.idleMonitoringInterval) {
      clearInterval(this.idleMonitoringInterval);
    }
    
    console.log('🧍 [IDLE-MONITOR] Starting idle monitoring...');
    console.log(`🧍 [IDLE-MONITOR] Idle detection: ${this.IDLE_THRESHOLD}s, checkpoint every ${this.IDLE_CHECK_INTERVAL / 1000}s`);
    console.log(`🧍 [IDLE-MONITOR] Auto-stop: ${this.config.idle_threshold_minutes} min OS idle, ${Math.floor(this.PHANTOM_IDLE_THRESHOLD_MS / 60000)} min phantom idle`);
    
    this._lastSeenKeystrokes = global.unifiedInputManager?.stats?.keystrokes || 0;
    this._lastSeenClicks = global.unifiedInputManager?.stats?.mouseClicks || 0;
    this._phantomIdleStartTime = null;
    
    // Check idle state every 30 seconds
    this.idleMonitoringInterval = setInterval(async () => {
      // CRITICAL FIX: Check both local and global tracking state
      if (!this.isTracking || !global.isTracking) return;
      
      try {
        const idleSeconds = global.unifiedInputManager?.getIdleTime() || 0;
        const isIdle = idleSeconds > this.IDLE_THRESHOLD;
        
        
        // Check if we've transitioned from active to idle
        if (isIdle && !this.wasIdleLastCheck) {
          console.log(`⏸️ [IDLE-MONITOR] User became idle (${idleSeconds}s)`);
          // Backdate to when OS idle actually started so the first chunk is accurate.
          this.currentIdleStartTime = Date.now() - idleSeconds * 1000;
          this._lastIdleCheckpointTime = null;
          this.wasIdleLastCheck = true;

          // NOTE: Do NOT reset betweenScreenshotsActivity here.
          // Those counters represent real accumulated input since the last screenshot.
          // If the user was active for 8 min then idle for 1 min, the screenshot should
          // still reflect the 8 min of real activity. The counters are only reset AFTER
          // a screenshot successfully captures and uploads them (onScreenshotSuccess).
          // Wiping them here caused active screenshots to show 0 activity ("Low").
          console.log('🧍 [IDLE-MONITOR] User went idle - activity counters preserved for next screenshot');
          
          // Emit a close-only URL event (idle) with a short debounce; offline-safe
          (async () => {
            try {
              await new Promise((r) => setTimeout(r, 300));
              try { console.log(JSON.stringify({ category: 'URL', event: 'CLOSE_ONLY', reason: 'idle', ts: new Date().toISOString() })); } catch {}
              // Track close reason in telemetry
              if (global.urlCaptureManager?.trackCloseOnly) {
                global.urlCaptureManager.trackCloseOnly('idle');
              }
              const supabase = global.supabaseService;
              const userId = global?.sessionManager?.getUserId?.();
              if (supabase && userId) {
                const { error } = await supabase
                  .from('url_logs')
                  .insert([{ user_id: userId, url: null, site_url: null, title: '', browser: 'unknown', timestamp: new Date().toISOString() }], { returning: 'minimal' });
                if (error) {
                  if (!global.offlineQueue) global.offlineQueue = { urlLogs: [] };
                  global.offlineQueue.urlLogs.push({ user_id: userId, url: null, site_url: null, title: '', browser: 'unknown', timestamp: new Date().toISOString() });
                }
              }
            } catch {}
          })();

          // Mark session as idle after threshold (store ref so it can be cleared)
          if (this._idleSessionTimeout) {
            clearTimeout(this._idleSessionTimeout);
          }
          this._idleSessionTimeout = setTimeout(() => {
            this._idleSessionTimeout = null;
            if (this.wasIdleLastCheck && this.currentIdleStartTime) {
              this.markSessionAsIdle();
            }
          }, this.IDLE_SESSION_THRESHOLD);

          // Persist idle immediately — do not wait for user to move/click again.
          await this._flushIdleCheckpoint();
        }

        // While still idle, flush a checkpoint every check interval.
        if (isIdle && this.wasIdleLastCheck) {
          await this._flushIdleCheckpoint();
        }
        
        // Check if we've transitioned from idle to active
        if (!isIdle && this.wasIdleLastCheck) {
          console.log('▶️ [IDLE-MONITOR] User became active');
          
          if (this._idleSessionTimeout) {
            clearTimeout(this._idleSessionTimeout);
            this._idleSessionTimeout = null;
          }
          
          await this._flushIdleCheckpoint();
          
          this.currentIdleStartTime = null;
          this._lastIdleCheckpointTime = null;
          this.wasIdleLastCheck = false;
          this.idleThresholdExceeded = false;
          this._phantomIdleStartTime = null;
          this._lastSeenKeystrokes = global.unifiedInputManager?.stats?.keystrokes || 0;
          this._lastSeenClicks = global.unifiedInputManager?.stats?.mouseClicks || 0;
          
          // Attempt to recover screenshot permissions after idle
          if (global.enhancedPermissionManager?.recoverScreenshotPermissions) {
            console.log('🔄 [IDLE-MONITOR] Attempting permission recovery after idle...');
            await global.enhancedPermissionManager.recoverScreenshotPermissions();
          }
        }

        // Enforce auto-stop threshold while tracking
        try {
          const phantomStart = this._phantomIdleStartTime;
          const autoStop = this.checkAutoStopConditions();
          if (autoStop && autoStop.shouldStop) {
            const idleStartTime = autoStop.reason === 'phantom_idle'
              ? phantomStart || this.currentIdleStartTime
              : this.currentIdleStartTime;
            const endTimeOverride = idleStartTime
              ? new Date(idleStartTime).toISOString()
              : null;
            global.stopTracking?.(autoStop.reason, null, { endTimeOverride });
            return;
          }
        } catch (_) {}
        
        // Update activity status
        global.enhancedActivityManager?.updateIdleStatus(isIdle, idleSeconds);
        
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
      
      const { normalizeTenantUserId } = require('../utils/tenant-user-id');
      const rawUserId = this.config?.user_id || global.currentUserId || global.config?.user_id || null;
      const userId = normalizeTenantUserId(rawUserId) || rawUserId;
      const timeLogId = global.currentTimeLogId || global.currentSession?.id || null;
      
      
      if (!userId) {
        console.warn('⚠️ [IDLE-LOG] No user_id available, skipping idle log');
        return;
      }
      
      // Use correct table name (idle_logs) and column names
      const idleData = {
        user_id: userId,
        time_log_id: timeLogId,
        idle_start: new Date(startTime).toISOString(),
        idle_end: new Date(endTime).toISOString(),
        duration_seconds: durationSeconds,
        duration_minutes: durationMinutes
      };
      
      // Save to database using correct table name
      const { isBackendTimeLogsEnabled, insertIdleLog } = require('../utils/backend-time-logs');
      if (isBackendTimeLogsEnabled(this.config || global.config)) {
        await insertIdleLog(idleData, this.config || global.config);
        console.log('✅ [IDLE-LOG] Idle period saved via backend RDS');
      } else {
        const { error } = await global.supabaseService
          .from('idle_logs')
          .insert(idleData);

        if (error) {
          console.error('❌ [IDLE-LOG] Database error:', error.message);
          return;
        }
        console.log('✅ [IDLE-LOG] Idle period saved to idle_logs table');
      }
      
      global.safeSendToRenderer?.('idle-period-logged', {
        duration: durationSeconds,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.log('❌ [IDLE-LOG] Error logging idle period:', error.message);
    }
  }

  markSessionAsIdle() {
    if (this.idleThresholdExceeded) return;
    
    console.log('⏸️ [IDLE-SESSION] Marking session as idle due to inactivity');
    this.idleThresholdExceeded = true;
    
    // NOTE: stopTracking is NOT called here. The checkAutoStopConditions() method
    // (which runs every 30s) is the single auto-stop path — it fires at
    // idle_threshold_minutes (default 10 min), well before this 20-min session
    // threshold. This method only marks the session state and notifies the UI.
    // If checkAutoStopConditions somehow didn't fire (e.g., unifiedInputManager is null),
    // this serves as the fallback auto-stop.
    if (this.config.auto_stop_on_idle && global.isTracking) {
      console.log('🛑 [IDLE-SESSION] Fallback auto-stop: checkAutoStopConditions did not fire in time');
      // FIX-8: Pass idle start time so end_time reflects when user went idle
      const endTimeOverride = this.currentIdleStartTime
        ? new Date(this.currentIdleStartTime).toISOString()
        : null;
      global.stopTracking?.('idle_timeout', null, { endTimeOverride });
    }
    
    // Notify UI
    global.safeSendToRenderer?.('session-idle', {
      reason: 'idle_timeout',
      timestamp: new Date().toISOString()
    });
    
    // Show notification
    global.showTrayNotification?.(
      'Session paused due to inactivity',
      'warning'
    );
  }

  // === AUTO-STOP FUNCTIONALITY ===

  /**
   * Called by the screenshot module after each capture so the idle monitor can
   * track consecutive zero-activity screenshots as a fallback when
   * unifiedInputManager is unavailable.
   */
  onScreenshotActivity(activityPercent) {
    if (global.unifiedInputManager) {
      // Primary path working — reset fallback counter
      this._consecutiveZeroActivityShots = 0;
      return;
    }
    if (activityPercent === 0) {
      this._consecutiveZeroActivityShots++;
    } else {
      this._consecutiveZeroActivityShots = 0;
    }
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
    const idleSeconds = global.unifiedInputManager?.getIdleTime() || 0;
    const isIdle = idleSeconds > this.IDLE_THRESHOLD;
    return {
      isIdle,
      idleSeconds,
      idleMinutes: Math.floor(idleSeconds / 60),
      currentIdleStartTime: this.currentIdleStartTime,
      wasIdleLastCheck: this.wasIdleLastCheck
    };
  }

  resetIdleState() {
    this.currentIdleStartTime = null;
    this._lastIdleCheckpointTime = null;
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