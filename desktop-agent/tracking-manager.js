/**
 * TrackingManager - Centralized tracking state and stop/pause/resume operations
 * Extracted from main.js to improve modularity and maintainability
 */

const { EventEmitter } = require('events');
const debugLogger = require('../utils/debug-logger');

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
    
    console.log('🔧 TrackingManager dependencies initialized');
  }

  /**
   * Start tracking session
   */
  async startTracking(projectId = null) {
    try {
      debugLogger.init('tracking', 'Starting tracking session', {
        projectId: projectId,
        currentTracking: this.isTracking,
        currentPaused: this.isPaused,
        hasCurrentSession: !!this.currentSession,
        currentTimeLogId: this.currentTimeLogId
      });

      // ASYNC HEALTH CHECK: Run in background without blocking timer start
      if (global.systemMonitor) {
        console.log('🔒 [TRACKING-MANAGER] Starting timer immediately, health check will run in background...');
        
        // Run health check asynchronously without blocking
        setImmediate(async () => {
          try {
            const healthCheck = await global.systemMonitor.performComprehensiveHealthCheck();
            
            if (!healthCheck.canStartTimer) {
              console.error('⚠️ [TRACKING-MANAGER] Health check detected issues (timer already started):', {
                overall: healthCheck.overall,
                issues: healthCheck.issues,
                canStartTimer: healthCheck.canStartTimer
              });
              
              // Emit event for UI to show warnings if needed
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('health-check-warning', {
                  issues: healthCheck.issues,
                  requiresPermission: healthCheck.checks?.permissions?.requiresUserAction || false
                });
              }
            } else {
              console.log('✅ [TRACKING-MANAGER] Background health check passed');
            }
          } catch (error) {
            console.error('❌ [TRACKING-MANAGER] Background health check failed:', error);
          }
        });
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
      if (!this.supabaseService) {
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

      const finalProjectId = projectId || global.currentProjectId || this.config.project_id || null;
      const startTimeIso = new Date().toISOString();

      // Create time log
      const timeLogData = {
        user_id: effectiveUserId,
        project_id: finalProjectId,
        start_time: startTimeIso,
        is_manual: false
      };

      // T4: Before Supabase insert
      console.log('💾 [TRACKING-MANAGER] T4: Before Supabase insert:', new Date().toISOString());
      console.time('T4-T5: Supabase insert time');

      let timeLog, error;
      try {
        const resp = await this.supabaseService
          .from('time_logs')
          .insert([timeLogData])
          .select()
          .single();
        timeLog = resp.data;
        error = resp.error;
      } catch (e) {
        // Normalize thrown fetch/network exceptions to reuse offline fallback path
        error = e;
      }

      // T5: After Supabase insert returns
      console.timeEnd('T4-T5: Supabase insert time');
      console.log('💾 [TRACKING-MANAGER] T5: After Supabase insert:', new Date().toISOString());

      if (error) {
        // Special fallback: Some packaged builds see "Content-Type not acceptable: text/plain" from postgrest-js
        // Work around by calling PostgREST directly with explicit headers
        const errMsg = (error && (error.message || String(error))) || '';
        const shouldUseDirectPost = errMsg.includes('Content-Type not acceptable') || errMsg.includes('406');
        if (shouldUseDirectPost && global.config && global.config.supabase_url && (global.config.supabase_service_key || global.config.supabase_key)) {
          try {
            console.log('🛠️ [TRACKING-MANAGER] Applying direct PostgREST fallback for time_logs insert');
            const fetchImpl = global.fetch || require('node-fetch');
            const url = `${global.config.supabase_url.replace(/\/$/, '')}/rest/v1/time_logs`;
            const headers = {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Prefer': 'return=representation',
              'apikey': global.config.supabase_service_key || global.config.supabase_key,
              'Authorization': `Bearer ${global.config.supabase_service_key || global.config.supabase_key}`
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

      if (error) {
        console.error('❌ [TRACKING-MANAGER] Database error creating time log:', error);
        
        // Check if it's a network error
        if (error.message?.includes('fetch') || error.message?.includes('network') || error.code === 'ENOTFOUND') {
          console.log('📶 [TRACKING-MANAGER] Network error detected, queueing for offline sync');
          
          // Create a local time log with a temporary ID
          const tempTimeLog = {
            id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...timeLogData,
            _offline: true,
            _retryCount: 0
          };
          
          // Store in offline queue
          const offlineQueue = this.getOfflineQueue();
          offlineQueue.push({
            type: 'create_time_log',
            data: tempTimeLog,
            timestamp: new Date().toISOString()
          });
          this.saveOfflineQueue(offlineQueue);
          
          // Continue with the temporary log
          this.isTracking = true;
          this.isPaused = false;
          this.currentTimeLogId = tempTimeLog.id;
          this.sessionStartTime = startTimeIso;
          this.currentSession = {
            id: tempTimeLog.id,
            user_id: tempTimeLog.user_id,
            project_id: tempTimeLog.project_id,
            start_time: tempTimeLog.start_time,
            is_manual: false,
            _offline: true
          };
          
          console.log('✅ [TRACKING-MANAGER] Started tracking offline with temp ID:', tempTimeLog.id);
          
          // Start offline sync timer
          this.startOfflineSync();
          
          return {
            success: true,
            timeLogId: tempTimeLog.id,
            startTime: startTimeIso,
            offline: true
          };
        }
        
        throw error;
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
        isActive: true
      };

      // Propagate to global for legacy guards
      global.isTracking = true;
      global.isPaused = false;
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

      // Update URL manager with current time log ID and start URL capture (idempotent inside manager)
      if (global.browserUrlManager && global.browserUrlManager.setCurrentTimeLogId) {
        global.browserUrlManager.setCurrentTimeLogId(this.currentTimeLogId);
        try {
          if (typeof global.browserUrlManager.startUrlCapture === 'function') {
            global.browserUrlManager.startUrlCapture();
          }
        } catch {}
      }

      // Start the new unified URL capture manager
      if (global.urlCaptureManager) {
        try {
          global.urlCaptureManager.start();
          console.log('🌐 [URL] UrlCaptureManager started with timer');
          
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
        global.enhancedActivityManager?.setTrackingState(true);
        global.enhancedSyncManager?.setTrackingState(true);
        global.liveMonitoringManager?.setTrackingState(true);
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
        setTimeout(() => {
          try {
            console.log('🔧 [SCREENSHOT-FIX] Forcing screenshot capture start...');
            
            // CRITICAL: Ensure nextScreenshotTime is always set
            if (!global.nextScreenshotTime) {
              const interval = Math.floor(Math.random() * (360000 - 180000 + 1)) + 180000; // 3-6 minutes
              global.nextScreenshotTime = new Date(Date.now() + interval);
              console.log(`📸 [SCREENSHOT-FIX] Set nextScreenshotTime to ${global.nextScreenshotTime.toLocaleTimeString()}`);
            }
            
            global.enhancedScreenshotManager.startScreenshotCapture();
            global.enhancedScreenshotManager.startScreenshotTimerUpdates();
            global.enhancedScreenshotManager.startMandatoryScreenshotMonitoring();
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
              global.enhancedScreenshotManager?.debugScreenshotTimer();
              const timersActive = (global.enhancedScreenshotManager?.windowTimers?.length || 0) > 0 && !!global.enhancedScreenshotManager?.windowEndTimer;
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

      // CRITICAL FIX: Ensure input detection is started
      try {
        if (global.startInputDetection) {
          await global.startInputDetection();
          console.log('✅ [TRACKING-MANAGER] Input detection started');
        }
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

      // CRITICAL FIX: Start app detection (MUST be started when tracking begins)
      try {
        if (global.enhancedAppDetector) {
          console.log('📱 [TRACKING-MANAGER] Starting app detection...');
          global.enhancedAppDetector.setTrackingState(true);
          global.enhancedAppDetector.startAppCapture();
          global.enhancedAppDetector.startRealTimeAppDetection();
          console.log('✅ [TRACKING-MANAGER] App detection started successfully');
        } else {
          console.warn('⚠️ [TRACKING-MANAGER] Enhanced app detector not available');
        }
      } catch (error) {
        console.error('❌ [TRACKING-MANAGER] Failed to start app detection:', error);
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

      console.log(`✅ [TRACKING-MANAGER] Tracking started with time log ID: ${this.currentTimeLogId}`);
      return {
        success: true,
        timeLogId: this.currentTimeLogId,
        projectId: this.currentProjectId,
        startTime: this.sessionStartTime,
        isTracking: true
      };
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Failed to start tracking:', error);
      this.isTracking = false;
      this.isPaused = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop tracking session with comprehensive cleanup
   * @param {string} reason - Reason for stopping (manual, idle, etc.)
   * @param {string} message - Optional custom message
   * @returns {Object} Result object with success status
   */
  async stopTracking(reason = 'manual', message = null) {
    try {
      if (!this.isTracking) {
        console.log('⚠️ [TRACKING-MANAGER] Tracking already stopped');
        return { success: false, message: 'Tracking already stopped' };
      }

      console.log('🛑 [TRACKING-MANAGER] Stopping time tracking...', reason ? `(${reason})` : '');
      
      // Stop URL capture manager when timer stops
      try {
        if (global.urlCaptureManager) {
          global.urlCaptureManager.stop();
          console.log('🛑 [URL] UrlCaptureManager stopped with timer');
        }
      } catch (e) {
        console.warn('⚠️ [URL] Failed to stop UrlCaptureManager with timer:', e?.message || e);
      }

      // Update state
      this.isTracking = false;
      this.isPaused = false;
      
      // ARCHITECTURAL FIX: Complete shutdown of all tracking systems
      console.log('🛑 [TRACKING-MANAGER] COMPREHENSIVE SHUTDOWN of all tracking systems...');
      
      if (this.wrappers && this.wrappers.stopConsolidatedTracking) {
        this.wrappers.stopConsolidatedTracking();
      } else {
        console.log('⚠️ [TRACKING-MANAGER] Consolidated wrappers not available, stopping individual systems...');
      }

      // CRITICAL FIX: Stop input detection
      try {
        if (global.stopInputDetection) {
          global.stopInputDetection();
          console.log('✅ [TRACKING-MANAGER] Input detection stopped');
        }
      } catch (error) {
        console.error('❌ [TRACKING-MANAGER] Failed to stop input detection:', error);
      }
      
      // CRITICAL: Full cleanup of all consolidated systems
      if (this.consolidationFixes && this.consolidationFixes.cleanupAllSystems) {
        try {
          await this.consolidationFixes.cleanupAllSystems();
          console.log('✅ [TRACKING-MANAGER] All consolidated systems cleaned up successfully');
        } catch (error) {
          console.error('❌ [TRACKING-MANAGER] Error during consolidated cleanup:', error);
        }
      }
      
      // RESET: Mark systems as uninitialized for next tracking session
      if (global.consolidatedSystemsInitialized !== undefined) {
        global.consolidatedSystemsInitialized = false;
        console.log('🔄 [TRACKING-MANAGER] Systems marked for re-initialization on next tracking session');
      }
      
      // Stop all monitoring based on system type
      await this._stopMonitoringSystems();

      // Final flush: ensure all queued items are synced
      try {
        if (global.syncManager?.syncQueue) {
          console.log('🔄 [TRACKING-MANAGER] Performing final sync flush...');
          await global.syncManager.syncQueue();
          console.log('✅ [TRACKING-MANAGER] Final sync flush completed');
        }
      } catch (e) {
        console.error('❌ [TRACKING-MANAGER] Final sync flush failed:', e.message);
      }
      
      // 🔧 FIX: Flush app logs queue before stopping
      if (global.syncManager) {
        try {
          console.log('📦 [TRACKING-MANAGER] Flushing app logs queue...');
          await global.syncManager.syncQueue();
          console.log('✅ [TRACKING-MANAGER] App logs queue flushed');
        } catch (error) {
          console.error('❌ [TRACKING-MANAGER] Failed to flush app logs queue:', error.message);
        }
      }
      
      // Stop additional systems
      this._stopAdditionalSystems();
      
      // CRITICAL FIX: Stop database persistence and sync services
      try {
        debugLogger.init('database', 'Stopping database persistence services', {
          hasDatabaseManager: !!global.databaseManager,
          hasEnhancedSyncManager: !!global.enhancedSyncManager
        });
        
        // Stop activity stats persistence
        if (global.databaseManager?.stopActivityStatsPersistence) {
          global.databaseManager.stopActivityStatsPersistence();
          console.log('✅ [TRACKING-MANAGER] Activity stats persistence stopped');
        }
        
        // Stop database status reporting
        if (global.databaseManager?.stopDatabaseStatusReporting) {
          global.databaseManager.stopDatabaseStatusReporting();
          console.log('✅ [TRACKING-MANAGER] Database status reporting stopped');
        }
        
        // Stop sync services
        if (global.enhancedSyncManager?.stopActivitySync) {
          global.enhancedSyncManager.stopActivitySync();
          console.log('✅ [TRACKING-MANAGER] Enhanced sync activity stopped');
        }
        
        if (global.enhancedSyncManager?.stopConsolidatedIPC) {
          global.enhancedSyncManager.stopConsolidatedIPC();
          console.log('✅ [TRACKING-MANAGER] Enhanced sync IPC stopped');
        }
        
      } catch (error) {
        debugLogger.guard('database', 'Error stopping database/sync services', {
          error: error.message
        });
        console.error('❌ [TRACKING-MANAGER] Error stopping database/sync services:', error);
      }
      
      // Reset screenshot failure tracking
      this.consecutiveScreenshotFailures = 0;
      this.lastSuccessfulScreenshotTime = 0;
      this.screenshotFailureStart = null;
      console.log('🔄 [TRACKING-MANAGER] Screenshot failure tracking reset');

      // End current time log
      await this._endCurrentTimeLog();
      
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
      
      // Update screenshot manager state before clearing
      if (global.enhancedScreenshotManager?.updateTrackingState) {
        global.enhancedScreenshotManager.updateTrackingState(false, null);
      }

      // CRITICAL FIX: Stop activity systems tracking
      try {
        // CRITICAL FIX (Windows): Force set tracking state to false on ALL managers
        console.log('🛑 [TRACKING-MANAGER] Setting tracking state to false on all managers...');
        
        if (global.enhancedActivityManager) {
          global.enhancedActivityManager.setTrackingState(false);
          global.enhancedActivityManager.isTracking = false; // Force set
          console.log('✅ Enhanced Activity Manager tracking disabled');
        }
        
        if (global.enhancedSyncManager) {
          global.enhancedSyncManager.setTrackingState(false);
          global.enhancedSyncManager.isTracking = false; // Force set
          console.log('✅ Enhanced Sync Manager tracking disabled');
        }
        
        if (global.liveMonitoringManager) {
          global.liveMonitoringManager.setTrackingState(false);
          global.liveMonitoringManager.isTracking = false; // Force set
          console.log('✅ Live Monitoring Manager tracking disabled');
        }
        
        if (global.enhancedScreenshotManager) {
          global.enhancedScreenshotManager.isTracking = false; // Force set
          console.log('✅ Enhanced Screenshot Manager tracking disabled');
        }
        
        if (global.enhancedAppDetector) {
          global.enhancedAppDetector.isTracking = false; // Force set
          console.log('✅ Enhanced App Detector tracking disabled');
        }
        
        if (global.browserUrlManager) {
          global.browserUrlManager.isTracking = false; // Force set
          console.log('✅ Browser URL Manager tracking disabled');
        }
        
        console.log('✅ [TRACKING-MANAGER] All activity systems tracking state set to false');
      } catch (error) {
        console.error('❌ [TRACKING-MANAGER] Error setting activity systems tracking state:', error);
      }

      // Clear session data
      this.currentSession = null;
      this.currentTimeLogId = null;
      this.currentProjectId = null;
      this.sessionStartTime = null;

      // Propagate to global
      global.isTracking = false;
      global.isPaused = false;
      global.currentTimeLogId = null;
      global.currentSession = null;
      // Ensure legacy consumers don't see stale start time
      try { global.sessionStartTime = null; } catch {}

      // Update URL managers to clear time log ID
      if (global.browserUrlManager && global.browserUrlManager.setCurrentTimeLogId) {
        global.browserUrlManager.setCurrentTimeLogId(null);
      }
      if (global.browserUrlManager && global.browserUrlManager.setCurrentTimeLogId) {
        global.browserUrlManager.setCurrentTimeLogId(null);
      }

      // CRITICAL FIX: Notify renderer of tracking state change
      this._notifyRenderer();

      // Update tray and send notifications
      await this._handlePostStopActions(reason, message);

      // Emit event for other modules
      this.emit('tracking-stopped', {
        reason,
        message,
        timestamp: new Date().toISOString()
      });

      const notificationMessage = message || 'Time tracking stopped';
      console.log(`✅ [TRACKING-MANAGER] Tracking stopped successfully: ${notificationMessage}`);
      
      return { success: true, message: notificationMessage };
      
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error stopping tracking:', error);
      return { success: false, message: `Failed to stop tracking: ${error.message}` };
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
        if (typeof global.stopAppCapture === 'function') global.stopAppCapture();
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
   * Stop additional tracking systems
   */
  _stopAdditionalSystems() {
    try {
      // Tab monitoring handled by BrowserUrlManager
      
      // Stop real-time app detection
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
   * CRITICAL FIX: Added exponential backoff retry to ensure sessions are properly closed
   */
  async _endCurrentTimeLog() {
    if (!this.currentTimeLogId) {
      console.log('ℹ️ [TRACKING-MANAGER] No active time log to end');
      return;
    }

    const timeLogId = this.currentTimeLogId;
    const endTime = new Date().toISOString();
    const userId = this.config.user_id;
    
    // Store pending session close in local storage for backend cleanup fallback
    this._storePendingSessionClose(timeLogId, endTime, userId);

    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 500;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 [TRACKING-MANAGER] Closing time log attempt ${attempt}/${MAX_RETRIES}...`);
        
        const supabaseUrl = this.config.VITE_SUPABASE_URL || this.config.supabase_url || global.config?.VITE_SUPABASE_URL || global.config?.supabase_url || process.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) {
          throw new Error('Supabase URL not configured');
        }
        const supabaseKey = this.config.VITE_SUPABASE_ANON_KEY || this.config.supabase_service_key || this.config.supabase_key || global.config?.VITE_SUPABASE_ANON_KEY || global.config?.supabase_key || process.env.VITE_SUPABASE_ANON_KEY;
        
        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/time_logs?id=eq.${timeLogId}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            end_time: endTime,
            status: 'completed'
          })
        });
        
        if (updateResponse.ok) {
          console.log('✅ [TRACKING-MANAGER] Current time log ended successfully');
          // Clear pending session on success
          this._clearPendingSessionClose(timeLogId);
          return;
        }
        
        const errorText = await updateResponse.text();
        console.error(`❌ [TRACKING-MANAGER] Attempt ${attempt} failed to end time log:`, {
          status: updateResponse.status,
          statusText: updateResponse.statusText,
          error: errorText
        });
        
        // Don't retry on 4xx errors (client errors) except timeout-related ones
        if (updateResponse.status >= 400 && updateResponse.status < 500 && updateResponse.status !== 408 && updateResponse.status !== 429) {
          console.error('❌ [TRACKING-MANAGER] Client error, not retrying');
          break;
        }
        
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
          timestamp: new Date().toISOString()
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
   * Notify renderer of tracking state change
   */
  _notifyRenderer() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const trackingStateData = {
        isTracking: false,
        isPaused: false,
        status: 'stopped',
        startTime: null,
        currentTimeLogId: null,
        projectId: null
      };
      
      console.log('📡 [TRACKING-MANAGER] Sending tracking-state-changed (stopped) to renderer:', trackingStateData);
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
   * Get offline queue
   */
  getOfflineQueue() {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      // Use same user data directory as saveOfflineQueue
      const userDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
      const appDataDir = path.join(userDataDir, 'Ebdaa Work Time');
      const queuePath = path.join(appDataDir, 'offline-queue.json');
      
      if (fs.existsSync(queuePath)) {
        const data = fs.readFileSync(queuePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error reading offline queue:', error);
    }
    return [];
  }

  /**
   * Save offline queue
   */
  saveOfflineQueue(queue) {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      // Use user data directory instead of app.asar path
      const userDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
      const appDataDir = path.join(userDataDir, 'Ebdaa Work Time');
      
      // Ensure directory exists
      if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true });
      }
      
      const queuePath = path.join(appDataDir, 'offline-queue.json');
      fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
      console.log('💾 [TRACKING-MANAGER] Offline queue saved with', queue.length, 'items');
    } catch (error) {
      console.error('❌ [TRACKING-MANAGER] Error saving offline queue:', error);
    }
  }

  /**
   * Start offline sync timer
   */
  startOfflineSync() {
    // If already running, don't start another
    if (this.offlineSyncTimer) return;
    
    console.log('🔄 [TRACKING-MANAGER] Starting offline sync timer');
    
    // Try to sync every 30 seconds
    this.offlineSyncTimer = setInterval(() => {
      this.processOfflineQueue();
    }, 30000);
    
    // Also try immediately
    setTimeout(() => this.processOfflineQueue(), 5000);
  }

  /**
   * Process offline queue
   */
  async processOfflineQueue() {
    const queue = this.getOfflineQueue();
    if (queue.length === 0) {
      if (this.offlineSyncTimer) {
        clearInterval(this.offlineSyncTimer);
        this.offlineSyncTimer = null;
      }
      return;
    }
    
    console.log('📶 [TRACKING-MANAGER] Processing offline queue with', queue.length, 'items');
    
    const remainingItems = [];
    
    for (const item of queue) {
      if (item.type === 'create_time_log') {
        try {
          // Remove temporary fields
          const timeLogData = { ...item.data };
          delete timeLogData._offline;
          delete timeLogData._retryCount;
          delete timeLogData.id; // Remove temp ID, let DB generate new one
          
          const { data: timeLog, error } = await this.supabaseService
            .from('time_logs')
            .insert([timeLogData])
            .select()
            .single();
          
          if (error) throw error;
          
          console.log('✅ [TRACKING-MANAGER] Synced offline time log:', timeLog.id);
          
          // If this is the current session, update the ID
          if (this.currentTimeLogId === item.data.id) {
            this.currentTimeLogId = timeLog.id;
            this.currentSession.id = timeLog.id;
            delete this.currentSession._offline;
            
            // Notify renderer of the ID update
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('time-log-id-updated', {
                oldId: item.data.id,
                newId: timeLog.id
              });
            }
          }
        } catch (error) {
          console.error('❌ [TRACKING-MANAGER] Failed to sync offline item:', error);
          item.data._retryCount = (item.data._retryCount || 0) + 1;
          
          // Keep trying unless it's been too many attempts
          if (item.data._retryCount < 10) {
            remainingItems.push(item);
          }
        }
      }
    }
    
    // Save remaining items
    this.saveOfflineQueue(remainingItems);
    
    if (remainingItems.length === 0 && this.offlineSyncTimer) {
      clearInterval(this.offlineSyncTimer);
      this.offlineSyncTimer = null;
      console.log('✅ [TRACKING-MANAGER] Offline queue processed successfully');
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