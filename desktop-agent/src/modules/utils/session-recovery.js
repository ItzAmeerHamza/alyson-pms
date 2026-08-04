/**
 * Session Recovery Utility
 * Handles session synchronization issues between database and desktop app
 */

const { createFeatureLogger } = require('./logger');
const { getDeviceId } = require('./device-id');
const log = createFeatureLogger('SESSION', { adapter: 'recovery' });

function resolveSupabaseClient() {
  const svc = global.supabaseService;
  if (!svc) return null;
  if (typeof svc.from === 'function') return svc;
  if (svc.client && typeof svc.client.from === 'function') return svc.client;
  return null;
}

/**
 * Periodic session health check to prevent sync issues
 */
function startSessionHealthCheck() {
  const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  const healthCheck = async () => {
    try {
      if (!global.currentUserId) {
        log.debug({ step: 'HEALTH_CHECK_SKIP', message: 'No user ID, skipping' });
        return;
      }

      // Check if we have active tracking but no session sync
      if (global.isTracking && global.currentTimeLogId) {
        log.debug({
          step: 'HEALTH_CHECK_OK', ctx: {
            userId: global.currentUserId,
            timeLogId: global.currentTimeLogId,
            isTracking: global.isTracking
          }
        });
        return;
      }

      // Check if database has active sessions for THIS DEVICE but desktop thinks it's not tracking
      if (!global.isTracking && global.sessionManager) {
        log.info({ step: 'HEALTH_CHECK_SYNC', message: 'Checking database for active sessions on this device' });

        const supabase = resolveSupabaseClient();
        const backendTimeLogs = require('./backend-time-logs');
        const useBackend = backendTimeLogs.isBackendTimeLogsEnabled();
        if (!supabase && !useBackend) {
          log.warn({ step: 'HEALTH_CHECK_NO_CLIENT' });
          return;
        }

        const deviceId = getDeviceId();
        let activeLog = null;

        try {
          if (useBackend) {
            activeLog = await backendTimeLogs.getActiveTimeLog(
              global.currentUserId,
              deviceId,
            );
          }
        } catch (backendErr) {
          log.warn({ step: 'HEALTH_CHECK_BACKEND', message: backendErr.message });
        }

        if (!activeLog && supabase) {
          let query = supabase
            .from('time_logs')
            .select('*')
            .eq('user_id', global.currentUserId)
            .is('end_time', null)
            .eq('status', 'active')
            .limit(1);
          if (deviceId) {
            query = query.eq('device_id', deviceId);
          }
          const { data: activeLogs } = await query;
          activeLog = activeLogs?.[0] ?? null;
        }

        if (activeLog) {
          
          // CRITICAL FIX: Don't restore tracking if we're in the middle of stopping
          if (global.isStopping) {
            log.info({ step: 'SYNC_SKIP_STOPPING', message: 'Skipping session recovery - stop in progress' });
            return;
          }
          
          // CRITICAL FIX: Don't auto-recover if user explicitly stopped tracking
          // This prevents the health check from restarting screenshots after manual stop
          if (global.userExplicitlyStopped) {
            log.info({ step: 'SYNC_SKIP_USER_STOPPED', message: 'Skipping session recovery - user explicitly stopped tracking', ctx: { timeLogId: activeLog.id } });
            try {
              const backendTimeLogs = require('./backend-time-logs');
              if (backendTimeLogs.isBackendTimeLogsEnabled()) {
                await backendTimeLogs.closeActiveSessions(
                  global.currentUserId,
                  getDeviceId(),
                );
              } else {
                const supabaseClose = resolveSupabaseClient();
                if (supabaseClose) {
                  await supabaseClose
                    .from('time_logs')
                    .update({ end_time: new Date().toISOString(), status: 'completed' })
                    .eq('id', activeLog.id);
                }
              }
              log.info({ step: 'SYNC_CLOSED_STALE', message: 'Closed stale session in database', ctx: { timeLogId: activeLog.id } });
            } catch (closeErr) {
              log.warn({ step: 'SYNC_CLOSE_ERROR', message: 'Failed to close stale session: ' + closeErr.message });
            }
            return;
          }
          
          // Don't restore stale sessions (older than 24 hours) -- close them instead
          const sessionAge = Date.now() - new Date(activeLog.start_time).getTime();
          const MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours in ms
          if (sessionAge > MAX_SESSION_AGE) {
            log.info({ step: 'SYNC_CLOSING_STALE', message: 'Closing stale session (>24h) instead of recovering', ctx: { 
              sessionId: activeLog.id, 
              ageHours: Math.round(sessionAge / (60 * 60 * 1000))
            }});
            try {
              const supabaseClose = resolveSupabaseClient();
              if (supabaseClose) {
                // Close at NOW — never collapse to start+1h (that silently ate hours).
                const endTime = new Date().toISOString();
                await supabaseClose
                  .from('time_logs')
                  .update({ end_time: endTime, status: 'auto_closed' })
                  .eq('id', activeLog.id);
                log.info({ step: 'SYNC_CLOSED_STALE', message: 'Closed stale session in database', ctx: { timeLogId: activeLog.id } });
              }
            } catch (closeErr) {
              log.warn({ step: 'SYNC_CLOSE_ERROR', message: 'Failed to close stale session: ' + closeErr.message });
            }
            return;
          }
          
          log.warn({ step: 'SYNC_MISMATCH', message: 'Found active session in DB but not tracking locally', ctx: { timeLogId: activeLog.id } });

          // Restore tracking state
          global.currentTimeLogId = activeLog.id;
          global.currentProjectId = activeLog.project_id;
          global.isTracking = true;
          global.isPaused = false;

          // CRITICAL FIX: Construct session object from recovery data if global.currentSession is undefined
          // This ensures screenshot capture can restart properly
          const sessionForRecovery = global.currentSession || {
            id: activeLog.id,
            user_id: activeLog.user_id,
            project_id: activeLog.project_id,
            start_time: activeLog.start_time,
            recovered: true
          };
          global.currentSession = sessionForRecovery;

          // CRITICAL FIX: Sync TrackingManager state to prevent state mismatch
          // Without this, global.isTracking and trackingManager.isTracking could desync
          if (global.trackingManager) {
            global.trackingManager.isTracking = true;
            global.trackingManager.isPaused = false;
            global.trackingManager.currentTimeLogId = activeLog.id;
            global.trackingManager.currentProjectId = activeLog.project_id;
            global.trackingManager.currentSession = sessionForRecovery;
            global.trackingManager.sessionStartTime = activeLog.start_time;
            log.info({ step: 'SYNC_TRACKING_MANAGER', message: 'TrackingManager state synced from recovery' });
          }

          // Notify components
          if (global.enhancedScreenshotManager) {
            global.enhancedScreenshotManager.updateTrackingState(true, sessionForRecovery);
          }
          if (global.urlCaptureManager) {
            global.urlCaptureManager.setTrackingState(true);
          }
          if (global.enhancedAppDetector) {
            global.enhancedAppDetector.setTrackingState(true);
          }

          log.info({ step: 'SYNC_RESTORED', message: 'Tracking state restored from database', ctx: { hasSession: !!sessionForRecovery } });
        }
      }
    } catch (error) {
      log.warn({ step: 'HEALTH_CHECK_ERROR', message: error.message });
    }
  };

  // Run initial check after 30 seconds
  setTimeout(healthCheck, 30000);

  // Then run every 5 minutes
  const interval = setInterval(healthCheck, HEALTH_CHECK_INTERVAL);

  // Register for cleanup
  if (global.cleanupRegistry) {
    global.cleanupRegistry.registerResource({
      name: 'sessionHealthCheck',
      cleanup: () => clearInterval(interval)
    });
  }

  log.info({ step: 'HEALTH_CHECK_STARTED', ctx: { intervalMs: HEALTH_CHECK_INTERVAL } });
}

/**
 * Force session state sync (called when components detect issues)
 */
async function forceSyncSessionState() {
  try {
    // Never restore tracking after an intentional stop (manual, idle, sleep, lock, shutdown)
    if (global.userExplicitlyStopped) {
      log.info({ step: 'FORCE_SYNC_BLOCKED', message: 'Blocked by userExplicitlyStopped — intentional stop in effect' });
      return false;
    }

    if (!global.sessionManager) {
      log.warn({ step: 'FORCE_SYNC_SKIP', message: 'Missing dependencies' });
      return false;
    }

    log.info({ step: 'FORCE_SYNC_START' });
    const supabase = resolveSupabaseClient();
    if (!supabase) {
      log.warn({ step: 'FORCE_SYNC_NO_CLIENT' });
      return false;
    }

    const session = await global.sessionManager.loadDesktopAgentSession();
    if (!session) {
      log.warn({ step: 'FORCE_SYNC_NO_SESSION', message: 'No session available' });
      return false;
    }

    // Update all globals
    global.currentUserId = session.id;
    if (global.config) global.config.user_id = session.id;

    // Check for active tracking on THIS DEVICE only
    const deviceId = getDeviceId();
    let activeQuery = supabase
      .from('time_logs')
      .select('*')
      .eq('user_id', session.id)
      .is('end_time', null)
      .eq('status', 'active')
      .limit(1);
    if (deviceId) {
      activeQuery = activeQuery.eq('device_id', deviceId);
    }
    const { data: activeLogs } = await activeQuery;

    if (activeLogs && activeLogs.length > 0) {
      const activeLog = activeLogs[0];

      // CRITICAL FIX: Don't restore tracking if we're in the middle of stopping
      if (global.isStopping) {
        log.info({ step: 'FORCE_SYNC_SKIP_STOPPING', message: 'Skipping force sync - stop in progress' });
        return false;
      }
      
      // Don't restore stale sessions (older than 24 hours) -- close them instead
      const sessionAge = Date.now() - new Date(activeLog.start_time).getTime();
      const MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours in ms
      if (sessionAge > MAX_SESSION_AGE) {
        log.info({ step: 'FORCE_SYNC_CLOSING_STALE', message: 'Closing stale session (>24h) instead of recovering', ctx: {
          sessionId: activeLog.id,
          ageHours: Math.round(sessionAge / (60 * 60 * 1000))
        }});
        try {
          // Close at NOW — never collapse to start+1h (that silently ate hours).
          const endTime = new Date().toISOString();
          await supabase
            .from('time_logs')
            .update({ end_time: endTime, status: 'auto_closed' })
            .eq('id', activeLog.id);
          log.info({ step: 'FORCE_SYNC_CLOSED_STALE', message: 'Closed stale session', ctx: { timeLogId: activeLog.id } });
        } catch (closeErr) {
          log.warn({ step: 'FORCE_SYNC_CLOSE_ERROR', message: closeErr.message });
        }
        return false;
      }

      global.currentTimeLogId = activeLog.id;
      global.currentProjectId = activeLog.project_id;
      global.isTracking = true;
      global.isPaused = false;

      // CRITICAL FIX: Sync TrackingManager state to prevent state mismatch
      if (global.trackingManager) {
        global.trackingManager.isTracking = true;
        global.trackingManager.isPaused = false;
        global.trackingManager.currentTimeLogId = activeLog.id;
        global.trackingManager.currentProjectId = activeLog.project_id;
        global.trackingManager.sessionStartTime = activeLog.start_time;
        log.info({ step: 'FORCE_SYNC_TRACKING_MANAGER', message: 'TrackingManager state synced' });
      }

      log.info({ step: 'FORCE_SYNC_SUCCESS', ctx: { timeLogId: activeLog.id } });
      return true;
    }

    log.info({ step: 'FORCE_SYNC_NO_ACTIVE', message: 'No active tracking sessions found' });
    return false;
  } catch (error) {
    log.error({ step: 'FORCE_SYNC_ERROR', message: error.message });
    return false;
  }
}

module.exports = {
  startSessionHealthCheck,
  forceSyncSessionState,
  resolveSupabaseClient
};
