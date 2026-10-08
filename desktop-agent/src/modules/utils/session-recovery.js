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
  const { getPayrollAppDataDir } = require('./payroll-app-data-dir');
  return getPayrollAppDataDir();
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

function pendingSessionsDir() {
  const path = require('path');
  return path.join(appDataDir(), 'pending_sessions');
}

function parsePendingSessionFile(raw, fallbackId = null) {
  if (!raw) return null;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const timeLogId = data?.timeLogId || data?.id || fallbackId || null;
  const end = data?.endTime || data?.end_time;
  const ms = end ? new Date(end).getTime() : NaN;
  if (!Number.isFinite(ms)) return null;
  return {
    timeLogId: timeLogId != null ? String(timeLogId) : null,
    endTime: new Date(ms).toISOString(),
    startTime: data?.startTime || data?.start_time || null,
    userId: data?.userId || data?.user_id || null,
    projectId: data?.projectId || data?.project_id || null,
    deviceId: data?.deviceId || data?.device_id || null,
    reason: data?.reason || null,
  };
}

/** Every unfinished local close — used to queue the frozen end when the network returns. */
function listPendingSessionCloses() {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = pendingSessionsDir();
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const parsed = parsePendingSessionFile(
          fs.readFileSync(path.join(dir, file), 'utf8'),
          file.replace(/\.json$/i, ''),
        );
        if (parsed?.timeLogId) out.push(parsed);
      } catch (_) { /* skip corrupt */ }
    }
    return out;
  } catch (_) {
    return [];
  }
}

/** Pending end_time for a session — that session's file only, never the newest of all. */
function readPendingSessionEndTime(timeLogId = null) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = pendingSessionsDir();
    if (!fs.existsSync(dir)) return null;

    if (timeLogId) {
      const filePath = path.join(dir, `${timeLogId}.json`);
      if (!fs.existsSync(filePath)) return null;
      try {
        const parsed = parsePendingSessionFile(fs.readFileSync(filePath, 'utf8'), timeLogId);
        return parsed?.endTime || null;
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
  const timeLogId = meta.timeLogId || global.currentTimeLogId || null;
  const reason = meta.reason || 'manual';
  const endTime = meta.endTime || global._stopEndTimeOverride || null;
  global._lastExplicitStopTimeLogId = timeLogId;
  global._lastExplicitStopReason = reason;
  global._lastExplicitStopEndIso = endTime;
  try {
    const fs = require('fs');
    const dir = appDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      explicitStopFlagPath(),
      JSON.stringify({
        stoppedAt: new Date().toISOString(),
        timeLogId,
        reason,
        endTime,
      }),
      'utf8',
    );
  } catch (err) {
    log.warn({ step: 'EXPLICIT_STOP_PERSIST_FAILED', message: err?.message || String(err) });
  }
}

function earlierIso(...candidates) {
  let best = null;
  let bestMs = Infinity;
  for (const raw of candidates) {
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (!Number.isFinite(ms) || ms >= bestMs) continue;
    bestMs = ms;
    best = new Date(ms).toISOString();
  }
  return best;
}

/** Read the last intentional stop without clearing it. Start uses this. */
function peekExplicitStop() {
  if (!global.userExplicitlyStopped || !global._lastExplicitStopTimeLogId) {
    loadUserExplicitlyStoppedFromDisk();
  }
  return {
    active: !!global.userExplicitlyStopped,
    timeLogId: global._lastExplicitStopTimeLogId || null,
    reason: global._lastExplicitStopReason || null,
    endTime: global._lastExplicitStopEndIso || global._stopEndTimeOverride || null,
  };
}

/**
 * Durable Stop end for this row. Pending file wins, then the explicit-stop
 * flag. Callers must never bill past this instant.
 */
function frozenEndForSession(timeLogId) {
  if (!timeLogId) return null;
  const pending = readPendingSessionEndTime(timeLogId);
  const explicit = peekExplicitStop();
  const explicitEnd =
    explicit.timeLogId && String(explicit.timeLogId) === String(timeLogId)
      ? explicit.endTime
      : null;
  return earlierIso(pending, explicitEnd);
}

/**
 * A stopped session must never be adopted as live. Extra hours are always
 * this row staying open after Stop (Hamza 21 Sep).
 */
function mustNotRecoverSession(timeLogId) {
  if (!timeLogId) return false;
  if (frozenEndForSession(timeLogId)) return true;
  const explicit = peekExplicitStop();
  if (explicit.active && !explicit.timeLogId) return true;
  if (explicit.active && String(explicit.timeLogId) === String(timeLogId)) return true;
  return listPendingSessionCloses().some(
    (row) => String(row.timeLogId) === String(timeLogId),
  );
}

/**
 * Idle-timeout / Stop / sleep must not resume the row that was just closed.
 * Recover is only for crash mid-session — not Continue after an explicit stop.
 */
function shouldDropRecoveredSession({
  startAfterSleep = false,
  explicitStop = false,
  recoveredId = null,
  stoppedId = null,
} = {}) {
  if (!recoveredId) return false;
  if (startAfterSleep) return true;
  if (explicitStop) return true;
  if (stoppedId && String(recoveredId) === String(stoppedId)) return true;
  if (mustNotRecoverSession(recoveredId)) return true;
  return false;
}

/**
 * Inspect may only resume a crash-mid-session row. Idle / Stop / a pending
 * close on disk means Start must create a new row (Hamza 29–30 Sep: recover
 * reused 5a9ac1d6 / f72034f2 and the clock showed ~2×).
 */
function shouldPreferRecover({ startAfterSleep = false, explicitStop = false } = {}) {
  if (startAfterSleep) return false;
  if (explicitStop) return false;
  try {
    if (peekExplicitStop().active) return false;
  } catch (_) { /* peek is best-effort */ }
  try {
    if (listPendingSessionCloses().length > 0) return false;
  } catch (_) { /* pending dir optional in tests */ }
  return true;
}

/**
 * If tracking was resumed for a session that already has a frozen Stop,
 * detach immediately and keep that end on the retry queue.
 */
function refuseLiveFrozenSession() {
  const id = liveTimeLogId();
  const endTime = frozenEndForSession(id);
  if (!id || !endTime) return null;
  log.warn({
    step: 'REFUSE_LIVE_FROZEN',
    message: 'Live session already has a frozen Stop — detaching, will write that end',
    ctx: { timeLogId: id, endTime },
  });
  clearLocalTrackingAfterStaleClose({ reason: 'frozen_stop' });
  try {
    global.trackingManager?._queueOfflineTimeLogUpdate?.(
      {
        id,
        end_time: endTime,
        status: 'completed',
        last_alive_at: endTime,
        client_last_seen_at: endTime,
        frozen_end: true,
      },
      { flush: true },
    );
  } catch (_) { /* queue is best-effort; pending file remains */ }
  return { id, endTime };
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
      if (parsed.timeLogId) global._lastExplicitStopTimeLogId = parsed.timeLogId;
      if (parsed.reason) global._lastExplicitStopReason = parsed.reason;
      if (parsed.endTime) global._lastExplicitStopEndIso = parsed.endTime;
      log.info({
        step: 'EXPLICIT_STOP_LOADED',
        message: 'Prior intentional stop in effect — will close open sessions, not recover',
        ctx: {
          stoppedAt: parsed.stoppedAt,
          timeLogId: parsed.timeLogId || null,
          endTime: parsed.endTime || null,
        },
      });
      return true;
    }
  } catch (_) { /* ignore */ }
  return false;
}

/**
 * Startup pending-close must not kill-all a session the employee just started.
 * Ameer 31 Aug: processPendingSessionCloses ran 15s after Start and closed a402c6b3.
 */
function liveTimeLogId(state = global) {
  return state.currentTimeLogId || state.trackingManager?.currentTimeLogId || null;
}

function hasLiveSessionToProtect(state = global) {
  return !!(
    state.isTracking ||
    state.trackingManager?.isTracking ||
    liveTimeLogId(state)
  );
}

/**
 * Close all still-open sessions on this device after an intentional Stop.
 *
 * The server is told how the end time was established — local checkpoint,
 * server-side liveness, or neither — rather than always claiming it is
 * unconfirmed. The liveness ceiling clamps the value either way, so the flag
 * exists to make the audit trail honest about provenance.
 */
async function flushFrozenPendingCloses(options = {}) {
  const pending = listPendingSessionCloses();
  const backendTimeLogs = require('./backend-time-logs');
  if (!pending.length) return { flushed: 0, pending };
  if (
    !backendTimeLogs.isBackendTimeLogsEnabled(options.config || global.config) ||
    typeof backendTimeLogs.updateTimeLog !== 'function'
  ) {
    return { flushed: 0, deferred: true, pending };
  }
  if (backendTimeLogs.isLikelyOffline()) {
    log.info({
      step: 'FROZEN_CLOSE_OFFLINE',
      message: 'Frozen Stop stays queued until the network returns',
      ctx: { count: pending.length },
    });
    try {
      global.trackingManager?.hydratePendingClosesIntoOfflineQueue?.({ flush: true });
    } catch (_) { /* pending files remain */ }
    return { flushed: 0, deferred: true, pending };
  }

  let flushed = 0;
  for (const row of pending) {
    try {
      await backendTimeLogs.updateTimeLog(
        row.timeLogId,
        {
          end_time: row.endTime,
          status: 'completed',
          last_alive_at: row.endTime,
          client_last_seen_at: row.endTime,
          frozen_end: true,
        },
        options.config || global.config,
        { timeoutMs: options.timeoutMs || 12000 },
      );
      flushed += 1;
      try {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(pendingSessionsDir(), `${row.timeLogId}.json`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) { /* file can retry next flush */ }
      try {
        global.trackingManager?._markTimeLogSynced?.({
          id: row.timeLogId,
          start_time: row.startTime,
          end_time: row.endTime,
          status: 'completed',
          event: 'synced_update',
        });
      } catch (_) { /* ledger is best-effort */ }
    } catch (err) {
      log.warn({
        step: 'FROZEN_CLOSE_FLUSH_FAILED',
        message: err?.message || String(err),
        ctx: { timeLogId: row.timeLogId, endTime: row.endTime },
      });
      try {
        global.trackingManager?._queueOfflineTimeLogUpdate?.(
          {
            id: row.timeLogId,
            user_id: row.userId,
            start_time: row.startTime,
            end_time: row.endTime,
            status: 'completed',
            last_alive_at: row.endTime,
            client_last_seen_at: row.endTime,
            frozen_end: true,
          },
          { flush: false },
        );
      } catch (_) { /* file remains */ }
    }
  }
  if (flushed < pending.length) {
    try {
      global.trackingManager?.startOfflineSync?.();
    } catch (_) { /* ignore */ }
  }
  return { flushed, pending };
}

async function closeOpenSessionsAfterExplicitStop(options = {}) {
  const backendTimeLogs = require('./backend-time-logs');
  const userId = options.userId || global.currentUserId || global.config?.user_id;
  if (!userId) {
    log.warn({ step: 'EXPLICIT_STOP_CLOSE_SKIP', message: 'No user_id' });
    return { success: false, closed: 0, reason: 'no_user' };
  }
  const deviceId = options.deviceId !== undefined ? options.deviceId : getDeviceId();

  // Frozen pending closes first. kill-all at last_alive must not raise a
  // Stop that already has a durable earlier end.
  try {
    await flushFrozenPendingCloses(options);
  } catch (flushErr) {
    log.warn({
      step: 'FROZEN_CLOSE_PRE_KILL_FAILED',
      message: flushErr?.message || String(flushErr),
    });
  }

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
  // Leftover / startup sweeps must never close a session the employee just
  // started (Ameer 31 Aug a402c6b3, Aryan 090c3598). Intentional stop / lid /
  // wake / logout pass protectLive: false.
  const exceptTimeLogId =
    options.protectLive === false || targetsOneSession
      ? null
      : liveTimeLogId();
  if (!targetsOneSession && backendTimeLogs.isBackendTimeLogsEnabled(options.config || global.config)) {
    try {
      const killed = await backendTimeLogs.killAllSessions(
        userId,
        deviceId,
        options.config || global.config,
        {
          reason: options.reason || 'explicit_stop',
          timeoutMs: options.timeoutMs,
          exceptTimeLogId,
        },
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
  try {
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
  } catch (closeErr) {
    // Lid-close / wake often has no DNS yet. The end is already durable locally
    // (pending close + offline queue). Never let this become an unhandled rejection.
    log.warn({
      step: 'EXPLICIT_STOP_CLOSE_FAILED',
      message: closeErr?.message || String(closeErr),
      ctx: { endTime, deviceId, queued: true },
    });
    return {
      success: false,
      closed: 0,
      reason: 'close_failed',
      end_time: endTime,
      queued: true,
    };
  }
}

function applyRecoveredSession(activeLog) {
  if (!activeLog?.id) return { refused: true, reason: 'no_id' };
  if (mustNotRecoverSession(activeLog.id)) {
    const endTime = frozenEndForSession(activeLog.id);
    log.warn({
      step: 'RECOVER_REFUSED',
      message: 'Refusing to resume a session that already has a frozen Stop',
      ctx: { timeLogId: activeLog.id, endTime },
    });
    return { refused: true, reason: 'frozen_end', endTime };
  }

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
  return { recovered: true, timeLogId: activeLog.id };
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
async function runSessionHealthCheckTick() {
    try {
      if (!global.currentUserId) {
        log.debug({ step: 'HEALTH_CHECK_SKIP', message: 'No user ID, skipping' });
        return;
      }

      if (global.isTracking && global.currentTimeLogId) {
        const refused = refuseLiveFrozenSession();
        if (refused) {
          try {
            await closeOpenSessionsAfterExplicitStop({
              timeLogId: refused.id,
              end_time: refused.endTime,
            });
          } catch (closeErr) {
            log.warn({
              step: 'HEALTH_CHECK_FROZEN_CLOSE_FAILED',
              message: closeErr?.message || String(closeErr),
            });
          }
          return;
        }
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
              clearLocalTrackingAfterStaleClose({ reason: 'cross_midnight' });
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
        const tmCheckpoint =
          global.trackingManager?._readSessionCheckpoint?.()?.checkpointAt || null;
        const durableAt = checkpointAt || tmCheckpoint;
        if (isIsoRecent(durableAt, STALE_CHECKPOINT_MS)) {
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
        // This process is alive — the health tick is running. A missing or
        // stale checkpoint file (wrong app-data dir, RDS backoff skipping
        // the remote heartbeat, slow internet) must not Stop the employee.
        // Dead-man's switch is for when the process vanishes, not for this.
        log.warn({
          step: 'HEALTH_CHECK_HEAL_CHECKPOINT',
          message: 'Checkpoint missing/stale while tracking — refreshing mark, not stopping',
          ctx: { timeLogId: global.currentTimeLogId, checkpointAt: durableAt },
        });
        try {
          await global.trackingManager?._checkpointCurrentTimeLog?.();
        } catch (_) { /* ignore */ }
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

        const explicit = peekExplicitStop();
        const pendingCloses = listPendingSessionCloses();
        const preferRecover = !explicit.active && pendingCloses.length === 0;
        const backendTimeLogs = require('./backend-time-logs');

        // Intentional Stop or a pending frozen close → never recover.
        if (!preferRecover) {
          try {
            await closeOpenSessionsAfterExplicitStop({
              timeLogId: explicit.timeLogId || pendingCloses[0]?.timeLogId || undefined,
              end_time: explicit.endTime || pendingCloses[0]?.endTime || undefined,
            });
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
            const applied = applyRecoveredSession(result.recovered);
            if (applied?.refused) {
              try {
                await closeOpenSessionsAfterExplicitStop({
                  timeLogId: result.recovered.id,
                  end_time: applied.endTime || undefined,
                });
              } catch (closeErr) {
                log.warn({
                  step: 'RECOVER_REFUSED_CLOSE_FAILED',
                  message: closeErr?.message || String(closeErr),
                });
              }
            }
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
}

function startSessionHealthCheck() {
  const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  setTimeout(() => { void runSessionHealthCheckTick(); }, 30000);
  const interval = setInterval(() => { void runSessionHealthCheckTick(); }, HEALTH_CHECK_INTERVAL);

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
    const refusedLive = refuseLiveFrozenSession();
    const explicit = peekExplicitStop();
    const pendingCloses = listPendingSessionCloses();
    if (explicit.active || pendingCloses.length || refusedLive) {
      log.info({
        step: 'FORCE_SYNC_EXPLICIT_STOP',
        message: 'Intentional stop in effect — closing open sessions instead of recovering',
      });
      try {
        await closeOpenSessionsAfterExplicitStop({
          timeLogId:
            refusedLive?.id || explicit.timeLogId || pendingCloses[0]?.timeLogId || undefined,
          end_time:
            refusedLive?.endTime || explicit.endTime || pendingCloses[0]?.endTime || undefined,
        });
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
        const applied = applyRecoveredSession(result.recovered);
        if (applied?.refused) {
          try {
            await closeOpenSessionsAfterExplicitStop({
              timeLogId: result.recovered.id,
              end_time: applied.endTime || undefined,
            });
          } catch (err) {
            log.warn({ step: 'FORCE_SYNC_REFUSED_CLOSE_FAILED', message: err?.message || String(err) });
          }
          return false;
        }
        return !!applied?.recovered;
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

function clearLocalTrackingAfterStaleClose(options = {}) {
  const { isAllowedLiveClockStopReason } = require('./live-clock-policy');
  const reason = options.reason || '';
  const live =
    !!(global.isTracking || global.trackingManager?.isTracking) &&
    !!(global.currentTimeLogId || global.trackingManager?.currentTimeLogId) &&
    !global.isStopping;
  if (live && !isAllowedLiveClockStopReason(reason)) {
    log.warn({
      step: 'REFUSE_CLEAR_LIVE_CLOCK',
      message: 'Will not clear a live Start — queue/resync instead',
      ctx: { reason: reason || 'unspecified', timeLogId: global.currentTimeLogId },
    });
    return false;
  }
  global.isTracking = false;
  try {
    global.trayManager?.stopTrayTimer?.();
  } catch (_) { /* ignore */ }
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
        await closeOpenSessionsAfterExplicitStop({
          end_time: proofIso || checkpointAt || undefined,
          protectLive: false,
        });
      }
    } catch (err) {
      log.warn({ step: 'WAKE_LID_CLOSE_FAILED', message: err?.message || String(err) });
    }
    clearLocalTrackingAfterStaleClose({ reason: 'system_sleep' });
    return { closedStale: true, lidStop: true, end_time: proofIso || checkpointAt || null };
  }

  if (!stale && (global.isTracking || global.trackingManager?.isTracking)) {
    const refused = refuseLiveFrozenSession();
    if (refused) {
      try {
        await closeOpenSessionsAfterExplicitStop({
          timeLogId: refused.id,
          end_time: refused.endTime,
          protectLive: false,
        });
      } catch (err) {
        log.warn({ step: 'WAKE_FROZEN_CLOSE_FAILED', message: err?.message || String(err) });
      }
      return { closedStale: true, frozenStop: true, end_time: refused.endTime };
    }
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
    await closeOpenSessionsAfterExplicitStop({
      end_time: proofIso || checkpointAt || undefined,
      protectLive: false,
    });
  } catch (err) {
    log.warn({ step: 'WAKE_STALE_CLOSE_FAILED', message: err?.message || String(err) });
  }
  clearLocalTrackingAfterStaleClose({ reason: 'system_sleep' });
  return { closedStale: true, end_time: proofIso || checkpointAt || null };
}

module.exports = {
  startSessionHealthCheck,
  runSessionHealthCheckTick,
  forceSyncSessionState,
  reconcileDeviceSessions,
  closeOpenSessionsAfterExplicitStop,
  hasLiveSessionToProtect,
  liveTimeLogId,
  markUserExplicitlyStopped,
  clearUserExplicitlyStopped,
  peekExplicitStop,
  shouldDropRecoveredSession,
  shouldPreferRecover,
  frozenEndForSession,
  mustNotRecoverSession,
  refuseLiveFrozenSession,
  flushFrozenPendingCloses,
  applyRecoveredSession,
  loadUserExplicitlyStoppedFromDisk,
  listPendingSessionCloses,
  readPendingSessionEndTime,
  resolveExplicitStopEndTime,
  resolveExplicitStopEnd,
  readLocalCheckpointAt,
  reconcileAfterWake,
  clearLocalTrackingAfterStaleClose,
};
