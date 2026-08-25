/**
 * Session Recovery Utility
 * Syncs open RDS sessions with the desktop agent using heartbeat/evidence liveness.
 *
 * Intentional Stop: close remaining open sessions at pending end / checkpoint.
 * Stale / sleep / crash: close at last heartbeat — never wall-clock NOW.
 */

const { createFeatureLogger } = require('./logger');
const { getDeviceId } = require('./device-id');
const log = createFeatureLogger('SESSION', { adapter: 'recovery' });

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

/**
 * Checkpoint time for a session.
 *
 * MUST be scoped by time log id. The checkpoint file holds whichever session
 * wrote it last, so an unscoped read hands the PREVIOUS session's timestamp to
 * the one being closed. That end precedes the new session's start, the server
 * floors it to start + 30s, and you get a 30-second session that never happened.
 * 278 of 352 sub-minute sessions in production were exactly 30.0s from this.
 *
 * Passing no id returns the raw value — only valid for liveness checks
 * ("has anything checkpointed recently"), never for choosing an end_time.
 */
function readLocalCheckpointAt(timeLogId = null) {
  const cp = readLocalCheckpoint();
  if (!cp?.checkpointAt) return null;
  if (timeLogId && String(cp.timeLogId || '') !== String(timeLogId)) return null;
  return cp.checkpointAt;
}

/** Pending end_time for a session — that session's file only, never the newest of all. */
function readPendingSessionEndTime(timeLogId = null) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(appDataDir(), 'pending_sessions');
    if (!fs.existsSync(dir)) return null;

    if (timeLogId) {
      const filePath = path.join(dir, `${timeLogId}.json`);
      if (!fs.existsSync(filePath)) return null;
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const end = data?.endTime || data?.end_time;
        const ms = end ? new Date(end).getTime() : NaN;
        return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
      } catch (_) {
        return null;
      }
    }

    // No id: newest across all pending files. Recovery sweeps only — a close
    // that targets one session must pass its id.
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

const STALE_CHECKPOINT_MS = 15 * 60 * 1000;

function isIsoRecent(iso, maxAgeMs = STALE_CHECKPOINT_MS) {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) && Date.now() - ms <= maxAgeMs;
}

/**
 * Best durable end_time. Prefer pending close → checkpoint → caller fallback.
 * NOW is allowed only for a live Stop click (employee is ending right now).
 * Orphan / sleep / crash recovery must never invent wall-clock NOW.
 */
function resolveExplicitStopEndTime(fallbackIso = null, { liveStop = false, timeLogId = null } = {}) {
  return resolveExplicitStopEnd(fallbackIso, { liveStop, timeLogId }).endTime;
}

/**
 * Same resolution, but reports WHERE the end came from.
 *
 * Provenance decides which confirmation the server gets. Sending
 * allow_unconfirmed_end unconditionally made the gate meaningless — it claims
 * "nothing corroborates this" even when a durable on-disk checkpoint does.
 * A pending close or checkpoint IS local-checkpoint confirmation; say so.
 */
function resolveExplicitStopEnd(fallbackIso = null, { liveStop = false, timeLogId = null } = {}) {
  // Scoped to this session. An unscoped read returns the previous session's
  // timestamp, which lands before this one's start and gets floored to 30s.
  const pending = readPendingSessionEndTime(timeLogId);
  if (pending) return { endTime: pending, source: 'pending_close' };

  const checkpoint = readLocalCheckpointAt(timeLogId);
  if (checkpoint) return { endTime: checkpoint, source: 'local_checkpoint' };

  if (fallbackIso) return { endTime: fallbackIso, source: 'caller_supplied' };

  return {
    endTime: liveStop ? new Date().toISOString() : null,
    source: liveStop ? 'live_stop_now' : 'none',
  };
}

/** True when the end time is backed by a durable local record. */
function isLocallyConfirmed(source) {
  return source === 'pending_close' || source === 'local_checkpoint';
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
 *
 * The server is told how the end time was established — local checkpoint,
 * server-side liveness, or neither — rather than always claiming it is
 * unconfirmed. The liveness ceiling clamps the value either way, so the flag
 * exists to make the audit trail honest about provenance.
 */
async function closeOpenSessionsAfterExplicitStop(options = {}) {
  const backendTimeLogs = require('./backend-time-logs');
  const userId = options.userId || global.currentUserId || global.config?.user_id;
  if (!userId) {
    log.warn({ step: 'EXPLICIT_STOP_CLOSE_SKIP', message: 'No user_id' });
    return { success: false, closed: 0, reason: 'no_user' };
  }
  const deviceId = options.deviceId !== undefined ? options.deviceId : getDeviceId();

  // Offline: the end time is already durable on disk (pending close + offline
  // queue) and will sync. Chaining more network calls here only makes the
  // employee wait to be told what we already know.
  if (backendTimeLogs.isLikelyOffline()) {
    log.info({
      step: 'EXPLICIT_STOP_OFFLINE',
      message: 'Offline — stop recorded locally, sessions will close on next sync',
    });
    return { success: true, closed: 0, offline: true, deferred: true };
  }

  // KILL ALL: every open row on this device closes at its own last proof-of-life.
  //
  // This runs for any sweep that does not name a session, INCLUDING one that was
  // handed an end_time. A device-wide close applies a single timestamp to every
  // open row, so an ambient end — typically the running session's checkpoint —
  // gets stamped onto an unrelated orphan that died hours earlier, ending it
  // after the current session already began. That produced 84 overlapping pairs
  // sitting 0-29s (0-3 checkpoint intervals) past the newer session's start.
  //
  // One timestamp cannot be correct for several independent sessions. A caller
  // that genuinely knows one session's end names it via timeLogId; everyone else
  // gets per-row liveness, which is right for every row by construction.
  const targetsOneSession = options.timeLogId != null;
  if (!targetsOneSession && backendTimeLogs.isBackendTimeLogsEnabled(options.config || global.config)) {
    try {
      const killed = await backendTimeLogs.killAllSessions(
        userId,
        deviceId,
        options.config || global.config,
        { reason: options.reason || 'explicit_stop', timeoutMs: options.timeoutMs },
      );
      log.info({
        step: 'EXPLICIT_STOP_CLOSED',
        message: 'Killed all open sessions at their own last proof-of-life',
        ctx: { closed: killed?.closed ?? 0, closed_ids: killed?.closed_ids || [], deviceId },
      });
      return killed;
    } catch (killErr) {
      log.warn({
        step: 'KILL_ALL_FAILED',
        message: killErr?.message || String(killErr),
      });
      // Fall through to the durable-end path below.
    }
  }

  let { endTime, source: endSource } = resolveExplicitStopEnd(options.end_time || null, {
    liveStop: options.liveStop === true,
    // Without an id the durable readers would hand back a PREVIOUS session's
    // timestamp. Callers closing one session pass it; sweeps pass none and fall
    // through to each row's own last_alive_at instead.
    timeLogId: options.timeLogId || null,
  });
  if (!endTime) {
    try {
      const inspect = await backendTimeLogs.reconcileOpenSessions(
        userId,
        deviceId,
        options.config || global.config,
        {
          prefer_recover: false,
          client_last_seen_at: readLocalCheckpointAt(),
          freshness_minutes: 15,
          timeoutMs: options.timeoutMs || 12000,
        },
      );
      endTime =
        inspect?.closed?.[0]?.end_time ||
        inspect?.flagged?.[0]?.suggested_end_at ||
        inspect?.flagged?.[0]?.last_heartbeat_at ||
        inspect?.flagged?.[0]?.last_evidence_at ||
        inspect?.open?.[0]?.suggested_end_at ||
        inspect?.open?.[0]?.last_heartbeat_at ||
        null;
      if (endTime) endSource = 'server_liveness';
      if (inspect?.closed_count > 0 && !options.end_time) {
        log.info({
          step: 'EXPLICIT_STOP_ALREADY_CLOSED',
          message: 'Server already closed stale session(s) at last heartbeat',
          ctx: { closed: inspect.closed_count, endTime },
        });
        return {
          success: true,
          closed: inspect.closed_count,
          closed_ids: (inspect.closed || []).map((r) => r.id),
          end_time: endTime,
        };
      }
    } catch (inspectErr) {
      log.warn({
        step: 'EXPLICIT_STOP_INSPECT_FAILED',
        message: inspectErr?.message || String(inspectErr),
      });
    }
  }
  if (!endTime) {
    log.warn({
      step: 'EXPLICIT_STOP_NO_DURABLE_END',
      message: 'Refusing to close at NOW — no checkpoint, pending, or heartbeat',
    });
    return { success: false, closed: 0, reason: 'no_durable_end' };
  }

  if (!backendTimeLogs.isBackendTimeLogsEnabled(options.config || global.config)) {
    // PAYROLL: never pretend a close happened. The end time is already durable on
    // disk (pending close + offline queue) and syncs when the API is reachable.
    log.warn({
      step: 'EXPLICIT_STOP_NO_BACKEND',
      message: 'Backend not configured — close stays queued locally',
      ctx: { endTime, deviceId },
    });
    return { success: false, closed: 0, reason: 'backend_not_configured', end_time: endTime };
  }

  // A pending close or on-disk checkpoint IS local-checkpoint confirmation.
  // Only a server-derived or caller-supplied end is genuinely unconfirmed.
  const locallyConfirmed = isLocallyConfirmed(endSource);
  const result = await backendTimeLogs.closeActiveSessions(
    userId,
    deviceId,
    options.config || global.config,
    {
      end_time: endTime,
      confirm_with_local_checkpoint: locallyConfirmed,
      allow_unconfirmed_end: !locallyConfirmed,
      prefer_recover: false,
      client_last_seen_at: readLocalCheckpointAt(),
      timeoutMs: options.timeoutMs || 12000,
    },
  );
  log.info({
    step: 'EXPLICIT_STOP_CLOSED',
    message: 'Closed open sessions after intentional stop',
    ctx: {
      end_source: endSource,
      confirmed: locallyConfirmed,
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
        const checkpointAt = readLocalCheckpointAt();
        try {
          const start =
            global.sessionStartTime ||
            global.trackingManager?.sessionStartTime ||
            global.currentSession?.start_time ||
            null;
          if (start) {
            const { workDateKey, endOfWorkDayExclusive } = require('./work-timezone');
            const startKey = workDateKey(new Date(start));
            const todayKey = workDateKey();
            if (startKey && todayKey && startKey !== todayKey) {
              const dayEnd = endOfWorkDayExclusive(new Date(start)).toISOString();
              log.warn({
                step: 'HEALTH_CHECK_CROSS_MIDNIGHT',
                message: 'Open session crossed company midnight — closing at day boundary',
                ctx: { startKey, todayKey, dayEnd, timeLogId: global.currentTimeLogId },
              });
              try {
                global.trackingManager?._stopTimeLogCheckpoint?.();
              } catch (_) { /* ignore */ }
              const projectId =
                global.currentProjectId || global.trackingManager?.currentProjectId || null;
              // Names the session: the day boundary is a real end for THIS row,
              // not a value that should be stamped across every open row.
              await closeOpenSessionsAfterExplicitStop({
                end_time: dayEnd,
                timeLogId: global.currentTimeLogId,
              });
              clearLocalTrackingAfterStaleClose();
              if (projectId && typeof global.startTracking === 'function') {
                try {
                  await global.startTracking(projectId);
                } catch (startErr) {
                  log.warn({
                    step: 'HEALTH_CHECK_MIDNIGHT_RESTART_FAILED',
                    message: startErr?.message || String(startErr),
                  });
                }
              }
              return;
            }
          }
        } catch (dayErr) {
          log.warn({
            step: 'HEALTH_CHECK_DAY_SPLIT_FAILED',
            message: dayErr?.message || String(dayErr),
          });
        }
        if (isIsoRecent(checkpointAt, STALE_CHECKPOINT_MS)) {
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
        log.warn({
          step: 'HEALTH_CHECK_STALE_WHILE_TRACKING',
          message: 'Tracking flag set but checkpoint is stale — closing at last durable mark',
          ctx: { timeLogId: global.currentTimeLogId, checkpointAt },
        });
        try {
          global.trackingManager?._stopTimeLogCheckpoint?.();
        } catch (_) { /* ignore */ }
        try {
          await closeOpenSessionsAfterExplicitStop({ end_time: checkpointAt || undefined });
        } catch (closeErr) {
          log.warn({
            step: 'HEALTH_CHECK_STALE_CLOSE_FAILED',
            message: closeErr?.message || String(closeErr),
          });
        }
        clearLocalTrackingAfterStaleClose();
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
                result.flagged?.[0]?.last_heartbeat_at ||
                result.flagged?.[0]?.last_evidence_at ||
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

        log.warn({
          step: 'HEALTH_CHECK_NO_BACKEND',
          message: 'Backend not configured — cannot reconcile open sessions',
        });
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
            result.flagged?.[0]?.last_heartbeat_at ||
            result.flagged?.[0]?.last_evidence_at ||
            result.flagged?.[0]?.client_checkpoint_at ||
            null;
          await closeOpenSessionsAfterExplicitStop({ end_time: suggested || undefined });
        } catch (err) {
          log.warn({ step: 'FORCE_SYNC_ORPHAN_CLOSE_FAILED', message: err?.message || String(err) });
        }
      }
      return false;
    }

    log.warn({
      step: 'FORCE_SYNC_NO_BACKEND',
      message: 'Backend not configured — nothing to reconcile against',
    });
    return false;
  } catch (error) {
    log.warn({ step: 'FORCE_SYNC_ERROR', message: error.message });
    return false;
  }
}

function clearLocalTrackingAfterStaleClose() {
  global.isTracking = false;
  global.currentTimeLogId = null;
  global.currentSession = null;
  global.sessionStartTime = null;
  try {
    if (global.trackingManager) {
      global.trackingManager.isTracking = false;
      global.trackingManager.currentTimeLogId = null;
      global.trackingManager.currentSession = null;
      global.trackingManager.sessionStartTime = null;
      global.trackingManager._stopTimeLogCheckpoint?.();
    }
  } catch (_) { /* ignore */ }
}

/**
 * Lid-open / wake: if the last checkpoint is stale, close at that mark
 * BEFORE any new heartbeat/checkpoint can stamp NOW and re-freshen the orphan.
 */
async function reconcileAfterWake() {
  const { isSleepGap } = require('./sleep-aware-elapsed');
  const checkpointAt = readLocalCheckpointAt();
  const now = Date.now();
  const lidDown = !!global._lidDownArmed;
  const proofIso = global._lidLastProofIso || checkpointAt;
  const sleepGap = lidDown || isSleepGap(proofIso, now);
  const stale = sleepGap || !isIsoRecent(checkpointAt, STALE_CHECKPOINT_MS);

  if (sleepGap) {
    global._startAfterSleep = true;
    global._lastWakeAtMs = now;
  }

  if (lidDown || sleepGap) {
    log.warn({
      step: 'WAKE_LID_STOP',
      message: 'Lid/sleep was a full stop — will not continue the pre-sleep session',
      ctx: { checkpointAt, endAt: proofIso, isTracking: !!global.isTracking },
    });
    try {
      global.trackingManager?._stopTimeLogCheckpoint?.();
    } catch (_) { /* ignore */ }
    try {
      if (global.isTracking || global.trackingManager?.isTracking || global.currentTimeLogId) {
        await closeOpenSessionsAfterExplicitStop({ end_time: proofIso || checkpointAt || undefined });
      }
    } catch (err) {
      log.warn({ step: 'WAKE_LID_CLOSE_FAILED', message: err?.message || String(err) });
    }
    clearLocalTrackingAfterStaleClose();
    return { closedStale: true, lidStop: true, end_time: proofIso || checkpointAt || null };
  }

  if (!stale && (global.isTracking || global.trackingManager?.isTracking)) {
    log.info({ step: 'WAKE_CONTINUE', message: 'Checkpoint is fresh — keeping session' });
    return { continued: true };
  }
  if (!stale && !global.isTracking && !global.trackingManager?.isTracking) {
    return { ok: true };
  }

  log.warn({
    step: 'WAKE_STALE_SESSION',
    message: 'Closing stale open session at last checkpoint/heartbeat (not NOW)',
    ctx: { checkpointAt, endAt: proofIso, sleepGap, isTracking: !!global.isTracking },
  });
  try {
    global.trackingManager?._stopTimeLogCheckpoint?.();
  } catch (_) { /* ignore */ }
  try {
    await closeOpenSessionsAfterExplicitStop({ end_time: proofIso || checkpointAt || undefined });
  } catch (err) {
    log.warn({ step: 'WAKE_STALE_CLOSE_FAILED', message: err?.message || String(err) });
  }
  clearLocalTrackingAfterStaleClose();
  return { closedStale: true, end_time: proofIso || checkpointAt || null };
}

module.exports = {
  startSessionHealthCheck,
  forceSyncSessionState,
  reconcileDeviceSessions,
  closeOpenSessionsAfterExplicitStop,
  markUserExplicitlyStopped,
  clearUserExplicitlyStopped,
  loadUserExplicitlyStoppedFromDisk,
  resolveExplicitStopEndTime,
  resolveExplicitStopEnd,
  readLocalCheckpointAt,
  reconcileAfterWake,
  clearLocalTrackingAfterStaleClose,
};
