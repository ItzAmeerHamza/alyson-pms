/**
 * Session Recovery Utility
 * Syncs open RDS sessions with the desktop agent using heartbeat/evidence liveness.
 *
 * Intentional Stop: when the employee stops Time Doctor, any remaining open
 * session on this device MUST be closed (pending end / checkpoint / NOW) —
 * flag-only left orphans that kept accruing until admin intervention.
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

function appDataDir() {
  const path = require('path');
  const os = require('os');
  const userDataDir =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  return path.join(userDataDir, 'Alyson Work Time');
}

function readLocalCheckpoint() {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(appDataDir(), 'session-checkpoint.json');
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readLocalCheckpointAt() {
  return readLocalCheckpoint()?.checkpointAt || null;
}

/** Newest end_time from pending_sessions/*.json (intentional stop that may not have synced). */
function readPendingSessionEndTime() {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(appDataDir(), 'pending_sessions');
    if (!fs.existsSync(dir)) return null;
    let best = null;
    let bestMs = 0;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const end = data?.endTime || data?.end_time;
        const ms = end ? new Date(end).getTime() : NaN;
        if (Number.isFinite(ms) && ms >= bestMs) {
          bestMs = ms;
          best = new Date(ms).toISOString();
        }
      } catch (_) { /* skip corrupt */ }
    }
    return best;
  } catch (_) {
    return null;
  }
}

/**
 * Best durable end_time for closing after an intentional stop.
 * Prefer pending close → checkpoint → caller fallback (usually NOW).
 */
function resolveExplicitStopEndTime(fallbackIso = null) {
  return (
    readPendingSessionEndTime() ||
    readLocalCheckpointAt() ||
    fallbackIso ||
    new Date().toISOString()
  );
}

function explicitStopFlagPath() {
  const path = require('path');
  return path.join(appDataDir(), 'explicit-stop.json');
}

/** Persist intentional stop so relaunch does not re-adopt orphans as "tracking". */
function markUserExplicitlyStopped(meta = {}) {
  global.userExplicitlyStopped = true;
  try {
    const fs = require('fs');
    const dir = appDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      explicitStopFlagPath(),
      JSON.stringify({
        stoppedAt: new Date().toISOString(),
        timeLogId: meta.timeLogId || global.currentTimeLogId || null,
        reason: meta.reason || 'manual',
      }),
      'utf8',
    );
  } catch (err) {
    log.warn({ step: 'EXPLICIT_STOP_PERSIST_FAILED', message: err?.message || String(err) });
  }
}

function clearUserExplicitlyStopped() {
  global.userExplicitlyStopped = false;
  try {
    const fs = require('fs');
    const p = explicitStopFlagPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) { /* ignore */ }
}

/** Load durable stop flag on startup (before health-check / recovery). */
function loadUserExplicitlyStoppedFromDisk() {
  try {
    const fs = require('fs');
    const p = explicitStopFlagPath();
    if (!fs.existsSync(p)) return false;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (parsed?.stoppedAt) {
      global.userExplicitlyStopped = true;
      log.info({
        step: 'EXPLICIT_STOP_LOADED',
        message: 'Prior intentional stop in effect — will close open sessions, not recover',
        ctx: { stoppedAt: parsed.stoppedAt, timeLogId: parsed.timeLogId || null },
      });
      return true;
    }
  } catch (_) { /* ignore */ }
  return false;
}

/**
 * Close all still-open sessions on this device after an intentional Stop.
 * Uses allow_unconfirmed_end so Nest mutates (inspect/flag alone left orphans).
 */
async function closeOpenSessionsAfterExplicitStop(options = {}) {
  const backendTimeLogs = require('./backend-time-logs');
  const userId = options.userId || global.currentUserId || global.config?.user_id;
  if (!userId) {
    log.warn({ step: 'EXPLICIT_STOP_CLOSE_SKIP', message: 'No user_id' });
    return { success: false, closed: 0, reason: 'no_user' };
  }
  const deviceId = options.deviceId !== undefined ? options.deviceId : getDeviceId();
  const endTime = resolveExplicitStopEndTime(options.end_time || null);

  if (!backendTimeLogs.isBackendTimeLogsEnabled(options.config || global.config)) {
    // Legacy Supabase: close open rows for this device at endTime.
    const supabase = resolveSupabaseClient();
    if (!supabase) return { success: false, closed: 0, reason: 'no_client' };
    let query = supabase
      .from('time_logs')
      .update({ end_time: endTime, status: 'completed' })
      .eq('user_id', userId)
      .is('end_time', null);
    if (deviceId) query = query.eq('device_id', deviceId);
    const { data, error } = await query.select('id');
    if (error) throw error;
    const closed = data?.length || 0;
    log.info({
      step: 'EXPLICIT_STOP_CLOSED_LEGACY',
      message: 'Closed open sessions after intentional stop',
      ctx: { closed, endTime, deviceId },
    });
    return { success: true, closed, closed_ids: (data || []).map((r) => r.id), end_time: endTime };
  }

  const result = await backendTimeLogs.closeActiveSessions(
    userId,
    deviceId,
    options.config || global.config,
    {
      end_time: endTime,
      allow_unconfirmed_end: true,
      prefer_recover: false,
      client_last_seen_at: readLocalCheckpointAt(),
      timeoutMs: options.timeoutMs || 12000,
    },
  );
  log.info({
    step: 'EXPLICIT_STOP_CLOSED',
    message: 'Closed open sessions after intentional stop',
    ctx: {
      closed: result?.closed ?? 0,
      closed_ids: result?.closed_ids || [],
      endTime,
      deviceId,
    },
  });
  return result;
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

        // Intentional Stop → close remaining open sessions (do not leave orphans).
        if (global.userExplicitlyStopped) {
          try {
            await closeOpenSessionsAfterExplicitStop();
          } catch (closeErr) {
            log.warn({
              step: 'EXPLICIT_STOP_CLOSE_FAILED',
              message: closeErr?.message || String(closeErr),
            });
          }
          return;
        }

        if (backendTimeLogs.isBackendTimeLogsEnabled()) {
          const result = await reconcileDeviceSessions({ preferRecover });
          if (result?.recovered?.id) {
            applyRecoveredSession(result.recovered);
            return;
          }
          if (result?.flagged_count) {
            // Not tracking + stale open = orphan. Close at suggested/checkpoint/NOW.
            log.info({
              step: 'SYNC_CLOSING_STALE_ORPHANS',
              message: 'Not tracking — closing flagged orphan session(s)',
              ctx: { flagged: result.flagged_count, details: result.flagged },
            });
            try {
              const suggested =
                result.flagged?.[0]?.suggested_end_at ||
                result.flagged?.[0]?.client_checkpoint_at ||
                null;
              await closeOpenSessionsAfterExplicitStop({ end_time: suggested || undefined });
            } catch (closeErr) {
              log.warn({
                step: 'ORPHAN_CLOSE_FAILED',
                message: closeErr?.message || String(closeErr),
              });
            }
          }
          return;
        }

        // Legacy Supabase path
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
        step: 'FORCE_SYNC_EXPLICIT_STOP',
        message: 'Intentional stop in effect — closing open sessions instead of recovering',
      });
      try {
        await closeOpenSessionsAfterExplicitStop();
      } catch (err) {
        log.warn({ step: 'FORCE_SYNC_CLOSE_FAILED', message: err?.message || String(err) });
      }
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
          step: 'FORCE_SYNC_CLOSING_STALE',
          message: 'Closing flagged orphan session(s)',
          ctx: { flagged: result.flagged_count },
        });
        try {
          const suggested =
            result.flagged?.[0]?.suggested_end_at ||
            result.flagged?.[0]?.client_checkpoint_at ||
            null;
          await closeOpenSessionsAfterExplicitStop({ end_time: suggested || undefined });
        } catch (err) {
          log.warn({ step: 'FORCE_SYNC_ORPHAN_CLOSE_FAILED', message: err?.message || String(err) });
        }
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
  closeOpenSessionsAfterExplicitStop,
  markUserExplicitlyStopped,
  clearUserExplicitlyStopped,
  loadUserExplicitlyStoppedFromDisk,
  resolveExplicitStopEndTime,
  readLocalCheckpointAt,
};
