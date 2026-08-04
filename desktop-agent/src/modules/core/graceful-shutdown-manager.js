/**
 * GRACEFUL SHUTDOWN MANAGER
 * 
 * Single centralized handler for ALL stop/exit scenarios:
 * - Stop button click
 * - X button (close window)
 * - Quit from menu/tray
 * - Auto-idle stop
 * - System suspend/sleep
 * - System shutdown
 * - Screen lock
 * - App crash/force quit
 * 
 * Ensures database is ALWAYS updated and all background processes stopped.
 * Works on both Windows and macOS.
 */

const cleanupRegistry = require('./cleanup-registry');

class GracefulShutdownManager {
  constructor() {
    this.isShuttingDown = false;
    this.shutdownReason = null;
    this.shutdownPromise = null;
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'gracefulShutdownManager',
      cleanup: async () => this.emergencyCleanup()
    });
    
    console.log('✅ [GRACEFUL-SHUTDOWN] Manager initialized');
  }

  /**
   * Freeze end_time and today's displayed total at the earliest possible moment
   * (button click, window close, app quit). Safe to call multiple times.
   */
  captureStopMoment() {
    if (!global._stopEndTimeOverride) {
      global._stopEndTimeOverride = new Date().toISOString();
    }
    if (global.trackingManager?._captureStopTodayTotalSnapshot) {
      global.trackingManager._captureStopTodayTotalSnapshot();
    }
    return global._stopEndTimeOverride;
  }

  hasActiveSessionToClose() {
    return !!(
      global.isTracking ||
      global.trackingManager?.isTracking ||
      global.currentTimeLogId ||
      global.trackingManager?.currentTimeLogId
    );
  }

  /**
   * Persist the active session using the moment captured at close/quit click time.
   */
  async saveActiveSessionOnClose(reason = 'window_close', message = null) {
    this.captureStopMoment();
    if (typeof global.stopTracking !== 'function') {
      return { success: false, message: 'stopTracking unavailable' };
    }
    const defaultMessage =
      reason === 'window_close'
        ? 'Window closed — session saved'
        : 'Application closed — session saved';
    return global.stopTracking(reason, message || defaultMessage);
  }

  /**
   * SINGLE ENTRY POINT for all stop/shutdown scenarios
   * Call this from everywhere instead of scattered stop logic
   * 
   * @param {string} reason - Why we're stopping (manual, idle, suspend, shutdown, etc.)
   * @param {object} options - Additional options
   * @returns {Promise<{success: boolean, reason?: string}>}
   */
  async gracefulStop(reason = 'manual', options = {}) {
    // Prevent concurrent shutdown attempts
    if (this.isShuttingDown) {
      console.log(`⚠️ [GRACEFUL-SHUTDOWN] Already shutting down (reason: ${this.shutdownReason}), skipping duplicate call`);
      return this.shutdownPromise || { success: false, reason: 'already_shutting_down' };
    }

    this.captureStopMoment();

    this.isShuttingDown = true;
    this.shutdownReason = reason;
    global.isStopping = true;
    // FREEZE FIX: Set global shutdown flag early so app detection, URL polling,
    // and other subsystems skip expensive work immediately during shutdown.
    global.isShuttingDown = true;
    // Prevent health check from auto-recovering stale sessions after system sleep/shutdown
    global.userExplicitlyStopped = true;

    console.log(`🛑 [GRACEFUL-SHUTDOWN] Starting graceful stop (reason: ${reason})`);
    const startTime = Date.now();

    this.shutdownPromise = this._executeGracefulStop(reason, options);
    
    try {
      const result = await this.shutdownPromise;
      const elapsed = Date.now() - startTime;
      console.log(`✅ [GRACEFUL-SHUTDOWN] Complete in ${elapsed}ms, success: ${result.success}`);
      return result;
    } finally {
      this.isShuttingDown = false;
      this.shutdownReason = null;
      this.shutdownPromise = null;
      global.isStopping = false;
      // NOTE: Do NOT clear global.isShuttingDown here — it stays true until resume
      // clears it, so detection/polling remain suppressed while tracking is stopped.
    }
  }

  /**
   * BrowserWindow close handler — saves active session at close instant, then hides or quits.
   * @returns {boolean} true if close was intercepted for async save
   */
  handleWindowCloseEvent(event, mainWindow, options = {}) {
    const { app, showTrayNotification } = options;

    if (global.isQuitting) {
      return false;
    }

    if (!this.hasActiveSessionToClose() || global._windowCloseHandled) {
      return false;
    }

    if (event?.preventDefault) {
      event.preventDefault();
    }

    if (global._windowCloseSaveInProgress) {
      return true;
    }

    global._windowCloseSaveInProgress = true;
    void (async () => {
      try {
        await this.saveActiveSessionOnClose('window_close');
        global._windowCloseHandled = true;
      } catch (err) {
        console.error('❌ [GRACEFUL-SHUTDOWN] Window close save failed:', err?.message || err);
      } finally {
        global._windowCloseSaveInProgress = false;
      }

      if (process.platform !== 'darwin') {
        global.isQuitting = true;
        if (app?.quit) {
          app.quit();
        } else {
          const { app: electronApp } = require('electron');
          electronApp.quit();
        }
        return;
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        const notify =
          showTrayNotification ||
          ((title, body) => global.trayManager?.showNotification?.(title, body));
        notify(
          'Alyson PM',
          'App continues running in background. Click the tray icon to restore.',
        );
      }
    })();

    return true;
  }

  /**
   * Execute the graceful stop sequence
   */
  async _executeGracefulStop(reason, options) {
    const results = {
      database: false,
      intervals: false,
      python: false,
      renderer: false
    };

    try {
      // CRITICAL: Capture timeLogId BEFORE clearing local state
      // Otherwise _updateDatabase won't have the ID to close
      this._capturedTimeLogId = global.trackingManager?.currentTimeLogId || global.currentTimeLogId;

      // Notify renderer immediately so the clock freezes at click-time (not after slow DB I/O).
      results.renderer = this._notifyRenderer(reason);

      // STEP 1: Update local tracking state immediately (sync)
      this._updateLocalState();
      results.localState = true;

      // STEP 2: Kill screenshot capture IMMEDIATELY (sync, ~1ms)
      // Must happen before async DB work to prevent captures during shutdown.
      // The heartbeat, window timers, and all screenshot state are killed here.
      this._stopScreenshotsImmediately();

      // STEP 3: Update database (CRITICAL - must complete)
      results.database = await this._updateDatabase(reason);

      // STEP 4: Stop all intervals and timers
      results.intervals = await this._stopAllIntervals();

      // STEP 5: Kill Python processes (input detection)
      results.python = await this._killPythonProcesses();

      // STEP 6: Stop remaining managers (URL, app, idle, activity — NOT screenshots, already dead)
      await this._stopRemainingManagers();

      // STEP 7: Save pending data locally (for offline recovery)
      await this._savePendingData();

      // STEP 8: Update tray
      this._updateTray();

      // STEP 9: Tell renderer DB save finished so reports can refresh
      this._notifySessionDataUpdated(reason);

      const allSuccess = results.database; // Database is the critical one
      return { 
        success: allSuccess, 
        results,
        reason: allSuccess ? undefined : 'database_update_failed'
      };

    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Error during shutdown:', error);
      return { success: false, reason: 'exception', error: error.message, results };
    }
  }

  /**
   * Update local tracking state immediately
   */
  _updateLocalState() {
    console.log('🔄 [GRACEFUL-SHUTDOWN] Updating local state...');
    
    global.isTracking = false;
    global.isPaused = false;
    global.currentTimeLogId = null;
    global.currentSession = null;
    global.sessionStartTime = null;

    // Update tracking manager state if available
    if (global.trackingManager) {
      global.trackingManager.isTracking = false;
      global.trackingManager.isPaused = false;
      global.trackingManager.currentTimeLogId = null;
      global.trackingManager.currentSession = null;
    }

    console.log('✅ [GRACEFUL-SHUTDOWN] Local state updated');
  }

  /**
   * Update database to close the time log
   * This is the CRITICAL operation that must succeed
   */
  async _updateDatabase(reason) {
    console.log('🔄 [GRACEFUL-SHUTDOWN] Updating database...');
    
    try {
      // Use captured timeLogId if available (captured before local state was cleared)
      const timeLogId = this._capturedTimeLogId || 
                        global.trackingManager?.currentTimeLogId || 
                        global.currentTimeLogId;
      
      if (!timeLogId) {
        console.log('ℹ️ [GRACEFUL-SHUTDOWN] No active time log to close');
        return true; // Not a failure - just no session to close
      }

      // Get database client(s)
      const backendTimeLogs = require('../utils/backend-time-logs');
      const useBackend = backendTimeLogs.isBackendTimeLogsEnabled();
      const supabase = global.supabaseService || global.supabaseClient;
      
      if (!useBackend && !supabase) {
        console.error('❌ [GRACEFUL-SHUTDOWN] No database client available');
        this._storePendingClose(timeLogId, reason, global._stopEndTimeOverride || new Date().toISOString());
        return false;
      }

      // FIX-8: Use endTimeOverride if available (idle auto-stop: typically now − 10m).
      const endTime = global._stopEndTimeOverride || new Date().toISOString();
      if (global._stopEndTimeOverride) {
        console.log(`⏱️ [GRACEFUL-SHUTDOWN] Using endTimeOverride: ${endTime}`);
      }
      
      // Store pending close first (for recovery if this fails)
      this._storePendingClose(timeLogId, reason, endTime);

      if (useBackend) {
        await backendTimeLogs.updateTimeLog(timeLogId, {
          end_time: endTime,
          status: 'completed',
        });
      } else {
        const { error } = await supabase
          .from('time_logs')
          .update({
            end_time: endTime,
            status: 'completed',
          })
          .eq('id', timeLogId);

        if (error) {
          console.error('❌ [GRACEFUL-SHUTDOWN] Database update failed:', error.message);
          return false;
        }
      }

      console.log('✅ [GRACEFUL-SHUTDOWN] Database updated successfully');
      
      // Clear pending close since we succeeded
      this._clearPendingClose(timeLogId);
      global._stopEndTimeOverride = null;
      
      return true;

    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Database update error:', error);
      return false;
    }
  }

  /**
   * Store pending close for recovery on next startup
   */
  _storePendingClose(timeLogId, reason, endTime = null) {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const pendingDir = path.join(app.getPath('userData'), 'pending_sessions');
      if (!fs.existsSync(pendingDir)) {
        fs.mkdirSync(pendingDir, { recursive: true });
      }
      
      const pendingFile = path.join(pendingDir, `${timeLogId}.json`);
      const tmpFile = `${pendingFile}.tmp`;
      const payload = JSON.stringify({
        timeLogId,
        endTime: endTime || new Date().toISOString(),
        userId: global.config?.user_id || global.currentUserId,
        reason,
        createdAt: new Date().toISOString()
      });
      fs.writeFileSync(tmpFile, payload, 'utf8');
      fs.renameSync(tmpFile, pendingFile);
      
      console.log('📁 [GRACEFUL-SHUTDOWN] Stored pending session close:', timeLogId);
    } catch (error) {
      console.warn('⚠️ [GRACEFUL-SHUTDOWN] Failed to store pending session:', error.message);
    }
  }

  /**
   * Clear pending close after successful database update
   */
  _clearPendingClose(timeLogId) {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const pendingFile = path.join(app.getPath('userData'), 'pending_sessions', `${timeLogId}.json`);
      if (fs.existsSync(pendingFile)) {
        fs.unlinkSync(pendingFile);
        console.log('🗑️ [GRACEFUL-SHUTDOWN] Cleared pending session:', timeLogId);
      }
    } catch (error) {
      console.warn('⚠️ [GRACEFUL-SHUTDOWN] Failed to clear pending session:', error.message);
    }
  }

  /**
   * Stop all intervals and timers
   */
  async _stopAllIntervals() {
    console.log('🔄 [GRACEFUL-SHUTDOWN] Stopping all intervals...');
    
    try {
      // Use cleanup registry
      cleanupRegistry.cleanupAll();
      
      // Also call global clearAllIntervals if available
      if (typeof global.clearAllIntervals === 'function') {
        global.clearAllIntervals();
      }
      
      console.log('✅ [GRACEFUL-SHUTDOWN] All intervals stopped');
      return true;
    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Failed to stop intervals:', error);
      return false;
    }
  }

  /**
   * Kill Python processes (input detection on Windows/macOS)
   */
  async _killPythonProcesses() {
    console.log('🔄 [GRACEFUL-SHUTDOWN] Killing Python processes...');
    
    try {
      // Stop input detection
      if (typeof global.stopInputDetection === 'function') {
        global.stopInputDetection();
      }
      
      // Kill any Python processes started by the app
      if (global.pythonProcess) {
        global.pythonProcess.kill();
        global.pythonProcess = null;
      }

      // Platform-specific Python cleanup
      const { exec } = require('child_process');
      const platform = process.platform;
      
      if (platform === 'win32') {
        // Windows: Kill Python processes that might be running our scripts
        exec('taskkill /F /IM python.exe /FI "WINDOWTITLE eq timeflow*"', { timeout: 2000 }, () => {});
      } else if (platform === 'darwin' || platform === 'linux') {
        // macOS/Linux: Kill Python processes with our script names
        exec('pkill -f "input_monitor|activity_monitor" 2>/dev/null', { timeout: 2000 }, () => {});
      }
      
      console.log('✅ [GRACEFUL-SHUTDOWN] Python processes killed');
      return true;
    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Failed to kill Python processes:', error);
      return false;
    }
  }

  /**
   * Kill screenshot capture synchronously BEFORE any async work.
   * Clears all window timers, heartbeat, and state so nothing can fire.
   */
  _stopScreenshotsImmediately() {
    console.log('📸 [GRACEFUL-SHUTDOWN] Killing screenshot capture immediately (sync)...');
    try {
      const ssm = global.enhancedScreenshotManager;
      if (ssm) {
        ssm.isTracking = false;
        ssm.currentSession = null;
        ssm._shuttingDown = true;
        ssm.screenshotsPaused = true;
        if (typeof ssm.clearWindowScheduling === 'function') ssm.clearWindowScheduling();
        if (typeof ssm.stopDiagnosticsHeartbeat === 'function') ssm.stopDiagnosticsHeartbeat();
        if (typeof ssm.stopScreenshotTimerUpdates === 'function') ssm.stopScreenshotTimerUpdates();
        if (typeof ssm.stopScreenshotCapture === 'function') ssm.stopScreenshotCapture();
      }
      console.log('✅ [GRACEFUL-SHUTDOWN] Screenshot capture killed');
    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Error killing screenshots:', error?.message);
    }
  }

  /**
   * Stop remaining managers (URL, app, idle, activity, etc.)
   * Screenshot manager is already stopped by _stopScreenshotsImmediately().
   */
  async _stopRemainingManagers() {
    console.log('🔄 [GRACEFUL-SHUTDOWN] Stopping remaining managers...');
    
    try {
      // URL capture manager
      if (global.urlCaptureManager) {
        global.urlCaptureManager.stop();
      }

      // App detector
      if (global.enhancedAppDetector) {
        if (global.enhancedAppDetector.stopAppCapture) {
          global.enhancedAppDetector.stopAppCapture();
        }
        if (global.enhancedAppDetector.stopRealTimeAppDetection) {
          global.enhancedAppDetector.stopRealTimeAppDetection();
        }
      }

      // Enhanced idle monitor
      if (global.enhancedIdleMonitor) {
        global.enhancedIdleMonitor.isTracking = false;
        if (global.enhancedIdleMonitor.stopIdleMonitoring) {
          await global.enhancedIdleMonitor.stopIdleMonitoring();
        }
      }

      // Activity manager
      if (global.enhancedActivityManager) {
        if (global.enhancedActivityManager.setTrackingState) {
          global.enhancedActivityManager.setTrackingState(false);
        }
        global.enhancedActivityManager.isTracking = false;
      }

      // Monitoring manager
      if (global.monitoringManager) {
        if (global.monitoringManager.stopAllMonitoringSync) {
          global.monitoringManager.stopAllMonitoringSync();
        } else if (global.monitoringManager.stopAllMonitoring) {
          global.monitoringManager.stopAllMonitoring().catch(() => {});
        }
      }

      // Database manager persistence
      if (global.databaseManager) {
        if (global.databaseManager.stopActivityStatsPersistence) {
          global.databaseManager.stopActivityStatsPersistence();
        }
        if (global.databaseManager.stopDatabaseStatusReporting) {
          global.databaseManager.stopDatabaseStatusReporting();
        }
      }

      // Sync manager
      if (global.enhancedSyncManager) {
        if (global.enhancedSyncManager.stopActivitySync) {
          global.enhancedSyncManager.stopActivitySync();
        }
        if (global.enhancedSyncManager.stopConsolidatedIPC) {
          global.enhancedSyncManager.stopConsolidatedIPC();
        }
      }

      // System monitor
      if (global.systemMonitor && global.systemMonitor.stopPermissionMonitoring) {
        global.systemMonitor.stopPermissionMonitoring();
      }

      // Anti-cheat detector - must stop to prevent stale analysis after tracking ends
      if (global.antiCheatDetector && global.antiCheatDetector.isMonitoring) {
        global.antiCheatDetector.stopMonitoring();
        console.log('🛡️ [GRACEFUL-SHUTDOWN] Anti-cheat detector stopped');
      }

      console.log('✅ [GRACEFUL-SHUTDOWN] All managers stopped');
    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Error stopping managers:', error);
    }
  }

  /**
   * Notify renderer window
   */
  _notifyRenderer(reason) {
    console.log('🔄 [GRACEFUL-SHUTDOWN] Notifying renderer...');
    
    try {
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        const timeCutSeconds = Math.max(
          0,
          Math.floor(Number(global._idlePromptTimeCutSeconds) || 0),
        );
        let frozenTotalSeconds = Math.max(
          0,
          Math.floor(Number(global._lastTodayTotalAtStop) || 0),
        );
        // Authorized idle-prompt cut: freeze clock at tracked − 10m (only deduction).
        if (reason === 'idle_timeout' && timeCutSeconds > 0 && frozenTotalSeconds > 0) {
          frozenTotalSeconds = Math.max(0, frozenTotalSeconds - timeCutSeconds);
          // Allow get-today-time-stats to accept this one intentional drop
          // (otherwise the sync floor would hold the pre-cut total).
          global._idlePromptTimeCutAppliedPending = true;
          global._idlePromptTimeCutSecondsForFloor = timeCutSeconds;
        }
        global.mainWindow.webContents.send('tracking-stopped', {
          reason: reason || 'manual',
          message: 'Time tracking stopped',
          timestamp: global._stopEndTimeOverride || new Date().toISOString(),
          forceStop: true,
          frozenTotalSeconds,
          timeCutSeconds,
          timeLogId: global.currentTimeLogId || global.trackingManager?.currentTimeLogId || null,
        });
        global._idlePromptTimeCutSeconds = 0;
        console.log('✅ [GRACEFUL-SHUTDOWN] Renderer notified');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Failed to notify renderer:', error);
      return false;
    }
  }

  _notifySessionDataUpdated(reason) {
    try {
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('session-data-updated', {
          reason: reason || 'tracking-stopped',
          timestamp: new Date().toISOString(),
          frozenTotalSeconds: Math.max(
            0,
            Math.floor(Number(global._lastTodayTotalAtStop) || 0),
          ),
        });
      }
    } catch (error) {
      console.warn('⚠️ [GRACEFUL-SHUTDOWN] Failed to send session-data-updated:', error?.message);
    }
  }

  /**
   * Save pending data locally for offline recovery
   */
  async _savePendingData() {
    console.log('🔄 [GRACEFUL-SHUTDOWN] Saving pending data...');
    
    try {
      // Flush sync queue
      if (global.syncManager?.syncQueue) {
        try {
          await global.syncManager.syncQueue();
        } catch (e) {
          console.warn('⚠️ Sync queue flush failed:', e.message);
        }
      }

      // Save offline queue
      if (typeof global.saveOfflineQueue === 'function') {
        global.saveOfflineQueue();
      }

      console.log('✅ [GRACEFUL-SHUTDOWN] Pending data saved');
    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Failed to save pending data:', error);
    }
  }

  /**
   * Update system tray
   */
  _updateTray() {
    try {
      if (typeof global.updateTrayMenuThrottled === 'function') {
        global.updateTrayMenuThrottled();
      } else if (typeof global.updateTrayMenu === 'function') {
        global.updateTrayMenu();
      }
    } catch (error) {
      console.warn('⚠️ [GRACEFUL-SHUTDOWN] Failed to update tray:', error.message);
    }
  }

  /**
   * Emergency cleanup - called on crash or force quit
   */
  async emergencyCleanup() {
    console.log('🚨 [GRACEFUL-SHUTDOWN] Emergency cleanup initiated');
    
    try {
      // Try to update database synchronously-ish
      await this._updateDatabase('emergency');
      
      // Kill all intervals
      cleanupRegistry.emergencyCleanup();
      
      // Kill Python
      await this._killPythonProcesses();
      
      console.log('✅ [GRACEFUL-SHUTDOWN] Emergency cleanup complete');
    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Emergency cleanup failed:', error);
    }
  }

  /**
   * Process any pending session closes from previous crashes
   * Call this on app startup
   */
  async processPendingSessionCloses() {
    console.log('🔄 [GRACEFUL-SHUTDOWN] Processing pending session closes...');
    
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const pendingDir = path.join(app.getPath('userData'), 'pending_sessions');
      
      const files = fs.existsSync(pendingDir)
        ? fs.readdirSync(pendingDir).filter(f => f.endsWith('.json'))
        : [];
      const backendTimeLogs = require('../utils/backend-time-logs');
      const useBackend = backendTimeLogs.isBackendTimeLogsEnabled();
      const supabase = global.supabaseService || global.supabaseClient;

      if (files.length === 0) {
        console.log('✅ [GRACEFUL-SHUTDOWN] No pending session files');
      } else {
        console.log(`🔄 [GRACEFUL-SHUTDOWN] Found ${files.length} pending session(s) to close`);

        if (!useBackend && !supabase) {
          console.warn('⚠️ [GRACEFUL-SHUTDOWN] No database client - will retry later');
          return;
        }

        for (const file of files) {
        try {
          const filePath = path.join(pendingDir, file);
          const raw = fs.readFileSync(filePath, 'utf8').trim();
          if (!raw) {
            console.warn(`⚠️ [GRACEFUL-SHUTDOWN] Empty pending file — deleting: ${file}`);
            try { fs.unlinkSync(filePath); } catch (_) {}
            continue;
          }
          let data;
          try {
            data = JSON.parse(raw);
          } catch (parseErr) {
            console.warn(`⚠️ [GRACEFUL-SHUTDOWN] Corrupt pending file — deleting: ${file} (${parseErr.message})`);
            try { fs.unlinkSync(filePath); } catch (_) {}
            continue;
          }
          if (!data?.timeLogId || !data?.endTime) {
            console.warn(`⚠️ [GRACEFUL-SHUTDOWN] Incomplete pending file — deleting: ${file}`);
            try { fs.unlinkSync(filePath); } catch (_) {}
            continue;
          }
          
          console.log(`🔄 [GRACEFUL-SHUTDOWN] Closing pending session: ${data.timeLogId} at ${data.endTime}`);
          
          if (useBackend) {
            await backendTimeLogs.updateTimeLog(
              data.timeLogId,
              { end_time: data.endTime, status: 'completed' },
            );
          } else {
            const { error } = await supabase
              .from('time_logs')
              .update({
                end_time: data.endTime,
                status: 'completed'
              })
              .eq('id', data.timeLogId);
            if (error) {
              throw error;
            }
          }

          console.log(`✅ [GRACEFUL-SHUTDOWN] Closed pending session: ${data.timeLogId}`);
          fs.unlinkSync(filePath);
          
        } catch (e) {
          console.error('❌ [GRACEFUL-SHUTDOWN] Error processing pending file:', e.message);
        }
      }
      }

      if (useBackend) {
        const { normalizeTenantUserId } = require('../utils/tenant-user-id');
        const userId = normalizeTenantUserId(
          global.currentUserId || global.config?.user_id || global.config?.userId,
        );
        if (userId) {
        try {
          const { getDeviceId } = require('../utils/device-id');
          const deviceId = getDeviceId();
          await backendTimeLogs.closeActiveSessions(userId, deviceId);
          console.log('✅ [GRACEFUL-SHUTDOWN] Reconciled remaining open time_logs via RDS');
          const reconcileResult = await backendTimeLogs.reconcileInflatedTimeLogs(
            userId,
            deviceId,
          );
          const reconciled = reconcileResult?.reconciled ?? 0;
          if (reconciled > 0) {
            console.log(`✅ [GRACEFUL-SHUTDOWN] Corrected ${reconciled} inflated time_log(s) via RDS`);
          }
        } catch (reconcileErr) {
          console.warn('⚠️ [GRACEFUL-SHUTDOWN] RDS reconcile failed:', reconcileErr.message);
        }
        }
      }
      
      console.log('✅ [GRACEFUL-SHUTDOWN] Pending session processing complete');
      
    } catch (error) {
      console.error('❌ [GRACEFUL-SHUTDOWN] Error processing pending sessions:', error);
    }
  }
}

// Export singleton instance
const gracefulShutdownManager = new GracefulShutdownManager();
module.exports = gracefulShutdownManager;

