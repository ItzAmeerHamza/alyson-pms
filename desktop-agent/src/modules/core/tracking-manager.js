/**
 * TrackingManager - Centralized tracking state and stop/pause/resume operations
 * Extracted from main.js to improve modularity and maintainability
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const debugLogger = require('../utils/debug-logger');
const { getDeviceId } = require('../utils/device-id');
const { computeTodayTimeLogSeconds } = require('../utils/today-time-log-stats');
const { normalizeTenantUserId } = require('../utils/tenant-user-id');
const backendTimeLogs = require('../utils/backend-time-logs');

class TrackingManager extends EventEmitter {
  constructor(config, dependencies = {}) {
    super();
    this.config = config;
    this.cleanupRegistry = dependencies.cleanupRegistry;
    
    // Tracking state
    this.isTracking = false;
    this.isPaused = false;
    this.currentSession = null;
    this.currentTimeLogId = null;
    this.currentProjectId = null;
    this.sessionStartTime = null;
    
    // Dependencies (will be injected)
    this.wrappers = null;
    this.consolidationFixes = null;
    this.intervalManager = null;
    this.systemMonitor = null;
    this.mainWindow = null;
    
    // Screenshot tracking
    this.consecutiveScreenshotFailures = 0;
    this.lastSuccessfulScreenshotTime = 0;
    this.screenshotFailureStart = null;
    this._timeLogCheckpointInterval = null;
    this._localSessionArmed = false;
    this._offlineResumeHooksBound = false;
    this._wasOfflineForSync = false;
    
    console.log('✅ TrackingManager initialized');
  }

  /**
   * Initialize dependencies after construction
   */
  initialize(deps = {}) {
    this.wrappers = deps.wrappers;
    this.consolidationFixes = deps.consolidationFixes;
    this.intervalManager = deps.intervalManager;
    this.systemMonitor = deps.systemMonitor;
    this.mainWindow = deps.mainWindow;
    this.enhancedAppDetector = deps.enhancedAppDetector;  // 🔧 CRITICAL FIX: Store app detector reference

    // Resume syncing any hours queued while the device was offline
    try {
      this._rehydrateOfflineQueueFromLedger();
      // Always bind reconnect hooks so restores flush immediately.
      this.startOfflineSync();
      const pending = this.getOfflineQueue();
      if (pending.length > 0) {
        console.log(`📶 [TRACKING-MANAGER] Found ${pending.length} offline time log(s) — syncing`);
        void this.processOfflineQueue();
      }
    } catch (_) {}
    
    console.log('🔧 TrackingManager dependencies initialized', {
      hasEnhancedAppDetector: !!this.enhancedAppDetector
    });
  }

  /**
   * Start tracking session.
   *
   * Single-flight. The isTracking guard inside sits behind an await and
   * isTracking is not set until createTimeLog resolves, so two concurrent
   * callers both pass the guard and both INSERT. There are ~14 call sites
   * (renderer IPC, tray, resume-after-wake, session recovery, startup), and
   * more than one routinely fires for a single user action — producing bursts
   * of rows milliseconds apart. The extras are closed immediately with no
   * proof-of-life, which is where the sub-minute sessions come from.
   *
   * Sharing the in-flight promise makes a second caller join the first start
   * rather than open a second session.
   */
  async startTracking(projectId = null) {
    if (this._startInFlight) {
      console.log('⏳ [TRACKING-MANAGER] Start already in progress - joining it');
      return this._startInFlight;
    }

    this._startInFlight = (async () => {
      try {
        return await this._startTrackingInner(projectId);
      } finally {
        this._startInFlight = null;
      }
    })();

    return this._startInFlight;
  }

  async _startTrackingInner(projectId = null) {
try {
      const __startupTimestamp = Date.now();
      const __phase = (label) => {
        const elapsed = Date.now() - __startupTimestamp;
        console.log(`⏱️ [STARTUP-TIMING] ${label}: +${elapsed}ms`);
      };

      // Pacific day boundary before arming the session (lid-close overnight).
      try {
        if (typeof global.trayManager?.ensureWorkDayRollover === 'function') {
          global.trayManager.ensureWorkDayRollover();
        }
      } catch (_) { /* ignore */ }

      // DIAGNOSTIC: Event loop lag monitor during startup (first 60 seconds)
      // Stored on instance so stopTracking() can clear it early
      this._lagCheckCount = 0;
      if (this._lagInterval) clearInterval(this._lagInterval);
      this._lagInterval = setInterval(() => {
        const start = Date.now();
        setImmediate(() => {
          const lag = Date.now() - start;
          this._lagCheckCount++;
          if (lag > 50) {
            console.warn(`🐌 [EVENT-LOOP-LAG] ${lag}ms lag detected at startup +${Date.now() - __startupTimestamp}ms`);
          }
          if (this._lagCheckCount > 120) { // Stop after ~60 seconds
            clearInterval(this._lagInterval);
            this._lagInterval = null;
          }
        });
      }, 500);

      // Safety net: if user is starting tracking, the screen is clearly not locked
      global.isScreenLocked = false;
      // Clear the explicit stop flag so session recovery works again
      try {
        const { clearUserExplicitlyStopped } = require('../utils/session-recovery');
        clearUserExplicitlyStopped();
      } catch (_) {
        global.userExplicitlyStopped = false;
      }
      global._windowCloseHandled = false;
      global._stopEndTimeOverride = null;
      this._localSessionArmed = false;

      const priorStop = await this._waitForPriorStopToFinish(25000);

      debugLogger.init('tracking', 'Starting tracking session', {
        projectId: projectId,
        currentTracking: this.isTracking,
        currentPaused: this.isPaused,
        hasCurrentSession: !!this.currentSession,
        currentTimeLogId: this.currentTimeLogId
      });

      // SYNCHRONOUS HEALTH CHECK: Block timer start if permissions are missing.
      // Race with a short timeout — low internet DB probes must not stall Start.
      if (global.systemMonitor) {
        console.log('🔒 [TRACKING-MANAGER] Performing permission check before starting timer...');
        
          try {
            const healthCheck = await Promise.race([
              global.systemMonitor.performComprehensiveHealthCheck(),
              new Promise((resolve) =>
                setTimeout(
                  () =>
                    resolve({
                      canStartTimer: true,
                      overall: 'degraded',
                      issues: [],
                      timedOut: true,
                    }),
                  3000,
                ),
              ),
            ]);
            if (healthCheck?.timedOut) {
              console.warn(
                '⚠️ [TRACKING-MANAGER] Health check timed out (3s) — continuing Start (offline-capable)',
              );
            }
            
            if (!healthCheck.canStartTimer) {
            console.error('🚫 [TRACKING-MANAGER] Cannot start timer - permission issues detected:', {
                overall: healthCheck.overall,
                issues: healthCheck.issues,
              canStartTimer: healthCheck.canStartTimer,
              permissions: healthCheck.checks?.permissions?.details
              });
              
            // Notify UI about permission issues
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('permission-required', {
                  issues: healthCheck.issues,
                permissions: healthCheck.checks?.permissions?.details,
                message: 'Please grant required permissions before starting timer'
              });
            }
            
            // BLOCK TIMER START - Return error instead of continuing
            return {
              success: false,
              error: 'permissions_required',
              message: 'Please grant required permissions before starting timer',
              details: healthCheck.issues,
              permissions: healthCheck.checks?.permissions?.details
            };
          }
          
          __phase('Health check passed');
          console.log('✅ [TRACKING-MANAGER] Permission check passed - proceeding with timer start');
          
          // Start permission monitoring for runtime revocation detection
          if (global.systemMonitor.startPermissionMonitoring) {
            global.systemMonitor.startPermissionMonitoring();
            }
          
          } catch (error) {
          // PAYROLL CRITICAL: health-check exceptions (incl. slow DB probes) must not
          // block Start — permissions are the only hard gate, handled above.
          console.warn(
            '⚠️ [TRACKING-MANAGER] Health check errored — continuing Start (offline-capable):',
            error?.message || error,
          );
          }
      } else {
        console.warn('⚠️ [TRACKING-MANAGER] System monitor not available - skipping health check');
      }

      if (this.isTracking && !this.isPaused) {
        debugLogger.guard('tracking', 'Tracking already active - early exit', {
          isTracking: this.isTracking,
          isPaused: this.isPaused,
          timeLogId: this.currentTimeLogId
        });
        console.log('⚠️ [TRACKING-MANAGER] Tracking already active');
        return {
          success: true,
          timeLogId: this.currentTimeLogId,
          projectId: this.currentProjectId,
          startTime: this.sessionStartTime,
          isTracking: true
        };
      }

      // If paused, resume instead
      if (this.isTracking && this.isPaused) {
        debugLogger.guard('tracking', 'Tracking paused - resuming instead', {
          isTracking: this.isTracking,
          isPaused: this.isPaused,
          timeLogId: this.currentTimeLogId
        });
        await this.resumeTracking?.();
        return {
          success: true,
          resumed: true,
          timeLogId: this.currentTimeLogId,
          projectId: this.currentProjectId,
          startTime: this.sessionStartTime,
          isTracking: true
        };
      }

      const useBackendTimeLogs = backendTimeLogs.isBackendTimeLogsEnabled(this.config);
      if (!useBackendTimeLogs) {
        // PAYROLL: the API is the only store there is. Running a clock we can
        // never persist would show the employee time that is not being recorded.
        debugLogger.guard('tracking', 'Backend time logs API not configured - cannot start tracking', {
          useBackendTimeLogs,
        });
        throw new Error('Backend time logs API not configured');
      }

      // Take the first value that is actually a tenant id, not simply the first
      // value present. config.user_id can still hold a legacy Supabase UUID from
      // before this device migrated, and the backend rejects those — so preferring
      // it blindly broke Start until session restore overwrote it.
      const effectiveUserId =
        normalizeTenantUserId(this.config.user_id) ||
        normalizeTenantUserId(global.currentUserId);
      if (!effectiveUserId) {
        throw new Error('User not authenticated');
      }

      // Close any existing unclosed sessions for THIS DEVICE before creating a new one.
      // Uses device-scoped close so other devices' sessions are not affected.
      const deviceId = getDeviceId();
      console.log(`🔒 [TRACKING-MANAGER] Pre-insert inspect for user ${effectiveUserId}, device ${deviceId}`);
      const localCheckpoint = this._readSessionCheckpoint?.() || null;
      let recoveredSession = null;
      // Already known offline: skip the inspect + cleanup preamble entirely.
      // Re-discovering the outage here cost 5s + 5s before Start even tried to
      // create the session. Orphans are reconciled on the next online Start.
      // Skipping the cleanup preamble when offline keeps Start fast, but it is
      // ALSO the exact condition under which the previous stop fails to finish.
      // Skipping it then is what leaves two sessions open at once, so an
      // unfinished stop overrides the offline shortcut.
      const offlineHint =
        useBackendTimeLogs && backendTimeLogs.isLikelyOffline() && !priorStop?.stillStopping;
      if (offlineHint) {
        console.log('📴 [TRACKING-MANAGER] Offline — arming local session immediately');
      } else if (priorStop?.stillStopping) {
        console.warn('🔒 [TRACKING-MANAGER] Prior stop unfinished — running close-before-start anyway');
      }
      if (useBackendTimeLogs && !offlineHint) {
        try {
          // Fail fast on low internet — Start must not hang waiting for inspect.
          const inspect = await backendTimeLogs.reconcileOpenSessions(
            effectiveUserId,
            deviceId,
            this.config,
            {
              prefer_recover: true,
              client_last_seen_at: localCheckpoint?.checkpointAt || null,
              freshness_minutes: 15,
              timeoutMs: 5000,
            },
          );
          if (inspect?.recovered?.id) {
            recoveredSession = inspect.recovered;
            try {
              const { workDateKey } = require('../utils/work-timezone');
              const startKey = workDateKey(new Date(recoveredSession.start_time));
              const todayKey = workDateKey();
              if (startKey && todayKey && startKey !== todayKey) {
                console.warn(
                  `🚩 [TRACKING-MANAGER] Recovered session started ${startKey}, today is ${todayKey} — closing at last heartbeat instead of continuing`,
                );
                const {
                  closeOpenSessionsAfterExplicitStop,
                } = require('../utils/session-recovery');
                await closeOpenSessionsAfterExplicitStop({
                  userId: effectiveUserId,
                  deviceId,
                  // suggested_end_at belongs to THIS recovered row. Naming it
                  // keeps that end off any other open row on the device.
                  timeLogId: recoveredSession.id,
                  end_time:
                    recoveredSession.suggested_end_at ||
                    recoveredSession.last_heartbeat_at ||
                    localCheckpoint?.checkpointAt ||
                    undefined,
                  config: this.config,
                  timeoutMs: 5000,
                });
                recoveredSession = null;
              }
            } catch (dayErr) {
              console.warn(
                '⚠️ [TRACKING-MANAGER] Work-day recover check failed:',
                dayErr?.message || dayErr,
              );
            }
            if (recoveredSession) {
              console.log(
                `♻️ [TRACKING-MANAGER] Recovered fresh open session ${recoveredSession.id} (ageSec=${recoveredSession.age_seconds})`,
              );
            }
          } else if (inspect?.flagged_count > 0) {
            const flagged = inspect.flagged || [];
            console.warn(
              `🚩 [TRACKING-MANAGER] Flagged ${inspect.flagged_count} stale open session(s) — closing before Start`,
            );
            // Close orphans before creating a new session (prefer checkpoint / suggested end).
            try {
              const {
                closeOpenSessionsAfterExplicitStop,
              } = require('../utils/session-recovery');
              const suggested =
                flagged[0]?.suggested_end_at ||
                flagged[0]?.last_heartbeat_at ||
                flagged[0]?.last_evidence_at ||
                flagged[0]?.client_checkpoint_at ||
                localCheckpoint?.checkpointAt ||
                null;
              await closeOpenSessionsAfterExplicitStop({
                userId: effectiveUserId,
                deviceId,
                end_time: suggested || undefined,
                config: this.config,
                timeoutMs: 5000,
              });
              // Those rows are finished, so drop every local handle to them:
              // the id, the checkpoint interval and the checkpoint file. Left
              // in place, the next write still addresses a dead session and
              // stamps it with the new session's clock.
              const {
                clearLocalTrackingAfterStaleClose,
              } = require('../utils/session-recovery');
              clearLocalTrackingAfterStaleClose();
              this._clearSessionCheckpoint?.();
            } catch (closeErr) {
              console.warn(
                '⚠️ [TRACKING-MANAGER] Orphan close before Start failed:',
                closeErr?.message || closeErr,
              );
            }
          }
        } catch (recErr) {
          console.warn('⚠️ [TRACKING-MANAGER] inspect_open_sessions failed:', recErr?.message || recErr);
        }
      } else {
        try {
          await Promise.race([
            this._forceCloseActiveSessions(effectiveUserId, deviceId),
            new Promise((resolve) => setTimeout(resolve, 5000)),
          ]);
        } catch (closeErr) {
          console.warn(
            '⚠️ [TRACKING-MANAGER] Pre-start force-close failed (non-fatal):',
            closeErr?.message || closeErr,
          );
        }
      }

      if (!offlineHint && global.sessionManager && global.sessionManager.closeExistingSessionsBeforeStart) {
        try {
          const cleanupResult = await Promise.race([
            global.sessionManager.closeExistingSessionsBeforeStart(),
            new Promise((resolve) =>
              setTimeout(() => resolve({ success: false, timedOut: true }), 5000),
            ),
          ]);
          if (cleanupResult?.timedOut) {
            console.warn(
              '⚠️ [TRACKING-MANAGER] Session cleanup timed out (5s) — continuing offline Start',
            );
          } else if (cleanupResult && !cleanupResult.success) {
            console.warn('⚠️ [TRACKING-MANAGER] SessionManager cleanup also reported failure (non-critical, RPC already ran)');
          }
        } catch (cleanupErr) {
          console.warn(
            '⚠️ [TRACKING-MANAGER] Session cleanup error (non-fatal):',
            cleanupErr?.message || cleanupErr,
          );
        }
      }

      const finalProjectId = projectId || global.currentProjectId || this.config.project_id || null;
      const startTimeIso = recoveredSession?.start_time || new Date().toISOString();

      const timeLogData = {
        user_id: effectiveUserId,
        project_id: finalProjectId,
        start_time: startTimeIso,
        is_manual: false,
        status: 'active',
        device_id: deviceId
      };

      console.log('💾 [TRACKING-MANAGER] T4: Before time_logs insert:', new Date().toISOString());
      console.time('T4-T5: time_logs insert');

      let timeLog, error;

      if (recoveredSession?.id) {
        timeLog = {
          id: recoveredSession.id,
          user_id: recoveredSession.user_id || effectiveUserId,
          project_id: recoveredSession.project_id || finalProjectId,
          start_time: recoveredSession.start_time || startTimeIso,
          status: 'active',
          device_id: deviceId,
          recovered: true,
        };
        error = null;
        console.log('✅ [TRACKING-MANAGER] Resuming recovered time log:', timeLog.id);
      } else {
        // Stable id chosen before the network call so a timeout-after-commit
        // + offline retry cannot insert a second row.
        const newId = crypto.randomUUID();
        timeLogData.id = newId;
        try {
          const orgId =
            global.currentOrganizationId ||
            this.config.organization_id ||
            null;
          // Orphans are flagged / confirmed-closed above — never close at NOW from heartbeat.
          timeLog = await backendTimeLogs.createTimeLog(
            {
              id: newId,
              ...timeLogData,
              organization_id: orgId,
            },
            this.config,
            // Known-offline: fail fast instead of making the employee wait 8s
            // to be told what we already knew. The row is queued either way.
            { timeoutMs: offlineHint ? 2000 : 8000 },
          );
          error = null;
          console.log('✅ [TRACKING-MANAGER] RDS time log created:', timeLog.id);
        } catch (e) {
          error = e;
          timeLog = null;
          console.warn(
            `⚠️ [TRACKING-MANAGER] create_time_log offline — queued, will sync: ${e.message || e}`,
          );
        }
      }

      console.timeEnd('T4-T5: time_logs insert');
      console.log('💾 [TRACKING-MANAGER] T5: After time_logs insert:', new Date().toISOString());

      if (error) {
        console.error('❌ [TRACKING-MANAGER] Database error creating time log:', error);

        // PAYROLL CRITICAL: network/API failures must never prevent tracking.
        // Only hard auth/config errors fail the start — everything else starts offline
        // and syncs when connectivity returns.
        // IMPORTANT: must fall through to the normal success path so global.isTracking is set.
        const errMsg = String(error?.message || error || '').toLowerCase();
        const isHardAuthError =
          errMsg.includes('user not authenticated') ||
          errMsg.includes('invalid user_id') ||
          errMsg.includes('missing internal_api_key') ||
          errMsg.includes('not authenticated') ||
          error?.status === 401 ||
          error?.status === 403;

        if (isHardAuthError) {
          throw error;
        }

        console.log('📶 [TRACKING-MANAGER] Create failed (network/backend) — starting offline with temp ID (will sync later)');
        timeLog = this._queueOfflineTimeLogCreate(timeLogData);
        error = null;
        console.log('✅ [TRACKING-MANAGER] Offline time log ready:', timeLog.id);
      }

      // Update internal state
      // Once armed, outer catch must NOT report Start failure / undo tracking —
      // that caused Start→auto-Stop on low internet when a later subsystem threw.
      this.isTracking = true;
      this.isPaused = false;
      this.currentTimeLogId = timeLog.id;
      this.currentProjectId = finalProjectId;
      this.sessionStartTime = startTimeIso;
      this.currentSession = {
        id: timeLog.id,
        time_log_id: timeLog.id,
        user_id: effectiveUserId,
        project_id: finalProjectId,
        start_time: startTimeIso,
        status: 'active',
        isActive: true,
        ...(timeLog._offline ? { _offline: true } : {})
      };
      this._localSessionArmed = true;

      try {
        require('../utils/session-audit').sessionCreated({
          timeLogId: this.currentTimeLogId,
          startTime: startTimeIso,
          trigger: priorStop?.stillStopping ? 'start_during_stop' : 'start',
          // Recorded even when null: its absence over time is the evidence that
          // overlapping sessions have actually stopped happening.
          priorOpenId: recoveredSession?.id || null,
          queued: !!timeLog?._offline,
        });
      } catch (_) { /* audit is best-effort */ }

      __phase('DB insert + state setup done');
      // Propagate to global for legacy guards
      global.isTracking = true;
      global.isPaused = false;
      // FREEZE FIX: Clear shutdown flag so detection/polling resume immediately
      global.isShuttingDown = false;
      global.currentTimeLogId = this.currentTimeLogId;
      global.currentProjectId = this.currentProjectId;
      global.currentUserId = effectiveUserId;
      global.sessionStartTime = this.sessionStartTime;
      global.currentSession = this.currentSession;
      // Ensure downstream detectors pick up authenticated user id
      try {
        if (global.enhancedAppDetector) {
          global.enhancedAppDetector.config = global.enhancedAppDetector.config || {};
          global.enhancedAppDetector.config.user_id = effectiveUserId;
          global.enhancedAppDetector.config.userId = effectiveUserId;
        }
      } catch {}
      
      console.log('🎯 [TRACKING-MANAGER] Global state updated:', {
        isTracking: global.isTracking,
        currentUserId: global.currentUserId,
        currentTimeLogId: global.currentTimeLogId,
        currentProjectId: global.currentProjectId
      });

      // Update tray icon IMMEDIATELY so the user sees green without waiting
      // for subsystem init (screenshot, input, app detection can take 10+ seconds)
      if (global.trayManager) {
        const projectName = this.currentSession?.projectName || null;
        // PAYROLL CRITICAL: never block Start on today-stats network fetch.
        // Use last-known local floor immediately; refresh base in background.
        let completedTodayBeforeSessionSeconds = Math.max(
          0,
          Math.floor(Number(global._trayTodayHighWaterSeconds) || 0),
          Math.floor(Number(global._rendererTodayFloorSeconds) || 0),
          Math.floor(Number(global._lastGoodTodayStats?.completedTodayBeforeCurrentSessionSeconds) || 0),
          Math.floor(Number(global._lastGoodTodayStats?.totalTime) || 0),
          Math.floor(Number(global._lastTodayTotalAtStop) || 0),
        );
        global.trayManager.updateState(true, false, {
          projectName,
          projectId: this.currentProjectId,
          startTime: this.sessionStartTime,
          completedTodayBeforeSessionSeconds,
        });
        console.log('✅ [TRAY] Icon updated immediately after state set');
        // Background reconcile — must not affect isTracking / Start success.
        setTimeout(() => {
          void (async () => {
            try {
              if (!global.isTracking) return;
              const { isBackendTimeLogsEnabled } = require('../utils/backend-time-logs');
              if (!(effectiveUserId && timeLog?.id && isBackendTimeLogsEnabled())) {
                return;
              }
              const agg = await Promise.race([
                computeTodayTimeLogSeconds(effectiveUserId, timeLog.id, true),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('today stats timeout')), 8000),
                ),
              ]);
              const nextBase = this._resolveTodayBaseSeconds(agg.completedClosedSeconds);
              if (global.trayManager && global.isTracking && nextBase > 0) {
                const prev = Math.max(
                  0,
                  Math.floor(Number(global.trayManager._cumulativeBaseSeconds) || 0),
                );
                global.trayManager._cumulativeBaseSeconds = Math.max(prev, nextBase);
              }
            } catch (aggErr) {
              console.warn(
                '⚠️ [TRACKING-MANAGER] Background today base refresh failed:',
                aggErr?.message || aggErr,
              );
            }
          })();
        }, 0);
      }

      // Notify renderer immediately — Start must succeed without waiting on
      // screenshots/input/app detection (those can be slow on weak machines/networks).
      try {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('tracking-started', this.currentSession);
        }
      } catch {}

      this._startTimeLogCheckpoint();

      // Idle is per-session — do not carry the previous session's total forward.
      try {
        global.enhancedIdleMonitor?.resetSessionIdleSeconds?.();
      } catch (_) { /* idle monitor optional */ }

      const startResult = {
        success: true,
        timeLogId: this.currentTimeLogId,
        projectId: this.currentProjectId,
        startTime: this.sessionStartTime,
        isTracking: true,
        offline: !!(this.currentSession?._offline || String(this.currentTimeLogId || '').startsWith('temp-')),
      };

      // Fire-and-forget subsystem bring-up (never blocks Start IPC / UI confirm).
      setImmediate(() => {
        void this._bringUpTrackingSubsystems(effectiveUserId).catch((err) => {
          console.warn(
            '⚠️ [TRACKING-MANAGER] Background subsystem bring-up error (tracking still active):',
            err?.message || err,
          );
        });
      });

      __phase('Local session armed — returning Start success');
      console.log(
        `✅ [TRACKING-MANAGER] Tracking started with time log ID: ${this.currentTimeLogId}` +
          (startResult.offline ? ' (offline — will sync)' : ''),
      );
      try {
        global.notTrackingReminderManager?.onTrackingStarted?.();
      } catch (_) { /* ignore */ }
      return startResult;
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Failed to start tracking:', error);
      // If local session already armed, keep tracking and report success so the
      // renderer does not roll back optimistic Start on a late subsystem error.
      if (this._localSessionArmed && this.currentTimeLogId && (this.isTracking || global.isTracking)) {
        console.warn(
          '⚠️ [TRACKING-MANAGER] Post-arm error ignored — tracking stays active (will sync later):',
          error?.message || error,
        );
        global.isTracking = true;
        this.isTracking = true;
        return {
          success: true,
          timeLogId: this.currentTimeLogId,
          projectId: this.currentProjectId,
          startTime: this.sessionStartTime,
          isTracking: true,
          offline: true,
          warning: error?.message || String(error),
        };
      }
      this.isTracking = false;
      this.isPaused = false;
      this._localSessionArmed = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Bring up capture/sync subsystems after Start has already succeeded locally.
   * Must never stop tracking on failure.
   */
  async _bringUpTrackingSubsystems(effectiveUserId) {
    if (!this.isTracking && !global.isTracking) return;

      // Update URL manager with current time log ID and start URL capture (idempotent inside manager)
      if (global.browserUrlManager && global.browserUrlManager.setCurrentTimeLogId) {
        global.browserUrlManager.setCurrentTimeLogId(this.currentTimeLogId);
        try {
          if (typeof global.browserUrlManager.startUrlCapture === 'function') {
            global.browserUrlManager.startUrlCapture();
          }
        } catch {}
      }

      // FREEZE FIX: Delay URL capture start by 3s to avoid simultaneous PowerShell
      // spawns with app detection on Windows. Both spawn powershell.exe and on
      // low-memory machines this causes resource contention and UI freezing.
      if (global.urlCaptureManager) {
        try {
          setTimeout(() => {
            try {
              if (global.isTracking) {
                global.urlCaptureManager.start();
                console.log('🌐 [URL] UrlCaptureManager started (staggered 3s after timer start)');
              }
            } catch (e) {
              console.warn('⚠️ [URL] Deferred start failed:', e?.message);
            }
          }, 3000);
          console.log('🌐 [URL] UrlCaptureManager scheduled to start in 3s (staggered)');
          
          // Add probe to confirm first URL event
          try { 
            global.urlCaptureManager.once('url', (evt) => { 
              console.log('🌐 [URL] FIRST_EVENT after timer start', { 
                url: evt?.url, 
                source: evt?.source, 
                ts: evt?.ts 
              }); 
            }); 
          } catch {}
        } catch (e) {
          console.warn('⚠️ [URL] Failed to start UrlCaptureManager:', e?.message || e);
        }
      }

      // Ensure activity systems receive tracking state so UI activity updates work
      try {
        if (global.enhancedActivityManager) {
          global.enhancedActivityManager.setTrackingState(true);
          
          // CRITICAL FIX: Reset activity counters when starting to ensure fresh start
          if (global.enhancedActivityManager.resetActivityForScreenshot) {
            global.enhancedActivityManager.resetActivityForScreenshot();
            console.log('✅ Activity counters reset on start (ensures fresh tracking session)');
          }
        }
        
        global.enhancedSyncManager?.setTrackingState(true);
        global.liveMonitoringManager?.setTrackingState(true);

        if (global.enhancedIdleMonitor) {
          global.enhancedIdleMonitor.setTrackingState(true);
          if (!global.enhancedIdleMonitor.idleMonitoringInterval) {
            global.enhancedIdleMonitor.startIdleMonitoring();
          }
        }
      } catch {}

      // Inform screenshot manager and consolidated systems
      console.log('🔍 [TRACKING-DEBUG] Checking for enhancedScreenshotManager:', {
        exists: !!global.enhancedScreenshotManager,
        hasUpdateMethod: !!global.enhancedScreenshotManager?.updateTrackingState,
        sessionId: this.currentSession?.id
      });
      
      debugLogger.init('screenshot', 'Initializing screenshot system', {
        hasEnhancedScreenshotManager: !!global.enhancedScreenshotManager,
        hasUpdateMethod: !!global.enhancedScreenshotManager?.updateTrackingState,
        sessionId: this.currentSession?.id,
        timeLogId: this.currentTimeLogId
      });
      
      if (global.enhancedScreenshotManager?.updateTrackingState) {
        console.log('✅ [TRACKING-DEBUG] Calling updateTrackingState...');
        global.enhancedScreenshotManager.updateTrackingState(true, this.currentSession);
        
        // CRITICAL FIX: Force start screenshot capture immediately
        setTimeout(async () => {
          try {
            console.log('🔧 [SCREENSHOT-FIX] Forcing screenshot capture start...');

            try {
              const { refreshWorkspaceSettings } = require('../utils/workspace-settings');
              await refreshWorkspaceSettings(global.config, { restartCapture: false });
            } catch (settingsErr) {
              console.warn('⚠️ [SCREENSHOT-FIX] Workspace settings refresh failed:', settingsErr?.message || settingsErr);
            }

            // CRITICAL: Ensure nextScreenshotTime is always set
            if (!global.nextScreenshotTime && global.enhancedScreenshotManager?.getConfiguredScreenshotIntervalMs) {
              const interval = global.enhancedScreenshotManager.getConfiguredScreenshotIntervalMs();
              global.nextScreenshotTime = new Date(Date.now() + interval);
              console.log(`📸 [SCREENSHOT-FIX] Set nextScreenshotTime to ${global.nextScreenshotTime.toLocaleTimeString()}`);
            }
            
            global.enhancedScreenshotManager.startScreenshotCapture();
            global.enhancedScreenshotManager.startScreenshotTimerUpdates();
            // REMOVED: startMandatoryScreenshotMonitoring() - window-based 3-per-10-min is single source
            console.log('✅ [SCREENSHOT-FIX] Screenshot systems started');
          } catch (e) {
            console.error('❌ [SCREENSHOT-FIX] Failed to start screenshot systems:', e.message);
          }
        }, 1000);
        
        // Diagnostic-only early triggers to seed first screenshot
        // Enable by setting DIAG_FORCE_FIRST_SCREENSHOT=true
        try {
          if (process.env.DIAG_FORCE_FIRST_SCREENSHOT === 'true') {
            setTimeout(() => {
              try { global.enhancedScreenshotManager?.captureScreenshot(false); } catch {}
            }, 5000);
          }
          if (process.env.DIAG_FORCE_FIRST_SCREENSHOT === 'true') {
            setTimeout(() => {
              try {
                if (global.enhancedScreenshotManager?.startAutomaticCapture) {
                  console.log('🧪 [TRACKING-DEBUG] DIAG forcing startAutomaticCapture after tracking start');
                  global.enhancedScreenshotManager.startAutomaticCapture();
                }
              } catch (e) {
                console.log('⚠️ [TRACKING-DEBUG] startAutomaticCapture failed:', e.message);
              }
            }, 2000);
          }
          // Extra: poll until timers arm and permission logged; do not re-arm if timers exist
          setTimeout(() => {
            try {
              // CRITICAL FIX: Only re-arm if still tracking (user may have stopped in the 8s window)
              if (!global.isTracking || !this.isTracking) {
                console.log('🛠️ [TRACKING-DEBUG] Skipping screenshot re-arm — tracking already stopped');
                return;
              }
              global.enhancedScreenshotManager?.debugScreenshotTimer();
              const mgr = global.enhancedScreenshotManager;
              const timersActive =
                (mgr?.windowTimers?.length || 0) > 0 ||
                !!mgr?._windowInterval ||
                !!mgr?.screenshotInterval ||
                !!mgr?.nextScreenshotTime;
              if (!timersActive) {
                console.log('🛠️ [TRACKING-DEBUG] No screenshot timers after start — calling startScreenshotCapture once');
                global.enhancedScreenshotManager.startScreenshotCapture();
              }
            } catch {}
          }, 8000);
        } catch {}
      } else {
        debugLogger.guard('screenshot', 'Enhanced screenshot manager not available', {
          hasEnhancedScreenshotManager: !!global.enhancedScreenshotManager,
          hasUpdateMethod: !!global.enhancedScreenshotManager?.updateTrackingState
        });
        console.error('❌ [TRACKING-DEBUG] Enhanced screenshot manager not available!');
      }
      
      debugLogger.init('input', 'Initializing input tracking system', {
        hasWrappers: !!this.wrappers,
        hasStartConsolidatedTracking: !!this.wrappers?.startConsolidatedTracking,
        sessionId: this.currentSession?.id
      });
      
      if (this.wrappers?.startConsolidatedTracking) {
        try {
          this.wrappers.startConsolidatedTracking();
        } catch (e) {
          debugLogger.guard('input', 'Consolidated tracking start failed', {
            error: e.message,
            hasWrappers: !!this.wrappers
          });
          console.log('⚠️ [TRACKING-MANAGER] startConsolidatedTracking failed:', e.message);
        }
      } else {
        debugLogger.guard('input', 'Consolidated tracking wrappers not available', {
          hasWrappers: !!this.wrappers,
          hasStartMethod: !!this.wrappers?.startConsolidatedTracking
        });
      }

      // FREEZE FIX: Start input detection NON-BLOCKING (fire-and-forget).
      // Previously this was `await`-ed which could block for 30+ seconds on Windows
      // because findWorkingPython() checks 40+ paths sequentially with 5s timeouts.
      // Input detection is not needed instantly - it can start in the background.
      try {
        const inputStartTime = Date.now();
        const inputPromise = (async () => {
          try {
            if (global.startInputDetection) {
              console.log('🎮 [TRACKING-MANAGER] Starting input detection (non-blocking)...');
              await global.startInputDetection();
              console.log(`✅ [TRACKING-MANAGER] Input detection started in ${Date.now() - inputStartTime}ms`);
            } else if (global.globalInputManager) {
              console.log('🎮 [TRACKING-MANAGER] Starting input detection directly (non-blocking)...');
              if (!global.globalInputManager.isActive) {
                await global.globalInputManager.startTracking();
              }
              console.log(`✅ [TRACKING-MANAGER] Input detection started in ${Date.now() - inputStartTime}ms`);
            } else {
              console.log('⚠️ [TRACKING-MANAGER] No input detection available, attempting initialization...');
              try {
                const UnifiedInputManager = require('../activity/input-manager');
                const inputManager = new UnifiedInputManager();
                const { powerMonitor, screen } = require('electron');
                await inputManager.initialize({ powerMonitor, screen });
                await inputManager.startTracking();
                global.globalInputManager = inputManager;
                console.log(`✅ [TRACKING-MANAGER] Input detection initialized from scratch in ${Date.now() - inputStartTime}ms`);
              } catch (initErr) {
                console.error('❌ [TRACKING-MANAGER] Failed to initialize input detection from scratch:', initErr.message);
              }
            }
          } catch (error) {
            console.error(`❌ [TRACKING-MANAGER] Input detection failed after ${Date.now() - inputStartTime}ms:`, error.message);
          }
        })();
        // Don't await - let it run in background
        inputPromise.catch(e => console.error('❌ [INPUT] Background start error:', e?.message));
      } catch (error) {
        console.error('❌ [TRACKING-MANAGER] Failed to start input detection:', error);
      }

      // Update system monitor
      if (this.systemMonitor?.updateTrackingState) {
        this.systemMonitor.updateTrackingState({
          isTracking: true,
          isPaused: false,
          currentTimeLogId: this.currentTimeLogId,
          currentProjectId: this.currentProjectId,
          sessionStartTime: this.sessionStartTime
        });
      }

      // FREEZE FIX: Stagger app detection start by 1s.
      // Setting tracking state immediately but deferring the interval start
      // to avoid simultaneous PowerShell spawning with other subsystems.
      try {
        const appDetector = this.enhancedAppDetector || global.enhancedAppDetector;
        if (appDetector) {
          console.log('📱 [TRACKING-MANAGER] Setting app detection state...');
          appDetector.setTrackingState(true);
          appDetector.startAppCapture();
          // Defer real-time detection to stagger PowerShell spawns
          setTimeout(() => {
            try {
              if (global.isTracking && appDetector) {
                appDetector.startRealTimeAppDetection();
                console.log('✅ [TRACKING-MANAGER] App detection real-time interval started (staggered 1s)');
              }
            } catch (e) {
              console.warn('⚠️ [TRACKING-MANAGER] Deferred app detection start failed:', e?.message);
            }
          }, 1000);
          console.log('✅ [TRACKING-MANAGER] App detection state set, real-time deferred 1s');
        } else {
          console.warn('⚠️ [TRACKING-MANAGER] Enhanced app detector not available (neither injected nor global)');
        }
      } catch (error) {
        console.error('❌ [TRACKING-MANAGER] Failed to start app detection:', error);
      }

      // Start monitoring manager NON-BLOCKING.
      // Previously awaited startAllMonitoring() which runs 7 sequential awaits,
      // blocking the event loop for several seconds on slow machines.
      try {
        if (global.monitoringManager && !global.monitoringManager.isMonitoring) {
          const monitorPromise = global.monitoringManager.startAllMonitoring();
          monitorPromise
            .then(() => console.log('✅ [TRACKING-MANAGER] Monitoring manager started (background)'))
            .catch(e => console.warn('⚠️ [TRACKING-MANAGER] Monitoring manager error:', e?.message));
        }
      } catch (error) {
        console.warn('⚠️ [TRACKING-MANAGER] Failed to restart monitoring manager:', error?.message);
      }

      // CRITICAL FIX: Start database persistence and sync services
      debugLogger.init('database', 'Starting database persistence services', {
        hasDatabaseManager: !!global.databaseManager,
        hasEnhancedSyncManager: !!global.enhancedSyncManager,
        timeLogId: this.currentTimeLogId
      });
      
      try {
        // Start activity stats persistence (saves input activity to DB every minute)
        if (global.databaseManager?.startActivityStatsPersistence) {
          global.databaseManager.startActivityStatsPersistence();
          console.log('✅ [TRACKING-MANAGER] Activity stats persistence started');
        } else {
          debugLogger.guard('database', 'Database manager not available for persistence', {
            hasDatabaseManager: !!global.databaseManager,
            hasStartMethod: !!global.databaseManager?.startActivityStatsPersistence
          });
        }
        
        // Start database status reporting
        if (global.databaseManager?.startDatabaseStatusReporting) {
          global.databaseManager.startDatabaseStatusReporting();
          console.log('✅ [TRACKING-MANAGER] Database status reporting started');
        }
        
        // Start sync services
        if (global.enhancedSyncManager?.startActivitySync) {
          global.enhancedSyncManager.startActivitySync();
          console.log('✅ [TRACKING-MANAGER] Enhanced sync activity started');
        }
        
        if (global.enhancedSyncManager?.startConsolidatedIPC) {
          global.enhancedSyncManager.startConsolidatedIPC();
          console.log('✅ [TRACKING-MANAGER] Enhanced sync IPC started');
        }
        
      } catch (error) {
        debugLogger.guard('database', 'Error starting database/sync services', {
          error: error.message
        });
        console.error('❌ [TRACKING-MANAGER] Error starting database/sync services:', error);
      }

      console.log('✅ [TRACKING-MANAGER] Background tracking subsystems brought up');
  }

  /**
   * Stop tracking session with OPTIMIZED cleanup
   * PERFORMANCE: Synchronous state changes + background DB/network operations
   * Target: ~1-2 second stop time instead of 3-5 seconds
   * @param {string} reason - Reason for stopping (manual, idle, etc.)
   * @param {string} message - Optional custom message
   * @returns {Object} Result object with success status
   */
  async stopTracking(reason = 'manual', message = null) {
    const stopStartTime = Date.now();
    try {
      // Sleep/shutdown auto-stops must NOT block wake auto-resume.
      // Manual/idle stops remain an explicit user/system intent.
      const isAutoSleepStop = reason === 'system_sleep';
      if (isAutoSleepStop) {
        global._resumeTrackingAfterWake = {
          projectId: this.currentProjectId || global.currentProjectId || null,
          stoppedAt: Date.now(),
        };
        try {
          const { clearUserExplicitlyStopped } = require('../utils/session-recovery');
          clearUserExplicitlyStopped();
        } catch (_) {
          global.userExplicitlyStopped = false;
        }
      } else {
        try {
          const { markUserExplicitlyStopped } = require('../utils/session-recovery');
          markUserExplicitlyStopped({
            reason,
            timeLogId: this.currentTimeLogId || global.currentTimeLogId,
          });
        } catch (_) {
          global.userExplicitlyStopped = true;
        }
        global._resumeTrackingAfterWake = null;
      }

      // End sticky video-meeting session so the next work block isn't floored
      try {
        const { clearMeetingSession } = require('../../lib/meeting-context');
        clearMeetingSession();
      } catch (_) {}
      
      if (!this.isTracking) {
        console.log('⚠️ [TRACKING-MANAGER] Tracking already stopped');
        return { success: false, message: 'Tracking already stopped' };
      }

      console.log('🛑 [TRACKING-MANAGER] OPTIMIZED STOP - Stopping time tracking...', reason ? `(${reason})` : '');
      
      // ============================================================
      // PHASE 1: IMMEDIATE STATE CHANGES (synchronous, ~50ms)
      // Prevents any new tracking operations from starting
      // ============================================================
      
      // CRITICAL: Set stopping flag to prevent session recovery from restoring tracking
      global.isStopping = true;
      // Sleep auto-stop must allow wake auto-resume; manual/idle remain explicit.
      if (!isAutoSleepStop) {
        global.userExplicitlyStopped = true;
      }
      
      // Capture timeLogId for background DB update
      const timeLogIdForBackground = this.currentTimeLogId;

      // Freeze end time and displayed total at click — DB write may finish seconds later.
      global._stopEndTimeOverride = new Date().toISOString();
      this._captureStopTodayTotalSnapshot();
      
      // Update local state immediately
      this.isTracking = false;
      this.isPaused = false;
      this._localSessionArmed = false;
      
      // Propagate to global immediately
      global.isTracking = false;
      global.isPaused = false;
      try {
        global.notTrackingReminderManager?.onTrackingStopped?.();
      } catch (_) { /* ignore */ }
      // CRITICAL FIX: Send tracking-stopped to renderer IMMEDIATELY in Phase 1
      // This allows renderer to stop ActivityMonitor polling before slow cleanup
      try {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('tracking-stopped', { 
            reason: reason || 'manual',
            message: message || 'Time tracking stopped',
            timestamp: new Date().toISOString(),
            forceStop: true,
            timeLogId: this.currentTimeLogId || global.currentTimeLogId || null,
          });
          console.log('📡 [TRACKING-MANAGER] Sent tracking-stopped to renderer immediately');
        }
      } catch (e) {
        console.warn('⚠️ [TRACKING-MANAGER] Failed to send tracking-stopped:', e?.message);
      }
      
      // ============================================================
      // PHASE 2: STOP ALL INTERVALS/TIMERS (synchronous, ~100ms)
      // These are all fast clearInterval/clearTimeout calls
      // ============================================================
      
      // Stop event-loop lag diagnostic interval (may still be running from startTracking)
      if (this._lagInterval) {
        clearInterval(this._lagInterval);
        this._lagInterval = null;
      }
      
      // Stop permission monitoring
      try {
        if (global.systemMonitor && global.systemMonitor.stopPermissionMonitoring) {
          global.systemMonitor.stopPermissionMonitoring();
        }
      } catch (e) {
        console.warn('⚠️ [PERMISSION] Failed to stop permission monitoring:', e?.message || e);
      }
      
      // Stop URL capture manager (clears polling interval)
      try {
        if (global.urlCaptureManager) {
          global.urlCaptureManager.stop();
        }
      } catch (e) {
        console.warn('⚠️ [URL] Failed to stop UrlCaptureManager:', e?.message || e);
      }

      this._stopTimeLogCheckpoint();
      // Update screenshot manager state IMMEDIATELY
      if (global.enhancedScreenshotManager) {
        global.enhancedScreenshotManager.isTracking = false;
        global.enhancedScreenshotManager.currentSession = null;
        if (global.enhancedScreenshotManager.updateTrackingState) {
          global.enhancedScreenshotManager.updateTrackingState(false, null);
        }
      }
      
      // Stop consolidated tracking wrappers (clears intervals)
      if (this.wrappers && this.wrappers.stopConsolidatedTracking) {
        this.wrappers.stopConsolidatedTracking();
      }

      // Stop input detection (triggers async Python kill internally)
      // Cleanup consolidated systems (mostly interval clearing)
      if (this.consolidationFixes && this.consolidationFixes.cleanupAllSystems) {
        try {
          // Don't await - this includes some async operations
          this.consolidationFixes.cleanupAllSystems().catch(e => 
            console.error('❌ Background cleanup error:', e)
          );
        } catch (error) {
          console.error('❌ [TRACKING-MANAGER] Error during consolidated cleanup:', error);
        }
      }
      
      // Mark systems as uninitialized
      if (global.consolidatedSystemsInitialized !== undefined) {
        global.consolidatedSystemsInitialized = false;
      }
      
      // Stop monitoring systems (interval clearing - sync only)
      // Stop additional systems (interval clearing)
      // Stop database persistence intervals (fast)
      try {
        if (global.databaseManager?.stopActivityStatsPersistence) {
          global.databaseManager.stopActivityStatsPersistence();
        }
        if (global.databaseManager?.stopDatabaseStatusReporting) {
          global.databaseManager.stopDatabaseStatusReporting();
        }
        if (global.enhancedSyncManager?.stopActivitySync) {
          global.enhancedSyncManager.stopActivitySync();
        }
        if (global.enhancedSyncManager?.stopConsolidatedIPC) {
          global.enhancedSyncManager.stopConsolidatedIPC();
        }
      } catch (error) {
        console.error('❌ [TRACKING-MANAGER] Error stopping database/sync intervals:', error);
      }

      // CRITICAL FIX: Stop monitoring manager intervals (app capture, notifications, system monitor)
      // These were never being stopped, causing log spam and wasted CPU after tracking stops
      this._stopMonitoringSystemsSync();

      // Reset screenshot failure tracking
      this.consecutiveScreenshotFailures = 0;
      this.lastSuccessfulScreenshotTime = 0;
      this.screenshotFailureStart = null;
      
      // Update system monitor tracking state
      if (this.systemMonitor && this.systemMonitor.updateTrackingState) {
        this.systemMonitor.updateTrackingState({
          isTracking: false,
          isPaused: false,
          currentTimeLogId: null,
          currentProjectId: null,
          sessionStartTime: null
        });
      }

      // ============================================================
      // PHASE 3: SET ALL MANAGER STATES (synchronous, ~50ms)
      // ============================================================
      
      // Force set tracking state to false on ALL managers
      if (global.enhancedActivityManager) {
        global.enhancedActivityManager.setTrackingState?.(false);
        global.enhancedActivityManager.isTracking = false;
        global.enhancedActivityManager.resetActivityForScreenshot?.();
      }
      
      if (global.enhancedSyncManager) {
        global.enhancedSyncManager.setTrackingState?.(false);
        global.enhancedSyncManager.isTracking = false;
      }
      
      if (global.liveMonitoringManager) {
        global.liveMonitoringManager.setTrackingState?.(false);
        global.liveMonitoringManager.isTracking = false;
      }
      
      if (global.enhancedScreenshotManager) {
        global.enhancedScreenshotManager.isTracking = false;
      }
      
      if (global.enhancedAppDetector) {
        global.enhancedAppDetector.isTracking = false;
      }
      
      if (global.browserUrlManager) {
        global.browserUrlManager.isTracking = false;
        global.browserUrlManager.setCurrentTimeLogId?.(null);
      }

      // Clear session data
      this.currentSession = null;
      this.currentTimeLogId = null;
      this.currentProjectId = null;
      this.sessionStartTime = null;

      // Propagate to global
      global.currentTimeLogId = null;
      global.currentSession = null;
      try { global.sessionStartTime = null; } catch {}

      // Update tray — stop live timer and reset to idle
      if (global.trayManager) {
        global.trayManager.updateState(false, false, {
          projectName: null,
          projectId: null,
          startTime: null
        });
        // Show prominent auto-stop notification for non-manual stops
        if (reason && reason !== 'manual') {
          global.trayManager.showAutoStopNotification(reason, message);
        }
      }

      // Notify renderer of tracking state change (fast IPC call)
      this._notifyRenderer();

      // ============================================================
      // PHASE 4: DATABASE UPDATE (AWAITED - CRITICAL FIX)
      // MUST await database update to ensure session is properly closed
      // This prevents the "stopped locally but active in admin" bug
      // ============================================================
      
      // Close any open app/URL sessions for this user (session model)
      try {
        const userId = global.currentUserId;
        const endedAt = new Date().toISOString();
        const {
          isBackendTimeLogsEnabled,
          closeOpenAppLogs,
          closeOpenUrlLogs,
        } = require('../utils/backend-time-logs');

        if (userId && isBackendTimeLogsEnabled(global.config)) {
          await closeOpenUrlLogs({ user_id: userId, ended_at: endedAt }, global.config);
          await closeOpenAppLogs({ user_id: userId, ended_at: endedAt }, global.config);
          console.log('✅ [TRACKING-MANAGER] Closed open app/URL sessions on stop');
        } else {
          // Left open, their ended_at will be stamped by the next app switch —
          // long after work ended. Surfaced so inflated app usage is explainable.
          console.warn(
            '⚠️ [TRACKING-MANAGER] Cannot close open app/URL rows on stop (no user id or API not configured)',
          );
        }

        // Clear local app session tracker so a later start does not reuse stale state
        if (global.enhancedAppDetector) {
          global.enhancedAppDetector.previousAppEntry = null;
          global.enhancedAppDetector.dwellState = null;
        }
      } catch (urlCloseErr) {
        console.warn('⚠️ [TRACKING-MANAGER] Failed to close app/URL sessions (non-fatal):', urlCloseErr?.message);
      }

      try {
        const dbResult = await this._runBackgroundStopOperations(timeLogIdForBackground, reason, message);
        if (!dbResult?.success) {
          console.warn('⚠️ [TRACKING-MANAGER] Database update may have failed:', dbResult?.reason || 'unknown');
        }
      } catch (e) {
        console.error('❌ [TRACKING-MANAGER] Stop operations failed:', e);
      } finally {
        // Clear stopping flag when done
        global.isStopping = false;
        global._stopEndTimeOverride = null;
      }

      // Emit event for other modules
      this.emit('tracking-stopped', {
        reason,
        message,
        timestamp: new Date().toISOString()
      });

      // CRITICAL FIX: Notify renderer that session data is now saved to DB
      // This allows the renderer to refresh Recent Sessions / Top Projects immediately
      try {
        const win = this.mainWindow || global.mainWindow;
        if (win && !win.isDestroyed()) {
          win.webContents.send('session-data-updated', {
            reason: 'tracking-stopped',
            timestamp: new Date().toISOString()
          });
          console.log('📡 [TRACKING-MANAGER] Sent session-data-updated to renderer (post-DB)');
        } else {
          console.warn('⚠️ [TRACKING-MANAGER] No valid mainWindow for session-data-updated');
        }
      } catch (e) {
        console.warn('⚠️ [TRACKING-MANAGER] Failed to send session-data-updated:', e?.message);
      }

      const totalElapsed = Date.now() - stopStartTime;
      console.log(`✅ [TRACKING-MANAGER] STOP complete in ${totalElapsed}ms (database updated)`);

      const notificationMessage = message || 'Time tracking stopped';
      console.log(`✅ [TRACKING-MANAGER] Tracking stopped successfully: ${notificationMessage}`);
      
      return { success: true, message: notificationMessage };
      
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error stopping tracking:', error);
      
      // CRITICAL FIX: Always clear isStopping flag on error to prevent permanent block
      // Without this, session recovery would be permanently disabled after any stop error
      global.isStopping = false;
      
      return { success: false, message: `Failed to stop tracking: ${error.message}` };
    }
  }

  /**
   * OPTIMISTIC STOP: Fast state change + background cleanup
   * This method returns immediately after setting critical state,
   * and runs all cleanup operations in the background.
   * Used by IPC handler to eliminate 3-5 second delay on Windows.
   * 
   * @param {string} reason - Reason for stopping (manual, idle, etc.)
   * @param {string} message - Optional custom message
   * @returns {Object} Result object with success status (returns immediately)
   */
  async stopTrackingAsync(reason = 'manual', message = null) {
    console.log('🚀 [TRACKING-MANAGER] stopTrackingAsync - fast return with background cleanup');
    
    const isAutoSleepStop = reason === 'system_sleep';
    if (isAutoSleepStop) {
      global._resumeTrackingAfterWake = {
        projectId: this.currentProjectId || global.currentProjectId || null,
        stoppedAt: Date.now(),
      };
      try {
        const { clearUserExplicitlyStopped } = require('../utils/session-recovery');
        clearUserExplicitlyStopped();
      } catch (_) {
        global.userExplicitlyStopped = false;
      }
    } else {
      try {
        const { markUserExplicitlyStopped } = require('../utils/session-recovery');
        markUserExplicitlyStopped({
          reason,
          timeLogId: this.currentTimeLogId || global.currentTimeLogId,
        });
      } catch (_) {
        global.userExplicitlyStopped = true;
      }
      global._resumeTrackingAfterWake = null;
    }
    try {
      const { clearMeetingSession } = require('../../lib/meeting-context');
      clearMeetingSession();
    } catch (_) {}
    
    // Check if already stopped
    if (!this.isTracking && !global.isTracking) {
      console.log('⚠️ [TRACKING-MANAGER] Tracking already stopped');
      return { success: false, message: 'Tracking already stopped' };
    }
    
    // PHASE 1: IMMEDIATE STATE CHANGES (synchronous, no awaits)
    // These must happen immediately to prevent race conditions
    console.log('⚡ [TRACKING-MANAGER] Phase 1: Immediate state changes');
    
    // CRITICAL FIX: Set stopping flag to prevent session recovery from restoring tracking
    // This must be set BEFORE changing isTracking to prevent race conditions
    global.isStopping = true;

    global._stopEndTimeOverride = new Date().toISOString();
    this._captureStopTodayTotalSnapshot();

    const timeLogIdForBackground = this.currentTimeLogId;
    this.isTracking = false;
    this.isPaused = false;
    
    // Update global state
    global.isTracking = false;
    global.isPaused = false;
    try {
      global.notTrackingReminderManager?.onTrackingStopped?.();
    } catch (_) { /* ignore */ }
    
    // Update screenshot manager state immediately to prevent race condition
    if (global.enhancedScreenshotManager) {
      global.enhancedScreenshotManager.isTracking = false;
      global.enhancedScreenshotManager.currentSession = null;
      if (global.enhancedScreenshotManager.updateTrackingState) {
        global.enhancedScreenshotManager.updateTrackingState(false, null);
      }
    }
    
    // Notify renderer immediately (non-blocking)
    this._notifyRenderer();
    
    console.log('✅ [TRACKING-MANAGER] Phase 1 complete - state updated immediately');
    
    // PHASE 2: BACKGROUND CLEANUP (fire-and-forget)
    // Run all cleanup operations asynchronously without blocking return
    setImmediate(() => {
      this._runBackgroundCleanup(reason, message).catch(error => {
        console.error('❌ [TRACKING-MANAGER] Background cleanup error:', error);
      });
    });
    
    // Return immediately - UI already updated
    return { success: true, message: message || 'Timer stopped' };
  }

  /**
   * Run all cleanup operations in background
   * Called by stopTrackingAsync after immediate state changes
   */
  async _runBackgroundCleanup(reason = 'manual', message = null) {
    console.log('🧹 [TRACKING-MANAGER] Phase 2: Background cleanup starting...');
    
    try {
      // Stop URL capture manager
      try {
        if (global.urlCaptureManager) {
          global.urlCaptureManager.stop();
          console.log('🛑 [URL] UrlCaptureManager stopped');
        }
      } catch (e) {
        console.warn('⚠️ [URL] Failed to stop UrlCaptureManager:', e?.message || e);
      }
      
      // Stop consolidated tracking
      if (this.wrappers && this.wrappers.stopConsolidatedTracking) {
        this.wrappers.stopConsolidatedTracking();
      }
      
      // Stop input detection
      try {
        if (global.stopInputDetection) {
          global.stopInputDetection();
          console.log('✅ Input detection stopped');
        }
      } catch (error) {
        console.error('❌ Failed to stop input detection:', error);
      }
      
      // Cleanup consolidated systems
      if (this.consolidationFixes && this.consolidationFixes.cleanupAllSystems) {
        try {
          await this.consolidationFixes.cleanupAllSystems();
          console.log('✅ Consolidated systems cleaned up');
        } catch (error) {
          console.error('❌ Consolidated cleanup error:', error);
        }
      }
      
      // Mark systems for re-initialization
      if (global.consolidatedSystemsInitialized !== undefined) {
        global.consolidatedSystemsInitialized = false;
      }
      
      // Stop monitoring systems
      await this._stopMonitoringSystems();
      console.log('✅ [TRACKING-MANAGER] Background cleanup completed successfully');
      
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Background cleanup error:', error);
    } finally {
      // CRITICAL FIX: Always clear stopping flag in finally block
      // This ensures the flag is cleared whether cleanup succeeds or fails
      global.isStopping = false;
      global.isTracking = false;  // Ensure tracking stays false
      console.log('✅ [TRACKING-MANAGER] Stopping flag cleared');
    }
  }

  /**
   * Stop all activity tracking systems
   */
  _stopAllActivitySystems() {
    try {
      console.log('🛑 Setting tracking state to false on all managers...');
      
      if (global.enhancedActivityManager) {
        global.enhancedActivityManager.setTrackingState?.(false);
        global.enhancedActivityManager.isTracking = false;
        global.enhancedActivityManager.resetActivityForScreenshot?.();
      }
      
      if (global.enhancedSyncManager) {
        global.enhancedSyncManager.setTrackingState?.(false);
        global.enhancedSyncManager.isTracking = false;
      }
      
      if (global.liveMonitoringManager) {
        global.liveMonitoringManager.setTrackingState?.(false);
        global.liveMonitoringManager.isTracking = false;
      }
      
      if (global.enhancedScreenshotManager) {
        global.enhancedScreenshotManager.isTracking = false;
      }
      
      if (global.enhancedAppDetector) {
        global.enhancedAppDetector.isTracking = false;
      }
      
      if (global.browserUrlManager) {
        global.browserUrlManager.isTracking = false;
      }
      
      console.log('✅ All activity systems tracking state set to false');
    } catch (error) {
      console.error('❌ Error stopping activity systems:', error);
    }
  }

  /**
   * Stop monitoring systems based on type
   */
  async _stopMonitoringSystems() {
    try {
      const useOptimizedIntervals = global.useOptimizedIntervals;
      const OptimizedIntervalManager = global.OptimizedIntervalManager;
      
      if (useOptimizedIntervals && this.intervalManager instanceof OptimizedIntervalManager) {
        console.log('🛑 [TRACKING-MANAGER] Stopping optimized monitoring system');
        this.intervalManager.stopAll();
        
        // CRITICAL FIX: Stop screenshot scheduling for optimized system
        if (global.screenshotInterval) {
          clearTimeout(global.screenshotInterval);
          global.screenshotInterval = null;
          console.log('📸 [TRACKING-MANAGER] Screenshot scheduling stopped for optimized system');
        }
      } else {
        // Original monitoring approach - call global functions if available
        if (typeof global.stopScreenshotCapture === 'function') global.stopScreenshotCapture();
        if (typeof global.stopIdleMonitoring === 'function') global.stopIdleMonitoring();
        // CRITICAL FIX: global.stopAppCapture was never defined! Call enhanced detector directly
        if (global.enhancedAppDetector?.stopAppCapture) {
          global.enhancedAppDetector.stopAppCapture();
        }
        if (typeof global.stopUrlCapture === 'function') global.stopUrlCapture();
        if (typeof global.stopMandatoryScreenshotMonitoring === 'function') global.stopMandatoryScreenshotMonitoring();
      }
      
      // CRITICAL FIX (Windows): Force stop monitoring manager to ensure all intervals are cleared
      // On Windows, intervals may continue running if not explicitly cleared
      if (global.monitoringManager && typeof global.monitoringManager.stopAllMonitoring === 'function') {
        console.log('🛑 [TRACKING-MANAGER] Force stopping monitoring manager...');
        await global.monitoringManager.stopAllMonitoring();
        console.log('✅ [TRACKING-MANAGER] Monitoring manager stopped');
      }
      
      // CRITICAL FIX (Windows): Emergency stop as last resort
      if (global.monitoringManager && typeof global.monitoringManager.emergencyStop === 'function') {
        console.log('🚨 [TRACKING-MANAGER] Executing emergency stop on monitoring manager...');
        await global.monitoringManager.emergencyStop();
        console.log('✅ [TRACKING-MANAGER] Emergency stop completed');
      }
      
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error stopping monitoring systems:', error);
    }
  }

  /**
   * SYNCHRONOUS monitoring stop - only clears intervals, no async operations
   * Used by optimized stopTracking for fast return
   */
  _stopMonitoringSystemsSync() {
    try {
      const useOptimizedIntervals = global.useOptimizedIntervals;
      const OptimizedIntervalManager = global.OptimizedIntervalManager;
      
      if (useOptimizedIntervals && this.intervalManager instanceof OptimizedIntervalManager) {
        this.intervalManager.stopAll();
        if (global.screenshotInterval) {
          clearTimeout(global.screenshotInterval);
          global.screenshotInterval = null;
        }
      } else {
        // Original monitoring approach - call global functions if available
        if (typeof global.stopScreenshotCapture === 'function') global.stopScreenshotCapture();
        if (typeof global.stopIdleMonitoring === 'function') global.stopIdleMonitoring();
        // CRITICAL FIX: global.stopAppCapture was never defined! Call enhanced detector directly
        if (global.enhancedAppDetector?.stopAppCapture) {
          global.enhancedAppDetector.stopAppCapture();
        }
        if (typeof global.stopUrlCapture === 'function') global.stopUrlCapture();
        if (typeof global.stopMandatoryScreenshotMonitoring === 'function') global.stopMandatoryScreenshotMonitoring();
      }
      
      // SYNC: Stop monitoring manager intervals only (don't await async cleanup)
      if (global.monitoringManager && typeof global.monitoringManager.stopAllMonitoringSync === 'function') {
        global.monitoringManager.stopAllMonitoringSync();
      } else if (global.monitoringManager && typeof global.monitoringManager.stopAllMonitoring === 'function') {
        // Call but don't await - intervals are cleared synchronously inside
        global.monitoringManager.stopAllMonitoring().catch(() => {});
      }
      
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error in sync monitoring stop:', error);
    }
  }

  /**
   * Block Start until the previous Stop has actually finished.
   *
   * This polled a flag for a fixed window and then started anyway. Start passes
   * 8000ms while the stop's backend call times out at 12000ms, so on a slow or
   * failing network the wait was guaranteed to expire first: the new session was
   * created while the old one was still open, and the two overlapped. Summed by
   * the reports, that overlap is billed twice — 15.33 phantom hours over two
   * days, all of it on users whose stops were slow (sleep/resume, flaky links).
   *
   * The stop already exposes a real promise, so wait on that rather than
   * guessing a duration. `stillStopping` tells the caller it must not skip the
   * pre-start cleanup, even offline.
   */
  async _waitForPriorStopToFinish(maxMs = 25000) {
    const started = Date.now();

    try {
      const gsm = require('./graceful-shutdown-manager');
      if (gsm?.shutdownPromise) {
        await Promise.race([
          gsm.shutdownPromise.catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, maxMs)),
        ]);
      }
    } catch (_) { /* fall through to the flag poll */ }

    while ((global.isStopping || global._isStoppingTracking) && Date.now() - started < maxMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const waitedMs = Date.now() - started;
    const stillStopping = !!(global.isStopping || global._isStoppingTracking);
    if (stillStopping) {
      console.warn(
        `⚠️ [TRACKING-MANAGER] Prior stop unfinished after ${waitedMs}ms — forcing close before Start`,
      );
    }
    if (waitedMs > 250 || stillStopping) {
      try {
        require('../utils/session-audit').startBlockedByStop({
          waitedMs,
          resolved: !stillStopping,
        });
      } catch (_) { /* audit is best-effort */ }
    }
    return { stillStopping };
  }

  _captureStopTodayTotalSnapshot() {
    try {
      const { elapsedSecondsSinceLocalMidnight } = require('../utils/today-time-log-stats');
      const tray = global.trayManager;
      const base = Math.max(0, Math.floor(Number(tray?._cumulativeBaseSeconds) || 0));
      const start = this.sessionStartTime || global.sessionStartTime;
      const elapsed = start
        ? elapsedSecondsSinceLocalMidnight(start)
        : 0;
      // Hint only for empty DB reads — must not permanently outrank real DB totals.
      const total = base + elapsed;
      if (total > 0) {
        global._lastTodayTotalAtStop = total;
        console.log(`⏱️ [TRACKING-MANAGER] Stop snapshot hint: ${total}s (base=${base}, elapsed=${elapsed})`);
      }
    } catch (error) {
      console.warn('⚠️ [TRACKING-MANAGER] Stop snapshot failed:', error?.message || error);
    }
  }

  _resolveTodayBaseSeconds(dbCompletedSeconds) {
    const { localDateKey } = require('../utils/today-time-log-stats');
    const todayKey = localDateKey();
    if (global._frozenTotalDate !== todayKey) {
      global._lastTodayTotalAtStop = null;
      global._rendererFrozenTotalAtStop = null;
      global._frozenTotalDate = todayKey;
    }
    const db = Math.max(0, Math.floor(Number(dbCompletedSeconds) || 0));
    // DB wins whenever it has a real total. Snapshot only covers empty fetches.
    if (db > 0) {
      global._lastTodayTotalAtStop = null;
      return db;
    }
    const floor = Math.max(0, Math.floor(Number(global._lastTodayTotalAtStop) || 0));
    return floor;
  }

  /**
   * SYNCHRONOUS durable arm for sleep/suspend BEFORE async stop.
   * OS may freeze the process mid-stopTracking — disk must already hold end_time.
   */
  armDurableSleepStop(reason = 'system_sleep') {
    try {
      const timeLogId = this.currentTimeLogId || global.currentTimeLogId;
      if (!timeLogId && !this.isTracking) return null;

      this._stopTimeLogCheckpoint();

      const endTime = new Date().toISOString();
      global._stopEndTimeOverride = global._stopEndTimeOverride || endTime;
      const startTime =
        this.sessionStartTime ||
        this.currentSession?.start_time ||
        global.sessionStartTime ||
        endTime;
      const userId = this.config?.user_id || global.currentUserId;

      if (timeLogId) {
        this._storeSessionCheckpoint({
          timeLogId,
          startTime,
          checkpointAt: endTime,
          userId,
          projectId: this.currentProjectId || global.currentProjectId,
          reason,
        });
        this._storePendingSessionClose(timeLogId, endTime, userId);
        this._queueOfflineTimeLogUpdate({
          id: timeLogId,
          user_id: userId,
          start_time: startTime,
          end_time: endTime,
          status: 'completed',
          project_id: this.currentProjectId || this.currentSession?.project_id || null,
          _sleep_armed: true,
        });
        this._appendTimeLedger({
          event: 'sleep_arm_close',
          id: timeLogId,
          start_time: startTime,
          end_time: endTime,
          status: 'completed',
          reason,
        });
      }

      global._resumeTrackingAfterWake = {
        projectId: this.currentProjectId || global.currentProjectId || null,
        stoppedAt: Date.now(),
        reason,
      };
      try {
        const { clearUserExplicitlyStopped } = require('../utils/session-recovery');
        clearUserExplicitlyStopped();
      } catch (_) {
        global.userExplicitlyStopped = false;
      }

      console.log(
        `💤 [TRACKING-MANAGER] Durable sleep arm written for ${timeLogId || 'no-id'} at ${endTime}`,
      );
      return endTime;
    } catch (err) {
      console.error('❌ [TRACKING-MANAGER] armDurableSleepStop failed:', err?.message || err);
      return null;
    }
  }

  _startTimeLogCheckpoint() {
    this._stopTimeLogCheckpoint();

    // PAYROLL: hard-kill loss window ≈ checkpoint interval. Keep this tight.
    const CHECKPOINT_MS = 10 * 1000;
    this._timeLogCheckpointInterval = setInterval(() => {
      void this._checkpointCurrentTimeLog();
    }, CHECKPOINT_MS);
    if (typeof this._timeLogCheckpointInterval.unref === 'function') {
      this._timeLogCheckpointInterval.unref();
    }
    // Immediate first floor so a crash seconds after Start still has a durable mark.
    void this._checkpointCurrentTimeLog();
  }

  _stopTimeLogCheckpoint() {
    if (this._timeLogCheckpointInterval) {
      clearInterval(this._timeLogCheckpointInterval);
      this._timeLogCheckpointInterval = null;
    }
  }

  /**
   * DEAD-MAN'S SWITCH. Every 10s, stamp last_alive_at = now on the row, so the
   * server always already knows where this session ends if the agent vanishes.
   *
   * We cannot rely on writing the end at stop time: lid-close freezes the
   * process mid-call (observed on a real device: 8 suspends, only 2 completed
   * stops, one that took 5m21s and failed). Anything written at wake time bills
   * the whole sleep. Stamping while alive has no such failure mode — worst case
   * is losing the last 10 seconds, never gaining hours.
   */
  async _checkpointCurrentTimeLog() {
    const timeLogId = this.currentTimeLogId || global.currentTimeLogId;
    if (!this.isTracking || !timeLogId) return;

    const nowIso = new Date().toISOString();
    const startTime =
      this.sessionStartTime ||
      this.currentSession?.start_time ||
      global.sessionStartTime ||
      null;

    // Always write local durable floor first (connection-independent).
    this._storeSessionCheckpoint({
      timeLogId,
      startTime,
      checkpointAt: nowIso,
      userId: this.config?.user_id || global.currentUserId,
      projectId: this.currentProjectId || global.currentProjectId,
    });

    if (String(timeLogId).startsWith('temp-')) {
      try {
        const queue = this.getOfflineQueue();
        const create = queue.find(
          (item) => item?.type === 'create_time_log' && String(item?.data?.id) === String(timeLogId),
        );
        if (create?.data) {
          create.data.status = 'active';
          create.data._checkpoint_at = nowIso;
          this.saveOfflineQueue(queue);
        }
      } catch (_) { /* ignore */ }
      return;
    }

    if (!backendTimeLogs.isBackendTimeLogsEnabled(this.config)) return;

    // PAYROLL CRITICAL: the heartbeat is proof the employee was working. It must
    // NOT share a try block with the keep-alive update — a single failed update
    // used to swallow the heartbeat too, so a flaky network made an active
    // session look dead to the server. Send it first and independently.
    const userId = this.config?.user_id || global.currentUserId;
    if (userId) {
      try {
        await backendTimeLogs.upsertSessionHeartbeat(
          {
            user_id: userId,
            time_log_id: timeLogId,
            device_id: getDeviceId(),
            organization_id: global.currentOrganizationId || this.config?.organization_id || null,
            last_seen_at: nowIso,
            reason: 'checkpoint',
            agent_version: this.config?.version || global.appVersion || null,
            meta: { is_tracking: true },
          },
          this.config,
        );
      } catch (err) {
        console.warn('⚠️ [TRACKING-MANAGER] Heartbeat failed:', err?.message || err);
      }
    }

    try {
      // Advance the dead-man value on the row itself. end_time stays NULL so
      // "open session" semantics (end_time IS NULL) are unchanged everywhere.
      await backendTimeLogs.updateTimeLog(
        timeLogId,
        { status: 'active', last_alive_at: nowIso, client_last_seen_at: nowIso },
        this.config,
      );
    } catch (err) {
      console.warn('⚠️ [TRACKING-MANAGER] Time log checkpoint failed:', err?.message || err);
    }
  }

  _getSessionCheckpointPath() {
    const path = require('path');
    return path.join(this._getAppDataDir(), 'session-checkpoint.json');
  }

  _storeSessionCheckpoint(payload) {
    try {
      const fs = require('fs');
      const filePath = this._getSessionCheckpointPath();
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmp, filePath);
    } catch (err) {
      console.warn('⚠️ [TRACKING-MANAGER] Session checkpoint write failed:', err?.message || err);
    }
  }

  _clearSessionCheckpoint() {
    try {
      const fs = require('fs');
      const filePath = this._getSessionCheckpointPath();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) { /* ignore */ }
  }

  _readSessionCheckpoint() {
    try {
      const fs = require('fs');
      const filePath = this._getSessionCheckpointPath();
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
      return null;
    }
  }

  /**
   * Stop operations - handles DB updates and cleanup
   * FIXED: Now returns result for proper error handling
   */
  async _runBackgroundStopOperations(timeLogId, reason, message) {
    const bgStartTime = Date.now();
    console.log('🔄 [TRACKING-MANAGER] Starting stop operations...');
    
    let dbSuccess = false;
    
    try {
      // Sync queue flush (network operation)
      if (global.syncManager?.syncQueue) {
        try {
          await global.syncManager.syncQueue();
        } catch (e) {
          console.warn('⚠️ Sync flush failed:', e.message);
        }
      }
      
      // End time log in database (CRITICAL - must succeed)
      if (timeLogId) {
        const dbResult = await this._endCurrentTimeLogBackground(timeLogId);
        dbSuccess = dbResult?.success === true;
        
        if (!dbSuccess) {
          console.error('❌ [TRACKING-MANAGER] Failed to close time log in database:', dbResult?.reason);
        }
      } else {
        console.warn('⚠️ [TRACKING-MANAGER] No timeLogId to close');
        dbSuccess = true; // No time log to close is not a failure
      }
      
      // Handle post-stop actions (tray update, notifications)
      await this._handlePostStopActions(reason, message);
      
      const elapsed = Date.now() - bgStartTime;
      console.log(`✅ [TRACKING-MANAGER] Stop operations complete in ${elapsed}ms, dbSuccess: ${dbSuccess}`);
      
      return { success: dbSuccess, elapsed };
      
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Stop operations error:', error);
      return { success: false, reason: 'exception', error: error.message };
    }
  }

  /**
   * End time log in background - doesn't use this.currentTimeLogId which is already cleared
   */
  async _endCurrentTimeLogBackground(timeLogId) {
    if (!timeLogId) {
      console.log('⚠️ [TRACKING-MANAGER] No timeLogId provided to _endCurrentTimeLogBackground');
      return { success: false, reason: 'no_time_log_id' };
    }

    // ONLY authorized idle-alert cut (shown prompt timed out) may use now − 10m.
    // All other stops: wall-clock now. Never silently eat time after stop.
    const checkpoint = this._readSessionCheckpoint?.() || null;
    const checkpointMs = checkpoint?.checkpointAt
      ? new Date(checkpoint.checkpointAt).getTime()
      : 0;
    const cutSeconds = Math.max(0, Math.floor(Number(global._idlePromptTimeCutSeconds) || 0));
    const authorizedIdleCut = !!global._stopAuthorizedIdleCut && cutSeconds > 0;
    let endMs;
    if (authorizedIdleCut) {
      const cutMs = cutSeconds * 1000;
      endMs = Date.now() - cutMs;
      const overrideMs = global._stopEndTimeOverride
        ? new Date(global._stopEndTimeOverride).getTime()
        : NaN;
      if (Number.isFinite(overrideMs) && overrideMs < Date.now() - 30 * 1000) {
        endMs = Math.min(endMs, overrideMs);
      }
      const sessionStartRaw =
        this.sessionStartTime ||
        this.currentSession?.start_time ||
        checkpoint?.startTime ||
        null;
      if (sessionStartRaw) {
        const sessionStartMs = new Date(sessionStartRaw).getTime();
        if (Number.isFinite(sessionStartMs) && endMs < sessionStartMs) {
          endMs = sessionStartMs;
        }
      }
    } else {
      // The click instant, not the instant this write runs. Wall-clock here
      // billed each stop for its own round-trip and pushed the clock past the
      // moment the employee stopped. A checkpoint that fired after the click is
      // not work either, so it does not extend the end.
      const nowMs = Date.now();
      const frozenMs = global._stopEndTimeOverride
        ? new Date(global._stopEndTimeOverride).getTime()
        : NaN;
      const usableFrozen =
        Number.isFinite(frozenMs) && frozenMs <= nowMs && nowMs - frozenMs <= 5 * 60 * 1000;
      endMs = usableFrozen ? frozenMs : nowMs;
    }
    const endTime = new Date(endMs).toISOString();
    const idleCutSeconds = authorizedIdleCut ? cutSeconds : 0;
    // Consume flags so a later retry cannot cut again after stop.
    global._stopEndTimeOverride = null;
    global._stopAuthorizedIdleCut = false;
    if (authorizedIdleCut) {
      // Keep cut seconds until this close finishes; cleared by caller/GSM after persist.
    } else {
      global._idlePromptTimeCutSeconds = 0;
    }
    const userId = this.config.user_id;
    // Offline sessions now use stable UUIDs; still treat never-synced rows as creates.
    const isTempOfflineId =
      String(timeLogId).startsWith('temp-') ||
      !!(this.currentSession?._offline) ||
      !!(global.currentSession?._offline);
    const startTime =
      this.sessionStartTime ||
      this.currentSession?.start_time ||
      checkpoint?.startTime ||
      endTime;
    
    console.log(
      `🔄 [TRACKING-MANAGER] Closing time log ${timeLogId} with end_time ${endTime}` +
        (idleCutSeconds ? ` (authorized idle cut ${idleCutSeconds}s)` : ''),
    );
    
    // Durable local copy FIRST — connection loss must not erase hours.
    this._storePendingSessionClose(timeLogId, endTime, userId);
    this._queueOfflineTimeLogUpdate({
      id: timeLogId,
      user_id: userId,
      start_time: startTime,
      end_time: endTime,
      status: 'completed',
      project_id: this.currentProjectId || this.currentSession?.project_id || null,
      ...(idleCutSeconds ? { authorized_idle_cut: true, time_cut_seconds: idleCutSeconds } : {}),
    });

    const useBackendTimeLogs = backendTimeLogs.isBackendTimeLogsEnabled(this.config);

    if (!useBackendTimeLogs) {
      console.error('❌ [TRACKING-MANAGER] Backend API not configured — hours kept in offline-time-logs.json');
      return { success: true, reason: 'offline_queued', offline: true };
    }

    try {
      // Idle total for this session comes from the monitor that logged every idle
      // chunk — same source the shutdown path uses. No query, and it works offline.
      let idleSeconds = 0;
      try {
        idleSeconds = global.enhancedIdleMonitor?.getSessionIdleSeconds?.() || 0;
      } catch (idleErr) {
        console.warn('⚠️ [TRACKING-MANAGER] Could not read session idle seconds:', idleErr.message);
      }

      // Offline temp sessions were never inserted — create a completed row now
      // so worked time is not lost when the employee stops before sync.
      if (isTempOfflineId) {
        const createPayload = {
          user_id: userId,
          project_id: this.currentProjectId || this.currentSession?.project_id || null,
          start_time: startTime,
          end_time: endTime,
          status: 'completed',
          is_manual: false,
          idle_seconds: idleSeconds || 0,
          device_id: getDeviceId(),
        };

        try {
          const orgId =
            global.currentOrganizationId ||
            this.config.organization_id ||
            null;
          await backendTimeLogs.createTimeLog(
            {
              ...createPayload,
              id: timeLogId,
              organization_id: orgId,
            },
            this.config,
          );
          this._clearSessionCheckpoint();
          return { success: true, offline: false };
        } catch (createErr) {
          console.warn('⚠️ [TRACKING-MANAGER] Temp session create failed — kept in offline queue:', createErr?.message || createErr);
          this._queueOfflineTimeLogCreate({ ...createPayload, id: timeLogId });
          return { success: true, reason: 'offline_queued', offline: true };
        }
      }

      try {
        await backendTimeLogs.updateTimeLog(
          timeLogId,
          {
            end_time: endTime,
            status: 'completed',
            idle_seconds: idleSeconds || 0,
            ...(idleCutSeconds ? { authorized_idle_cut: true } : {}),
          },
          this.config,
        );
        this._clearPendingSessionClose?.(timeLogId);
        this._clearSessionCheckpoint();
        console.log(`✅ [TRACKING-MANAGER] Closed time log ${timeLogId}`);
        return { success: true };
      } catch (updateErr) {
        console.warn(
          '⚠️ [TRACKING-MANAGER] DB close failed — hours retained in offline queue:',
          updateErr?.message || updateErr,
        );
        return { success: true, reason: 'offline_queued', offline: true };
      }
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] End time log error — hours retained offline:', error);
      return { success: true, reason: 'offline_queued', offline: true, error: error.message };
    }
  }

  /**
   * Stop additional tracking systems
   */
  _stopAdditionalSystems() {
    try {
      // Tab monitoring handled by BrowserUrlManager
      // CRITICAL FIX: Stop enhanced app detector directly (global.stopAppCapture was never defined!)
      if (global.enhancedAppDetector) {
        if (global.enhancedAppDetector.stopAppCapture) {
          global.enhancedAppDetector.stopAppCapture();
          console.log('✅ [TRACKING-MANAGER] Enhanced App Detector - app capture stopped');
        }
        if (global.enhancedAppDetector.stopRealTimeAppDetection) {
          global.enhancedAppDetector.stopRealTimeAppDetection();
          console.log('✅ [TRACKING-MANAGER] Enhanced App Detector - real-time detection stopped');
        }
      }
      
      // Stop real-time app detection (fallback for legacy global function)
      if (typeof global.stopRealTimeAppDetection === 'function') {
        global.stopRealTimeAppDetection();
      }
      
      // Stop live activity updates
      if (typeof global.stopLiveActivityUpdates === 'function') {
        global.stopLiveActivityUpdates();
      }
      
      // PERFORMANCE OPTIMIZATION: Stop consolidated IPC system
      if (typeof global.stopConsolidatedIPC === 'function') {
        global.stopConsolidatedIPC();
      }
      
      // PERFORMANCE OPTIMIZATION: Stop automatic memory cleanup
      if (typeof global.stopMemoryCleanup === 'function') {
        global.stopMemoryCleanup();
      }
      console.log('✅ [TRACKING-MANAGER] Additional systems stopped');
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error stopping additional systems:', error);
    }
  }

  /**
   * Store pending session close in local storage for backend cleanup fallback
   */
  _storePendingSessionClose(timeLogId, endTime, userId) {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const pendingDir = path.join(app.getPath('userData'), 'pending_sessions');
      if (!fs.existsSync(pendingDir)) {
        fs.mkdirSync(pendingDir, { recursive: true });
      }
      
      const pendingFile = path.join(pendingDir, `${timeLogId}.json`);
      fs.writeFileSync(pendingFile, JSON.stringify({
        timeLogId,
        endTime,
        userId,
        createdAt: new Date().toISOString()
      }));
      
      console.log('📁 [TRACKING-MANAGER] Stored pending session close:', timeLogId);
    } catch (error) {
      console.warn('⚠️ [TRACKING-MANAGER] Failed to store pending session:', error.message);
    }
  }
  
  /**
   * Clear pending session close after successful database update
   */
  _clearPendingSessionClose(timeLogId) {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const pendingFile = path.join(app.getPath('userData'), 'pending_sessions', `${timeLogId}.json`);
      if (fs.existsSync(pendingFile)) {
        fs.unlinkSync(pendingFile);
        console.log('🗑️ [TRACKING-MANAGER] Cleared pending session:', timeLogId);
      }
    } catch (error) {
      console.warn('⚠️ [TRACKING-MANAGER] Failed to clear pending session:', error.message);
    }
  }

  /**
   * Handle post-stop actions like tray updates and notifications
   */
  async _handlePostStopActions(reason, message) {
    try {
      // Update tray
      if (typeof global.updateTrayMenuThrottled === 'function') {
        global.updateTrayMenuThrottled();
      }
      
      // Update UI with reason information
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('tracking-stopped', { 
          reason: reason || 'manual',
          message: message || 'Time tracking stopped',
          timestamp: new Date().toISOString(),
          forceStop: true // CRITICAL FIX: Signal renderer to force stop all subsystems
        });
      }
      
      // Notify user of successful stop
      const notificationMessage = message || 'Time tracking stopped';
      if (typeof global.showTrayNotification === 'function') {
        global.showTrayNotification(notificationMessage, reason === 'manual' ? 'info' : 'warning');
      }
      
      // Stop activity stats persistence and save final stats
      if (typeof global.saveActivityStatsToDatabase === 'function') {
        await global.saveActivityStatsToDatabase();
      }
      if (typeof global.stopActivityStatsPersistence === 'function') {
        global.stopActivityStatsPersistence();
      }

      // Send to debug console via system monitor
      if (this.systemMonitor && this.systemMonitor.sendDebugUpdate) {
        this.systemMonitor.sendDebugUpdate('SYSTEM', `🛑 Tracking stopped: ${reason}`);
        this.systemMonitor.sendDebugUpdate('SYSTEM', `📊 Final session completed`);
      }
      
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error in post-stop actions:', error);
    }
  }

  /**
   * Notify renderer of tracking state change — sends ACTUAL current state
   */
  _notifyRenderer() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const trackingStateData = {
        isTracking: this.isTracking,
        isPaused: this.isPaused,
        status: this.isTracking ? (this.isPaused ? 'paused' : 'active') : 'stopped',
        startTime: this.sessionStartTime || null,
        currentTimeLogId: this.currentTimeLogId || null,
        projectId: this.currentProjectId || null,
        sessionStartTime: this.sessionStartTime || null
      };
      
      console.log(`📡 [TRACKING-MANAGER] Sending tracking-state-changed (${trackingStateData.status}) to renderer:`, trackingStateData);
      this.mainWindow.webContents.send('tracking-state-changed', trackingStateData);
    }
  }

  /**
   * Get current tracking state
   */
  getTrackingState() {
    return {
      isTracking: this.isTracking,
      isPaused: this.isPaused,
      currentSession: this.currentSession,
      currentTimeLogId: this.currentTimeLogId,
      currentProjectId: this.currentProjectId,
      sessionStartTime: this.sessionStartTime
    };
  }

  /**
   * Update tracking state (used by other modules)
   */
  updateTrackingState(newState) {
    if (newState.isTracking !== undefined) this.isTracking = newState.isTracking;
    if (newState.isPaused !== undefined) this.isPaused = newState.isPaused;
    if (newState.currentSession !== undefined) this.currentSession = newState.currentSession;
    if (newState.currentTimeLogId !== undefined) this.currentTimeLogId = newState.currentTimeLogId;
    if (newState.currentProjectId !== undefined) this.currentProjectId = newState.currentProjectId;
    if (newState.sessionStartTime !== undefined) this.sessionStartTime = newState.sessionStartTime;
    
    console.log('🔄 [TRACKING-MANAGER] State updated:', this.getTrackingState());
  }

  /**
   * Force-close all active (unclosed) sessions for a user.
   * Used as a fallback when sessionManager is unavailable or its cleanup failed,
   * and as part of the duplicate-session auto-retry flow.
   */
  async _forceCloseActiveSessions(userId, deviceId = null) {
    try {
      if (!userId) return;

      if (!backendTimeLogs.isBackendTimeLogsEnabled(this.config)) {
        console.warn(
          '⚠️ [TRACKING-MANAGER] Cannot force-close open sessions — backend API not configured',
        );
        return;
      }

      const {
        closeOpenSessionsAfterExplicitStop,
        resolveExplicitStopEndTime,
      } = require('../utils/session-recovery');
      const result = await closeOpenSessionsAfterExplicitStop({
        userId,
        deviceId,
          // No id: this closes every open row on the device, so no single
          // session's checkpoint applies. Falls through to each row's own
          // last_alive_at on the server.
          end_time: resolveExplicitStopEndTime() || undefined,
        config: this.config,
      });
      console.log(
        `🔒 [TRACKING-MANAGER] Force-closed open sessions: closed=${result?.closed ?? 0}`,
      );
    } catch (err) {
      console.error('❌ [TRACKING-MANAGER] _forceCloseActiveSessions exception:', err.message || err);
    }
  }

  /**
   * App data dir for durable offline payroll files
   */
  _getAppDataDir() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const userDataDir = process.env.APPDATA || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
    const appDataDir = path.join(userDataDir, 'Alyson Work Time');
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
    return appDataDir;
  }

  /**
   * Dedicated file for time-log offline queue.
   * Must NOT share offline-queue.json (screenshots/appLogs object) — that collision
   * previously wiped queued hours when either side saved.
   */
  _getTimeLogOfflineQueuePath() {
    const path = require('path');
    return path.join(this._getAppDataDir(), 'offline-time-logs.json');
  }

  /**
   * Last gate before offline rows reach the API: no queued session may extend
   * past the start of the next one.
   *
   * Queue entries arrive from several places — normal offline stops, and ledger
   * rehydration after a crash, which reconstructs sessions from disk without any
   * knowledge of what else it is reconstructing. Once these replay they are
   * historical rows, so the server cannot tell an overlap from a legitimate
   * backfill and every guard upstream has already been bypassed. Enforcing it
   * here means overlapping time can never be sent at all.
   *
   * Mutates in place; the caller persists the queue.
   */
  _clampOverlappingQueuedSessions(queue) {
    try {
      const creates = queue
        .filter((i) => i?.type === 'create_time_log' && i?.data?.start_time)
        .map((i) => ({ item: i, startMs: new Date(i.data.start_time).getTime() }))
        .filter((x) => Number.isFinite(x.startMs))
        .sort((a, b) => a.startMs - b.startMs);

      for (let i = 0; i < creates.length - 1; i += 1) {
        const cur = creates[i].item.data;
        const nextStartMs = creates[i + 1].startMs;
        const curEndMs = cur.end_time ? new Date(cur.end_time).getTime() : null;
        const overlaps = curEndMs === null || curEndMs > nextStartMs;
        if (!overlaps) continue;

        const clampedMs = Math.max(creates[i].startMs, nextStartMs);
        const before = cur.end_time || 'open';
        cur.end_time = new Date(clampedMs).toISOString();
        cur.status = 'completed';
        console.warn(
          `🔒 [TRACKING-MANAGER] Clamped queued session ${cur.id}: ${before} → ${cur.end_time} (next session starts there)`,
        );
        try {
          require('../utils/session-audit').overlapPrevented({
            where: 'offline_queue_flush',
            keptId: creates[i + 1].item.data.id,
            closedId: cur.id,
            clampedTo: cur.end_time,
            detail: { previous_end: before },
          });
        } catch (_) { /* audit is best-effort */ }
      }
    } catch (err) {
      console.warn('⚠️ [TRACKING-MANAGER] Queue overlap clamp failed:', err?.message || err);
    }
  }

  /**
   * Queue a time-log create for durable offline sync.
   * PAYROLL CRITICAL: use a stable UUID (not temp-*) so RDS/API retries are idempotent.
   */
  _queueOfflineTimeLogCreate(timeLogData, extra = {}) {
    const existingId =
      timeLogData?.id && !String(timeLogData.id).startsWith('temp-')
        ? String(timeLogData.id)
        : null;
    const stableId = existingId || crypto.randomUUID();
    const queuedTimeLog = {
      ...timeLogData,
      ...extra,
      id: stableId,
      _offline: true,
      _retryCount: 0,
      _queued_at: new Date().toISOString(),
    };

    const offlineQueue = this.getOfflineQueue();
    // Deduplicate: keep latest create for same id (never drop the hours payload).
    const filtered = offlineQueue.filter(
      (item) =>
        !(
          item?.type === 'create_time_log' &&
          String(item?.data?.id) === String(stableId)
        ),
    );

    // Close any earlier queued session that is still open, at this session's
    // start. Offline rows bypass every server-side guard when they replay, so
    // two sessions recorded during one disconnected stretch would both land
    // overlapping and each be billed in full. A new session beginning is proof
    // the previous one had ended — the same rule applied everywhere else.
    const newStartMs = new Date(queuedTimeLog.start_time).getTime();
    if (Number.isFinite(newStartMs)) {
      for (const item of filtered) {
        if (item?.type !== 'create_time_log') continue;
        const prev = item.data;
        if (!prev || prev.end_time || String(prev.id) === String(stableId)) continue;
        const prevStartMs = new Date(prev.start_time).getTime();
        if (!Number.isFinite(prevStartMs) || prevStartMs > newStartMs) continue;
        prev.end_time = new Date(Math.max(prevStartMs, newStartMs)).toISOString();
        prev.status = 'completed';
        console.warn(
          `🔒 [TRACKING-MANAGER] Closed queued offline session ${prev.id} at ${prev.end_time} — next session starts there`,
        );
      }
    }

    filtered.push({
      type: 'create_time_log',
      data: queuedTimeLog,
      timestamp: new Date().toISOString(),
    });
    this._persistOfflineQueueOrThrow(filtered);
    this._appendTimeLedger({
      event: 'queue_create',
      id: stableId,
      start_time: queuedTimeLog.start_time,
      end_time: queuedTimeLog.end_time || null,
      status: queuedTimeLog.status || 'active',
    });
    this.startOfflineSync();
    return queuedTimeLog;
  }

  /**
   * Queue a completed/update time log so stop-during-outage never loses hours
   */
  _queueOfflineTimeLogUpdate(payload) {
    const offlineQueue = this.getOfflineQueue();
    const id = payload?.id ? String(payload.id) : null;
    // Prefer a single pending update per id (latest end_time wins) so retries stay idempotent.
    const filtered = id
      ? offlineQueue.filter(
          (item) =>
            !(
              item?.type === 'update_time_log' &&
              String(item?.data?.id) === id
            ),
        )
      : offlineQueue.slice();
    filtered.push({
      type: 'update_time_log',
      data: {
        ...payload,
        _offline: true,
        _retryCount: 0,
        _queued_at: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
    this._persistOfflineQueueOrThrow(filtered);
    this._appendTimeLedger({
      event: 'queue_update',
      id: payload?.id || null,
      start_time: payload?.start_time || null,
      end_time: payload?.end_time || null,
      status: payload?.status || 'completed',
    });
    this.startOfflineSync();
  }

  /**
   * Get offline time-log queue (array)
   */
  getOfflineQueue() {
    try {
      const fs = require('fs');
      const path = require('path');
      const queuePath = this._getTimeLogOfflineQueuePath();

      if (fs.existsSync(queuePath)) {
        const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
        if (Array.isArray(parsed)) return parsed;
      }

      // One-time migration: older builds stored create_time_log items as a raw
      // array inside offline-queue.json (corrupting the screenshot queue object).
      const legacyPath = path.join(this._getAppDataDir(), 'offline-queue.json');
      if (fs.existsSync(legacyPath)) {
        const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        if (Array.isArray(legacy)) {
          const timeItems = legacy.filter(
            (item) => item && (item.type === 'create_time_log' || item.type === 'update_time_log'),
          );
          if (timeItems.length) {
            this.saveOfflineQueue(timeItems);
            console.log(`💾 [TRACKING-MANAGER] Migrated ${timeItems.length} offline time log(s) to dedicated file`);
            return timeItems;
          }
        }
      }
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error reading offline time-log queue:', error);
    }
    return [];
  }

  /**
   * Atomic durable write of offline time-log queue (tmp + fsync + rename).
   * PAYROLL CRITICAL: never silently fail — callers that must not lose hours use
   * `_persistOfflineQueueOrThrow`.
   */
  saveOfflineQueue(queue) {
    try {
      this._persistOfflineQueueOrThrow(queue);
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error saving offline time-log queue:', error);
    }
  }

  _persistOfflineQueueOrThrow(queue) {
    const fs = require('fs');
    const queuePath = this._getTimeLogOfflineQueuePath();
    const dir = require('path').dirname(queuePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload = JSON.stringify(Array.isArray(queue) ? queue : [], null, 2);
    const tmp = `${queuePath}.${process.pid}.${Date.now()}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, payload, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, queuePath);
    // Best-effort fsync of directory entry on POSIX
    try {
      const dirFd = fs.openSync(dir, 'r');
      fs.fsyncSync(dirFd);
      fs.closeSync(dirFd);
    } catch (_) { /* windows / restricted FS */ }
    console.log(
      '💾 [TRACKING-MANAGER] Offline time-log queue saved with',
      (Array.isArray(queue) ? queue : []).length,
      'items',
    );
  }

  _getTimeLedgerPath() {
    const path = require('path');
    return path.join(this._getAppDataDir(), 'time-ledger.jsonl');
  }

  /**
   * Append-only local payroll ledger — survives even if queue rewrite is interrupted.
   * Used to re-queue any segments that never reached RDS.
   */
  _appendTimeLedger(entry) {
    try {
      const fs = require('fs');
      const filePath = this._getTimeLedgerPath();
      const line = JSON.stringify({
        v: 1,
        at: new Date().toISOString(),
        ...entry,
      });
      fs.appendFileSync(filePath, `${line}\n`, 'utf8');
    } catch (err) {
      console.warn('⚠️ [TRACKING-MANAGER] time-ledger append failed:', err?.message || err);
    }
  }

  /**
   * On launch: re-queue any ledger close/create rows that are not yet reflected
   * in offline-time-logs.json (belt-and-suspenders against interrupted saves).
   */
  _rehydrateOfflineQueueFromLedger() {
    try {
      const fs = require('fs');
      const ledgerPath = this._getTimeLedgerPath();
      if (!fs.existsSync(ledgerPath)) return;

      const queue = this.getOfflineQueue();
      const queuedIds = new Set(
        queue
          .map((item) => String(item?.data?.id || ''))
          .filter(Boolean),
      );
      const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
      // Keep last event per id
      const lastById = new Map();
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          if (row?.id) lastById.set(String(row.id), row);
        } catch (_) { /* skip bad line */ }
      }

      let added = 0;
      for (const [id, row] of lastById.entries()) {
        if (row.event !== 'queue_create' && row.event !== 'queue_update') continue;

        // If queue already has this id, MERGE later end_time into create/update —
        // never skip a completed ledger update when only an active create remains.
        if (queuedIds.has(id)) {
          if (row.event === 'queue_update' && row.end_time) {
            let merged = false;
            for (const item of queue) {
              if (String(item?.data?.id) !== id) continue;
              const prevEnd = item.data?.end_time
                ? new Date(item.data.end_time).getTime()
                : 0;
              const nextEnd = new Date(row.end_time).getTime();
              if (!Number.isFinite(nextEnd)) continue;
              if (!Number.isFinite(prevEnd) || nextEnd >= prevEnd) {
                item.data.end_time = row.end_time;
                item.data.status = row.status || 'completed';
                if (row.start_time && !item.data.start_time) {
                  item.data.start_time = row.start_time;
                }
                // Promote stranded active create → completed create for one-shot sync.
                if (item.type === 'create_time_log') {
                  item.data.status = 'completed';
                }
                merged = true;
              }
            }
            if (merged) added += 1;
          }
          continue;
        }

        // Only rehydrate if we still have start+end (completed work) or active create.
        if (row.event === 'queue_update' && row.end_time) {
          queue.push({
            type: 'update_time_log',
            data: {
              id,
              user_id: row.user_id || this.config?.user_id,
              start_time: row.start_time,
              end_time: row.end_time,
              status: row.status || 'completed',
              _offline: true,
              _retryCount: 0,
              _rehydrated_from_ledger: true,
            },
            timestamp: new Date().toISOString(),
          });
          added += 1;
        } else if (row.event === 'queue_create' && row.start_time) {
          queue.push({
            type: 'create_time_log',
            data: {
              id,
              user_id: row.user_id || this.config?.user_id,
              start_time: row.start_time,
              end_time: row.end_time || null,
              status: row.status || (row.end_time ? 'completed' : 'active'),
              device_id: getDeviceId(),
              is_manual: false,
              _offline: true,
              _retryCount: 0,
              _rehydrated_from_ledger: true,
            },
            timestamp: new Date().toISOString(),
          });
          added += 1;
        }
      }

      if (added > 0) {
        this._persistOfflineQueueOrThrow(queue);
        console.log(
          `💾 [TRACKING-MANAGER] Rehydrated ${added} time-log item(s) from local ledger`,
        );
      }
    } catch (err) {
      console.warn('⚠️ [TRACKING-MANAGER] Ledger rehydrate failed:', err?.message || err);
    }
  }

  /**
   * Start offline sync timer
   */
  startOfflineSync() {
    // If already running, don't start another
    if (this.offlineSyncTimer) {
      // Still kick an immediate flush when caller asks again (wake / online).
      void this._flushOfflineQueueIfOnline();
      return;
    }
    
    console.log('🔄 [TRACKING-MANAGER] Starting offline sync timer');
    
    // Aggressive retry while queue has payroll items (was 30s).
    this.offlineSyncTimer = setInterval(() => {
      this._flushOfflineQueueIfOnline();
    }, 10_000);
    if (typeof this.offlineSyncTimer.unref === 'function') {
      this.offlineSyncTimer.unref();
    }
    
    // Immediate attempt + staggered retries (reconnect often needs a beat)
    setTimeout(() => this._flushOfflineQueueIfOnline(), 0);
    setTimeout(() => this._flushOfflineQueueIfOnline(), 1500);
    setTimeout(() => this._flushOfflineQueueIfOnline(), 5000);
    setTimeout(() => this._flushOfflineQueueIfOnline(), 15000);

    // When the machine wakes / network returns, flush queued hours ASAP.
    if (!this._offlineResumeHooksBound) {
      this._offlineResumeHooksBound = true;
      try {
        const { powerMonitor, net } = require('electron');
        if (powerMonitor?.on) {
          const flushOnWake = (label) => {
            console.log(`🔄 [TRACKING-MANAGER] ${label} — flushing offline time logs`);
            try {
              this._rehydrateOfflineQueueFromLedger?.();
            } catch (_) { /* ignore */ }
            this.startOfflineSync();
            void this.processOfflineQueue();
            // Extra passes — first attempt often races DNS/VPN after wake.
            setTimeout(() => void this.processOfflineQueue(), 2000);
            setTimeout(() => void this.processOfflineQueue(), 8000);
          };
          powerMonitor.on('resume', () => flushOnWake('System resume'));
          powerMonitor.on('unlock-screen', () => flushOnWake('Screen unlock'));
        }
        // Edge-detect Chromium online status (low → good internet).
        if (net && typeof net.isOnline === 'function') {
          this._wasOfflineForSync = !net.isOnline();
          if (!this._onlinePollTimer) {
            this._onlinePollTimer = setInterval(() => {
              try {
                const online = net.isOnline();
                if (online && this._wasOfflineForSync) {
                  console.log('🌐 [TRACKING-MANAGER] Network restored — flushing offline time logs');
                  try {
                    this._rehydrateOfflineQueueFromLedger?.();
                  } catch (_) { /* ignore */ }
                  this.startOfflineSync();
                  void this.processOfflineQueue();
                  setTimeout(() => void this.processOfflineQueue(), 3000);
                }
                this._wasOfflineForSync = !online;
              } catch (_) { /* ignore */ }
            }, 3000);
            if (typeof this._onlinePollTimer.unref === 'function') {
              this._onlinePollTimer.unref();
            }
          }
        }
      } catch (_) { /* ignore */ }
      try {
        const { app } = require('electron');
        if (app && typeof app.on === 'function') {
          app.on('browser-window-focus', () => {
            const q = this.getOfflineQueue();
            if (q.length > 0) {
              this.startOfflineSync();
              void this._flushOfflineQueueIfOnline();
            }
          });
        }
      } catch (_) { /* ignore */ }
    }
  }

  _flushOfflineQueueIfOnline() {
    try {
      const { net } = require('electron');
      if (net && typeof net.isOnline === 'function' && !net.isOnline()) {
        this._wasOfflineForSync = true;
        return;
      }
    } catch (_) { /* proceed and let fetch fail */ }
    void this.processOfflineQueue();
  }

  /**
   * Process offline time-log queue — never drop payroll items
   */
  async processOfflineQueue() {
    if (this._processingOfflineQueue) return;
    this._processingOfflineQueue = true;

    try {
      const queue = this.getOfflineQueue();
      if (queue.length === 0) {
        if (this.offlineSyncTimer) {
          clearInterval(this.offlineSyncTimer);
          this.offlineSyncTimer = null;
        }
        return;
      }

      console.log('📶 [TRACKING-MANAGER] Processing offline time-log queue with', queue.length, 'items');

      this._clampOverlappingQueuedSessions(queue);

      const remainingItems = [];

      for (const item of queue) {
        try {
          if (item.type === 'create_time_log') {
            const timeLogData = { ...item.data };
            delete timeLogData._offline;
            delete timeLogData._retryCount;
            delete timeLogData._queued_at;
            delete timeLogData._rehydrated_from_ledger;
            // PAYROLL CRITICAL: keep stable UUID across retries (idempotent after RDS timeout).
            const stableId =
              timeLogData.id && !String(timeLogData.id).startsWith('temp-')
                ? String(timeLogData.id)
                : crypto.randomUUID();
            timeLogData.id = stableId;
            // Persist stable id back onto queue item for future retries
            if (item.data) item.data.id = stableId;

            let timeLog = null;
            if (backendTimeLogs.isBackendTimeLogsEnabled(this.config)) {
              const orgId =
                global.currentOrganizationId ||
                this.config.organization_id ||
                null;
              try {
                timeLog = await backendTimeLogs.createTimeLog(
                  {
                    ...timeLogData,
                    organization_id: orgId,
                  },
                  this.config,
                  { timeoutMs: 12_000 },
                );
              } catch (createErr) {
                // Treat duplicate/conflict as success — prior attempt likely committed.
                const msg = String(createErr?.message || createErr || '').toLowerCase();
                if (
                  msg.includes('duplicate') ||
                  msg.includes('unique') ||
                  msg.includes('already exists') ||
                  msg.includes('conflict')
                ) {
                  timeLog = { id: stableId, ...timeLogData };
                  console.warn(
                    '⚠️ [TRACKING-MANAGER] Create conflict treated as synced:',
                    stableId,
                  );
                } else {
                  throw createErr;
                }
              }
            } else {
              // Throwing keeps the item queued and retried — never dropped.
              throw new Error('Backend API not configured for offline time log sync');
            }

            console.log('✅ [TRACKING-MANAGER] Synced offline time log:', timeLog.id);
            this._appendTimeLedger({
              event: 'synced_create',
              id: timeLog.id,
              start_time: timeLogData.start_time,
              end_time: timeLogData.end_time || null,
              status: timeLogData.status,
            });

            // If this is the current session, update the ID
            const prevId = item.data?.id || stableId;
            if (
              this.currentTimeLogId === prevId ||
              this.currentTimeLogId === stableId ||
              (String(this.currentTimeLogId || '').startsWith('temp-') &&
                String(prevId).startsWith('temp-'))
            ) {
              this.currentTimeLogId = timeLog.id;
              global.currentTimeLogId = timeLog.id;
              if (this.currentSession) {
                this.currentSession.id = timeLog.id;
                this.currentSession.time_log_id = timeLog.id;
                delete this.currentSession._offline;
              }
              if (global.currentSession) {
                global.currentSession.id = timeLog.id;
                global.currentSession.time_log_id = timeLog.id;
                delete global.currentSession._offline;
              }

              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('time-log-id-updated', {
                  oldId: prevId,
                  newId: timeLog.id,
                });
              }
            }
          } else if (item.type === 'update_time_log') {
            const updates = { ...item.data };
            const id = updates.id;
            delete updates.id;
            delete updates._offline;
            delete updates._retryCount;
            delete updates._queued_at;
            delete updates._rehydrated_from_ledger;
            delete updates.action;

            if (!id || String(id).startsWith('temp-')) {
              // Convert stranded temp updates into a completed create (stable UUID).
              const completedId =
                id && !String(id).startsWith('temp-') ? String(id) : crypto.randomUUID();
              const startTime =
                updates.start_time ||
                this._readSessionCheckpoint()?.startTime ||
                null;
              if (!startTime || !updates.end_time) {
                throw new Error(
                  'Cannot sync stranded update without start_time and end_time',
                );
              }
              const createPayload = {
                id: completedId,
                user_id: updates.user_id || this.config.user_id,
                project_id: updates.project_id || this.currentProjectId || null,
                start_time: startTime,
                end_time: updates.end_time,
                status: 'completed',
                is_manual: false,
                idle_seconds: updates.idle_seconds || 0,
                device_id: updates.device_id || getDeviceId(),
              };
              if (backendTimeLogs.isBackendTimeLogsEnabled(this.config)) {
                const orgId =
                  global.currentOrganizationId ||
                  this.config.organization_id ||
                  null;
                await backendTimeLogs.createTimeLog(
                  { ...createPayload, organization_id: orgId },
                  this.config,
                );
              } else {
                throw new Error('Backend API not configured for offline completed create');
              }
              console.log('✅ [TRACKING-MANAGER] Synced offline completed temp session');
              this._appendTimeLedger({
                event: 'synced_update_as_create',
                id: completedId,
                start_time: startTime,
                end_time: updates.end_time,
                status: 'completed',
              });
            } else if (backendTimeLogs.isBackendTimeLogsEnabled(this.config)) {
              try {
                await backendTimeLogs.updateTimeLog(id, updates, this.config, {
                  timeoutMs: 12_000,
                });
              } catch (updErr) {
                // Row missing (create still pending / lost) → upsert as completed create.
                const msg = String(updErr?.message || updErr || '').toLowerCase();
                const canCreate =
                  updates.end_time &&
                  (updates.start_time ||
                    this._readSessionCheckpoint()?.startTime);
                if (
                  canCreate &&
                  (msg.includes('not found') ||
                    msg.includes('no rows') ||
                    msg.includes('0 rows') ||
                    msg.includes('no_row'))
                ) {
                  const startTime =
                    updates.start_time ||
                    this._readSessionCheckpoint()?.startTime;
                  const orgId =
                    global.currentOrganizationId ||
                    this.config.organization_id ||
                    null;
                  await backendTimeLogs.createTimeLog(
                    {
                      id,
                      user_id: updates.user_id || this.config.user_id,
                      project_id: updates.project_id || this.currentProjectId || null,
                      start_time: startTime,
                      end_time: updates.end_time,
                      status: 'completed',
                      is_manual: false,
                      idle_seconds: updates.idle_seconds || 0,
                      device_id: updates.device_id || getDeviceId(),
                      organization_id: orgId,
                    },
                    this.config,
                    { timeoutMs: 12_000 },
                  );
                } else {
                  throw updErr;
                }
              }
              console.log('✅ [TRACKING-MANAGER] Synced offline time log update:', id);
              this._appendTimeLedger({
                event: 'synced_update',
                id,
                start_time: updates.start_time || null,
                end_time: updates.end_time || null,
                status: updates.status || null,
              });
            } else {
              throw new Error('Backend API not configured for offline time log update');
            }
          } else {
            // Unknown item types are kept so we never silently discard payroll data
            remainingItems.push(item);
            continue;
          }
        } catch (error) {
          console.error('❌ [TRACKING-MANAGER] Failed to sync offline item (will retry forever):', error?.message || error);
          if (item.data) {
            item.data._retryCount = (item.data._retryCount || 0) + 1;
          }
          // PAYROLL CRITICAL: never drop time-log items — keep retrying indefinitely
          remainingItems.push(item);
        }
      }

      const hadItems = queue.length > 0;
      const syncedCount = queue.length - remainingItems.length;
      this._persistOfflineQueueOrThrow(remainingItems);

      if (remainingItems.length === 0 && this.offlineSyncTimer) {
        clearInterval(this.offlineSyncTimer);
        this.offlineSyncTimer = null;
        console.log('✅ [TRACKING-MANAGER] Offline time-log queue processed successfully');
      } else if (remainingItems.length > 0) {
        // Keep hammering until empty — never leave payroll stranded without a timer.
        this.startOfflineSync();
      }

      // After any successful sync, refresh UI totals — but NEVER clear last-good.
      // Partial remote reads right after flush used to wipe the floor and drop
      // the local clock (sync must never reduce recorded time on-device).
      if (hadItems && syncedCount > 0) {
        try {
          global._todayStatsInFlight = null;
          global._postOfflineSyncGraceUntil = Date.now() + 90 * 1000;
        } catch (_) { /* ignore */ }
        try {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('offline-time-logs-synced', {
              syncedCount,
              remaining: remainingItems.length,
            });
          }
        } catch (_) { /* ignore */ }
      }
    } finally {
      this._processingOfflineQueue = false;
    }
  }

  /**
   * Cleanup function for registry
   */
  shutdown() {
    try {
      console.log('🧹 [TRACKING-MANAGER] Shutting down...');
      
      if (this.isTracking) {
        this.stopTracking('shutdown');
      }
      
      // Clear offline sync timer
      if (this.offlineSyncTimer) {
        clearInterval(this.offlineSyncTimer);
        this.offlineSyncTimer = null;
      }
      
      this.removeAllListeners();
      
      console.log('✅ [TRACKING-MANAGER] Shutdown complete');
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error during shutdown:', error);
    }
  }
}

// Register with cleanup registry if available
if (typeof global !== 'undefined' && global.cleanupRegistry) {
  global.cleanupRegistry.register('tracking-manager', () => {
    if (global.trackingManager && global.trackingManager.shutdown) {
      global.trackingManager.shutdown();
    }
  });
}

module.exports = TrackingManager;