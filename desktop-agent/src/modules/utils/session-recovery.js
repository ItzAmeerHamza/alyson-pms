/**
 * Session Recovery Utility
 * Syncs open RDS sessions with the desktop agent using heartbeat/evidence liveness.
 * Stale orphans are closed at last trustworthy timestamp — never at NOW.
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

function readLocalCheckpointAt() {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const userDataDir =
      process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config'));
    const filePath = path.join(userDataDir, 'Alyson Work Time', 'session-checkpoint.json');
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed?.checkpointAt || null;
  } catch (_) {
    return null;
  }
}

function applyRecoveredSession(activeLog) {
  global.currentTimeLogId = activeLog.id;
  global.currentProjectId = activeLog.project_id;
  global.isTracking = true;
  global.isPaused = false;

  const sessionForRecovery = global.currentSession || {
    id: activeLog.id,
    user_id: activeLog.user_id,
    project_id: activeLog.project_id,
    start_time: activeLog.start_time,
    recovered: true,
  };
  global.currentSession = sessionForRecovery;
  global.sessionStartTime = activeLog.start_time;

  if (global.trackingManager) {
    global.trackingManager.isTracking = true;
    global.trackingManager.isPaused = false;
    global.trackingManager.currentTimeLogId = activeLog.id;
    global.trackingManager.currentProjectId = activeLog.project_id;
    global.trackingManager.currentSession = sessionForRecovery;
    global.trackingManager.sessionStartTime = activeLog.start_time;
    log.info({ step: 'SYNC_TRACKING_MANAGER', message: 'TrackingManager state synced from recovery' });
  }

  if (global.enhancedScreenshotManager) {
    global.enhancedScreenshotManager.updateTrackingState(true, sessionForRecovery);
  }
  if (global.urlCaptureManager) {
    global.urlCaptureManager.setTrackingState(true);
  }
  if (global.enhancedAppDetector) {
    global.enhancedAppDetector.setTrackingState(true);
  }

  log.info({
    step: 'SYNC_RESTORED',
    message: 'Tracking state restored from database',
    ctx: {
      timeLogId: activeLog.id,
      liveness: activeLog.liveness_source,
      ageSeconds: activeLog.age_seconds,
    },
  });
}

/**
 * Reconcile device open sessions via Nest (heartbeat / evidence based).
 */
async function reconcileDeviceSessions({ preferRecover = true } = {}) {
  const backendTimeLogs = require('./backend-time-logs');
  if (!backendTimeLogs.isBackendTimeLogsEnabled() || !global.currentUserId) {
    return null;
  }
  return backendTimeLogs.reconcileOpenSessions(
    global.currentUserId,
    getDeviceId(),
    global.config,
    {
      prefer_recover: preferRecover,
      client_last_seen_at: readLocalCheckpointAt(),
      freshness_minutes: 15,
    },
  );
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

      if (global.isTracking && global.currentTimeLogId) {
        log.debug({
          step: 'HEALTH_CHECK_OK',
          ctx: {
            userId: global.currentUserId,
            timeLogId: global.currentTimeLogId,
            isTracking: global.isTracking,
          },
        });
        return;
      }

      if (!global.isTracking) {
        log.info({
          step: 'HEALTH_CHECK_SYNC',
          message: 'Checking database for active sessions on this device',
        });

        if (global.isStopping) {
          log.info({ step: 'SYNC_SKIP_STOPPING', message: 'Skipping session recovery - stop in progress' });
          return;
        }

        const preferRecover = !global.userExplicitlyStopped;
        const backendTimeLogs = require('./backend-time-logs');

        if (backendTimeLogs.isBackendTimeLogsEnabled()) {
          const result = await reconcileDeviceSessions({ preferRecover });
          if (!preferRecover) {
            log.info({
              step: 'SYNC_FLAGGED_STALE',
              message: 'User stopped — flagged open sessions (no auto-close from heartbeat)',
              ctx: { flagged: result?.flagged_count || 0 },
            });
            return;
          }
          if (result?.recovered?.id) {
            applyRecoveredSession(result.recovered);
            return;
          }
          if (result?.flagged_count) {
            log.info({
              step: 'SYNC_FLAGGED_STALE',
              message: 'Flagged stale orphan session(s); awaiting confirmation to close',
              ctx: { flagged: result.flagged_count, details: result.flagged },
            });
          }
          return;
        }

        // Legacy Supabase path — still avoid close-at-NOW when possible
        const supabase = resolveSupabaseClient();
        if (!supabase) {
          log.warn({ step: 'HEALTH_CHECK_NO_CLIENT' });
          return;
        }

        const deviceId = getDeviceId();
        let query = supabase
          .from('time_logs')
          .select('*')
          .eq('user_id', global.currentUserId)
          .is('end_time', null)
          .eq('status', 'active')
          .limit(1);
        if (deviceId) query = query.eq('device_id', deviceId);
        const { data: activeLogs } = await query;
        const activeLog = activeLogs?.[0] ?? null;
        if (!activeLog) return;

        if (global.userExplicitlyStopped) {
          const checkpointAt = readLocalCheckpointAt();
          const endTime = checkpointAt || activeLog.start_time;
          await supabase
            .from('time_logs')
            .update({ end_time: endTime, status: 'auto_closed' })
            .eq('id', activeLog.id);
          log.info({
            step: 'SYNC_CLOSED_STALE',
            message: 'Closed session at checkpoint/start (legacy)',
            ctx: { timeLogId: activeLog.id, endTime },
          });
          return;
        }

        const sessionAge = Date.now() - new Date(activeLog.start_time).getTime();
        const MAX_FRESH_MS = 15 * 60 * 1000;
        if (sessionAge > MAX_FRESH_MS) {
          const checkpointAt = readLocalCheckpointAt();
          const endTime = checkpointAt || activeLog.start_time;
          await supabase
            .from('time_logs')
            .update({ end_time: endTime, status: 'auto_closed' })
            .eq('id', activeLog.id);
          log.info({
            step: 'SYNC_CLOSED_STALE',
            message: 'Closed stale session at last checkpoint (legacy)',
            ctx: { timeLogId: activeLog.id, endTime },
          });
          return;
        }

        applyRecoveredSession(activeLog);
      }
    } catch (error) {
      log.warn({ step: 'HEALTH_CHECK_ERROR', message: error.message });
    }
  };

  setTimeout(healthCheck, 30000);
  const interval = setInterval(healthCheck, HEALTH_CHECK_INTERVAL);

  if (global.cleanupRegistry) {
    global.cleanupRegistry.registerResource({
      name: 'sessionHealthCheck',
      cleanup: () => clearInterval(interval),
    });
  }

  log.info({ step: 'HEALTH_CHECK_STARTED', ctx: { intervalMs: HEALTH_CHECK_INTERVAL } });
}

/**
 * Force session state sync (called when components detect issues)
 */
async function forceSyncSessionState() {
  try {
    if (global.userExplicitlyStopped) {
      log.info({
        step: 'FORCE_SYNC_BLOCKED',
        message: 'Blocked by userExplicitlyStopped — intentional stop in effect',
      });
      return false;
    }

    if (global.isStopping) {
      log.info({ step: 'FORCE_SYNC_SKIP_STOPPING', message: 'Skipping force sync - stop in progress' });
      return false;
    }

    const backendTimeLogs = require('./backend-time-logs');
    if (backendTimeLogs.isBackendTimeLogsEnabled() && global.currentUserId) {
      const result = await reconcileDeviceSessions({ preferRecover: true });
      if (result?.recovered?.id) {
        applyRecoveredSession(result.recovered);
        return true;
      }
      if (result?.flagged_count) {
        log.info({
          step: 'FORCE_SYNC_FLAGGED_STALE',
          message: 'Flagged stale orphans; no auto-close from heartbeat',
          ctx: { flagged: result.flagged_count },
        });
      }
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

    global.currentUserId = session.id;
    if (global.config) global.config.user_id = session.id;

    const deviceId = getDeviceId();
    let activeQuery = supabase
      .from('time_logs')
      .select('*')
      .eq('user_id', session.id)
      .is('end_time', null)
      .eq('status', 'active')
      .limit(1);
    if (deviceId) activeQuery = activeQuery.eq('device_id', deviceId);
    const { data: activeLogs } = await activeQuery;

    if (activeLogs && activeLogs.length > 0) {
      const activeLog = activeLogs[0];
      const sessionAge = Date.now() - new Date(activeLog.start_time).getTime();
      if (sessionAge > 15 * 60 * 1000) {
        const endTime = readLocalCheckpointAt() || activeLog.start_time;
        await supabase
          .from('time_logs')
          .update({ end_time: endTime, status: 'auto_closed' })
          .eq('id', activeLog.id);
        log.info({
          step: 'FORCE_SYNC_CLOSED_STALE',
          message: 'Closed stale session at checkpoint',
          ctx: { timeLogId: activeLog.id, endTime },
        });
        return false;
      }
      applyRecoveredSession(activeLog);
      return true;
    }
    return false;
  } catch (error) {
    log.warn({ step: 'FORCE_SYNC_ERROR', message: error.message });
    return false;
  }
}

module.exports = {
  startSessionHealthCheck,
  forceSyncSessionState,
  resolveSupabaseClient,
  reconcileDeviceSessions,
};
