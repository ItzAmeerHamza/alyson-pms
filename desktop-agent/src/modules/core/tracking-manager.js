/**
 * TrackingManager - Centralized tracking state and stop/pause/resume operations
 * Extracted from main.js to improve modularity and maintainability
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const debugLogger = require('../utils/debug-logger');
const { getDeviceId } = require('../utils/device-id');
const { computeTodayTimeLogSeconds } = require('../utils/today-time-log-stats');
const backendTimeLogs = require('../utils/backend-time-logs');

class TrackingManager extends EventEmitter {
  constructor(config, dependencies = {}) {
    super();
    this.config = config;
    this.supabaseService = dependencies.supabaseService;
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
      const pending = this.getOfflineQueue();
      if (pending.length > 0) {
        console.log(`📶 [TRACKING-MANAGER] Found ${pending.length} offline time log(s) — starting sync`);
        this.startOfflineSync();
      }
    } catch (_) {}
    
    console.log('🔧 TrackingManager dependencies initialized', {
      hasEnhancedAppDetector: !!this.enhancedAppDetector
    });
  }

  /**
   * Start tracking session
   */
  async startTracking(projectId = null) {
try {
      const __startupTimestamp = Date.now();
      const __phase = (label) => {
        const elapsed = Date.now() - __startupTimestamp;
        console.log(`⏱️ [STARTUP-TIMING] ${label}: +${elapsed}ms`);
      };

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
      global.userExplicitlyStopped = false;
      global._windowCloseHandled = false;
      global._stopEndTimeOverride = null;

      await this._waitForPriorStopToFinish();

      debugLogger.init('tracking', 'Starting tracking session', {
        projectId: projectId,
        currentTracking: this.isTracking,
        currentPaused: this.isPaused,
        hasCurrentSession: !!this.currentSession,
        currentTimeLogId: this.currentTimeLogId
      });

      // SYNCHRONOUS HEALTH CHECK: Block timer start if permissions are missing
      if (global.systemMonitor) {
        console.log('🔒 [TRACKING-MANAGER] Performing permission check before starting timer...');
        
          try {
            const healthCheck = await global.systemMonitor.performComprehensiveHealthCheck();
            
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
          console.error('❌ [TRACKING-MANAGER] Health check failed:', error);
          // BLOCK timer start on health check failure
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('permission-required', {
              issues: ['Health check system failure: ' + error.message],
              message: 'Cannot start timer - system check failed. Please copy logs and send to IT support.'
            });
          }
          return {
            success: false,
            error: 'health_check_failed',
            message: 'Cannot start timer - system check failed: ' + error.message
          };
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

      if (!this.supabaseService) {
        // Fallback to global supabase if dependency injection failed
        // Try service role first, then authenticated client, then anonymous client
        this.supabaseService = global.supabaseService || global.supabaseClient || global.supabase;
        debugLogger.guard('tracking', 'Using fallback Supabase service', {
          hasGlobalSupabaseService: !!global.supabaseService,
          hasGlobalSupabaseClient: !!global.supabaseClient,
          hasGlobalSupabase: !!global.supabase,
          foundFallback: !!this.supabaseService
        });
      }
      const useBackendTimeLogs = backendTimeLogs.isBackendTimeLogsEnabled(this.config);
      if (!useBackendTimeLogs && !this.supabaseService) {
        debugLogger.guard('tracking', 'Supabase service not available - cannot start tracking', {
          supabaseService: !!this.supabaseService,
          globalSupabaseService: !!global.supabaseService,
          globalSupabaseClient: !!global.supabaseClient
        });
        throw new Error('Supabase service not available');
      }

      // Guard: ensure we have a valid user ID before proceeding
      const effectiveUserId = this.config.user_id || global.currentUserId;
      if (!effectiveUserId) {
        throw new Error('User not authenticated');
      }

      // Close any existing unclosed sessions for THIS DEVICE before creating a new one.
      // Uses device-scoped close so other devices' sessions are not affected.
      const deviceId = getDeviceId();
      console.log(`🔒 [TRACKING-MANAGER] Pre-insert cleanup for user ${effectiveUserId}, device ${deviceId}`);
      await this._forceCloseActiveSessions(effectiveUserId, deviceId);

      if (global.sessionManager && global.sessionManager.closeExistingSessionsBeforeStart) {
        const cleanupResult = await global.sessionManager.closeExistingSessionsBeforeStart();
        if (cleanupResult && !cleanupResult.success) {
          console.warn('⚠️ [TRACKING-MANAGER] SessionManager cleanup also reported failure (non-critical, RPC already ran)');
        }
      }

      const finalProjectId = projectId || global.currentProjectId || this.config.project_id || null;
      const startTimeIso = new Date().toISOString();

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

      if (useBackendTimeLogs) {
        try {
          const orgId =
            global.currentOrganizationId ||
            this.config.organization_id ||
            null;
          await backendTimeLogs.closeActiveSessions(effectiveUserId, deviceId, this.config);
          const newId = crypto.randomUUID();
          timeLog = await backendTimeLogs.createTimeLog(
            {
              id: newId,
              ...timeLogData,
              organization_id: orgId,
            },
            this.config,
          );
          error = null;
          console.log('✅ [TRACKING-MANAGER] RDS time log created:', timeLog.id);
        } catch (e) {
          error = e;
          timeLog = null;
          console.error('❌ [TRACKING-MANAGER] RDS create_time_log failed:', e.message || e);
        }
      } else {
        try {
          const resp = await this.supabaseService
            .from('time_logs')
            .insert([timeLogData])
            .select()
            .single();
          timeLog = resp.data;
          error = resp.error;
        } catch (e) {
          error = e;
        }
      }

      console.timeEnd('T4-T5: time_logs insert');
      console.log('💾 [TRACKING-MANAGER] T5: After time_logs insert:', new Date().toISOString());

      if (error) {
        // Special fallback: Some packaged builds see "Content-Type not acceptable: text/plain" from postgrest-js
        // Work around by calling PostgREST directly with explicit headers
        const errMsg = (error && (error.message || String(error))) || '';
        const shouldUseDirectPost = errMsg.includes('Content-Type not acceptable') || errMsg.includes('406');
        if (shouldUseDirectPost && global.config && global.config.supabase_url) {
          try {
            console.log('🛠️ [TRACKING-MANAGER] Applying direct PostgREST fallback for time_logs insert');
            const fetchImpl = global.fetch || require('node-fetch');
            const url = `${global.config.supabase_url.replace(/\/$/, '')}/rest/v1/time_logs`;
            // SECURITY: Use the authenticated user's access token (not the service key)
            const anonKey = global.config.supabase_key || global.config.VITE_SUPABASE_ANON_KEY || global.config.SUPABASE_ANON_KEY;
            let bearerToken = anonKey;
            try {
              const { data: sess } = await this.supabaseService.auth.getSession();
              if (sess?.session?.access_token) bearerToken = sess.session.access_token;
            } catch (_) { /* use anon key if session unavailable */ }
            const headers = {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Prefer': 'return=representation',
              'apikey': anonKey,
              'Authorization': `Bearer ${bearerToken}`
            };
            const res = await fetchImpl(url, {
              method: 'POST',
              headers,
              body: JSON.stringify([timeLogData])
            });
            const contentType = res.headers.get('content-type') || '';
            if (!res.ok) {
              const text = await res.text();
              throw new Error(`Direct insert failed (${res.status}): ${text}`);
            }
            if (!contentType.includes('application/json')) {
              const text = await res.text();
              console.warn('⚠️ [TRACKING-MANAGER] Direct insert returned non-JSON, attempting to parse:', contentType);
              try { timeLog = JSON.parse(text)[0]; } catch { timeLog = null; }
            } else {
              const json = await res.json();
              timeLog = Array.isArray(json) ? json[0] : json;
            }
            error = null;
            console.log('✅ [TRACKING-MANAGER] Direct PostgREST insert succeeded');
          } catch (directErr) {
            console.error('❌ [TRACKING-MANAGER] Direct PostgREST fallback failed:', directErr);
          }
        }
      }

      // AUTO-RETRY: Handle duplicate active session constraint violation
      if (error) {
        const errMsg = (error && (error.message || error.details || String(error))) || '';
        const isDuplicateSession = errMsg.includes('idx_one_active_session_per_user') ||
          errMsg.includes('duplicate key') ||
          error.code === '23505';

        if (isDuplicateSession) {
          console.warn('⚠️ [TRACKING-MANAGER] Duplicate active session detected - force-closing existing session and retrying...');
          try {
            await this._forceCloseActiveSessions(effectiveUserId, getDeviceId());
            // Retry the insert once
            const retryResp = await this.supabaseService
              .from('time_logs')
              .insert([timeLogData])
              .select()
              .single();
            if (retryResp.error) {
              console.error('❌ [TRACKING-MANAGER] Retry insert also failed:', retryResp.error);

              // SESSION ADOPTION: If cleanup + retry both failed, adopt the existing active session
              console.log('🔄 [TRACKING-MANAGER] Attempting session adoption fallback...');
              try {
                const { data: existingSession, error: fetchErr } = await this.supabaseService
                  .from('time_logs')
                  .select('*')
                  .eq('user_id', effectiveUserId)
                  .eq('status', 'active')
                  .order('start_time', { ascending: false })
                  .limit(1)
                  .single();
                if (existingSession && !fetchErr) {
                  timeLog = existingSession;
                  error = null;
                  console.log(`✅ [TRACKING-MANAGER] Adopted existing active session: ${existingSession.id} (started ${existingSession.start_time})`);
                } else {
                  console.error('❌ [TRACKING-MANAGER] Session adoption failed - could not find active session:', fetchErr?.message || fetchErr);
                }
              } catch (adoptErr) {
                console.error('❌ [TRACKING-MANAGER] Session adoption exception:', adoptErr.message || adoptErr);
              }
            } else {
              timeLog = retryResp.data;
              error = null;
              console.log('✅ [TRACKING-MANAGER] Retry insert succeeded after closing stale session');
            }
          } catch (retryErr) {
            console.error('❌ [TRACKING-MANAGER] Retry after duplicate-session cleanup failed:', retryErr);
          }
        }
      }

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
        let completedTodayBeforeSessionSeconds = 0;
        try {
          const { isBackendTimeLogsEnabled } = require('../utils/backend-time-logs');
          const supabase = global.supabaseClient || this.supabaseService || global.supabaseService || global.supabase;
          if (effectiveUserId && timeLog?.id && (supabase || isBackendTimeLogsEnabled())) {
            const agg = await computeTodayTimeLogSeconds(supabase, effectiveUserId, timeLog.id, true);
            completedTodayBeforeSessionSeconds = this._resolveTodayBaseSeconds(agg.completedClosedSeconds);
          }
        } catch (aggErr) {
          console.warn('⚠️ [TRACKING-MANAGER] Could not load today cumulative base:', aggErr?.message || aggErr);
        }
        global.trayManager.updateState(true, false, {
          projectName,
          projectId: this.currentProjectId,
          startTime: this.sessionStartTime,
          completedTodayBeforeSessionSeconds
        });
        console.log('✅ [TRAY] Icon updated immediately after state set');
      }

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
              const timersActive = (global.enhancedScreenshotManager?.windowTimers?.length || 0) > 0 || !!global.enhancedScreenshotManager?._windowInterval;
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
        __phase('Input detection dispatched (non-blocking)');
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

      // Notify renderer
      try {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('tracking-started', this.currentSession);
        }
      } catch {}

      __phase('All subsystems initialized');
      console.log(`✅ [TRACKING-MANAGER] Tracking started with time log ID: ${this.currentTimeLogId}`);

      this._startTimeLogCheckpoint();

      // Tray icon was already updated immediately after state set (before subsystem init).
      // No second updateState call needed here.

      return {
        success: true,
        timeLogId: this.currentTimeLogId,
        projectId: this.currentProjectId,
        startTime: this.sessionStartTime,
        isTracking: true,
        offline: !!(this.currentSession?._offline || String(this.currentTimeLogId || '').startsWith('temp-'))
      };
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Failed to start tracking:', error);
      this.isTracking = false;
      this.isPaused = false;
      return { success: false, error: error.message };
    }
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
      // ALWAYS set this flag regardless of current state — belt and suspenders
      global.userExplicitlyStopped = true;

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
      // CRITICAL: Mark explicit user stop to prevent health check from auto-recovering stale sessions
      global.userExplicitlyStopped = true;
      
      // Capture timeLogId for background DB update
      const timeLogIdForBackground = this.currentTimeLogId;

      // Freeze end time and displayed total at click — DB write may finish seconds later.
      global._stopEndTimeOverride = new Date().toISOString();
      this._captureStopTodayTotalSnapshot();
      
      // Update local state immediately
      this.isTracking = false;
      this.isPaused = false;
      
      // Propagate to global immediately
      global.isTracking = false;
      global.isPaused = false;
      // CRITICAL FIX: Send tracking-stopped to renderer IMMEDIATELY in Phase 1
      // This allows renderer to stop ActivityMonitor polling before slow cleanup
      try {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('tracking-stopped', { 
            reason: reason || 'manual',
            message: message || 'Time tracking stopped',
            timestamp: new Date().toISOString(),
            forceStop: true
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
      
      // Close any open URL slices for this user
      try {
        const userId = global.currentUserId;
        const supabase = global.supabaseClient || global.supabaseService;
        if (userId && supabase) {
          await supabase.from('app_url_activity')
            .update({ ended_at: new Date().toISOString() })
            .eq('user_id', userId)
            .is('ended_at', null);
          console.log('✅ [TRACKING-MANAGER] Closed open URL slices on stop');
        }
      } catch (urlCloseErr) {
        console.warn('⚠️ [TRACKING-MANAGER] Failed to close URL slices (non-fatal):', urlCloseErr?.message);
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
    
    // ALWAYS set this flag regardless of current state
    global.userExplicitlyStopped = true;
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

  async _waitForPriorStopToFinish(maxMs = 15000) {
    const started = Date.now();
    while ((global.isStopping || global._isStoppingTracking) && Date.now() - started < maxMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (global.isStopping || global._isStoppingTracking) {
      console.warn('⚠️ [TRACKING-MANAGER] Starting while a prior stop is still in progress');
    }
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
      const freshTotal = base + elapsed;
      const trayCumulative =
        typeof tray?._lastCumulativeSeconds === 'number' ? Math.floor(tray._lastCumulativeSeconds) : 0;
      const total = Math.max(freshTotal, trayCumulative, global._lastTodayTotalAtStop || 0);
      if (total > 0) {
        global._lastTodayTotalAtStop = total;
        console.log(`⏱️ [TRACKING-MANAGER] Stop snapshot: ${total}s (fresh=${freshTotal}, tray=${trayCumulative})`);
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
    const floor = Math.max(0, Math.floor(Number(global._lastTodayTotalAtStop) || 0));
    const resolved = Math.max(db, floor);
    if (floor > db) {
      console.log(`⏱️ [TRACKING-MANAGER] Using stop snapshot total ${floor}s (DB had ${db}s)`);
    }
    if (db >= floor) {
      global._lastTodayTotalAtStop = null;
    }
    return resolved;
  }

  _startTimeLogCheckpoint() {
    this._stopTimeLogCheckpoint();
    if (!backendTimeLogs.isBackendTimeLogsEnabled(this.config)) return;

    const CHECKPOINT_MS = 90 * 1000;
    this._timeLogCheckpointInterval = setInterval(() => {
      void this._checkpointCurrentTimeLog();
    }, CHECKPOINT_MS);
  }

  _stopTimeLogCheckpoint() {
    if (this._timeLogCheckpointInterval) {
      clearInterval(this._timeLogCheckpointInterval);
      this._timeLogCheckpointInterval = null;
    }
  }

  async _checkpointCurrentTimeLog() {
    const timeLogId = this.currentTimeLogId || global.currentTimeLogId;
    if (!this.isTracking || !timeLogId) return;
    // Temp offline IDs are not in RDS yet — updating them only produces noise / 500s.
    if (String(timeLogId).startsWith('temp-')) return;

    try {
      await backendTimeLogs.updateTimeLog(
        timeLogId,
        { status: 'active' },
        this.config,
      );
    } catch (err) {
      console.warn('⚠️ [TRACKING-MANAGER] Time log checkpoint failed:', err?.message || err);
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
   * FIXED: Uses authenticated supabaseService instead of raw fetch with wrong config names
   */
  async _endCurrentTimeLogBackground(timeLogId) {
    if (!timeLogId) {
      console.log('⚠️ [TRACKING-MANAGER] No timeLogId provided to _endCurrentTimeLogBackground');
      return { success: false, reason: 'no_time_log_id' };
    }

    // FIX-8: Use endTimeOverride if available (idle auto-stop sets this to
    // now − idle-prompt threshold, typically exactly 10 minutes).
    const endTime = global._stopEndTimeOverride || new Date().toISOString();
    const userId = this.config.user_id;
    const isTempOfflineId = String(timeLogId).startsWith('temp-');
    
    console.log(`🔄 [TRACKING-MANAGER] Closing time log ${timeLogId} with end_time ${endTime}`);
    
    // Store pending session close for fallback (in case of failure)
    this._storePendingSessionClose(timeLogId, endTime, userId);

    const supabase = this.supabaseService || global.supabaseService || global.supabaseClient;
    const useBackendTimeLogs = backendTimeLogs.isBackendTimeLogsEnabled(this.config);

    if (!useBackendTimeLogs && !supabase) {
      console.error('❌ [TRACKING-MANAGER] No database client available for database update');
      return { success: false, reason: 'no_db_client' };
    }

    try {
      let idleSeconds = 0;
      try {
        const sessionStart = this.sessionStartTime || this.currentSession?.start_time;
        if (sessionStart && supabase) {
          const { data: idleLogs } = await supabase
            .from('idle_logs')
            .select('idle_start, idle_end, duration_seconds')
            .eq('user_id', userId)
            .gte('idle_start', sessionStart)
            .lte('idle_start', endTime);

          if (idleLogs && idleLogs.length > 0) {
            const sessionStartMs = new Date(sessionStart).getTime();
            const sessionEndMs = new Date(endTime).getTime();
            for (const idle of idleLogs) {
              if (idle.duration_seconds) {
                idleSeconds += idle.duration_seconds;
              } else if (idle.idle_start && idle.idle_end) {
                const iStart = Math.max(new Date(idle.idle_start).getTime(), sessionStartMs);
                const iEnd = Math.min(new Date(idle.idle_end).getTime(), sessionEndMs);
                if (iEnd > iStart) idleSeconds += Math.floor((iEnd - iStart) / 1000);
              }
            }
          }
        }
      } catch (idleErr) {
        console.warn('⚠️ [TRACKING-MANAGER] Could not compute idle_seconds:', idleErr.message);
      }

      // Offline temp sessions were never inserted — create a completed row now
      // so worked time is not lost when the employee stops before sync.
      if (isTempOfflineId) {
        const startTime =
          this.sessionStartTime ||
          this.currentSession?.start_time ||
          endTime;
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
          if (useBackendTimeLogs) {
            const orgId =
              global.currentOrganizationId ||
              this.config.organization_id ||
              null;
            await backendTimeLogs.createTimeLog(
              {
                id: crypto.randomUUID(),
                ...createPayload,
                organization_id: orgId,
              },
              this.config,
            );
          } else {
            const { error } = await supabase.from('time_logs').insert([createPayload]);
            if (error) {
              throw error;
            }
          }
        } catch (persistErr) {
          // Still offline — replace queued active create with a completed create
          console.warn('⚠️ [TRACKING-MANAGER] Offline temp persist failed — queuing completed session:', persistErr?.message || persistErr);
          try {
            const queue = this.getOfflineQueue().filter(
              (item) => !(item.type === 'create_time_log' && item.data?.id === timeLogId),
            );
            queue.push({
              type: 'create_time_log',
              data: {
                id: timeLogId,
                ...createPayload,
                _offline: true,
                _retryCount: 0,
              },
              timestamp: new Date().toISOString(),
            });
            this.saveOfflineQueue(queue);
            this.startOfflineSync();
          } catch (_) {}
          // Local stop still succeeds — hours are durable on disk
          return { success: true, queued: true };
        }

        // Drop the queued create so we don't insert a duplicate active session later.
        try {
          const queue = this.getOfflineQueue().filter(
            (item) => !(item.type === 'create_time_log' && item.data?.id === timeLogId),
          );
          this.saveOfflineQueue(queue);
        } catch (_) {}

        console.log(`✅ [TRACKING-MANAGER] Offline temp session persisted as completed (${startTime} → ${endTime})`);
        this._clearPendingSessionClose(timeLogId);
        return { success: true };
      }

      const updatePayload = {
        end_time: endTime,
        status: 'completed',
        idle_seconds: idleSeconds || 0,
      };

      if (useBackendTimeLogs) {
        await backendTimeLogs.updateTimeLog(timeLogId, updatePayload, this.config);
      } else {
        const { error } = await supabase
          .from('time_logs')
          .update(updatePayload)
          .eq('id', timeLogId);

        if (error) {
          console.error('❌ [TRACKING-MANAGER] Database update failed — queuing offline:', error.message);
          this._queueOfflineTimeLogUpdate({
            id: timeLogId,
            user_id: userId,
            project_id: this.currentProjectId || this.currentSession?.project_id || null,
            start_time: this.sessionStartTime || this.currentSession?.start_time || null,
            ...updatePayload,
            device_id: getDeviceId(),
            action: 'update',
          });
          return { success: true, queued: true };
        }
      }
      
      console.log(`✅ [TRACKING-MANAGER] Time log ended successfully (idle: ${idleSeconds}s)`);
      this._clearPendingSessionClose(timeLogId);
      return { success: true };
      
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Background time log update error — queuing offline:', error.message);
      try {
        this._queueOfflineTimeLogUpdate({
          id: timeLogId,
          user_id: userId,
          project_id: this.currentProjectId || this.currentSession?.project_id || null,
          start_time: this.sessionStartTime || this.currentSession?.start_time || null,
          end_time: endTime,
          status: 'completed',
          idle_seconds: 0,
          device_id: getDeviceId(),
          action: 'update',
        });
      } catch (_) {}
      return { success: true, queued: true };
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
   * End the current time log in database with retry logic and offline queue support
   * FIXED: Uses authenticated supabaseService instead of raw fetch with wrong config names
   */
  async _endCurrentTimeLog() {
    if (!this.currentTimeLogId) {
      console.log('ℹ️ [TRACKING-MANAGER] No active time log to end');
      return { success: false, reason: 'no_time_log_id' };
    }

    const timeLogId = this.currentTimeLogId;
    const endTime = new Date().toISOString();
    const userId = this.config.user_id;
    
    console.log(`🔄 [TRACKING-MANAGER] Closing current time log ${timeLogId}`);
    
    // Store pending session close in local storage for backend cleanup fallback
    this._storePendingSessionClose(timeLogId, endTime, userId);

    // Get the authenticated Supabase client
    const supabase = this.supabaseService || global.supabaseService || global.supabaseClient;
    
    if (!supabase) {
      console.error('❌ [TRACKING-MANAGER] No Supabase client available');
      // Queue for offline sync
      if (global.offlineQueue && global.offlineQueue.timeLogs) {
        global.offlineQueue.timeLogs.push({
          id: timeLogId,
          user_id: userId,
          end_time: endTime,
          status: 'completed',
          action: 'update'
        });
      }
      return { success: false, reason: 'no_supabase_client' };
    }

    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 500;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 [TRACKING-MANAGER] Closing time log attempt ${attempt}/${MAX_RETRIES}...`);
        
        const { error } = await supabase
          .from('time_logs')
          .update({
            end_time: endTime,
            status: 'completed',
            idle_seconds: 0
          })
          .eq('id', timeLogId);
        
        if (!error) {
          console.log('✅ [TRACKING-MANAGER] Current time log ended successfully');
          this._clearPendingSessionClose(timeLogId);
          return { success: true };
        }
        
        console.error(`❌ [TRACKING-MANAGER] Attempt ${attempt} failed:`, error.message);
        
        // Wait before retry with exponential backoff
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`⏳ [TRACKING-MANAGER] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        console.error(`❌ [TRACKING-MANAGER] Attempt ${attempt} exception:`, error.message || error);
        
        // Wait before retry with exponential backoff
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`⏳ [TRACKING-MANAGER] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed - queue for offline sync
    console.error('❌ [TRACKING-MANAGER] All retry attempts failed, queuing for offline sync');
    if (global.offlineQueue && global.offlineQueue.timeLogs) {
      global.offlineQueue.timeLogs.push({
        id: timeLogId,
        user_id: userId,
        end_time: endTime,
        status: 'completed',
        action: 'update'
      });
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

      if (backendTimeLogs.isBackendTimeLogsEnabled(this.config)) {
        const result = await backendTimeLogs.closeActiveSessions(userId, deviceId, this.config);
        const closed = result?.closed ?? 0;
        console.log(
          `🔒 [TRACKING-MANAGER] RDS close_active_sessions: closed ${closed} session(s) for ${userId} device=${deviceId || 'all'}`,
        );
        return;
      }

      if (!this.supabaseService) return;

      // Strategy 1: Use SECURITY DEFINER RPC (bypasses RLS reliably)
      // Pass p_device_id to close only this device's sessions (multi-device safe)
      try {
        const rpcParams = { p_user_id: userId };
        if (deviceId) rpcParams.p_device_id = deviceId;
        const { data: rpcCount, error: rpcError } = await this.supabaseService
          .rpc('close_user_active_sessions', rpcParams);
        if (!rpcError) {
          const closed = typeof rpcCount === 'number' ? rpcCount : 0;
          console.log(`🔒 [TRACKING-MANAGER] RPC close_user_active_sessions: closed ${closed} session(s) for ${userId} device=${deviceId || 'all'}`);
          if (closed > 0) return;
        } else {
          console.warn('⚠️ [TRACKING-MANAGER] RPC close_user_active_sessions failed, falling back to direct UPDATE:', rpcError.message || rpcError);
        }
      } catch (rpcErr) {
        console.warn('⚠️ [TRACKING-MANAGER] RPC call threw, falling back to direct UPDATE:', rpcErr.message || rpcErr);
      }

      // Strategy 2: Direct UPDATE fallback (may be blocked by RLS on anon client)
      const now = new Date().toISOString();
      let query = this.supabaseService
        .from('time_logs')
        .update({ end_time: now, status: 'completed', idle_seconds: 0 })
        .eq('user_id', userId)
        .or('end_time.is.null,status.eq.active');
      if (deviceId) {
        query = query.eq('device_id', deviceId);
      }
      const { data, error } = await query.select('id');
      if (error) {
        console.error('❌ [TRACKING-MANAGER] _forceCloseActiveSessions UPDATE error:', error.message || error);
      } else {
        const count = data ? data.length : 0;
        console.log(`🔒 [TRACKING-MANAGER] _forceCloseActiveSessions UPDATE: ${count} row(s) affected for ${userId} device=${deviceId || 'all'}`);
      }
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
   * Queue a local temp time log create and return the temp row
   */
  _queueOfflineTimeLogCreate(timeLogData, extra = {}) {
    const tempTimeLog = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...timeLogData,
      ...extra,
      _offline: true,
      _retryCount: 0,
    };

    const offlineQueue = this.getOfflineQueue();
    offlineQueue.push({
      type: 'create_time_log',
      data: tempTimeLog,
      timestamp: new Date().toISOString(),
    });
    this.saveOfflineQueue(offlineQueue);
    this.startOfflineSync();
    return tempTimeLog;
  }

  /**
   * Queue a completed/update time log so stop-during-outage never loses hours
   */
  _queueOfflineTimeLogUpdate(payload) {
    const offlineQueue = this.getOfflineQueue();
    offlineQueue.push({
      type: 'update_time_log',
      data: {
        ...payload,
        _offline: true,
        _retryCount: 0,
      },
      timestamp: new Date().toISOString(),
    });
    this.saveOfflineQueue(offlineQueue);
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
   * Save offline time-log queue
   */
  saveOfflineQueue(queue) {
    try {
      const fs = require('fs');
      const queuePath = this._getTimeLogOfflineQueuePath();
      fs.writeFileSync(queuePath, JSON.stringify(Array.isArray(queue) ? queue : [], null, 2));
      console.log('💾 [TRACKING-MANAGER] Offline time-log queue saved with', (queue || []).length, 'items');
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error saving offline time-log queue:', error);
    }
  }

  /**
   * Start offline sync timer
   */
  startOfflineSync() {
    // If already running, don't start another
    if (this.offlineSyncTimer) return;
    
    console.log('🔄 [TRACKING-MANAGER] Starting offline sync timer');
    
    // Try to sync every 30 seconds while network may be down
    this.offlineSyncTimer = setInterval(() => {
      this.processOfflineQueue();
    }, 30000);
    
    // Also try immediately
    setTimeout(() => this.processOfflineQueue(), 5000);
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

      const remainingItems = [];

      for (const item of queue) {
        try {
          if (item.type === 'create_time_log') {
            const timeLogData = { ...item.data };
            delete timeLogData._offline;
            delete timeLogData._retryCount;
            const tempId = timeLogData.id;
            delete timeLogData.id; // Remove temp ID; assign a real UUID for backend

            let timeLog = null;
            if (backendTimeLogs.isBackendTimeLogsEnabled(this.config)) {
              const orgId =
                global.currentOrganizationId ||
                this.config.organization_id ||
                null;
              const newId = crypto.randomUUID();
              timeLog = await backendTimeLogs.createTimeLog(
                {
                  id: newId,
                  ...timeLogData,
                  organization_id: orgId,
                },
                this.config,
              );
            } else {
              if (!this.supabaseService) {
                throw new Error('No Supabase client for offline time log sync');
              }
              const { data, error } = await this.supabaseService
                .from('time_logs')
                .insert([timeLogData])
                .select()
                .single();
              if (error) throw error;
              timeLog = data;
            }

            console.log('✅ [TRACKING-MANAGER] Synced offline time log:', timeLog.id);

            // If this is the current session, update the ID
            if (this.currentTimeLogId === tempId || this.currentTimeLogId === item.data.id) {
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
                  oldId: item.data.id,
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
            delete updates.action;

            if (!id || String(id).startsWith('temp-')) {
              // Convert stranded temp updates into a completed create
              const createPayload = {
                user_id: updates.user_id || this.config.user_id,
                project_id: updates.project_id || this.currentProjectId || null,
                start_time: updates.start_time || updates.end_time,
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
                  { id: crypto.randomUUID(), ...createPayload, organization_id: orgId },
                  this.config,
                );
              } else if (this.supabaseService) {
                const { error } = await this.supabaseService.from('time_logs').insert([createPayload]);
                if (error) throw error;
              } else {
                throw new Error('No DB client for offline completed create');
              }
              console.log('✅ [TRACKING-MANAGER] Synced offline completed temp session');
            } else if (backendTimeLogs.isBackendTimeLogsEnabled(this.config)) {
              await backendTimeLogs.updateTimeLog(id, updates, this.config);
              console.log('✅ [TRACKING-MANAGER] Synced offline time log update:', id);
            } else if (this.supabaseService) {
              const { error } = await this.supabaseService
                .from('time_logs')
                .update(updates)
                .eq('id', id);
              if (error) throw error;
              console.log('✅ [TRACKING-MANAGER] Synced offline time log update:', id);
            } else {
              throw new Error('No DB client for offline time log update');
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

      this.saveOfflineQueue(remainingItems);

      if (remainingItems.length === 0 && this.offlineSyncTimer) {
        clearInterval(this.offlineSyncTimer);
        this.offlineSyncTimer = null;
        console.log('✅ [TRACKING-MANAGER] Offline time-log queue processed successfully');
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